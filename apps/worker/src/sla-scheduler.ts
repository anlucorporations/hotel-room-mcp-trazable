import type { Logger } from "pino";
import { MaintenanceRepository, escalationSummary } from "@hotel/shared";

/**
 * Planificador del **SLA de validación** del jefe (F8 · T8.3 · RNF-M-21).
 *
 * Cada `intervalMs` (15 min por defecto) marca `PENDING_VERIFICATION_EXPIRED` las tareas cerradas por
 * el terminal hace más de 24 h sin validar y **escala al Administrador**. La tarea vencida **no
 * bloquea la habitación** pero **no cuenta como completada** hasta que se valida.
 */

export interface SlaSchedulerDeps {
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Inyectable para pruebas herméticas. */
  readonly repo?: Pick<MaintenanceRepository, "expireValidations">;
  /** Escalado; por defecto, log (la cola de correo puede conectarse aquí). */
  readonly escalate?: (summaries: readonly string[]) => Promise<void>;
  readonly intervalMs?: number;
  readonly slaHours?: number;
  readonly now?: () => Date;
  readonly skipInitialRun?: boolean;
}

export interface SlaSchedulerResult {
  readonly expired: number;
  readonly executedAt: string;
}

export interface SlaScheduler {
  runOnce(): Promise<SlaSchedulerResult>;
  stop(): void;
}

export function startSlaScheduler(deps: SlaSchedulerDeps): SlaScheduler {
  const {
    logger,
    signal,
    repo = new MaintenanceRepository(),
    escalate,
    intervalMs = 15 * 60_000,
    slaHours = 24,
    now = () => new Date(),
    skipInitialRun = false,
  } = deps;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const runOnce = async (): Promise<SlaSchedulerResult> => {
    const current = now();
    const expired = await repo.expireValidations(slaHours, current);
    if (expired.length > 0) {
      const summaries = expired.map((task) =>
        escalationSummary({ taskId: task.id, planName: task.planName, closedAt: task.completedAt }),
      );
      logger.warn({ expired: expired.length }, "SLA: validaciones vencidas escaladas al Administrador");
      if (escalate) {
        await escalate(summaries).catch((error: unknown) => {
          logger.error({ error }, "SLA: fallo al escalar; se reintentará");
        });
      }
    }
    return { expired: expired.length, executedAt: current.toISOString() };
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await runOnce();
    } catch (error: unknown) {
      logger.error({ error }, "SLA: fallo en la pasada; se reintentará");
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  if (!skipInitialRun) {
    void tick();
  } else {
    timer = setTimeout(() => void tick(), intervalMs);
  }
  signal.addEventListener("abort", () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  });

  return {
    runOnce,
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
