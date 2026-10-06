"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  DECOR_STYLES,
  ROOM_PHOTO_JPEG_QUALITY,
  ROOM_PHOTO_LIMIT,
  ROOM_PHOTO_MAX_BYTES,
  ROOM_PHOTO_MAX_EDGE_PX,
  ROOM_TYPES,
  ROOM_VIEWS,
  type RoomDecorStyle,
  type RoomViewKind,
} from "@/lib/room-fields";
import type { AdminSession } from "../useAdminSession";
import {
  catalogEntryName,
  type AdminRoom,
  type AdminRoomDetail,
  type AdminRoomImage,
  type AdminRoomOptions,
} from "./room-dto";
import { ModalShell } from "@/components/ui/ModalShell";

/**
 * **Formulario flotante de habitación** (2026-10-02): alta y edición de la ficha completa.
 *
 * Sustituye a la tarjeta de alta en línea de `RoomsAdmin`. Agrupa las cuatro dimensiones de la ficha
 * (físicas, decoración, servicios y espacios) y la galería, en un `role="dialog" aria-modal` con el
 * patrón accesible del TOTP de publicación (foco al primer campo, trampa de foco, `Escape`, devolución
 * del foco al disparador; ver `useModalDialog`).
 *
 * **i18n · dos namespaces a propósito**: las etiquetas de la ficha básica (número, tipo, capacidad,
 * camas, planta, m², descripciones) y las acciones heredadas (crear/guardar/cancelar) viven en el
 * namespace `rooms`, que es de donde ya las leía el panel; las claves de la ficha ampliada
 * (secciones físicas/decorativas/servicios/espacios, fotos y sus mensajes) viven en `admin`. No se
 * inventa ninguna clave nueva.
 *
 * **Fotos (orden obligatorio)**: el endpoint de imágenes cuelga de la habitación (`/rooms/[id]/images`),
 * así que primero se guarda la ficha (POST en alta, PATCH en edición) y **después** se suben las fotos
 * en cola; la posición 1 es portada automáticamente y solo se hace el `PATCH {isCover:true}` cuando el
 * operador eligió como portada una foto distinta de la primera. Si la subida falla, la ficha YA está
 * guardada: se avisa y se deja la habitación creada para reintentar desde la edición (nunca se pierde
 * el alta por una foto).
 */

/** Estilos del panel (mismos que el resto del back-office: frontera `line-strong` en los controles). */
const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
/** Casilla: el área táctil la da la fila (`min-h-touch`), no la caja de 20 px. */
const CHECK = "h-5 w-5 flex-none accent-azure";
const CHECK_ROW = "flex min-h-touch items-center gap-3 text-small font-medium text-ink";

/** Foto preparada en el navegador y aún no subida (el id local distingue la portada elegida). */
interface StagedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
}

/** Contador local de fotos preparadas: solo vive en el navegador y no necesita ser único global. */
let stagedSequence = 0;
const nextStagedId = (): string => `new-${(stagedSequence += 1)}`;

/** Lee un texto del formulario; cadena vacía = sin valor (`null`). */
function textOf(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Lee un número del formulario; vacío = `null`. */
function numberOf(form: FormData, name: string): number | null {
  const value = textOf(form, name);
  return value === null ? null : Number(value);
}

/** ¿La casilla está marcada? (un `checkbox` marcado envía `"on"` como único valor). */
function checkedOf(form: FormData, name: string): boolean {
  return form.get(name) !== null;
}

/**
 * Redimensiona en el navegador antes de subir («calidad media», D-20): lado mayor
 * `ROOM_PHOTO_MAX_EDGE_PX` (1600 px) y JPEG `ROOM_PHOTO_JPEG_QUALITY` (0,75). Así una foto de móvil de
 * 8 MB no viaja entera ni es rechazada por el límite de 2 MB del servidor.
 */
async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, ROOM_PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", ROOM_PHOTO_JPEG_QUALITY),
  );
  if (!blob) throw new Error("JPEG_ENCODE_FAILED");
  return blob;
}

