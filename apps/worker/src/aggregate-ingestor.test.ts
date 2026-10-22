import { describe, expect, it, vi } from "vitest";
import type { CanonicalDomainEvent } from "@hotel/shared";
import { AggregateEventIngestor, type AggregateEventWriter } from "./aggregate-ingestor";
import { createWorkerHealthState } from "./health";
import type { ChainEvent } from "./types";

/**
 * Ingestor de agregados del flujo canónico único (ADR-34).
 *
 * Lo que se prueba:
 *   - traduce Mint/Sale/RoyaltyPaid/Burn y **descarta** Listed/CheckedIn (solo afectan al índice);
 *   - resuelve la marca temporal **solo de los bloques con venta** (la necesita el histórico);
 *   - aplica en orden, avanza `lastBlock` al máximo del lote y notifica a la salud;
 *   - es **fail-closed**: si una cabecera de bloque falla, NO aplica ni avanza (se reintenta el rango).
 */

const AUTHOR = `0x${"a1".repeat(32)}` as const;
const loc = (blockNumber: bigint, logIndex: number) => ({
  blockNumber,
  logIndex,
  txHash: `0x${String(logIndex).padStart(2, "0").repeat(32).slice(0, 64)}` as const,
});

const mint = (blockNumber = 10n, logIndex = 0): CanonicalDomainEvent => ({
  kind: "mint",
  tokenId: 10_220_261_025n,
  room: 102n,
  dateYYYYMMDD: 20_261_025n,
  roomType: "simple",
  priceWei: 1_000_000_000_000_000_000n,
  ...loc(blockNumber, logIndex),
});

const sale = (blockNumber = 12n, logIndex = 1): CanonicalDomainEvent => ({
  kind: "sale",
  tokenId: 10_220_261_025n,
  seller: `0x${"b2".repeat(20)}` as const,
  buyer: `0x${"c3".repeat(20)}` as const,
  priceWei: 2_000_000_000_000_000_000n,
  saleTypeRaw: 1,
  ...loc(blockNumber, logIndex),
});

const royalty = (blockNumber = 12n, logIndex = 2): CanonicalDomainEvent => ({
  kind: "royaltyPaid",
  tokenId: 10_220_261_025n,
  receiver: `0x${"d4".repeat(20)}` as const,
  amountWei: 100_000_000_000_000_000n,
  ...loc(blockNumber, logIndex),
});

const burn = (blockNumber = 15n, logIndex = 3): CanonicalDomainEvent => ({
  kind: "burn",
  tokenId: 10_220_261_025n,
  ...loc(blockNumber, logIndex),
});

const listed = (blockNumber = 12n, logIndex = 4): CanonicalDomainEvent => ({
  kind: "listed",
  tokenId: 10_220_261_025n,
  seller: AUTHOR,
  priceWei: 3_000_000_000_000_000_000n,
  ...loc(blockNumber, logIndex),
});

const checkedIn = (blockNumber = 20n, logIndex = 5): CanonicalDomainEvent => ({
  kind: "checkedIn",
  tokenId: 10_220_261_025n,
  ...loc(blockNumber, logIndex),
});

function buildIngestor(overrides?: {
  apply?: (events: readonly ChainEvent[]) => Promise<number>;
  getBlockTimestamp?: (blockNumber: bigint) => Promise<number>;
}) {
  const applied: ChainEvent[][] = [];
  const writer: AggregateEventWriter = {
    apply: vi.fn(async (events: readonly ChainEvent[]) => {
      applied.push([...events]);
      return overrides?.apply ? overrides.apply(events) : events.length;
    }),
    setLastBlock: vi.fn(async () => undefined),
  };
  const getBlockTimestamp =
    overrides?.getBlockTimestamp ?? vi.fn(async (block: bigint) => 1_700_000_000 + Number(block));
  const onApplied = vi.fn();
  const onFailure = vi.fn();

  const ingestor = new AggregateEventIngestor({
    writer,
    getBlockTimestamp,
    onApplied,
    onFailure,
  });

  return {
    ingestor,
    writer,
    getBlockTimestamp,
    onApplied,
    onFailure,
    applied,
  };
}

