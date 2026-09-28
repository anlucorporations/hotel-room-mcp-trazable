import type { Logger } from "pino";
import {
  NFTsRepository,
  NotificationQueueService,
  RedisBurnLock,
  RoomsRepository,
  SettingsRepository,
  buildMintWindowOverview,
  getRedisClient,
  selectLowRooms,
  type BurnLock,
  type MintWindowOverview,
  type MintWindowRoomStatus,
} from "@hotel/shared";
import { hourInZone } from "./burn-scheduler";

/**
 * Aviso de **agotamiento de la ventana de acuñación** (F8 · D-17).
 *
 * D-17 pide avisar cuando a una habitación **publicada** le quedan menos de
 * {@link MINT_WINDOW_LOW_THRESHOLD} noches **libres** dentro de la ventana, o cuando la ventana no
 * llega a `mint_window_days`. El aviso **in-app** ya vive en `/admin/habitacion` (el resumen de
 * `window-overview` marca `low`); esto es el **correo al responsable**, por la **cola única**
 * existente (`DEVOPS_ALERT`, D-03), sin PII.
 *
 * Reglas (mismo patrón que la alerta de silencio del listener y el aviso preventivo):
 *   - **Una vez por episodio y habitación**: mientras la habitación siga en agotamiento no se repite
 *     el correo; el aviso se **rearma** cuando deja de estarlo (se vuelve a acuñar la ventana o se
 *     publican más noches). La marca vive en Redis (`SET NX`), así que varias réplicas del worker no
 *     duplican el correo.
 *   - **Una pasada a la vez**: cerrojo corto de pasada para que dos instancias no redacten el mismo
 *     digest; el cerrojo **se libera siempre** (la memoria del episodio es la marca por habitación).
 *   - **Tolerante a fallo**: si el encolado falla, se **rearman** los avisos reclamados en esa pasada
 *     y se reintenta en la siguiente; el panel sigue mostrando el agotamiento pase lo que pase.
 */
export interface MintWindowAlertState {
  /** Marca el aviso de la habitación; `false` si ya estaba avisada (no se repite el correo). */
  claim(roomNumber: number): Promise<boolean>;
  /** Rearma el aviso: la habitación dejó de estar en agotamiento (o falló el envío). */
  rearm(roomNumber: number): Promise<void>;
}

/** Clave del estado del aviso por habitación en Redis. */
export const MINT_WINDOW_ALERT_KEY_PREFIX = "hotel:mint-window:alert:";
const PASS_LOCK_KEY = "hotel:mint-window:pass";
const PASS_LOCK_TTL_SECONDS = 900;

/** Operaciones de Redis que necesita el estado del aviso (inyectables en pruebas). */
export interface MintWindowAlertRedis {
  set(key: string, value: string, ex: "EX", ttl: number, nx: "NX"): Promise<"OK" | null>;
  del(key: string): Promise<number>;
}

/** Estado del aviso en Redis: una clave por habitación con marca `SET NX` y caducidad amplia. */
export class RedisMintWindowAlertState implements MintWindowAlertState {
  constructor(
    /** Días tras los cuales una marca huérfana caduca sola (por defecto, 30). */
    private readonly ttlDays = 30,
    /** Cliente inyectable (las pruebas usan un doble sin Redis). */
    private readonly client: () => MintWindowAlertRedis = () =>
      getRedisClient() as unknown as MintWindowAlertRedis,
  ) {}

  private key(roomNumber: number): string {
    return `${MINT_WINDOW_ALERT_KEY_PREFIX}${roomNumber}`;
  }

  async claim(roomNumber: number): Promise<boolean> {
    const result = await this.client().set(
      this.key(roomNumber),
      new Date().toISOString(),
      "EX",
      Math.round(this.ttlDays * 86_400),
      "NX",
    );
    return result === "OK";
  }

  async rearm(roomNumber: number): Promise<void> {
    await this.client().del(this.key(roomNumber));
  }
}

export interface MintWindowSchedulerDeps {
  readonly logger: Logger;
  readonly signal: AbortSignal;
  /** Periodo con el que se comprueba la hora del aviso (por defecto, 1 hora). */
  readonly intervalMs?: number;
  /** Hora local del hotel a la que se avisa (por defecto 8, como el preventivo). */
  readonly hourLocal?: number;
  /** Zona horaria del hotel (por defecto `Europe/Madrid`). */
  readonly timeZone?: string;
  /** Reloj inyectable (pruebas deterministas). */
  readonly now?: () => Date;
  /** Cerrojo de pasada inyectable (pruebas herméticas). */
  readonly lock?: BurnLock;
  /** Desactiva la pasada inicial (las pruebas controlan cuándo se ejecuta). */
  readonly skipInitialRun?: boolean;
  /** Resumen de la ventana, inyectable para probar sin base de datos. */
  readonly overview?: () => Promise<MintWindowOverview>;
  /** Estado de los avisos, inyectable para probar sin Redis. */
  readonly alerts?: MintWindowAlertState;
  /** Envío del aviso, inyectable para probar sin cola ni SMTP. */
  readonly notify?: (rooms: readonly MintWindowRoomStatus[], overview: MintWindowOverview) => Promise<void>;
  /** Destinatario del aviso por defecto (si no se inyecta `notify`). */
  readonly recipient?: string;
}

