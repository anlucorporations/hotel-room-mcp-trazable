/**
 * Contrato **de cliente** del tablero de disponibilidad (2026-10-04).
 *
 * Se declara aparte del contenedor y del panel para que el contenedor
 * (`RoomsBoardAdmin`) y el panel (`BoardDayActions`) compartan las formas sin importarse entre sí.
 */

/** Habitación con su estado en el día consultado, tal y como lo entrega `GET /api/admin/rooms/calendar`. */
export interface DayRoom {
  id: string;
  roomNumber: number;
  roomType: string;
  floor: number | null;
  publicationStatus: string;
  operationalStatus: string;
  published: boolean;
  reserved: boolean;
  occupied: boolean;
  maintenance: boolean;
}

/** Detalle de un día: todas las habitaciones con su estado y el resumen. */
export interface DayDetail {
  date: string;
  rooms: DayRoom[];
  summary: { published: number; reserved: number; occupied: number; maintenance: number };
}

/** Aviso del panel (mismo patrón que el resto del back-office). */
export interface BoardNotice {
  kind: "ok" | "error";
  text: string;
}
