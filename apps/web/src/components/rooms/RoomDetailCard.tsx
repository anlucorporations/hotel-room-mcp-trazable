"use client";

import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import {
  profileSeesSection,
  type RoomDecorStyle,
  type RoomViewerProfile,
  type RoomViewKind,
} from "@/lib/room-fields";
import { RoomCalendar } from "./RoomCalendar";

/**
 * **Ficha de habitación reutilizable** (2026-10-02).
 *
 * Componente de presentación puro: recibe la ficha y sus conjuntos por props y **no** depende del
 * contexto del back-office (ni `useAdminContext`, ni `apiFetch`), de modo que pueda montarse desde
 * cualquier instancia del sistema —panel de administración, recepción, housekeeping, mantenimiento o
 * la web pública con perfil `GUEST`— sin arrastrar dependencias de la suite de administración.
 *
 * Las **secciones que se pintan dependen del perfil** (`ROOM_SECTIONS_BY_PROFILE` en
 * `lib/room-fields.ts`): el owner lo ve todo; recepción no ve lo comercial; limpieza y mantenimiento
 * ven decoración y servicios pero no el calendario comercial; el huésped ve la ficha y la
 * disponibilidad publicada.
 *
 * Las secciones que el perfil no ve **no existen en el DOM**: no se pintan placeholders con datos
 * ocultos, porque ocultar con CSS o con marcas de «sección no disponible» deja el dato al alcance de
 * quien inspecciona la página.
 */

/** Entrada del catálogo (servicios o espacios) con su nombre trilingüe. */
export interface RoomCatalogEntry {
  code: string;
  nameEs: string;
  nameEn: string;
  nameRu: string;
}

/**
 * Ficha tal y como la necesita la tarjeta: **contrato propio y de cliente** (2026-10-02).
 *
 * No se importa `RoomRecord` del barril `@hotel/shared` a propósito: este módulo lo consume el
 * navegador y el barril arrastra `pg`/BullMQ al bundle (lo vigila `boundaries.test.ts`, que ya
 * destapó una vez que la home devolvía 500 por este motivo). Es un **subconjunto estructural** del
 * registro del servidor, así que pasarle un `RoomRecord` sigue compilando sin conversión.
 */
export interface RoomCardRoom {
  roomNumber: number;
  roomType: string;
  floor: number | null;
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  baseRateWei: string | null;
  viewKind: RoomViewKind | null;
  hasBalcony: boolean;
  isAccessible: boolean;
  decorStyle: RoomDecorStyle | null;
  decorPalette: string | null;
  decorMaterials: string | null;
  decorNotesEs: string | null;
  decorNotesEn: string | null;
  decorNotesRu: string | null;
  publicationStatus: string;
  operationalStatus: string;
}

/** Catálogos que la ficha necesita para traducir códigos a nombres. */
export interface RoomCardCatalog {
  amenities: readonly RoomCatalogEntry[];
  spaceTypes: readonly RoomCatalogEntry[];
  /** Tipos de habitación (opcional): si falta, la cabecera muestra el código del tipo. */
  roomTypes?: readonly RoomCatalogEntry[];
}

/** Imagen de la galería tal y como la expone la API. */
export interface RoomCardImage {
  id: string;
  fileName: string;
  isCover: boolean;
  url?: string;
}

/** Publicación de la ficha (ventana en la que estuvo publicada). */
export interface RoomCardPublication {
  publishedAt: string;
  unpublishedAt: string | null;
}

export interface RoomDetailCardProps {
  /** Ficha de la habitación (`rooms`). */
  room: RoomCardRoom;
  /** Códigos de servicios asignados. */
  amenities: readonly string[];
  /** Espacios asignados con su superficie. */
  spaces: readonly { spaceCode: string; sizeM2: number | null }[];
  /** Publicaciones de la ficha (para el calendario). */
  publications: readonly RoomCardPublication[];
  /** Noches ocupadas en la ventana, en `YYYY-MM-DD`. */
  reservedNights: readonly string[];
  /** Galería (opcional: la ficha no la necesita para el detalle). */
  images?: readonly RoomCardImage[];
  /** Catálogos para traducir códigos. */
  catalog: RoomCardCatalog;
  /** Perfil de quien mira la ficha: decide las secciones visibles. */
  viewer: RoomViewerProfile;
  /** Idioma activo (`es` | `en` | `ru`). Por defecto `es`. */
  locale?: string;
  /** Ventana ISO del calendario (`YYYY-MM-DD`), para saber si hay datos fuera del mes pintado. */
  window?: { from: string; to: string } | null;
  className?: string;
  /** Si se pasa, la ficha ofrece su propio botón de cierre (el panel puede no necesitarlo). */
  onClose?: () => void;
}

