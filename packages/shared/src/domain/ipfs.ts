import type { NightAttributes, NightType } from "./types";
import { splitYYYYMMDD } from "./token-id";

/**
 * Almacenamiento de metadata e imágenes en IPFS (ADR-12).
 *
 * Las 3 imágenes (una por tipo) se pinnean una sola vez y su CID se fija aquí. La metadata
 * por token referencia el CID del tipo.
 *
 * Decisión Pinata vs Kubo (DISEÑO §16.3): **Kubo (nodo local)** en dev/CI y **Pinata** como
 * pinner gestionado en staging/producción, con redundancia (Decisión 13).
 *
 * CIDs reales (CIDv1 raw, sha2-256) de las 3 imágenes del cliente, calculados con
 * `pnpm --filter @hotel/contracts pin:images`. **Pineados** (2026-06-11) en un nodo Kubo
 * (`ipfs add --raw-leaves --cid-version=1`, daemon como servicio launchd) y verificados por
 * gateway público (`ipfs.io` 200 + sha256 idéntico al SVG del repo). El pinning GESTIONADO
 * con redundancia (Pinata, Decisión 13) sigue pendiente de credenciales: `PINATA_JWT` +
 * `pin:images` lo sube sin tocar los CIDs. La web sirve las imágenes por host/CDN (ADR-12),
 * no por gateway.
 */
export const IMAGE_CIDS: Readonly<Record<NightType, string>> = Object.freeze({
  simple: "bafkreialyiktnrmy3kvdjebdndkc4tynjw63ghx4pw7mg2hznz3jema2qy",
  doble: "bafkreid5x5rjq7xjo4e7jejtoagifqxsapqa4utiwlysyzddzhdnrtrm7u",
  suite: "bafkreigedvpfrnvaoiceno5v4qtrkibhxzzatmsfrinyalx5wzzk6anfne",
});

/** Los CIDs son reales (no placeholders) y están pineados (resolución por gateway verificada). */
export const IMAGE_CIDS_ARE_PLACEHOLDERS = false;

/**
 * Gateway público de IPFS usado **solo como fallback de desarrollo** (MINOR#31 / UX#31).
 *
 * ADR-12: en staging/producción las imágenes se sirven por **host/CDN propio** (`next/image`),
 * no por un gateway público (`ipfs.io` ata el LCP a un tercero). Por eso este default NO debe
 * usarse en producción: cada caller debe inyectar su gateway/CDN base (por config de entorno)
 * vía el parámetro `gateway` de `ipfsGatewayUrl`.
 */
export const DEV_FALLBACK_GATEWAY = "https://ipfs.io/ipfs/" as const;

export function ipfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

/**
 * Resuelve la URL HTTP de un CID a través de un gateway/CDN.
 *
 * Pásese siempre el gateway/CDN propio (ADR-12). El parámetro es opcional por compatibilidad:
 * si se omite, recurre a {@link DEV_FALLBACK_GATEWAY} (solo apto para desarrollo).
 */
export function ipfsGatewayUrl(cid: string, gateway: string = DEV_FALLBACK_GATEWAY): string {
  return `${gateway}${cid}`;
}

/** Metadata ERC-721 de una noche (sin PII, RNF-05). */
export interface NightMetadata {
  readonly name: string;
  readonly description: string;
  readonly image: string;
  readonly attributes: ReadonlyArray<{
    readonly trait_type: string;
    readonly value: string | number;
  }>;
}

const formatDate = (yyyymmdd: number): string => {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Construye la metadata ERC-721 de una noche a partir de sus atributos. */
export function buildNightMetadata({
  room,
  dateYYYYMMDD,
  roomType,
}: NightAttributes): NightMetadata {
  return {
    name: `Hotel Marina del Sol — Hab. ${room} · ${formatDate(dateYYYYMMDD)}`,
    description: `Noche de la habitación ${room} (${roomType}) para el ${formatDate(
      dateYYYYMMDD,
    )}.`,
    image: ipfsUri(IMAGE_CIDS[roomType]),
    attributes: [
      { trait_type: "Habitación", value: room },
      { trait_type: "Fecha", value: formatDate(dateYYYYMMDD) },
      { trait_type: "Tipo", value: roomType },
    ],
  };
}
