import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import {
  NFTsRepository,
  createTicketJWS,
  verifyEIP712TicketRequest,
  QR_REDOWNLOAD_DOMAIN,
} from "@hotel/shared";
import { contractAddress, activeChain } from "@/config/chain";

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
 * Headers opcionales de titularidad EIP-712:
 *   - x-wallet-address
 *   - x-signature
 *   - x-nonce
 *   - x-expires-at
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

    // Generar ticket JWS
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez 7 días
    const checkOutDate = new Date(new Date(nft.checkInDate).getTime() + 86400000).toISOString().split("T")[0];

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
  } catch (error: any) {
    console.error("[API /api/wallet/pass/:tokenId] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al generar pase digital" },
      { status: 500 },
    );
  }
}
