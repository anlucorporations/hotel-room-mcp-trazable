import { createServer, type Server } from "node:http";
import type { HealthableComponent } from "../domain/types";

/**
 * Servidor `/health` reutilizable (RNF-17, ADR-26). Cada componente (worker, mcp,
 * faucet) inyecta un `HealthProvider`; el servidor traduce el reporte a HTTP:
 *   - `ok`   → 200 con el reporte
 *   - `down` → 503 con marcador `COMPONENT_DOWN`
 *
 * El cálculo de "salud" (p. ej. lag del worker, N fallos consecutivos) es responsabilidad
 * del provider; este módulo solo expone el endpoint (SRP/DIP).
 */
export interface HealthReport {
  readonly status: "ok" | "down";
  readonly component: HealthableComponent;
  readonly details?: Record<string, unknown>;
}

export type HealthProvider = () => HealthReport | Promise<HealthReport>;

export interface HealthServerOptions {
  readonly port: number;
  readonly provider: HealthProvider;
  /** Interfaz de bind (default: todas). */
  readonly host?: string;
  readonly path?: string;
  readonly onError?: (error: unknown) => void;
}

const DEFAULT_PATH = "/health";

export function createHealthServer(options: HealthServerOptions): Server {
  const { provider, path = DEFAULT_PATH, onError } = options;

  return createServer((req, res) => {
    const requestPath = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET" || requestPath !== path) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
      return;
    }

    void Promise.resolve()
      .then(provider)
      .then((report) => {
        const isOk = report.status === "ok";
        res.writeHead(isOk ? 200 : 503, { "content-type": "application/json" });
        res.end(JSON.stringify(isOk ? report : { ...report, error: "COMPONENT_DOWN" }));
      })
      .catch((error: unknown) => {
        onError?.(error);
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "down", error: "COMPONENT_DOWN" }));
      });
  });
}

/** Crea el servidor y empieza a escuchar; resuelve cuando está listo. */
export function startHealthServer(options: HealthServerOptions): Promise<Server> {
  const server = createHealthServer(options);
  return new Promise((resolve) => {
    server.listen({ port: options.port, host: options.host }, () => resolve(server));
  });
}
