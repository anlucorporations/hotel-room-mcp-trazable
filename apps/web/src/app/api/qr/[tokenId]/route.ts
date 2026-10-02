import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { NFTsRepository, createTicketJWS } from "@hotel/shared";
import { requireTicketOwnership } from "@/lib/ticket-ownership";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

interface RouteParams {
  params: Promise<{
    tokenId: string;
  }>;
}

/**
 * `GET /api/qr/:tokenId` — emite el **resguardo de check-in** del titular (RF-07, CU-08).
 *
 * Exige la firma EIP-712 del propietario (`requireTicketOwnership`): sin ella responde **401** y no se
 * emite nada. La respuesta incluye la imagen del QR lista para pintar o descargar
 * (`qrDataUrl`), el token firmado (`jws`) y su caducidad.
 *
 * El QR contiene la URL `…/checkin#ticket=<JWS>`: al abrirla, el resguardo se lee del **fragmento**
 * de la URL, que el navegador no envía al servidor, y se muestra en pantalla para que recepción lo
 * escanee o lo pegue. La generación de la imagen se hace aquí (servidor) para que la superficie de
 * compra no dependa de un servicio externo de QR.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tokenId } = await params;

    if (!tokenId) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Token ID requerido" }, { status: 400 });
    }

    const nft = await nftsRepo.getNFTById(tokenId);
    if (!nft) {
      return NextResponse.json({ error: "NOT_FOUND", message: "NFT no encontrado" }, { status: 404 });
    }

    // 1. Titularidad OBLIGATORIA (D-05) y ON-CHAIN (M7): sin firma EIP-712 del propietario no se
    //    emite resguardo, y el propietario lo decide `ownerOf`, no el índice.
    const ownership = await requireTicketOwnership(request, tokenId, nft.currentOwner);
    if (!ownership.ok) return ownership.response;

    // 2. Emisión de ticket JWS compacto (de un solo uso: lleva su propio `jti`). El huésped del
    //    ticket es el propietario de la CADENA: si el índice va retrasado, el pase no puede salir
    //    con el propietario anterior.
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez 7 días

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

    // 3. Imagen del QR (PNG en data URL). La superficie de compra la pinta y permite descargarla:
    //    el resguardo tiene que poder enseñarse en el móvil y en papel, sin depender de la web.
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
        color: { dark: "#101F2C", light: "#FFFFFF" },
      });
    } catch (qrError) {
      // El resguardo sigue siendo válido sin la imagen (recepción puede pegar el token), así que un
      // fallo al dibujar el QR NO invalida la emisión: se registra y se devuelve el token.
      console.error("[API /api/qr/:tokenId] No se pudo generar la imagen del QR:", qrError);
    }

    return NextResponse.json({
      qrPayload,
      qrDataUrl,
      jws,
      tokenId: nft.tokenId,
      roomNumber: nft.roomNumber,
      checkInDate: nft.checkInDate,
      expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[API /api/qr/:tokenId] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error && error.message ? error.message : "Error al generar resguardo QR",
      },
      { status: 500 },
    );
  }
}
