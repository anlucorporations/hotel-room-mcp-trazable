import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteAggregateStore } from "./aggregate-store";
import { AggregateProcessor } from "./aggregate-processor";
import { FakeChainSource } from "./test-fakes";
import type { ChainEvent } from "./types";

/**
 * Tests de agregados/histórico (FASE 3, CU-09/11, ADR-09). Cubren TC-WK-010/011 (histórico) y
 * TC-WK-020/021/022 (dashboard). Usan el `AggregateStore` real de SQLite (fichero temporal) y
 * un `FakeChainSource` para el catch-up.
 */
const ETH = 1_000_000_000_000_000_000n; // 1 ETH en wei
const ADDR = (n: number): string => `0x${n.toString(16).padStart(40, "0")}`;

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "worker-agg-"));
  dbPath = join(tmpDir, "aggregates.sqlite");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const newProcessor = (
  store: SqliteAggregateStore,
  chainSource: FakeChainSource = new FakeChainSource(0n),
): AggregateProcessor =>
  new AggregateProcessor({ chainSource, store, deploymentBlock: 0 });

// ── Constructores de eventos para los tests ──────────────────────────────────
const mint = (overrides: Partial<Extract<ChainEvent, { kind: "mint" }>> = {}): ChainEvent => ({
  kind: "mint",
  tokenId: 10_220_260_615n,
  room: 102,
  dateYYYYMMDD: 20_260_615,
  roomType: "simple",
  priceWei: ETH,
  txHash: `0x${"a1".repeat(32)}`,
  logIndex: 0,
  blockNumber: 2n,
  ...overrides,
});

const sale = (overrides: Partial<Extract<ChainEvent, { kind: "sale" }>> = {}): ChainEvent => ({
  kind: "sale",
  tokenId: 10_220_260_615n,
  seller: ADDR(1),
  buyer: ADDR(2),
  priceWei: ETH,
  saleTypeRaw: 0,
  txHash: `0x${"b2".repeat(32)}`,
  logIndex: 0,
  blockNumber: 3n,
  ...overrides,
});

const royalty = (
  overrides: Partial<Extract<ChainEvent, { kind: "royaltyPaid" }>> = {},
): ChainEvent => ({
  kind: "royaltyPaid",
  tokenId: 10_220_260_615n,
  receiver: ADDR(9),
  amountWei: ETH / 10n,
  txHash: `0x${"c3".repeat(32)}`,
  logIndex: 0,
  blockNumber: 4n,
  ...overrides,
});

const burn = (overrides: Partial<Extract<ChainEvent, { kind: "burn" }>> = {}): ChainEvent => ({
  kind: "burn",
  tokenId: 10_220_260_615n,
  txHash: `0x${"d4".repeat(32)}`,
  logIndex: 0,
  blockNumber: 5n,
  ...overrides,
});

describe("AggregateProcessor · ratio de ocupación (TC-WK-020)", () => {
  it("30 vendidas / 100 minteadas = 30%", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);
    const events: ChainEvent[] = [];
    for (let i = 0; i < 100; i += 1) {
      events.push(
        mint({ tokenId: 10_000_000_000n + BigInt(i), txHash: `0x${"e5".repeat(31)}${pad(i)}`, logIndex: i }),
      );
    }
    for (let i = 0; i < 30; i += 1) {
      events.push(
        sale({
          tokenId: 10_000_000_000n + BigInt(i),
          saleTypeRaw: 0,
          txHash: `0x${"f6".repeat(31)}${pad(i)}`,
          logIndex: i,
          blockNumber: 3n,
        }),
      );
    }
    processor.apply(events);

    const aggregates = processor.getAggregates();
    expect(aggregates.mintedCount).toBe(100);
    expect(aggregates.soldCount).toBe(30);
    expect(aggregates.occupancyRatioPercent).toBe(30);
    store.close();
  });

  it("div/0 (minteadas = 0) → 0% sin NaN", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);

    const aggregates = processor.getAggregates();
    expect(aggregates.mintedCount).toBe(0);
    expect(aggregates.occupancyRatioPercent).toBe(0);
    expect(Number.isNaN(aggregates.occupancyRatioPercent)).toBe(false);
    store.close();
  });
});

