import { describe, expect, it } from "vitest";
import { SqliteCheckpointStore } from "./checkpoint-store";
import { createWorkerHealthState } from "./health";
import { runCycle, runWorker } from "./run-worker";
import { SaleProcessor } from "./sale-processor";
import { AggregateProcessor } from "./aggregate-processor";
import {
  AggregateFailingChainSource,
  AlwaysFailingMailer,
  FailingChainSource,
  FakeChainSource,
  FakeMailer,
  InMemoryAggregateStore,
  InMemoryCheckpointStore,
  makeSaleAggregateEvent,
  makeSaleEvent,
  noSleep,
  SelectiveFailingMailer,
  silentLogger,
} from "./test-fakes";
import type { AggregateStore, ChainSource } from "./types";

/** AggregateProcessor de conveniencia para los tests de `runCycle` (store en memoria). */
const newAggregateProcessor = (
  chainSource: ChainSource,
  store: AggregateStore = new InMemoryAggregateStore(),
) =>
  new AggregateProcessor({
    chainSource,
    store,
    deploymentBlock: 0,
  });

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

describe("runWorker · ciclo y salud", () => {
  it("procesa un ciclo, avanza checkpoint y actualiza la salud (lag 0)", async () => {
    const store = new SqliteCheckpointStore(":memory:");
    const mailer = new FakeMailer();
    const chain = new FakeChainSource(5n, [makeSaleEvent({ blockNumber: 3n })]);
    const health = createWorkerHealthState();
    const controller = new AbortController();

    // Aborta antes del primer sleep para ejecutar exactamente un ciclo.
    const sleep = async (): Promise<void> => {
      controller.abort();
    };

    await runWorker(
      {
        contractAddress: CONTRACT,
        deploymentBlock: 0,
        pollIntervalMs: 1,
        backoff: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      },
      {
        chainSource: chain,
        mailer,
        store,
        aggregateStore: new InMemoryAggregateStore(),
        logger: silentLogger(),
        health,
        signal: controller.signal,
        sleep,
      },
    );

    expect(mailer.sent).toHaveLength(1);
    expect(store.getLastBlock(CONTRACT)).toBe(5);
    expect(health.lastBlock).toBe(5);
    expect(health.headBlock).toBe(5);
    expect(health.lag).toBe(0);
    expect(health.toReport().status).toBe("ok");
    store.close();
  });

  it("marca salud down tras N fallos consecutivos del RPC", async () => {
    const health = createWorkerHealthState({ rpcFailureThreshold: 3 });
    const processor = new SaleProcessor({
      chainSource: new FailingChainSource(),
      mailer: new FakeMailer(),
      store: new SqliteCheckpointStore(":memory:"),
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      sleep: noSleep,
    });
    const failingChain = new FailingChainSource();
    const deps = {
      chainSource: failingChain,
      logger: silentLogger(),
      health,
    };
    const aggregate = newAggregateProcessor(failingChain);

    expect(health.toReport().status).toBe("ok");
    await runCycle(processor, aggregate, deps);
    await runCycle(processor, aggregate, deps);
    expect(health.toReport().status).toBe("ok"); // 2 fallos < umbral
    await runCycle(processor, aggregate, deps);
    expect(health.toReport().status).toBe("down"); // 3 fallos ⇒ down
  });

  it("rebind: reinicia el checkpoint al deploymentBlock si cambió la dirección del contrato", async () => {
    const store = new SqliteCheckpointStore(":memory:");
    // Estado previo de OTRO contrato.
    store.setLastBlock(OTHER, 1234);

    const controller = new AbortController();
    const chain = new FakeChainSource(50n);
    await runWorker(
      { contractAddress: CONTRACT, deploymentBlock: 40, pollIntervalMs: 1 },
      {
        chainSource: chain,
        mailer: new FakeMailer(),
        store,
        aggregateStore: new InMemoryAggregateStore(),
        logger: silentLogger(),
        health: createWorkerHealthState(),
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      },
    );

    // El nuevo contrato arranca su checkpoint en el deploymentBlock y procesa desde ahí.
    expect(chain.requestedRanges[0]?.from).toBe(40n);
    expect(store.getLastBlock(CONTRACT)).toBe(50);
    expect(store.getLastBlock(OTHER)).toBe(1234); // el estado del antiguo no se borra
    store.close();
  });
});

