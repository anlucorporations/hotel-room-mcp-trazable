import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { ALL_ROLE_NAMES, ROLES, type RoleName } from "@hotel/shared";
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
 * Verifica el reto SIWE (CU-01, docs/SRS.md §9, EIP-4361):
 *   1. binding de dominio y cadena (anti-phishing cross-domain/cross-chain),
 *   2. validez temporal: expiración (`expirationTime`) y «not before» (`notBefore`, MINOR#31),
 *   3. firma válida y coincidente con la dirección reclamada — `verifySiweMessage` de viem, que
 *      soporta tanto EOA como smart accounts EIP-1271 (Safe/AA) vía `publicClient.verifyMessage`
 *      (UX#26); el login EOA del demo sigue funcionando igual,
 *   4. nonce vigente de un solo uso (anti-replay, CWE-294),
 *   5. ≥1 de los 6 roles on-chain (AccessControl).
 * En éxito crea la sesión (cookie HttpOnly firmada con HMAC) con la lista de roles que la
 * wallet ostenta; sin ningún rol responde 403 (NO_ROLE). El gating de UI por rol es solo UX:
 * la autoridad sigue siendo el contrato (cada tx revierte si la cuenta carece del rol).
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
  // 1b. URI EIP-4361: su host debe coincidir con el dominio (defensa extra anti-phishing).
  if (fields.uri) {
    let uriHost: string;
    try {
      uriHost = new URL(fields.uri).host;
    } catch {
      return NextResponse.json({ error: "INVALID_URI" }, { status: 401 });
    }
    if (uriHost !== host) {
      return NextResponse.json({ error: "URI_MISMATCH" }, { status: 401 });
    }
  }
  if (fields.chainId !== activeChain.id) {
    return NextResponse.json({ error: "CHAIN_MISMATCH" }, { status: 401 });
  }
  if (fields.expirationTime && fields.expirationTime.getTime() < Date.now()) {
    return NextResponse.json({ error: "EXPIRED" }, { status: 401 });
  }
  // 2. «Not before»: el mensaje aún no es válido (MINOR#31, cierra EIP-4361 a coste mínimo).
  if (fields.notBefore && fields.notBefore.getTime() > Date.now()) {
    return NextResponse.json({ error: "NOT_YET_VALID" }, { status: 401 });
  }

  const client = serverPublicClient();

  // 3. Firma: `verifySiweMessage` valida la firma contra `fields.address`, soportando EOA y
  //    smart accounts EIP-1271 (vía el `client`). Re-validamos dominio/nonce/tiempo aquí porque
  //    también pasamos esos parámetros y porque el binding por host ya se comprobó arriba.
  //    Degradación honesta: si la verificación falla (incluida la EIP-1271), respondemos 401.
  let valid = false;
  try {
    valid = await verifySiweMessage(client, {
      message,
      signature,
      address: getAddress(fields.address),
      domain: host,
      nonce: fields.nonce,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });
  }
  const recovered: Address = getAddress(fields.address);

  // 4. Nonce de un solo uso.
  if (!consumeNonce(fields.nonce)) {
    return NextResponse.json({ error: "NONCE_REPLAY_OR_EXPIRED" }, { status: 401 });
  }

  // 5. Roles on-chain: leemos `hasRole` de los 6 roles EN PARALELO y concedemos sesión si
  //    la wallet ostenta ≥1. La sesión guarda la lista de roles (instantánea, CU-01).
  const held = await Promise.all(
    ALL_ROLE_NAMES.map((role) =>
      client.readContract({
        address: contractAddress,
        abi: hotelNightsAbi,
        functionName: "hasRole",
        args: [ROLES[role], recovered],
      }),
    ),
  );
  const roles: RoleName[] = ALL_ROLE_NAMES.filter((_, i) => held[i]);
  if (roles.length === 0) {
    return NextResponse.json({ error: "NO_ROLE" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, address: recovered, roles });
  response.cookies.set(SESSION_COOKIE, signSession(recovered, roles), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 3600,
  });
  return response;
}
