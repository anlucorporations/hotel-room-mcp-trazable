import { describe, expect, it } from "vitest";
import { AggregateProcessor } from "./aggregate-processor";
import { FakeChainSource, InMemoryAggregateStore } from "./test-fakes";
import type { ChainEvent } from "./types";

/**
 * Tests de agregados/histórico (FASE 3, CU-09/11, docs/SRS.md §9, ADR-09). Cubren TC-WK-010/011 (histórico) y
 * TC-WK-020/021/022 (dashboard).
 *
 * Usan el `AggregateStore` en memoria (misma semántica que el store PostgreSQL) y un
 * `FakeChainSource` para el catch-up: los tests del worker NO necesitan base de datos. El SQL, la
 * transacción atómica y la idempotencia por clave se verifican con mocks de `pg` en
 * `aggregate-store.test.ts` (D-09).
 */
const ETH = 1_000_000_000_000_000_000n; // 1 ETH en wei
const ADDR = (n: number): string => `0x${n.toString(16).padStart(40, "0")}`;

const newProcessor = (
  store: InMemoryAggregateStore,
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
  it("30 vendidas / 100 minteadas = 30%", async () => {
    const store = new InMemoryAggregateStore();
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
    await processor.apply(events);

    const aggregates = await processor.getAggregates();
    expect(aggregates.mintedCount).toBe(100);
    expect(aggregates.soldCount).toBe(30);
    expect(aggregates.occupancyRatioPercent).toBe(30);
  });

  it("div/0 (minteadas = 0) → 0% sin NaN", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    const aggregates = await processor.getAggregates();
    expect(aggregates.mintedCount).toBe(0);
    expect(aggregates.occupancyRatioPercent).toBe(0);
    expect(Number.isNaN(aggregates.occupancyRatioPercent)).toBe(false);
  });
});

describe("AggregateProcessor · royalties (TC-WK-021)", () => {
  it("royalties acumulados = Σ RoyaltyPaid; las primarias NO suman royalty", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    await processor.apply([
      // Venta primaria: NO genera royalty.
      sale({ saleTypeRaw: 0, priceWei: 5n * ETH, txHash: `0x${"01".repeat(32)}`, logIndex: 0 }),
      // Dos ventas secundarias con sus respectivos RoyaltyPaid.
      sale({ saleTypeRaw: 1, priceWei: 2n * ETH, txHash: `0x${"02".repeat(32)}`, logIndex: 1, blockNumber: 6n }),
      royalty({ amountWei: ETH / 10n, txHash: `0x${"03".repeat(32)}`, logIndex: 2, blockNumber: 6n }),
      sale({ saleTypeRaw: 1, priceWei: 3n * ETH, txHash: `0x${"04".repeat(32)}`, logIndex: 3, blockNumber: 7n }),
      royalty({ amountWei: (3n * ETH) / 20n, txHash: `0x${"05".repeat(32)}`, logIndex: 4, blockNumber: 7n }),
    ]);

    const aggregates = await processor.getAggregates();
    // Σ RoyaltyPaid = 0.1 ETH + 0.15 ETH = 0.25 ETH.
    expect(aggregates.royaltiesWei).toBe((ETH / 10n + (3n * ETH) / 20n).toString());
    // Volúmenes: primaria 5 ETH; secundario 2 + 3 = 5 ETH.
    expect(aggregates.primaryVolumeWei).toBe((5n * ETH).toString());
    expect(aggregates.secondaryVolumeWei).toBe((5n * ETH).toString());
    expect(aggregates.soldCount).toBe(1); // solo la primaria cuenta como noche vendida
  });

  it("importes grandes (> 2^63 wei) no pierden precisión", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);
    const big = 10n ** 30n; // muy por encima de 2^63

    await processor.apply([
      royalty({ amountWei: big, txHash: `0x${"aa".repeat(32)}`, logIndex: 0 }),
      royalty({ amountWei: big, txHash: `0x${"bb".repeat(32)}`, logIndex: 1 }),
    ]);

    expect((await processor.getAggregates()).royaltiesWei).toBe((big * 2n).toString());
  });
});