/** Nombre del catálogo en el idioma activo, con respaldo al español. */
export function catalogName(
  entries: readonly RoomCatalogEntry[],
  code: string,
  locale: string,
): string {
  const entry = entries.find((item) => item.code === code);
  if (!entry) return code;
  if (locale === "en") return entry.nameEn || entry.nameEs;
  if (locale === "ru") return entry.nameRu || entry.nameEs;
  return entry.nameEs;
}

/** Tarifa base en wei → ETH legible; `null` si falta o no es un entero válido. */
function formatBaseRate(wei: string | null): string | null {
  if (wei === null || wei.trim() === "") return null;
  try {
    return formatEther(BigInt(wei));
  } catch {
    return null;
  }
}

/** Texto no vacío, o `null` (para no pintar secciones sin contenido). */
function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Descripción en el idioma activo; **sin** respaldo: si no existe, no se pinta texto. */
function activeDescription(room: RoomCardRoom, locale: string): string | null {
  if (locale === "en") return nonEmpty(room.descriptionEn);
  if (locale === "ru") return nonEmpty(room.descriptionRu);
  return nonEmpty(room.descriptionEs);
}

/** Notas de decoración en el idioma activo. */
function activeDecorNotes(room: RoomCardRoom, locale: string): string | null {
  if (locale === "en") return nonEmpty(room.decorNotesEn);
  if (locale === "ru") return nonEmpty(room.decorNotesRu);
  return nonEmpty(room.decorNotesEs);
}

