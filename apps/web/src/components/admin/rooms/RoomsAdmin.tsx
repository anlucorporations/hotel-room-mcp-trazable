"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useConfig, useSignMessage } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminCard } from "@/components/admin/AdminPanel";
import { useMintWindow } from "./useMintWindow";

/**
 * Sección Habitación (F1 · D-1…D-26): alta, ficha, galería, dos estados, publicación con TOTP y
 * archivo. Consume la API `/api/admin/rooms*`; el gating de rol y de sesión lo pone `AdminPanel`.
 *
 * Accesibilidad: cada control es un `<label>` que envuelve su campo, con `data-testid`, `required` y
 * `min-h-touch`; los mensajes de estado usan `role="status"`/`role="alert"` y el modal de TOTP es un
 * `role="dialog"` con `aria-modal`.
 */

type RoomType = "SIMPLE" | "DOBLE" | "SUITE";
type PublicationStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "MAINTENANCE" | "OUT_OF_SERVICE";
type OperationalStatus = "CLEAN" | "DIRTY" | "OCCUPIED";

interface Room {
  id: string;
  roomNumber: number;
  floor: number | null;
  roomType: RoomType;
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  publicationStatus: PublicationStatus;
  operationalStatus: OperationalStatus;
  archivedAt: string | null;
}

interface RoomImage {
  id: string;
  fileName: string;
  position: number;
  isCover: boolean;
  url: string;
}

/** Entrada de `GET /api/admin/rooms/window-overview` usada por el barrido global (F8). */
interface WindowOverviewRoom {
  roomId: string;
  roomNumber: number;
  roomType: string;
  basePriceWei: string | null;
  missing: number;
  freeNights: number;
  low: boolean;
}

const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

const ROOM_TYPES: readonly RoomType[] = ["SIMPLE", "DOBLE", "SUITE"];

interface Notice {
  kind: "ok" | "error";
  text: string;
}

