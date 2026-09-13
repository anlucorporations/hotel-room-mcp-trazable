import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import { NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

/**
 * GET /api/admin/metrics
 *
 * Devuelve las 7 métricas financieras y comerciales del hotel (US-16).
 * Soporta exportación CSV directa mediante query param ?format=csv.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const format = request.nextUrl.searchParams.get("format");
    const metrics = await nftsRepo.getFinancialMetrics();

    if (format === "csv") {
      const csvRows = [
        ["Métrica", "Valor", "Unidad / Detalle"],
        ["Volumen Primario", formatEther(BigInt(metrics.primaryVolumeWei)), "POL"],
        ["Volumen Secundario", formatEther(BigInt(metrics.secondaryVolumeWei)), "POL"],
        ["Royalties Acumulados", formatEther(BigInt(metrics.accumulatedRoyaltiesWei)), "POL"],
        ["Noches Vendidas", metrics.soldCount.toString(), "Habitaciones"],
        ["Noches Minteadas", metrics.mintedCount.toString(), "Habitaciones"],
        ["Noches Quemadas", metrics.burnedCount.toString(), "Habitaciones"],
        ["Ocupación Comercial", metrics.commercialOccupancyPercent.toString(), "%"],
      ];

      const csvContent = csvRows
        .map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
        .join("\n");

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hotel_metrics_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ...metrics,
      primaryVolumePol: formatEther(BigInt(metrics.primaryVolumeWei)),
      secondaryVolumePol: formatEther(BigInt(metrics.secondaryVolumeWei)),
      accumulatedRoyaltiesPol: formatEther(BigInt(metrics.accumulatedRoyaltiesWei)),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[API /api/admin/metrics] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al obtener métricas financieras" },
      { status: 500 },
    );
  }
}
