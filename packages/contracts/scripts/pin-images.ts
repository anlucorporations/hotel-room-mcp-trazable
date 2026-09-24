/**
 * Calcula (y opcionalmente pinea) los CIDs de las 3 imágenes (una por tipo) para fijarlos en
 * `packages/shared/src/domain/ipfs.ts` (ADR-12, T0.1/T1.1).
 *
 * - Sin pinner: calcula el **CIDv1 raw** determinista de cada fichero (sha2-256). Para
 *   ficheros de un solo bloque coincide con `ipfs add --raw-leaves --cid-version=1`, así que
 *   cualquiera puede reproducir y pinear el mismo CID.
 * - Con `PINATA_JWT`: además sube a Pinata (pinner gestionado, prod) — Decisión Pinata/Kubo
 *   (ADR-12): Kubo en dev/CI, Pinata en staging/prod, con redundancia (Decisión 13).
 *
 * Uso: pnpm --filter @hotel/contracts pin:images <simple> <doble> <suite>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

type RoomType = "simple" | "doble" | "suite";

const [simplePath, doblePath, suitePath] = process.argv.slice(2);
if (!simplePath || !doblePath || !suitePath) {
  console.error("Uso: pin:images <simple> <doble> <suite>");
  process.exit(1);
}
const inputs: Record<RoomType, string> = {
  simple: simplePath,
  doble: doblePath,
  suite: suitePath,
};

const jwt = process.env.PINATA_JWT;

async function rawCidV1(path: string): Promise<string> {
  const bytes = readFileSync(path);
  const digest = await sha256.digest(bytes);
  return CID.create(1, raw.code, digest).toString();
}

async function pinToPinata(path: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(path)]), basename(path));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt ?? ""}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Pinata ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { IpfsHash: string };
  return data.IpfsHash;
}

async function main(): Promise<void> {
  const entries = Object.entries(inputs) as Array<[RoomType, string]>;
  const cids: Record<RoomType, string> = { simple: "", doble: "", suite: "" };

  for (const [type, path] of entries) {
    cids[type] = await rawCidV1(path);
    if (jwt) {
      const pinned = await pinToPinata(path);
      console.log(`${type}: raw=${cids[type]}  pinata=${pinned}`);
    } else {
      console.log(`${type}: ${cids[type]}`);
    }
  }

  console.log("\nBloque para packages/shared/src/domain/ipfs.ts (IMAGE_CIDS):");
  console.log(
    JSON.stringify(cids, null, 2) +
      "\n→ pon IMAGE_CIDS_ARE_PLACEHOLDERS = false. Pinea los bytes (Kubo/Pinata) para que el gateway resuelva.",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
