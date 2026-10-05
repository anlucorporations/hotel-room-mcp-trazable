"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminMint } from "@/components/admin/AdminMint";
import { MaintenanceIcon } from "@/components/rooms/roomIcons";
import { addDays, type BoardDayAction } from "@/lib/room-board-calendar";
import { ModalShell } from "./ModalShell";
import type { BoardNotice, DayRoom } from "./board-dto";

/**
 * **Panel del día** del tablero de disponibilidad (2026-10-04): administra las habitaciones del día
 * seleccionado —publicar, reservar, liberar, acuñar la noche y pedir servicios— reutilizando los
 * flujos que ya existen en el sistema en lugar de duplicarlos:
 *
 *   · **Publicar**  → `POST /api/admin/rooms/bulk/publish` (un TOTP para el lote; la ficha se publica
 *     completa, con su ventana de 90 noches, según lo acordado con el responsable).
 *   · **Reservar**  → `POST /api/reception/reservations` por habitación (canal, noches y precio;
 *     nace `PENDING` con hold de 24 h). El owner satisface `RECEPTION_ROLE` (D-30).
 *   · **Liberar**   → `POST /api/admin/rooms/bulk/release` con `date`, que cancela solo esa noche.
 *   · **Acuñar**    → el formulario `AdminMint` (on-chain, `MINTER_ROLE`) con la habitación y la fecha
 *     ya elegidas.
 *   · **Servicios** → incidencia real (`POST /api/mantenimiento/incidents`) y asignación de lencería
 *     del turno (`POST /api/housekeeping/shifts` + `/assignments`), ambas gated por rol de personal
 *     que el owner también satisface (D-30).
 *
 * Los formularios están en un solo componente a propósito: comparten la selección y el aviso, y
 * separarlos obligaría a elevar ese estado sin ganar nada.
 */

export interface BoardDayActionsProps {
  readonly date: string;
  readonly selectedRooms: readonly DayRoom[];
  readonly action: BoardDayAction;
  readonly onActionChange: (action: BoardDayAction) => void;
  readonly canPublish: boolean;
  readonly canMint: boolean;
  readonly onNotice: (notice: BoardNotice) => void;
  readonly onReload: () => Promise<void>;
}

const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-4 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

