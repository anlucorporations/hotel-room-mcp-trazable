import type { Logger } from "pino";
import type { PublicClient, WalletClient } from "viem";
import type {
  BurnerService} from "@hotel/shared";
import {
  RedisBurnLock,
  type BurnCycleResult,
  type BurnerOptions,
  type BurnLock,
} from "@hotel/shared";

/**
 * Planificador de la quema programada (US-09, D-03).
 *
 * Reglas:
 *   - **Una vez al día**: se adquiere un cerrojo por día natural de Madrid (`hotel:burn:day:<día>`)
 *     que NO se libera al terminar. Así, con varias instancias del worker, solo una quema; las
 *     demás ven el cerrojo y no hacen nada.
 *   - **Reintento si el ciclo no se completó**: si la quema no pudo ejecutarse por saldo, error o
 *     por estar otro proceso dentro, el cerrojo diario SÍ se libera para que el siguiente tick lo
 *     reintente (un fallo de gas no debe dejar el día entero sin quema).
 *   - **Hora local de Madrid** (la del negocio), comparada cada `checkIntervalMs`.
 *   - Modo de desarrollo/demo (`forceIntervalMs`): se ignora la hora y el tick corre cada N ms, para
 *     poder verificar el planificador de verdad sin esperar a las 12:00.
 */
export interface BurnSchedulerDeps {
  readonly service: BurnerService;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | null;
  readonly options: BurnerOptions;
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Periodo de comprobación de la hora (por defecto, 5 minutos). */
  readonly checkIntervalMs?: number;
  /** Hora local del hotel a la que se ejecuta la quema diaria (por defecto 12). */
  readonly hourLocal?: number;
  /**
   * Zona horaria del hotel (por defecto `Europe/Madrid`). La quema es a las **12:00 del hotel**
   * —la hora de salida—, no a las 12:00 UTC: si el negocio estuviera en otra zona, se cambia aquí.
   */
  readonly timeZone?: string;
  /** Solo dev/demo: ejecuta el ciclo cada N ms sin esperar a la hora configurada. */
  readonly forceIntervalMs?: number;
  /** Reloj inyectable (pruebas deterministas de la hora de Madrid). */
  readonly now?: () => Date;
  /** Cerrojo diario inyectable (pruebas herméticas). */
  readonly lock?: BurnLock;
}

export interface BurnScheduler {
  /** Ejecuta el ciclo ahora (respetando cerrojo diario). Devuelve `null` si no procedía. */
  runOnce(): Promise<BurnCycleResult | null>;
  /**
   * Último ciclo observado (hallazgo **H-04**): `null` mientras no haya corrido ninguno. Es la señal
   * que `/health` publica para que un monitor externo pueda alertar de un día sin quema.
   */
  lastRun(): BurnRunSnapshot | null;
  stop(): void;
}

/** Resumen del último ciclo, para la señal de vida de `/health`. */
export interface BurnRunSnapshot {
  /** Instante en que terminó el ciclo (reloj de la máquina, ISO 8601). */
  readonly at: string;
  /** Día natural del hotel al que correspondía el ciclo (`YYYY-MM-DD`). */
  readonly dayKey: string;
  readonly reason: string;
  readonly burnedTokensCount: number;
  readonly txHashes: readonly string[];
}