export interface MintWindowScheduler {
  /** Ejecuta una pasada. Devuelve el nº de avisos nuevos, `0` si no había ninguno o `null` si no tocaba. */
  runOnce(): Promise<number | null>;
  stop(): void;
}

export function startMintWindowScheduler(deps: MintWindowSchedulerDeps): MintWindowScheduler {
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
    overview = defaultOverview,
    alerts = new RedisMintWindowAlertState(),
    notify = (rooms, summary) => defaultNotify(rooms, summary, recipient),
  } = deps;

  let stopped = false;
  let inFlight = false;

  const runOnce = async (): Promise<number | null> => {
    if (inFlight) return null;
    inFlight = true;
    const claimed: MintWindowRoomStatus[] = [];
    /** Cerrojo de pasada, si se llegó a adquirir (se libera siempre). */
    let pass: string | null = null;
    try {
      // El cerrojo de pasada también puede fallar (Redis caído): no debe tumbar el worker, así que
      // se adquiere DENTRO del try y el fallo se registra como una pasada perdida.
      pass = await lock.acquire(PASS_LOCK_KEY, PASS_LOCK_TTL_SECONDS);
      if (pass === null) {
        logger.debug("ventana de acuñación: otra instancia está comprobando el agotamiento");
        return null;
      }

      const summary = await overview();
      // Las habitaciones que ya no están en agotamiento rearman su aviso para un episodio futuro.
      for (const room of summary.rooms) {
        if (!room.low) await alerts.rearm(room.roomNumber);
      }

      for (const room of selectLowRooms(summary)) {
        if (await alerts.claim(room.roomNumber)) claimed.push(room);
      }

      if (claimed.length === 0) {
        logger.debug({ low: summary.totals.low }, "ventana de acuñación: sin agotamientos nuevos");
        return 0;
      }

      await notify(claimed, summary);
      logger.info(
        {
          rooms: claimed.map((room) => room.roomNumber),
          freeNights: claimed.map((room) => room.freeNights),
        },
        "ventana de acuñación: aviso de agotamiento enviado",
      );
      return claimed.length;
    } catch (error: unknown) {
      // El aviso no salió: se rearma lo reclamado en esta pasada para reintentarlo en la siguiente.
      for (const room of claimed) {
        await alerts.rearm(room.roomNumber).catch(() => undefined);
      }
      logger.error({ error }, "ventana de acuñación: fallo al avisar; se reintentará en la próxima pasada");
      return null;
    } finally {
      inFlight = false;
      if (pass !== null) {
        await lock.release(PASS_LOCK_KEY, pass).catch(() => undefined);
      }
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

  logger.info({ intervalMs, hourLocal, timeZone }, "planificador de ventana de acuñación activo");

  return {
    runOnce,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** Resumen real: los tres repositorios sobre el pool compartido (una sola base, D-09). */
async function defaultOverview(): Promise<MintWindowOverview> {
  return buildMintWindowOverview({
    rooms: new RoomsRepository(),
    nfts: new NFTsRepository(),
    settings: new SettingsRepository(),
  });
}

/** Aviso por defecto: correo al responsable por la cola única (sin PII), con el detalle por habitación. */
async function defaultNotify(
  rooms: readonly MintWindowRoomStatus[],
  overview: MintWindowOverview,
  configuredRecipient?: string,
): Promise<void> {
  const recipient =
    configuredRecipient ??
    process.env.MINT_WINDOW_ALERT_EMAIL ??
    process.env.ADMIN_EMAIL ??
    process.env.DEVOPS_ALERT_EMAIL;
  if (!recipient) {
    throw new Error("Sin destinatario para el aviso de agotamiento (MINT_WINDOW_ALERT_EMAIL).");
  }

  const queue = new NotificationQueueService();
  await queue.enqueueNotification("DEVOPS_ALERT", recipient, {
    subject: `Ventana de acuñación corta: ${rooms.length} habitaci${rooms.length === 1 ? "ón" : "ones"}`,
    source: "mint-window-scheduler",
    windowDays: overview.windowDays,
    threshold: overview.threshold,
    rooms: rooms.map((room) => ({
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      freeNights: room.freeNights,
      missing: room.missing,
    })),
    message:
      `${rooms.length} habitaci${rooms.length === 1 ? "ón" : "ones"} publicada${rooms.length === 1 ? "" : "s"} ` +
      `con menos de ${overview.threshold} noches libres en la ventana de acuñación:\n` +
      rooms
        .map(
          (room) =>
            `· Habitación ${room.roomNumber} (${room.roomType}): ${room.freeNights} libres, ` +
            `${room.missing} por acuñar`,
        )
        .join("\n") +
      "\nAmplía la ventana desde Administración → Habitación («Acuñar ventana» o «Barrido global»).",
    timestamp: new Date().toISOString(),
  });
}