describe("AggregateProcessor · royalties (TC-WK-021)", () => {
  it("royalties acumulados = Σ RoyaltyPaid; las primarias NO suman royalty", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);

    processor.apply([
      // Venta primaria: NO genera royalty.
      sale({ saleTypeRaw: 0, priceWei: 5n * ETH, txHash: `0x${"01".repeat(32)}`, logIndex: 0 }),
      // Dos ventas secundarias con sus respectivos RoyaltyPaid.
      sale({ saleTypeRaw: 1, priceWei: 2n * ETH, txHash: `0x${"02".repeat(32)}`, logIndex: 1, blockNumber: 6n }),
      royalty({ amountWei: ETH / 10n, txHash: `0x${"03".repeat(32)}`, logIndex: 2, blockNumber: 6n }),
      sale({ saleTypeRaw: 1, priceWei: 3n * ETH, txHash: `0x${"04".repeat(32)}`, logIndex: 3, blockNumber: 7n }),
      royalty({ amountWei: (3n * ETH) / 20n, txHash: `0x${"05".repeat(32)}`, logIndex: 4, blockNumber: 7n }),
    ]);

    const aggregates = processor.getAggregates();
    // Σ RoyaltyPaid = 0.1 ETH + 0.15 ETH = 0.25 ETH.
    expect(aggregates.royaltiesWei).toBe((ETH / 10n + (3n * ETH) / 20n).toString());
    // Volúmenes: primaria 5 ETH; secundario 2 + 3 = 5 ETH.
    expect(aggregates.primaryVolumeWei).toBe((5n * ETH).toString());
    expect(aggregates.secondaryVolumeWei).toBe((5n * ETH).toString());
    expect(aggregates.soldCount).toBe(1); // solo la primaria cuenta como noche vendida
    store.close();
  });

  it("importes grandes (> 2^63 wei) no pierden precisión", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);
    const big = 10n ** 30n; // muy por encima de 2^63

    processor.apply([
      royalty({ amountWei: big, txHash: `0x${"aa".repeat(32)}`, logIndex: 0 }),
      royalty({ amountWei: big, txHash: `0x${"bb".repeat(32)}`, logIndex: 1 }),
    ]);

    expect(processor.getAggregates().royaltiesWei).toBe((big * 2n).toString());
    store.close();
  });
});

describe("AggregateProcessor · histórico con orden total (TC-WK-010)", () => {
  it("orden desc por bloque y, en empate, por logIndex desc; sin PII (solo wallets)", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);

    processor.apply([
      sale({ txHash: `0x${"10".repeat(32)}`, logIndex: 0, blockNumber: 10n }),
      sale({ txHash: `0x${"11".repeat(32)}`, logIndex: 1, blockNumber: 10n }),
      sale({ txHash: `0x${"12".repeat(32)}`, logIndex: 5, blockNumber: 20n }),
      sale({ txHash: `0x${"13".repeat(32)}`, logIndex: 2, blockNumber: 20n }),
    ]);

    const history = processor.getHistory();
    expect(history.map((h) => [h.blockNumber, h.logIndex])).toEqual([
      [20, 5],
      [20, 2],
      [10, 1],
      [10, 0],
    ]);

    // Sin PII: solo wallets (seller/buyer) y datos derivados; sin nombres/emails.
    const entry = history[0];
    expect(entry?.seller).toBe(ADDR(1));
    expect(entry?.buyer).toBe(ADDR(2));
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("name");
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      [
        "blockNumber",
        "buyer",
        "dateYYYYMMDD",
        "logIndex",
        "priceWei",
        "room",
        "roomType",
        "saleType",
        "seller",
        "tokenId",
        "txHash",
      ].sort(),
    );
    store.close();
  });
});

describe("AggregateProcessor · token quemado tras venta (TC-WK-011)", () => {
  it("una venta de un token luego quemado SIGUE en el histórico (deriva de eventos)", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);

    processor.apply([
      mint({ tokenId: 10_220_260_615n, txHash: `0x${"21".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ tokenId: 10_220_260_615n, txHash: `0x${"22".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      burn({ tokenId: 10_220_260_615n, txHash: `0x${"23".repeat(32)}`, logIndex: 0, blockNumber: 9n }),
    ]);

    const history = processor.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.tokenId).toBe("10220260615");

    const aggregates = processor.getAggregates();
    expect(aggregates.burnedCount).toBe(1);
    expect(aggregates.soldCount).toBe(1);
    store.close();
  });
});

