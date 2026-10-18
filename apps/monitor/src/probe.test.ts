import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchHealthProbe, extractAnchorStats } from "./probe";

/**
 * Pruebas de `FetchHealthProbe` con `fetch` simulado (sin red real). Verifican la normalización
 * de respuestas a `ProbeResult` y la tolerancia a errores/cuerpos no válidos.
 */
const URL = "http://127.0.0.1:8787/health";

function mockFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FetchHealthProbe", () => {
  it("respuesta 200 con reporte ok → { ok: true, httpStatus: 200, report }", async () => {
    mockFetch(async () =>
      jsonResponse(200, { status: "ok", component: "worker", details: { lag: 1 } }),
    );
    const result = await new FetchHealthProbe().probe(URL);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.report).toEqual({
      status: "ok",
      component: "worker",
      details: { lag: 1 },
    });
  });

  it("respuesta 503 down → { ok: false, httpStatus: 503, report(down) }", async () => {
    mockFetch(async () =>
      jsonResponse(503, { status: "down", component: "mcp", error: "COMPONENT_DOWN" }),
    );
    const result = await new FetchHealthProbe().probe(URL);
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(503);
    expect(result.report?.status).toBe("down");
  });

  it("error de red → { ok: false, httpStatus: 0, report: null }", async () => {
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await new FetchHealthProbe().probe(URL);
    expect(result).toEqual({ ok: false, httpStatus: 0, report: null });
  });

  it("cuerpo no JSON → report null pero conserva el httpStatus", async () => {
    mockFetch(async () => new Response("<html>boom</html>", { status: 200 }));
    const result = await new FetchHealthProbe().probe(URL);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.report).toBeNull();
  });

  it("JSON sin forma de HealthReport → report null", async () => {
    mockFetch(async () => jsonResponse(200, { foo: "bar" }));
    const result = await new FetchHealthProbe().probe(URL);
    expect(result.report).toBeNull();
  });
});

describe("extractAnchorStats (F3 · outbox de anclaje)", () => {
  const report = (details: Record<string, unknown>): Parameters<typeof extractAnchorStats>[0] => ({
    status: "ok",
    component: "worker",
    details,
  });

  it("lee el resumen del outbox del /health del worker", () => {
    const stats = extractAnchorStats(
      report({
        anchor: {
          scheduler: "enabled",
          stats: { signed: 3, oldestSignedAt: "2026-10-12T10:00:00.000Z", maxRetryCount: 4 },
        },
      }),
    );
    expect(stats).toEqual({
      signed: 3,
      oldestSignedAt: "2026-10-12T10:00:00.000Z",
      maxRetryCount: 4,
    });
  });

  it("normaliza campos ausentes o de tipo incorrecto sin lanzar", () => {
    const stats = extractAnchorStats(
      report({ anchor: { scheduler: "enabled", stats: { signed: "3", maxRetryCount: null } } }),
    );
    expect(stats).toEqual({ signed: 0, oldestSignedAt: null, maxRetryCount: 0 });
  });

  it("devuelve null si el componente no publica el bloque anchor", () => {
    expect(extractAnchorStats(report({ lag: 1 }))).toBeNull();
    expect(extractAnchorStats(report({ anchor: { scheduler: "disabled" } }))).toBeNull();
  });
});
