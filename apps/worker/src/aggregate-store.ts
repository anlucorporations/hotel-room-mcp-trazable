import type { Pool, PoolClient } from "pg";
import {
  asRoomTypeKey,
  decodeTokenId,
  ROOM_TYPE_ORDER,
  roomTypeOf,
  type HistorySummary,
  type MonthlySalesPoint,
  type RoomTypeBreakdownEntry,
  type TopResoldNight,
} from "@hotel/shared";
import type {
  AggregateCounters,
  AggregateStore,
  ChainEvent,
  HistoryRow,
  UndatedSaleRow,
} from "./types";

/** SQLSTATE de PostgreSQL para violación de restricción única / PRIMARY KEY. */
const UNIQUE_VIOLATION = "23505";

/**
 * Implementación de {@link AggregateStore} sobre PostgreSQL (D-09, FASE 3, T3.1/T3.2).
 *
 * Persiste en la MISMA base que la web/API (esquema creado por `runMigrations()`):
 *   - `worker_aggregate_counters`: una única fila (id = 0) con los contadores acumulados. Los
 *     importes se guardan como `NUMERIC(78, 0)` en wei (sin pérdida de precisión).
 *   - `worker_sale_history`: una fila por venta (clave `(tx_hash, log_index)`) con la marca
 *     temporal del bloque, que es lo que permite la serie mensual de D-16.
 *   - `worker_processed_logs`: claves (`txHash:logIndex`) ya contabilizadas (idempotencia).
 *
 * Idempotencia y atomicidad: `applyEvent` abre una transacción con un **cliente dedicado del
 * pool** (`pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK` + `release()`), inserta la clave de
 * idempotencia (PK) y muta contadores/histórico. Si la clave ya existía, PostgreSQL responde con
 * `23505`, se hace `ROLLBACK` y la función devuelve `false` sin mutar nada → reprocesos y
 * catch-up son seguros (cada evento cuenta una sola vez).
 *
 * Concurrencia: la fila única de contadores se lee con `SELECT ... FOR UPDATE` dentro de la
 * transacción. Así las sumas en `bigint` (JS) no pierden actualizaciones: equivale a tener un
 * único escritor serializado sobre los contadores.
 *
 * SRP: esta clase solo persiste estado; el cálculo del ratio y el orden total viven en el
 * `AggregateProcessor`.
 */
export class PgAggregateStore implements AggregateStore {
  constructor(private readonly pool: Pool) {}

