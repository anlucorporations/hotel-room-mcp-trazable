import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  classifyDay,
  countMonthDays,
  daysInMonth,
  formatIsoDate,
  isPublishedDay,
  isReservedDay,
  isoDayOf,
  mondayBasedWeekday,
  monthOfIsoDate,
  shiftMonth,
  type RoomPublicationWindow,
} from "./room-calendar";

/**
 * Pruebas de la lógica pura del calendario de publicaciones y ocupación (2026-10-02).
 *
 * Se ejercitan los casos límite que deciden el color y el texto de cada día: día libre, solo
 * publicado, solo reservado, ambas clases, ventana **abierta** (`unpublishedAt === null`) y los
 * extremos del rango inclusive, además del relleno de la rejilla a lunes y del conteo del mes.
 */

const CLOSED: RoomPublicationWindow = {
  publishedAt: "2026-10-01T09:00:00.000Z",
  unpublishedAt: "2026-10-10T18:00:00.000Z",
};

describe("room-calendar · normalización de fechas UTC", () => {
  it("reduce una marca de fecha-hora a su día UTC", () => {
    expect(isoDayOf("2026-10-02T23:59:59.000Z")).toBe("2026-10-02");
    expect(isoDayOf("  2026-10-02  ")).toBe("2026-10-02");
  });

  it("devuelve cadena vacía ante una fecha ilegible (no inventa un día)", () => {
    expect(isoDayOf("no-es-una-fecha")).toBe("");
  });

  it("compone y cuenta días con años bisiestos", () => {
    expect(formatIsoDate(2026, 10, 2)).toBe("2026-10-02");
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("sitúa el lunes como primer día de la semana", () => {
    expect(mondayBasedWeekday(2024, 1, 1)).toBe(0); // 2024-01-01 fue lunes
    expect(mondayBasedWeekday(2026, 11, 1)).toBe(6); // 2026-11-01 fue domingo
  });
});

describe("room-calendar · clasificación de un día", () => {
  it("día sin publicación ni reserva → LIBRE", () => {
    expect(classifyDay("2026-10-20", [], [])).toBe("LIBRE");
    expect(isPublishedDay("2026-10-20", [CLOSED])).toBe(false);
    expect(isReservedDay("2026-10-20", [])).toBe(false);
  });

  it("día dentro de una ventana cerrada → PUBLICADA", () => {
    expect(classifyDay("2026-10-05", [CLOSED], [])).toBe("PUBLICADA");
  });

  it("día con noche reservada → RESERVADA", () => {
    expect(classifyDay("2026-10-20", [], ["2026-10-20"])).toBe("RESERVADA");
    expect(isReservedDay("2026-10-20", ["2026-10-19", "2026-10-20"])).toBe(true);
  });

  it("día publicado y reservado a la vez → AMBAS", () => {
    expect(classifyDay("2026-10-05", [CLOSED], ["2026-10-05"])).toBe("AMBAS");
  });

  it("los extremos de la ventana son inclusive y el día siguiente ya no", () => {
    expect(isPublishedDay("2026-10-01", [CLOSED])).toBe(true);
    expect(isPublishedDay("2026-10-10", [CLOSED])).toBe(true);
    expect(isPublishedDay("2026-10-11", [CLOSED])).toBe(false);
    expect(isPublishedDay("2026-09-30", [CLOSED])).toBe(false);
  });

  it("una ventana abierta (`unpublishedAt === null`) publica indefinidamente", () => {
    const open: RoomPublicationWindow = { publishedAt: "2026-10-01", unpublishedAt: null };
    expect(isPublishedDay("2026-10-01", [open])).toBe(true);
    expect(isPublishedDay("2030-01-01", [open])).toBe(true);
  });

  it("ignora ventanas con fecha de alta ilegible y no rompe con listas vacías", () => {
    const broken: RoomPublicationWindow = { publishedAt: "???", unpublishedAt: null };
    expect(isPublishedDay("2026-10-05", [broken])).toBe(false);
    expect(classifyDay("2026-10-05", [], [])).toBe("LIBRE");
  });
});

describe("room-calendar · rejilla del mes (semana a lunes)", () => {
  it("rellena el principio con el mes anterior hasta el lunes", () => {
    // 2026-11-01 fue domingo: con lunes como primer día hacen falta 6 celdas de octubre.
    const grid = buildMonthGrid(2026, 11);
    expect(grid.length).toBe(42);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toMatchObject({ date: "2026-10-26", day: 26, inMonth: false });
    expect(grid[5]).toMatchObject({ date: "2026-10-31", inMonth: false });
    expect(grid[6]).toMatchObject({ date: "2026-11-01", day: 1, inMonth: true });
  });

  it("rellena el final con el mes siguiente y marca solo los días propios", () => {
    const grid = buildMonthGrid(2026, 11);
    expect(grid[grid.length - 1]).toMatchObject({ date: "2026-12-06", inMonth: false });
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("no añade relleno si el mes empieza en lunes y cuadra en semanas", () => {
    // 2026-06-01 fue lunes y junio tiene 30 días → 30 celdas + 5 de julio = 35.
    const grid = buildMonthGrid(2026, 6);
    expect(grid[0]).toMatchObject({ date: "2026-06-01", inMonth: true });
    expect(grid).toHaveLength(35);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(grid[grid.length - 1]).toMatchObject({ date: "2026-07-05", inMonth: false });
  });

  it("la rejilla contiene el cambio de mes con relleno por los dos lados", () => {
    const grid = buildMonthGrid(2026, 10);
    expect(grid[0]).toMatchObject({ date: "2026-09-28", inMonth: false }); // 2026-10-01 fue jueves
    expect(grid[grid.length - 1]).toMatchObject({ date: "2026-11-01", inMonth: false });
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
  });
});

describe("room-calendar · conteo del mes", () => {
  it("cuenta publicados y reservados por separado (un día puede sumar en ambos)", () => {
    const reserved = ["2026-10-03", "2026-10-05", "2026-10-31"];
    const counts = countMonthDays(2026, 10, [CLOSED], reserved);
    // La ventana cubre del 1 al 10 inclusive; las reservas caen en 3, 5 (también publicadas) y 31.
    expect(counts).toEqual({ published: 10, reserved: 3 });
    expect(classifyDay("2026-10-03", [CLOSED], reserved)).toBe("AMBAS");
    expect(classifyDay("2026-10-31", [CLOSED], reserved)).toBe("RESERVADA");
  });

  it("no cuenta el relleno de los meses vecinos", () => {
    const everyDay: RoomPublicationWindow = { publishedAt: "2020-01-01", unpublishedAt: null };
    const counts = countMonthDays(2026, 10, [everyDay], []);
    expect(counts.published).toBe(31);
    expect(counts.published).not.toBe(35);
  });

  it("un mes sin datos cuenta cero y cero", () => {
    expect(countMonthDays(2026, 10, [], [])).toEqual({ published: 0, reserved: 0 });
  });
});

describe("room-calendar · navegación y mes de una fecha", () => {
  it("desplaza meses cruzando el año en los dos sentidos", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 1, -13)).toEqual({ year: 2024, month: 12 });
    expect(shiftMonth(2026, 11, 2)).toEqual({ year: 2027, month: 1 });
  });

  it("extrae el mes de una fecha o de una marca de fecha-hora", () => {
    expect(monthOfIsoDate("2026-10-02")).toEqual({ year: 2026, month: 10 });
    expect(monthOfIsoDate("2026-10-02T23:59:59.000Z")).toEqual({ year: 2026, month: 10 });
    expect(monthOfIsoDate("no-es-una-fecha")).toBeNull();
  });
});

describe("ramas defensivas del calendario", () => {
  it("una fecha ilegible no tiene día ISO", () => {
    expect(isoDayOf("esto-no-es-una-fecha")).toBe("");
  });

  it("un día ilegible nunca está publicado ni reservado", () => {
    expect(isPublishedDay("", [])).toBe(false);
    expect(isReservedDay("", [])).toBe(false);
  });

  it("un mes fuera de rango no se puede interpretar", () => {
    expect(monthOfIsoDate("2026-13-01")).toBeNull();
    expect(monthOfIsoDate("no-es-fecha")).toBeNull();
  });
});

describe("isoDayOf — fecha interpretable sin guiones", () => {
  it("acepta una fecha que `Date` sabe leer aunque no venga en ISO con guiones", () => {
    expect(isoDayOf("2026/07/01")).toBe("2026-07-01");
  });
});
