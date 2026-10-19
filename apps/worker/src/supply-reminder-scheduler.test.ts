import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { startSupplyReminderScheduler } from "./supply-reminder-scheduler";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const signal = new AbortController().signal;
const now = new Date("2026-10-19T10:00:00Z");

describe("planificador de recordatorio de suministros (F8 · T8.2)", () => {
  it("concilia alertas y recuerda las abiertas una vez al día", async () => {
    const repo = {
      syncAll: vi.fn(async () => ({ opened: 1, closed: 2 })),
      dueReminders: vi.fn(async () => [
        { id: "a-1", itemCode: "SOAP", status: "OPEN" as const, lastRemindedAt: null },
      ]),
      markReminded: vi.fn(async () => 1),
    };
    const notifier = vi.fn(async () => undefined);
    const scheduler = startSupplyReminderScheduler({
      logger, signal, repo: repo as never, notifier, now: () => now, skipInitialRun: true,
    });
    const result = await scheduler.runOnce();
    expect(result).toMatchObject({ opened: 1, closed: 2, reminded: 1 });
    expect(repo.markReminded).toHaveBeenCalledWith(["a-1"], now);
    expect(notifier).toHaveBeenCalledOnce();
    scheduler.stop();
  });

  it("sin alertas vencidas no recuerda ni marca", async () => {
    const repo = {
      syncAll: vi.fn(async () => ({ opened: 0, closed: 0 })),
      dueReminders: vi.fn(async () => []),
      markReminded: vi.fn(async () => 0),
    };
    const scheduler = startSupplyReminderScheduler({ logger, signal, repo: repo as never, now: () => now, skipInitialRun: true });
    const result = await scheduler.runOnce();
    expect(result.reminded).toBe(0);
    expect(repo.markReminded).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("un fallo del recordatorio no tumba la pasada", async () => {
    const repo = {
      syncAll: vi.fn(async () => ({ opened: 0, closed: 0 })),
      dueReminders: vi.fn(async () => [{ id: "a-1", itemCode: "SOAP", status: "OPEN" as const, lastRemindedAt: null }]),
      markReminded: vi.fn(async () => 1),
    };
    const scheduler = startSupplyReminderScheduler({
      logger, signal, repo: repo as never, now: () => now, skipInitialRun: true,
      notifier: async () => { throw new Error("SMTP caído"); },
    });
    await expect(scheduler.runOnce()).resolves.toMatchObject({ reminded: 1 });
    expect(logger.error).toHaveBeenCalled();
    scheduler.stop();
  });
});