  async applyEvent(event: ChainEvent): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // 1) Clave de idempotencia (PK). Un duplicado aborta la transacción (23505) → `false`.
      //    `contract_address` se toma de la fila de contadores (el store no conoce la dirección).
      await client.query(
        `INSERT INTO worker_processed_logs (log_key, block_number, contract_address, processed_at)
         VALUES ($1, $2,
                 (SELECT contract_address FROM worker_aggregate_counters WHERE id = 0),
                 NOW())`,
        [idempotencyKey(event), Number(event.blockNumber)],
      );
      // 2) Bloqueo de la fila única: serializa los `applyEvent` concurrentes.
      const counters = await lockCounters(client);
      await mutate(client, event, counters);
      await client.query("COMMIT");
      return true;
    } catch (error: unknown) {
      await rollback(client);
      // Clave duplicada (idempotencia): el evento ya estaba contabilizado, no es un error.
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async setLastBlock(block: number): Promise<void> {
    await this.pool.query(
      "UPDATE worker_aggregate_counters SET last_block = $1 WHERE id = 0",
      [block],
    );
  }

  async getCounters(): Promise<AggregateCounters> {
    const { rows } = await this.pool.query<CountersRow>(
      `SELECT primary_volume_wei, royalties_wei, secondary_volume_wei,
              sold_count, minted_count, burned_count, last_block
       FROM worker_aggregate_counters WHERE id = 0`,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error(
        "falta la fila semilla id = 0 de worker_aggregate_counters: ¿se ejecutó runMigrations()?",
      );
    }
    return toCounters(row);
  }

  async getHistory(): Promise<HistoryRow[]> {
    const { rows } = await this.pool.query<HistorySqlRow>(
      `SELECT token_id, room, date_yyyymmdd, room_type, price_wei, sale_type_raw,
              seller, buyer, block_number, log_index, tx_hash,
              EXTRACT(EPOCH FROM block_timestamp)::BIGINT AS block_timestamp_epoch
       FROM worker_sale_history`,
    );
    return rows.map((row) => ({
      tokenId: BigInt(row.token_id),
      room: Number(row.room),
      dateYYYYMMDD: Number(row.date_yyyymmdd),
      roomType: row.room_type,
      priceWei: BigInt(row.price_wei),
      saleTypeRaw: Number(row.sale_type_raw),
      seller: row.seller,
      buyer: row.buyer,
      blockNumber: Number(row.block_number),
      logIndex: Number(row.log_index),
      txHash: row.tx_hash,
      blockTimestamp:
        row.block_timestamp_epoch === null ? null : Number(row.block_timestamp_epoch),
    }));
  }

  /**
   * Agregados de D-16 calculados EN PostgreSQL (D-09): cuatro consultas de agregación
   * (`GROUP BY`/`FILTER`) que nunca traen las filas a memoria. El mes natural se calcula con
   * `date_trunc('month', block_timestamp AT TIME ZONE $1)`, es decir, en la zona del hotel: la
   * misma definición que `monthInTimeZone()` en el dominio, que es lo que permite contrastar las
   * dos vías.
   *
   * Las filas sin marca temporal (`block_timestamp IS NULL`: histórico anterior a la migración de
   * M7) quedan fuera de la serie mensual y se cuentan aparte (`undatedSalesCount`) en lugar de
   * desaparecer sin dejar rastro.
   *
   * **Instantánea coherente**: las cuatro consultas se ejecutan en UNA transacción
   * `REPEATABLE READ`. Sin ella, el worker puede confirmar una venta entre dos de las consultas y
   * el payload saldría mezclando dos instantes (una venta en la serie mensual y no en el desglose),
   * que es justo el tipo de incoherencia que el criterio de M7 prohíbe. Es una lectura: no bloquea
   * a los escritores (MVCC) y no hay riesgo de deadlock.
   */
  async getHistorySummary(timeZone: string, topLimit: number): Promise<HistorySummary> {
    const client = await this.pool.connect();
    let months: { rows: MonthlySqlRow[] };
    let types: { rows: RoomTypeSqlRow[] };
    let resold: { rows: TopResoldSqlRow[] };
    let undated: { rows: { undated: number }[] };
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      months = await client.query<MonthlySqlRow>(
        `SELECT to_char(date_trunc('month', block_timestamp AT TIME ZONE $1), 'YYYY-MM') AS month,
                COALESCE(SUM(price_wei) FILTER (WHERE sale_type_raw = 0), 0) AS primary_volume_wei,
                COALESCE(SUM(price_wei) FILTER (WHERE sale_type_raw = 1), 0) AS secondary_volume_wei,
                COUNT(*) FILTER (WHERE sale_type_raw = 0)::INT AS primary_sales,
                COUNT(*) FILTER (WHERE sale_type_raw = 1)::INT AS secondary_sales
         FROM worker_sale_history
         WHERE block_timestamp IS NOT NULL
         GROUP BY 1
         ORDER BY 1`,
        [timeZone],
      );
      types = await client.query<RoomTypeSqlRow>(
        `SELECT room_type,
                COALESCE(SUM(price_wei) FILTER (WHERE sale_type_raw = 0), 0) AS primary_volume_wei,
                COALESCE(SUM(price_wei) FILTER (WHERE sale_type_raw = 1), 0) AS secondary_volume_wei,
                COUNT(*) FILTER (WHERE sale_type_raw = 0)::INT AS primary_sales,
                COUNT(*) FILTER (WHERE sale_type_raw = 1)::INT AS secondary_sales
         FROM worker_sale_history
         GROUP BY room_type`,
      );
      resold = await client.query<TopResoldSqlRow>(
        `SELECT token_id, room, date_yyyymmdd, room_type,
                COUNT(*)::INT AS resale_count,
                SUM(price_wei) AS resale_volume_wei
         FROM worker_sale_history
         WHERE sale_type_raw = 1
         GROUP BY token_id, room, date_yyyymmdd, room_type
         ORDER BY resale_count DESC, resale_volume_wei DESC, token_id::NUMERIC ASC
         LIMIT $1`,
        [topLimit],
      );
      undated = await client.query<{ undated: number }>(
        `SELECT COUNT(*)::INT AS undated
         FROM worker_sale_history
         WHERE block_timestamp IS NULL`,
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }

    const monthlySeries: MonthlySalesPoint[] = months.rows.map((row) => ({
      month: row.month,
      primaryVolumeWei: row.primary_volume_wei,
      secondaryVolumeWei: row.secondary_volume_wei,
      primarySales: Number(row.primary_sales),
      secondarySales: Number(row.secondary_sales),
    }));

    const byType = new Map(types.rows.map((row) => [asRoomTypeKey(row.room_type), row]));
    const roomTypeBreakdown: RoomTypeBreakdownEntry[] = ROOM_TYPE_ORDER.filter((type) =>
      byType.has(type),
    ).map((roomType) => {
      const row = byType.get(roomType)!;
      return {
        roomType,
        primarySales: Number(row.primary_sales),
        secondarySales: Number(row.secondary_sales),
        primaryVolumeWei: row.primary_volume_wei,
        secondaryVolumeWei: row.secondary_volume_wei,
        totalVolumeWei: (BigInt(row.primary_volume_wei) + BigInt(row.secondary_volume_wei)).toString(),
      };
    });

    const topResold: TopResoldNight[] = resold.rows.map((row) => ({
      tokenId: row.token_id,
      room: Number(row.room),
      dateYYYYMMDD: Number(row.date_yyyymmdd),
      roomType: asRoomTypeKey(row.room_type),
      resaleCount: Number(row.resale_count),
      resaleVolumeWei: row.resale_volume_wei,
    }));

    return {
      monthlySeries,
      roomTypeBreakdown,
      topResold,
      undatedSalesCount: Number(undated.rows[0]?.undated ?? 0),
    };
  }

  /**
   * Ventas SIN marca temporal (histórico anterior a M7), por orden de bloque. Permiten recuperar su
   * fecha leyendo la cabecera del bloque: es un hecho inmutable, no un dato inventado (H6).
   */
  async getUndatedSales(limit: number): Promise<UndatedSaleRow[]> {
    const { rows } = await this.pool.query<{ tx_hash: string; log_index: number; block_number: string }>(
      `SELECT tx_hash, log_index, block_number
       FROM worker_sale_history
       WHERE block_timestamp IS NULL
       ORDER BY block_number ASC, log_index ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      txHash: row.tx_hash,
      logIndex: Number(row.log_index),
      blockNumber: Number(row.block_number),
    }));
  }

  /**
   * Rellena la marca temporal de una venta **solo si estaba vacía**: `AND block_timestamp IS NULL`
   * hace la operación idempotente y garantiza que nunca se sobrescribe una fecha ya conocida.
   */
  async setSaleBlockTimestamp(
    txHash: string,
    logIndex: number,
    timestampSeconds: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE worker_sale_history
       SET block_timestamp = to_timestamp($3)
       WHERE tx_hash = $1 AND log_index = $2 AND block_timestamp IS NULL`,
      [txHash, logIndex, timestampSeconds],
    );
  }

  /**
   * Reset atómico del agregado ante un redeploy (MAJOR 3): vacía histórico e idempotencia y
   * devuelve los contadores a su base con `last_block = deploymentBlock`, todo en una única
   * transacción. El checkpoint de email (`worker_checkpoints`, por dirección) NO se toca: los
   * avisos ya entregados no se reenvían.
   */
  async reset(deploymentBlock: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM worker_sale_history");
      await client.query("DELETE FROM worker_processed_logs");
      await client.query(
        `UPDATE worker_aggregate_counters
         SET primary_volume_wei = 0, royalties_wei = 0, secondary_volume_wei = 0,
             sold_count = 0, minted_count = 0, burned_count = 0, last_block = $1
         WHERE id = 0`,
        [deploymentBlock],
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getBoundAddress(): Promise<string | null> {
    const { rows } = await this.pool.query<{ contract_address: string | null }>(
      "SELECT contract_address FROM worker_aggregate_counters WHERE id = 0",
    );
    return rows[0]?.contract_address ?? null;
  }

  async setBoundAddress(contractAddress: string): Promise<void> {
    await this.pool.query(
      "UPDATE worker_aggregate_counters SET contract_address = $1 WHERE id = 0",
      [contractAddress.toLowerCase()],
    );
  }

  /** El pool es compartido e inyectado: su cierre lo hace `main` (`closeDbPool`), no el store. */
  async close(): Promise<void> {
    // Intencionadamente vacío (el store no es propietario del pool).
  }
}

/** Contadores leídos con `FOR UPDATE`, ya convertidos a `bigint`/`number` para operar en JS. */
type LockedCounters = {
  readonly primaryVolumeWei: bigint;
  readonly royaltiesWei: bigint;
  readonly secondaryVolumeWei: bigint;
  readonly soldCount: number;
  readonly mintedCount: number;
  readonly burnedCount: number;
};

/** Fila cruda de `worker_aggregate_counters` (NUMERIC/BIGINT llegan como string en `pg`). */
type CountersRow = {
  readonly primary_volume_wei: string;
  readonly royalties_wei: string;
  readonly secondary_volume_wei: string;
  readonly sold_count: number;
  readonly minted_count: number;
  readonly burned_count: number;
  readonly last_block: string;
};

/** Fila cruda de `worker_sale_history`. */
type HistorySqlRow = {
  readonly token_id: string;
  readonly room: number;
  readonly date_yyyymmdd: number;
  readonly room_type: string;
  readonly price_wei: string;
  readonly sale_type_raw: number;
  readonly seller: string;
  readonly buyer: string;
  readonly block_number: string;
  readonly log_index: number;
  readonly tx_hash: string;
  /** Segundos UNIX del bloque, o `null` si la fila no tiene marca temporal. */
  readonly block_timestamp_epoch: string | null;
};

/** Fila cruda de la serie mensual (`SUM(NUMERIC)` y `COUNT` llegan como string en `pg`). */
type MonthlySqlRow = {
  readonly month: string;
  readonly primary_volume_wei: string;
  readonly secondary_volume_wei: string;
  readonly primary_sales: number;
  readonly secondary_sales: number;
};

/** Fila cruda del desglose por tipo de habitación. */
type RoomTypeSqlRow = {
  readonly room_type: string;
  readonly primary_volume_wei: string;
  readonly secondary_volume_wei: string;
  readonly primary_sales: number;
  readonly secondary_sales: number;
};

/** Fila cruda del ranking de más revendidas. */
type TopResoldSqlRow = {
  readonly token_id: string;
  readonly room: number;
  readonly date_yyyymmdd: number;
  readonly room_type: string;
  readonly resale_count: number;
  readonly resale_volume_wei: string;
};

/**
 * Lee la fila única de contadores y la bloquea hasta el `COMMIT`/`ROLLBACK` (`FOR UPDATE`), de
 * modo que la suma en `bigint` de dos transacciones concurrentes no pierda actualizaciones.
 */
async function lockCounters(client: PoolClient): Promise<LockedCounters> {
  const { rows } = await client.query<CountersRow>(
    `SELECT primary_volume_wei, royalties_wei, secondary_volume_wei,
            sold_count, minted_count, burned_count, last_block
     FROM worker_aggregate_counters
     WHERE id = 0
     FOR UPDATE`,
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      "falta la fila semilla id = 0 de worker_aggregate_counters: ¿se ejecutó runMigrations()?",
    );
  }
  return {
    primaryVolumeWei: BigInt(row.primary_volume_wei),
    royaltiesWei: BigInt(row.royalties_wei),
    secondaryVolumeWei: BigInt(row.secondary_volume_wei),
    soldCount: Number(row.sold_count),
    mintedCount: Number(row.minted_count),
    burnedCount: Number(row.burned_count),
  };
}

/** Muta los contadores/histórico según el tipo de evento (ya dentro de la transacción). */
async function mutate(
  client: PoolClient,
  event: ChainEvent,
  counters: LockedCounters,
): Promise<void> {
  switch (event.kind) {
    case "mint":
      await client.query(
        "UPDATE worker_aggregate_counters SET minted_count = $1 WHERE id = 0",
        [counters.mintedCount + 1],
      );
      return;
    case "burn":
      await client.query(
        "UPDATE worker_aggregate_counters SET burned_count = $1 WHERE id = 0",
        [counters.burnedCount + 1],
      );
      return;
    case "royaltyPaid":
      // Royalties solo de RoyaltyPaid (ventas secundarias): nunca de ventas primarias.
      await client.query(
        "UPDATE worker_aggregate_counters SET royalties_wei = $1 WHERE id = 0",
        [(counters.royaltiesWei + event.amountWei).toString()],
      );
      return;
    case "sale":
      await applySale(client, event, counters);
      return;
  }
}

/**
 * Aplica una venta: volumen primario/secundario en wei (sumado en `bigint` en JS, persistido ya
 * calculado como NUMERIC), `sold_count` solo para primarias y una fila de histórico.
 */
async function applySale(
  client: PoolClient,
  event: Extract<ChainEvent, { kind: "sale" }>,
  counters: LockedCounters,
): Promise<void> {
  const isPrimary = event.saleTypeRaw === 0;
  if (isPrimary) {
    await client.query(
      `UPDATE worker_aggregate_counters
       SET sold_count = $1, primary_volume_wei = $2
       WHERE id = 0`,
      [counters.soldCount + 1, (counters.primaryVolumeWei + event.priceWei).toString()],
    );
  } else {
    await client.query(
      "UPDATE worker_aggregate_counters SET secondary_volume_wei = $1 WHERE id = 0",
      [(counters.secondaryVolumeWei + event.priceWei).toString()],
    );
  }

  // El histórico deriva del evento `Sale` (no de `ownerOf`): una venta de un token luego
  // quemado SIGUE en el histórico. La marca temporal del bloque se persiste tal cual llega de la
  // cadena (`NULL` si la fuente no la aportó): es la que decide el mes en la serie de D-16.
  const { room, dateYYYYMMDD } = decodeTokenId(event.tokenId);
  await client.query(
    `INSERT INTO worker_sale_history (
       tx_hash, log_index, token_id, room, date_yyyymmdd, room_type,
       price_wei, sale_type_raw, seller, buyer, block_number, block_timestamp
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12))`,
    [
      event.txHash,
      event.logIndex,
      event.tokenId.toString(),
      room,
      dateYYYYMMDD,
      roomTypeOf(room) ?? "desconocido",
      event.priceWei.toString(),
      event.saleTypeRaw,
      event.seller,
      event.buyer,
      Number(event.blockNumber),
      event.blockTimestamp ?? null,
    ],
  );
}

/** Convierte la fila cruda de contadores al contrato de dominio (importes en `bigint`). */
function toCounters(row: CountersRow): AggregateCounters {
  return {
    primaryVolumeWei: BigInt(row.primary_volume_wei),
    royaltiesWei: BigInt(row.royalties_wei),
    secondaryVolumeWei: BigInt(row.secondary_volume_wei),
    soldCount: Number(row.sold_count),
    mintedCount: Number(row.minted_count),
    burnedCount: Number(row.burned_count),
    lastBlock: Number(row.last_block),
  };
}

/** Clave de idempotencia estable: `txHash:logIndex` (único por log on-chain). */
export function idempotencyKey(
  event: Pick<ChainEvent, "txHash" | "logIndex">,
): string {
  return `${event.txHash}:${event.logIndex}`;
}

/** ¿El error es una violación de PK/UNIQUE de PostgreSQL (clave ya aplicada)? */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/** `ROLLBACK` defensivo: nunca debe enmascarar el error original que provocó el aborto. */
async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // La transacción ya podía estar cerrada/abortada: se ignora para preservar el error original.
  }
}
