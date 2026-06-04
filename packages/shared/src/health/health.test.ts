import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startHealthServer, type HealthReport } from "./index";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

const portOf = (s: Server): number => (s.address() as AddressInfo).port;

describe("servidor /health (RNF-17)", () => {
  it("devuelve 200 y el reporte cuando el componente está sano", async () => {
    const report: HealthReport = { status: "ok", component: "worker", details: { lag: 0 } };
    server = await startHealthServer({ port: 0, provider: () => report });

    const res = await fetch(`http://127.0.0.1:${portOf(server)}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "ok", component: "worker" });
  });

  it("devuelve 503 con COMPONENT_DOWN cuando el componente está caído", async () => {
    server = await startHealthServer({
      port: 0,
      provider: () => ({ status: "down", component: "mcp" }),
    });

    const res = await fetch(`http://127.0.0.1:${portOf(server)}/health`);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "COMPONENT_DOWN" });
  });

  it("responde 404 fuera de la ruta de health", async () => {
    server = await startHealthServer({
      port: 0,
      provider: () => ({ status: "ok", component: "faucet" }),
    });

    const res = await fetch(`http://127.0.0.1:${portOf(server)}/otra`);
    expect(res.status).toBe(404);
  });
});
