import type { SaleType } from "@hotel/shared";

/**
 * Contratos de dominio del mini-worker (T1.4 / CU-10 / RF-09).
 *
 * Estas interfaces son la frontera de inversión de dependencias (DIP): el núcleo
 * (`SaleProcessor`) depende sólo de estas abstracciones, nunca de viem, nodemailer o
 * better-sqlite3. Así el núcleo es testeable con fakes, sin red ni SMTP reales.
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
 * Persistencia del checkpoint e idempotencia (DIP sobre SQLite).
 *
 * - El checkpoint guarda el último bloque procesado por dirección de contrato.
 * - La idempotencia (`processed`) garantiza at-least-once con ventana mínima: normalmente 1
 *   email por clave (duplicado sólo si el proceso cae justo tras el envío y antes de
 *   `markProcessed`).
 */
export interface CheckpointStore {
  getLastBlock(contractAddress: string): number | null;
  setLastBlock(contractAddress: string, block: number): void;
  isProcessed(idempotencyKey: string): boolean;
  markProcessed(idempotencyKey: string): void;
  /** Cierre limpio de recursos (fichero SQLite). */
  close(): void;
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
}

/**
 * Persistencia de agregados e histórico de ventas (DIP sobre SQLite), FASE 3.
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
  applyEvent(event: ChainEvent): boolean;
  /** Fija el último bloque agregado (periodo deploymentBlock..lastBlock). */
  setLastBlock(block: number): void;
  /** Snapshot de los contadores acumulados. */
  getCounters(): AggregateCounters;
  /** Histórico de ventas persistido (sin ordenar; el orden total lo aplica el procesador). */
  getHistory(): HistoryRow[];
  /** Cierre limpio de recursos (fichero SQLite). */
  close(): void;
}