describe("AggregateProcessor · idempotencia (TC-WK-022)", () => {
  it("reprocesar los mismos eventos no duplica contadores ni filas de histórico", () => {
    const store = new SqliteAggregateStore(dbPath);
    const processor = newProcessor(store);
    const batch: ChainEvent[] = [
      mint({ txHash: `0x${"31".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ saleTypeRaw: 0, txHash: `0x${"32".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      sale({ saleTypeRaw: 1, txHash: `0x${"33".repeat(32)}`, logIndex: 1, blockNumber: 4n }),
      royalty({ txHash: `0x${"34".repeat(32)}`, logIndex: 2, blockNumber: 4n }),
      burn({ txHash: `0x${"35".repeat(32)}`, logIndex: 0, blockNumber: 5n }),
    ];

    const firstApplied = processor.apply(batch);
    expect(firstApplied).toBe(5);

    const after1 = processor.getAggregates();
    const history1 = processor.getHistory();

    // Reproceso del MISMO lote: 0 contabilizados de nuevo, estado idéntico.
    const secondApplied = processor.apply(batch);
    expect(secondApplied).toBe(0);

    const after2 = processor.getAggregates();
    expect(after2).toEqual(after1);
    expect(processor.getHistory()).toEqual(history1);
    expect(after2.mintedCount).toBe(1);
    expect(after2.soldCount).toBe(1);
    expect(after2.burnedCount).toBe(1);
    expect(processor.getHistory()).toHaveLength(2); // dos ventas
    store.close();
  });

  it("idempotencia tras reinicio (mismo fichero, nuevo store/proceso) vía catch-up", async () => {
    const events: ChainEvent[] = [
      mint({ txHash: `0x${"41".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ saleTypeRaw: 0, txHash: `0x${"42".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
    ];

    // Primer arranque: catch-up hasta el bloque 5.
    const store1 = new SqliteAggregateStore(dbPath);
    const chain1 = new FakeChainSource(5n, [], events);
    await new AggregateProcessor({ chainSource: chain1, store: store1, deploymentBlock: 0 }).catchUp(5n);
    expect(store1.getCounters().mintedCount).toBe(1);
    expect(store1.getCounters().soldCount).toBe(1);
    store1.close();

    // Reinicio: mismo fichero, nuevo store; reprocesa el mismo rango (catch-up desde 0) sin duplicar.
    const store2 = new SqliteAggregateStore(dbPath);
    const chain2 = new FakeChainSource(5n, [], events);
    const processor2 = new AggregateProcessor({ chainSource: chain2, store: store2, deploymentBlock: 0 });
    await processor2.catchUp(5n);
    const aggregates = processor2.getAggregates();
    expect(aggregates.mintedCount).toBe(1);
    expect(aggregates.soldCount).toBe(1);
    expect(processor2.getHistory()).toHaveLength(1);
    store2.close();
  });
});

describe("SqliteAggregateStore · reset por redeploy (MAJOR 3)", () => {
  it("trunca contadores, histórico e idempotencia y fija last_block=deploymentBlock", () => {
    const store = new SqliteAggregateStore(dbPath);
    store.setBoundAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    new AggregateProcessor({
      chainSource: new FakeChainSource(0n),
      store,
      deploymentBlock: 0,
    }).apply([
      mint({ txHash: `0x${"51".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ saleTypeRaw: 0, txHash: `0x${"52".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      sale({ saleTypeRaw: 1, txHash: `0x${"53".repeat(32)}`, logIndex: 1, blockNumber: 4n }),
      royalty({ txHash: `0x${"54".repeat(32)}`, logIndex: 2, blockNumber: 4n }),
      burn({ txHash: `0x${"55".repeat(32)}`, logIndex: 0, blockNumber: 5n }),
    ]);
    store.setLastBlock(40);

    // Hay estado acumulado antes del reset.
    expect(store.getCounters().mintedCount).toBe(1);
    expect(store.getHistory()).toHaveLength(2);

    store.reset(100);

    const counters = store.getCounters();
    expect(counters).toMatchObject({
      primaryVolumeWei: 0n,
      royaltiesWei: 0n,
      secondaryVolumeWei: 0n,
      soldCount: 0,
      mintedCount: 0,
      burnedCount: 0,
      lastBlock: 100, // = deploymentBlock pasado a reset
    });
    expect(store.getHistory()).toHaveLength(0);

    // `aggregate_applied` vacío: reaplicar un evento ya contabilizado vuelve a contar (true).
    expect(
      store.applyEvent(
        sale({ saleTypeRaw: 0, txHash: `0x${"52".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      ),
    ).toBe(true);
    expect(store.getCounters().soldCount).toBe(1);
    store.close();
  });

  it("persiste y devuelve la dirección vinculada (en minúsculas)", () => {
    const store = new SqliteAggregateStore(dbPath);
    expect(store.getBoundAddress()).toBeNull();
    store.setBoundAddress("0xE7F1725E7734CE288F8367E1BB143E90BB3F0512");
    expect(store.getBoundAddress()).toBe(
      "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    );
    store.close();
  });

  it("el reset sobrevive a un reinicio (mismo fichero, nuevo store)", () => {
    const store1 = new SqliteAggregateStore(dbPath);
    new AggregateProcessor({
      chainSource: new FakeChainSource(0n),
      store: store1,
      deploymentBlock: 0,
    }).apply([sale({ saleTypeRaw: 0, txHash: `0x${"61".repeat(32)}`, logIndex: 0 })]);
    store1.reset(7);
    store1.close();

    const store2 = new SqliteAggregateStore(dbPath);
    expect(store2.getCounters().soldCount).toBe(0);
    expect(store2.getCounters().lastBlock).toBe(7);
    expect(store2.getHistory()).toHaveLength(0);
    store2.close();
  });
});

/** Rellena un índice a 2 dígitos hex para construir txHash únicos en los tests. */
const pad = (n: number): string => n.toString(16).padStart(2, "0");
