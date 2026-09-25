import type { HistorySummary, SaleType } from "@hotel/shared";

/**
 * Contratos de dominio del mini-worker (T1.4 / CU-10 / RF-09, docs/SRS.md §9).
 *
 * Estas interfaces son la frontera de inversión de dependencias (DIP): el núcleo
 * (`SaleProcessor`) depende sólo de estas abstracciones, nunca de viem, nodemailer o `pg`.
 * Así el núcleo es testeable con fakes, sin red, sin SMTP y sin base de datos reales.
 *
 * Todas las operaciones de persistencia son **asíncronas** (D-09): el motor es PostgreSQL
 * (`pg`), cuyo acceso a base de datos es inherentemente asíncrono.
 */

/**
 * Evento `Sale` ya decodificado de la cadena, con los datos de localización (txHash, logIndex)
 * necesarios para la idempotencia.
 *
 * `Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint8 saleType)`.
 */
export interface SaleEvent {
  readonly tokenId: bigint;
  readonly seller: string;
  readonly buyer: string;
  readonly priceWei: bigint;
  /** `0` = primaria, `1` = secundaria (enum on-chain `IHotelNights.SaleType`). */
  readonly saleTypeRaw: number;
  readonly txHash: string;
  readonly logIndex: number;
  /** Bloque en el que se emitió el evento (para depuración/trazabilidad). */
  readonly blockNumber: bigint;
}

/**
 * Notificación de venta lista para el aviso por email (CU-10). Sin PII (RNF-05): sólo datos
 * derivados del `tokenId` y de la propia venta on-chain.
 */
export interface SaleNotification {
  readonly tokenId: bigint;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: string;
  readonly priceWei: bigint;
  readonly saleType: SaleType;
  readonly buyer: string;
  readonly txHash: string;
}

/**
 * Localización on-chain de un log: identifica unívocamente cada evento (clave de idempotencia).
 */
export interface EventLocation {
  readonly txHash: string;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  /**
   * Marca temporal del bloque en segundos UNIX (UTC), o `undefined` si la fuente no la aporta.
   * La serie mensual del dashboard (D-16) necesita saber a qué mes pertenece cada venta, y el mes
   * lo decide el **reloj de la cadena**, no el de la máquina (misma lección que la quema de M6).
   */
  readonly blockTimestamp?: number;
}

/**
 * Eventos de dominio que alimentan los agregados e histórico (FASE 3, T3.1/T3.2, CU-09/11).
 *
 * Cada uno corresponde a un evento on-chain del contrato (`hotelNightsAbi`). Comparten
 * `EventLocation` para la idempotencia. La unión discriminada por `kind` permite al procesador
 * tratarlos sin acoplarse a viem (DIP).
 */

/** `Mint(uint256 tokenId, uint256 room, uint256 dateYYYYMMDD, string roomType, uint256 price)`. */
export interface MintEvent extends EventLocation {
  readonly kind: "mint";
  readonly tokenId: bigint;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: string;
  readonly priceWei: bigint;
}

/** `Sale(uint256 tokenId, address seller, address buyer, uint256 price, uint8 saleType)`. */
export interface SaleAggregateEvent extends EventLocation {
  readonly kind: "sale";
  readonly tokenId: bigint;
  readonly seller: string;
  readonly buyer: string;
  readonly priceWei: bigint;
  /** `0` = primaria, `1` = secundaria (enum on-chain `IHotelNights.SaleType`). */
  readonly saleTypeRaw: number;
}

/** `RoyaltyPaid(uint256 tokenId, address receiver, uint256 amount)` (solo ventas secundarias). */
export interface RoyaltyPaidEvent extends EventLocation {
  readonly kind: "royaltyPaid";
  readonly tokenId: bigint;
  readonly receiver: string;
  readonly amountWei: bigint;
}

/** `Burn(uint256 tokenId)`. */
export interface BurnEvent extends EventLocation {
  readonly kind: "burn";
  readonly tokenId: bigint;
}

