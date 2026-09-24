import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import {
  NFTsRepository,
  NotificationQueueService,
  createTicketJWS,
} from "@hotel/shared";
import { requireTicketOwnership } from "@/lib/ticket-ownership";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const notificationQueue = new NotificationQueueService();

interface RouteParams {
  params: Promise<{
    tokenId: string;
  }>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/qr/:tokenId/send-email
 *
 * Headers OBLIGATORIOS de titularidad (D-05):
 *   - x-wallet-address: Dirección Ethereum del titular
 *   - x-signature: Firma EIP-712
 *   - x-nonce: Nonce aleatorio (de un solo uso)
 *   - x-expires-at: Timestamp Unix de expiración (máximo 5 minutos)
 * Sin ellos la respuesta es 401 y no se envía ningún resguardo.
 *
 * Body JSON:
 *   - email: Correo de destino efímero
 *
 * Cumplimiento RGPD (art. 5.1.c):
 * El correo se encola exclusivamente en memoria (Redis/BullMQ) y se descarta de forma inmediata tras el envío,
 * sin persistirse en la base de datos PostgreSQL ni asociarse con la dirección de la wallet.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tokenId } = await params;

    if (!tokenId) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Token ID requerido" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.email || !EMAIL_REGEX.test(body.email)) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Correo electrónico inválido o no proporcionado" },
        { status: 400 },
      );
    }

    const nft = await nftsRepo.getNFTById(tokenId);
    if (!nft) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "NFT no encontrado" },
        { status: 404 },
      );
    }

    // Titularidad OBLIGATORIA (D-05) y ON-CHAIN (M7): no se envía ningún resguardo sin la firma
    // del propietario, y el propietario lo decide la cadena (`ownerOf`), no el índice.
    const ownership = await requireTicketOwnership(request, tokenId, nft.currentOwner);
    if (!ownership.ok) return ownership.response;

    // Emisión del ticket JWS (de un solo uso: lleva su propio `jti`) con el dueño on-chain.
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez de 7 días

    const jws = await createTicketJWS({
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      checkInDate: nft.checkInDate,
      roomType: nft.roomType,
      guestWallet: ownership.onChainOwner,
      issuedAt: nowSec,
      expiresAt: expiresAtSec,
    });

    const host = request.headers.get("host") || "hotel.marinadelsol.es";
    const protocol = host.includes("localhost") ? "http" : "https";
    const qrPayload = `${protocol}://${host}/checkin#ticket=${jws}`;

    const checkOutDate = new Date(new Date(nft.checkInDate).getTime() + 86400000).toISOString().split("T")[0];

    // Despacho efímero en memoria vía BullMQ (sin inserción en PostgreSQL)
    await notificationQueue.enqueueEphemeralEmail(body.email, {
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      roomType: nft.roomType,
      checkInDate: nft.checkInDate,
      checkOutDate,
      qrPayload,
      expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    });

    return NextResponse.json({
      status: "QUEUED",
      message: "Resguardo enviado satisfactoriamente",
    });
  } catch (error) {
    console.error("[API /api/qr/:tokenId/send-email] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error && error.message ? error.message : "Error al procesar envío de resguardo",
      },
      { status: 500 },
    );
  }
}
