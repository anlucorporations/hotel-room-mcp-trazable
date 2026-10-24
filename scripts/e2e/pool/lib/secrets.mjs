import fs from "node:fs";
import path from "node:path";

const CONFIG_DIR = path.join(process.env.HOME ?? "/home/dsh", ".config/hotel-mcp");

/** Lee un texto del directorio privado de operación (nunca se versiona). */
export function readPrivate(name) {
  try {
    return fs.readFileSync(path.join(CONFIG_DIR, name), "utf8");
  } catch {
    return null;
  }
}

/** Extrae un campo `clave: valor` del documento privado de despliegue. */
export function readGcpDocField(field) {
  const doc = readPrivate("DESPLIEGUE-GCP.md");
  if (!doc) return null;
  const re = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*[^|]*\\|\\s*([^|]+?)\\s*\\|`);
  const m = doc.match(re);
  return m ? m[1].trim() : null;
}

export const WEB_URL = process.env.WEB_URL ?? "https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app";
export const RPC_URL = process.env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy";
export const FAUCET_URL = process.env.FAUCET_URL ?? "https://faucet.codecrypto.academy";
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 81234);
