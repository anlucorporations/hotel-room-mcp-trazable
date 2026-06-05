import { formatEther } from "viem";
import { useTranslations } from "next-intl";
import { splitYYYYMMDD, type NightType } from "@hotel/shared";

/** Locale activo de la app (next-intl). Centralizado para los formateadores `Intl`. */
const APP_LOCALE = "es-ES";

export function formatEth(wei: string): string {
  return `${formatEther(BigInt(wei))} ETH`;
}

export function formatNightDate(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${year}`;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** `Date` en UTC desde un `AAAAMMDD` para casar con la codificación del `tokenId` (MINOR#43). */
const utcDateOf = (yyyymmdd: number): Date => {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Fecha editorial larga («Domingo, 15 de junio de 2026») para la NightCard
 * (DISEÑO-UX §3/§4.1). Usa `Intl.DateTimeFormat` con el locale activo en UTC para
 * casar con la codificación del `tokenId` (MINOR#43).
 */
export function formatNightDateLong(yyyymmdd: number): string {
  const formatted = new Intl.DateTimeFormat(APP_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDateOf(yyyymmdd));
  return capitalize(formatted);
}

/** Etiqueta de mes para el chip de filtro por fecha («Junio 2026», RF-14, MINOR#43). */
export function formatMonthLabel(yyyymmdd: number): string {
  const formatted = new Intl.DateTimeFormat(APP_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDateOf(yyyymmdd));
  return capitalize(formatted);
}

/** Clave de mes (`AAAAMM`) para agrupar y filtrar noches por mes. */
export function monthKeyOf(yyyymmdd: number): number {
  const { year, month } = splitYYYYMMDD(yyyymmdd);
  return year * 100 + month;
}

/** Traductor con la firma mínima que necesitan los resolutores de etiqueta (next-intl). */
type Translate = (key: string) => string;

/**
 * Resuelve la etiqueta de un tipo de habitación vía i18n (MINOR#42): única fuente de
 * verdad para badge y rótulo. Las claves viven en `roomType.{simple,doble,suite}`.
 */
export function roomTypeLabel(t: Translate, type: NightType): string {
  return t(`roomType.${type}`);
}

/**
 * Hook de conveniencia para componentes: devuelve un resolutor de etiqueta de tipo de
 * habitación ligado al namespace `roomType` (DRY).
 */
export function useRoomTypeLabel(): (type: NightType) => string {
  const t = useTranslations("roomType");
  return (type: NightType) => t(type);
}

/**
 * Etiquetas por defecto (español) de tipo de habitación. Se conserva como API síncrona
 * para los consumidores fuera de contexto de componente; los valores son la fuente que
 * replican las claves i18n `roomType.*` (MINOR#42).
 */
export const TYPE_LABEL: Readonly<Record<NightType, string>> = {
  simple: "Simple",
  doble: "Doble",
  suite: "Suite",
};
