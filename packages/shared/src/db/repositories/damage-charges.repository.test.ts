import { describe, expect, it, vi } from "vitest";
import type { QueryResultRow } from "pg";
import { DamageChargeError, DamageChargesRepository } from "./damage-charges.repository";

/**
 * Pruebas del repositorio de cargos por daños (F7 · T7.1/T7.5/T7.6).
 *
 * El doble de pool enruta por el SQL; las pruebas fijan los invariantes: alta atómica con
 * `signature_id = NULL`, transiciones compare-and-set, plazo de reclamación, resolución que cancela
 * el cargo rechazado y anonimización de evidencias pasada la retención.
 */

function chargeRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "dc-1",
    charge_id: "ch-1",
    room_id: "room-1",
    token_id: "20120261116",
    inspection_id: null,
    reported_by: "ama@hotel.es",
    damage_description: "Mesa rayada",
    evidence_path: "evidencias/mesa.jpg",
    approved_by: "ama@hotel.es",
    signature_id: null,
    audit_log_id: null,
    created_at: new Date("2026-10-19T10:00:00Z"),
    ...overrides,
  };
}

function notificationRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "n-1",
    damage_charge_id: "dc-1",
    channel: "EMAIL",
    status: "PENDING",
    due_date: new Date(Date.now() + 86_400_000),
    sent_at: null,
    dispute_notes: null,
    disputed_at: null,
    resolved_by: null,
    resolved_at: null,
    ...overrides,
  };
}

function viewRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    ...notificationRow(),
    charge_id: "ch-1",
    room_id: "room-1",
    token_id: "20120261116",
    damage_description: "Mesa rayada",
    evidence_path: "evidencias/mesa.jpg",
    reported_by: "ama@hotel.es",
    created_at: new Date("2026-10-19T10:00:00Z"),
    concept: "Daños en la habitación",
    amount_cents: "4500",
    currency: "EUR",
    charge_status: "PENDING",
    room_number: 201,
    ...overrides,
  };
}

