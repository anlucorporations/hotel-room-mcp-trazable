import { NextResponse } from "next/server";
import { recoverMessageAddress, type Address } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { ROLES } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { activeChain, contractAddress } from "@/config/chain";
import { consumeNonce } from "@/lib/nonce-store";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { serverPublicClient } from "@/lib/server-client";

export const dynamic = "force-dynamic";

interface VerifyBody {
  message?: string;
  signature?: `0x${string}`;
}

/**
 * Verifica el reto SIWE (CU-01, EIP-4361):
 *   1. binding de dominio y cadena (anti-phishing cross-domain/cross-chain),
 *   2. firma válida y coincidente con la dirección reclamada,
 *   3. nonce vigente de un solo uso (anti-replay, CWE-294),
 *   4. rol MINTER on-chain.
 * En éxito crea la sesión (cookie HttpOnly firmada con HMAC).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { message, signature } = (await request.json()) as VerifyBody;
  if (!message || !signature) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const fields = parseSiweMessage(message);
  if (!fields.address || !fields.nonce || !fields.domain) {
    return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 401 });
  }

  // 1. Binding de dominio y cadena: el mensaje debe haberse emitido para ESTE host y red.
  const host = request.headers.get("host");
  if (!host || fields.domain !== host) {
    return NextResponse.json({ error: "DOMAIN_MISMATCH" }, { status: 401 });
  }
  if (fields.chainId !== activeChain.id) {
    return NextResponse.json({ error: "CHAIN_MISMATCH" }, { status: 401 });
  }
  if (fields.expirationTime && fields.expirationTime.getTime() < Date.now()) {
    return NextResponse.json({ error: "EXPIRED" }, { status: 401 });
  }

  // 2. Firma.
  let recovered: Address;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }
  if (recovered.toLowerCase() !== fields.address.toLowerCase()) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }

  // 3. Nonce de un solo uso.
  if (!consumeNonce(fields.nonce)) {
    return NextResponse.json({ error: "NONCE_REPLAY_OR_EXPIRED" }, { status: 401 });
  }

  // 4. Rol MINTER on-chain.
  const hasMinterRole = await serverPublicClient().readContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "hasRole",
    args: [ROLES.MINTER_ROLE, recovered],
  });
  if (!hasMinterRole) {
    return NextResponse.json({ error: "NO_ROLE" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, address: recovered });
  response.cookies.set(SESSION_COOKIE, signSession(recovered), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  return response;
}
