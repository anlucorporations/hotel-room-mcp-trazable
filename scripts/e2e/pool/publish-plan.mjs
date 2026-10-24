import { loginAdmin, listRooms, publishForDate } from "./lib/publish.mjs";

/**
 * Plan de publicación del pool (requisito 2): 2 simples, 2 dobles y 2 suites en fechas
 * aleatorias dentro de los próximos 2 meses contados desde el 2026-10-24 (red Besu 81234).
 * Cada habitación recibe varias fechas para que las 5 cuentas tengan inventario suficiente
 * (15+ reservas, subastas/reventa y usos).
 */
export const PUBLISH_PLAN = [
  { roomNumber: 101, type: "SIMPLE", dates: ["2026-11-05", "2026-11-18", "2026-12-02", "2026-12-15"] },
  { roomNumber: 102, type: "SIMPLE", dates: ["2026-11-08", "2026-11-21", "2026-12-05", "2026-12-18"] },
  { roomNumber: 116, type: "DOBLE", dates: ["2026-11-10", "2026-11-24", "2026-12-08", "2026-12-20"] },
  { roomNumber: 117, type: "DOBLE", dates: ["2026-11-12", "2026-11-27", "2026-12-10", "2026-12-22"] },
  { roomNumber: 201, type: "SUITE", dates: ["2026-11-14", "2026-11-29", "2026-12-12", "2026-12-23"] },
  { roomNumber: 202, type: "SUITE", dates: ["2026-11-16", "2026-12-01", "2026-12-14", "2026-12-24"] },
];
