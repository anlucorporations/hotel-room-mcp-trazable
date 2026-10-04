import type { AdminRoom } from "./room-dto";

/**
 * Reglas de las **acciones masivas** del tablero de habitaciones (2026-10-04, petición del responsable).
 *
 * Viven en un módulo puro —sin React ni acceso a la API— para poder probarlas y para que la interfaz
 * (qué casillas se pueden marcar) y el criterio de negocio sean **una sola fuente**. La API revérifica
 * por su cuenta: estas reglas son de interfaz, no la autoridad final.
 *
 * Definiciones acordadas con el responsable:
 *   · **Reservada** = tiene al menos una noche ocupada por una reserva viva o un token vendido en la
 *     ventana de hoy a +150 días (`room.reservedNights > 0`, lo aporta `GET /api/admin/rooms`).
 *   · **Activa** (en venta) = `PUBLISHED`.
 *
 * Elegibilidad por acción:
 *   · `PUBLISH`: habilitada — limpia y sin reserva — y **no** publicada todavía.
 *   · `RELEASE`: solo las reservadas.
 *   · `TOGGLE`: solo las activas (publicadas) y sin reserva.
 */

/** Acción masiva del tablero. */
export type BulkAction = "PUBLISH" | "RELEASE" | "TOGGLE";

/** ¿Esta habitación se puede marcar para esta acción masiva? */
export function isRoomEligibleForBulk(room: AdminRoom, action: BulkAction): boolean {
  switch (action) {
    case "PUBLISH":
      return (
        room.publicationStatus !== "PUBLISHED" &&
        room.operationalStatus === "CLEAN" &&
        room.reservedNights === 0
      );
    case "RELEASE":
      return room.reservedNights > 0;
    case "TOGGLE":
      return room.publicationStatus === "PUBLISHED" && room.reservedNights === 0;
  }
}

/** Ids de las habitaciones marcables para la acción, en el orden del listado. */
export function selectableRoomIds(rooms: readonly AdminRoom[], action: BulkAction): string[] {
  return rooms.filter((room) => isRoomEligibleForBulk(room, action)).map((room) => room.id);
}
