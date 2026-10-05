"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useAccount, useConfig, useSignMessage } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { CURRENCY_SYMBOL } from "@hotel/shared/domain";
import { contractAddress } from "@/config/chain";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminCard } from "@/components/admin/AdminPanel";
import { RoomDetailCard } from "@/components/rooms/RoomDetailCard";
import { ModalShell } from "./ModalShell";
import { RoomFormDialog, type RoomFormOutcome } from "./RoomFormDialog";
import {
  catalogEntryName,
  type AdminRoom,
  type AdminRoomDetail,
  type AdminRoomOptions,
} from "./room-dto";
import {
  BulkCancelIcon,
  BulkReleaseIcon,
  BulkSelectIcon,
  CleanIcon,
  DirtyIcon,
  DraftIcon,
  MaintenanceIcon,
  OccupiedIcon,
  OutOfServiceIcon,
  PausedIcon,
  PublishedIcon,
  QuickPublishIcon,
  QuickReserveIcon,
  QuickToggleIcon,
  ReservedIcon,
} from "@/components/rooms/roomIcons";
import { isRoomEligibleForBulk, reservedNightsOf, selectableRoomIds, type BulkAction } from "./room-bulk";
import { useMintWindow } from "./useMintWindow";

/**
 * Sección Habitación (F1 · D-1…D-26): alta, ficha, galería, dos estados, publicación con TOTP y
 * archivo. Consume la API `/api/admin/rooms*`; el gating de rol y de sesión lo pone `AdminPanel`.
 *
 * **Rediseño 2026-10-02 (petición del responsable)**: la tabla muestra **solo el resumen** —número,
 * tipo, capacidad, camas, m², precio, estado y estado operativo— y todo el detalle se abre en dos
 * fichas flotantes:
 *   · el **formulario** (`RoomFormDialog`) para el alta y la edición de la ficha completa;
 *   · la **ficha de detalle** (esta pantalla, con el componente reutilizable `RoomDetailCard`), al
 *     pulsar una fila o el icono «Reservar» de la zona de acciones rápidas.
 *
 * **Tablero 2026-10-04 (petición del responsable)**:
 *   · las columnas de estado muestran un **icono** por estado (publicación y operativo) más el
 *     distintivo «Reservada» cuando la habitación tiene noches ocupadas en la ventana;
 *   · la columna de acciones rápidas sustituye al botón «Ver ficha» por **iconos** de Publicar,
 *     Reservar (abre el calendario) y Activar/Desactivar (`PUBLISHED` ↔ `PAUSED`, sin TOTP);
 *   · en la **cabecera** de la tabla vive el icono de **acciones masivas**: al activarlo aparecen las
 *     casillas (primera columna) y solo se pueden marcar las habitaciones elegibles para la acción
 *     activa — regla pura y probada en `room-bulk.ts`.
 *
 * Accesibilidad: cada control es un `<label>` que envuelve su campo, con `data-testid`, `required` y
 * `min-h-touch`; los mensajes de estado usan `role="status"`/`role="alert"`; los tres diálogos
 * (`room-form-dialog`, `room-detail-dialog`, `room-publish-dialog`) comparten `ModalShell` (mismo
 * patrón que el TOTP: `role="dialog"`, `aria-modal`, `aria-labelledby`, foco al abrir, trampa de foco,
 * `Escape` y devolución del foco al disparador).
 *
 * i18n: el resumen heredado (columnas, estados, acciones) sigue leyéndose del namespace `rooms`; las
 * claves de la ficha ampliada (columnas nuevas, aviso de resumen, ficha flotante y formulario) viven
 * en `admin`. No se inventa ninguna clave.
 */

/** Estilos del panel (los mismos del resto del back-office). */
const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

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

interface Notice {
  kind: "ok" | "error";
  text: string;
}

/**
 * Ficha tal y como la espera `RoomDetailCard`. Se toma **de su contrato de props** en lugar de
 * importar `RoomRecord` del barril de servidor: `boundaries.test.ts` prohíbe ese barril en módulos de
 * cliente (arrastraría `pg`/`bullmq` al bundle del navegador).
 */
type RoomCardRoom = ComponentProps<typeof RoomDetailCard>["room"];