export function RoomsAdmin() {
  const t = useTranslations("rooms");
  const { apiFetch } = useAdminContext();
  // D-1/D-2: la wallet del administrador firma la huella de la ficha cuando está conectada.
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const config = useConfig();
  // F8 · D-4/D-11/D-16/D-17: acuñado (reanudable) de la ventana global de la noche.
  const mintWindow = useMintWindow();

  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Room | null>(null);
  const [images, setImages] = useState<readonly RoomImage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // F8: barrido global secuencial de todas las habitaciones publicadas con noches pendientes.
  const [sweeping, setSweeping] = useState(false);
  const [sweepCurrent, setSweepCurrent] = useState(0);
  const [sweepTotal, setSweepTotal] = useState(0);

  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  const statusLabel = (status: PublicationStatus): string => t(`status.${status}` as "status.DRAFT");
  const operationalLabel = (status: OperationalStatus): string =>
    t(`operational.${status}` as "operational.CLEAN");
  const typeLabel = (type: RoomType): string => t(`types.${type}` as "types.SIMPLE");

  const loadRooms = useCallback(async (): Promise<void> => {
    setListLoading(true);
    try {
      const res = await apiFetch("/api/admin/rooms");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      setRooms(data.rooms ?? []);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    } finally {
      setListLoading(false);
    }
  }, [apiFetch, t]);

  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      setDetailLoading(true);
      try {
        const res = await apiFetch(`/api/admin/rooms/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("loadError"));
        setDetail(data.room ?? null);
        setImages(data.images ?? []);
      } catch (error: unknown) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
      } finally {
        setDetailLoading(false);
      }
    },
    [apiFetch, t],
  );

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setNotice(null);
    try {
      const res = await apiFetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: Number(form.get("roomNumber")),
          roomType: form.get("roomType"),
          capacity: Number(form.get("capacity")),
          beds: Number(form.get("beds")),
          floor: form.get("floor") ? Number(form.get("floor")) : null,
          sizeM2: form.get("sizeM2") ? Number(form.get("sizeM2")) : null,
          descriptionEs: form.get("descriptionEs") || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("createError"));
      setNotice({ kind: "ok", text: t("created") });
      (event.target as HTMLFormElement).reset();
      await loadRooms();
      setSelectedId(data.room?.id ?? null);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("createError") });
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacity: Number(form.get("capacity")),
          beds: Number(form.get("beds")),
          floor: form.get("floor") ? Number(form.get("floor")) : null,
          sizeM2: form.get("sizeM2") ? Number(form.get("sizeM2")) : null,
          descriptionEs: form.get("descriptionEs") || null,
          descriptionEn: form.get("descriptionEn") || null,
          descriptionRu: form.get("descriptionRu") || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("saveError"));
      setDetail(data.room ?? detail);
      setNotice({ kind: "ok", text: t("saved") });
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(status: PublicationStatus): Promise<void> {
    if (!detail) return;
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationStatus: status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("saveError"));
      setDetail(data.room ?? detail);
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    }
  }

  async function handleUpload(file: File): Promise<void> {
    if (!detail) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`/api/admin/rooms/${detail.id}/images`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("uploadError"));
      await loadDetail(detail.id);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("uploadError") });
    } finally {
      setUploading(false);
    }
  }

  async function handleSetCover(imageId: string): Promise<void> {
    if (!detail) return;
    try {
      const res = await apiFetch(`/api/admin/rooms/${detail.id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCover: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("saveError"));
      }
      await loadDetail(detail.id);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    }
  }

  async function handleDeleteImage(imageId: string): Promise<void> {
    if (!detail) return;
    try {
      const res = await apiFetch(`/api/admin/rooms/${detail.id}/images/${imageId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("deleteError"));
      }
      await loadDetail(detail.id);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("deleteError") });
    }
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail) return;
    setPublishing(true);
    setNotice(null);
    try {
      // Paso 1: huella a firmar/anclar (D-2/D-18).
      const prepRes = await apiFetch(`/api/admin/rooms/${detail.id}/publish`);
      const prep = await prepRes.json().catch(() => ({}));
      if (!prepRes.ok) throw new Error(prep.message || t("publishError"));
      const contentHash = typeof prep.contentHash === "string" ? prep.contentHash : undefined;
      if (!contentHash) throw new Error(t("publishError"));

      let signature: string | undefined;
      let signerAddress: string | undefined;
      let txHash: string | undefined;

      // Paso 2: con wallet conectada, sincronizar el registro y anclar la huella on-chain
      // (D-2/D-3/D-10/D-18). Es best-effort: si falla, se publica y queda PENDING_ANCHOR.
      if (isConnected && address) {
        try {
          const registered = (await readContract(config, {
            address: contractAddress,
            abi: hotelNightsAbi,
            functionName: "isRoomRegistered",
            args: [BigInt(detail.roomNumber)],
          })) as boolean;

          if (!registered) {
            const registerHash = await writeContract(config, {
              address: contractAddress,
              abi: hotelNightsAbi,
              functionName: "registerRoom",
              args: [BigInt(detail.roomNumber), detail.roomType.toLowerCase()],
            });
            await waitForTransactionReceipt(config, { hash: registerHash });
          }

          txHash = await writeContract(config, {
            address: contractAddress,
            abi: hotelNightsAbi,
            functionName: "publishRoom",
            args: [BigInt(detail.roomNumber), contentHash as `0x${string}`],
          });
          await waitForTransactionReceipt(config, { hash: txHash as `0x${string}` });

          signature = await signMessageAsync({ message: contentHash });
          signerAddress = address;
        } catch {
          // Sin wallet/RPC disponible el anclaje no se completa: se publica pendiente (F8/F1).
          signature = undefined;
          signerAddress = undefined;
          txHash = undefined;
        }
      }

      const res = await apiFetch(`/api/admin/rooms/${detail.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmTotpCode: mfaCode.trim(),
          ...(txHash ? { txHash } : {}),
          ...(signature && signerAddress ? { signature, signerAddress } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("publishError"));
      setMfaOpen(false);
      setMfaCode("");
      setDetail(data.room ?? detail);
      const publishedText = data.onChainAnchored ? t("published") : t("publishedPending");
      setNotice({ kind: "ok", text: publishedText });
      await loadRooms();
      // F8 · D-4: el primer acuñado de la ventana ocurre al publicar. Si falla, la publicación YA
      // es válida: no se revierte y queda el botón «Acuñar ventana» para reintentar (D-17).
      await runMintWindow(publishedText);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("publishError") });
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive(): Promise<void> {
    if (!detail) return;
    if (!window.confirm(t("archiveConfirm"))) return;
    setArchiving(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${detail.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("archiveError"));
      setNotice({ kind: "ok", text: t("archived") });
      setSelectedId(null);
      setDetail(null);
      setImages([]);
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("archiveError") });
    } finally {
      setArchiving(false);
    }
  }

  /**
   * Acuña la ventana global de la habitación seleccionada (F8 · D-4/D-17). El hook es idempotente:
   * omite las noches ya acuñadas, de modo que sirve tanto para el primer acuñado (al publicar) como
   * para reintentar/extender. `prefix` antepone el resultado de la publicación en el mismo notice.
   */
  async function runMintWindow(prefix?: string): Promise<void> {
    if (!detail) return;
    try {
      const result = await mintWindow.run(detail.id);
      const mintedText = t("mintWindowOk", { minted: result.minted, skipped: result.skipped });
      const combined = prefix ? `${prefix} ${mintedText}` : mintedText;
      setNotice({
        kind: "ok",
        text: result.status.low ? `${combined} ${t("mintWindowLow", { free: result.status.freeNights })}` : combined,
      });
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("mintWindowError") });
    }
  }

  /**
   * Barrido global (F8 · D-4/D-11/D-16/D-17): acuña la ventana de todas las habitaciones publicadas
   * con noches pendientes, en secuencia y reutilizando el hook idempotente. Si una habitación falla
   * se detiene el barrido y el proceso queda reanudable (volver a pulsar continúa donde quedó).
   */
  async function handleGlobalSweep(): Promise<void> {
    if (sweeping) return;
    setSweeping(true);
    setNotice(null);
    setSweepCurrent(0);
    setSweepTotal(0);
    try {
      const res = await apiFetch("/api/admin/rooms/window-overview");
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        rooms?: WindowOverviewRoom[];
      };
      if (!res.ok) throw new Error(data.message || t("loadError"));

      const pending = (data.rooms ?? []).filter((room) => room.missing > 0);
      if (pending.length === 0) {
        setNotice({ kind: "ok", text: t("globalSweepNone") });
        return;
      }

      setSweepTotal(pending.length);
      let processed = 0;
      let minted = 0;
      let low = 0;
      for (let index = 0; index < pending.length; index += 1) {
        const room = pending[index];
        if (!room) continue;
        setSweepCurrent(index + 1);
        try {
          const result = await mintWindow.run(room.roomId);
          minted += result.minted;
          if (result.status.low) low += 1;
          processed += 1;
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : t("mintWindowError");
          setNotice({
            kind: "error",
            text: `${t("globalSweepError", { room: room.roomNumber })} ${reason}`,
          });
          await loadRooms();
          return;
        }
      }

      let text = t("globalSweepOk", { rooms: processed, minted });
      if (low > 0) text = `${text} ${t("globalSweepLow", { rooms: low })}`;
      setNotice({ kind: "ok", text });
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          data-testid="rooms-notice"
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "text-coral-text" : "text-azure-deep"}
        >
          {notice.text}
        </p>
      )}

      <AdminCard>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-h3 font-semibold text-ink">{t("newTitle")}</h2>
          <button type="button" onClick={() => void loadRooms()} className={GHOST} disabled={listLoading}>
            {t("refresh")}
          </button>
        </div>
        <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-3">
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formNumber")}
            <input name="roomNumber" type="number" min="1" required data-testid="room-new-number" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formType")}
            <select name="roomType" required data-testid="room-new-type" defaultValue="DOBLE" className={FIELD}>
              {ROOM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formCapacity")}
            <input name="capacity" type="number" min="1" required data-testid="room-new-capacity" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formBeds")}
            <input name="beds" type="number" min="1" required data-testid="room-new-beds" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formFloor")}
            <input name="floor" type="number" min="0" data-testid="room-new-floor" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("formSize")}
            <input name="sizeM2" type="number" min="0" step="0.01" data-testid="room-new-size" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink tablet:col-span-3">
            {t("formDescriptionEs")}
            <textarea name="descriptionEs" rows={2} data-testid="room-new-description" className={FIELD} />
          </label>
          <div className="tablet:col-span-3">
            <button type="submit" data-testid="room-new-submit" disabled={creating} className={ACTION}>
              {creating ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard>
        {isConnected && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              data-testid="rooms-global-sweep"
              onClick={() => void handleGlobalSweep()}
              disabled={sweeping || mintWindow.running}
              className={ACTION}
            >
              {sweeping && sweepTotal > 0
                ? t("globalSweepRunning", { current: sweepCurrent, total: sweepTotal })
                : t("globalSweep")}
            </button>
          </div>
        )}
        {listLoading ? (
          <p role="status" className="text-ink-soft">
            {t("loading")}
          </p>
        ) : rooms.length === 0 ? (
          <p className="text-ink-soft">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <caption className="sr-only">{t("roomsCaption")}</caption>
              <thead>
                <tr className="text-ink-soft">
                  <th scope="col" className="px-2 py-2">{t("colNumber")}</th>
                  <th scope="col" className="px-2 py-2">{t("colType")}</th>
                  <th scope="col" className="px-2 py-2">{t("colCapacity")}</th>
                  <th scope="col" className="px-2 py-2">{t("colBeds")}</th>
                  <th scope="col" className="px-2 py-2">{t("colStatus")}</th>
                  <th scope="col" className="px-2 py-2">{t("colOperational")}</th>
                  <th scope="col" className="px-2 py-2">{t("select")}</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} data-testid={`room-row-${room.roomNumber}`} className="border-t border-line">
                    <td className="px-2 py-2 font-semibold text-ink">{room.roomNumber}</td>
                    <td className="px-2 py-2">{typeLabel(room.roomType)}</td>
                    <td className="px-2 py-2">{room.capacity}</td>
                    <td className="px-2 py-2">{room.beds}</td>
                    <td className="px-2 py-2">{statusLabel(room.publicationStatus)}</td>
                    <td className="px-2 py-2">{operationalLabel(room.operationalStatus)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        data-testid={`room-open-${room.roomNumber}`}
                        onClick={() => setSelectedId(room.id)}
                        className={GHOST}
                      >
                        {t("select")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {selectedId && (
        <AdminCard>
          {detailLoading || !detail ? (
            <p role="status" className="text-ink-soft">
              {t("loading")}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-h3 font-semibold text-ink">
                  {t("detailTitle")} · {detail.roomNumber}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {detail.publicationStatus === "PUBLISHED" ? (
                    <button type="button" data-testid="room-pause" onClick={() => void handleStatus("PAUSED")} className={GHOST}>
                      {t("pause")}
                    </button>
                  ) : (
                    <button type="button" data-testid="room-publish-open" onClick={() => setMfaOpen(true)} className={ACTION}>
                      {t("publish")}
                    </button>
                  )}
                  {detail.publicationStatus === "PUBLISHED" && isConnected && (
                    <button
                      type="button"
                      data-testid="room-mint-window"
                      onClick={() => void runMintWindow()}
                      disabled={mintWindow.running}
                      className={GHOST}
                    >
                      {mintWindow.running
                        ? t("mintWindowRunning", { done: mintWindow.done, total: mintWindow.total })
                        : t("mintWindow")}
                    </button>
                  )}
                  <button type="button" data-testid="room-archive" onClick={() => void handleArchive()} disabled={archiving} className={GHOST}>
                    {archiving ? t("archiving") : t("archive")}
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formCapacity")}
                  <input name="capacity" type="number" min="1" defaultValue={detail.capacity} required data-testid="room-edit-capacity" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formBeds")}
                  <input name="beds" type="number" min="1" defaultValue={detail.beds} required data-testid="room-edit-beds" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formFloor")}
                  <input name="floor" type="number" min="0" defaultValue={detail.floor ?? ""} data-testid="room-edit-floor" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formSize")}
                  <input name="sizeM2" type="number" min="0" step="0.01" defaultValue={detail.sizeM2 ?? ""} data-testid="room-edit-size" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formDescriptionEs")}
                  <textarea name="descriptionEs" rows={2} defaultValue={detail.descriptionEs ?? ""} data-testid="room-edit-description-es" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formDescriptionEn")}
                  <textarea name="descriptionEn" rows={2} defaultValue={detail.descriptionEn ?? ""} data-testid="room-edit-description-en" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("formDescriptionRu")}
                  <textarea name="descriptionRu" rows={2} defaultValue={detail.descriptionRu ?? ""} data-testid="room-edit-description-ru" className={FIELD} />
                </label>
                <div className="tablet:col-span-3">
                  <button type="submit" data-testid="room-edit-save" disabled={saving} className={ACTION}>
                    {saving ? t("saving") : t("save")}
                  </button>
                </div>
              </form>

              <section className="flex flex-col gap-3">
                <h3 className="font-display text-h3 font-semibold text-ink">{t("imagesTitle")}</h3>
                <label className="flex flex-col gap-1 text-small font-medium text-ink">
                  {t("upload")}
                  <input
                    type="file"
                    accept="image/jpeg"
                    data-testid="room-image-upload"
                    disabled={uploading || images.length >= 5}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file);
                      event.target.value = "";
                    }}
                    className={FIELD}
                  />
                </label>
                {uploading && (
                  <p role="status" className="text-ink-soft">
                    {t("uploading")}
                  </p>
                )}
                {images.length === 0 ? (
                  <p className="text-ink-soft">{t("noImages")}</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
                    {images.map((image) => (
                      <li key={image.id} className="flex flex-col gap-2 rounded-brand border border-line p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={`${detail.roomNumber} · ${image.position}`}
                          className="h-32 w-full rounded-brand object-cover"
                        />
                        {image.isCover && (
                          <span className="text-micro font-semibold uppercase tracking-wide text-azure-deep">{t("cover")}</span>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {!image.isCover && (
                            <button type="button" onClick={() => void handleSetCover(image.id)} className={GHOST}>
                              {t("setCover")}
                            </button>
                          )}
                          <button type="button" onClick={() => void handleDeleteImage(image.id)} className={GHOST}>
                            {t("delete")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </AdminCard>
      )}

      {mfaOpen && (
        <div role="dialog" aria-modal="true" aria-label={t("publishTitle")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-brand-lg bg-shell p-6 shadow-card">
            <h3 className="font-display text-h3 font-semibold text-ink">{t("publishTitle")}</h3>
            <p className="mt-1 text-small text-ink-soft">{t("publishTagline")}</p>
            <form onSubmit={handlePublish} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-small font-medium text-ink">
                {t("mfaCode")}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  data-testid="room-publish-totp"
                  className={FIELD}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMfaOpen(false)} disabled={publishing} className={GHOST}>
                  {t("cancel")}
                </button>
                <button type="submit" data-testid="room-publish-confirm" disabled={publishing || mfaCode.trim().length !== 6} className={ACTION}>
                  {publishing ? t("publishing") : t("mfaConfirm")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