describe("AggregateProcessor · histórico con orden total (TC-WK-010)", () => {
  it("orden desc por bloque y, en empate, por logIndex desc; sin PII (solo wallets)", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    await processor.apply([
      sale({ txHash: `0x${"10".repeat(32)}`, logIndex: 0, blockNumber: 10n }),
      sale({ txHash: `0x${"11".repeat(32)}`, logIndex: 1, blockNumber: 10n }),
      sale({ txHash: `0x${"12".repeat(32)}`, logIndex: 5, blockNumber: 20n }),
      sale({ txHash: `0x${"13".repeat(32)}`, logIndex: 2, blockNumber: 20n }),
    ]);

    const history = await processor.getHistory();
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
        "blockTimestamp",
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
  });
});

describe("AggregateProcessor · agregados de D-16 (serie, desglose y ranking)", () => {
  const AUG = Math.floor(Date.parse("2026-08-15T10:00:00Z") / 1000);

  it("compone el resumen del histórico con la zona del hotel declarada en el payload", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    await processor.apply([
      // 101 (simple) primaria + reventa; 201 (suite) primaria, en el mismo bloque.
      sale({ tokenId: 10_120_260_815n, saleTypeRaw: 0, priceWei: 3n * ETH, blockTimestamp: AUG, txHash: `0x${"21".repeat(32)}`, logIndex: 0 }),
      sale({ tokenId: 10_120_260_815n, saleTypeRaw: 1, priceWei: ETH, blockTimestamp: AUG, txHash: `0x${"22".repeat(32)}`, logIndex: 1 }),
      sale({ tokenId: 20_120_260_901n, saleTypeRaw: 0, priceWei: 2n * ETH, blockTimestamp: AUG, txHash: `0x${"23".repeat(32)}`, logIndex: 2 }),
    ]);

    const aggregates = await processor.getAggregates();

    expect(aggregates.timeZone).toBe("Europe/Madrid");
    expect(aggregates.monthlySeries).toEqual([
      {
        month: "2026-08",
        primaryVolumeWei: (5n * ETH).toString(),
        secondaryVolumeWei: ETH.toString(),
        primarySales: 2,
        secondarySales: 1,
      },
    ]);
    expect(aggregates.roomTypeBreakdown.map((entry) => entry.roomType)).toEqual([
      "simple",
      "suite",
    ]);
    expect(aggregates.topResold).toEqual([
      {
        tokenId: "10120260815",
        room: 101,
        dateYYYYMMDD: 20_260_815,
        roomType: "simple",
        resaleCount: 1,
        resaleVolumeWei: ETH.toString(),
      },
    ]);
    // Todas las ventas traían marca temporal de bloque: nada queda fuera de la serie.
    expect(aggregates.undatedSalesCount).toBe(0);
  });

  it("un evento sin marca temporal no inventa mes: se declara como venta no datada", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    await processor.apply([
      sale({ saleTypeRaw: 0, priceWei: ETH, txHash: `0x${"31".repeat(32)}`, logIndex: 0 }),
    ]);

    const aggregates = await processor.getAggregates();
    expect(aggregates.monthlySeries).toEqual([]);
    expect(aggregates.undatedSalesCount).toBe(1);
  });

  it("el tope del ranking y la zona horaria son configurables (por defecto: Europe/Madrid)", async () => {
    const store = new InMemoryAggregateStore();
    const processor = new AggregateProcessor({
      chainSource: new FakeChainSource(0n),
      store,
      deploymentBlock: 0,
      timeZone: "UTC",
      topResoldLimit: 1,
    });

    await processor.apply([
      sale({ tokenId: 10_120_260_815n, saleTypeRaw: 1, priceWei: 2n * ETH, blockTimestamp: AUG, txHash: `0x${"41".repeat(32)}`, logIndex: 0 }),
      sale({ tokenId: 10_120_260_816n, saleTypeRaw: 1, priceWei: ETH, blockTimestamp: AUG, txHash: `0x${"42".repeat(32)}`, logIndex: 1 }),
      sale({ tokenId: 10_120_260_817n, saleTypeRaw: 1, priceWei: 5n * ETH, blockTimestamp: AUG, txHash: `0x${"43".repeat(32)}`, logIndex: 2 }),
    ]);

    const aggregates = await processor.getAggregates();
    expect(aggregates.timeZone).toBe("UTC");
    expect(aggregates.topResold).toHaveLength(1);
    // Con el mismo nº de reventas (1), manda el volumen: 5 ETH > 2 ETH > 1 ETH.
    expect(aggregates.topResold[0]?.tokenId).toBe("10120260817");
  });
});

