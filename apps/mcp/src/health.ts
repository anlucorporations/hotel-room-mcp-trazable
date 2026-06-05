import { RPC_TIMEOUT_MS } from "@hotel/shared";
import type { HealthProvider, HealthReport } from "@hotel/shared/health";
import type { ChainReader } from "./chain/chain-reader";

/**
 * Provider de salud del MCP (RNF-17, CU-08 08e). Sondea el RPC (`getHeadBlock`) con timeout:
 * si la cadena no responde, el MCP no puede servir sus herramientas → `down` (503), de modo
 * que el monitor (TC-NF-020) refleje la indisponibilidad de la dependencia.
 */
export function mcpHealthProvider(reader: ChainReader): HealthProvider {
  return async (): Promise<HealthReport> => {
    try {
      const block = await withTimeout(reader.getHeadBlock(), RPC_TIMEOUT_MS);
      return { status: "ok", component: "mcp", details: { block: Number(block) } };
    } catch {
      return { status: "down", component: "mcp" };
    }
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("RPC timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