/** Unión discriminada de los eventos de dominio que mantienen agregados/histórico. */
export type ChainEvent =
  | MintEvent
  | SaleAggregateEvent
  | RoyaltyPaidEvent
  | BurnEvent;

/**
 * Fuente de la cadena (lectura de cabecera y logs). Abstracción sobre viem (DIP).
 *
 * La paginación en chunks ≤ `GETLOGS_MAX_RANGE` es responsabilidad del procesador; esta
 * interfaz recibe siempre un rango ya acotado `[fromBlock, toBlock]` (ambos inclusive).
 */
export interface ChainSource {
  /** Último bloque de la cadena (finalidad inmediata, `CONFIRMATIONS_N = 1`). */
  getHeadBlock(): Promise<bigint>;
  /**
   * Marca temporal (segundos UNIX) de un bloque concreto. La usa el relleno de fechas del histórico
   * anterior a M7 (`backfillTimestamps`): la fecha de una venta antigua es un hecho inmutable de su
   * bloque y se puede recuperar sin volver a procesar eventos (M7 · H6).
   */
  getBlockTimestamp(blockNumber: bigint): Promise<number>;
  /** Logs `Sale` en el rango ya acotado, en orden cronológico ascendente (email, CU-10). */
  getSaleLogs(fromBlock: bigint, toBlock: bigint): Promise<SaleEvent[]>;
  /**
   * Eventos de dominio (`Mint`/`Sale`/`RoyaltyPaid`/`Burn`) en el rango ya acotado, ordenados
   * por (blockNumber asc, logIndex asc) para un agregado determinista (agregados/histórico).
   */
  getDomainLogs(fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]>;
}

/** Envío del aviso de venta (DIP sobre nodemailer/SMTP). */
export interface Mailer {
  sendSaleEmail(notification: SaleNotification): Promise<void>;
}

/**
 * Metadatos opcionales del log procesado (trazabilidad en `worker_processed_logs`). La clave de
 * idempotencia sigue siendo la PK; estos campos sólo enriquecen la fila (bloque y contrato) para
 * poder auditar el estado por contrato+bloque.
 */
export interface ProcessedLogLocation {
  readonly blockNumber: number;
  readonly contractAddress: string;
}

/**
 * Persistencia del checkpoint e idempotencia (DIP sobre PostgreSQL, D-09).
 *
 * - El checkpoint guarda el último bloque procesado por dirección de contrato.
 * - La idempotencia (`worker_processed_logs`) garantiza at-least-once con ventana mínima:
 *   normalmente 1 email por clave (duplicado sólo si el proceso cae justo tras el envío y antes
 *   de `markProcessed`).
 */
export interface CheckpointStore {
  getLastBlock(contractAddress: string): Promise<number | null>;
  setLastBlock(contractAddress: string, block: number): Promise<void>;
  isProcessed(idempotencyKey: string): Promise<boolean>;
  /** Marca la clave como procesada; `location` es metadato opcional de trazabilidad. */
  markProcessed(
    idempotencyKey: string,
    location?: ProcessedLogLocation,
  ): Promise<void>;
  /**
   * Cierre limpio de recursos. El pool de PostgreSQL es inyectado y compartido (una sola base,
   * D-09), así que su cierre corresponde al propietario del pool, no a cada store.
   */
  close(): Promise<void>;
}

/**
 * Contadores acumulados del dashboard (CU-11). Los importes se guardan como wei (`bigint`)
 * para no perder precisión; la serialización a `string` la hace el `AggregateProcessor`.
 */
export interface AggregateCounters {
  readonly primaryVolumeWei: bigint;
  readonly royaltiesWei: bigint;
  readonly secondaryVolumeWei: bigint;
  readonly soldCount: number;
  readonly mintedCount: number;
  readonly burnedCount: number;
  /** Último bloque agregado (periodo: deploymentBlock..lastBlock). */
  readonly lastBlock: number;
}

/**
 * Una venta del histórico tal y como se persiste (importes en `bigint`/wei). El procesador la
 * traduce al contrato público `SaleHistoryEntry` (importes en `string`).
 */