describe("AggregateProcessor · relleno de fechas del histórico anterior a M7 (H6)", () => {
  it("recupera la fecha de cada bloque y deja de declarar ventas sin fecha", async () => {
    const store = new InMemoryAggregateStore();
    const chain = new FakeChainSource(0n);
    const processor = new AggregateProcessor({ chainSource: chain, store, deploymentBlock: 0 });

    // Dos ventas antiguas (insertadas antes de que existiera la columna): sin marca temporal.
    await processor.apply([
      sale({ txHash: `0x${"51".repeat(32)}`, logIndex: 0, blockNumber: 10n }),
      sale({ txHash: `0x${"52".repeat(32)}`, logIndex: 1, blockNumber: 12n }),
    ]);
    expect((await processor.getAggregates()).undatedSalesCount).toBe(2);
    expect((await processor.getAggregates()).monthlySeries).toEqual([]);

    const result = await processor.backfillTimestamps();

    expect(result).toEqual({ backfilled: 2, remaining: 0 });
    const after = await processor.getAggregates();
    expect(after.undatedSalesCount).toBe(0);
    // La fecha es la del bloque (el fake devuelve `1_700_000_000 + bloque`), y la serie mensual ya
    // cuenta esas ventas.
    const history = await processor.getHistory();
    expect(history.map((entry) => entry.blockTimestamp).sort()).toEqual([
      1_700_000_010, 1_700_000_012,
    ]);
    expect(after.monthlySeries).toHaveLength(1);
  });

  it("no sobrescribe una fecha ya conocida y no hace trabajo si no hay filas sin fecha", async () => {
    const store = new InMemoryAggregateStore();
    const processor = new AggregateProcessor({
      chainSource: new FakeChainSource(0n),
      store,
      deploymentBlock: 0,
    });

    await processor.apply([
      sale({ txHash: `0x${"61".repeat(32)}`, logIndex: 0, blockNumber: 10n, blockTimestamp: 1_600_000_000 }),
    ]);

    expect(await processor.backfillTimestamps()).toEqual({ backfilled: 0, remaining: 0 });
    expect((await processor.getHistory())[0]?.blockTimestamp).toBe(1_600_000_000);
  });

  it("si la cabecera de un bloque no se puede leer, la fila sigue declarada (no se inventa fecha)", async () => {
    const store = new InMemoryAggregateStore();
    const chain = new FakeChainSource(0n);
    const processor = new AggregateProcessor({ chainSource: chain, store, deploymentBlock: 0 });

    await processor.apply([sale({ txHash: `0x${"71".repeat(32)}`, logIndex: 0, blockNumber: 10n })]);
    chain.failBlockTimestamp = true;

    expect(await processor.backfillTimestamps()).toEqual({ backfilled: 0, remaining: 1 });
    expect((await processor.getAggregates()).undatedSalesCount).toBe(1);
  });
});

describe("AggregateProcessor · token quemado tras venta (TC-WK-011)", () => {
  it("una venta de un token luego quemado SIGUE en el histórico (deriva de eventos)", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);

    await processor.apply([
      mint({ tokenId: 10_220_260_615n, txHash: `0x${"21".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ tokenId: 10_220_260_615n, txHash: `0x${"22".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      burn({ tokenId: 10_220_260_615n, txHash: `0x${"23".repeat(32)}`, logIndex: 0, blockNumber: 9n }),
    ]);

    const history = await processor.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.tokenId).toBe("10220260615");

    const aggregates = await processor.getAggregates();
    expect(aggregates.burnedCount).toBe(1);
    expect(aggregates.soldCount).toBe(1);
  });
});

