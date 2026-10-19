import type { RoomPublicationStatus } from "./operations-state";

/**
 * Regla **única** de «habitación vendible en el canal público» (2026-10-18).
 *
 * Por qué existe: la misma pregunta —«¿esta habitación se puede ofrecer al huésped?»— estaba
 * respondida con tres copias de la misma expresión (catálogo público, reserva pública y panel de
 * recepción) más la que debería tener el catálogo de noches y no tenía. La consecuencia real que se
 * vio en producción: el catálogo ofrecía noches de habitaciones que **no existían** en el maestro
 * administrado (`rooms`), porque la consulta del índice no cruzaba esa fuente.
 *
 * Módulo **puro e isomorfo**: sin `pg`, sin RPC, sin reloj. Lo consume el servidor (RSC y rutas de
 * API) y podría consumirlo un componente de cliente. La fuente de verdad sigue siendo la base
 * (D-3): esta función no escribe nada, solo decide con los datos que le pasan.
 *
 * Reglas (idénticas a las del `CHECK`/API de publicación):
 *   1. `publicationStatus === "PUBLISHED"` — el administrador la ha publicado (`DRAFT`, `PAUSED`,
 *      `MAINTENANCE` y `OUT_OF_SERVICE` no se venden).
 *   2. `archivedAt === null` — la baja archivada nunca se borra (D-8) pero no se oferta.
 *   3. No estar bloqueada por una incidencia de mantenimiento abierta (`D-53`): una avería la
 *      saca del canal público aunque siga publicada.
 */

/** Datos mínimos de una habitación para decidir su venta pública. */
export interface SellableRoomInput {
  readonly id: string;
  readonly roomNumber: number;
  readonly publicationStatus: RoomPublicationStatus;
  /** `null`/`undefined` = vigente; con fecha = archivada (D-8). */
  readonly archivedAt?: Date | string | null;
}

/**
 * ¿La habitación está publicada, vigente y sin bloqueo de mantenimiento?
 *
 * `blockedRoomIds` son los **ids** de habitación que el repositorio de mantenimiento marca como no
 * vendibles (avería abierta). Se pasa como `ReadonlySet` para que la comprobación sea O(1) en las
 * listas del catálogo (hasta 100 noches) en lugar de un `includes` por noche.
 */
export function isRoomSellable(
  room: SellableRoomInput,
  blockedRoomIds: ReadonlySet<string>,
): boolean {
  return (
    room.publicationStatus === "PUBLISHED" &&
    (room.archivedAt === null || room.archivedAt === undefined) &&
    !blockedRoomIds.has(room.id)
  );
}

/**
 * Proyecta una lista de habitaciones a los **números vendibles**. El catálogo de noches solo conoce
 * el número de habitación (los `tokenId` codifican `habitación · fecha`), así que la intersección se
 * hace por número.
 *
 * La lista de habitaciones es el **maestro administrado**; un número que no esté aquí no se vende
 * aunque el índice on-chain tenga noches suyas (sería inventario no administrado o heredado de otra
 * cadena: exactamente el desfase que limpió la reconciliación de 2026-10-18).
 */
export function sellableRoomNumbers(
  rooms: readonly SellableRoomInput[],
  blockedRoomIds: ReadonlySet<string>,
): Set<number> {
  const numbers = new Set<number>();
  for (const room of rooms) {
    if (isRoomSellable(room, blockedRoomIds)) numbers.add(room.roomNumber);
  }
  return numbers;
}
