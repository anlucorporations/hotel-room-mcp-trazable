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
 * Fuente de la cadena (lectura de cabecera y logs `Sale`). Abstracción sobre viem (DIP).
 *
 * La paginación en chunks ≤ `GETLOGS_MAX_RANGE` es responsabilidad del procesador; esta
 * interfaz recibe siempre un rango ya acotado `[fromBlock, toBlock]` (ambos inclusive).
 */
export interface ChainSource {
  /** Último bloque de la cadena (finalidad inmediata, `CONFIRMATIONS_N = 1`). */
  getHeadBlock(): Promise<bigint>;
  /** Logs `Sale` en el rango ya acotado, en orden cronológico ascendente. */
  getSaleLogs(fromBlock: bigint, toBlock: bigint): Promise<SaleEvent[]>;
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
