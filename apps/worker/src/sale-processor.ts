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

const DEFAULT_BACKOFF: BackoffOptions = {
  retries: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  constructor(deps: SaleProcessorDeps) {
    this.chainSource = deps.chainSource;
    this.mailer = deps.mailer;
    this.store = deps.store;
    this.logger = deps.logger;
    this.contractAddress = deps.contractAddress;
    this.deploymentBlock = deps.deploymentBlock;
    this.backoff = deps.backoff ?? DEFAULT_BACKOFF;
    this.health = deps.health ?? {};
    this.sleep = deps.sleep ?? defaultSleep;
  }

  /**
   * Procesa todos los eventos `Sale` desde `max(checkpoint+1, deploymentBlock)` hasta `head`,
   * en chunks ≤ `GETLOGS_MAX_RANGE`, avanzando el checkpoint tras cada chunk.
   *
   * Política de errores (MAJOR 2):
   *   - `getSaleLogs` es una llamada al RPC: si falla, el error se propaga a `runCycle`, que lo
   *     contabiliza como fallo del RPC. No se avanza el checkpoint de ese chunk.
   *   - El fallo al procesar un evento concreto (no-RPC/no-SMTP) NO se cuenta como fallo del
   *     RPC ni aborta el chunk: se registra, se degrada la salud por "processing" y se continúa
   *     con el resto de eventos. La idempotencia se preserva porque un evento que falla nunca
   *     llega a `markProcessed` (se reintentará en un ciclo posterior). El checkpoint del chunk
   *     avanza igualmente para evitar el bloqueo de cabecera de línea (head-of-line blocking):
   *     un único evento defectuoso no debe impedir el progreso del worker de forma indefinida.
   *
   * Devuelve el último bloque procesado (= `head`).
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
        await this.processSaleSafely(event);
      }

      this.store.setLastBlock(this.contractAddress, Number(toBlock));
      fromBlock = toBlock + 1n;
    }

    return headBlock;
  }

  /**
   * Envoltura de `processSale` que aísla los fallos de procesamiento de un evento concreto del
   * flujo de RPC (MAJOR 2). Un fallo aquí degrada la salud por "processing" (no por RPC) y se
   * traga el error para no abortar el chunk; un éxito rearma la salud de procesamiento.
   */
  private async processSaleSafely(event: SaleEvent): Promise<void> {
    try {
      await this.processSale(event);
      this.health.onProcessingRecovered?.();
    } catch (error: unknown) {
      this.logger.error(
        { txHash: event.txHash, logIndex: event.logIndex, blockNumber: event.blockNumber.toString(), error },
        "PROCESSING_FAILED · evento omitido en este ciclo (no es fallo de RPC)",
      );
      this.health.onProcessingError?.();
    }
  }

  /**
   * Procesa un único evento `Sale` de forma idempotente: si la clave ya está marcada, no hace
   * nada; en otro caso envía el email y sólo entonces marca la clave como procesada.
   *
   * Garantía: at-least-once con ventana mínima. Normalmente 1 email por clave incluso tras
   * reinicios; sólo se duplicaría si el proceso cae justo tras el envío SMTP y antes de
   * `markProcessed`.
   */
  async processSale(event: SaleEvent): Promise<void> {
    const key = idempotencyKey(event);
    if (this.store.isProcessed(key)) {
      return;
    }

    const notification = buildNotification(event);
    const delivered = await this.deliverWithBackoff(notification, key);
    if (!delivered) {
      // No marcamos como procesado: se reintentará en el próximo ciclo (at-least-once).
      return;
    }

    // Envío correcto: rearma la salud de email (MAJOR 1). Tras `markProcessed` queda la ventana
    // mínima de duplicado: si el proceso cae aquí, el email ya salió pero la clave no se marcó.
    this.health.onEmailRecovered?.();
    this.store.markProcessed(key);
    this.logger.info(
      { tokenId: notification.tokenId.toString(), txHash: notification.txHash },
      "aviso de venta enviado",
    );
  }

  /**
   * Intenta enviar el email con backoff exponencial acotado. Si se agotan los reintentos,
   * registra `EMAIL_DELIVERY_FAILED` y marca la salud como degradada; devuelve `false` para
   * que el llamador NO marque la venta como procesada.
   */
  private async deliverWithBackoff(
    notification: SaleNotification,
    key: string,
  ): Promise<boolean> {
    const totalAttempts = this.backoff.retries + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
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