export function RoomDetailCard({
  room,
  amenities,
  spaces,
  publications,
  reservedNights,
  catalog,
  viewer,
  locale = "es",
  window: availableWindow = null,
  className = "",
  onClose,
}: RoomDetailCardProps) {
  const t = useTranslations("admin");
  // «Sí»/«No» no viven en el namespace `admin`; se reutilizan los del namespace neutro `system`.
  const tSystem = useTranslations("system");
  const sees = (section: Parameters<typeof profileSeesSection>[1]) =>
    profileSeesSection(viewer, section);

  const description = activeDescription(room, locale);
  const decorNotes = activeDecorNotes(room, locale);
  const palette = nonEmpty(room.decorPalette);
  const materials = nonEmpty(room.decorMaterials);
  const hasDecor = room.decorStyle !== null || palette !== null || materials !== null || decorNotes !== null;
  const baseRate = formatBaseRate(room.baseRateWei);

  const yesNo = (value: boolean): string => (value ? tSystem("yes") : tSystem("no"));

  /** Etiqueta localizada de la vista exterior (o «sin dato»). */
  const viewLabel = (): string => {
    switch (room.viewKind) {
      case "SEA":
        return t("roomViewSEA");
      case "GARDEN":
        return t("roomViewGARDEN");
      case "INTERIOR":
        return t("roomViewINTERIOR");
      default:
        return t("roomDetailNotSet");
    }
  };

  /** Etiqueta localizada del estilo decorativo (o «sin dato»). */
  const decorStyleLabel = (): string => {
    switch (room.decorStyle) {
      case "MEDITERRANEAN":
        return t("decorStyleMEDITERRANEAN");
      case "CONTEMPORARY":
        return t("decorStyleCONTEMPORARY");
      case "CLASSIC":
        return t("decorStyleCLASSIC");
      case "RUSTIC":
        return t("decorStyleRUSTIC");
      case "MINIMAL":
        return t("decorStyleMINIMAL");
      default:
        return t("roomDetailNotSet");
    }
  };

  return (
    <article
      data-testid="room-detail-card"
      data-viewer={viewer}
      className={`flex flex-col gap-5 ${className}`.trim()}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-h3 font-semibold text-navy">
          {room.roomNumber} · {catalogName(catalog.roomTypes ?? [], room.roomType, locale)}
        </h3>
        <span className="text-small text-ink-soft">{room.publicationStatus}</span>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-touch rounded-pill border border-line-strong bg-shell px-4 text-small font-semibold text-ink transition-colors hover:bg-mist-2"
          >
            {t("roomDetailClose")}
          </button>
        )}
      </header>

      {sees("fisica") && (
        <section data-testid="room-section-fisica">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomSectionPhysical")}</h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-small text-ink">
            <dt className="text-ink-soft">{t("roomDetailFloor")}</dt>
            <dd>{room.floor ?? t("roomDetailNotSet")}</dd>
            <dt className="text-ink-soft">{t("roomDetailCapacity")}</dt>
            <dd>{room.capacity}</dd>
            <dt className="text-ink-soft">{t("roomDetailBeds")}</dt>
            <dd>{room.beds}</dd>
            <dt className="text-ink-soft">{t("roomDetailSize")}</dt>
            <dd>{room.sizeM2 === null ? t("roomDetailNotSet") : `${room.sizeM2} m²`}</dd>
            <dt className="text-ink-soft">{t("roomFieldView")}</dt>
            <dd>{viewLabel()}</dd>
            <dt className="text-ink-soft">{t("roomFieldBalcony")}</dt>
            <dd>{yesNo(room.hasBalcony)}</dd>
            <dt className="text-ink-soft">{t("roomFieldAccessible")}</dt>
            <dd>{yesNo(room.isAccessible)}</dd>
          </dl>
          {description !== null && <p className="mt-2 text-small text-ink">{description}</p>}
        </section>
      )}

      {sees("decorativa") && (
        <section data-testid="room-section-decorativa">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomSectionDecor")}</h4>
          {!hasDecor ? (
            <p className="mt-1 text-small text-ink-soft">{t("roomDetailNoDecor")}</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-small text-ink">
              <dt className="text-ink-soft">{t("roomFieldDecorStyle")}</dt>
              <dd>{decorStyleLabel()}</dd>
              <dt className="text-ink-soft">{t("roomFieldPalette")}</dt>
              <dd>{palette ?? t("roomDetailNotSet")}</dd>
              <dt className="text-ink-soft">{t("roomFieldMaterials")}</dt>
              <dd>{materials ?? t("roomDetailNotSet")}</dd>
              {decorNotes !== null && (
                <>
                  <dt className="text-ink-soft">{t("roomFieldDecorNotes")}</dt>
                  <dd>{decorNotes}</dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {sees("servicios") && (
        <section data-testid="room-section-servicios">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomSectionServices")}</h4>
          {amenities.length === 0 ? (
            <p className="mt-1 text-small text-ink-soft">{t("roomDetailNoServices")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {amenities.map((code) => (
                <li key={code} className="rounded-pill bg-mist-2 px-3 py-1 text-micro font-semibold text-azure-deep">
                  {catalogName(catalog.amenities, code, locale)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sees("espacios") && (
        <section data-testid="room-section-espacios">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomSectionSpaces")}</h4>
          {spaces.length === 0 ? (
            <p className="mt-1 text-small text-ink-soft">{t("roomDetailNoSpaces")}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-small text-ink">
              {spaces.map((space) => (
                <li key={space.spaceCode}>
                  {catalogName(catalog.spaceTypes, space.spaceCode, locale)}
                  {space.sizeM2 !== null ? ` · ${space.sizeM2} m²` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sees("publicaciones") && (
        <section data-testid="room-section-publicaciones">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomCalendarTitle")}</h4>
          <RoomCalendar
            publications={publications}
            reservedNights={reservedNights}
            locale={locale}
            window={availableWindow}
            className="mt-2"
          />
        </section>
      )}

      {sees("comercial") && (
        <section data-testid="room-section-comercial">
          <h4 className="text-overline font-semibold uppercase text-ink-soft">{t("roomDetailRate")}</h4>
          <p className="mt-1 text-h4 font-semibold text-ink">
            {baseRate === null ? t("roomDetailNotSet") : `${baseRate} ETH`}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-small text-ink">
            <dt className="text-ink-soft">{t("roomDetailPublication")}</dt>
            <dd>{room.publicationStatus}</dd>
            <dt className="text-ink-soft">{t("roomDetailOperational")}</dt>
            <dd>{room.operationalStatus}</dd>
          </dl>
        </section>
      )}
    </article>
  );
}
