import type { Logger } from "pino";
import {
  MaintenanceRepository,
  NotificationQueueService,
  RedisBurnLock,
  type BurnLock,
  type PreventiveTaskRecord,
} from "@hotel/shared";
import { dayKeyInZone, hourInZone } from "./burn-scheduler";

/**
 * Planificador del **mantenimiento preventivo** (F4 · D-54).
 *
 * D-54 pide que el sistema «programe, **avise** cuando toca y registre el cumplimiento». La
 * programación y el registro viven en `preventive_plans`/`preventive_tasks`; este planificador es el
 * **aviso**: una vez al día lista las tareas **vencidas o de hoy** y envía un correo al responsable.
 *
 * Reglas:
 *   - **Una vez al día**: cerrojo por día natural del hotel (`hotel:preventive:day:<día>`) que NO se
 *     libera si se envió el aviso, para que varias réplicas del worker no dupliquen el correo.
 *   - **Si hoy no hay nada que avisar, el cerrojo se libera**: así, si se crea un plan más tarde y su
 *     primera tarea vence hoy, el aviso puede salir en el mismo día.
 *   - **Tolerante a fallo**: si el aviso falla, se libera el cerrojo y se reintenta en la próxima
 *     pasada; el listado del tablero del técnico sigue mostrando las tareas vencidas pase lo que pase.
 */
export interface PreventiveSchedulerDeps {
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Periodo de comprobación de la hora (por defecto, 1 hora). */
  readonly intervalMs?: number;
  /** Hora local del hotel a la que se avisa (por defecto 8). */
  readonly hourLocal?: number;
  /** Zona horaria del hotel (por defecto `Europe/Madrid`). */
  readonly timeZone?: string;
  /** Reloj inyectable (pruebas deterministas). */
  readonly now?: () => Date;
  /** Cerrojo diario inyectable (pruebas herméticas). */
  readonly lock?: BurnLock;
  /** Desactiva la pasada inicial (las pruebas controlan cuándo se ejecuta). */
  readonly skipInitialRun?: boolean;
  /** Listado de tareas vencidas, inyectable para probar sin base de datos. */
  readonly listDue?: (date: string) => Promise<PreventiveTaskRecord[]>;
  /** Envío del aviso, inyectable para probar sin cola ni SMTP. */
  readonly notify?: (tasks: readonly PreventiveTaskRecord[], date: string) => Promise<void>;
  /** Destinatario del aviso por defecto (si no se inyecta `notify`). */
  readonly recipient?: string;
}

export interface PreventiveScheduler {
  /** Ejecuta una pasada (respetando el cerrojo diario). Devuelve el nº de tareas o `null` si no tocaba. */
  runOnce(): Promise<number | null>;
  stop(): void;
}

const PREVENTIVE_LOCK_PREFIX = "hotel:preventive:day:";

export function startPreventiveScheduler(deps: PreventiveSchedulerDeps): PreventiveScheduler {
  const {
    logger,
    signal,
    intervalMs = 3600_000,
    hourLocal = 8,
    timeZone = "Europe/Madrid",
    now = () => new Date(),
    lock = new RedisBurnLock(),
    skipInitialRun = false,
    recipient,
    listDue = (date) => new MaintenanceRepository().listDueTasks(date),
    notify = (tasks, date) => defaultNotify(tasks, date, recipient),
  } = deps;

  let stopped = false;
  let inFlight = false;

  const runOnce = async (): Promise<number | null> => {
    if (inFlight) return null;
    const dayKey = dayKeyInZone(now(), timeZone);
    const lockKey = `${PREVENTIVE_LOCK_PREFIX}${dayKey}`;
    const dailyLock = await lock.acquire(lockKey, 26 * 3600);
    if (dailyLock === null) {
      logger.debug({ dayKey }, "preventivo: ya se avisó hoy; nada que hacer");
      return null;
    }

    inFlight = true;
    try {
      const due = await listDue(dayKey);
      if (due.length === 0) {
        // Nada que avisar hoy: se libera para que un plan creado más tarde pueda avisar igualmente.
        await lock.release(lockKey, dailyLock).catch(() => undefined);
        logger.debug({ dayKey }, "preventivo: sin tareas vencidas");
        return 0;
      }
      await notify(due, dayKey);
      logger.info({ dayKey, dueTasks: due.length }, "preventivo: aviso de tareas vencidas enviado");
      return due.length;
    } catch (error: unknown) {
      await lock.release(lockKey, dailyLock).catch(() => undefined);
      logger.error({ error }, "preventivo: fallo al avisar; se reintentará en la próxima pasada");
      return null;
    } finally {
      inFlight = false;
    }
  };

  const runIfDueHour = (): void => {
    if (stopped || signal.aborted) return;
    if (hourInZone(now(), timeZone) !== hourLocal) return;
    void runOnce();
  };

  if (!skipInitialRun) {
    void runIfDueHour();
  }
  const timer = setInterval(runIfDueHour, intervalMs);
  // El planificador no debe mantener vivo el proceso por sí solo.
  timer.unref?.();

  logger.info({ intervalMs, hourLocal, timeZone }, "planificador preventivo activo");

  return {
    runOnce,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** Aviso por defecto: correo al responsable por la cola única (sin PII de viajeros). */
async function defaultNotify(
  tasks: readonly PreventiveTaskRecord[],
  date: string,
  configuredRecipient?: string,
): Promise<void> {
  const recipient =
    configuredRecipient ??
    process.env.MAINTENANCE_ALERT_EMAIL ??
    process.env.DEVOPS_ALERT_EMAIL ??
    process.env.ADMIN_ALERT_EMAIL;
  if (!recipient) {
    throw new Error("Sin destinatario para el aviso preventivo (MAINTENANCE_ALERT_EMAIL).");
  }
  const queue = new NotificationQueueService();
  await queue.enqueueNotification("DEVOPS_ALERT", recipient, {
    subject: `Mantenimiento preventivo: ${tasks.length} tarea${tasks.length === 1 ? "" : "s"} vencida${tasks.length === 1 ? "" : "s"}`,
    source: "preventive-scheduler",
    date,
    tasks: tasks.map((task) => ({
      plan: task.planCode,
      name: task.planName,
      equipment: task.equipment,
      dueDate: task.dueDate,
      room: task.roomNumber,
    })),
    message:
      "Hay tareas de mantenimiento preventivo vencidas o para hoy. " +
      "Márcalas como hechas desde /mantenimiento al realizarlas.",
  });
}
