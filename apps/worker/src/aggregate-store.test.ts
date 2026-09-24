import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgAggregateStore, idempotencyKey } from "./aggregate-store";
import type { ChainEvent } from "./types";

/**
 * Tests de `PgAggregateStore` (D-09) con un `Pool`/`PoolClient` de `pg` **mockeados**: verifican
 * el SQL, la transacción atómica y la idempotencia sin necesitar una base de datos real (en CI no
 * hay PostgreSQL), igual que los tests de repositorios de `@hotel/shared`.
 *
 * La semántica de negocio (contadores, ratio, histórico) se cubre en `aggregate-processor.test.ts`
 * con el store en memoria; aquí se cubre la persistencia real.
 */
const ETH = 1_000_000_000_000_000_000n;
const ADDR = (n: number): string => `0x${n.toString(16).padStart(40, "0")}`;

/** Fila cruda de `worker_aggregate_counters` (NUMERIC/BIGINT llegan como string en `pg`). */
type CountersRowLike = {
  primary_volume_wei: string;
  royalties_wei: string;
  secondary_volume_wei: string;
  sold_count: number;
  minted_count: number;
  burned_count: number;
  last_block: string;
};

const countersRow = (
  overrides: Partial<CountersRowLike> = {},
): CountersRowLike => ({
  primary_volume_wei: ETH.toString(),
  royalties_wei: "0",
  secondary_volume_wei: "0",
  sold_count: 1,
  minted_count: 0,
  burned_count: 0,
  last_block: "10",
  ...overrides,
});

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const setup = (lockedRow: CountersRowLike | null = countersRow()) => {
  const client: MockClient = { query: vi.fn(), release: vi.fn() };
  client.query.mockImplementation(async (sql: unknown) =>
    typeof sql === "string" && sql.includes("FOR UPDATE")
      ? { rows: lockedRow === null ? [] : [lockedRow] }
      : { rows: [] },
  );
  const pool = {
    query: vi.fn(async () => ({ rows: [] })),
    connect: vi.fn(async () => client),
  };
  const store = new PgAggregateStore(pool as unknown as Pool);
  /** SQL normalizado de cada sentencia ejecutada por el cliente de la transacción. */
  const sqls = (): string[] =>
    client.query.mock.calls.map((call) =>
      String(call[0]).replace(/\s+/g, " ").trim(),
    );
  /** Parámetros de la primera sentencia cuyo SQL contiene `fragment`. */
  const paramsOf = (fragment: string): unknown[] => {
    const call = client.query.mock.calls.find((c) =>
      String(c[0]).includes(fragment),
    );
    return (call?.[1] as unknown[]) ?? [];
  };
  return { store, pool, client, sqls, paramsOf };
};

const sale = (
  overrides: Partial<Extract<ChainEvent, { kind: "sale" }>> = {},
): ChainEvent => ({
  kind: "sale",
  tokenId: 10_220_260_615n,
  seller: ADDR(1),
  buyer: ADDR(2),
  priceWei: 5n * ETH,
  saleTypeRaw: 0,
  txHash: `0x${"a1".repeat(32)}`,
  logIndex: 3,
  blockNumber: 42n,
  ...overrides,
});

const royalty = (
  overrides: Partial<Extract<ChainEvent, { kind: "royaltyPaid" }>> = {},
): ChainEvent => ({
  kind: "royaltyPaid",
  tokenId: 10_220_260_615n,
  receiver: ADDR(9),
  amountWei: ETH / 10n,
  txHash: `0x${"b2".repeat(32)}`,
  logIndex: 0,
  blockNumber: 43n,
  ...overrides,
});

