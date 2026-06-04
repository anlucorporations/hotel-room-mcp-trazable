import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GETLOGS_MAX_RANGE } from "@hotel/shared";
import { SqliteCheckpointStore } from "./checkpoint-store";
import {
  buildNotification,
  idempotencyKey,
  SaleProcessor,
} from "./sale-processor";
import {
  AlwaysFailingMailer,
  FakeChainSource,
  FakeMailer,
  makeSaleEvent,
  noSleep,
  silentLogger,
} from "./test-fakes";
import type { SaleEvent } from "./types";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "worker-test-"));
  dbPath = join(tmpDir, "checkpoint.sqlite");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const newProcessor = (
  store: SqliteCheckpointStore,
  chainSource: FakeChainSource,
  mailer: FakeMailer | AlwaysFailingMailer,
  opts: {
    deploymentBlock?: number;
    retries?: number;
    onDegraded?: () => void;
    onRecovered?: () => void;
  } = {},
): SaleProcessor =>
  new SaleProcessor({
    chainSource,
    mailer,
    store,
    logger: silentLogger(),
    contractAddress: CONTRACT,
    deploymentBlock: opts.deploymentBlock ?? 0,
    backoff: { retries: opts.retries ?? 2, baseDelayMs: 1, maxDelayMs: 1 },
    health: {
      onEmailDegraded: opts.onDegraded,
      onEmailRecovered: opts.onRecovered,
    },
    sleep: noSleep,
  });

describe("SaleProcessor · idempotencia (TC-WK-001)", () => {
  it("procesar el mismo Sale dos veces → un solo email", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const mailer = new FakeMailer();
    const processor = newProcessor(store, new FakeChainSource(10n), mailer);
    const event = makeSaleEvent();

    await processor.processSale(event);
    await processor.processSale(event);

    expect(mailer.sent).toHaveLength(1);
    store.close();
  });

  it("reinicio (nuevo SaleProcessor, mismo store) con los mismos logs → 0 emails nuevos", async () => {
    const event = makeSaleEvent();

    const store1 = new SqliteCheckpointStore(dbPath);
    const mailer1 = new FakeMailer();
    await newProcessor(store1, new FakeChainSource(10n, [event]), mailer1).catchUp(
      10n,
    );
    expect(mailer1.sent).toHaveLength(1);
    store1.close();

    // Reinicio: mismo fichero, nuevo store y procesador, mismos logs.
    const store2 = new SqliteCheckpointStore(dbPath);
    const mailer2 = new FakeMailer();
    const chain = new FakeChainSource(10n, [event]);
    await newProcessor(store2, chain, mailer2).catchUp(10n);

    expect(mailer2.sent).toHaveLength(0);
    store2.close();
  });
});

describe("SaleProcessor · catch-up paginado (TC-WK-002)", () => {
  it("rango grande (> GETLOGS_MAX_RANGE) se consulta en varios chunks ≤ límite", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const chain = new FakeChainSource(BigInt(GETLOGS_MAX_RANGE * 2 + 100));
    const processor = newProcessor(store, chain, new FakeMailer(), {
      deploymentBlock: 0,
    });

    await processor.catchUp(chain.getHeadBlock ? await chain.getHeadBlock() : 0n);

    // Varios chunks (3 para 2·max + 101 bloques).
    expect(chain.requestedRanges.length).toBeGreaterThan(1);
    for (const range of chain.requestedRanges) {
      const size = Number(range.to - range.from) + 1; // rango inclusivo
      expect(size).toBeLessThanOrEqual(GETLOGS_MAX_RANGE);
    }
    // Cobertura contigua de [0, head] sin huecos ni solapes.
    expect(chain.requestedRanges[0]?.from).toBe(0n);
    expect(chain.requestedRanges.at(-1)?.to).toBe(BigInt(GETLOGS_MAX_RANGE * 2 + 100));
    store.close();
  });
});

