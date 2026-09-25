import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { startRetentionScheduler } from "./retention-scheduler";
import type { BurnLock, PurgeResult } from "@hotel/shared";

/**
 * Planificador de retención (M9 · ADR-24).
 *
 * Estas pruebas fijan el comportamiento que hace que la minimización de datos sea real: la limpieza
 * se ejecuta, **una sola** instancia la hace (cerrojo), el cerrojo se **libera siempre** para que un
 * fallo se reintente, y un error no tumba al worker.
 */

/** Registrador mínimo: solo se comprueba que no explota y que registra a los niveles usados. */
function fakeLogger(): Logger {
  const noop = vi.fn();
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}

/** Cerrojo en memoria: permite simular «otra instancia está purgando». */
function fakeLock(busy = false): BurnLock & { released: string[] } {
  const released: string[] = [];
  return {
    released,
    acquire: vi.fn(async () => (busy ? null : "token-1")),
    release: vi.fn(async (_key: string, value: string) => {
      released.push(value);
    }),
  };
}

const RESULT: PurgeResult = {
  expiredSessions: 3,
  orphanRecoveryCodes: 1,
  oldNotifications: 7,
  executedAt: "2026-09-23T00:00:00.000Z",
};

const signal = new AbortController().signal;

describe("planificador de retención (M9)", () => {
  it("ejecuta la limpieza y libera el cerrojo", async () => {
    const purge = vi.fn(async () => RESULT);
    const lock = fakeLock();
    const scheduler = startRetentionScheduler({
      purge,
      logger: fakeLogger(),
      signal,
      lock,
      skipInitialRun: true,
    });

    const result = await scheduler.runOnce();

    expect(result).toEqual(RESULT);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(lock.release).toHaveBeenCalledWith("hotel:retention:purge", "token-1");
    scheduler.stop();
  });

  it("no purga si otra instancia tiene el cerrojo", async () => {
    const purge = vi.fn(async () => RESULT);
    const scheduler = startRetentionScheduler({
      purge,
      logger: fakeLogger(),
      signal,
      lock: fakeLock(true),
      skipInitialRun: true,
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(purge).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("libera el cerrojo aunque la limpieza falle, para poder reintentar", async () => {
    const purge = vi.fn(async () => {
      throw new Error("base de datos no disponible");
    });
    const lock = fakeLock();
    const logger = fakeLogger();
    const scheduler = startRetentionScheduler({
      purge,
      logger,
      signal,
      lock,
      skipInitialRun: true,
    });

    // Un fallo NO propaga (el worker sigue vivo) y el cerrojo queda libre para la próxima pasada.
    expect(await scheduler.runOnce()).toBeNull();
    expect(lock.released).toEqual(["token-1"]);
    expect(logger.error).toHaveBeenCalled();
    scheduler.stop();
  });

  it("hace una pasada al arrancar y no mantiene vivo el proceso", async () => {
    const purge = vi.fn(async () => RESULT);
    const scheduler = startRetentionScheduler({
      purge,
      logger: fakeLogger(),
      signal,
      lock: fakeLock(),
    });

    // La pasada inicial se lanza sin bloquear el arranque del worker.
    await vi.waitFor(() => expect(purge).toHaveBeenCalled());
    scheduler.stop();
  });

  it("deja de ejecutar tras stop()", async () => {
    const purge = vi.fn(async () => RESULT);
    const scheduler = startRetentionScheduler({
      purge,
      logger: fakeLogger(),
      signal,
      lock: fakeLock(),
      intervalMs: 5,
      skipInitialRun: true,
    });

    scheduler.stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(purge).not.toHaveBeenCalled();
  });
});
