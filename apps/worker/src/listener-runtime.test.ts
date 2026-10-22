import { describe, expect, it, vi } from "vitest";
import { startListenerRuntime } from "./listener-runtime";
import { silentLogger } from "./test-fakes";

/**
 * Runtime del listener (D-12 + ADR-34).
 *
 * Lo que importa tras la unificación: el worker lo arranca **después del rebind**
 * (`autostart: false` + `start()`), y la primera pasada es inmediata para que el catch-up no espere
 * un intervalo completo. `stop()` corta el intervalo.
 */
function buildRuntime(overrides: { autostart?: boolean } = {}) {
  const listener = {
    reconcileLogsChunked: vi.fn(async () => 0),
    onNewBlock: vi.fn(async () => undefined),
    checkSilenceAlert: vi.fn(async () => false),
  };
  const publicClient = { getBlockNumber: vi.fn(async () => 100n) };
  const runtime = startListenerRuntime({
    listener: listener as never,
    publicClient: publicClient as never,
    logger: silentLogger(),
    signal: new AbortController().signal,
    pollIntervalMs: 60_000,
    heartbeatIntervalMs: 60_000,
    fromBlock: 90,
    ...(overrides.autostart !== undefined ? { autostart: overrides.autostart } : {}),
  });
  return { runtime, listener, publicClient };
}

describe("startListenerRuntime · arranque tras el rebind (ADR-34)", () => {
  it("con autostart:false NO lee la cadena hasta que se llama a start()", async () => {
    const { runtime, listener, publicClient } = buildRuntime({ autostart: false });

    expect(publicClient.getBlockNumber).not.toHaveBeenCalled();

    runtime.start();

    await vi.waitFor(() => {
      expect(listener.reconcileLogsChunked).toHaveBeenCalledWith(publicClient, 90n, 100n);
      expect(listener.onNewBlock).toHaveBeenCalledWith(100n);
    });
    runtime.stop();
  });

  it("start() es idempotente y hace una primera pasada inmediata", async () => {
    const { runtime, publicClient } = buildRuntime({ autostart: false });

    runtime.start();
    runtime.start();

    await vi.waitFor(() => expect(publicClient.getBlockNumber).toHaveBeenCalled());
    expect(publicClient.getBlockNumber).toHaveBeenCalledTimes(1);
    runtime.stop();
  });

  it("por defecto (autostart) arranca solo, sin esperar al primer intervalo", async () => {
    const { runtime, listener } = buildRuntime();

    await vi.waitFor(() => expect(listener.reconcileLogsChunked).toHaveBeenCalled());
    runtime.stop();
  });
});
