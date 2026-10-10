"use client";

import { useTranslations } from "next-intl";
import { MaintenanceIcon, OccupiedIcon, PublishedIcon, ReservedIcon } from "@/components/rooms/roomIcons";
import { isDayRoomEligible, roomTypeLabelKey, type BoardDayAction } from "@/lib/room-board-calendar";
import type { DayRoom } from "./board-dto";

/**
 * **Ribbon de habitación** (petición del responsable, 2026-10-10): la pieza mínima con la que se
 * compone la cuadrícula de cada planta en el panel del día.
 *
 * Tres franjas, de arriba abajo:
 *   · **cabecera** — número y **tipo** de la habitación (para elegirla por ambos);
 *   · **cuerpo** — el **estado** del día, siempre con icono **y** texto (el color nunca es la única
 *     señal, WCAG 1.4.1), o «Libre» cuando no hay nada que contar;
 *   · **pie** — el **check** de selección, con área táctil de altura completa y etiqueta visible.
 *
 * El estado es informativo; el check se **deshabilita** cuando la acción elegida no admite esa
 * habitación (`isDayRoomEligible`), que es la misma regla que valida la API antes de actuar.
 */

export interface DayRoomRibbonProps {
  readonly room: DayRoom;
  /** Acción activa del panel: decide si la habitación se puede marcar. */
  readonly action: BoardDayAction;
  readonly selected: boolean;
  readonly onToggle: (roomId: string) => void;
}

export function DayRoomRibbon({ room, action, selected, onToggle }: DayRoomRibbonProps) {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  // El tipo se traduce con el namespace `roomType` (el mismo del catálogo público).
  const tRoom = useTranslations("roomType");

  const canSelect = isDayRoomEligible(room, action);
  const labelKey = roomTypeLabelKey(room.roomType);
  const typeLabel = labelKey ? tRoom(labelKey) : room.roomType;
  const idle = !room.published && !room.reserved && !room.occupied && !room.maintenance;

  return (
    <li
      data-testid={`board-room-ribbon-${room.roomNumber}`}
      className={`flex flex-col overflow-hidden rounded-brand border bg-shell transition-colors ${
        selected ? "border-azure ring-1 ring-azure" : "border-line"
      } ${canSelect ? "" : "opacity-60"}`}
    >
      {/* Cabecera: número y tipo */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-mist-2 px-3 py-1.5">
        <span className="font-semibold text-ink">{room.roomNumber}</span>
        <span
          data-testid={`board-room-type-${room.roomNumber}`}
          className="rounded-pill border border-line bg-shell px-2 py-0.5 text-micro font-medium text-ink-soft"
        >
          {typeLabel}
        </span>
      </div>

      {/* Cuerpo: estado del día (icono + texto) */}
      <div className="flex min-h-[2.75rem] flex-1 flex-wrap content-center items-center gap-x-2 gap-y-1 px-3 py-2 text-micro text-ink-soft">
        {room.published && (
          <span className="inline-flex items-center gap-1 text-success">
            <PublishedIcon size={13} />
            {ta("boardLegendPublished")}
          </span>
        )}
        {room.reserved && (
          <span className="inline-flex items-center gap-1 text-info">
            <ReservedIcon size={13} />
            {ta("boardLegendReserved")}
          </span>
        )}
        {room.occupied && (
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <OccupiedIcon size={13} />
            {ta("boardLegendOccupied")}
          </span>
        )}
        {room.maintenance && (
          <span className="inline-flex items-center gap-1 text-warning">
            <MaintenanceIcon size={13} />
            {ta("boardLegendMaintenance")}
          </span>
        )}
        {idle && <span>{ta("boardNoActivity")}</span>}
      </div>

      {/* Pie: el check de selección */}
      <label
        className={`flex min-h-touch items-center gap-2 border-t border-line px-3 py-1.5 text-small font-medium ${
          canSelect ? "cursor-pointer text-ink" : "cursor-not-allowed text-ink-soft"
        }`}
      >
        <input
          type="checkbox"
          data-testid={`board-room-${room.roomNumber}`}
          checked={selected}
          disabled={!canSelect}
          onChange={() => onToggle(room.id)}
          // El tipo va en el nombre accesible: quien navega con lector de pantalla elige igual que
          // quien ve la etiqueta («Seleccionar Nº 101, Tipo Doble»).
          aria-label={`${ta("boardRoomSelect")} ${t("colNumber")} ${room.roomNumber}, ${t("colType")} ${typeLabel}`}
          className="h-4 w-4 flex-none accent-azure disabled:opacity-30"
        />
        {ta("boardRoomSelect")}
      </label>
    </li>
  );
}
