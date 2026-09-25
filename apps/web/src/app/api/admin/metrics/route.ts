import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { formatEther } from "viem";
import type { DashboardAggregates } from "@hotel/shared/domain";
import { requireRole } from "@/lib/guard";
import { fetchAggregates } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metrics
 *
 * Métricas financieras y comerciales del hotel (US-16) y agregados de D-16 (serie mensual,
 * desglose por tipo y ranking de más revendidas), **desde la fuente única**: los agregados que el
 * worker calcula en PostgreSQL sobre `worker_sale_history`.
 *
 * Hasta M7 este endpoint calculaba las cifras por su cuenta (`sale_events` + `nfts`): dos caminos
 * para el mismo número, que es exactamente cómo un dashboard y un histórico acaban discrepando.
 * Ahora ambos leen lo mismo y el criterio de aceptación de M7 («las cifras del dashboard cuadran
 * con el histórico») es verificable de punta a punta.
 *
 * Soporta exportación CSV (`?format=csv`) con las tres secciones nuevas.
 *
 * Protegida por sesión canónica (D-04): cualquier rol de back-office
 * (`DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE`) puede consultarla; sin sesión válida → 401.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request);
  if (!auth.ok) return auth.response;

  let aggregates: DashboardAggregates;
  try {
    aggregates = await fetchAggregates();
  } catch {
    // El worker (o su base de datos) no responde: se declara en vez de devolver ceros, que sería
    // una cifra falsa con aspecto de buena.
    return NextResponse.json(
      { error: "DATA_UNAVAILABLE", message: "Los agregados del worker no están disponibles." },
      { status: 503 },
    );
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "csv") {
    const csvContent = toCsv(aggregates);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hotel_metrics_${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({
    ...aggregates,
    primaryVolumePol: formatEther(BigInt(aggregates.primaryVolumeWei)),
    secondaryVolumePol: formatEther(BigInt(aggregates.secondaryVolumeWei)),
    accumulatedRoyaltiesPol: formatEther(BigInt(aggregates.royaltiesWei)),
    // Alias de compatibilidad con el nombre anterior de la cifra (misma magnitud, misma fuente).
    commercialOccupancyPercent: aggregates.occupancyRatioPercent,
    updatedAt: new Date().toISOString(),
  });
}

/** Celda CSV entrecomillada (comillas internas duplicadas, RFC 4180). */
const cell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const row = (values: readonly string[]): string => values.map(cell).join(",");

/**
 * Informe CSV con las cuatro secciones del dashboard: KPIs, serie mensual, desglose por tipo y
 * ranking de más revendidas. Todo con la misma cifra que la pantalla (mismo payload).
 */
function toCsv(aggregates: DashboardAggregates): string {
  const lines: string[] = [];

  lines.push(row(["Métrica", "Valor", "Unidad / Detalle"]));
  lines.push(row(["Volumen Primario", formatEther(BigInt(aggregates.primaryVolumeWei)), "ETH"]));
  lines.push(row(["Volumen Secundario", formatEther(BigInt(aggregates.secondaryVolumeWei)), "ETH"]));
  lines.push(row(["Royalties Acumulados", formatEther(BigInt(aggregates.royaltiesWei)), "ETH"]));
  lines.push(row(["Noches Vendidas", aggregates.soldCount.toString(), "Habitaciones"]));
  lines.push(row(["Noches Minteadas", aggregates.mintedCount.toString(), "Habitaciones"]));
  lines.push(row(["Noches Quemadas", aggregates.burnedCount.toString(), "Habitaciones"]));
  lines.push(row(["Ocupación Comercial", aggregates.occupancyRatioPercent.toString(), "%"]));
  lines.push(row(["Zona horaria de la serie", aggregates.timeZone, "IANA"]));
  lines.push(row(["Ventas sin fecha de bloque", aggregates.undatedSalesCount.toString(), "Excluidas de la serie"]));
  lines.push("");

  lines.push(row(["Serie mensual (mes)", "Primaria (ETH)", "Reventa (ETH)", "Nº ventas"]));
  for (const point of aggregates.monthlySeries) {
    lines.push(
      row([
        point.month,
        formatEther(BigInt(point.primaryVolumeWei)),
        formatEther(BigInt(point.secondaryVolumeWei)),
        (point.primarySales + point.secondarySales).toString(),
      ]),
    );
  }
  lines.push("");

  lines.push(row(["Desglose por tipo", "Primaria (ETH)", "Reventa (ETH)", "Total (ETH)"]));
  for (const entry of aggregates.roomTypeBreakdown) {
    lines.push(
      row([
        entry.roomType,
        formatEther(BigInt(entry.primaryVolumeWei)),
        formatEther(BigInt(entry.secondaryVolumeWei)),
        formatEther(BigInt(entry.totalVolumeWei)),
      ]),
    );
  }
  lines.push("");

  lines.push(row(["Ranking de más revendidas", "Habitación", "Fecha", "Tipo", "Reventas", "Volumen (ETH)"]));
  for (const night of aggregates.topResold) {
    lines.push(
      row([
        night.tokenId,
        night.room.toString(),
        night.dateYYYYMMDD.toString(),
        night.roomType,
        night.resaleCount.toString(),
        formatEther(BigInt(night.resaleVolumeWei)),
      ]),
    );
  }

  return lines.join("\n");
}