const CHANNELS = ["COUNTER", "WEB"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const SHIFT_LABELS = ["MANANA", "TARDE", "NOCHE"] as const;
const MAINTENANCE_KINDS = [
  "ELECTRICIDAD",
  "FONTANERIA",
  "CLIMATIZACION",
  "MOBILIARIO",
  "ELECTRODOMESTICO",
  "CERRADURA",
  "OTROS",
] as const;

export function BoardDayActions({
  date,
  selectedRooms,
  action,
  onActionChange,
  canPublish,
  canMint,
  onNotice,
  onReload,
}: BoardDayActionsProps) {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  const { apiFetch } = useAdminContext();
  const totpRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("COUNTER");
  const [nights, setNights] = useState("1");
  const [priceEuros, setPriceEuros] = useState("");
  const [kind, setKind] = useState<(typeof MAINTENANCE_KINDS)[number]>("ELECTRICIDAD");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [notes, setNotes] = useState("");
  const [shiftLabel, setShiftLabel] = useState<(typeof SHIFT_LABELS)[number]>("MANANA");
  const [assignee, setAssignee] = useState("");

  const roomIds = selectedRooms.map((room) => room.id);
  const noSelection = selectedRooms.length === 0;
  /** El minteo on-chain trabaja de una en una: solo con una habitación seleccionada. */
  const mintTarget = selectedRooms.length === 1 ? selectedRooms[0] : undefined;

  /** Publicación del lote con un solo TOTP. */
  async function submitPublish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/rooms/bulk/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds, confirmTotpCode: mfaCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && (data.published ?? 0) === 0) throw new Error(data.message || ta("boardPublishError"));
      onNotice({ kind: "ok", text: ta("boardPublishOk", { published: data.published ?? 0 }) });
      setMfaOpen(false);
      setMfaCode("");
      await onReload();
    } catch (error: unknown) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardPublishError") });
    } finally {
      setBusy(false);
    }
  }

  /** Reserva real por habitación (nace PENDING con hold). */
  async function submitReserve(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const checkInDate = date;
    const checkOutDate = addDays(date, Math.max(1, Number(nights) || 1));
    const totalCents = Math.round(Number(priceEuros.replace(",", ".")) * 100);
    let created = 0;
    try {
      for (const room of selectedRooms) {
        const res = await apiFetch("/api/reception/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, checkInDate, checkOutDate, channel, totalCents }),
        });
        if (res.ok) created += 1;
      }
      if (created === 0) throw new Error(ta("boardReserveError"));
      onNotice({ kind: "ok", text: ta("boardReserveOk", { count: created }) });
      await onReload();
    } catch (error: unknown) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardReserveError") });
    } finally {
      setBusy(false);
    }
  }

  /** Libera las reservas vivas de la noche seleccionada. */
  async function submitRelease(): Promise<void> {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/rooms/bulk/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds, date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || ta("boardReleaseError"));
      onNotice({ kind: "ok", text: ta("boardReleaseOk", { released: data.released ?? 0 }) });
      await onReload();
    } catch (error: unknown) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardReleaseError") });
    } finally {
      setBusy(false);
    }
  }

  /** Incidencia de mantenimiento por habitación (nace `OPEN` y bloquea la venta salvo que se diga lo contrario). */
  async function submitMaintenance(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    let created = 0;
    try {
      for (const room of selectedRooms) {
        const res = await apiFetch("/api/mantenimiento/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.id, kind, priority, description: notes.trim() || null }),
        });
        if (res.ok) created += 1;
      }
      if (created === 0) throw new Error(ta("boardMaintenanceError"));
      onNotice({ kind: "ok", text: ta("boardMaintenanceOk", { count: created }) });
      setNotes("");
      await onReload();
    } catch (error: unknown) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardMaintenanceError") });
    } finally {
      setBusy(false);
    }
  }

  /** Asignación de lencería: usa el turno del día si existe y lo crea si no. */
  async function submitLinen(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    let assigned = 0;
    try {
      const shiftsRes = await apiFetch(`/api/housekeeping/shifts?date=${date}`);
      const shiftsData = await shiftsRes.json().catch(() => ({}));
      const shifts = Array.isArray(shiftsData.shifts) ? (shiftsData.shifts as Array<{ id: string; label: string }>) : [];
      let shiftId = shifts.find((shift) => shift.label === shiftLabel)?.id ?? null;
      if (!shiftId) {
        const created = await apiFetch("/api/housekeeping/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, label: shiftLabel }),
        });
        const data = await created.json().catch(() => ({}));
        if (!created.ok) throw new Error(data.message || ta("boardLinenError"));
        shiftId = data.shift?.id ?? null;
      }
      if (!shiftId) throw new Error(ta("boardLinenError"));

      for (const room of selectedRooms) {
        const res = await apiFetch("/api/housekeeping/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shiftId, roomId: room.id, assignee: assignee.trim() }),
        });
        if (res.ok) assigned += 1;
      }
      if (assigned === 0) throw new Error(ta("boardLinenError"));
      onNotice({ kind: "ok", text: ta("boardLinenOk", { count: assigned }) });
      await onReload();
    } catch (error: unknown) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardLinenError") });
    } finally {
      setBusy(false);
    }
  }

  const ACTIONS: ReadonlyArray<{ key: BoardDayAction; labelKey: string }> = [
    { key: "PUBLISH", labelKey: "boardActionPublish" },
    { key: "RESERVE", labelKey: "boardActionReserve" },
    { key: "RELEASE", labelKey: "boardActionRelease" },
    { key: "MINT", labelKey: "boardActionMint" },
    { key: "SERVICE", labelKey: "boardActionService" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={ta("boardDayTitle")} className="flex flex-wrap gap-1">
        {ACTIONS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            data-testid={`board-action-${entry.key.toLowerCase()}`}
            onClick={() => onActionChange(entry.key)}
            aria-pressed={action === entry.key}
            className={`min-h-touch rounded-pill border px-3 text-small font-medium transition-colors ${
              action === entry.key ? "border-azure bg-azure text-shell" : "border-line text-ink hover:bg-mist-2"
            }`}
          >
            {ta(entry.labelKey)}
          </button>
        ))}
      </div>

      {action === "PUBLISH" && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-soft">{ta("boardPublishHint")}</p>
          <button
            type="button"
            data-testid="board-run-publish"
            disabled={noSelection || busy || !canPublish}
            title={canPublish ? undefined : ta("roleDenied")}
            onClick={() => setMfaOpen(true)}
            className={ACTION}
          >
            {busy ? ta("boardWorking") : ta("boardRunPublish")}
          </button>
        </div>
      )}

      {action === "RESERVE" && (
        <form onSubmit={submitReserve} className="flex flex-col gap-2" data-testid="board-reserve-form">
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {ta("boardReserveChannel")}
            <select value={channel} onChange={(event) => setChannel(event.target.value as (typeof CHANNELS)[number])} className={FIELD}>
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {ta("boardReserveNights")}
            <input type="number" min={1} max={30} value={nights} onChange={(event) => setNights(event.target.value)} className={FIELD} required />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {ta("boardReservePrice")}
            <input type="number" min={0} step="0.01" value={priceEuros} onChange={(event) => setPriceEuros(event.target.value)} className={FIELD} required />
          </label>
          <button type="submit" data-testid="board-run-reserve" disabled={noSelection || busy} className={ACTION}>
            {busy ? ta("boardWorking") : ta("boardRunReserve")}
          </button>
        </form>
      )}

      {action === "RELEASE" && (
        <button type="button" data-testid="board-run-release" disabled={noSelection || busy} onClick={() => void submitRelease()} className={ACTION}>
          {busy ? ta("boardWorking") : ta("boardRunRelease")}
        </button>
      )}

      {action === "MINT" &&
        (mintTarget && canMint ? (
          <div data-testid="board-mint-form">
            <AdminMint key={`${mintTarget.id}-${date}`} initialRoomNumber={mintTarget.roomNumber} initialDate={date} />
          </div>
        ) : (
          <p className="text-small text-ink-soft" role="status">
            {ta("boardMintPick")}
          </p>
        ))}

      {action === "SERVICE" && (
        <div className="flex flex-col gap-4">
          <form onSubmit={submitMaintenance} className="flex flex-col gap-2" data-testid="board-maintenance-form">
            <p className="inline-flex items-center gap-1 text-small font-semibold text-ink">
              <MaintenanceIcon size={14} />
              {ta("boardRunMaintenance")}
            </p>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("boardMaintenanceKind")}
              <select value={kind} onChange={(event) => setKind(event.target.value as (typeof MAINTENANCE_KINDS)[number])} className={FIELD}>
                {MAINTENANCE_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("boardMaintenancePriority")}
              <select value={priority} onChange={(event) => setPriority(event.target.value as (typeof PRIORITIES)[number])} className={FIELD}>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("boardMaintenanceNotes")}
              <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} className={FIELD} />
            </label>
            <button type="submit" data-testid="board-run-maintenance" disabled={noSelection || busy} className={ACTION}>
              {busy ? ta("boardWorking") : ta("boardRunMaintenance")}
            </button>
          </form>

          <form onSubmit={submitLinen} className="flex flex-col gap-2" data-testid="board-linen-form">
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("boardLinenLabel")}
              <select value={shiftLabel} onChange={(event) => setShiftLabel(event.target.value as (typeof SHIFT_LABELS)[number])} className={FIELD}>
                {SHIFT_LABELS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("boardLinenAssignee")}
              <input type="text" value={assignee} onChange={(event) => setAssignee(event.target.value)} className={FIELD} required />
            </label>
            <button type="submit" data-testid="board-run-linen" disabled={noSelection || busy} className={ACTION}>
              {busy ? ta("boardWorking") : ta("boardRunLinen")}
            </button>
          </form>
        </div>
      )}

      {noSelection && action !== "MINT" && action !== "SERVICE" && (
        <p className="text-small text-ink-soft" role="status">
          {ta("boardNoSelection")}
        </p>
      )}

      {mfaOpen && (
        <ModalShell
          title={t("publishTitle")}
          subtitle={t("publishTagline")}
          closeLabel={t("cancel")}
          onClose={() => setMfaOpen(false)}
          testId="board-publish-dialog"
          initialFocus={totpRef}
        >
          <form onSubmit={submitPublish} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("mfaCode")}
              <input
                ref={totpRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                data-testid="board-publish-totp"
                className={FIELD}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMfaOpen(false)} disabled={busy} className={GHOST}>
                {t("cancel")}
              </button>
              <button type="submit" data-testid="board-publish-confirm" disabled={busy || mfaCode.trim().length !== 6} className={ACTION}>
                {busy ? ta("boardWorking") : t("mfaConfirm")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