describe("runWorker · salud de email se rearma tras recuperación SMTP (MAJOR 1)", () => {
  it("down tras agotar reintentos y vuelve a ok tras un envío posterior correcto", async () => {
    const store = new SqliteCheckpointStore(":memory:");
    const health = createWorkerHealthState();
    const emailHooks = {
      onEmailDegraded: () => health.markEmailDegraded(),
      onEmailRecovered: () => health.clearEmailDegraded(),
    };
    const event1 = makeSaleEvent({ txHash: `0x${"11".repeat(32)}`, blockNumber: 3n });

    // Ciclo 1: SMTP caído ⇒ se agotan los reintentos ⇒ salud degradada por email.
    const failingProcessor = new SaleProcessor({
      chainSource: new FakeChainSource(5n, [event1]),
      mailer: new AlwaysFailingMailer(),
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      health: emailHooks,
      sleep: noSleep,
    });
    const chain1 = new FakeChainSource(5n, [event1]);
    await runCycle(failingProcessor, newAggregateProcessor(chain1), {
      chainSource: chain1,
      logger: silentLogger(),
      health,
    });
    expect(health.toReport().status).toBe("down");
    expect(health.toReport().details?.emailDegraded).toBe(true);

    // Ciclo 2: la cadena avanza con una nueva venta y el SMTP se ha recuperado ⇒ el envío
    // correcto rearma la salud de email (clearEmailDegraded) y `/health` vuelve a `ok`.
    const ok = new FakeMailer();
    const event2 = makeSaleEvent({ txHash: `0x${"22".repeat(32)}`, blockNumber: 7n });
    const recoveredProcessor = new SaleProcessor({
      chainSource: new FakeChainSource(8n, [event2]),
      mailer: ok,
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      health: emailHooks,
      sleep: noSleep,
    });
    const chain2 = new FakeChainSource(8n, [event2]);
    await runCycle(recoveredProcessor, newAggregateProcessor(chain2), {
      chainSource: chain2,
      logger: silentLogger(),
      health,
    });

    expect(ok.sent).toHaveLength(1);
    expect(health.toReport().status).toBe("ok");
    expect(health.toReport().details?.emailDegraded).toBe(false);
    store.close();
  });
});

describe("runWorker · fallo de procesamiento NO se clasifica como fallo de RPC (MAJOR 2)", () => {
  it("un fallo al procesar un evento no marca down por RPC y avanza el checkpoint", async () => {
    // Store cuyo `markProcessed` lanza ⇒ `processSale` falla por una causa no-RPC/no-SMTP.
    const store = new InMemoryCheckpointStore(true);
    const event = makeSaleEvent({ blockNumber: 3n });
    const health = createWorkerHealthState({ rpcFailureThreshold: 3 });

    const processor = new SaleProcessor({
      chainSource: new FakeChainSource(5n, [event]),
      mailer: new FakeMailer(),
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      health: {
        onProcessingError: () => health.markProcessingDegraded(),
        onProcessingRecovered: () => health.clearProcessingDegraded(),
      },
      sleep: noSleep,
    });

    const cycleChain = new FakeChainSource(5n, [event]);
    const deps = {
      chainSource: cycleChain,
      logger: silentLogger(),
      health,
    };
    const aggregate = newAggregateProcessor(cycleChain);

    // Tres ciclos con el mismo fallo de procesamiento: NUNCA debe marcarse down por RPC.
    await runCycle(processor, aggregate, deps);
    await runCycle(processor, aggregate, deps);
    await runCycle(processor, aggregate, deps);

    const report = health.toReport();
    // El umbral de RPC (3) no se alcanza porque el fallo no es de RPC.
    expect(report.details?.consecutiveRpcFailures).toBe(0);
    // Sí queda degradado por "processing" (señal distinta del RPC).
    expect(report.details?.processingDegraded).toBe(true);
    // El checkpoint avanza pese al evento defectuoso (sin head-of-line blocking).
    expect(store.getLastBlock(CONTRACT)).toBe(5);
    // La idempotencia se preserva: el evento que falló nunca se marcó como procesado.
    expect(store.isProcessed("0xignored")).toBe(false);
    store.close();
  });

  it("un fallo de procesamiento puntual se recupera (processing vuelve a ok)", async () => {
    const store = new SqliteCheckpointStore(":memory:");
    const event = makeSaleEvent({ blockNumber: 3n });
    const health = createWorkerHealthState();

    // Marcamos manualmente processing degradado (simula un ciclo previo con fallo).
    health.markProcessingDegraded();
    expect(health.toReport().status).toBe("down");

    const processor = new SaleProcessor({
      chainSource: new FakeChainSource(5n, [event]),
      mailer: new FakeMailer(),
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      health: {
        onProcessingError: () => health.markProcessingDegraded(),
        onProcessingRecovered: () => health.clearProcessingDegraded(),
      },
      sleep: noSleep,
    });

    const recoverChain = new FakeChainSource(5n, [event]);
    await runCycle(processor, newAggregateProcessor(recoverChain), {
      chainSource: recoverChain,
      logger: silentLogger(),
      health,
    });

    expect(health.toReport().details?.processingDegraded).toBe(false);
    expect(health.toReport().status).toBe("ok");
    store.close();
  });
});