function fakePool(handlers: { row?: QueryResultRow; rows?: QueryResultRow[]; rowCount?: number } = {}) {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };
    if (s.startsWith("INSERT INTO additional_charges")) return { rows: [{ id: "ch-1" }], rowCount: 1 };
    if (s.startsWith("INSERT INTO housekeeping_damage_charges")) {
      return { rows: [handlers.row ?? chargeRow()], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO damage_charge_guest_notifications")) {
      return { rows: [notificationRow()], rowCount: 1 };
    }
    if (s.startsWith("UPDATE housekeeping_damage_charges SET audit_log_id")) return { rows: [], rowCount: 1 };
    if (s.startsWith("UPDATE housekeeping_damage_charges c")) {
      return { rows: [], rowCount: handlers.rowCount ?? 1 };
    }
    if (s.startsWith("UPDATE damage_charge_guest_notifications n")) {
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("UPDATE damage_charge_guest_notifications")) {
      return { rows: [{ id: "n-1" }], rowCount: handlers.rowCount ?? 1 };
    }
    if (s.startsWith("SELECT n.*, c.charge_id")) {
      return { rows: handlers.rows ?? [handlers.row ?? viewRow()], rowCount: 1 };
    }
    if (s.startsWith("UPDATE additional_charges ch")) {
      return {
        rows: [{ id: "ch-1", concept: "Daños en la habitación", amount_cents: "4500", currency: "EUR" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: handlers.rowCount ?? 0 };
  });
  const client = { query, release: vi.fn() };
  return {
    query,
    client,
    connect: vi.fn(async () => client),
  } as unknown as {
    query: typeof query;
    client: typeof client;
    connect: ReturnType<typeof vi.fn>;
  };
}

const audit = { append: vi.fn(async () => ({ id: "audit-1" })) };

describe("DamageChargesRepository (F7)", () => {
  it("el alta crea cargo + detalle SIN firma on-chain y deja notificación pendiente", async () => {
    const pool = fakePool();
    const repo = new DamageChargesRepository(pool as never, audit as never);
    const result = await repo.createChargeWithNotification({
      roomId: "room-1",
      tokenId: "20120261116",
      reportedBy: "ama@hotel.es",
      approvedBy: "ama@hotel.es",
      actorRole: "HEAD_KEEPER",
      damageDescription: "Mesa rayada",
      amountCents: 4500,
      evidencePath: "evidencias/mesa.jpg",
    });
    expect(result.damageCharge.signatureId).toBeNull();
    const inserts = pool.client.query.mock.calls.map(([sql]) => String(sql));
    expect(inserts.some((sql) => sql.includes("INSERT INTO additional_charges"))).toBe(true);
    expect(inserts.some((sql) => sql.includes("signature_id"))).toBe(true);
    // La traza de auditoría se enlaza al cargo.
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "DAMAGE_CHARGE", action: "CREATE" }),
    );
  });

  it("reclamar dentro de plazo deja DISPUTED; fuera de plazo lanza NOTIFICATION_NOT_CLAIMABLE", async () => {
    const ok = fakePool({ row: viewRow({ status: "SENT" }) });
    const repo = new DamageChargesRepository(ok as never, audit as never);
    const claimed = await repo.claimNotification("n-1", "No fui yo");
    expect(claimed).toBeTruthy();
    expect(ok.client.query.mock.calls.some(([sql]) => String(sql).includes("dispute_notes"))).toBe(true);

    const late = fakePool({
      rows: [viewRow({ status: "SENT", due_date: new Date(Date.now() - 1000) })],
    });
    const repoLate = new DamageChargesRepository(late as never, audit as never);
    await expect(repoLate.claimNotification("n-1", null)).rejects.toBeInstanceOf(DamageChargeError);
  });

  it("resolver aceptando mantiene el cargo para el folio", async () => {
    const pool = fakePool({ rows: [viewRow({ status: "DISPUTED" })] });
    const repo = new DamageChargesRepository(pool as never, audit as never);
    const result = await repo.resolveNotification({ id: "n-1", accepted: true, resolvedBy: "recepcion" });
    expect(result.chargeStatus).toBe("PENDING");
    const updates = pool.client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("UPDATE additional_charges"),
    );
    expect(updates.length).toBe(1);
    expect((updates[0]?.[1] as unknown[])[1]).toBe("PENDING");
  });

  it("resolver rechazando cancela el cargo adicional", async () => {
    const pool = fakePool({ rows: [viewRow({ status: "DISPUTED" })] });
    const repo = new DamageChargesRepository(pool as never, audit as never);
    const result = await repo.resolveNotification({ id: "n-1", accepted: false, resolvedBy: "recepcion" });
    expect(result.chargeStatus).toBe("CANCELLED");
    const update = pool.client.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE additional_charges"));
    expect((update?.[1] as unknown[])[1]).toBe("CANCELLED");
  });

  it("no resuelve una notificación que no está reclamada ni vencida", async () => {
    const pool = fakePool({ rows: [viewRow({ status: "SENT" })] });
    const repo = new DamageChargesRepository(pool as never, audit as never);
    await expect(
      repo.resolveNotification({ id: "n-1", accepted: true, resolvedBy: "recepcion" }),
    ).rejects.toMatchObject({ code: "NOTIFICATION_NOT_DISPUTED" });
  });

  it("expira las notificaciones con plazo vencido", async () => {
    const pool = fakePool({ rowCount: 3 });
    const repo = new DamageChargesRepository(pool as never, audit as never);
    await expect(repo.expireOverdueNotifications()).resolves.toBe(3);
  });

  it("el check-out cobra los cargos con reclamación aceptada y los devuelve para el folio", async () => {
    const pool = fakePool();
    const repo = new DamageChargesRepository(pool as never, audit as never);
    const settled = await repo.settleAcceptedChargesForToken("20120261116", "recepcion");
    expect(settled).toEqual([
      { chargeId: "ch-1", concept: "Daños en la habitación", amountCents: 4500, currency: "EUR" },
    ]);
  });

  it("anonimiza evidencias pasada la retención (GDPR) sin borrar la traza", async () => {
    const pool = fakePool({ rowCount: 2 });
    const repo = new DamageChargesRepository(pool as never, audit as never);
    await expect(repo.anonymizeExpiredEvidence()).resolves.toBe(2);
    const set = pool.client.query.mock.calls.find(([sql]) => String(sql).includes("evidence_path = NULL"));
    expect(set).toBeDefined();
  });
});