/** Día natural en la zona del hotel (`YYYY-MM-DD`), usado como clave del cerrojo diario. */
export function dayKeyInZone(now: Date, timeZone = "Europe/Madrid"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Hora (0-23) en la zona del hotel. */
export function hourInZone(now: Date, timeZone = "Europe/Madrid"): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

/**
 * Reloj de la cadena: `() => Date` a partir del `timestamp` del último bloque. Si la lectura falla,
 * se degrada al reloj de la máquina (mejor un ciclo con reloj aproximado que ningún ciclo) y **se
 * avisa** por `onDegraded`: antes el aviso solo estaba en el docstring y el operador no podía saber
 * que el ciclo había usado un reloj distinto del de la cadena (H-19).
 */
export async function readChainClock(
  publicClient: { getBlock(args: { blockTag: "latest" }): Promise<{ timestamp: bigint }> },
  fallback: () => Date = () => new Date(),
  onDegraded?: (error: unknown) => void,
): Promise<() => Date> {
  try {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const chainMs = Number(block.timestamp) * 1000;
    return () => new Date(chainMs);
  } catch (error: unknown) {
    onDegraded?.(error);
    return fallback;
  }
}

export function startBurnScheduler(deps: BurnSchedulerDeps): BurnScheduler {
  const {
    service,
    publicClient,
    walletClient,
    options,
    logger,
    signal,
    checkIntervalMs = 5 * 60_000,
    hourLocal = 12,
    timeZone = "Europe/Madrid",
    forceIntervalMs,
    now = () => new Date(),
    lock = new RedisBurnLock(),
  } = deps;

  let cycleInFlight = false;
  let stopped = false;
  let lastRunSnapshot: BurnRunSnapshot | null = null;

  const runOnce = async (): Promise<BurnCycleResult | null> => {
    if (cycleInFlight) return null;

    const dayKey = dayKeyInZone(now(), timeZone);
    const lockKey = `hotel:burn:day:${dayKey}`;
    const dailyLock = await lock.acquire(lockKey, 26 * 3600);
    if (dailyLock === null) {
      logger.debug({ dayKey }, "quema diaria ya ejecutada: nada que hacer");
      return null;
    }

    cycleInFlight = true;
    try {
      logger.info({ dayKey, hourLocal, timeZone }, "planificador de quema: iniciando ciclo diario");

      // La caducidad la decide el `block.timestamp` del contrato, así que el ciclo se ejecuta con
      // la **hora de la cadena** (último bloque): con el reloj de la máquina, una cadena adelantada
      // quemaría noches que en la cadena aún no han caducado (y al revés, no quemaría ninguna). Si la
      // lectura falla se degrada al reloj de la máquina, pero **avisando** (H-19: antes era silencioso).
      const chainClock = await readChainClock(publicClient, () => now(), (error) => {
        logger.warn(
          { error },
          "no se pudo leer la hora de la cadena: el ciclo usará el reloj de la máquina",
        );
      });
      const result = await service.executeScheduledBurn(
        publicClient,
        walletClient,
        { ...options, now: chainClock },
        `hotel:burn:cycle:${dayKey}`,
      );

      logger.info(
        {
          reason: result.reason,
          burnedTokensCount: result.burnedTokensCount,
          txHashes: result.txHashes,
          skippedTokens: result.skippedTokens,
        },
        "planificador de quema: ciclo terminado",
      );

      // Señal de vida para `/health` (H-04): qué se hizo y cuándo, aunque no se quemara nada.
      lastRunSnapshot = {
        at: new Date().toISOString(),
        dayKey,
        reason: result.reason,
        burnedTokensCount: result.burnedTokensCount,
        txHashes: result.txHashes.map(String),
      };

      // Un ciclo que no se pudo completar libera el cerrojo diario para permitir el reintento.
      const completed = result.reason === "COMPLETED" || result.reason === "NO_TOKENS";
      if (!completed) {
        await lock.release(lockKey, dailyLock).catch(() => undefined);
      }
      return result;
    } catch (error: unknown) {
      await lock.release(lockKey, dailyLock).catch(() => undefined);
      logger.error({ error }, "planificador de quema: error inesperado en el ciclo");
      return null;
    } finally {
      cycleInFlight = false;
    }
  };

  const intervalMs = forceIntervalMs ?? checkIntervalMs;
  const timer = setInterval(() => {
    if (stopped || signal.aborted) return;
    if (forceIntervalMs === undefined && hourInZone(now(), timeZone) !== hourLocal) return;
    void runOnce();
  }, intervalMs);
  // El planificador no debe mantener vivo el proceso por sí solo.
  timer.unref?.();

  logger.info(
    {
      intervalMs,
      hourLocal,
      timeZone,
      modo: forceIntervalMs === undefined ? "diario" : "forzado (dev)",
      operator: options.operatorAddress,
      dryRun: options.dryRun ?? false,
    },
    "planificador de quema activo",
  );

  // Recuperación al arrancar (H-04): si el worker arranca **después** de la hora de quema, el tick
  // diario ya no volvería a mirar hasta mañana, así que ese día se quedaba sin quema. Se intenta una
  // pasada inmediata: el cerrojo diario (y el del propio ciclo) garantizan que, si ya se quemó, no se
  // repita. Antes había que esperar a las 12:00 del día siguiente.
  if (hourInZone(now(), timeZone) > hourLocal) {
    logger.info(
      { horaActual: hourInZone(now(), timeZone), hourLocal },
      "el worker arranca después de la hora de quema: pasada de recuperación",
    );
    void runOnce();
  }

  return {
    runOnce,
    lastRun: () => lastRunSnapshot,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
