import { describe, it, expect } from "vitest";
import { boardSignature, defaultBoardDate, isIsoDate, parseShiftLabel } from "./housekeeping-board";
import type { HousekeepingBoard } from "@hotel/shared";

function board(overrides: Partial<HousekeepingBoard> = {}): HousekeepingBoard {
  return {
    date: "2026-09-27",
    shifts: [
      { id: "s1", shiftDate: "2026-09-27", label: "MANANA", supervisor: "Elena", createdAt: new Date() },
    ],
    assignments: [
      {
        id: "a1",
        shiftId: "s1",
        roomId: "r1",
        roomNumber: 101,
        assignee: "Marta",
        status: "PENDING",
        assignedAt: new Date(),
        completedAt: null,
      },
    ],
    lowStock: [],
    generatedAt: "2026-09-27T06:00:00.000Z",
    ...overrides,
  };
}

describe("utilidades del tablero de Housekeeping (F3 · D-30, D-48)", () => {
  it("usa la fecha de hoy en formato ISO", () => {
    expect(defaultBoardDate(new Date("2026-09-27T15:00:00Z"))).toBe("2026-09-27");
  });

  it("valida fechas ISO reales (rechaza 2026-02-31)", () => {
    expect(isIsoDate("2026-09-27")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("27/09/2026")).toBe(false);
  });

  it("normaliza la etiqueta de turno aceptando minúsculas y tildes", () => {
    expect(parseShiftLabel("mañana")).toBe("MANANA");
    expect(parseShiftLabel("TARDE")).toBe("TARDE");
    expect(parseShiftLabel("otro")).toBeNull();
  });

  it("la firma ignora generatedAt pero cambia con el estado", () => {
    const base = board();
    const later = board({ generatedAt: "2026-09-27T07:00:00.000Z" });
    expect(boardSignature(base)).toBe(boardSignature(later));

    const changed = board({
      assignments: [{ ...base.assignments[0]!, status: "DONE" }],
    });
    expect(boardSignature(changed)).not.toBe(boardSignature(base));
  });

  it("la firma cambia si aparece una alerta de stock", () => {
    const withLow = board({
      lowStock: [
        { id: "sup", code: "SOAP", nameEs: "Jabón", nameEn: null, nameRu: null, unit: "unit", stockQty: 1, thresholdQty: 2, updatedAt: new Date() },
      ],
    });
    expect(boardSignature(withLow)).not.toBe(boardSignature(board()));
  });
});

describe("parseShiftLabel — entradas que no son texto", () => {
  it("devuelve null si la etiqueta no es una cadena", () => {
    for (const valor of [42, null, undefined, { turno: "MANANA" }]) {
      expect(parseShiftLabel(valor), String(valor)).toBeNull();
    }
  });
});
