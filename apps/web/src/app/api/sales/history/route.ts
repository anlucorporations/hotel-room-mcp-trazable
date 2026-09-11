import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import { NFTsRepository } from "@hotel/shared";


export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

    const { items, total } = await nftsRepo.getSalesHistory(limit, offset);

    // Exportación CSV (US-17)
    if (format === "csv") {
      const headers = ["ID", "Token ID", "Vendedor", "Comprador", "Precio (Wei)", "Precio (POL)", "Royalty (Wei)", "Es Reventa", "Tx Hash", "Bloque", "Fecha"];
      const rows = items.map((s) => [
        s.id,
        s.tokenId,
        s.seller,
        s.buyer,
        s.priceInWei,
        formatEther(BigInt(s.priceInWei)),
        s.royaltyAmountWei,
        s.isSecondary ? "SI" : "NO",
        s.txHash,
        s.blockNumber,
        s.blockTimestamp instanceof Date ? s.blockTimestamp.toISOString() : String(s.blockTimestamp || ""),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales_history_${Date.now()}.csv"`,
        },
      });
    }

    // Respuesta JSON estándar
    return NextResponse.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[API /api/sales/history] Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al obtener histórico de ventas" },
      { status: 500 },
    );
  }
}
