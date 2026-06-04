/**
 * Sube las 3 imágenes (una por tipo de habitación) a IPFS y muestra sus CIDs para fijarlos
 * en `packages/shared/src/domain/ipfs.ts` (ADR-12, T0.1).
 *
 * Decisión Pinata vs Kubo (resuelve DISEÑO §16.3): **Kubo (nodo IPFS local)** en dev/CI y
 * **Pinata** como pinner gestionado en staging/producción, con redundancia (Decisión 13).
 * Este script usa Pinata si `PINATA_JWT` está definido; si no, imprime el comando Kubo
 * equivalente.
 *
 * Uso: pnpm --filter @hotel/contracts pin:images <simple> <doble> <suite>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

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

  if (!jwt) {
    console.log("PINATA_JWT no definido. Para dev, pinea con Kubo local:");
    for (const [type, path] of entries) {
      console.log(`  ipfs add -Q --cid-version=1 ${path}   # ${type}`);
    }
  } else {
    for (const [type, path] of entries) {
      console.log(`${type}: ${await pinToPinata(path)}`);
    }
  }

  console.log(
    "\nFija los CIDs en packages/shared/src/domain/ipfs.ts (IMAGE_CIDS) y pon " +
      "IMAGE_CIDS_ARE_PLACEHOLDERS = false.",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
