import type { Logger } from "pino";
import type { HealthReport } from "@hotel/shared/health";
import type { MonitorConfig, MonitorTarget } from "./config";
import type { Alerter, HealthProbe, ProbeResult } from "./types";

/**
 * Núcleo del monitor de observabilidad (T3.3 / RNF-17 / CU-16, TC-NF-020).
 *
 * Por cada target mantiene un contador de fallos consecutivos. Un "fallo" en un ciclo es:
 *   - respuesta no-ok (HTTP ≠ 200 / 503 / error de red), o
 *   - `report.status === "down"` (incluye el marcador `COMPONENT_DOWN` que el servidor de
 *     `@hotel/shared/health` traduce a 503), o
 *   - `details.lag` por encima de `LAG_THRESHOLD`.
 *
 * Cuando los fallos consecutivos alcanzan `FAILURE_THRESHOLD` y el target NO estaba ya en
 * estado de alerta, se envía una alerta (motivo `COMPONENT_DOWN` o `LAG`) y se marca el envío
 * (dedupe: no se reenvía mientras siga caído). Cuando el target vuelve a estar sano se resetea
 * el contador, se desmarca la alerta (rearme) y, si estaba alertado, se envía un aviso de
 * recuperación.
 *
 * Recibe `probe`, `alerter`, `config` y `logger` por inyección (DIP): es ejecutable en tests
 * con fakes, sin red ni SMTP reales.
 */
export type AlertReason = "COMPONENT_DOWN" | "LAG";

/** Estado mutable que el núcleo mantiene por cada target entre ciclos. */
interface TargetState {
  consecutiveFailures: number;
  alerted: boolean;
}

/** Diagnóstico de un fallo detectado en un target durante un ciclo. */
interface FailureDiagnosis {
  readonly reason: AlertReason;
  readonly detail: string;
}

export interface MonitorCoreDeps {
  readonly probe: HealthProbe;
  readonly alerter: Alerter;
  readonly config: MonitorConfig;
  readonly logger: Logger;
  /** Espera inyectable (los tests la sustituyen para no dormir de verdad). */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

export class MonitorCore {
  private readonly probe: HealthProbe;
  private readonly alerter: Alerter;
  private readonly config: MonitorConfig;
  private readonly logger: Logger;
  private readonly states = new Map<string, TargetState>();

  constructor(deps: MonitorCoreDeps) {
    this.probe = deps.probe;
    this.alerter = deps.alerter;
    this.config = deps.config;
    this.logger = deps.logger;
    for (const target of this.config.MONITOR_TARGETS) {
      this.states.set(target.name, { consecutiveFailures: 0, alerted: false });
    }
  }

  /** Evalúa todos los targets una vez (un ciclo de sondeo). */
  async runCycle(): Promise<void> {
    await Promise.all(this.config.MONITOR_TARGETS.map((target) => this.evaluate(target)));
  }

  /** Bucle de sondeo cada `POLL_INTERVAL_MS` hasta que `signal` aborte (SIGINT/SIGTERM). */
  async start(signal: AbortSignal, deps: Pick<MonitorCoreDeps, "sleep"> = {}): Promise<void> {
    const sleep = deps.sleep ?? ((ms: number) => defaultSleep(ms, signal));
    while (!signal.aborted) {
      await this.runCycle();
      if (signal.aborted) break;
      await sleep(this.config.POLL_INTERVAL_MS);
    }
  }

  /** Sondea un target y actualiza su estado (contador, alerta, recuperación). */
  private async evaluate(target: MonitorTarget): Promise<void> {
    const state = this.stateOf(target.name);
    // Si una impl de probe rechazara (rompiendo el contrato), se trata como fallo de salud:
    // el bucle de sondeo nunca debe caer por un probe.
    let result: ProbeResult;
    try {
      result = await this.probe.probe(target.url);
    } catch (error: unknown) {
      this.logger.error({ target: target.name, error }, "el probe lanzó una excepción");
      result = { ok: false, httpStatus: 0, report: null };
    }
    const failure = diagnose(result, this.config.LAG_THRESHOLD);

    if (failure === null) {
      await this.handleHealthy(target, state);
      return;
    }
    await this.handleFailure(target, state, failure);
  }

