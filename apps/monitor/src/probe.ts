import type { HealthReport } from "@hotel/shared/health";
import type { HealthProbe, ProbeResult } from "./types";

/**
 * Implementación de {@link HealthProbe} sobre `fetch` (T3.3 / RNF-17).
 *
 * Sondea el `/health` de un componente con timeout (`AbortSignal.timeout`) e interpreta la
 * respuesta:
 *   - error de red / timeout      → `{ ok: false, httpStatus: 0, report: null }`
 *   - respuesta no 2xx (p. ej. 503) → `{ ok: false, httpStatus, report? }` (se intenta parsear)
 *   - respuesta 200 con JSON válido → `{ ok: true, httpStatus: 200, report }`
 *
 * El núcleo (`MonitorCore`) decide qué constituye un "fallo"; esta clase sólo transporta y
 * normaliza (SRP/DIP).
 */
const DEFAULT_TIMEOUT_MS = 5000 as const;

export class FetchHealthProbe implements HealthProbe {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  async probe(url: string): Promise<ProbeResult> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const report = await this.parseReport(response);
      return { ok: response.ok, httpStatus: response.status, report };
    } catch {
      // Error de red, DNS o timeout: no hay respuesta HTTP.
      return { ok: false, httpStatus: 0, report: null };
    }
  }

  /** Intenta interpretar el cuerpo como un `HealthReport`; devuelve `null` si no encaja. */
  private async parseReport(response: Response): Promise<HealthReport | null> {
    try {
      const body: unknown = await response.json();
      return toHealthReport(body);
    } catch {
      return null;
    }
  }
}

/** Type guard defensivo: valida lo justo para tratar el cuerpo como `HealthReport`. */
function toHealthReport(body: unknown): HealthReport | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  const { status, component, details } = candidate;
  if (status !== "ok" && status !== "down") return null;
  if (typeof component !== "string") return null;
  const report: HealthReport = {
    status,
    component: component as HealthReport["component"],
    ...(isRecord(details) ? { details } : {}),
  };
  return report;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Resumen del **outbox de anclaje** publicado por el worker en `/health` (F3 · T3.7/T3.8).
 *
 * El monitor no consulta PostgreSQL: lee este resumen del reporte de salud. `null` significa que el
 * componente no publica el bloque `anchor` (p. ej. no es el worker).
 */
export interface AnchorStats {
  readonly signed: number;
  readonly oldestSignedAt: string | null;
  readonly maxRetryCount: number;
}

/**
 * Extrae `details.anchor.stats` de un `HealthReport` de forma **defensiva** (función pura y
 * testeable): campos ausentes o de tipo incorrecto se normalizan a cero/`null`, sin lanzar.
 */
export function extractAnchorStats(report: HealthReport): AnchorStats | null {
  const anchor = report.details?.anchor;
  if (!isRecord(anchor)) return null;
  const stats = anchor.stats;
  if (!isRecord(stats)) return null;
  const signed =
    typeof stats.signed === "number" && Number.isFinite(stats.signed) ? stats.signed : 0;
  const maxRetryCount =
    typeof stats.maxRetryCount === "number" && Number.isFinite(stats.maxRetryCount)
      ? stats.maxRetryCount
      : 0;
  const oldestSignedAt = typeof stats.oldestSignedAt === "string" ? stats.oldestSignedAt : null;
  return { signed, oldestSignedAt, maxRetryCount };
}
