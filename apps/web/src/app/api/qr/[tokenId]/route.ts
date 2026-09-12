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

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tokenId } = await params;
    const walletAddress = request.headers.get("x-wallet-address") as Address | null;
    const signature = request.headers.get("x-signature") as `0x${string}` | null;
    const nonce = request.headers.get("x-nonce");
    const expiresAtHeader = request.headers.get("x-expires-at");

    if (!tokenId) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Token ID requerido" }, { status: 400 });
    }

    const nft = await nftsRepo.getNFTById(tokenId);
    if (!nft) {
      return NextResponse.json({ error: "NOT_FOUND", message: "NFT no encontrado" }, { status: 404 });
    }

    // 1. Verificación de titularidad si se proporcionan credenciales EIP-712
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

    // 2. Emisión de ticket JWS compacto
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + 3600 * 24 * 7; // Validez 7 días

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

    return NextResponse.json({
      qrPayload,
      tokenId: nft.tokenId,
      expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error("[API /api/qr/:tokenId] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al generar resguardo QR" },
      { status: 500 },
    );
  }
}
