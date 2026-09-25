import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
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
 * GET /api/wallet/pass/:tokenId?type=apple|google
 *
 * Headers OBLIGATORIOS de titularidad (D-05):
 *   - x-wallet-address
 *   - x-signature
 *   - x-nonce (de un solo uso)
 *   - x-expires-at (máximo 5 minutos)
 * Sin ellos la respuesta es 401 y no se entrega ningún pase.
 *
 * Entrega el pase digital formateado para Apple Wallet (.pkpass / JSON PassKit) o Google Wallet (Save Link/Object).
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tokenId } = await params;
    const type = request.nextUrl.searchParams.get("type") || "apple";

    if (!tokenId) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Token ID requerido" },
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

    // Titularidad OBLIGATORIA (D-05) y ON-CHAIN (M7): el pase de wallet solo se entrega a su
    // titular, y el titular lo decide `ownerOf` (el índice puede ir retrasado).
    const ownership = await requireTicketOwnership(request, tokenId, nft.currentOwner);
    if (!ownership.ok) return ownership.response;

    // Generar ticket JWS (de un solo uso: lleva su propio `jti`) con el propietario de la cadena.
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez 7 días
    const checkOutDate = new Date(new Date(nft.checkInDate).getTime() + 86400000).toISOString().split("T")[0];

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

    if (type === "google") {
      // Estructura de Google Wallet Pass Object
      const googlePassObject = {
        id: `hotel_pass_${nft.tokenId}`,
        classId: "marinadelsol.hotel_reservation_v1",
        state: "ACTIVE",
        barcode: {
          type: "QR_CODE",
          value: qrPayload,
          alternateText: `Habitación ${nft.roomNumber}`,
        },
        cardTitle: {
          defaultValue: { language: "es", value: "Hotel Marina del Sol" },
        },
        header: {
          defaultValue: { language: "es", value: `Habitación ${nft.roomNumber} (${nft.roomType})` },
        },
        textModulesData: [
          {
            header: "FECHA DE ENTRADA",
            body: nft.checkInDate,
          },
          {
            header: "FECHA DE SALIDA",
            body: checkOutDate,
          },
          {
            header: "TOKEN ID",
            body: nft.tokenId,
          },
        ],
      };

      const googleWalletSaveUrl = `https://pay.google.com/gp/v/save/hotel_${nft.tokenId}`;

      return NextResponse.json({
        type: "google",
        saveUrl: googleWalletSaveUrl,
        passObject: googlePassObject,
        qrPayload,
      });
    }

    // Formato Apple Wallet (PassKit structure)
    const applePassData = {
      formatVersion: 1,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER || "pass.es.marinadelsol.hotel",
      serialNumber: `HOTEL-${nft.tokenId}`,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER || "HOTELMARINADEL",
      organizationName: "Hotel Marina del Sol",
      description: `Reserva Habitación ${nft.roomNumber}`,
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(15, 23, 42)",
      eventTicket: {
        primaryFields: [
          {
            key: "room",
            label: "HABITACIÓN",
            value: String(nft.roomNumber),
          },
        ],
        secondaryFields: [
          {
            key: "roomType",
            label: "TIPO",
            value: nft.roomType,
          },
          {
            key: "checkIn",
            label: "CHECK-IN",
            value: nft.checkInDate,
          },
        ],
        auxiliaryFields: [
          {
            key: "checkOut",
            label: "CHECK-OUT",
            value: checkOutDate,
          },
          {
            key: "tokenId",
            label: "TOKEN ID",
            value: `${nft.tokenId.substring(0, 10)}...`,
          },
        ],
      },
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: qrPayload,
          messageEncoding: "iso-8859-1",
        },
      ],
    };

    // Si el cliente pide explícitamente application/vnd.apple.pkpass o descarga directa
    const download = request.nextUrl.searchParams.get("download");
    if (download === "true") {
      const buffer = Buffer.from(JSON.stringify(applePassData, null, 2), "utf-8");
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.pkpass",
          "Content-Disposition": `attachment; filename="hotel_reserva_${nft.roomNumber}.pkpass"`,
        },
      });
    }

    return NextResponse.json({
      type: "apple",
      passData: applePassData,
      qrPayload,
      downloadUrl: `/api/wallet/pass/${nft.tokenId}?type=apple&download=true`,
    });
  } catch (error) {
    console.error("[API /api/wallet/pass/:tokenId] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error && error.message ? error.message : "Error al generar pase digital",
      },
      { status: 500 },
    );
  }
}