/** Precio de la ficha: wei → ETH con `formatEther`; sin tarifa se pinta un guion. */
function formatRate(baseRateWei: string | null): string {
  if (baseRateWei === null) return "—";
  try {
    return `${formatEther(BigInt(baseRateWei))} ${CURRENCY_SYMBOL}`;
  } catch {
    // La API garantiza dígitos, pero un valor corrupto no debe tumbar la tabla entera.
    return "—";
  }
}

export function RoomsAdmin() {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  const locale = useLocale();
  const { apiFetch } = useAdminContext();
  // D-1/D-2: la wallet del administrador firma la huella de la ficha cuando está conectada.
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const config = useConfig();
  // F8 · D-4/D-11/D-16/D-17: acuñado (reanudable) de la ventana global de la noche.
  const mintWindow = useMintWindow();

  const [rooms, setRooms] = useState<readonly AdminRoom[]>([]);
  /** Catálogos (`/options`) para traducir códigos en la tabla y alimentar el formulario. */
  const [options, setOptions] = useState<AdminRoomOptions | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Ficha flotante de detalle: `detail` es la respuesta completa de `GET /api/admin/rooms/[id]`.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRoomDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Se incrementa para **forzar la recarga** del detalle cuando el id no cambia (p. ej. tras editar). */
  const [detailVersion, setDetailVersion] = useState(0);

  // Formulario flotante: `formRoom` es la ficha que se edita y `null` significa alta.
  const [formOpen, setFormOpen] = useState(false);
  const [formRoom, setFormRoom] = useState<AdminRoom | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // F8: barrido global secuencial de todas las habitaciones publicadas con noches pendientes.
  const [sweeping, setSweeping] = useState(false);
  const [sweepCurrent, setSweepCurrent] = useState(0);
  const [sweepTotal, setSweepTotal] = useState(0);

  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const totpRef = useRef<HTMLInputElement>(null);

  // — Tablero 2026-10-04: acciones rápidas y masivas (petición del responsable) —

  /** Acción masiva activa; `null` = fuera del modo de selección. */
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  /** Ids seleccionados (siempre subconjunto de las elegibles para la acción activa). */
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  /** Habitaciones pendientes de publicar: una (acción rápida/ficha) o un lote (masiva). */
  const [pendingPublish, setPendingPublish] = useState<{ ids: string[] } | null>(null);
  /** `true` mientras se ejecuta una acción masiva (release/toggle). */
  const [bulkRunning, setBulkRunning] = useState(false);

  /** Elegibilidad por acción masiva: regla pura y probada en `room-bulk.ts` (2026-10-04). */
  const isEligibleFor = isRoomEligibleForBulk;

  const toggleSelection = (roomId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  /** Marca/desmarca de golpe todas las habitaciones elegibles para la acción activa. */
  const selectAllEligible = (): void => {
    if (!bulkAction) return;
    const eligible = new Set(selectableRoomIds(rooms, bulkAction));
    if (eligible.size === 0) return;
    const allSelected = [...eligible].every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : eligible);
  };

  /** Cambia de acción masiva y **poda la selección**: solo sobrevive lo que la nueva acción admite. */
  const changeBulkAction = (action: BulkAction): void => {
    setBulkAction(action);
    const eligible = new Set(selectableRoomIds(rooms, action));
    setSelectedIds((prev) => new Set([...prev].filter((id) => eligible.has(id))));
  };

  const exitBulkMode = (): void => {
    setBulkAction(null);
    setSelectedIds(new Set());
  };

  /** Etiqueta del tipo de habitación con el nombre del catálogo (respaldo: el propio código). */
  const typeLabel = (roomType: string): string =>
    catalogEntryName(options?.roomTypes ?? [], roomType, locale);
  const statusLabel = (status: AdminRoom["publicationStatus"]): string =>
    t(`status.${status}` as "status.DRAFT");
  const operationalLabel = (status: AdminRoom["operationalStatus"]): string =>
    t(`operational.${status}` as "operational.CLEAN");

  /**
   * Icono del **estado de publicación** (2026-10-04). El color sale de un token del sistema visual
   * (nunca un HEX suelto): `success` para publicada, `warning` para borrador/mantenimiento,
   * `coral-text` para fuera de servicio y `ink-soft` para pausada.
   */
  const publicationIcon = (status: AdminRoom["publicationStatus"]): ReactNode => {
    switch (status) {
      case "DRAFT":
        return <DraftIcon className="text-warning" />;
      case "PUBLISHED":
        return <PublishedIcon className="text-success" />;
      case "PAUSED":
        return <PausedIcon className="text-ink-soft" />;
      case "MAINTENANCE":
        return <MaintenanceIcon className="text-warning" />;
      case "OUT_OF_SERVICE":
        return <OutOfServiceIcon className="text-coral-text" />;
      default:
        return null;
    }
  };

  /** Icono del **estado operativo** (2026-10-04): limpia, sucia u ocupada. */
  const operationalIcon = (status: AdminRoom["operationalStatus"]): ReactNode => {
    switch (status) {
      case "CLEAN":
        return <CleanIcon className="text-success" />;
      case "DIRTY":
        return <DirtyIcon className="text-warning" />;
      case "OCCUPIED":
        return <OccupiedIcon className="text-ink-soft" />;
      default:
        return null;
    }
  };

  const loadRooms = useCallback(async (): Promise<void> => {
    setListLoading(true);
    try {
      const res = await apiFetch("/api/admin/rooms");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      // `reservedNights` se normaliza a número (el `COUNT()` de PostgreSQL viaja como cadena en JSON):
      // las reglas y el distintivo del tablero comparan con `=== 0` (2026-10-04).
      setRooms(
        ((data.rooms ?? []) as AdminRoom[]).map((room) => ({
          ...room,
          reservedNights: reservedNightsOf(room),
        })),
      );
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    } finally {
      setListLoading(false);
    }
  }, [apiFetch, t]);

  /** Catálogos de la ficha (tipos, servicios y espacios): se leen una vez al montar el panel. */
  const loadOptions = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch("/api/admin/rooms/options");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      setOptions({
        roomTypes: data.roomTypes ?? [],
        amenities: data.amenities ?? [],
        spaceTypes: data.spaceTypes ?? [],
      });
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    }
  }, [apiFetch, t]);

  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      setDetailLoading(true);
      try {
        const res = await apiFetch(`/api/admin/rooms/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("loadError"));
        setDetail(
          data.room
            ? {
                room: data.room as AdminRoom,
                images: data.images ?? [],
                publications: data.publications ?? [],
                amenities: data.amenities ?? [],
                spaces: data.spaces ?? [],
                reservedNights: data.reservedNights ?? [],
                window: data.window ?? null,
              }
            : null,
        );
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
    void loadOptions();
  }, [loadRooms, loadOptions]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, detailVersion, loadDetail]);

  /** Abre la ficha flotante de una fila; limpia la anterior para no pintar datos de otra habitación. */
  function openDetail(roomId: string): void {
    setSelectedId(roomId);
    setDetail(null);
    setDetailVersion((value) => value + 1);
  }

  function closeDetail(): void {
    setSelectedId(null);
    setDetail(null);
  }

  /** Guardo desde el formulario flotante: refresca tabla y ficha, y abre la ficha de la guardada. */
  async function handleFormSaved(room: AdminRoom, outcome: RoomFormOutcome): Promise<void> {
    setFormOpen(false);
    setFormRoom(null);
    setNotice(
      outcome.photosFailed
        ? { kind: "error", text: ta("roomPhotoUploadError") }
        : { kind: "ok", text: outcome.created ? t("created") : t("saved") },
    );
    await loadRooms();
    setSelectedId(room.id);
    // Si la ficha abierta es la misma, se conserva (sin parpadeo) y se recarga con la versión nueva.
    setDetail((current) => (current && current.room.id === room.id ? current : null));
    setDetailVersion((value) => value + 1);
  }

  /** Cambia el estado de publicación (pausa, mantenimiento, fuera de servicio…) vía `PATCH`. */
  async function handleStatus(status: AdminRoom["publicationStatus"]): Promise<void> {
    const room = detail?.room;
    if (!room) return;
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationStatus: status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("saveError"));
      setDetail((current) =>
        current ? { ...current, room: (data.room ?? current.room) as AdminRoom } : current,
      );
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    }
  }

  /**
   * Confirma la publicación con el TOTP del diálogo. Atiende **dos caminos** (2026-10-04):
   *   · una sola habitación (acción rápida de fila o botón de la ficha) → flujo unitario de siempre;
   *   · un lote (acción masiva) → `POST /api/admin/rooms/bulk/publish` con **un** TOTP y anclaje
   *     on-chain best-effort por habitación.
   */
  async function handlePublish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const targetIds = pendingPublish?.ids ?? (detail?.room ? [detail.room.id] : []);
    if (targetIds.length === 0) return;
    setPublishing(true);
    setNotice(null);
    try {
      if (targetIds.length > 1) {
        await publishBatch(targetIds);
        return;
      }
      const room = rooms.find((entry) => entry.id === targetIds[0]) ?? detail?.room;
      if (!room) return;
      // Paso 1: huella a firmar/anclar (D-2/D-18).
      const prepRes = await apiFetch(`/api/admin/rooms/${room.id}/publish`);
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
            args: [BigInt(room.roomNumber)],
          })) as boolean;

          if (!registered) {
            const registerHash = await writeContract(config, {
              address: contractAddress,
              abi: hotelNightsAbi,
              functionName: "registerRoom",
              args: [BigInt(room.roomNumber), room.roomType.toLowerCase()],
            });
            await waitForTransactionReceipt(config, { hash: registerHash });
          }

          txHash = await writeContract(config, {
            address: contractAddress,
            abi: hotelNightsAbi,
            functionName: "publishRoom",
            args: [BigInt(room.roomNumber), contentHash as `0x${string}`],
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

      const res = await apiFetch(`/api/admin/rooms/${room.id}/publish`, {
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
      setPendingPublish(null);
      setDetail((current) =>
        current ? { ...current, room: (data.room ?? current.room) as AdminRoom } : current,
      );
      const publishedText = data.onChainAnchored ? t("published") : t("publishedPending");
      setNotice({ kind: "ok", text: publishedText });
      await loadRooms();
      // F8 · D-4: el primer acuñado de la ventana ocurre al publicar. Si falla, la publicación YA
      // es válida: no se revierte y queda el botón «Acuñar ventana» para reintentar (D-17).
      await runMintWindow(publishedText, room.id);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("publishError") });
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Publicación **masiva** (2026-10-04): un solo TOTP para el lote. El anclaje on-chain es
   * best-effort por habitación — sin wallet o si una transacción falla, esa habitación se publica
   * igual y queda `PENDING_ANCHOR` (D-18). Nunca revierte por el anclaje.
   */
  async function publishBatch(ids: string[]): Promise<void> {
    const txHashes: Record<string, string> = {};
    if (isConnected && address) {
      for (const id of ids) {
        const room = rooms.find((entry) => entry.id === id);
        if (!room) continue;
        try {
          const prepRes = await apiFetch(`/api/admin/rooms/${room.id}/publish`);
          const prep = await prepRes.json().catch(() => ({}));
          const contentHash = typeof prep.contentHash === "string" ? prep.contentHash : undefined;
          if (!contentHash) continue;

          const registered = (await readContract(config, {
            address: contractAddress,
            abi: hotelNightsAbi,
            functionName: "isRoomRegistered",
            args: [BigInt(room.roomNumber)],
          })) as boolean;
          if (!registered) {
            const registerHash = await writeContract(config, {
              address: contractAddress,
              abi: hotelNightsAbi,
              functionName: "registerRoom",
              args: [BigInt(room.roomNumber), room.roomType.toLowerCase()],
            });
            await waitForTransactionReceipt(config, { hash: registerHash });
          }
          const hash = await writeContract(config, {
            address: contractAddress,
            abi: hotelNightsAbi,
            functionName: "publishRoom",
            args: [BigInt(room.roomNumber), contentHash as `0x${string}`],
          });
          await waitForTransactionReceipt(config, { hash });
          txHashes[room.id] = hash;
        } catch {
          // Best-effort: esta habitación se publica sin anclaje y queda PENDING_ANCHOR.
        }
      }
    }

    const res = await apiFetch("/api/admin/rooms/bulk/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomIds: ids, confirmTotpCode: mfaCode.trim(), txHashes }),
    });
    const data = await res.json().catch(() => ({}));
    const failed = Array.isArray(data.results)
      ? (data.results as Array<{ ok?: boolean }>).filter((result) => !result.ok).length
      : 0;
    if (!res.ok && failed === ids.length) throw new Error(data.message || ta("roomBulkPublishError"));
    setMfaOpen(false);
    setMfaCode("");
    setPendingPublish(null);
    setNotice({
      kind: "ok",
      text: ta("roomBulkPublishDone", { published: data.published ?? 0, failed }),
    });
    exitBulkMode();
    await loadRooms();
  }

  /**
   * Acción rápida **Activar/Desactivar** de una fila (2026-10-04): conmuta `PUBLISHED` ↔ `PAUSED`
   * por `PATCH`, sin TOTP — la regla de reanudación del servidor admite `PAUSED → PUBLISHED` porque
   * la ficha ya fue publicada y quedó anclada.
   */
  async function handleQuickToggle(room: AdminRoom): Promise<void> {
    if (room.publicationStatus !== "PUBLISHED" && room.publicationStatus !== "PAUSED") return;
    const target: AdminRoom["publicationStatus"] =
      room.publicationStatus === "PUBLISHED" ? "PAUSED" : "PUBLISHED";
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationStatus: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("saveError"));
      await loadRooms();
      if (detail?.room.id === room.id) setDetailVersion((value) => value + 1);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("saveError") });
    }
  }

  /** Acción masiva **Liberar** (2026-10-04): cancela las reservas activas de la selección. */
  async function handleBulkRelease(): Promise<void> {
    if (selectedIds.size === 0) return;
    setBulkRunning(true);
    setNotice(null);
    try {
      const selectedCount = selectedIds.size;
      const res = await apiFetch("/api/admin/rooms/bulk/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || ta("roomBulkReleaseError"));
      setNotice({
        kind: "ok",
        text: ta("roomBulkReleaseDone", { released: data.released ?? 0, rooms: selectedCount }),
      });
      exitBulkMode();
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : ta("roomBulkReleaseError") });
    } finally {
      setBulkRunning(false);
    }
  }

  /** Acción masiva **Activar/Desactivar** (2026-10-04): conmuta el estado de la selección. */
  async function handleBulkToggle(): Promise<void> {
    if (selectedIds.size === 0) return;
    setBulkRunning(true);
    setNotice(null);
    try {
      const res = await apiFetch("/api/admin/rooms/bulk/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || ta("roomBulkToggleError"));
      setNotice({ kind: "ok", text: ta("roomBulkToggleDone", { toggled: data.toggled ?? 0 }) });
      exitBulkMode();
      await loadRooms();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : ta("roomBulkToggleError") });
    } finally {
      setBulkRunning(false);
    }
  }

  async function handleArchive(): Promise<void> {
    const room = detail?.room;
    if (!room) return;
    if (!window.confirm(t("archiveConfirm"))) return;
    setArchiving(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${room.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("archiveError"));
      setNotice({ kind: "ok", text: t("archived") });
      closeDetail();
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
  async function runMintWindow(prefix?: string, roomId?: string): Promise<void> {
    // La acción rápida de fila puede publicar sin ficha abierta: el id explícito gana al de la ficha.
    const targetId = roomId ?? detail?.room?.id;
    if (!targetId) return;
    try {
      const result = await mintWindow.run(targetId);
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

  const room = detail?.room ?? null;

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

      {/* Alta: botón que abre el formulario FLOTANTE (antes era una tarjeta en línea). */}
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            data-testid="room-new-open"
            onClick={() => {
              setFormRoom(null);
              setFormOpen(true);
            }}
            className={ACTION}
          >
            {t("newTitle")}
          </button>
          <button type="button" onClick={() => void loadRooms()} className={GHOST} disabled={listLoading}>
            {t("refresh")}
          </button>
        </div>
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

        <p className="mb-3 text-small text-ink-soft">{ta("roomsSummaryHint")}</p>

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
                  <th scope="col" className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="rooms-bulk-toggle"
                        onClick={() => (bulkAction ? exitBulkMode() : changeBulkAction("PUBLISH"))}
                        aria-pressed={bulkAction !== null}
                        aria-label={ta("roomBulkSelect")}
                        title={ta("roomBulkSelect")}
                        className="rounded p-1 text-ink transition-colors hover:bg-mist-2"
                      >
                        <BulkSelectIcon size={16} />
                      </button>
                      {bulkAction && (
                        <input
                          type="checkbox"
                          data-testid="rooms-bulk-all"
                          aria-label={ta("roomBulkSelect")}
                          checked={
                            selectableRoomIds(rooms, bulkAction).length > 0 &&
                            selectableRoomIds(rooms, bulkAction).every((id) => selectedIds.has(id))
                          }
                          onChange={selectAllEligible}
                          className="h-4 w-4"
                        />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-2 py-2">{t("colNumber")}</th>
                  <th scope="col" className="px-2 py-2">{t("colType")}</th>
                  <th scope="col" className="px-2 py-2">{t("colCapacity")}</th>
                  <th scope="col" className="px-2 py-2">{t("colBeds")}</th>
                  <th scope="col" className="px-2 py-2">{ta("roomColSize")}</th>
                  <th scope="col" className="px-2 py-2">{ta("roomColRate")}</th>
                  <th scope="col" className="px-2 py-2">{t("colStatus")}</th>
                  <th scope="col" className="px-2 py-2">{t("colOperational")}</th>
                  <th scope="col" className="px-2 py-2">
                    {bulkAction ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          data-testid="rooms-bulk-publish"
                          onClick={() => {
                            if (bulkAction === "PUBLISH" && selectedIds.size > 0) {
                              setPendingPublish({ ids: [...selectedIds] });
                              setMfaOpen(true);
                            } else {
                              changeBulkAction("PUBLISH");
                            }
                          }}
                          aria-pressed={bulkAction === "PUBLISH"}
                          aria-label={ta("roomBulkPublish")}
                          title={ta("roomBulkPublish")}
                          disabled={bulkRunning || (bulkAction === "PUBLISH" && selectedIds.size === 0)}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2 disabled:opacity-40"
                        >
                          <QuickPublishIcon size={16} />
                        </button>
                        <button
                          type="button"
                          data-testid="rooms-bulk-release"
                          onClick={() => {
                            if (bulkAction === "RELEASE") void handleBulkRelease();
                            else changeBulkAction("RELEASE");
                          }}
                          aria-pressed={bulkAction === "RELEASE"}
                          aria-label={ta("roomBulkRelease")}
                          title={ta("roomBulkRelease")}
                          disabled={bulkRunning || (bulkAction === "RELEASE" && selectedIds.size === 0)}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2 disabled:opacity-40"
                        >
                          <BulkReleaseIcon size={16} />
                        </button>
                        <button
                          type="button"
                          data-testid="rooms-bulk-toggle-action"
                          onClick={() => {
                            if (bulkAction === "TOGGLE") void handleBulkToggle();
                            else changeBulkAction("TOGGLE");
                          }}
                          aria-pressed={bulkAction === "TOGGLE"}
                          aria-label={ta("roomBulkToggle")}
                          title={ta("roomBulkToggle")}
                          disabled={bulkRunning || (bulkAction === "TOGGLE" && selectedIds.size === 0)}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2 disabled:opacity-40"
                        >
                          <QuickToggleIcon size={16} />
                        </button>
                        <span className="ml-1 text-small text-ink-soft">
                          {ta("roomBulkCount", { count: selectedIds.size })}
                        </span>
                        <button
                          type="button"
                          data-testid="rooms-bulk-cancel"
                          onClick={exitBulkMode}
                          aria-label={ta("roomBulkCancel")}
                          title={ta("roomBulkCancel")}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2"
                        >
                          <BulkCancelIcon size={16} />
                        </button>
                      </div>
                    ) : (
                      ta("roomColActions")
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((entry) => (
                  <tr
                    key={entry.id}
                    data-testid={`room-row-${entry.roomNumber}`}
                    // La fila entera abre la ficha (comodidad); los controles accesibles son los botones.
                    onClick={() => openDetail(entry.id)}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-mist-2"
                  >
                    {/* Primera columna: casilla de selección masiva (oculta fuera del modo masivo). */}
                    <td className="px-2 py-2">
                      {bulkAction && (
                        <input
                          type="checkbox"
                          data-testid={`room-select-${entry.roomNumber}`}
                          aria-label={`${t("colNumber")} ${entry.roomNumber}`}
                          checked={selectedIds.has(entry.id)}
                          disabled={!isEligibleFor(entry, bulkAction)}
                          onChange={() => toggleSelection(entry.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 disabled:opacity-30"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 font-semibold text-ink">{entry.roomNumber}</td>
                    <td className="px-2 py-2">{typeLabel(entry.roomType)}</td>
                    <td className="px-2 py-2">{entry.capacity}</td>
                    <td className="px-2 py-2">{entry.beds}</td>
                    <td className="px-2 py-2">{entry.sizeM2 === null ? "—" : `${entry.sizeM2} m²`}</td>
                    <td className="px-2 py-2">{formatRate(entry.baseRateWei)}</td>
                    {/* Publicación: icono por estado + distintivo «Reservada» con las noches de la ventana. */}
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {publicationIcon(entry.publicationStatus)}
                        {statusLabel(entry.publicationStatus)}
                        {entry.reservedNights > 0 && (
                          <span
                            data-testid={`room-reserved-${entry.roomNumber}`}
                            title={ta("roomReservedBadge", { count: entry.reservedNights })}
                            className="inline-flex items-center text-info"
                          >
                            <ReservedIcon size={14} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        {operationalIcon(entry.operationalStatus)}
                        {operationalLabel(entry.operationalStatus)}
                      </span>
                    </td>
                    {/* Acciones rápidas (2026-10-04): publicar, reservar (abre el calendario) y activar/desactivar. */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`room-quick-publish-${entry.roomNumber}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingPublish({ ids: [entry.id] });
                            setMfaOpen(true);
                          }}
                          disabled={entry.publicationStatus === "PUBLISHED"}
                          aria-label={ta("roomQuickPublish")}
                          title={ta("roomQuickPublish")}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2 disabled:opacity-30"
                        >
                          <QuickPublishIcon size={16} />
                        </button>
                        <button
                          type="button"
                          data-testid={`room-quick-reserve-${entry.roomNumber}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(entry.id);
                          }}
                          aria-label={ta("roomQuickReserve")}
                          title={ta("roomQuickReserve")}
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2"
                        >
                          <QuickReserveIcon size={16} />
                        </button>
                        <button
                          type="button"
                          data-testid={`room-quick-toggle-${entry.roomNumber}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleQuickToggle(entry);
                          }}
                          disabled={entry.publicationStatus !== "PUBLISHED" && entry.publicationStatus !== "PAUSED"}
                          aria-label={
                            entry.publicationStatus === "PUBLISHED" ? ta("roomQuickToggleOn") : ta("roomQuickToggleOff")
                          }
                          title={
                            entry.publicationStatus === "PUBLISHED" ? ta("roomQuickToggleOn") : ta("roomQuickToggleOff")
                          }
                          className="rounded p-1 text-ink transition-colors hover:bg-mist-2 disabled:opacity-30"
                        >
                          <QuickToggleIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/*
        Ficha flotante de detalle: envuelve el componente reutilizable `RoomDetailCard` (que decide
        las secciones según el perfil) y conserva las acciones de la sección —editar, publicar con
        TOTP, pausar, mantenimiento, fuera de servicio, acuñar ventana y archivar— con sus
        `data-testid` históricos.
      */}
      {selectedId && (
        <ModalShell
          title={room ? `${ta("roomDetailOpen")} · ${room.roomNumber}` : ta("roomDetailOpen")}
          closeLabel={ta("roomDetailClose")}
          onClose={closeDetail}
          // Con el TOTP o el formulario abiertos encima, `Escape` y el tabulador son de ellos.
          enabled={!mfaOpen && !formOpen}
          testId="room-detail-dialog"
          actions={
            room ? (
              <>
                <button
                  type="button"
                  data-testid="room-edit-open"
                  onClick={() => {
                    setFormRoom(room);
                    setFormOpen(true);
                  }}
                  className={GHOST}
                >
                  {ta("roomFormEditTitle")}
                </button>
                {room.publicationStatus === "PUBLISHED" ? (
                  <button
                    type="button"
                    data-testid="room-pause"
                    onClick={() => void handleStatus("PAUSED")}
                    className={GHOST}
                  >
                    {t("pause")}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="room-publish-open"
                    onClick={() => {
                      setPendingPublish({ ids: [room.id] });
                      setMfaOpen(true);
                    }}
                    className={ACTION}
                  >
                    {t("publish")}
                  </button>
                )}
                {room.publicationStatus !== "MAINTENANCE" && (
                  <button
                    type="button"
                    data-testid="room-maintenance"
                    onClick={() => void handleStatus("MAINTENANCE")}
                    className={GHOST}
                  >
                    {t("status.MAINTENANCE")}
                  </button>
                )}
                {room.publicationStatus !== "OUT_OF_SERVICE" && (
                  <button
                    type="button"
                    data-testid="room-out-of-service"
                    onClick={() => void handleStatus("OUT_OF_SERVICE")}
                    className={GHOST}
                  >
                    {t("status.OUT_OF_SERVICE")}
                  </button>
                )}
                {room.publicationStatus === "PUBLISHED" && isConnected && (
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
                <button
                  type="button"
                  data-testid="room-archive"
                  onClick={() => void handleArchive()}
                  disabled={archiving}
                  className={GHOST}
                >
                  {archiving ? t("archiving") : t("archive")}
                </button>
              </>
            ) : undefined
          }
        >
          {detailLoading || !detail || !room ? (
            <p role="status" className="mt-5 text-ink-soft">
              {t("loading")}
            </p>
          ) : (
            <div className="mt-5">
              {/*
                La ficha de servidor tipa sus fechas con `Date`, pero aquí llegan como cadenas ISO
                (JSON). Se convierte una sola vez y de forma documentada en lugar de importar el tipo
                del servidor (prohibido en cliente por `boundaries.test.ts`); la ficha no pinta esas
                tres fechas.
              */}
              <RoomDetailCard
                room={room as unknown as RoomCardRoom}
                amenities={detail.amenities}
                spaces={detail.spaces}
                publications={detail.publications}
                reservedNights={detail.reservedNights}
                images={detail.images}
                catalog={{
                  amenities: options?.amenities ?? [],
                  spaceTypes: options?.spaceTypes ?? [],
                }}
                viewer="OWNER"
                locale={locale}
                window={detail.window}
              />
            </div>
          )}
        </ModalShell>
      )}

      {/* Formulario flotante de alta/edición (ficha completa y galería). */}
      {formOpen && (
        <RoomFormDialog
          apiFetch={apiFetch}
          key={formRoom?.id ?? "new"}
          room={formRoom}
          detail={formRoom && detail?.room.id === formRoom.id ? detail : null}
          options={options}
          onClose={() => setFormOpen(false)}
          onSaved={(savedRoom, outcome) => void handleFormSaved(savedRoom, outcome)}
        />
      )}

      {mfaOpen && (
        <ModalShell
          title={t("publishTitle")}
          subtitle={t("publishTagline")}
          closeLabel={t("cancel")}
          onClose={() => {
            setMfaOpen(false);
            setPendingPublish(null);
          }}
          testId="room-publish-dialog"
          initialFocus={totpRef}
        >
          {pendingPublish && pendingPublish.ids.length > 1 && (
            <p className="mt-3 text-small text-ink-soft" role="status">
              {ta("roomBulkCount", { count: pendingPublish.ids.length })}
            </p>
          )}
          <form onSubmit={handlePublish} className="mt-4 flex flex-col gap-3">
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
                data-testid="room-publish-totp"
                className={FIELD}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMfaOpen(false)} disabled={publishing} className={GHOST}>
                {t("cancel")}
              </button>
              <button
                type="submit"
                data-testid="room-publish-confirm"
                disabled={publishing || mfaCode.trim().length !== 6}
                className={ACTION}
              >
                {publishing ? t("publishing") : t("mfaConfirm")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
