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
 * ⚠️ CIDs placeholder: el pinning real depende de las 3 fotos del hotel (las aporta el
 * cliente) + un pinner, y se ejecuta con `pnpm --filter @hotel/contracts pin:images`.
 * Mientras `IMAGE_CIDS_ARE_PLACEHOLDERS` sea `true`, estos CIDs no resuelven. T1.1 reexige
 * fijar el CID antes del primer mint.
 */
export const IMAGE_CIDS: Readonly<Record<NightType, string>> = Object.freeze({
  simple: "PLACEHOLDER_CID_SIMPLE",
  doble: "PLACEHOLDER_CID_DOBLE",
  suite: "PLACEHOLDER_CID_SUITE",
});

/** `true` hasta que se ejecute el pinning real de las 3 imágenes (DISEÑO §16.3). */
export const IMAGE_CIDS_ARE_PLACEHOLDERS = true;

const DEFAULT_GATEWAY = "https://ipfs.io/ipfs/" as const;

export function ipfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

export function ipfsGatewayUrl(cid: string, gateway: string = DEFAULT_GATEWAY): string {
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
