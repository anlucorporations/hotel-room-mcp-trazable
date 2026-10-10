"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/ModalShell";
import { groupRoomsByFloor, isDayRoomEligible, type BoardDayAction } from "@/lib/room-board-calendar";
import { BoardDayActions } from "./BoardDayActions";
import { DayRoomRibbon } from "./DayRoomRibbon";
import type { BoardNotice, DayDetail } from "./board-dto";

/**
 * **Gestión del día en flotante** (petición del responsable, 2026-10-10).
 *
 * Antes la gestión del día vivía en una tarjeta **debajo** del calendario: al elegir un día había que
 * bajar por la página para ver el resumen, las acciones y las habitaciones, y el mapa quedaba fuera de
 * vista. Ahora se abre como diálogo flotante sobre el propio calendario (`ModalShell`: foco al abrir,
 * trampa de foco, `Escape`, devolución del foco al día que lo abrió), así que elegir día y gestionarlo
 * ocurren en el mismo sitio.
 *
 * **La fila de cada habitación muestra su TIPO** (`SIMPLE`/`DOBLE`/`SUITE`, traducido con
 * `rooms.types.*`): el operador elige la habitación por número **y** tipo, y el tipo entra también en
 * el nombre accesible de la casilla. Un código desconocido se pinta tal cual —nunca una clave cruda—
 * para que una habitación con un tipo nuevo siga siendo seleccionable.
 *
 * El contenedor (`RoomsBoardAdmin`) sigue siendo el dueño del estado (día, acción, selección y
 * recarga); este panel solo lo presenta.
 */

const FIELD =
  "min-h-touch rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";

export interface BoardDayDialogProps {
  /** Día gestionado (`AAAA-MM-DD`). */
  readonly date: string;
  /** Detalle del día (habitaciones y resumen); `null` mientras carga. */
  readonly day: DayDetail | null;
  /** Carga del detalle en curso. */
  readonly loading: boolean;
  readonly action: BoardDayAction;
  readonly onActionChange: (action: BoardDayAction) => void;
  /** Habitaciones marcadas (por `id`). */
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggle: (roomId: string) => void;
  /** Reemplaza la selección entera (seleccionar las elegibles / limpiar). */
  readonly onSelectionChange: (ids: ReadonlySet<string>) => void;
  readonly canPublish: boolean;
  readonly canMint: boolean;
  /** Aviso de la última operación; se pinta dentro del panel, que es lo que el operador ve. */
  readonly notice: BoardNotice | null;
  readonly onNotice: (notice: BoardNotice) => void;
  readonly onReload: () => Promise<void>;
  readonly onClose: () => void;
}

export function BoardDayDialog({
  date,
  day,
  loading,
  action,
  onActionChange,
  selectedIds,
  onToggle,
  onSelectionChange,
  canPublish,
  canMint,
  notice,
  onNotice,
  onReload,
  onClose,
}: BoardDayDialogProps) {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  // El TOTP de publicación se apila encima: mientras está abierto, `Escape` y `Tab` son suyos.
  const [nestedOpen, setNestedOpen] = useState(false);

  const rooms = day?.rooms ?? [];
  const eligible = rooms.filter((room) => isDayRoomEligible(room, action)).map((room) => room.id);
  const selectedRooms = rooms.filter((room) => selectedIds.has(room.id));
  const allEligibleSelected = eligible.length > 0 && eligible.every((id) => selectedIds.has(id));
  // Fichas por planta (ordenadas), que es como se presenta el día: cada planta, su cuadrícula.
  const floors = groupRoomsByFloor(rooms);

  // Fecha larga en la zona con la que el servidor clasifica los días (UTC), como el resto del tablero.
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

  return (
    <ModalShell
      testId="board-day-dialog"
      title={ta("boardDayTitle")}
      subtitle={dateLabel}
      closeLabel={tc("close")}
      onClose={onClose}
      enabled={!nestedOpen}
      panelClassName="max-w-3xl"
    >
      <div className="flex flex-col gap-4">
        {notice && (
          <p
            data-testid="board-notice"
            role={notice.kind === "error" ? "alert" : "status"}
            className={notice.kind === "error" ? "text-coral-text" : "text-azure-deep"}
          >
            {notice.text}
          </p>
        )}

        <p className="text-small text-ink-soft" data-testid="board-day-summary">
          {day
            ? ta("boardSummary", {
                published: day.summary.published,
                reserved: day.summary.reserved,
                occupied: day.summary.occupied,
                maintenance: day.summary.maintenance,
              })
            : t("loading")}
        </p>

        <BoardDayActions
          date={date}
          selectedRooms={selectedRooms}
          action={action}
          onActionChange={onActionChange}
          canPublish={canPublish}
          canMint={canMint}
          onNotice={onNotice}
          onReload={onReload}
          onNestedModalChange={setNestedOpen}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <h3 className="text-small font-semibold text-ink">{ta("boardRoomsTitle")}</h3>
          <div className="flex items-center gap-2">
            <span className="text-small text-ink-soft">
              {ta("boardSelectedCount", { count: selectedIds.size })}
            </span>
            {eligible.length > 0 && (
              <button
                type="button"
                data-testid="board-select-eligible"
                onClick={() => onSelectionChange(allEligibleSelected ? new Set() : new Set(eligible))}
                className={FIELD}
              >
                {ta("boardSelectEligible", { count: eligible.length })}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p role="status" className="text-ink-soft">
            {t("loading")}
          </p>
        ) : rooms.length === 0 ? (
          <p className="text-ink-soft">{t("empty")}</p>
        ) : (
          // **Una ficha por planta** con las habitaciones en **cuadrícula** (`auto-fill`): el ancho lo
          // decide el propio panel, así que caben tantas columnas como permita el flotante —que es de
          // lo que se trataba— sin depender del ancho de la pantalla.
          <div className="flex flex-col gap-4" data-testid="board-floors">
            {floors.map((group) => {
              const selectedInFloor = group.rooms.filter((room) => selectedIds.has(room.id)).length;
              return (
                <section
                  key={group.floor ?? "none"}
                  data-testid={`board-floor-${group.floor ?? "none"}`}
                  className="rounded-brand border border-line bg-mist p-3"
                >
                  <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-small font-semibold text-ink">
                      {group.floor === null
                        ? ta("boardFloorNone")
                        : ta("boardFloorTitle", { floor: group.floor })}
                    </h3>
                    <span className="text-micro text-ink-soft">
                      {ta("boardSelectedCount", { count: selectedInFloor })}
                    </span>
                  </header>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
                    {group.rooms.map((room) => (
                      <DayRoomRibbon
                        key={room.id}
                        room={room}
                        action={action}
                        selected={selectedIds.has(room.id)}
                        onToggle={onToggle}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