/** Resultado de un guardado correcto: el panel decide el aviso y si abre la ficha. */
export interface RoomFormOutcome {
  /** `true` si la ficha se acaba de crear (el panel lo anuncia con `created`); `false` = edición. */
  created: boolean;
  /** `true` si alguna foto no subió (la ficha YA está guardada; el panel avisa y se reintenta). */
  photosFailed: boolean;
}

export interface RoomFormDialogProps {
  /**
   * `fetch` autenticado por cookie (lo trae la sesión del panel). Se recibe **por props** y no del
   * contexto de administración: así el formulario se puede montar —y probar— fuera del shell
   * (2026-10-02), que es lo que permite verificarlo en un navegador sin sesión ni base de datos.
   */
  apiFetch: AdminSession["apiFetch"];
  /** Ficha que se edita; `null` = alta. */
  room: AdminRoom | null;
  /** Detalle ya cargado (galería, servicios y espacios) para precargar la edición. */
  detail: AdminRoomDetail | null;
  /** Catálogos de `/api/admin/rooms/options` (tipos, servicios y espacios). */
  options: AdminRoomOptions | null;
  /** Cierra sin guardar. */
  onClose: () => void;
  /** La ficha se guardó correctamente; `outcome` dice si fue alta y si falló alguna foto. */
  onSaved: (room: AdminRoom, outcome: RoomFormOutcome) => void;
}