describe("AggregateProcessor · idempotencia (TC-WK-022)", () => {
  it("reprocesar los mismos eventos no duplica contadores ni filas de histórico", async () => {
    const store = new InMemoryAggregateStore();
    const processor = newProcessor(store);
    const batch: ChainEvent[] = [
      mint({ txHash: `0x${"31".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ saleTypeRaw: 0, txHash: `0x${"32".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      sale({ saleTypeRaw: 1, txHash: `0x${"33".repeat(32)}`, logIndex: 1, blockNumber: 4n }),
      royalty({ txHash: `0x${"34".repeat(32)}`, logIndex: 2, blockNumber: 4n }),
      burn({ txHash: `0x${"35".repeat(32)}`, logIndex: 0, blockNumber: 5n }),
    ];

    const firstApplied = await processor.apply(batch);
    expect(firstApplied).toBe(5);

    const after1 = await processor.getAggregates();
    const history1 = await processor.getHistory();

    // Reproceso del MISMO lote: 0 contabilizados de nuevo, estado idéntico.
    const secondApplied = await processor.apply(batch);
    expect(secondApplied).toBe(0);

    const after2 = await processor.getAggregates();
    expect(after2).toEqual(after1);
    expect(await processor.getHistory()).toEqual(history1);
    expect(after2.mintedCount).toBe(1);
    expect(after2.soldCount).toBe(1);
    expect(after2.burnedCount).toBe(1);
    expect(await processor.getHistory()).toHaveLength(2); // dos ventas
  });

  it("idempotencia tras reinicio (mismo estado persistido, nuevo store/proceso) vía catch-up", async () => {
    const events: ChainEvent[] = [
      mint({ txHash: `0x${"41".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      sale({ saleTypeRaw: 0, txHash: `0x${"42".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
    ];

    // Primer arranque: catch-up hasta el bloque 5.
    const store1 = new InMemoryAggregateStore();
    const chain1 = new FakeChainSource(5n, [], events);
    await new AggregateProcessor({ chainSource: chain1, store: store1, deploymentBlock: 0 }).catchUp(5n);
    expect((await store1.getCounters()).mintedCount).toBe(1);
    expect((await store1.getCounters()).soldCount).toBe(1);

    // Reinicio: mismo estado persistido, nuevo store; reprocesa el rango sin duplicar.
    const store2 = new InMemoryAggregateStore(store1.snapshot());
    const chain2 = new FakeChainSource(5n, [], events);
    const processor2 = new AggregateProcessor({ chainSource: chain2, store: store2, deploymentBlock: 0 });
    await processor2.catchUp(5n);
    const aggregates = await processor2.getAggregates();
    expect(aggregates.mintedCount).toBe(1);
    expect(aggregates.soldCount).toBe(1);
    expect(await processor2.getHistory()).toHaveLength(1);
  });
});

describe("AggregateStore · reset por redeploy (MAJOR 3)", () => {
  it("trunca contadores, histórico e idempotencia y fija last_block=deploymentBlock", async () => {
    const store = new InMemoryAggregateStore();
    await store.setBoundAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    await new AggregateProcessor({
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
    await store.setLastBlock(40);

    // Hay estado acumulado antes del reset.
    expect((await store.getCounters()).mintedCount).toBe(1);
    expect(await store.getHistory()).toHaveLength(2);

    await store.reset(100);

    const counters = await store.getCounters();
    expect(counters).toMatchObject({
      primaryVolumeWei: 0n,
      royaltiesWei: 0n,
      secondaryVolumeWei: 0n,
      soldCount: 0,
      mintedCount: 0,
      burnedCount: 0,
      lastBlock: 100, // = deploymentBlock pasado a reset
    });
    expect(await store.getHistory()).toHaveLength(0);

    // La idempotencia queda vacía: reaplicar un evento ya contabilizado vuelve a contar (true).
    expect(
      await store.applyEvent(
        sale({ saleTypeRaw: 0, txHash: `0x${"52".repeat(32)}`, logIndex: 0, blockNumber: 3n }),
      ),
    ).toBe(true);
    expect((await store.getCounters()).soldCount).toBe(1);
  });

  it("persiste y devuelve la dirección vinculada (en minúsculas)", async () => {
    const store = new InMemoryAggregateStore();
    expect(await store.getBoundAddress()).toBeNull();
    await store.setBoundAddress("0xE7F1725E7734CE288F8367E1BB143E90BB3F0512");
    expect(await store.getBoundAddress()).toBe(
      "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    );
  });

  it("el reset sobrevive a un reinicio (estado persistido, nuevo store)", async () => {
    const store1 = new InMemoryAggregateStore();
    await new AggregateProcessor({
      chainSource: new FakeChainSource(0n),
      store: store1,
      deploymentBlock: 0,
    }).apply([sale({ saleTypeRaw: 0, txHash: `0x${"61".repeat(32)}`, logIndex: 0 })]);
    await store1.reset(7);

    const store2 = new InMemoryAggregateStore(store1.snapshot());
    expect((await store2.getCounters()).soldCount).toBe(0);
    expect((await store2.getCounters()).lastBlock).toBe(7);
    expect(await store2.getHistory()).toHaveLength(0);
  });
});

/** Rellena un índice a 2 dígitos hex para construir txHash únicos en los tests. */
const pad = (n: number): string => n.toString(16).padStart(2, "0");
