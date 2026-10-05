import { describe, it, expect } from "vitest";
import {
  addDays,
  aggregateBoardDays,
  enumerateDates,
  isDayRoomEligible,
  rangeForView,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  type RoomDayState,
} from "./room-board-calendar";

const state = (roomId: string, date: string, flags: Partial<Omit<RoomDayState, "roomId" | "date">> = {}): RoomDayState => ({
  roomId,
  date,
  published: flags.published ?? false,
  reserved: flags.reserved ?? false,
  occupied: flags.occupied ?? false,
});

describe("aritmética de fechas UTC", () => {
  it("addDays cruza meses y años", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("startOf* devuelve el primer día del mes, el lunes y el trimestre", () => {
    expect(startOfMonth("2026-10-07")).toBe("2026-10-01");
    expect(startOfWeek("2026-10-07")).toBe("2026-10-05"); // miércoles → lunes
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); // lunes → él mismo
    expect(startOfQuarter("2026-10-07")).toBe("2026-10-01");
    expect(startOfQuarter("2026-01-15")).toBe("2026-01-01");
    expect(startOfQuarter("2026-08-31")).toBe("2026-07-01");
  });
});

describe("rangeForView", () => {
  it("día: el propio día", () => {
    expect(rangeForView("DAY", "2026-10-07")).toEqual({ from: "2026-10-07", to: "2026-10-07" });
  });

  it("semana: lunes a domingo", () => {
    expect(rangeForView("WEEK", "2026-10-07")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });

  it("mes: del 1 al último, también en febrero bisiesto y no bisiesto", () => {
    expect(rangeForView("MONTH", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeForView("MONTH", "2027-02-10")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(rangeForView("MONTH", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("trimestre: 92 días como máximo y cierra el año", () => {
    expect(rangeForView("QUARTER", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(rangeForView("QUARTER", "2026-01-15")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(rangeForView("QUARTER", "2026-02-15")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
});

describe("enumerateDates", () => {
  it("enumera el rango con los dos extremos inclusive", () => {
    const dates = enumerateDates({ from: "2026-10-01", to: "2026-10-05" });
    expect(dates).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });

  it("respeta el tope de seguridad", () => {
    const dates = enumerateDates({ from: "2026-01-01", to: "2030-01-01" }, 10);
    expect(dates).toHaveLength(10);
  });
});

describe("aggregateBoardDays", () => {
  const range = { from: "2026-10-05", to: "2026-10-07" };

  it("cuenta cada estado por separado y suma una habitación a los dos si procede", () => {
    const totals = aggregateBoardDays(
      [
        state("r1", "2026-10-05", { published: true, reserved: true }),
        state("r2", "2026-10-05", { published: true }),
        state("r3", "2026-10-05", { occupied: true }),
      ],
      [],
      range,
    );
    const day = totals[0]!;
    expect(day.date).toBe("2026-10-05");
    expect(day.published).toBe(2);
    expect(day.reserved).toBe(1);
    expect(day.occupied).toBe(1);
    // r1 está publicada y reservada: suma a ambos contadores pero es UNA habitación con actividad.
    expect(day.withActivity).toBe(3);
  });

  it("pinta el mantenimiento en todos los días del rango (estado actual, sin día programado)", () => {
    const totals = aggregateBoardDays([], ["r9"], range);
    expect(totals.map((day) => day.maintenance)).toEqual([1, 1, 1]);
    expect(totals.every((day) => day.withActivity === 1)).toBe(true);
  });

  it("devuelve ceros en los días sin ningún estado", () => {
    const totals = aggregateBoardDays([state("r1", "2026-10-06", { published: true })], [], range);
    const first = totals[0]!;
    expect(first).toMatchObject({ date: "2026-10-05", published: 0, reserved: 0, occupied: 0, withActivity: 0 });
  });

  it("ignora los estados fuera del rango", () => {
    const totals = aggregateBoardDays([state("r1", "2026-11-01", { published: true })], [], range);
    expect(totals.every((day) => day.published === 0)).toBe(true);
  });

  it("no cuenta dos veces la misma habitación en el mismo estado y día", () => {
    const totals = aggregateBoardDays(
      [state("r1", "2026-10-05", { reserved: true }), state("r1", "2026-10-05", { reserved: true })],
      [],
      range,
    );
    expect(totals[0]!.reserved).toBe(1);
  });
});

describe("isDayRoomEligible (panel del día)", () => {
  const base = { published: false, reserved: false, occupied: false, maintenance: false, publicationStatus: "DRAFT" };

  it("PUBLISH: solo si la noche está libre, no hay mantenimiento y no está publicada", () => {
    expect(isDayRoomEligible(base, "PUBLISH")).toBe(true);
    expect(isDayRoomEligible({ ...base, published: true }, "PUBLISH")).toBe(false);
    expect(isDayRoomEligible({ ...base, publicationStatus: "PUBLISHED" }, "PUBLISH")).toBe(false);
    expect(isDayRoomEligible({ ...base, reserved: true }, "PUBLISH")).toBe(false);
    expect(isDayRoomEligible({ ...base, occupied: true }, "PUBLISH")).toBe(false);
    expect(isDayRoomEligible({ ...base, maintenance: true }, "PUBLISH")).toBe(false);
  });

  it("RESERVE: noche libre y sin mantenimiento", () => {
    expect(isDayRoomEligible(base, "RESERVE")).toBe(true);
    expect(isDayRoomEligible({ ...base, reserved: true }, "RESERVE")).toBe(false);
    expect(isDayRoomEligible({ ...base, occupied: true }, "RESERVE")).toBe(false);
    expect(isDayRoomEligible({ ...base, maintenance: true }, "RESERVE")).toBe(false);
  });

  it("RELEASE: solo lo que tiene reserva viva", () => {
    expect(isDayRoomEligible({ ...base, reserved: true }, "RELEASE")).toBe(true);
    expect(isDayRoomEligible(base, "RELEASE")).toBe(false);
  });

  it("MINT: noche libre (la cadena vuelve a validar)", () => {
    expect(isDayRoomEligible(base, "MINT")).toBe(true);
    expect(isDayRoomEligible({ ...base, reserved: true }, "MINT")).toBe(false);
    expect(isDayRoomEligible({ ...base, occupied: true }, "MINT")).toBe(false);
  });

  it("SERVICE: cualquier habitación", () => {
    expect(isDayRoomEligible({ ...base, occupied: true, maintenance: true }, "SERVICE")).toBe(true);
  });
});