describe("AggregateEventIngestor · flujo canónico único (ADR-34)", () => {
  it("traduce los cuatro eventos de agregados, descarta Listed/CheckedIn y avanza lastBlock", async () => {
    const h = buildIngestor();

    const count = await h.ingestor.apply({
      events: [mint(10n, 0), sale(12n, 1), royalty(12n, 2), burn(15n, 3), listed(12n, 4), checkedIn(20n, 5)],
      scannedToBlock: 20n,
    });

    expect(count).toBe(4);
    expect(h.applied).toHaveLength(1);
    const events = h.applied[0]!;
    expect(events.map((event) => event.kind)).toEqual(["mint", "sale", "royaltyPaid", "burn"]);
    expect(events.map((event) => event.logIndex)).toEqual([0, 1, 2, 3]);
    expect(events[1]).toMatchObject({
      kind: "sale",
      blockNumber: 12n,
      saleTypeRaw: 1,
      blockTimestamp: 1_700_000_012,
    });
    // El checkpoint avanza al último bloque LEÍDO del lote (20), aunque el evento de ese bloque
    // (CheckedIn) no sea de agregados: así el lag no crece en tramos sin actividad.
    expect(h.writer.setLastBlock).toHaveBeenCalledWith(20);
    expect(h.onApplied).toHaveBeenCalledWith(20);
    expect(h.onFailure).not.toHaveBeenCalled();
  });

  it("resuelve la marca temporal de cada bloque con venta una sola vez (caché del origen)", async () => {
    const getBlockTimestamp = vi.fn(async (block: bigint) => 1_700_000_000 + Number(block));
    const h = buildIngestor({ getBlockTimestamp });

    await h.ingestor.apply({ events: [sale(12n, 1), sale(12n, 2), mint(10n, 0)], scannedToBlock: 12n });

    expect(getBlockTimestamp).toHaveBeenCalledTimes(1);
    expect(getBlockTimestamp).toHaveBeenCalledWith(12n);
  });

  it("no lee cabeceras si el lote no trae ventas (solo historiografía)", async () => {
    const h = buildIngestor();

    await h.ingestor.apply({ events: [mint(10n, 0), burn(15n, 1)], scannedToBlock: 15n });

    expect(h.getBlockTimestamp).not.toHaveBeenCalled();
    expect(h.applied[0]).toHaveLength(2);
    expect(h.writer.setLastBlock).toHaveBeenCalledWith(15);
  });

  it("fail-closed: si una cabecera de bloque falla, NO aplica, NO avanza y propaga", async () => {
    const h = buildIngestor({
      getBlockTimestamp: async () => {
        throw new Error("cabecera no disponible (RPC)");
      },
    });

    await expect(
      h.ingestor.apply({ events: [sale(12n, 1)], scannedToBlock: 12n }),
    ).rejects.toThrow("cabecera no disponible (RPC)");

    expect(h.writer.apply).not.toHaveBeenCalled();
    expect(h.writer.setLastBlock).not.toHaveBeenCalled();
    expect(h.onApplied).not.toHaveBeenCalled();
    expect(h.onFailure).toHaveBeenCalledTimes(1);
  });

  it("si el store falla, notifica la degradación y propaga (el runtime reintenta el rango)", async () => {
    const h = buildIngestor({
      apply: async () => {
        throw new Error("I/O de PostgreSQL caído");
      },
    });

    await expect(
      h.ingestor.apply({ events: [mint(10n, 0)], scannedToBlock: 10n }),
    ).rejects.toThrow("I/O de PostgreSQL caído");

    expect(h.writer.setLastBlock).not.toHaveBeenCalled();
    expect(h.onFailure).toHaveBeenCalledTimes(1);
  });

  it("un lote solo con Listed/CheckedIn no escribe eventos pero sí avanza el checkpoint", async () => {
    const h = buildIngestor();

    const count = await h.ingestor.apply({ events: [listed(), checkedIn()], scannedToBlock: 20n });

    expect(count).toBe(0);
    expect(h.writer.apply).not.toHaveBeenCalled();
    expect(h.writer.setLastBlock).toHaveBeenCalledWith(20);
    expect(h.onApplied).toHaveBeenCalledWith(20);
  });
});

describe("AggregateEventIngestor · salud del pipeline (MAJOR 4)", () => {
  it("degrada /health tras N fallos consecutivos y se recupera al aplicar el siguiente lote", async () => {
    const health = createWorkerHealthState({ aggregateFailureThreshold: 3 });
    let failures = 3;
    const writer: AggregateEventWriter = {
      apply: vi.fn(async (events: readonly ChainEvent[]) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("I/O de PostgreSQL caído");
        }
        return events.length;
      }),
      setLastBlock: vi.fn(async () => undefined),
    };
    const ingestor = new AggregateEventIngestor({
      writer,
      getBlockTimestamp: async () => 1_700_000_000,
      onApplied: (lastBlock) => health.recordAggregateCycle(lastBlock),
      onFailure: () => health.recordAggregateFailure(),
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        ingestor.apply({
          events: [mint(10n + BigInt(attempt), attempt)],
          scannedToBlock: 10n + BigInt(attempt),
        }),
      ).rejects.toThrow(
        "I/O de PostgreSQL caído",
      );
    }
    expect(health.toReport().status).toBe("down");
    expect(health.toReport().details?.consecutiveAggregateFailures).toBe(3);

    await ingestor.apply({ events: [mint(20n, 9)], scannedToBlock: 20n });
    expect(health.toReport().status).toBe("ok");
    expect(health.toReport().details?.consecutiveAggregateFailures).toBe(0);
    expect(health.aggregateLastBlock).toBe(20);
  });
});
