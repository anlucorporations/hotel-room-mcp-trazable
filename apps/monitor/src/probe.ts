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
