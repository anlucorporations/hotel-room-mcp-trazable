import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Logger } from "pino";
import type { BurnLock, PreventiveTaskRecord } from "@hotel/shared";
import { startPreventiveScheduler } from "./preventive-scheduler";

/** Pruebas del aviso programado de mantenimiento preventivo (F4 · D-54). */

function task(overrides: Partial<PreventiveTaskRecord> = {}): PreventiveTaskRecord {
  return {
    id: "task-1",
    planId: "plan-1",
    dueDate: "2026-09-20",
    status: "PENDING",
    completedBy: null,
    completedAt: null,
    notes: null,
    planCode: "CAL-01",
    planName: "Caldera principal",
    equipment: "Caldera",
    periodicity: "MONTHLY",
    roomNumber: null,
    overdue: true,
    ...overrides,
  };
}

function makeLock(): BurnLock & { acquired: string[]; released: string[] } {
  const acquired: string[] = [];
  const released: string[] = [];
  return {
    acquired,
    released,
    acquire: vi.fn(async (key: string) => {
      acquired.push(key);
      return "token";
    }),
    release: vi.fn(async (key: string) => {
      released.push(key);
      return true;
    }),
  } as unknown as BurnLock & { acquired: string[]; released: string[] };
}

const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
const controller = new AbortController();

describe("startPreventiveScheduler (F4 · D-54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("avisa de las tareas vencidas y conserva el cerrojo del día", async () => {
    const lock = makeLock();
    const notify = vi.fn(async () => undefined);
    const scheduler = startPreventiveScheduler({
      logger,
      signal: controller.signal,
      lock,
      skipInitialRun: true,
      now: () => new Date("2026-09-27T09:00:00Z"),
      listDue: vi.fn(async () => [task(), task({ id: "task-2" })]),
      notify,
    });

    const count = await scheduler.runOnce();
    expect(count).toBe(2);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(lock.released).toHaveLength(0);
    scheduler.stop();
  });

  it("sin tareas vencidas libera el cerrojo para poder avisar más tarde el mismo día", async () => {
    const lock = makeLock();
    const notify = vi.fn(async () => undefined);
    const scheduler = startPreventiveScheduler({
      logger,
      signal: controller.signal,
      lock,
      skipInitialRun: true,
      listDue: vi.fn(async () => []),
      notify,
    });

    expect(await scheduler.runOnce()).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(lock.released).toEqual(lock.acquired);
    scheduler.stop();
  });

  it("si otra instancia ya avisó hoy, no hace nada", async () => {
    const lock = { acquire: vi.fn(async () => null), release: vi.fn(async () => true) } as unknown as BurnLock;
    const notify = vi.fn(async () => undefined);
    const scheduler = startPreventiveScheduler({
      logger,
      signal: controller.signal,
      lock,
      skipInitialRun: true,
      notify,
    });
    expect(await scheduler.runOnce()).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("si el aviso falla, libera el cerrojo para reintentar", async () => {
    const lock = makeLock();
    const scheduler = startPreventiveScheduler({
      logger,
      signal: controller.signal,
      lock,
      skipInitialRun: true,
      listDue: vi.fn(async () => [task()]),
      notify: vi.fn(async () => {
        throw new Error("SMTP caído");
      }),
    });
    expect(await scheduler.runOnce()).toBeNull();
    expect(lock.released).toEqual(lock.acquired);
    scheduler.stop();
  });
});
