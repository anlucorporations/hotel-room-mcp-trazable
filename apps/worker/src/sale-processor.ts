import { encodePacked, keccak256 } from "viem";
import { GETLOGS_MAX_RANGE, roomTypeOf, decodeTokenId } from "@hotel/shared";
import type { SaleType } from "@hotel/shared";
import type { Logger } from "pino";
import type {
  ChainSource,
  CheckpointStore,
  Mailer,
  SaleEvent,
  SaleNotification,
} from "./types";

/**
 * Núcleo del mini-worker (T1.4 / CU-10 / RF-09): convierte eventos `Sale` en avisos por email,
 * de forma idempotente y resistente a reinicios.
 *
 * Garantía de entrega: at-least-once con ventana mínima de duplicado. En la práctica se envía
 * un único email por clave; sólo podría duplicarse si el proceso cae justo tras el envío SMTP
 * y antes de `markProcessed` (ventana mínima entre ambas operaciones). No es exactamente-una-vez.
 *
 * Invariante at-least-once del checkpoint (BLOCKER 1): el checkpoint NUNCA avanza por encima de
 * un evento cuyo email no se entregó. Si la entrega de un evento falla tras agotar el backoff, el
 * checkpoint se fija al bloque anterior al del fallo (`blockNumber - 1`) y el ciclo termina para
 * reintentar en el siguiente. Como sólo se marca `markProcessed` tras una entrega correcta, en el
 * reintento los eventos ya entregados se saltan (idempotencia) y sólo se reenvía el fallido.
 *
 * No conoce viem, nodemailer ni SQLite: recibe sus colaboradores por construcción (DIP), por
 * lo que es testeable con fakes sin red ni SMTP reales.
 */
export interface BackoffOptions {
  /** Reintentos de envío de email tras el primer intento (total intentos = retries + 1). */
  readonly retries: number;
  /** Retardo base del backoff exponencial (ms). */
  readonly baseDelayMs: number;
  /** Retardo máximo por intento (ms), para acotar el backoff. */
  readonly maxDelayMs: number;
}

export interface SaleProcessorDeps {
  readonly chainSource: ChainSource;
  readonly mailer: Mailer;
  readonly store: CheckpointStore;
  readonly logger: Logger;
  readonly contractAddress: string;
  /** Bloque de despliegue: límite inferior del catch-up (DISEÑO §14). */
  readonly deploymentBlock: number;
  /** Configuración del backoff ante fallo SMTP. */
  readonly backoff?: BackoffOptions;
  /**
   * Pequeño puerto de salud inyectado desde `runWorker` (DIP): el procesador no depende de
   * `WorkerHealthState`, sólo de estos hooks. `runWorker` los conecta al estado de `/health`.
   */
  readonly health?: ProcessorHealthHooks;
  /** Función de espera inyectable (los tests la sustituyen para no dormir de verdad). */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Señal de cierre (MINOR 12): aborta el sleep del backoff SMTP para no demorar el shutdown. Si
   * se aborta a mitad del backoff, `deliverWithBackoff` deja de reintentar y devuelve `false` (no
   * entregado); el evento se reintentará en el siguiente arranque (at-least-once preservado).
   */
  readonly signal?: AbortSignal;
}

/**
 * Puerto de salud del procesador (DIP). Separa explícitamente las dos señales del worker:
 *   - email: degradado al agotar reintentos SMTP; rearmado tras un envío correcto (MAJOR 1).
 *   - processing: degradado ante un fallo NO-RPC al procesar un evento concreto; rearmado tras
 *     un ciclo que procesa eventos sin error (MAJOR 2).
 *
 * Ninguno de estos hooks debe contabilizar un fallo del RPC: eso lo gestiona `runCycle`.
 */