describe("runWorker · rebind consciente de agregados (MAJOR 3)", () => {
  /** Ejecuta exactamente un ciclo de `runWorker` con el `aggregateStore` y la dirección dados. */
  const runOneCycle = async (
    contractAddress: string,
    aggregateStore: AggregateStore,
    chain: FakeChainSource,
  ): Promise<void> => {
    const controller = new AbortController();
    await runWorker(
      { contractAddress, deploymentBlock: 40, pollIntervalMs: 1 },
      {
        chainSource: chain,
        mailer: new FakeMailer(),
        store: new SqliteCheckpointStore(":memory:"),
        aggregateStore,
        logger: silentLogger(),
        health: createWorkerHealthState(),
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      },
    );
  };

  it("redeploy (cambia la dirección) → resetea el agregado a base y last_block=deploymentBlock", async () => {
    const aggregateStore = new InMemoryAggregateStore();
    // Estado previo del contrato ANTIGUO: agregado vinculado con una venta contabilizada.
    aggregateStore.setBoundAddress(OTHER);
    aggregateStore.applyEvent(makeSaleAggregateEvent({ saleTypeRaw: 0, blockNumber: 41n }));
    aggregateStore.setLastBlock(45);
    expect(aggregateStore.getCounters().soldCount).toBe(1);

    // Arranque con el contrato NUEVO (sin ventas en el rango): debe resetear el agregado.
    await runOneCycle(CONTRACT, aggregateStore, new FakeChainSource(50n));

    expect(aggregateStore.resetCount).toBe(1);
    expect(aggregateStore.getCounters().soldCount).toBe(0);
    expect(aggregateStore.getCounters().primaryVolumeWei).toBe(0n);
    expect(aggregateStore.getHistory()).toHaveLength(0);
    expect(aggregateStore.getBoundAddress()).toBe(CONTRACT.toLowerCase());
  });

  it("misma dirección (sin redeploy) → NO resetea el agregado", async () => {
    const aggregateStore = new InMemoryAggregateStore();
    aggregateStore.setBoundAddress(CONTRACT);
    aggregateStore.applyEvent(makeSaleAggregateEvent({ saleTypeRaw: 0, blockNumber: 41n }));
    aggregateStore.setLastBlock(45);

    await runOneCycle(CONTRACT, aggregateStore, new FakeChainSource(50n));

    expect(aggregateStore.resetCount).toBe(0);
    expect(aggregateStore.getCounters().soldCount).toBe(1);
  });

  it("primer arranque (sin vínculo previo) → NO resetea, sólo registra la dirección", async () => {
    const aggregateStore = new InMemoryAggregateStore();
    expect(aggregateStore.getBoundAddress()).toBeNull();

    await runOneCycle(CONTRACT, aggregateStore, new FakeChainSource(50n));

    expect(aggregateStore.resetCount).toBe(0);
    expect(aggregateStore.getBoundAddress()).toBe(CONTRACT.toLowerCase());
  });
});

