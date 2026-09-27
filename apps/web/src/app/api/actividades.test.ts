import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../test/guard-mock";
import { ActivityError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    listActivities: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    listSchedules: vi.fn(),
    createSchedule: vi.fn(),
    setScheduleActive: vi.fn(),
    listBookings: vi.fn(),
    book: vi.fn(),
    cancelBooking: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, ActivitiesRepository: vi.fn(() => mockRepo) };
});

import { GET as activitiesGet, POST as activitiesPost } from "./admin/actividades/activities/route";
import { PATCH as activityPatch } from "./admin/actividades/activities/[id]/route";
import { GET as adminSchedulesGet, POST as adminSchedulesPost } from "./admin/actividades/schedules/route";
import { PATCH as schedulePatch } from "./admin/actividades/schedules/[id]/route";
import { GET as receptionSchedulesGet } from "./reception/actividades/schedules/route";
import { GET as bookingsGet, POST as bookingsPost } from "./reception/actividades/bookings/route";
import { DELETE as bookingDelete } from "./reception/actividades/bookings/[id]/route";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("API de Actividades (F5 · D-44…D-47)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("el catálogo y los horarios de administración son solo del owner", async () => {
    mockRepo.listActivities.mockResolvedValue([]);
    await activitiesGet(new NextRequest("http://localhost/api/admin/actividades/activities"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");

    mockRepo.listSchedules.mockResolvedValue([]);
    await adminSchedulesGet(new NextRequest("http://localhost/api/admin/actividades/schedules"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("crea una actividad validando su entrada (D-44)", async () => {
    mockRepo.createActivity.mockResolvedValueOnce({ id: "act-1", code: "KAYAK" });
    const ok = await activitiesPost(
      jsonRequest("http://localhost/api/admin/actividades/activities", { code: "kayak", nameEs: "Kayak", priceCents: 2500 }),
    );
    expect(ok.status).toBe(201);
    expect(mockRepo.createActivity).toHaveBeenCalledWith(expect.objectContaining({ code: "KAYAK", priceCents: 2500 }));

    const bad = await activitiesPost(jsonRequest("http://localhost/api/admin/actividades/activities", { code: "X" }));
    expect(bad.status).toBe(400);
  });

  it("edita una actividad y responde 404 si no existe", async () => {
    mockRepo.updateActivity.mockResolvedValueOnce({ id: "act-1", active: false });
    const ok = await activityPatch(
      jsonRequest("http://localhost/api/admin/actividades/activities/act-1", { active: false }, "PATCH"),
      { params: Promise.resolve({ id: "act-1" }) },
    );
    expect(ok.status).toBe(200);

    mockRepo.updateActivity.mockResolvedValueOnce(null);
    const missing = await activityPatch(
      jsonRequest("http://localhost/api/admin/actividades/activities/act-1", { active: true }, "PATCH"),
      { params: Promise.resolve({ id: "act-1" }) },
    );
    expect(missing.status).toBe(404);
  });

  it("crea un horario con cupo estricto (D-47)", async () => {
    mockRepo.createSchedule.mockResolvedValueOnce({ id: "sch-1" });
    const ok = await adminSchedulesPost(
      jsonRequest("http://localhost/api/admin/actividades/schedules", {
        activityId: "act-1",
        startsAt: "2026-10-01T10:00:00.000Z",
        capacity: 8,
      }),
    );
    expect(ok.status).toBe(201);

    const bad = await adminSchedulesPost(
      jsonRequest("http://localhost/api/admin/actividades/schedules", { activityId: "act-1", startsAt: "no", capacity: 0 }),
    );
    expect(bad.status).toBe(400);
  });

  it("activa o cierra un horario", async () => {
    mockRepo.setScheduleActive.mockResolvedValueOnce({ id: "sch-1", active: false });
    const res = await schedulePatch(
      jsonRequest("http://localhost/api/admin/actividades/schedules/sch-1", { active: false }, "PATCH"),
      { params: Promise.resolve({ id: "sch-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("la recepción ve los horarios del día con su ocupación (D-44)", async () => {
    mockRepo.listSchedules.mockResolvedValueOnce([{ id: "sch-1", remaining: 2 }]);
    const res = await receptionSchedulesGet(new NextRequest("http://localhost/api/reception/actividades/schedules?date=2026-10-01"));
    expect(res.status).toBe(200);
    expect(lastRequiredRole()).toBe("RECEPTION_ROLE");
    const [options] = mockRepo.listSchedules.mock.calls[0] as [Record<string, unknown>];
    expect(options).toMatchObject({ activeOnly: true });

    const bad = await receptionSchedulesGet(new NextRequest("http://localhost/api/reception/actividades/schedules?date=2026-13-01"));
    expect(bad.status).toBe(400);
  });

  it("inscribe en una actividad con estancia activa y cargo al folio (D-45/D-46)", async () => {
    mockRepo.book.mockResolvedValueOnce({ id: "bk-1", status: "BOOKED", chargeId: "charge-1" });
    const res = await bookingsPost(
      jsonRequest("http://localhost/api/reception/actividades/bookings", {
        scheduleId: "sch-1",
        reservationId: "res-1",
        seats: 2,
      }),
    );
    expect(res.status).toBe(201);
    expect(mockRepo.book).toHaveBeenCalledWith(expect.objectContaining({ seats: 2, allowWaitlist: false, createdBy: "admin@hotel.es" }));
  });

  it("responde 409 si la estancia no está activa o no hay plazas (D-45/D-47)", async () => {
    mockRepo.book.mockRejectedValueOnce(new ActivityError("SOLD_OUT", "completo"));
    const res = await bookingsPost(
      jsonRequest("http://localhost/api/reception/actividades/bookings", { scheduleId: "sch-1", reservationId: "res-1" }),
    );
    expect(res.status).toBe(409);
  });

  it("cancela una inscripción y devuelve la plaza promocionada (D-47)", async () => {
    mockRepo.cancelBooking.mockResolvedValueOnce({ booking: { id: "bk-1", status: "CANCELLED" }, promoted: { id: "bk-wait" } });
    const res = await bookingDelete(
      new NextRequest("http://localhost/api/reception/actividades/bookings/bk-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "bk-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.promoted.id).toBe("bk-wait");
  });

  it("lista las inscripciones por horario o por reserva", async () => {
    mockRepo.listBookings.mockResolvedValueOnce([]);
    await bookingsGet(new NextRequest("http://localhost/api/reception/actividades/bookings?scheduleId=sch-1"));
    expect(mockRepo.listBookings).toHaveBeenCalledWith({ scheduleId: "sch-1", reservationId: undefined });
  });
});
