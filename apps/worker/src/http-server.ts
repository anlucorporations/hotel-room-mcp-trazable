import { createServer, type Server, type ServerResponse } from "node:http";
import type { DashboardAggregates, SaleHistoryEntry } from "@hotel/shared";
import type { HealthProvider } from "@hotel/shared/health";

/**
 * Servidor HTTP del worker (FASE 3, CU-09/11, docs/SRS.md §9). Amplía el `/health` de `@hotel/shared` con dos
 * rutas de datos para la web:
 *   - `GET /health`     → 200 (ok) / 503 (down + `COMPONENT_DOWN`). Comportamiento idéntico al de
 *     `@hotel/shared/health`: reutiliza el mismo `HealthProvider`/estado del worker.
 *   - `GET /aggregates` → `DashboardAggregates` (JSON).
 *   - `GET /history`    → `SaleHistoryEntry[]` (JSON, orden total).
 *
 * CORS básico (`Access-Control-Allow-Origin: *`) en las rutas de datos para que la web las
 * consuma desde el navegador; responde a `OPTIONS` (preflight). SRP/DIP: la "salud" la decide el
 * provider y los datos los aporta `data`; este módulo solo enruta y serializa.
 */
export interface WorkerHttpData {
  /**
   * Snapshot de los agregados del dashboard (CU-11). Puede ser asíncrono: la fuente es
   * PostgreSQL (`pg`), cuyo acceso es inherentemente asíncrono (D-09).
   */
  readonly getAggregates:
    | (() => DashboardAggregates)
    | (() => Promise<DashboardAggregates>);
  /** Histórico de ventas con orden total (CU-09); síncrono o asíncrono (D-09). */
  readonly getHistory:
    | (() => SaleHistoryEntry[])
    | (() => Promise<SaleHistoryEntry[]>);
}

export interface WorkerHttpServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly provider: HealthProvider;
  readonly data: WorkerHttpData;
  readonly onError?: (error: unknown) => void;
}

const HEALTH_PATH = "/health";
const AGGREGATES_PATH = "/aggregates";
const HISTORY_PATH = "/history";

const JSON_HEADERS = { "content-type": "application/json" } as const;
const CORS_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
} as const;

export function createWorkerHttpServer(
  options: WorkerHttpServerOptions,
): Server {
  const { provider, data, onError } = options;

  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    // Preflight CORS para las rutas de datos.
    if (req.method === "OPTIONS" && isDataPath(path)) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== "GET") {
      sendNotFound(res);
      return;
    }

    switch (path) {
      case HEALTH_PATH:
        handleHealth(provider, res, onError);
        return;
      case AGGREGATES_PATH:
        handleData(() => data.getAggregates(), res, onError);
        return;
      case HISTORY_PATH:
        handleData(() => data.getHistory(), res, onError);
        return;
      default:
        sendNotFound(res);
    }
  });
}

/** Crea el servidor y empieza a escuchar; resuelve cuando está listo. */
export function startWorkerHttpServer(
  options: WorkerHttpServerOptions,
): Promise<Server> {
  const server = createWorkerHttpServer(options);
  return new Promise((resolve) => {
    server.listen({ port: options.port, host: options.host }, () =>
      resolve(server),
    );
  });
}

const isDataPath = (path: string): boolean =>
  path === AGGREGATES_PATH || path === HISTORY_PATH;

/**
 * Endpoint `/health` con el contrato intacto: 200 si `ok`, 503 + `COMPONENT_DOWN` si `down`, y
 * 503 + `COMPONENT_DOWN` si el provider lanza.
 */
function handleHealth(
  provider: HealthProvider,
  res: ServerResponse,
  onError?: (error: unknown) => void,
): void {
  void Promise.resolve()
    .then(provider)
    .then((report) => {
      const isOk = report.status === "ok";
      res.writeHead(isOk ? 200 : 503, JSON_HEADERS);
      res.end(
        JSON.stringify(isOk ? report : { ...report, error: "COMPONENT_DOWN" }),
      );
    })
    .catch((error: unknown) => {
      onError?.(error);
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ status: "down", error: "COMPONENT_DOWN" }));
    });
}

/**
 * Sirve una ruta de datos (CORS) serializando el resultado del proveedor inyectado. El proveedor
 * puede ser asíncrono (PostgreSQL, D-09): se resuelve antes de serializar y, si falla, se
 * responde 500 `DATA_UNAVAILABLE`.
 */
function handleData<T>(
  produce: () => T | Promise<T>,
  res: ServerResponse,
  onError?: (error: unknown) => void,
): void {
  void Promise.resolve()
    .then(produce)
    .then((payload) => {
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify(payload));
    })
    .catch((error: unknown) => {
      onError?.(error);
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ error: "DATA_UNAVAILABLE" }));
    });
}

function sendNotFound(res: ServerResponse): void {
  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
}