  /** Target sano: resetea el contador y, si estaba alertado, notifica la recuperación. */
  private async handleHealthy(target: MonitorTarget, state: TargetState): Promise<void> {
    const wasAlerted = state.alerted;
    state.consecutiveFailures = 0;
    state.alerted = false;
    if (wasAlerted) {
      this.logger.info({ target: target.name }, "componente recuperado");
      await this.notifyRecovery(target);
    }
  }

  /** Target en fallo: incrementa el contador y alerta al alcanzar el umbral (dedupe). */
  private async handleFailure(
    target: MonitorTarget,
    state: TargetState,
    failure: FailureDiagnosis,
  ): Promise<void> {
    state.consecutiveFailures += 1;
    this.logger.warn(
      {
        target: target.name,
        reason: failure.reason,
        detail: failure.detail,
        consecutiveFailures: state.consecutiveFailures,
      },
      "fallo de salud detectado",
    );

    const reachedThreshold = state.consecutiveFailures >= this.config.FAILURE_THRESHOLD;
    if (reachedThreshold && !state.alerted) {
      state.alerted = true;
      this.logger.error(
        { target: target.name, reason: failure.reason },
        "umbral de fallos alcanzado · enviando alerta",
      );
      await this.notifyAlert(target, failure);
    }
  }

  private async notifyAlert(target: MonitorTarget, failure: FailureDiagnosis): Promise<void> {
    const subject = `[ALERTA] ${target.name} ${failure.reason}`;
    const body = [
      `El componente "${target.name}" ha fallado ${this.config.FAILURE_THRESHOLD} sondeos consecutivos.`,
      "",
      `URL: ${target.url}`,
      `Motivo: ${failure.reason}`,
      `Detalle: ${failure.detail}`,
    ].join("\n");
    await this.dispatch(target, subject, body);
  }

  private async notifyRecovery(target: MonitorTarget): Promise<void> {
    const subject = `[RECUPERADO] ${target.name}`;
    const body = [
      `El componente "${target.name}" ha vuelto a estar sano.`,
      "",
      `URL: ${target.url}`,
    ].join("\n");
    await this.dispatch(target, subject, body);
  }

  /** Entrega la alerta aislando los fallos del canal: nunca tumban el bucle de sondeo. */
  private async dispatch(target: MonitorTarget, subject: string, body: string): Promise<void> {
    try {
      await this.alerter.sendAlert(subject, body);
    } catch (error: unknown) {
      this.logger.error({ target: target.name, error }, "fallo al enviar la alerta por email");
    }
  }

  private stateOf(name: string): TargetState {
    const state = this.states.get(name);
    if (state !== undefined) return state;
    // Defensa: un target sin estado previo (no debería ocurrir tras el constructor).
    const fresh: TargetState = { consecutiveFailures: 0, alerted: false };
    this.states.set(name, fresh);
    return fresh;
  }
}

/**
 * Decide si un resultado de sondeo es un fallo y, en su caso, por qué. Devuelve `null` si el
 * componente está sano. Es una función pura para poder probar la regla de forma aislada.
 */
export function diagnose(result: ProbeResult, lagThreshold: number): FailureDiagnosis | null {
  if (!result.ok) {
    return {
      reason: "COMPONENT_DOWN",
      detail: result.httpStatus > 0 ? `HTTP ${result.httpStatus}` : "sin respuesta (red/timeout)",
    };
  }
  const report = result.report;
  if (report === null) {
    return { reason: "COMPONENT_DOWN", detail: "respuesta sin reporte de salud válido" };
  }
  if (report.status === "down") {
    return { reason: "COMPONENT_DOWN", detail: "status=down" };
  }
  const lag = extractLag(report);
  if (lag !== null && lag > lagThreshold) {
    return { reason: "LAG", detail: `lag=${lag} (umbral ${lagThreshold})` };
  }
  return null;
}

/** Lee `details.lag` si es un número finito; en caso contrario devuelve `null`. */
function extractLag(report: HealthReport): number | null {
  const lag = report.details?.lag;
  return typeof lag === "number" && Number.isFinite(lag) ? lag : null;
}
