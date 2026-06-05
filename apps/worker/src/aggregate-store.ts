import Database from "better-sqlite3";
import { decodeTokenId, roomTypeOf } from "@hotel/shared";
import type {
  AggregateCounters,
  AggregateStore,
  ChainEvent,
  HistoryRow,
} from "./types";

/**
 * Implementación de {@link AggregateStore} sobre better-sqlite3 (FASE 3, T3.1/T3.2).
 *
 * Persiste:
 *   - `aggregate_counters`: una única fila (id = 0) con los contadores acumulados. Los importes
 *     se guardan como TEXT/wei (sin pérdida de precisión).
 *   - `sale_history`: una fila por venta del histórico (campos de `SaleHistoryEntry`).
 *   - `aggregate_applied`: claves de idempotencia (`txHash:logIndex`) ya contabilizadas.
 *
 * Idempotencia (clave por `txHash:logIndex`): `applyEvent` registra la clave y muta el contador
 * o inserta la fila de histórico dentro de una **única transacción**. Si la clave ya existe, la
 * inserción en `aggregate_applied` (PRIMARY KEY) lanza, se aborta la transacción y NO se muta
 * nada → reprocesos/catch-up son seguros (cada evento cuenta una sola vez).
 *
 * SRP: esta clase solo persiste estado; el cálculo del ratio y el orden total viven en el
 * `AggregateProcessor`.
 */