describe("runWorker · /health observa el pipeline de agregados (MAJOR 4)", () => {
  it("degrada a down tras N fallos consecutivos del catchUp de agregados", async () => {
    const health = createWorkerHealthState({
      rpcFailureThreshold: 99, // descartamos la vía de RPC.
      aggregateFailureThreshold: 3,
    });
    const aggChain = new AggregateFailingChainSource(10n);
    const processor = new SaleProcessor({
      chainSource: aggChain,
      mailer: new FakeMailer(),
      store: new SqliteCheckpointStore(":memory:"),
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      sleep: noSleep,
    });
    const aggregate = newAggregateProcessor(aggChain);
    const deps = { chainSource: aggChain, logger: silentLogger(), health };

    await runCycle(processor, aggregate, deps);
    await runCycle(processor, aggregate, deps);
    expect(health.toReport().status).toBe("ok"); // 2 fallos < umbral
    expect(health.toReport().details?.consecutiveRpcFailures).toBe(0); // no es fallo de RPC
    await runCycle(processor, aggregate, deps);
    expect(health.toReport().status).toBe("down"); // 3 fallos de agregados ⇒ down
    expect(health.toReport().details?.consecutiveAggregateFailures).toBe(3);
  });

  it("publica aggregateLastBlock y aggregateLag tras el ciclo de agregados", async () => {
    const health = createWorkerHealthState({ lagThreshold: 10 });
    const chain = new FakeChainSource(100n);
    const aggregateStore = new InMemoryAggregateStore();
    const processor = new SaleProcessor({
      chainSource: chain,
      mailer: new FakeMailer(),
      store: new SqliteCheckpointStore(":memory:"),
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      sleep: noSleep,
    });
    const aggregate = new AggregateProcessor({
      chainSource: chain,
      store: aggregateStore,
      deploymentBlock: 0,
    });

    await runCycle(processor, aggregate, { chainSource: chain, logger: silentLogger(), health });

    // Tras el catch-up el agregado alcanza la cabecera ⇒ lag 0; reportamos ambos lags.
    expect(health.aggregateLastBlock).toBe(100);
    expect(health.aggregateLag).toBe(0);
    expect(health.toReport().details).toMatchObject({ aggregateLastBlock: 100, aggregateLag: 0 });
  });

  it("un lag de agregados por encima del umbral marca down aunque el email vaya al día", () => {
    const health = createWorkerHealthState({ lagThreshold: 10 });
    // Email al día (lag 0) pero agregados muy por detrás (head 100, agregados en 0) ⇒ lag 100 > 10.
    health.recordCycle(100, 100);
    health.recordAggregateCycle(0);
    expect(health.aggregateLag).toBe(100);
    expect(health.toReport().status).toBe("down");
  });
});

describe("runWorker · lag/health refleja el progreso persistido (MINOR 13)", () => {
  it("reporta el lastBlock del CheckpointStore, no el retorno de catchUp", async () => {
    // El email del bloque 5 no se entrega ⇒ catchUp se detiene en 4; el head es 6. El lag debe
    // reflejar el progreso persistido (4), no el head ni un avance espurio.
    const ev1 = makeSaleEvent({ txHash: `0x${"a1".repeat(32)}`, blockNumber: 3n });
    const ev2 = makeSaleEvent({ txHash: `0x${"b2".repeat(32)}`, blockNumber: 5n });
    const store = new SqliteCheckpointStore(":memory:");
    const chain = new FakeChainSource(6n, [ev1, ev2]);
    const health = createWorkerHealthState({ lagThreshold: 100 });
    const processor = new SaleProcessor({
      chainSource: chain,
      mailer: new SelectiveFailingMailer(ev2.txHash),
      store,
      logger: silentLogger(),
      contractAddress: CONTRACT,
      deploymentBlock: 0,
      backoff: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      sleep: noSleep,
    });

    await runCycle(processor, newAggregateProcessor(chain), {
      chainSource: chain,
      logger: silentLogger(),
      health,
    });

    expect(store.getLastBlock(CONTRACT)).toBe(4);
    expect(health.lastBlock).toBe(4); // progreso PERSISTIDO, no el head (6)
    expect(health.headBlock).toBe(6);
    expect(health.lag).toBe(2);
    store.close();
  });
});