describe("PgAggregateStore · atomicidad y orden de la transacción (D-09)", () => {
  it("aplica una venta primaria en una única transacción con cliente dedicado", async () => {
    const { store, pool, client, sqls, paramsOf } = setup();

    await expect(store.applyEvent(sale())).resolves.toBe(true);

    // Un cliente dedicado del pool (no el pool directo) y BEGIN/COMMIT alrededor de todo.
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(sqls()[0]).toBe("BEGIN");
    expect(sqls().at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);

    // Orden: marca de idempotencia → bloqueo de la fila → mutación → histórico.
    expect(sqls()[1]).toContain("INSERT INTO worker_processed_logs");
    expect(sqls()[2]).toContain("FOR UPDATE");
    // La fila única se bloquea para que la suma en `bigint` no pierda actualizaciones.
    expect(sqls()[2]).toContain("worker_aggregate_counters");
    expect(sqls()[3]).toContain("UPDATE worker_aggregate_counters");
    expect(sqls()[4]).toContain("INSERT INTO worker_sale_history");

    // Suma en `bigint` (JS) y persistida ya calculada: 1 ETH + 5 ETH, sold_count 1 + 1.
    expect(paramsOf("UPDATE worker_aggregate_counters")).toEqual([
      2,
      (6n * ETH).toString(),
    ]);

    // Metadatos del log procesado (clave, bloque y contrato tomado de la fila de contadores).
    expect(sqls()[1]).toContain(
      "SELECT contract_address FROM worker_aggregate_counters",
    );
    expect(paramsOf("INSERT INTO worker_processed_logs")).toEqual([
      idempotencyKey(sale()),
      42,
    ]);

    // Histórico derivado del evento (room/fecha del tokenId, sin PII). La marca temporal del
    // bloque se persiste con `to_timestamp($12)`: `null` cuando la fuente no la aportó.
    expect(paramsOf("INSERT INTO worker_sale_history")).toEqual([
      sale().txHash,
      3,
      "10220260615",
      102,
      20_260_615,
      "simple",
      (5n * ETH).toString(),
      0,
      ADDR(1),
      ADDR(2),
      42,
      null,
    ]);
    expect(sqls()[4]).toContain("to_timestamp($12)");
  });

  it("venta secundaria: suma volumen secundario (no incrementa sold_count)", async () => {
    const { store, sqls, paramsOf } = setup(
      countersRow({ secondary_volume_wei: (2n * ETH).toString() }),
    );

    await store.applyEvent(sale({ saleTypeRaw: 1, priceWei: 3n * ETH }));

    const update = sqls().find((sql) =>
      sql.includes("UPDATE worker_aggregate_counters"),
    );
    expect(update).toContain("secondary_volume_wei");
    expect(update).not.toContain("sold_count");
    expect(paramsOf("UPDATE worker_aggregate_counters")).toEqual([
      (5n * ETH).toString(),
    ]);
  });

  it("royaltyPaid: los royalties se acumulan sumando en bigint (nunca de ventas primarias)", async () => {
    const { store, paramsOf } = setup(
      countersRow({ royalties_wei: (ETH / 4n).toString() }),
    );

    await store.applyEvent(royalty({ amountWei: ETH / 10n }));

    expect(paramsOf("UPDATE worker_aggregate_counters")).toEqual([
      (ETH / 4n + ETH / 10n).toString(),
    ]);
  });

  it("mint y burn: incrementan sus contadores", async () => {
    const mint = setup(countersRow({ minted_count: 7 }));
    await mint.store.applyEvent({
      kind: "mint",
      tokenId: 1n,
      room: 1,
      dateYYYYMMDD: 20_260_101,
      roomType: "simple",
      priceWei: ETH,
      txHash: `0x${"c3".repeat(32)}`,
      logIndex: 0,
      blockNumber: 1n,
    });
    expect(mint.paramsOf("UPDATE worker_aggregate_counters")).toEqual([8]);

    const burn = setup(countersRow({ burned_count: 2 }));
    await burn.store.applyEvent({
      kind: "burn",
      tokenId: 1n,
      txHash: `0x${"d4".repeat(32)}`,
      logIndex: 0,
      blockNumber: 1n,
    });
    expect(burn.paramsOf("UPDATE worker_aggregate_counters")).toEqual([3]);
  });
});

describe("PgAggregateStore · idempotencia (23505 ⇒ false sin mutar nada)", () => {
  it("clave duplicada: ROLLBACK, sin COMMIT y devuelve false", async () => {
    const { store, client, sqls } = setup();
    client.query.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("INSERT INTO worker_processed_logs")) {
        throw Object.assign(new Error("duplicate key value"), { code: "23505" });
      }
      return { rows: [] };
    });

    await expect(store.applyEvent(sale())).resolves.toBe(false);

    expect(sqls()).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO worker_processed_logs"),
      "ROLLBACK",
    ]);
    expect(sqls()).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("un error NO de idempotencia se propaga tras ROLLBACK (no se traga)", async () => {
    const { store, client, sqls } = setup();
    const boom = Object.assign(new Error("conexión perdida"), { code: "08006" });
    client.query.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("INSERT INTO worker_sale_history")) {
        throw boom;
      }
      if (String(sql).includes("FOR UPDATE")) {
        return { rows: [countersRow()] };
      }
      return { rows: [] };
    });

    await expect(store.applyEvent(sale())).rejects.toThrow("conexión perdida");
    expect(sqls().at(-1)).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("sin fila semilla: error claro que apunta a runMigrations", async () => {
    const { store } = setup(null);

    await expect(store.applyEvent(sale())).rejects.toThrow(/runMigrations/);
  });
});

