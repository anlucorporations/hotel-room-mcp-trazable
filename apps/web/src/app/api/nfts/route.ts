import { NextRequest, NextResponse } from "next/server";
import { NFTsRepository, ExchangeRateService } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const exchangeService = new ExchangeRateService();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;

    const status = searchParams.get("status") || undefined;
    const roomType = (searchParams.get("roomType") as "SIMPLE" | "SUITE") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const priceMinWei = searchParams.get("priceMinWei") || undefined;
    const priceMaxWei = searchParams.get("priceMaxWei") || undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

    // Ejecución paralela de consulta de catálogo y cotización POL/EUR
    const [catalog, rateInfo] = await Promise.all([
      nftsRepo.queryCatalog({
        status,
        roomType,
        dateFrom,
        dateTo,
        priceMinWei,
        priceMaxWei,
        page,
        limit,
      }),
      exchangeService.getRate(),
    ]);

    return NextResponse.json({
      items: catalog.items,
      total: catalog.total,
      page: catalog.page,
      limit: catalog.limit,
      totalPages: catalog.totalPages,
      eurExchangeRate: rateInfo.rate,
      exchangeRateUpdatedAt: rateInfo.updatedAt,
      exchangeRateSource: rateInfo.source,
    });
  } catch (error: any) {
    console.error("[API /api/nfts] Error al obtener catálogo:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al consultar catálogo" },
      { status: 500 },
    );
  }
}