export interface HistoryRow {
  readonly tokenId: bigint;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: string;
  readonly priceWei: bigint;
  readonly saleTypeRaw: number;
  readonly seller: string;
  readonly buyer: string;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: string;
  /** Marca temporal del bloque (segundos UNIX, UTC) o `null` si la fila no la tiene. */
  readonly blockTimestamp: number | null;
}

/**
 * Venta del histórico que NO tiene marca temporal de bloque (anterior a la migración de M7). Basta
 * con su localización on-chain para recuperar la fecha de su bloque (M7 · H6).
 */
export interface UndatedSaleRow {
  readonly txHash: string;
  readonly logIndex: number;
  readonly blockNumber: number;
}

/**
 * Persistencia de agregados e histórico de ventas (DIP sobre PostgreSQL), FASE 3.
 *
 * Idempotencia: cada evento on-chain se contabiliza una sola vez. La clave de idempotencia
 * (`txHash:logIndex`) se registra de forma atómica junto a la mutación del contador o la fila
 * de histórico, de modo que reprocesos/catch-up no duplican ni contadores ni filas.
 */
export interface AggregateStore {
  /**
   * Aplica un evento de dominio si su clave no se había aplicado antes. Devuelve `true` si el
   * evento se contabilizó ahora (primera vez), `false` si ya estaba aplicado (duplicado).
   */
  applyEvent(event: ChainEvent): Promise<boolean>;
  /** Fija el último bloque agregado (periodo deploymentBlock..lastBlock). */
  setLastBlock(block: number): Promise<void>;
  /** Snapshot de los contadores acumulados. */
  getCounters(): Promise<AggregateCounters>;
  /** Histórico de ventas persistido (sin ordenar; el orden total lo aplica el procesador). */
  getHistory(): Promise<HistoryRow[]>;
  /**
   * Agregados de D-16 derivados del histórico **en PostgreSQL** (`GROUP BY`, sin traer las filas a
   * memoria): serie mensual, desglose por tipo, ranking de más revendidas y cuántas ventas no
   * tienen marca temporal de bloque. `timeZone` fija el mes natural (el del hotel, no UTC).
   */
  getHistorySummary(timeZone: string, topLimit: number): Promise<HistorySummary>;
  /**
   * Ventas del histórico SIN marca temporal (las anteriores a M7), ordenadas por bloque, para
   * rellenarla leyendo la cabecera de su bloque (M7 · H6).
   */
  getUndatedSales(limit: number): Promise<UndatedSaleRow[]>;
  /**
   * Fija la marca temporal de una venta **solo si no la tenía** (idempotente y sin sobrescribir un
   * dato ya conocido).
   */
  setSaleBlockTimestamp(
    txHash: string,
    logIndex: number,
    timestampSeconds: number,
  ): Promise<void>;
  /**
   * Reinicia por completo el agregado ante un redeploy (MAJOR 3): trunca los contadores a su base
   * (id = 0, importes a 0, recuentos a 0), vacía `worker_sale_history` y la idempotencia de
   * agregados, y fija `last_block = deploymentBlock`. Tras `reset`, el catch-up reprocesa desde el
   * nuevo contrato sin arrastrar datos del anterior.
   */
  reset(deploymentBlock: number): Promise<void>;
  /**
   * Dirección de contrato a la que está vinculado el agregado actual (en minúsculas), o `null` si
   * nunca se ha vinculado. Permite autodetectar un redeploy comparando con la dirección activa.
   */
  getBoundAddress(): Promise<string | null>;
  /** Persiste la dirección de contrato vinculada al agregado actual (se normaliza a minúsculas). */
  setBoundAddress(contractAddress: string): Promise<void>;
  /**
   * Cierre limpio de recursos. El pool de PostgreSQL es inyectado y compartido (una sola base,
   * D-09), así que su cierre corresponde al propietario del pool, no a cada store.
   */
  close(): Promise<void>;
}
