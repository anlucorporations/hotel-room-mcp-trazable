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
  SelectiveFailingMailer,
  silentLogger,
} from "./test-fakes";
import type { Mailer, SaleEvent } from "./types";

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
  mailer: Mailer,
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

describe("SaleProcessor · at-least-once del email (BLOCKER 1)", () => {
  it("email del medio falla → checkpoint NO pasa de ese bloque → reintento reenvía solo el fallido", async () => {
    // Tres ventas en bloques distintos dentro del mismo chunk; la del medio (bloque 5) no se
    // entregará. El checkpoint debe quedarse en 4 (bloque anterior al fallo), no en 6.
    const ev1 = makeSaleEvent({ txHash: `0x${"a1".repeat(32)}`, logIndex: 0, blockNumber: 3n });
    const ev2 = makeSaleEvent({ txHash: `0x${"b2".repeat(32)}`, logIndex: 0, blockNumber: 5n });
    const ev3 = makeSaleEvent({ txHash: `0x${"c3".repeat(32)}`, logIndex: 0, blockNumber: 6n });

    const store = new SqliteCheckpointStore(dbPath);
    const mailer = new SelectiveFailingMailer(ev2.txHash);
    const processor = newProcessor(store, new FakeChainSource(6n, [ev1, ev2, ev3]), mailer);

    const reached = await processor.catchUp(6n);

    // Sólo se entregó el primero; el del medio falló y el tercero ni se intentó (se corta el chunk).
    expect(mailer.sent.map((n) => n.txHash)).toEqual([ev1.txHash]);
    // El checkpoint NO pasa del bloque del fallo: queda en blockNumber(ev2) - 1 = 4.
    expect(reached).toBe(4n);
    expect(store.getLastBlock(CONTRACT)).toBe(4);
    // Idempotencia: sólo el entregado quedó marcado.
    expect(store.isProcessed(idempotencyKey(ev1))).toBe(true);
    expect(store.isProcessed(idempotencyKey(ev2))).toBe(false);
    expect(store.isProcessed(idempotencyKey(ev3))).toBe(false);

    // Recuperación SMTP + reintento (nuevo procesador, mismo store): reanuda desde checkpoint+1 = 5.
    mailer.mendTxHash();
    const chainRetry = new FakeChainSource(6n, [ev1, ev2, ev3]);
    const retried = newProcessor(store, chainRetry, mailer);
    const reached2 = await retried.catchUp(6n);

    // El previo (ev1) NO se duplica; sólo se reenvían el fallido (ev2) y el siguiente (ev3).
    expect(mailer.sent.map((n) => n.txHash)).toEqual([ev1.txHash, ev2.txHash, ev3.txHash]);
    expect(reached2).toBe(6n);
    expect(store.getLastBlock(CONTRACT)).toBe(6);
    // El catch-up del reintento arrancó en checkpoint+1 = 5 (no reprocesa el bloque 3 ya entregado).
    expect(chainRetry.requestedRanges[0]?.from).toBe(5n);
    expect(store.isProcessed(idempotencyKey(ev2))).toBe(true);
    expect(store.isProcessed(idempotencyKey(ev3))).toBe(true);
    store.close();
  });

  it("primer evento del rango no entregado → checkpoint no retrocede por debajo de 0", async () => {
    // Una única venta en el bloque 0 que no se entrega: el checkpoint nunca debe quedar negativo.
    const ev = makeSaleEvent({ txHash: `0x${"d4".repeat(32)}`, logIndex: 0, blockNumber: 0n });
    const store = new SqliteCheckpointStore(dbPath);
    const mailer = new SelectiveFailingMailer(ev.txHash);
    const processor = newProcessor(store, new FakeChainSource(0n, [ev]), mailer, {
      deploymentBlock: 0,
    });

    await processor.catchUp(0n);

    expect(mailer.sent).toHaveLength(0);
    expect(store.getLastBlock(CONTRACT)).toBe(0);
    expect(store.isProcessed(idempotencyKey(ev))).toBe(false);
    store.close();
  });

  it("processSale distingue 'delivered' de 'not-delivered'", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const okEvent = makeSaleEvent({ txHash: `0x${"ee".repeat(32)}`, blockNumber: 2n });
    const koEvent = makeSaleEvent({ txHash: `0x${"ff".repeat(32)}`, blockNumber: 3n });
    const mailer = new SelectiveFailingMailer(koEvent.txHash);
    const processor = newProcessor(store, new FakeChainSource(3n), mailer);

    expect(await processor.processSale(okEvent)).toBe("delivered");
    expect(await processor.processSale(koEvent)).toBe("not-delivered");
    // Ya procesado ⇒ idempotente ⇒ 'delivered' sin reenviar.
    expect(await processor.processSale(okEvent)).toBe("delivered");
    expect(mailer.sent).toHaveLength(1);
    store.close();
  });
});

describe("SaleProcessor · cierre limpio del backoff (MINOR 12)", () => {
  it("la señal abortada corta el backoff SMTP y devuelve no-entregado sin degradar email", async () => {
    const store = new SqliteCheckpointStore(dbPath);
    const failing = new AlwaysFailingMailer();
    const controller = new AbortController();
    controller.abort(); // ya abortada: el backoff debe rendirse en el primer intento.
    let degraded = false;
    const processor = new SaleProcessor({
      chainSource: new FakeChainSource(5n),
      mailer: failing,
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 5, baseDelayMs: 10_000, maxDelayMs: 10_000 },
      health: { onEmailDegraded: () => (degraded = true) },
      signal: controller.signal,
    });

    const outcome = await processor.processSale(makeSaleEvent());

    // No entregado, sin reintentar (señal abortada) y sin marcar salud degradada por cierre.
    expect(outcome).toBe("not-delivered");
    expect(failing.attempts).toBe(0);
    expect(degraded).toBe(false);
    store.close();
  });
});
