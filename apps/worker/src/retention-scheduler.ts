import type { Logger } from "pino";
import { RedisBurnLock, type BurnLock } from "@hotel/shared";
import { purgeExpiredData, type PurgeResult } from "@hotel/shared";

/**
 * Planificador de retención de datos (M9 · ADR-24).
 *
 * **Por qué existe.** Los plazos de conservación estaban escritos y no se cumplían:
 * `purgeOldNotifications` (90 días para los correos enviados) existía desde la construcción inicial y
 * **no la invocaba nadie**, y las sesiones de operadores no se borraban nunca, de modo que la traza de
 * acceso —aunque pseudonimizada— se quedaba para siempre. Un plazo que no se ejecuta no es un plazo:
 * es una frase.
 *
 * **Cómo funciona.** Una pasada al arrancar y luego cada `intervalMs`, con un **cerrojo distribuido**
 * para que con varias réplicas del worker la limpieza se ejecute una sola vez por ventana. El cerrojo
 * SÍ se libera siempre al terminar: si una pasada falla, la siguiente lo reintenta (no es como la
 * quema diaria, donde el cerrojo marca «ya hecho hoy»).
 */

export interface RetentionSchedulerDeps {
  /** Limpieza a ejecutar; inyectable para poder probarla sin base de datos. */
  readonly purge?: () => Promise<PurgeResult>;
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Periodo entre pasadas (por defecto, 6 horas). */
  readonly intervalMs?: number;
  /** Días de conservación de los correos enviados (por defecto, 90). */
  readonly notificationsRetentionDays?: number;
  /** Cerrojo inyectable (pruebas herméticas). */
  readonly lock?: BurnLock;
  /** Desactiva la pasada inicial (las pruebas controlan cuándo se ejecuta). */
  readonly skipInitialRun?: boolean;
}

export interface RetentionScheduler {
  /** Ejecuta una pasada ahora (respetando el cerrojo). Devuelve `null` si otro proceso la tiene. */
  runOnce(): Promise<PurgeResult | null>;
  stop(): void;
}

/** Clave del cerrojo de la limpieza: una ventana, una pasada, aunque haya varias réplicas. */
const RETENTION_LOCK_KEY = "hotel:retention:purge";

export function startRetentionScheduler(deps: RetentionSchedulerDeps): RetentionScheduler {
  const {
    purge,
    logger,
    signal,
    intervalMs = 6 * 3600_000,
    notificationsRetentionDays = 90,
    lock = new RedisBurnLock(),
    skipInitialRun = false,
  } = deps;

  const runPurge = purge ?? (() => purgeExpiredData({ notificationsRetentionDays }));
  let stopped = false;

  const runOnce = async (): Promise<PurgeResult | null> => {
    // Un minuto de TTL es holgado: la limpieza son tres DELETE con índice, no un barrido.
    const token = await lock.acquire(RETENTION_LOCK_KEY, 60);
    if (token === null) {
      logger.debug("retención: otra instancia está purgando; se omite esta pasada");
      return null;
    }

    try {
      const result = await runPurge();
      logger.info(
        {
          expiredSessions: result.expiredSessions,
          orphanRecoveryCodes: result.orphanRecoveryCodes,
          oldNotifications: result.oldNotifications,
          executedAt: result.executedAt,
        },
        "retención: limpieza ejecutada",
      );
      return result;
    } catch (error: unknown) {
      logger.error({ error }, "retención: fallo en la limpieza; se reintentará en la próxima pasada");
      return null;
    } finally {
      // A diferencia de la quema diaria, el cerrojo se libera siempre: si algo falló, la siguiente
      // pasada debe poder reintentarlo.
      await lock.release(RETENTION_LOCK_KEY, token).catch(() => undefined);
    }
  };

  const timer = setInterval(() => {
    if (stopped || signal.aborted) return;
    void runOnce();
  }, intervalMs);
  // El planificador no debe mantener vivo el proceso por sí solo.
  timer.unref?.();

  if (!skipInitialRun) void runOnce();

  logger.info(
    { intervalMs, notificationsRetentionDays },
    "planificador de retención activo (sesiones caducadas, códigos huérfanos y correos enviados)",
  );

  return {
    runOnce,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
