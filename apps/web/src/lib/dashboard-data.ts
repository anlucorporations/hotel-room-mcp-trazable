import { formatEther } from "viem";
import type {
  MonthlySalesPoint,
  RoomTypeBreakdownEntry,
  RoomTypeKey,
  TopResoldNight,
} from "@hotel/shared/domain";

/**
 * Traducción del payload de agregados (`DashboardAggregates`) a lo que necesitan las gráficas y
 * las tablas del dashboard (D-16).
 *
 * Dos decisiones que importan para no mentir con los números:
 *
 *  1. **Los cargos de la gráfica van en POL como número** (recharts dibuja longitudes, no cadenas
 *     decimales), pero **la etiqueta exacta viaja siempre en wei formateado** y es la que se
 *     muestra en el `tooltip` y en la tabla accesible. Así la altura de la barra es una magnitud
 *     y el número que se lee es exacto.
 *  2. Es un módulo **puro** (sin React ni i18n): la etiqueta del mes se calcula con `Intl` y el
 *     nombre del tipo de habitación lo resuelve el componente con sus traducciones. Eso permite
 *     probarlo sin renderizar nada.
 */

/** Locale del dashboard para las etiquetas de mes (coincide con el `locale` de la app). */
const DASHBOARD_LOCALE = "es-ES";

/** Convierte wei a un número en POL para el eje de la gráfica (solo geometría, no para leer). */
export function weiToPol(wei: string): number {
  return Number(formatEther(BigInt(wei)));
}

/** Formato exacto para leer/exportar («1.5 ETH»). */
export function weiLabel(wei: string): string {
  return `${formatEther(BigInt(wei))} ETH`;
}

/** `2026-08` → `agosto 2026` (etiqueta del eje X). */
export function monthLabel(month: string, locale: string = DASHBOARD_LOCALE): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (
    year === undefined ||
    monthNumber === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(monthNumber) ||
    // Sin este rango, `Date.UTC(2026, 12, 1)` desborda a enero de 2027 y la etiqueta mentiría.
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    // Un mes con formato inesperado se muestra tal cual: mejor un rótulo raro que un eje falso.
    return month;
  }
  const formatted = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** Punto de la serie mensual para la gráfica de barras apiladas/agrupadas. */
export interface MonthlyChartPoint {
  readonly month: string;
  readonly label: string;
  readonly primaryPol: number;
  readonly secondaryPol: number;
  readonly primaryLabel: string;
  readonly secondaryLabel: string;
  readonly primarySales: number;
  readonly secondarySales: number;
}

/** Serie mensual lista para graficar (mes ascendente, sin reordenar: el worker ya la ordena). */
export function toMonthlyChartData(
  points: readonly MonthlySalesPoint[],
  locale: string = DASHBOARD_LOCALE,
): MonthlyChartPoint[] {
  return points.map((point) => ({
    month: point.month,
    label: monthLabel(point.month, locale),
    primaryPol: weiToPol(point.primaryVolumeWei),
    secondaryPol: weiToPol(point.secondaryVolumeWei),
    primaryLabel: weiLabel(point.primaryVolumeWei),
    secondaryLabel: weiLabel(point.secondaryVolumeWei),
    primarySales: point.primarySales,
    secondarySales: point.secondarySales,
  }));
}

/** Punto del desglose por tipo de habitación. */
export interface RoomTypeChartPoint {
  readonly roomType: RoomTypeKey;
  readonly primaryPol: number;
  readonly secondaryPol: number;
  readonly totalPol: number;
  readonly totalLabel: string;
  readonly primaryLabel: string;
  readonly secondaryLabel: string;
  readonly primarySales: number;
  readonly secondarySales: number;
}

/** Desglose por tipo listo para graficar (se conserva el orden canónico del contrato de dominio). */
export function toRoomTypeChartData(
  entries: readonly RoomTypeBreakdownEntry[],
): RoomTypeChartPoint[] {
  return entries.map((entry) => ({
    roomType: entry.roomType,
    primaryPol: weiToPol(entry.primaryVolumeWei),
    secondaryPol: weiToPol(entry.secondaryVolumeWei),
    totalPol: weiToPol(entry.totalVolumeWei),
    totalLabel: weiLabel(entry.totalVolumeWei),
    primaryLabel: weiLabel(entry.primaryVolumeWei),
    secondaryLabel: weiLabel(entry.secondaryVolumeWei),
    primarySales: entry.primarySales,
    secondarySales: entry.secondarySales,
  }));
}

/** Fila del ranking de más revendidas. */
export interface TopResoldRow {
  readonly rank: number;
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: RoomTypeKey;
  readonly resaleCount: number;
  readonly volumeWei: string;
  readonly volumeLabel: string;
}

/** Ranking numerado (1..n) con el volumen ya formateado para la tabla. */
export function toTopResoldRows(nights: readonly TopResoldNight[]): TopResoldRow[] {
  return nights.map((night, index) => ({
    rank: index + 1,
    tokenId: night.tokenId,
    room: night.room,
    dateYYYYMMDD: night.dateYYYYMMDD,
    roomType: night.roomType,
    resaleCount: night.resaleCount,
    volumeWei: night.resaleVolumeWei,
    volumeLabel: weiLabel(night.resaleVolumeWei),
  }));
}

/** Nº total de ventas de la serie mensual (primarias + reventas); 0 si no hay meses. */
export function totalSalesOfSeries(points: readonly MonthlyChartPoint[]): number {
  return points.reduce((sum, point) => sum + point.primarySales + point.secondarySales, 0);
}
