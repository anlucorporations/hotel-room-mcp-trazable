import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import {
  NFTsRepository,
  NotificationQueueService,
  createTicketJWS,
  verifyEIP712TicketRequest,
  QR_REDOWNLOAD_DOMAIN,
} from "@hotel/shared";
import { contractAddress, activeChain } from "@/config/chain";

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
 * Headers opcionales/recomendados de titularidad:
 *   - x-wallet-address: Dirección Ethereum del titular
 *   - x-signature: Firma EIP-712
 *   - x-nonce: Nonce aleatorio
 *   - x-expires-at: Timestamp Unix de expiración de la firma
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

    // Verificación de posesión mediante EIP-712 si se proveen las cabeceras
    const walletAddress = request.headers.get("x-wallet-address") as Address | null;
    const signature = request.headers.get("x-signature") as `0x${string}` | null;
    const nonce = request.headers.get("x-nonce");
    const expiresAtHeader = request.headers.get("x-expires-at");

    if (walletAddress && signature && nonce && expiresAtHeader) {
      const domain = {
        ...QR_REDOWNLOAD_DOMAIN,
        chainId: activeChain.id,
        verifyingContract: contractAddress,
      };

      const isValid = await verifyEIP712TicketRequest(
        walletAddress,
        signature,
        BigInt(tokenId),
        nonce,
        BigInt(expiresAtHeader),
        domain,
      );

      if (!isValid || nft.currentOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Firma EIP-712 inválida o wallet no coincide con el propietario" },
          { status: 401 },
        );
      }
    }

    // Emisión del ticket JWS
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez de 7 días

    const jws = await createTicketJWS({
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      checkInDate: nft.checkInDate,
      roomType: nft.roomType,
      guestWallet: nft.currentOwner,
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
  } catch (error: any) {
    console.error("[API /api/qr/:tokenId/send-email] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al procesar envío de resguardo" },
      { status: 500 },
    );
  }
}
