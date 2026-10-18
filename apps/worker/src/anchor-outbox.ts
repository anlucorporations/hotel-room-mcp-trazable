/**
 * Motor del outbox de anclaje (vNext · F3 · T3.2).
 *
 * La **fuente de verdad es la tabla** `on_chain_signatures` (outbox transaccional, D-C18); la cola
 * BullMQ solo despierta al worker. Este motor ejecuta una pasada:
 *
 *   1. expira el TTL (`expireStale`) — una firma caducada no se ancla;
 *   2. en el **primer** arranque, reconstruye el outbox desde la tabla (`recoverAfterRestart`): los
 *      leases a medio tomar se reencolan y las firmas caducadas se cierran (RNF-M-12);
 *   3. reclama un lote con `claimForAnchoring` (`FOR UPDATE SKIP LOCKED` + lease, T3.1);
 *   4. por cada firma: si ya tiene `tx_hash` y el recibo está minado, NO se reenvía (idempotencia);
 *      si no, se ancla; y
 *   5. un fallo se aísla: se cuenta y se sigue con el resto del lote (RNF-M-03), aplicando backoff
 *      creciente o cierre terminal según reintentos/TTL (RNF-M-14).
 *
 * Reglas de reintento (`documento_tecnico.md` §4.7):
 *   - `attempts = retry_count + 1`;
 *   - terminal `FAILED` con `next_attempt_at = NULL` si `attempts >= maxRetries` (8) **o** la edad
 *     desde `created_at` alcanza `ttlHours` (24 h); exige **reintento manual** del Soporte;
 *   - si no, `next_attempt_at = now + backoff[min(attempts - 1, len - 1)]`
 *     (`ANCHOR_BACKOFF` = 30 s → 1 → 2 → 5 → 10 min, saturado en el último valor).
 *
 * `UnanchorableActionError` es terminal de inmediato: el contrato no tiene función para esa acción y
 * reintentarla eternamente no la vuelve anclable.
 *
 * El reloj se inyecta (`now`) para poder verificar backoff, TTL y transición terminal sin esperas
 * reales; el módulo no crea timers ni conoce Postgres (el repositorio es un puerto).
 */
import {
  UnanchorableActionError,
  type AnchorRelayer,
  type AnchorableSignature,
} from "./anchor-relayer";

/** Puerto de persistencia (lo implementa T3.1 sobre `on_chain_signatures`). */
export interface AnchorOutboxRepository {
  claimForAnchoring(options?: {
    now?: Date;
    limit?: number;
    leaseSeconds?: number;
  }): Promise<OutboxSignature[]>;
  findById(id: string): Promise<OutboxSignature | null>;
  markMined(id: string, txHash: string): Promise<unknown>;
  markFailed(id: string, errorMessage: string, nextAttemptAt: Date | null): Promise<unknown>;
  recoverAfterRestart(now?: Date): Promise<{ requeued: number; expired: number }>;
  expireStale(now?: Date): Promise<number>;
}

/** Subconjunto de `SignatureRecord` (F1) que el motor necesita. */
export interface OutboxSignature extends AnchorableSignature {
  readonly retryCount: number;
  readonly nextAttemptAt: Date | null;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
}

export interface AnchorOutboxOptions {
  readonly batchSize?: number; // 10
  readonly leaseSeconds?: number; // 120
  readonly maxRetries?: number; // 8  (OPERATIONAL_SIGNATURE_MAX_RETRIES)
  readonly ttlHours?: number; // 24 (OPERATIONAL_SIGNATURE_TTL_HOURS)
  readonly backoffSeconds?: readonly number[]; // [30,60,120,300,600] (ANCHOR_BACKOFF)
  readonly now?: () => Date; // reloj inyectable
}

export interface AnchorCycleResult {
  readonly recovered: { requeued: number; expired: number };
  readonly claimed: number;
  readonly mined: number;
  readonly failed: number;
  readonly errors: number;
}

/** Interfaz mínima de logger (compatible con pino) para no acoplar el motor a la implementación. */
export interface AnchorOutboxLogger {
  info(o: unknown, m?: string): void;
  warn(o: unknown, m?: string): void;
  error(o: unknown, m?: string): void;
}

// Valores por defecto de §4.7. T3.4 los cableará desde la config validada; aquí quedan explícitos
// para que el motor sea comprobable de forma aislada y no dependa del entorno.
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_MAX_RETRIES = 8;
const DEFAULT_TTL_HOURS = 24;
const DEFAULT_BACKOFF_SECONDS: readonly number[] = [30, 60, 120, 300, 600];

const MS_PER_HOUR = 3_600_000;

export class AnchorOutbox {
  private readonly repository: AnchorOutboxRepository;
  private readonly relayer: AnchorRelayer;
  private readonly logger: AnchorOutboxLogger | undefined;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly maxRetries: number;
  private readonly ttlHours: number;
  private readonly backoffSeconds: readonly number[];
  private readonly now: () => Date;

  /** `false` hasta que la recuperación de arranque se completa con éxito. */
  private recoveryDone = false;

