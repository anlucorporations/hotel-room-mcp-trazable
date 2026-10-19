import type { Logger } from "pino";
import { SupplyAlertsRepository, isReminderDue, type SupplyAlertWithItem } from "@hotel/shared";

/**
 * Planificador del **recordatorio diario de suministros** (F8 · T8.2 · D-C33).
 *
 * Una pasada al arrancar y luego cada `intervalMs`: concilia alertas con el stock (abre/cierra) y
 * recuerda una vez al día las alertas abiertas (`last_reminded_at` persistido, sobrevive a reinicios).
 * El recordatorio real (correo/push) se inyecta como `notifier` para poder probarlo sin SMTP; por
 * defecto solo se registra en el log.
 */

export interface SupplyReminderDeps {
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Inyectable para pruebas herméticas (por defecto, repositorio real). */
  readonly repo?: Pick<SupplyAlertsRepository, "syncAll" | "dueReminders" | "markReminded">;
  /** Efecto del recordatorio; por defecto, log. */
  readonly notifier?: (alerts: readonly SupplyAlertWithItem[]) => Promise<void>;
  readonly intervalMs?: number;
  readonly now?: () => Date;
  readonly skipInitialRun?: boolean;
}

export interface SupplyReminderResult {
  readonly opened: number;
  readonly closed: number;
  readonly reminded: number;
  readonly executedAt: string;
}

export interface SupplyReminderScheduler {
  runOnce(): Promise<SupplyReminderResult>;
  stop(): void;
}

export function startSupplyReminderScheduler(deps: SupplyReminderDeps): SupplyReminderScheduler {
  const {
    logger,
    signal,
    repo = new SupplyAlertsRepository(),
    notifier,
    intervalMs = 60 * 60_000,
    now = () => new Date(),
    skipInitialRun = false,
  } = deps;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const runOnce = async (): Promise<SupplyReminderResult> => {
    const current = now();
    const { opened, closed } = await repo.syncAll();
    const openAlerts = await repo.dueReminders(24, current).catch(() => []);
    const due = openAlerts.filter((alert) => isReminderDue(alert, current));
    if (due.length > 0) {
      await repo.markReminded(
        due.map((alert) => alert.id),
        current,
      );
      if (notifier) {
        await notifier(due).catch((error: unknown) => {
          logger.error({ error }, "suministros: fallo al enviar el recordatorio; se reintentará mañana");
        });
      } else {
        logger.info(
          { alerts: due.map((alert) => ({ id: alert.id, item: alert.itemCode })) },
          "suministros: recordatorio diario de alertas abiertas",
        );
      }
    }
    if (opened > 0 || closed > 0) {
      logger.info({ opened, closed }, "suministros: alertas conciliadas con el stock");
    }
    return { opened, closed, reminded: due.length, executedAt: current.toISOString() };
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await runOnce();
    } catch (error: unknown) {
      logger.error({ error }, "suministros: fallo en la pasada; se reintentará");
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
