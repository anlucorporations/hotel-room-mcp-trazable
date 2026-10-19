import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { startSlaScheduler } from "./sla-scheduler";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const signal = new AbortController().signal;
const now = new Date("2026-10-20T10:00:00Z");

const task = {
  id: "t-1", planName: "Extintores", completedAt: new Date("2026-10-19T08:00:00Z"),
  status: "DONE", dueDate: "2026-10-19", overdue: false, equipment: null, roomNumber: null,
  areaName: null, requiresSignature: false, signatureId: null, evidencePath: null,
  assignedTo: "tecnico1", validationStatus: "PENDING_VERIFICATION_EXPIRED", planId: "p", planCode: null,
  periodicity: null, completedBy: "Técnico Uno", notes: null, isCritical: false, areaId: null, updatedAt: now,
};

describe("planificador de SLA de validación (F8 · T8.3 · RNF-M-21)", () => {
  it("expira las validaciones vencidas y escala al Administrador", async () => {
    const repo = { expireValidations: vi.fn(async () => [task]) };
    const escalate = vi.fn(async () => undefined);
    const scheduler = startSlaScheduler({ logger, signal, repo: repo as never, escalate, now: () => now, skipInitialRun: true });
    const result = await scheduler.runOnce();
    expect(result.expired).toBe(1);
    expect(repo.expireValidations).toHaveBeenCalledWith(24, now);
    expect(escalate).toHaveBeenCalledWith([expect.stringContaining("Validación vencida")]);
    scheduler.stop();
  });

  it("sin tareas vencidas no escala", async () => {
    const repo = { expireValidations: vi.fn(async () => []) };
    const escalate = vi.fn(async () => undefined);
    const scheduler = startSlaScheduler({ logger, signal, repo: repo as never, escalate, now: () => now, skipInitialRun: true });
    const result = await scheduler.runOnce();
    expect(result.expired).toBe(0);
    expect(escalate).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("un error del repositorio no tumba al worker", async () => {
    const repo = { expireValidations: vi.fn(async () => { throw new Error("DB caída"); }) };
    const scheduler = startSlaScheduler({ logger, signal, repo: repo as never, now: () => now, skipInitialRun: true });
    const result = await scheduler.runOnce().catch(() => null);
    expect(result).toBeNull();
    scheduler.stop();
  });
});