describe("PgAggregateStore · lectura de contadores e histórico", () => {
  it("getCounters: NUMERIC/BIGINT → bigint sin pérdida de precisión (> 2^63)", async () => {
    const big = 10n ** 30n;
    const { store, pool } = setup();
    pool.query.mockResolvedValueOnce({
      rows: [
        countersRow({
          primary_volume_wei: big.toString(),
          royalties_wei: (big + 1n).toString(),
          secondary_volume_wei: "0",
          last_block: "9999999999",
        }),
      ],
    });

    const counters = await store.getCounters();
    expect(counters.primaryVolumeWei).toBe(big);
    expect(counters.royaltiesWei).toBe(big + 1n);
    expect(counters.soldCount).toBe(1);
    expect(counters.lastBlock).toBe(9_999_999_999);
  });

  it("getCounters: falla en cerrado si falta la fila semilla", async () => {
    const { store, pool } = setup();
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(store.getCounters()).rejects.toThrow(/runMigrations/);
  });

  it("getHistory: mapea columnas crudas al dominio (importes en bigint)", async () => {
    const { store, pool } = setup();
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          token_id: "10220260615",
          room: 102,
          date_yyyymmdd: 20_260_615,
          room_type: "simple",
          price_wei: "1000000000000000000",
          sale_type_raw: 0,
          seller: ADDR(1),
          buyer: ADDR(2),
          block_number: "42",
          log_index: 3,
          tx_hash: `0x${"a1".repeat(32)}`,
          block_timestamp_epoch: "1780000000",
        },
        {
          token_id: "10220260616",
          room: 102,
          date_yyyymmdd: 20_260_616,
          room_type: "simple",
          price_wei: "1",
          sale_type_raw: 1,
          seller: ADDR(2),
          buyer: ADDR(3),
          block_number: "43",
          log_index: 0,
          tx_hash: `0x${"a2".repeat(32)}`,
          // Fila anterior a la migración de M7: sin marca temporal (no se inventa una fecha).
          block_timestamp_epoch: null,
        },
      ],
    });

    const history = await store.getHistory();
    expect(pool.query.mock.calls[0]?.[0]).toContain("EXTRACT(EPOCH FROM block_timestamp)");
    expect(history).toEqual([
      {
        tokenId: 10_220_260_615n,
        room: 102,
        dateYYYYMMDD: 20_260_615,
        roomType: "simple",
        priceWei: ETH,
        saleTypeRaw: 0,
        seller: ADDR(1),
        buyer: ADDR(2),
        blockNumber: 42,
        logIndex: 3,
        txHash: `0x${"a1".repeat(32)}`,
        blockTimestamp: 1_780_000_000,
      },
      {
        tokenId: 10_220_260_616n,
        room: 102,
        dateYYYYMMDD: 20_260_616,
        roomType: "simple",
        priceWei: 1n,
        saleTypeRaw: 1,
        seller: ADDR(2),
        buyer: ADDR(3),
        blockNumber: 43,
        logIndex: 0,
        txHash: `0x${"a2".repeat(32)}`,
        blockTimestamp: null,
      },
    ]);
  });

  it("setLastBlock / vínculo de contrato: SQL y normalización a minúsculas", async () => {
    const { store, pool } = setup();

    await store.setLastBlock(50);
    await store.setBoundAddress("0xE7F1725E7734CE288F8367E1BB143E90BB3F0512");

    expect(pool.query.mock.calls[0]?.[0]).toContain("SET last_block = $1");
    expect(pool.query.mock.calls[0]?.[1]).toEqual([50]);
    expect(pool.query.mock.calls[1]?.[0]).toContain("SET contract_address = $1");
    expect(pool.query.mock.calls[1]?.[1]).toEqual([
      "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    ]);
  });

  it("getBoundAddress: null sin vínculo previo", async () => {
    const { store, pool } = setup();
    pool.query.mockResolvedValueOnce({ rows: [{ contract_address: null }] });

    await expect(store.getBoundAddress()).resolves.toBeNull();
  });
});