export class SqliteAggregateStore implements AggregateStore {
  private readonly db: Database.Database;
  private readonly selectCounters: Database.Statement<[]>;
  private readonly selectHistory: Database.Statement<[]>;
  private readonly markApplied: Database.Statement<[string]>;
  private readonly setLastBlockStmt: Database.Statement<[number]>;
  private readonly applyMint: Database.Statement<[]>;
  private readonly applyBurn: Database.Statement<[]>;
  private readonly addPrimarySale: Database.Statement<[string]>;
  private readonly addSecondaryVolume: Database.Statement<[string]>;
  private readonly addRoyalty: Database.Statement<[string]>;
  private readonly insertHistory: Database.Statement<{
    tokenId: string;
    room: number;
    dateYYYYMMDD: number;
    roomType: string;
    priceWei: string;
    saleTypeRaw: number;
    seller: string;
    buyer: string;
    blockNumber: number;
    logIndex: number;
    txHash: string;
  }>;
  private readonly selectBoundAddress: Database.Statement<[]>;
  private readonly upsertBoundAddress: Database.Statement<[string]>;
  private readonly applyEventTx: (event: ChainEvent) => boolean;
  private readonly resetTx: (deploymentBlock: number) => void;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    // `:memory:` no soporta WAL; solo lo activamos para ficheros en disco.
    if (filePath !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aggregate_counters (
        id INTEGER PRIMARY KEY CHECK (id = 0),
        primary_volume_wei   TEXT    NOT NULL DEFAULT '0',
        royalties_wei        TEXT    NOT NULL DEFAULT '0',
        secondary_volume_wei TEXT    NOT NULL DEFAULT '0',
        sold_count           INTEGER NOT NULL DEFAULT 0,
        minted_count         INTEGER NOT NULL DEFAULT 0,
        burned_count         INTEGER NOT NULL DEFAULT 0,
        last_block           INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO aggregate_counters (id) VALUES (0);

      CREATE TABLE IF NOT EXISTS sale_history (
        tx_hash        TEXT    NOT NULL,
        log_index      INTEGER NOT NULL,
        token_id       TEXT    NOT NULL,
        room           INTEGER NOT NULL,
        date_yyyymmdd  INTEGER NOT NULL,
        room_type      TEXT    NOT NULL,
        price_wei      TEXT    NOT NULL,
        sale_type_raw  INTEGER NOT NULL,
        seller         TEXT    NOT NULL,
        buyer          TEXT    NOT NULL,
        block_number   INTEGER NOT NULL,
        PRIMARY KEY (tx_hash, log_index)
      );

      CREATE TABLE IF NOT EXISTS aggregate_applied (
        idempotency_key TEXT PRIMARY KEY
      );

      -- Dirección de contrato vinculada al agregado actual (MAJOR 3): permite autodetectar un
      -- redeploy y resetear el estado para no arrastrar datos del contrato anterior.
      CREATE TABLE IF NOT EXISTS aggregate_binding (
        id INTEGER PRIMARY KEY CHECK (id = 0),
        contract_address TEXT
      );
      INSERT OR IGNORE INTO aggregate_binding (id, contract_address) VALUES (0, NULL);
    `);

    this.selectCounters = this.db.prepare(
      `SELECT primary_volume_wei, royalties_wei, secondary_volume_wei,
              sold_count, minted_count, burned_count, last_block
       FROM aggregate_counters WHERE id = 0`,
    );
    this.selectHistory = this.db.prepare(
      `SELECT token_id, room, date_yyyymmdd, room_type, price_wei, sale_type_raw,
              seller, buyer, block_number, log_index, tx_hash
       FROM sale_history`,
    );
    // INSERT (no OR IGNORE): si la clave existe, lanza y aborta la transacción (idempotencia).
    this.markApplied = this.db.prepare(
      "INSERT INTO aggregate_applied (idempotency_key) VALUES (?)",
    );
    this.setLastBlockStmt = this.db.prepare(
      "UPDATE aggregate_counters SET last_block = ? WHERE id = 0",
    );
    this.applyMint = this.db.prepare(
      "UPDATE aggregate_counters SET minted_count = minted_count + 1 WHERE id = 0",
    );
    this.applyBurn = this.db.prepare(
      "UPDATE aggregate_counters SET burned_count = burned_count + 1 WHERE id = 0",
    );
    // Importes en wei como TEXT: la suma se hace en `bigint` (JS) y se persiste ya calculada,
    // para no perder precisión con enteros de 64 bits de SQLite (los volúmenes pueden superarlos).
    this.addPrimarySale = this.db.prepare(
      `UPDATE aggregate_counters
       SET sold_count = sold_count + 1, primary_volume_wei = ?
       WHERE id = 0`,
    );
    this.addSecondaryVolume = this.db.prepare(
      "UPDATE aggregate_counters SET secondary_volume_wei = ? WHERE id = 0",
    );
    this.addRoyalty = this.db.prepare(
      "UPDATE aggregate_counters SET royalties_wei = ? WHERE id = 0",
    );
    this.insertHistory = this.db.prepare(
      `INSERT INTO sale_history (
         tx_hash, log_index, token_id, room, date_yyyymmdd, room_type,
         price_wei, sale_type_raw, seller, buyer, block_number
       ) VALUES (
         @txHash, @logIndex, @tokenId, @room, @dateYYYYMMDD, @roomType,
         @priceWei, @saleTypeRaw, @seller, @buyer, @blockNumber
       )`,
    );
    this.selectBoundAddress = this.db.prepare(
      "SELECT contract_address FROM aggregate_binding WHERE id = 0",
    );
    this.upsertBoundAddress = this.db.prepare(
      "UPDATE aggregate_binding SET contract_address = ? WHERE id = 0",
    );

    // Transacción atómica: marca de idempotencia + mutación. better-sqlite3 ejecuta el callback
    // dentro de BEGIN/COMMIT y hace ROLLBACK si lanza (p. ej. clave duplicada).
    this.applyEventTx = this.db.transaction((event: ChainEvent): boolean => {
      this.markApplied.run(idempotencyKey(event));
      this.mutate(event);
      return true;
    });

    // Reset atómico del agregado ante un redeploy (MAJOR 3): trunca contadores, histórico e
    // idempotencia, y fija `last_block = deploymentBlock`. Todo dentro de una única transacción.
    this.resetTx = this.db.transaction((deploymentBlock: number): void => {
      this.db.exec("DELETE FROM sale_history; DELETE FROM aggregate_applied;");
      this.db
        .prepare(
          `UPDATE aggregate_counters
           SET primary_volume_wei = '0', royalties_wei = '0', secondary_volume_wei = '0',
               sold_count = 0, minted_count = 0, burned_count = 0, last_block = ?
           WHERE id = 0`,
        )
        .run(deploymentBlock);
    });
  }

  applyEvent(event: ChainEvent): boolean {
    try {
      return this.applyEventTx(event);
    } catch (error: unknown) {
      // Clave duplicada (idempotencia): el evento ya estaba contabilizado, no es un error.
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }

  setLastBlock(block: number): void {
    this.setLastBlockStmt.run(block);
  }

  getCounters(): AggregateCounters {
    const row = this.selectCounters.get() as CountersRow;
    return {
      primaryVolumeWei: BigInt(row.primary_volume_wei),
      royaltiesWei: BigInt(row.royalties_wei),
      secondaryVolumeWei: BigInt(row.secondary_volume_wei),
      soldCount: row.sold_count,
      mintedCount: row.minted_count,
      burnedCount: row.burned_count,
      lastBlock: row.last_block,
    };
  }

  getHistory(): HistoryRow[] {
    const rows = this.selectHistory.all() as HistorySqlRow[];
    return rows.map((row) => ({
      tokenId: BigInt(row.token_id),
      room: row.room,
      dateYYYYMMDD: row.date_yyyymmdd,
      roomType: row.room_type,
      priceWei: BigInt(row.price_wei),
      saleTypeRaw: row.sale_type_raw,
      seller: row.seller,
      buyer: row.buyer,
      blockNumber: row.block_number,
      logIndex: row.log_index,
      txHash: row.tx_hash,
    }));
  }

  reset(deploymentBlock: number): void {
    this.resetTx(deploymentBlock);
  }

  getBoundAddress(): string | null {
    const row = this.selectBoundAddress.get() as
      | { contract_address: string | null }
      | undefined;
    return row?.contract_address ?? null;
  }

  setBoundAddress(contractAddress: string): void {
    this.upsertBoundAddress.run(contractAddress.toLowerCase());
  }

  close(): void {
    this.db.close();
  }

  /** Muta los contadores/histórico según el tipo de evento (ya dentro de la transacción). */
  private mutate(event: ChainEvent): void {
    switch (event.kind) {
      case "mint":
        this.applyMint.run();
        return;
      case "burn":
        this.applyBurn.run();
        return;
      case "royaltyPaid":
        // Royalties solo de RoyaltyPaid (ventas secundarias): nunca de ventas primarias.
        this.addRoyalty.run(this.sumWei("royalties_wei", event.amountWei));
        return;
      case "sale":
        this.applySale(event);
        return;
    }
  }

  /** Suma `delta` (wei) al importe actual de la columna, en `bigint`, y devuelve el total. */
  private sumWei(column: WeiColumn, delta: bigint): string {
    const row = this.selectCounters.get() as CountersRow;
    const current = BigInt(row[column]);
    return (current + delta).toString();
  }

  private applySale(event: Extract<ChainEvent, { kind: "sale" }>): void {
    const isPrimary = event.saleTypeRaw === 0;
    if (isPrimary) {
      this.addPrimarySale.run(this.sumWei("primary_volume_wei", event.priceWei));
    } else {
      this.addSecondaryVolume.run(
        this.sumWei("secondary_volume_wei", event.priceWei),
      );
    }
    // El histórico deriva del evento `Sale` (no de `ownerOf`): una venta de un token luego
    // quemado SIGUE en el histórico.
    const { room, dateYYYYMMDD } = decodeTokenId(event.tokenId);
    this.insertHistory.run({
      txHash: event.txHash,
      logIndex: event.logIndex,
      tokenId: event.tokenId.toString(),
      room,
      dateYYYYMMDD,
      roomType: roomTypeOf(room) ?? "desconocido",
      priceWei: event.priceWei.toString(),
      saleTypeRaw: event.saleTypeRaw,
      seller: event.seller,
      buyer: event.buyer,
      blockNumber: Number(event.blockNumber),
    });
  }
}

interface CountersRow {
  readonly primary_volume_wei: string;
  readonly royalties_wei: string;
  readonly secondary_volume_wei: string;
  readonly sold_count: number;
  readonly minted_count: number;
  readonly burned_count: number;
  readonly last_block: number;
}

/** Columnas de `CountersRow` cuyo valor es un importe en wei (TEXT). */
type WeiColumn = "primary_volume_wei" | "royalties_wei" | "secondary_volume_wei";

interface HistorySqlRow {
  readonly token_id: string;
  readonly room: number;
  readonly date_yyyymmdd: number;
  readonly room_type: string;
  readonly price_wei: string;
  readonly sale_type_raw: number;
  readonly seller: string;
  readonly buyer: string;
  readonly block_number: number;
  readonly log_index: number;
  readonly tx_hash: string;
}

/** Clave de idempotencia estable: `txHash:logIndex` (único por log on-chain). */
export function idempotencyKey(
  event: Pick<ChainEvent, "txHash" | "logIndex">,
): string {
  return `${event.txHash}:${event.logIndex}`;
}

/** ¿El error es una violación de PRIMARY KEY/UNIQUE de SQLite (clave ya aplicada)? */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("SQLITE_CONSTRAINT")
  );
}
