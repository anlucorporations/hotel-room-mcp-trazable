import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { DashboardAggregates, SaleHistoryEntry } from "@hotel/shared";
import type { HealthReport } from "@hotel/shared/health";
import { startWorkerHttpServer } from "./http-server";

/**
 * Tests del router HTTP del worker (FASE 3, CU-09/11). Verifican que `/health` mantiene su
 * contrato (200/503 + COMPONENT_DOWN) y que `/aggregates` y `/history` sirven los datos con CORS.
 */
const AGGREGATES: DashboardAggregates = {
  primaryVolumeWei: "1000000000000000000",
  royaltiesWei: "250000000000000000",
  secondaryVolumeWei: "5000000000000000000",
  soldCount: 3,
  mintedCount: 10,
  burnedCount: 1,
  occupancyRatioPercent: 30,
  lastBlock: 42,
};

const HISTORY: SaleHistoryEntry[] = [
  {
    tokenId: "10220260615",
    room: 102,
    dateYYYYMMDD: 20_260_615,
    roomType: "simple",
    priceWei: "1000000000000000000",
    saleType: "PRIMARY",
    seller: "0x0000000000000000000000000000000000000001",
    buyer: "0x0000000000000000000000000000000000000002",
    blockNumber: 3,
    logIndex: 0,
    txHash: `0x${"ab".repeat(32)}`,
  },
];

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

const start = (provider: () => HealthReport): Promise<string> =>
  startWorkerHttpServer({
    port: 0, // puerto efímero
    host: "127.0.0.1",
    provider,
    data: {
      getAggregates: () => AGGREGATES,
      getHistory: () => HISTORY,
    },
  }).then((s) => {
    server = s;
    const { port } = s.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  });

const okReport = (): HealthReport => ({
  status: "ok",
  component: "worker",
  details: { lastBlock: 42 },
});

describe("WorkerHttpServer · /health (contrato intacto)", () => {
  it("200 cuando ok", async () => {
    const base = await start(okReport);
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthReport;
    expect(body.status).toBe("ok");
    expect(body.component).toBe("worker");
  });

  it("503 + COMPONENT_DOWN cuando down", async () => {
    const base = await start(() => ({ status: "down", component: "worker" }));
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("COMPONENT_DOWN");
  });
});

describe("WorkerHttpServer · /aggregates y /history (CU-09/11)", () => {
  it("/aggregates devuelve DashboardAggregates con CORS", async () => {
    const base = await start(okReport);
    const res = await fetch(`${base}/aggregates`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual(AGGREGATES);
  });

  it("/history devuelve SaleHistoryEntry[] con CORS", async () => {
    const base = await start(okReport);
    const res = await fetch(`${base}/history`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual(HISTORY);
  });

  it("responde al preflight OPTIONS de las rutas de datos", async () => {
    const base = await start(okReport);
    const res = await fetch(`${base}/aggregates`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("404 en rutas desconocidas", async () => {
    const base = await start(okReport);
    const res = await fetch(`${base}/desconocido`);
    expect(res.status).toBe(404);
  });
});