export interface ProcessorHealthHooks {
  /** La entrega de email quedó degradada (se agotaron los reintentos SMTP). */
  readonly onEmailDegraded?: () => void;
  /** La entrega de email se recuperó tras un envío correcto (rearma la salud). */
  readonly onEmailRecovered?: () => void;
  /** Falló el procesamiento de un evento por una causa no-RPC/no-SMTP. */
  readonly onProcessingError?: () => void;
  /** Se procesó un evento correctamente (rearma la salud de procesamiento). */
  readonly onProcessingRecovered?: () => void;
}

/**
 * Resultado de procesar un único evento `Sale`. Distingue explícitamente «no entregado» del éxito
 * (BLOCKER 1) para que el llamador sepa cuándo debe detener el avance del checkpoint:
 *   - `delivered`: el email se envió (o ya estaba marcado como procesado, idempotencia). El chunk
 *     puede seguir avanzando.
 *   - `not-delivered`: se agotó el backoff SMTP. El checkpoint NO debe pasar de este evento; el
 *     ciclo debe terminar para reintentar sólo este evento más adelante.
 */
type ProcessOutcome = "delivered" | "not-delivered";

const DEFAULT_BACKOFF: BackoffOptions = {
  retries: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

/** Sleep abortable: resuelve al cumplirse `ms` o de inmediato si la señal se aborta (MINOR 12). */
const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export class SaleProcessor {
  private readonly chainSource: ChainSource;
  private readonly mailer: Mailer;
  private readonly store: CheckpointStore;
  private readonly logger: Logger;
  private readonly contractAddress: string;
  private readonly deploymentBlock: number;
  private readonly backoff: BackoffOptions;
  private readonly health: ProcessorHealthHooks;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly signal?: AbortSignal;

  constructor(deps: SaleProcessorDeps) {
    this.chainSource = deps.chainSource;
    this.mailer = deps.mailer;
    this.store = deps.store;
    this.logger = deps.logger;
    this.contractAddress = deps.contractAddress;
    this.deploymentBlock = deps.deploymentBlock;
    this.backoff = deps.backoff ?? DEFAULT_BACKOFF;
    this.health = deps.health ?? {};
    this.signal = deps.signal;
    this.sleep = deps.sleep ?? ((ms: number) => defaultSleep(ms, deps.signal));
  }

  /**
   * Último bloque del checkpoint PERSISTIDO (no el retorno de `catchUp`), MINOR 13. Refleja el
   * progreso real entregado tras un crash parcial: si un email no se entregó, el checkpoint queda
   * detrás de `head` y el lag de `/health` lo muestra honestamente. `null` si nunca se persistió.
   */
  getPersistedLastBlock(): number | null {
    return this.store.getLastBlock(this.contractAddress);
  }

  /**
   * Procesa todos los eventos `Sale` desde `max(checkpoint+1, deploymentBlock)` hasta `head`,
   * en chunks ≤ `GETLOGS_MAX_RANGE`, en orden cronológico, avanzando el checkpoint sólo hasta el
   * último evento ENTREGADO.
   *
   * Política de errores:
   *   - `getSaleLogs` es una llamada al RPC: si falla, el error se propaga a `runCycle`, que lo
   *     contabiliza como fallo del RPC. No se avanza el checkpoint de ese chunk.
   *   - Entrega de email NO realizada (se agotó el backoff SMTP) → invariante at-least-once
   *     (BLOCKER 1): se fija el checkpoint al bloque anterior al del evento fallido
   *     (`blockNumber - 1`) y el catch-up termina. En el reintento, los eventos previos ya
   *     entregados se saltan por idempotencia (`markProcessed`) y sólo se reenvía el fallido.
   *   - Fallo NO-RPC/NO-SMTP al procesar un evento (p. ej. datos inesperados): NO se cuenta como
   *     fallo del RPC ni detiene el avance; se registra, se degrada la salud por "processing" y se
   *     continúa con el resto del chunk (no debe bloquear la cabecera de línea indefinidamente).
   *     La idempotencia se preserva porque un evento que falla nunca llega a `markProcessed`.
   *
   * Devuelve el último bloque cuyos eventos quedaron entregados (puede ser < `head` si hubo un
   * email no entregado en mitad del rango).
   */
  async catchUp(headBlock: bigint): Promise<bigint> {
    const checkpoint = this.store.getLastBlock(this.contractAddress);
    const resumeFrom = checkpoint === null ? this.deploymentBlock : checkpoint + 1;
    let fromBlock = BigInt(Math.max(resumeFrom, this.deploymentBlock));

    if (fromBlock > headBlock) {
      return headBlock;
    }

    while (fromBlock <= headBlock) {
      // Rango inclusivo de tamaño ≤ GETLOGS_MAX_RANGE.
      const toBlock = minBigInt(
        fromBlock + BigInt(GETLOGS_MAX_RANGE - 1),
        headBlock,
      );

      // Lectura del RPC: un fallo aquí se propaga (lo cuenta `runCycle` como fallo del RPC).
      const logs = await this.chainSource.getSaleLogs(fromBlock, toBlock);
      for (const event of logs) {
        const outcome = await this.processSaleSafely(event);
        if (outcome === "not-delivered") {
          // No entregado: el checkpoint no debe pasar de aquí. Lo dejamos en el bloque anterior
          // (puede contener eventos previos ya entregados) y terminamos para reintentar el ciclo.
          const safeBlock = Number(event.blockNumber) - 1;
          this.store.setLastBlock(this.contractAddress, Math.max(safeBlock, 0));
          return event.blockNumber - 1n;
        }
      }

      this.store.setLastBlock(this.contractAddress, Number(toBlock));
      fromBlock = toBlock + 1n;
    }

    return headBlock;
  }

  /**
   * Envoltura de `processSale` que separa las dos clases de fallo:
   *   - Email no entregado (se agotó el backoff): devuelve `"not-delivered"` para que `catchUp`
   *     detenga el avance del checkpoint (invariante at-least-once, BLOCKER 1). Esto NO degrada la
   *     salud por "processing" (lo hace `deliverWithBackoff` por la vía de email).
   *   - Fallo NO-RPC/NO-SMTP al procesar (p. ej. datos del evento inesperados): se registra, se
   *     degrada la salud por "processing" (no por RPC) y se devuelve `"delivered"` para no atascar
   *     el chunk; la idempotencia se preserva (el evento nunca llegó a `markProcessed`).
   * Un procesamiento correcto rearma la salud de "processing".
   */
  private async processSaleSafely(event: SaleEvent): Promise<ProcessOutcome> {
    try {
      const outcome = await this.processSale(event);
      if (outcome === "delivered") {
        this.health.onProcessingRecovered?.();
      }
      return outcome;
    } catch (error: unknown) {
      this.logger.error(
        { txHash: event.txHash, logIndex: event.logIndex, blockNumber: event.blockNumber.toString(), error },
        "PROCESSING_FAILED · evento omitido en este ciclo (no es fallo de RPC)",
      );
      this.health.onProcessingError?.();
      // Un fallo de procesamiento (no de entrega) no atasca el chunk: lo tratamos como entregado
      // a efectos del avance (se reintentará en otro ciclo porque nunca se marcó como procesado).
      return "delivered";
    }
  }

  /**
   * Procesa un único evento `Sale` de forma idempotente: si la clave ya está marcada, no hace
   * nada (`"delivered"`); en otro caso envía el email y sólo entonces marca la clave como
   * procesada. Si la entrega falla tras agotar el backoff, devuelve `"not-delivered"` SIN marcar
   * la clave (at-least-once): el llamador detendrá el avance del checkpoint.
   *
   * Garantía: at-least-once con ventana mínima. Normalmente 1 email por clave incluso tras
   * reinicios; sólo se duplicaría si el proceso cae justo tras el envío SMTP y antes de
   * `markProcessed`.
   */
  async processSale(event: SaleEvent): Promise<ProcessOutcome> {
    const key = idempotencyKey(event);
    if (this.store.isProcessed(key)) {
      return "delivered";
    }

    const notification = buildNotification(event);
    const delivered = await this.deliverWithBackoff(notification, key);
    if (!delivered) {
      // No entregado: NO marcamos como procesado y señalamos al llamador que detenga el avance
      // del checkpoint para reintentar sólo este evento (invariante at-least-once, BLOCKER 1).
      return "not-delivered";
    }

    // Envío correcto: rearma la salud de email (MAJOR 1). Tras `markProcessed` queda la ventana
    // mínima de duplicado: si el proceso cae aquí, el email ya salió pero la clave no se marcó.
    this.health.onEmailRecovered?.();
    this.store.markProcessed(key);
    this.logger.info(
      { tokenId: notification.tokenId.toString(), txHash: notification.txHash },
      "aviso de venta enviado",
    );
    return "delivered";
  }

  /**
   * Intenta enviar el email con backoff exponencial acotado. Si se agotan los reintentos,
   * registra `EMAIL_DELIVERY_FAILED` y marca la salud como degradada; devuelve `false` para
   * que el llamador NO marque la venta como procesada.
   *
   * Cierre limpio (MINOR 12): si la señal de cierre se aborta a mitad del backoff, dejamos de
   * reintentar y devolvemos `false` (no entregado). El evento no se marca como procesado, por lo
   * que el invariante at-least-once se mantiene: se reintentará en el siguiente arranque.
   */
  private async deliverWithBackoff(
    notification: SaleNotification,
    key: string,
  ): Promise<boolean> {
    const totalAttempts = this.backoff.retries + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      if (this.signal?.aborted) {
        this.logger.warn(
          { key, txHash: notification.txHash, attempt },
          "cierre en curso · se aborta el backoff SMTP (se reintentará al reiniciar)",
        );
        return false;
      }
      try {
        await this.mailer.sendSaleEmail(notification);
        return true;
      } catch (error: unknown) {
        const isLast = attempt === totalAttempts;
        if (isLast) {
          this.logger.error(
            { key, txHash: notification.txHash, attempt, error },
            "EMAIL_DELIVERY_FAILED",
          );
          this.health.onEmailDegraded?.();
          return false;
        }
        this.logger.warn(
          { key, attempt, error },
          "fallo al enviar el aviso · reintentando con backoff",
        );
        await this.sleep(this.backoffDelay(attempt));
      }
    }
    return false;
  }

  /** Retardo del backoff exponencial acotado para el intento dado (1-based). */
  private backoffDelay(attempt: number): number {
    const delay = this.backoff.baseDelayMs * 2 ** (attempt - 1);
    return Math.min(delay, this.backoff.maxDelayMs);
  }
}

/**
 * Clave de idempotencia: `keccak256(concat(txHash, logIndex))`. Identifica unívocamente cada
 * log de venta de la cadena (un par tx/logIndex no se repite).
 */
export function idempotencyKey(event: Pick<SaleEvent, "txHash" | "logIndex">): string {
  return keccak256(
    encodePacked(
      ["bytes32", "uint256"],
      [event.txHash as `0x${string}`, BigInt(event.logIndex)],
    ),
  );
}

/** Construye la notificación (sin PII) a partir del evento `Sale` decodificado. */
export function buildNotification(event: SaleEvent): SaleNotification {
  const { room, dateYYYYMMDD } = decodeTokenId(event.tokenId);
  const roomType = roomTypeOf(room) ?? "desconocido";
  return {
    tokenId: event.tokenId,
    room,
    dateYYYYMMDD,
    roomType,
    priceWei: event.priceWei,
    saleType: toSaleType(event.saleTypeRaw),
    buyer: event.buyer,
    txHash: event.txHash,
  };
}

/** Traduce el `uint8` on-chain (`enum SaleType`) a la unión de dominio. */
const toSaleType = (raw: number): SaleType =>
  raw === 0 ? "PRIMARY" : "SECONDARY";

const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);
