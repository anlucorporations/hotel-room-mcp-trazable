import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BurnerService, BurnLock } from "@hotel/shared";
import { dayKeyInZone, hourInZone, readChainClock, startBurnScheduler } from "./burn-scheduler";
import { silentLogger } from "./test-fakes";

/**
 * Planificador de la quema (D-03).
 *
 * Se prueba la regla que hace que la quema sea **una al día** con varias instancias: el cerrojo
 * diario. Si el ciclo no se completa (saldo, error), el cerrojo se libera para reintentar; si se
 * completa, se mantiene y el resto del día no vuelve a quemar.
 */

class InMemoryBurnLock implements BurnLock {
  readonly held = new Map<string, string>();
  releaseCalls = 0;

  async acquire(key: string): Promise<string | null> {
    if (this.held.has(key)) return null;
    const value = `lock-${key}`;
    this.held.set(key, value);
    return value;
  }

  async release(key: string, value: string): Promise<void> {
    this.releaseCalls += 1;
    if (this.held.get(key) === value) this.held.delete(key);
  }
}

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

describe("planificador de quema (D-03)", () => {
  let lock: InMemoryBurnLock;
  // Doble del `BurnerService`: solo se usa `executeScheduledBurn`, que es lo que orquesta el
  // planificador; tipar el doble completo obligaría a simular toda la clase (ruido sin valor).
  let service: Pick<BurnerService, "executeScheduledBurn">;

  function build(result: { reason: string; burnedTokensCount?: number }) {
    lock = new InMemoryBurnLock();
    service = {
      executeScheduledBurn: vi.fn().mockResolvedValue({
        executed: true,
        burnedTokensCount: result.burnedTokensCount ?? 0,
        txHashes: result.reason === "COMPLETED" ? ["0xburn"] : [],
        reason: result.reason,
      }),
    };
    return startBurnScheduler({
      service,
      publicClient: {} as never,
      walletClient: {} as never,
      options: { nftContractAddress: CONTRACT, operatorAddress: OPERATOR },
      logger: silentLogger() as never,
      signal: new AbortController().signal,
      lock,
      // Fecha fija: 2026-09-23 a las 12:05 de Madrid (CEST = UTC+2).
      now: () => new Date("2026-09-23T10:05:00Z"),
      checkIntervalMs: 60_000,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ejecuta el ciclo y deja el cerrojo diario tomado (no vuelve a quemar ese día)", async () => {
    const scheduler = build({ reason: "COMPLETED", burnedTokensCount: 3 });

    const first = await scheduler.runOnce();
    const second = await scheduler.runOnce();

    expect(first?.reason).toBe("COMPLETED");
    expect(second).toBeNull(); // cerrojo diario del día 2026-09-23
    expect(service.executeScheduledBurn).toHaveBeenCalledTimes(1);
    expect(lock.held.has("hotel:burn:day:2026-09-23")).toBe(true);
    expect(lock.releaseCalls).toBe(0);
    scheduler.stop();
  });

  it("si no había nada que quemar, el día queda marcado (no reintenta en bucle)", async () => {
    const scheduler = build({ reason: "NO_TOKENS" });

    expect((await scheduler.runOnce())?.reason).toBe("NO_TOKENS");
    expect(await scheduler.runOnce()).toBeNull();
    expect(service.executeScheduledBurn).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("un ciclo con TODAS las candidatas descartadas (SKIPPED_ALL) libera el cerrojo: no es éxito", async () => {
    // H-05: antes se declaraba `COMPLETED` con 0 quemadas y el cerrojo del día quedaba tomado, así que
    // nadie reintentaba y el fallo (firmante sin rol, contrato en pausa) pasaba inadvertido.
    const scheduler = build({ reason: "SKIPPED_ALL" });

    await scheduler.runOnce();
    await scheduler.runOnce();

    expect(service.executeScheduledBurn).toHaveBeenCalledTimes(2);
    expect(lock.releaseCalls).toBe(2);
    expect(lock.held.size).toBe(0);
    scheduler.stop();
  });

  it("si el ciclo no se completó (saldo o error), libera el cerrojo y reintenta", async () => {
    const scheduler = build({ reason: "INSUFFICIENT_GAS" });

    await scheduler.runOnce();
    await scheduler.runOnce();

    expect(service.executeScheduledBurn).toHaveBeenCalledTimes(2);
    // Se libera una vez por cada ciclo no completado: el siguiente tick puede reintentar.
    expect(lock.releaseCalls).toBe(2);
    expect(lock.held.size).toBe(0);
    scheduler.stop();
  });

  it("pasa el contrato y la wallet a la quema y registra el resultado", async () => {
    const scheduler = build({ reason: "COMPLETED", burnedTokensCount: 1 });

    await scheduler.runOnce();

    expect(service.executeScheduledBurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ nftContractAddress: CONTRACT, operatorAddress: OPERATOR }),
      "hotel:burn:cycle:2026-09-23",
    );
    scheduler.stop();
  });

  it("la clave del día y la hora se calculan en la zona del hotel (Europe/Madrid)", () => {
    // 22:30 UTC del 23 son las 00:30 del 24 en Madrid (CEST): el día natural cambia.
    expect(dayKeyInZone(new Date("2026-09-23T22:30:00Z"))).toBe("2026-09-24");
    expect(hourInZone(new Date("2026-09-23T10:00:00Z"))).toBe(12);
    expect(hourInZone(new Date("2026-01-15T11:00:00Z"))).toBe(12); // CET = UTC+1
  });

  it("la zona horaria es configurable (p. ej. UTC, si el hotel facturara en UTC)", () => {
    expect(hourInZone(new Date("2026-09-23T12:00:00Z"), "UTC")).toBe(12);
    expect(hourInZone(new Date("2026-09-23T12:00:00Z"), "Europe/Madrid")).toBe(14);
    expect(dayKeyInZone(new Date("2026-09-23T23:30:00Z"), "UTC")).toBe("2026-09-23");
    expect(dayKeyInZone(new Date("2026-09-23T23:30:00Z"), "Europe/Madrid")).toBe("2026-09-24");
  });
});

describe("planificador · reloj de la cadena", () => {
  it("el ciclo se ejecuta con la HORA DE LA CADENA, no con la de la máquina", async () => {
    // Hallazgo de la verificación adversarial: la caducidad la decide el `block.timestamp`, así que
    // un planificador con el reloj de la máquina quema (o no quema) noches según la deriva.
    const service = {
      executeScheduledBurn: vi.fn().mockResolvedValue({
        executed: true,
        burnedTokensCount: 0,
        txHashes: [],
        reason: "NO_TOKENS",
      }),
    };
    const publicClient = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_800_000_000n }),
    };
    const scheduler = startBurnScheduler({
      service: service as never,
      publicClient: publicClient as never,
      walletClient: {} as never,
      options: { nftContractAddress: CONTRACT, operatorAddress: OPERATOR },
      logger: silentLogger() as never,
      signal: new AbortController().signal,
      lock: new InMemoryBurnLock(),
      now: () => new Date("2026-09-23T10:05:00Z"),
      checkIntervalMs: 60_000,
    });

    await scheduler.runOnce();

    const passed = (service.executeScheduledBurn.mock.calls[0]![2] as { now: () => Date }).now;
    expect(passed().getTime()).toBe(1_800_000_000_000);
    scheduler.stop();
  });

  it("readChainClock degrada al reloj de la máquina si el RPC falla (mejor un ciclo que ninguno)", async () => {
    const fallback = new Date("2026-01-01T00:00:00Z");
    const clock = await readChainClock(
      { getBlock: vi.fn().mockRejectedValue(new Error("RPC caído")) } as never,
      () => fallback,
    );

    expect(clock().getTime()).toBe(fallback.getTime());
  });
});