export function RoomFormDialog({ apiFetch, room, detail, options, onClose, onSaved }: RoomFormDialogProps) {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  const locale = useLocale();

  const editing = room !== null;
  // En edición se precarga lo que ya tiene la ficha; sin detalle (no debería ocurrir: el botón de
  // edición vive en la ficha flotante) se dejan los conjuntos vacíos y NO se envían, para no borrar
  // servicios ni espacios por un detalle que no se llegó a leer.
  const hasPrefill = detail !== null;
  const prefillAmenities = detail?.amenities ?? [];
  const prefillSpaces = detail?.spaces ?? [];

  const [gallery, setGallery] = useState<readonly AdminRoomImage[]>(detail?.images ?? []);
  const [staged, setStaged] = useState<readonly StagedPhoto[]>([]);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  const totalPhotos = gallery.length + staged.length;
  const busy = saving || uploading || resizing;
  /** Cierre diferido: con la ficha guardándose o las fotos subiendo, el diálogo no se cierra. */
  const requestClose = (): void => {
    if (!busy) onClose();
  };

  const fieldId = (field: string): string => `${editing ? "room-edit" : "room-new"}-${field}`;

  /**
   * Etiquetas de las listas cerradas con **llamadas literales** (nunca con una plantilla de clave):
   * así el guardián de i18n (`i18n-keys.test.ts`) comprueba que las claves existen de verdad.
   */
  const viewLabel = (view: RoomViewKind): string =>
    view === "SEA" ? ta("roomViewSEA") : view === "GARDEN" ? ta("roomViewGARDEN") : ta("roomViewINTERIOR");
  const decorStyleLabel = (style: RoomDecorStyle): string => {
    switch (style) {
      case "MEDITERRANEAN":
        return ta("decorStyleMEDITERRANEAN");
      case "CONTEMPORARY":
        return ta("decorStyleCONTEMPORARY");
      case "CLASSIC":
        return ta("decorStyleCLASSIC");
      case "RUSTIC":
        return ta("decorStyleRUSTIC");
      default:
        return ta("decorStyleMINIMAL");
    }
  };

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setError(null);
    const slots = ROOM_PHOTO_LIMIT - totalPhotos;
    if (slots <= 0) return;
    setResizing(true);
    const accepted: StagedPhoto[] = [];
    for (const file of Array.from(files).slice(0, slots)) {
      if (file.type !== "image/jpeg") {
        setError(ta("roomPhotoNotJpeg"));
        continue;
      }
      try {
        const blob = await resizeToJpeg(file);
        if (blob.size > ROOM_PHOTO_MAX_BYTES) {
          setError(ta("roomPhotoTooBig"));
          continue;
        }
        accepted.push({ id: nextStagedId(), blob, previewUrl: URL.createObjectURL(blob) });
      } catch {
        setError(ta("roomPhotoUploadError"));
      }
    }
    setStaged((current) => [...current, ...accepted]);
    setResizing(false);
  }

  function removeStaged(id: string): void {
    setStaged((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setCoverKey((current) => (current === id ? null : current));
  }

  /** La portada de una foto ya subida se aplica al momento (igual que la galería histórica). */
  async function markExistingCover(imageId: string): Promise<void> {
    if (!room) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${room.id}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCover: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("saveError"));
      setGallery((data.images ?? gallery) as readonly AdminRoomImage[]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t("saveError"));
    }
  }

  async function removeExistingImage(imageId: string): Promise<void> {
    if (!room) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/rooms/${room.id}/images/${imageId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("deleteError"));
      }
      setGallery((current) => current.filter((image) => image.id !== imageId));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t("deleteError"));
    }
  }

  /** Sube las fotos en cola y aplica la portada elegida (ver el comentario de cabecera: van DESPUÉS). */
  async function persistPhotos(roomId: string): Promise<void> {
    if (staged.length === 0) return;
    setUploading(true);
    const uploaded: AdminRoomImage[] = [];
    try {
      for (const photo of staged) {
        const body = new FormData();
        // El servidor renombra con la nomenclatura canónica (D-5): aquí solo importa que sea JPG.
        body.append("file", new File([photo.blob], "room.jpg", { type: "image/jpeg" }));
        const res = await apiFetch(`/api/admin/rooms/${roomId}/images`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.image) throw new Error(data.message || ta("roomPhotoUploadError"));
        uploaded.push(data.image as AdminRoomImage);
      }

      const chosenIndex = staged.findIndex((photo) => photo.id === coverKey);
      const chosen = chosenIndex >= 0 ? uploaded[chosenIndex] : undefined;
      if (chosen && !chosen.isCover) {
        const res = await apiFetch(`/api/admin/rooms/${roomId}/images/${chosen.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isCover: true }),
        });
        if (!res.ok) throw new Error(ta("roomPhotoUploadError"));
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      capacity: numberOf(form, "capacity"),
      beds: numberOf(form, "beds"),
      floor: numberOf(form, "floor"),
      sizeM2: numberOf(form, "sizeM2"),
      viewKind: textOf(form, "viewKind"),
      hasBalcony: checkedOf(form, "hasBalcony"),
      isAccessible: checkedOf(form, "isAccessible"),
      descriptionEs: textOf(form, "descriptionEs"),
      descriptionEn: textOf(form, "descriptionEn"),
      descriptionRu: textOf(form, "descriptionRu"),
      decorStyle: textOf(form, "decorStyle"),
      decorPalette: textOf(form, "decorPalette"),
      decorMaterials: textOf(form, "decorMaterials"),
      decorNotesEs: textOf(form, "decorNotesEs"),
      decorNotesEn: textOf(form, "decorNotesEn"),
      decorNotesRu: textOf(form, "decorNotesRu"),
    };
    // El tipo solo se manda si el catálogo lo ofreció (sesión sin catálogos no puede cambiarlo).
    const roomType = textOf(form, "roomType");
    if (roomType) payload.roomType = roomType;
    // En edición, el número se omite si el campo está vacío: PATCH es parcial y no debe exigirlo.
    const roomNumber = numberOf(form, "roomNumber");
    if (roomNumber !== null) payload.roomNumber = roomNumber;
    if (!editing || hasPrefill) {
      payload.amenityCodes = form
        .getAll("amenityCodes")
        .filter((value): value is string => typeof value === "string");
      payload.spaces = form
        .getAll("spaceCodes")
        .filter((value): value is string => typeof value === "string")
        .map((spaceCode) => ({ spaceCode, sizeM2: numberOf(form, `space-size-${spaceCode}`) }));
    }

    // Alta y edición comparten cuerpo: cambian el método, la URL y el texto de error por defecto.
    const target = room ? `/api/admin/rooms/${room.id}` : "/api/admin/rooms";
    const failureText = room ? t("saveError") : t("createError");

    try {
      const res = await apiFetch(target, {
        method: room ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || failureText);
      const saved = (data.room ?? room) as AdminRoom | null;
      if (!saved) throw new Error(failureText);

      let photosFailed = false;
      try {
        await persistPhotos(saved.id);
      } catch {
        // La ficha ya está guardada: la foto que falle no revierte nada (reintentable desde edición).
        photosFailed = true;
      }
      onSaved(saved, { created: room === null, photosFailed });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : failureText);
      setSaving(false);
    }
  }

  const roomTypes = options?.roomTypes ?? [];
  const amenities = options?.amenities ?? [];
  const spaceTypes = options?.spaceTypes ?? [];
  /** Tipos ofrecidos: el catálogo si ya llegó; si no, la lista cerrada compartida (nunca a mano). */
  const typeCodes = roomTypes.length > 0 ? roomTypes.map((entry) => entry.code) : ROOM_TYPES;

  /**
   * Descripciones por idioma. La española conserva el `data-testid` histórico del alta
   * (`room-new-description`), que era un único campo; las demás siguen el patrón `room-edit-*` que ya
   * usaba el formulario en línea.
   */
  const descriptionFields = [
    {
      name: "descriptionEs",
      label: t("formDescriptionEs"),
      value: room?.descriptionEs ?? "",
      testId: editing ? "room-edit-description-es" : "room-new-description",
    },
    {
      name: "descriptionEn",
      label: t("formDescriptionEn"),
      value: room?.descriptionEn ?? "",
      testId: editing ? "room-edit-description-en" : "room-new-description-en",
    },
    {
      name: "descriptionRu",
      label: t("formDescriptionRu"),
      value: room?.descriptionRu ?? "",
      testId: editing ? "room-edit-description-ru" : "room-new-description-ru",
    },
  ] as const;

  /**
   * Notas de decoración por idioma. El catálogo solo tiene la clave común `roomFieldDecorNotes` (no
   * hay una por idioma), así que se rotula con ella más la sigla del idioma: ES/EN/RU se escriben
   * igual en los tres idiomas y no se inventa ninguna clave.
   */
  const decorNoteFields = [
    { name: "decorNotesEs", suffix: "ES", value: room?.decorNotesEs ?? "", testId: fieldId("decor-notes-es") },
    { name: "decorNotesEn", suffix: "EN", value: room?.decorNotesEn ?? "", testId: fieldId("decor-notes-en") },
    { name: "decorNotesRu", suffix: "RU", value: room?.decorNotesRu ?? "", testId: fieldId("decor-notes-ru") },
  ] as const;

  return (
    <ModalShell
      title={editing ? ta("roomFormEditTitle") : ta("roomFormTitle")}
      subtitle={ta("roomFormIntro")}
      closeLabel={t("cancel")}
      // Mientras se guarda o se suben fotos, ni el velo ni `Escape` cierran: la operación sigue.
      onClose={requestClose}
      testId="room-form-dialog"
      initialFocus={firstFieldRef}
      panelClassName="max-w-3xl"
      footerTestId="room-form-footer"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            form="room-form"
            disabled={busy}
            data-testid={editing ? "room-edit-save" : "room-new-submit"}
            className={ACTION}
          >
            {saving
              ? editing
                ? t("saving")
                : t("creating")
              : editing
                ? t("save")
                : t("create")}
          </button>
        </>
      }
    >
      {error && (
        <p
          role="alert"
          data-testid="room-form-error"
          className="mt-4 rounded-brand bg-error-bg px-3 py-2 text-small text-error"
        >
          {error}
        </p>
      )}
      {(resizing || uploading) && (
        <p role="status" aria-live="polite" className="mt-4 rounded-brand bg-info-bg px-3 py-2 text-small text-info">
          {uploading ? ta("roomPhotoUploading") : ta("roomPhotoResizing")}
        </p>
      )}
      {options === null && (
        <p role="status" className="mt-4 text-small text-ink-soft">
          {t("loading")}
        </p>
      )}

      <form id="room-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* ── Físicas ─────────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-4 rounded-brand border border-line p-4">
          <legend className="px-1 text-overline font-semibold uppercase text-ink-soft">
            {ta("roomSectionPhysical")}
          </legend>

          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formNumber")}
              <input
                ref={firstFieldRef}
                name="roomNumber"
                type="number"
                min="1"
                required={!editing}
                defaultValue={room?.roomNumber ?? ""}
                data-testid={fieldId("number")}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formType")}
              <select
                name="roomType"
                required
                defaultValue={room?.roomType ?? "DOBLE"}
                data-testid={fieldId("type")}
                className={FIELD}
              >
                {typeCodes.map((code) => (
                  <option key={code} value={code}>
                    {catalogEntryName(roomTypes, code, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formCapacity")}
              <input
                name="capacity"
                type="number"
                min="1"
                required
                defaultValue={room?.capacity ?? ""}
                data-testid={fieldId("capacity")}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formBeds")}
              <input
                name="beds"
                type="number"
                min="1"
                required
                defaultValue={room?.beds ?? ""}
                data-testid={fieldId("beds")}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formFloor")}
              <input
                name="floor"
                type="number"
                min="0"
                defaultValue={room?.floor ?? ""}
                data-testid={fieldId("floor")}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {t("formSize")}
              <input
                name="sizeM2"
                type="number"
                min="0"
                step="0.01"
                defaultValue={room?.sizeM2 ?? ""}
                data-testid={fieldId("size")}
                className={FIELD}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("roomFieldView")}
              <select
                name="viewKind"
                defaultValue={room?.viewKind ?? ""}
                data-testid={fieldId("view")}
                className={FIELD}
              >
                <option value="">{ta("roomFieldViewNone")}</option>
                {ROOM_VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {viewLabel(view)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col justify-center gap-1">
              <label className={CHECK_ROW}>
                <input
                  type="checkbox"
                  name="hasBalcony"
                  defaultChecked={room?.hasBalcony ?? false}
                  data-testid={fieldId("balcony")}
                  className={CHECK}
                />
                {ta("roomFieldBalcony")}
              </label>
              <label className={CHECK_ROW}>
                <input
                  type="checkbox"
                  name="isAccessible"
                  defaultChecked={room?.isAccessible ?? false}
                  data-testid={fieldId("accessible")}
                  className={CHECK}
                />
                {ta("roomFieldAccessible")}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
            {descriptionFields.map((field) => (
              <label key={field.name} className="flex flex-col gap-1 text-small font-medium text-ink">
                {field.label}
                <textarea
                  name={field.name}
                  rows={3}
                  defaultValue={field.value}
                  data-testid={field.testId}
                  className={FIELD}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── Decorativas ────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-4 rounded-brand border border-line p-4">
          <legend className="px-1 text-overline font-semibold uppercase text-ink-soft">
            {ta("roomSectionDecor")}
          </legend>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("roomFieldDecorStyle")}
              <select
                name="decorStyle"
                defaultValue={room?.decorStyle ?? ""}
                data-testid={fieldId("decor-style")}
                className={FIELD}
              >
                <option value="">{ta("roomFieldStyleNone")}</option>
                {DECOR_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {decorStyleLabel(style)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("roomFieldPalette")}
              <input
                name="decorPalette"
                maxLength={200}
                defaultValue={room?.decorPalette ?? ""}
                data-testid={fieldId("palette")}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-ink">
              {ta("roomFieldMaterials")}
              <input
                name="decorMaterials"
                maxLength={200}
                defaultValue={room?.decorMaterials ?? ""}
                data-testid={fieldId("materials")}
                className={FIELD}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
            {decorNoteFields.map((field) => (
              <label key={field.name} className="flex flex-col gap-1 text-small font-medium text-ink">
                {`${ta("roomFieldDecorNotes")} (${field.suffix})`}
                <textarea
                  name={field.name}
                  rows={3}
                  defaultValue={field.value}
                  data-testid={field.testId}
                  className={FIELD}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── Servicios ──────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-3 rounded-brand border border-line p-4">
          <legend className="px-1 text-overline font-semibold uppercase text-ink-soft">
            {ta("roomSectionServices")}
          </legend>
          {amenities.length === 0 ? (
            // Catálogo vacío: los catálogos no tienen clave propia para decirlo y no se inventa.
            <p className="text-small text-ink-soft">—</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 tablet:grid-cols-3">
              {amenities.map((entry) => (
                <label key={entry.code} className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    name="amenityCodes"
                    value={entry.code}
                    defaultChecked={prefillAmenities.includes(entry.code)}
                    data-testid={`room-amenity-${entry.code}`}
                    className={CHECK}
                  />
                  {catalogEntryName(amenities, entry.code, locale)}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* ── Espacios ───────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-3 rounded-brand border border-line p-4">
          <legend className="px-1 text-overline font-semibold uppercase text-ink-soft">
            {ta("roomSectionSpaces")}
          </legend>
          {spaceTypes.length === 0 ? (
            // Catálogo vacío: los catálogos no tienen clave propia para decirlo y no se inventa.
            <p className="text-small text-ink-soft">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {spaceTypes.map((entry) => {
                const assigned = prefillSpaces.find((space) => space.spaceCode === entry.code);
                return (
                  <li
                    key={entry.code}
                    className="grid grid-cols-1 items-center gap-3 rounded-brand border border-line p-3 tablet:grid-cols-2"
                  >
                    <label className={CHECK_ROW}>
                      <input
                        type="checkbox"
                        name="spaceCodes"
                        value={entry.code}
                        defaultChecked={assigned !== undefined}
                        data-testid={`room-space-${entry.code}`}
                        className={CHECK}
                      />
                      {catalogEntryName(spaceTypes, entry.code, locale)}
                    </label>
                    <label className="flex flex-col gap-1 text-small font-medium text-ink">
                      {ta("roomFieldSpaceSize")}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name={`space-size-${entry.code}`}
                        defaultValue={assigned?.sizeM2 ?? ""}
                        data-testid={`room-space-size-${entry.code}`}
                        className={FIELD}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {/* ── Fotos ──────────────────────────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-3 rounded-brand border border-line p-4">
          <legend className="px-1 text-overline font-semibold uppercase text-ink-soft">
            {ta("roomSectionPhotos")}
          </legend>
          <p className="text-small text-ink-soft">{ta("roomPhotosHint")}</p>
          <p role="status" aria-live="polite" className="text-small font-medium text-ink">
            {ta("roomPhotosCount", { count: totalPhotos, max: ROOM_PHOTO_LIMIT })}
          </p>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {ta("roomPhotoAdd")}
            <input
              type="file"
              accept="image/jpeg"
              multiple
              disabled={busy || totalPhotos >= ROOM_PHOTO_LIMIT}
              data-testid="room-image-upload"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = "";
              }}
              className={FIELD}
            />
          </label>

          <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
            {gallery.map((image) => (
              <li key={image.id} className="flex flex-col gap-2 rounded-brand border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.fileName}
                  className="h-24 w-full rounded-brand object-cover"
                />
                {image.isCover && (
                  <span className="text-micro font-semibold uppercase tracking-wide text-azure-deep">
                    {ta("roomPhotoCover")}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {!image.isCover && (
                    <button
                      type="button"
                      onClick={() => void markExistingCover(image.id)}
                      disabled={busy}
                      className={GHOST}
                    >
                      {ta("roomPhotoSetCover")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeExistingImage(image.id)}
                    disabled={busy}
                    className={GHOST}
                  >
                    {ta("roomPhotoRemove")}
                  </button>
                </div>
              </li>
            ))}

            {staged.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2 rounded-brand border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt=""
                  className="h-24 w-full rounded-brand object-cover"
                />
                {coverKey === photo.id && (
                  <span className="text-micro font-semibold uppercase tracking-wide text-azure-deep">
                    {ta("roomPhotoCover")}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCoverKey(photo.id)}
                    disabled={coverKey === photo.id}
                    className={GHOST}
                  >
                    {ta("roomPhotoSetCover")}
                  </button>
                  <button type="button" onClick={() => removeStaged(photo.id)} disabled={busy} className={GHOST}>
                    {ta("roomPhotoRemove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>

      </form>
    </ModalShell>
  );
}
