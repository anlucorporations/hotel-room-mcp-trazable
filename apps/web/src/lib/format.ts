import { formatEther } from "viem";
import { splitYYYYMMDD, type NightType } from "@hotel/shared";

export function formatEth(wei: string): string {
  return `${formatEther(BigInt(wei))} ETH`;
}

export function formatNightDate(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${year}`;
}

const WEEKDAYS_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const monthName = (month: number): string => MONTHS_ES[month - 1] ?? "";
const weekdayName = (index: number): string => WEEKDAYS_ES[index] ?? "";

/**
 * Fecha editorial larga en español («Domingo, 15 junio 2026») para la NightCard
 * (DISEÑO-UX §3/§4.1). Se calcula en UTC para casar con la codificación del `tokenId`.
 */
export function formatNightDateLong(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const weekday = weekdayName(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  return `${weekday}, ${day} ${monthName(month)} ${year}`;
}

/** Etiqueta de mes para el chip de filtro por fecha («Junio 2026», RF-14). */
export function formatMonthLabel(yyyymmdd: number): string {
  const { year, month } = splitYYYYMMDD(yyyymmdd);
  return `${capitalize(monthName(month))} ${year}`;
}

/** Clave de mes (`AAAAMM`) para agrupar y filtrar noches por mes. */
export function monthKeyOf(yyyymmdd: number): number {
  const { year, month } = splitYYYYMMDD(yyyymmdd);
  return year * 100 + month;
}

export const TYPE_LABEL: Readonly<Record<NightType, string>> = {
  simple: "Simple",
  doble: "Doble",
  suite: "Suite",
};