/**
 * Señal de vida, recuperación al arrancar y aviso del reloj degradado (hallazgos **H-04** y **H-19**
 * de la auditoría V6).
 */
describe("planificador de quema · señal de vida y recuperación", () => {
  function buildAt(reason: string, hourIso: string) {
    const service = {
      executeScheduledBurn: vi.fn().mockResolvedValue({
        executed: true,
        burnedTokensCount: reason === "COMPLETED" ? 2 : 0,
        txHashes: reason === "COMPLETED" ? ["0xburn"] : [],
        reason,
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const scheduler = startBurnScheduler({
      service: service as never,
      publicClient: { getBlock: vi.fn().mockResolvedValue({ timestamp: 1_800_000_000n }) } as never,
      walletClient: {} as never,
      options: { nftContractAddress: CONTRACT, operatorAddress: OPERATOR },
      logger: logger as never,
      signal: new AbortController().signal,
      lock: new InMemoryBurnLock(),
      now: () => new Date(hourIso),
      checkIntervalMs: 60_000,
    });
    return { service, logger, scheduler };
  }

  it("publica el último ciclo en `lastRun` (y `null` antes del primero)", async () => {
    const { scheduler } = buildAt("COMPLETED", "2026-09-23T10:05:00Z");

    expect(scheduler.lastRun()).toBeNull();

    await scheduler.runOnce();

    const last = scheduler.lastRun();
    expect(last?.dayKey).toBe("2026-09-23");
    expect(last?.reason).toBe("COMPLETED");
    expect(last?.burnedTokensCount).toBe(2);
    expect(last?.txHashes).toEqual(["0xburn"]);
    expect(Number.isNaN(Date.parse(last!.at))).toBe(false);
    scheduler.stop();
  });

  it("si el worker arranca DESPUÉS de la hora de quema, hace una pasada de recuperación", async () => {
    // 13:05 de Madrid (CEST) del 23: la hora de quema (12:00) ya pasó y el día quedaba sin quemar
    // hasta mañana. El cerrojo diario impide que la pasada duplique una quema ya hecha.
    const { service, scheduler } = buildAt("COMPLETED", "2026-09-23T11:05:00Z");

    await vi.waitFor(() => expect(service.executeScheduledBurn).toHaveBeenCalledTimes(1));
    scheduler.stop();
  });

  it("si arranca dentro o antes de la hora, NO dispara ninguna pasada extra", async () => {
    const { service, scheduler } = buildAt("COMPLETED", "2026-09-23T08:05:00Z"); // 10:05 Madrid

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(service.executeScheduledBurn).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("avisa por log cuando no puede leer la hora de la cadena (H-19: antes era silencioso)", async () => {
    const fallback = new Date("2026-01-01T00:00:00Z");
    const onDegraded = vi.fn();

    const clock = await readChainClock(
      { getBlock: vi.fn().mockRejectedValue(new Error("RPC caído")) } as never,
      () => fallback,
      onDegraded,
    );

    expect(clock().getTime()).toBe(fallback.getTime());
    expect(onDegraded).toHaveBeenCalledTimes(1);
  });
});
