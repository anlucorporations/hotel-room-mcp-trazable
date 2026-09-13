import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { NFTsRepository, AuthService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const authService = new AuthService();

function encryptSecret(rawSecret: string): string {
  const encryptionKey = crypto
    .createHash("sha256")
    .update(process.env.CHECKIN_SECRET_KEY || "hotel_master_aes_key_32_bytes_2026")
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  let enc = cipher.update(rawSecret, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc}`;
}

export interface MintBatchRequestItem {
  roomNumber: number;
  roomType: "SIMPLE" | "SUITE";
  checkInDate: string; // YYYY-MM-DD
  basePriceWei: string;
}

/**
 * POST /api/admin/mint
 *
 * Minteo masivo protegido por re-confirmación TOTP (US-16).
 * Requiere header 'x-mfa-token' con código TOTP de 6 dígitos.
 * Límite máximo por lote: 50 tokens.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Re-confirmación MFA obligatoria para operaciones de alto impacto (US-16)
    const mfaToken = request.headers.get("x-mfa-token");
    const mfaSecret = process.env.ADMIN_MFA_SECRET || "JBSWY3DPEHPK3PXP";

    if (!mfaToken) {
      return NextResponse.json(
        { error: "MFA_REQUIRED", message: "Se requiere re-confirmación MFA (x-mfa-token)" },
        { status: 403 },
      );
    }

    const isMfaValid = authService.verifyTOTP(mfaToken, mfaSecret);
    if (!isMfaValid) {
      return NextResponse.json(
        { error: "INVALID_MFA", message: "Código MFA inválido o expirado" },
        { status: 403 },
      );
    }

    // 2. Validación del lote de tokens
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Se requiere array de items a mintear" },
        { status: 400 },
      );
    }

    const items: MintBatchRequestItem[] = body.items;

    if (items.length > 50) {
      return NextResponse.json(
        {
          error: "BATCH_SIZE_EXCEEDED",
          message: "El lote supera el límite máximo de 50 tokens por operación",
        },
        { status: 400 },
      );
    }

    const mintedTokenIds: string[] = [];
    const hotelContractOwner = process.env.HOTEL_NFT_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    for (const item of items) {
      const [y, m, d] = item.checkInDate.split("-");
      const dateNum = `${y}${m}${d}`;
      const tokenId = `${item.roomNumber}${dateNum}`;
      const rawSecret = `SECRET_${tokenId}_${crypto.randomBytes(8).toString("hex")}`;
      const encryptedSecret = encryptSecret(rawSecret);

      await nftsRepo.upsertNFT({
        tokenId,
        roomNumber: item.roomNumber,
        roomType: item.roomType,
        checkInDate: item.checkInDate,
        basePriceWei: item.basePriceWei,
        status: "AVAILABLE",
        currentOwner: hotelContractOwner,
        checkInSecretEnc: encryptedSecret,
        txHashMint: `0xmint_${Date.now()}_${tokenId}`,
      });

      mintedTokenIds.push(tokenId);
    }

    return NextResponse.json({
      status: "SUCCESS",
      mintedCount: mintedTokenIds.length,
      tokenIds: mintedTokenIds,
    });
  } catch (error: any) {
    console.error("[API /api/admin/mint] Error:", error);
    return NextResponse.json(
      { error: "MINT_FAILED", message: error?.message || "Error al procesar minteo masivo" },
      { status: 500 },
    );
  }
}
