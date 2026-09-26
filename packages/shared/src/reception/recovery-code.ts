import { createHash } from "node:crypto";

/**
 * Código de recuperación de reserva (D-32, CU-32).
 *
 * Es el código corto que el huésped puede llevar impreso o apuntado (empieza por `MDS-`) y que
 * recepción teclea para **localizar la reserva cuando el QR no está disponible**. No es un secreto
 * de autenticación: no concede acceso a nada por sí mismo —hace falta sesión de recepción— y por
 * eso se deriva de forma determinista del `tokenId`, sin guardar ningún dato personal (RNF-30).
 *
 * La derivación es **estable**: el mismo token produce siempre el mismo código, así que un
 * resguardo impreso sigue sirviendo aunque la fila se recree, y se puede rellenar (backfill) sin
 * reemitir nada al huésped.
 */

/** Alfabeto base32 sin caracteres ambiguos (`0/O`, `1/I`) para poder dictarlo por teléfono. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Prefijo público del código (mismo vocabulario que ya admite el protocolo de contingencia). */
export const RECOVERY_CODE_PREFIX = "MDS-";

/** Formato canónico aceptado: `MDS-` + 6..12 alfanuméricos en mayúsculas. */
export const RECOVERY_CODE_PATTERN = /^MDS-[A-Z0-9]{6,12}$/;

/**
 * Deriva el código de recuperación de un `tokenId`. Función **pura** (salvo el hash): mismo token,
 * mismo código, en cualquier proceso.
 */
export function recoveryCodeForToken(tokenId: string): string {
  const digest = createHash("sha256")
    .update(`hotel-recovery:v1:${tokenId}`)
    .digest();
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const byte = digest[i] ?? 0;
    code += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return `${RECOVERY_CODE_PREFIX}${code}`;
}

/**
 * Normaliza lo que teclea recepción (minúsculas, espacios, guiones sueltos) al formato canónico.
 * Devuelve `null` si no es un código válido: la API responde 400 sin consultar la base.
 */
export function normalizeRecoveryCode(raw: string): string | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, "");
  return RECOVERY_CODE_PATTERN.test(value) ? value : null;
}