describe("PgAggregateStore · agregados de D-16 calculados en PostgreSQL", () => {
  /**
   * Mock por contenido de SQL (enrutamos por el fragmento característico de cada consulta, no por
   * orden de llamada). Las cuatro consultas van dentro de UNA transacción `REPEATABLE READ` con
   * cliente dedicado, así que el mock se instala en el cliente, no en el pool.
   */
  const summaryPool = (overrides: Record<string, unknown[]> = {}) => {
    const { store, client, sqls } = setup();
    client.query.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.startsWith("BEGIN") || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
      if (text.includes("date_trunc('month'")) return { rows: overrides.months ?? [] };
      if (text.includes("GROUP BY room_type")) return { rows: overrides.types ?? [] };
      if (text.includes("GROUP BY token_id")) return { rows: overrides.resold ?? [] };
      if (text.includes("block_timestamp IS NULL")) return { rows: overrides.undated ?? [] };
      return { rows: [] };
    });
    return { store, client, sqls };
  };

  it("compone la serie, el desglose y el ranking; la zona del hotel viaja como parámetro", async () => {
    const { store, client, sqls } = summaryPool({
      months: [
        {
          month: "2026-08",
          primary_volume_wei: "110",
          secondary_volume_wei: "150",
          primary_sales: 2,
          secondary_sales: 1,
        },
      ],
      // A propósito desordenados y con un tipo fuera del maestro: el orden canónico lo fija el
      // store (no la base) y `desconocido` no se descarta.
      types: [
        {
          room_type: "suite",
          primary_volume_wei: "100",
          secondary_volume_wei: "0",
          primary_sales: 1,
          secondary_sales: 0,
        },
        {
          room_type: "desconocido",
          primary_volume_wei: "1",
          secondary_volume_wei: "2",
          primary_sales: 1,
          secondary_sales: 1,
        },
        {
          room_type: "simple",
          primary_volume_wei: "50",
          secondary_volume_wei: "70",
          primary_sales: 1,
          secondary_sales: 1,
        },
      ],
      resold: [
        {
          token_id: "9",
          room: 102,
          date_yyyymmdd: 20_260_815,
          room_type: "simple",
          resale_count: 2,
          resale_volume_wei: "180",
        },
      ],
      undated: [{ undated: 3 }],
    });

    const summary = await store.getHistorySummary("Europe/Madrid", 10);

    expect(summary.monthlySeries).toEqual([
      {
        month: "2026-08",
        primaryVolumeWei: "110",
        secondaryVolumeWei: "150",
        primarySales: 2,
        secondarySales: 1,
      },
    ]);
    expect(summary.roomTypeBreakdown.map((entry) => entry.roomType)).toEqual([
      "simple",
      "suite",
      "desconocido",
    ]);
    expect(summary.roomTypeBreakdown[1]).toEqual({
      roomType: "suite",
      primarySales: 1,
      secondarySales: 0,
      primaryVolumeWei: "100",
      secondaryVolumeWei: "0",
      totalVolumeWei: "100",
    });
    // El total se calcula sumando en bigint (no se confía en un tercer SUM).
    expect(summary.roomTypeBreakdown[2]?.totalVolumeWei).toBe("3");
    expect(summary.topResold).toEqual([
      {
        tokenId: "9",
        room: 102,
        dateYYYYMMDD: 20_260_815,
        roomType: "simple",
        resaleCount: 2,
        resaleVolumeWei: "180",
      },
    ]);
    expect(summary.undatedSalesCount).toBe(3);

    // La zona horaria NO se interpola en el SQL: viaja como parámetro ($1).
    const monthCall = client.query.mock.calls.find((call) =>
      String(call[0]).includes("date_trunc('month'"),
    );
    expect(monthCall?.[1]).toEqual(["Europe/Madrid"]);
    expect(String(monthCall?.[0])).toContain("AT TIME ZONE $1");

    // El tope del ranking también es un parámetro y el orden es total (desempate numérico).
    const topCall = client.query.mock.calls.find((call) =>
      String(call[0]).includes("GROUP BY token_id"),
    );
    expect(topCall?.[1]).toEqual([10]);
    expect(String(topCall?.[0])).toContain("token_id::NUMERIC ASC");

    // Instantánea coherente: las cuatro lecturas van en UNA transacción REPEATABLE READ.
    expect(sqls()[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ");
    expect(sqls().at(-1)).toBe("COMMIT");
    expect(sqls().filter((sql) => sql.includes("FROM worker_sale_history"))).toHaveLength(4);
  });

  it("sin histórico: agregados vacíos y contador de no datadas a 0", async () => {
    const { store } = summaryPool();

    await expect(store.getHistorySummary("Europe/Madrid", 10)).resolves.toEqual({
      monthlySeries: [],
      roomTypeBreakdown: [],
      topResold: [],
      undatedSalesCount: 0,
    });
  });

  it("un fallo a mitad de la lectura hace ROLLBACK y propaga (no devuelve medias cifras)", async () => {
    const { store, client, sqls } = summaryPool();
    client.query.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("GROUP BY room_type")) throw new Error("conexión perdida");
      return { rows: [] };
    });

    await expect(store.getHistorySummary("Europe/Madrid", 10)).rejects.toThrow("conexión perdida");
    expect(sqls().at(-1)).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("PgAggregateStore · relleno de fechas del histórico (M7 · H6)", () => {
  it("getUndatedSales: solo filas sin fecha, por bloque, con tope", async () => {
    const { store, pool } = setup();
    pool.query.mockResolvedValueOnce({
      rows: [
        { tx_hash: `0x${"a1".repeat(32)}`, log_index: 0, block_number: "42" },
        { tx_hash: `0x${"a2".repeat(32)}`, log_index: 3, block_number: "43" },
      ],
    });

    const rows = await store.getUndatedSales(100);

    expect(rows).toEqual([
      { txHash: `0x${"a1".repeat(32)}`, logIndex: 0, blockNumber: 42 },
      { txHash: `0x${"a2".repeat(32)}`, logIndex: 3, blockNumber: 43 },
    ]);
    expect(pool.query.mock.calls[0]?.[0]).toContain("WHERE block_timestamp IS NULL");
    expect(pool.query.mock.calls[0]?.[0]).toContain("ORDER BY block_number ASC, log_index ASC");
    expect(pool.query.mock.calls[0]?.[1]).toEqual([100]);
  });

  it("setSaleBlockTimestamp: solo rellena si estaba vacía (no sobrescribe) y usa to_timestamp", async () => {
    const { store, pool } = setup();

    await store.setSaleBlockTimestamp(`0x${"a1".repeat(32)}`, 0, 1_780_000_000);

    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET block_timestamp = to_timestamp($3)");
    expect(sql).toContain("AND block_timestamp IS NULL");
    expect(params).toEqual([`0x${"a1".repeat(32)}`, 0, 1_780_000_000]);
  });
});

describe("PgAggregateStore · reset por redeploy (MAJOR 3)", () => {
  it("trunca contadores, histórico e idempotencia en una transacción", async () => {
    const { store, pool, client, sqls } = setup();

    await store.reset(25);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(sqls()[0]).toBe("BEGIN");
    expect(sqls()[1]).toContain("DELETE FROM worker_sale_history");
    expect(sqls()[2]).toContain("DELETE FROM worker_processed_logs");
    expect(sqls()[3]).toContain("UPDATE worker_aggregate_counters");
    expect(sqls()[3]).toContain("last_block = $1");
    expect(sqls().at(-1)).toBe("COMMIT");
    expect(client.query.mock.calls[3]?.[1]).toEqual([25]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("un fallo a mitad del reset hace ROLLBACK y propaga el error", async () => {
    const { store, client, sqls } = setup();
    client.query.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("DELETE FROM worker_sale_history")) {
        throw new Error("deadlock detected");
      }
      return { rows: [] };
    });

    await expect(store.reset(25)).rejects.toThrow("deadlock detected");
    expect(sqls().at(-1)).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("PgAggregateStore · cierre", () => {
  it("close() no cierra el pool compartido (lo hace su propietario)", async () => {
    const end = vi.fn();
    const pool = {
      query: vi.fn(),
      end,
    } as unknown as Pool;

    await new PgAggregateStore(pool).close();

    expect(end).not.toHaveBeenCalled();
  });
});
