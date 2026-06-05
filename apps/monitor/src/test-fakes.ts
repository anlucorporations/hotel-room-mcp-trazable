import { pino, type Logger } from "pino";
import type { HealthableComponent } from "@hotel/shared";
import type { HealthReport } from "@hotel/shared/health";
import type { Alerter, HealthProbe, ProbeResult } from "./types";

/**
 * Fakes para las pruebas del núcleo (T3.3 / TC-NF-020). Permiten ejercitar `MonitorCore` sin
 * red ni SMTP reales (DIP).
 */

/**
 * Sonda fake: devuelve un resultado fijo por URL (o uno por defecto). Permite cambiar el
 * resultado entre ciclos para simular caída y posterior recuperación.
 */
export class FakeHealthProbe implements HealthProbe {
  private results = new Map<string, ProbeResult>();
  private fallback: ProbeResult;
  /** URLs sondeadas, en orden (para verificar el número de ciclos). */
  readonly probedUrls: string[] = [];

  constructor(fallback: ProbeResult = healthy()) {
    this.fallback = fallback;
  }

  /** Fija el resultado que se devolverá para `url`. */
  setResult(url: string, result: ProbeResult): void {
    this.results.set(url, result);
  }

  /** Cambia el resultado por defecto (cuando no hay uno específico por URL). */
  setFallback(result: ProbeResult): void {
    this.fallback = result;
  }

  async probe(url: string): Promise<ProbeResult> {
    this.probedUrls.push(url);
    return this.results.get(url) ?? this.fallback;
  }
}

/** Alerter fake: acumula los avisos enviados (asunto + cuerpo). */
export class FakeAlerter implements Alerter {
  readonly sent: Array<{ subject: string; body: string }> = [];

  async sendAlert(subject: string, body: string): Promise<void> {
    this.sent.push({ subject, body });
  }
}

/** Logger silencioso para no contaminar la salida de los tests. */
export const silentLogger = (): Logger => pino({ level: "silent" });

// ── Constructores de `ProbeResult` para los escenarios de prueba ────────────────

/** Componente sano: HTTP 200 con `status: "ok"`. */
export function healthy(
  component: HealthableComponent = "worker",
  details?: Record<string, unknown>,
): ProbeResult {
  return { ok: true, httpStatus: 200, report: report("ok", component, details) };
}

/** Componente caído por HTTP 503 (`COMPONENT_DOWN`, status down). */
export function http503(component: HealthableComponent = "worker"): ProbeResult {
  return { ok: false, httpStatus: 503, report: report("down", component) };
}

/** Componente con respuesta 200 pero `status: "down"` en el cuerpo. */
export function statusDown(component: HealthableComponent = "worker"): ProbeResult {
  return { ok: true, httpStatus: 200, report: report("down", component) };
}

/** Error de red / timeout: sin respuesta HTTP. */
export function networkError(): ProbeResult {
  return { ok: false, httpStatus: 0, report: null };
}

/** Componente con lag concreto en `details`. */
export function withLag(lag: number, component: HealthableComponent = "worker"): ProbeResult {
  return healthy(component, { lag });
}

function report(
  status: HealthReport["status"],
  component: HealthableComponent,
  details?: Record<string, unknown>,
): HealthReport {
  return { status, component, ...(details !== undefined ? { details } : {}) };
}
