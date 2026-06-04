import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deploymentSchema, type Deployment } from "./schema";

/**
 * Lector del registro de despliegues (node-only). El directorio por defecto se resuelve
 * relativo al paquete (`packages/shared/deployments/`), tanto en el bundle (`dist/`) como
 * en ejecución directa.
 */
const DEFAULT_DEPLOYMENTS_DIR = new URL("../deployments/", import.meta.url);

export function deploymentPath(
  chainId: number,
  baseDir: URL = DEFAULT_DEPLOYMENTS_DIR,
): string {
  return fileURLToPath(new URL(`${chainId}.json`, baseDir));
}

/** Lee y valida el despliegue de una cadena. Lanza si no existe o es inválido. */
export function readDeployment(
  chainId: number,
  baseDir: URL = DEFAULT_DEPLOYMENTS_DIR,
): Deployment {
  const path = deploymentPath(chainId, baseDir);
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return deploymentSchema.parse(raw);
}

/** Variante no lanzante: devuelve `null` si no hay despliegue. */
export function tryReadDeployment(
  chainId: number,
  baseDir: URL = DEFAULT_DEPLOYMENTS_DIR,
): Deployment | null {
  try {
    return readDeployment(chainId, baseDir);
  } catch {
    return null;
  }
}

export { deploymentSchema };
export type { Deployment };