describe("SaleProcessor · checkpoint (TC-WK-003)", () => {
  it("avanza el checkpoint tras procesar cada chunk", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const head = BigInt(GETLOGS_MAX_RANGE + 10);
    const chain = new FakeChainSource(head);
    const processor = newProcessor(store, chain, new FakeMailer());

    await processor.catchUp(head);

    expect(store.getLastBlock(CONTRACT)).toBe(Number(head));
    store.close();
  });

  it("arranca desde deploymentBlock cuando no hay checkpoint previo", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const chain = new FakeChainSource(100n);
    const processor = newProcessor(store, chain, new FakeMailer(), {
      deploymentBlock: 90,
    });

    await processor.catchUp(100n);

    expect(chain.requestedRanges[0]?.from).toBe(90n);
    store.close();
  });
});

describe("SaleProcessor · contenido del email (TC-WK-004)", () => {
  it("deriva room/fecha/precio/saleType del tokenId", () => {
    const event = makeSaleEvent({
      tokenId: 10_220_260_615n, // hab 102, 2026-06-15, simple
      priceWei: 2_500_000_000_000_000_000n,
      saleTypeRaw: 0,
    });

    const n = buildNotification(event);

    expect(n.room).toBe(102);
    expect(n.dateYYYYMMDD).toBe(20_260_615);
    expect(n.roomType).toBe("simple");
    expect(n.priceWei).toBe(2_500_000_000_000_000_000n);
    expect(n.saleType).toBe("PRIMARY");
  });

  it("marca SECONDARY cuando saleTypeRaw = 1", () => {
    expect(buildNotification(makeSaleEvent({ saleTypeRaw: 1 })).saleType).toBe(
      "SECONDARY",
    );
  });
});

describe("SaleProcessor · fallo SMTP (TC-WK-005)", () => {
  it("agota reintentos → no marca processed → degrada salud → reintenta en otro ciclo", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const failing = new AlwaysFailingMailer();
    let degraded = false;
    const processor = newProcessor(store, new FakeChainSource(10n), failing, {
      retries: 2,
      onDegraded: () => {
        degraded = true;
      },
    });
    const event = makeSaleEvent();

    await processor.processSale(event);

    expect(failing.attempts).toBe(3); // 1 + 2 reintentos
    expect(degraded).toBe(true);
    expect(store.isProcessed(idempotencyKey(event))).toBe(false);

    // Recuperación: el mailer ahora entrega; el segundo intento debe enviar exactamente 1 email.
    const ok = new FakeMailer();
    const recovered = newProcessor(store, new FakeChainSource(10n), ok);
    await recovered.processSale(event);
    expect(ok.sent).toHaveLength(1);
    expect(store.isProcessed(idempotencyKey(event))).toBe(true);
    store.close();
  });
});

describe("SaleProcessor · reconexión / catch-up tras caída (TC-WK-006)", () => {
  it("al reanudar procesa todos los logs acumulados desde el checkpoint sin duplicar", async () => {
    const events: SaleEvent[] = [
      makeSaleEvent({ txHash: `0x${"11".repeat(32)}`, logIndex: 0, blockNumber: 2n }),
      makeSaleEvent({ txHash: `0x${"22".repeat(32)}`, logIndex: 1, blockNumber: 3n }),
      makeSaleEvent({ txHash: `0x${"33".repeat(32)}`, logIndex: 0, blockNumber: 7n }),
    ];

    const store = new SqliteCheckpointStore(dbPath);
    const mailer = new FakeMailer();

    // Primer ciclo: sólo había avanzado la cadena hasta el bloque 3 (dos ventas).
    const chainEarly = new FakeChainSource(3n, events);
    const processor = newProcessor(store, chainEarly, mailer);
    await processor.catchUp(3n);
    expect(mailer.sent).toHaveLength(2);
    expect(store.getLastBlock(CONTRACT)).toBe(3);

    // "Caída" y reanudación: la cadena ahora está en el bloque 8 (una venta más, bloque 7).
    const chainAfter = new FakeChainSource(8n, events);
    await newProcessor(store, chainAfter, mailer).catchUp(8n);

    // Total 3 emails (sin duplicar las dos primeras ventas).
    expect(mailer.sent).toHaveLength(3);
    // El catch-up reanuda desde checkpoint+1 = 4.
    expect(chainAfter.requestedRanges[0]?.from).toBe(4n);
    expect(store.getLastBlock(CONTRACT)).toBe(8);
    store.close();
  });
});