  constructor(deps: {
    readonly repository: AnchorOutboxRepository;
    readonly relayer: AnchorRelayer;
    readonly options?: AnchorOutboxOptions;
    readonly logger?: {
      info(o: unknown, m?: string): void;
      warn(o: unknown, m?: string): void;
      error(o: unknown, m?: string): void;
    };
  }) {
    const options = deps.options ?? {};
    this.repository = deps.repository;
    this.relayer = deps.relayer;
    this.logger = deps.logger;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.ttlHours = options.ttlHours ?? DEFAULT_TTL_HOURS;
    this.backoffSeconds =
      options.backoffSeconds && options.backoffSeconds.length > 0
        ? options.backoffSeconds
        : DEFAULT_BACKOFF_SECONDS;
    this.now = options.now ?? (() => new Date());
  }

  /** Una pasada: expira TTL, (en el primer arranque) recupera, reclama y ancla. */
  async runOnce(options?: { skipRecovery?: boolean }): Promise<AnchorCycleResult> {
    const now = this.now();

    const expiredStale = await this.repository.expireStale(now);
    if (expiredStale > 0) {
      this.logger?.info({ expiredStale }, "outbox: firmas caducadas por TTL");
    }

    let recovered = { requeued: 0, expired: 0 };
    if (!this.recoveryDone && options?.skipRecovery !== true) {
      recovered = await this.recover();
    }

    const claimed = await this.repository.claimForAnchoring({
      now,
      limit: this.batchSize,
      leaseSeconds: this.leaseSeconds,
    });

    let mined = 0;
    let failed = 0;
    let errors = 0;

    for (const signature of claimed) {
      try {
        const alreadyMined = await this.tryRecoverMined(signature);
        if (alreadyMined) {
          mined += 1;
          continue;
        }
        const { txHash } = await this.relayer.anchor(signature);
        await this.repository.markMined(signature.id, txHash);
        mined += 1;
        this.logger?.info(
          { id: signature.id, entityType: signature.entityType, txHash },
          "outbox: firma anclada",
        );
      } catch (error) {
        errors += 1;
        try {
          await this.handleFailure(signature, error, now);
          failed += 1;
        } catch (markError) {
          // Ni siquiera se pudo marcar el fallo: el lote sigue (aislamiento) y se deja traza.
          this.logger?.error(
            {
              id: signature.id,
              entityType: signature.entityType,
              error: messageOf(markError),
            },
            "outbox: no se pudo marcar la firma como fallida",
          );
        }
      }
    }

    return {
      recovered,
      claimed: claimed.length,
      mined,
      failed,
      errors,
    };
  }

  /** Marca que la recuperación de arranque ya se hizo (idempotente: solo una vez por proceso). */
  async recover(): Promise<{ requeued: number; expired: number }> {
    if (this.recoveryDone) {
      return { requeued: 0, expired: 0 };
    }
    const result = await this.repository.recoverAfterRestart(this.now());
    this.recoveryDone = true;
    this.logger?.info(
      { requeued: result.requeued, expired: result.expired },
      "outbox: recuperación de arranque completada",
    );
    return result;
  }

  /**
   * Si la firma ya trae `tx_hash`, comprueba el recibo antes de reenviar. Devuelve `true` y marca
   * `MINED` solo cuando la tx está confirmada con éxito (no reenvía nunca una tx ya minada).
   */
  private async tryRecoverMined(signature: OutboxSignature): Promise<boolean> {
    if (signature.txHash === null) return false;
    const mined = await this.relayer.isMined(signature.txHash as `0x${string}`);
    if (!mined) return false;
    await this.repository.markMined(signature.id, signature.txHash);
    this.logger?.info(
      { id: signature.id, entityType: signature.entityType, txHash: signature.txHash },
      "outbox: tx ya minada, no se reenvía",
    );
    return true;
  }

  /** Aplica la política de fallo: terminal o backoff creciente. */
  private async handleFailure(
    signature: OutboxSignature,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const detail = messageOf(error);

    if (error instanceof UnanchorableActionError) {
      await this.repository.markFailed(
        signature.id,
        `UNANCHORABLE_ACTION: ${detail}`,
        null,
      );
      this.logger?.error(
        {
          id: signature.id,
          entityType: signature.entityType,
          retryCount: signature.retryCount,
          nextAttemptAt: null,
        },
        "outbox: acción sin función on-chain → FAILED terminal",
      );
      return;
    }

    const attempts = signature.retryCount + 1;
    const ageMs = now.getTime() - signature.createdAt.getTime();
    const terminal = attempts >= this.maxRetries || ageMs >= this.ttlHours * MS_PER_HOUR;
    if (terminal) {
      await this.repository.markFailed(signature.id, detail, null);
      this.logger?.error(
        {
          id: signature.id,
          entityType: signature.entityType,
          retryCount: signature.retryCount,
          nextAttemptAt: null,
        },
        "outbox: reintentos o TTL agotados → FAILED terminal (reintento manual)",
      );
      return;
    }

    const index = Math.min(attempts - 1, this.backoffSeconds.length - 1);
    const backoffSeconds = this.backoffSeconds[index] ?? 0;
    const nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
    await this.repository.markFailed(signature.id, detail, nextAttemptAt);
    this.logger?.warn(
      {
        id: signature.id,
        entityType: signature.entityType,
        retryCount: signature.retryCount,
        nextAttemptAt,
      },
      "outbox: anclaje fallido, se reprograma con backoff",
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
