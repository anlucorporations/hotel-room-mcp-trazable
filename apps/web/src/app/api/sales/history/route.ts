import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { formatEther } from "viem";
import type { SaleHistoryEntry } from "@hotel/shared/domain";
import { fetchHistory } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/history
 *
 * Histórico público de ventas (CU-09, docs/SRS.md §9) y su exportación CSV (US-17). Lee del worker, la MISMA
 * fuente que la tabla `/historico` y que el dashboard (D-16): el CSV descargado y lo que se ve en
 * pantalla no pueden discrepar.
 *
 * Hasta M7 este endpoint leía `sale_events` por su cuenta (con `limit`/`offset` propios), así que
 * el CSV podía contener una ventana distinta —y con otro retraso de indexación— que la tabla de al
 * lado. La lista completa la sirve el worker en orden total descendente, que es lo que se exporta.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let entries: SaleHistoryEntry[];
  try {
    entries = await fetchHistory();
  } catch {
    return NextResponse.json(
      { error: "DATA_UNAVAILABLE", message: "El histórico del worker no está disponible." },
      { status: 503 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

  // El worker devuelve el histórico completo ordenado: la paginación es una vista sobre él.
  const page = entries.slice(offset, offset + limit);

  if (searchParams.get("format") === "csv") {
    const headers = [
      "Token ID",
      "Habitación",
      "Fecha de la noche",
      "Tipo",
      "Precio (ETH)",
      "Precio (Wei)",
      "Tipo de venta",
      "Vendedor",
      "Comprador",
      "Bloque",
      "Marca temporal del bloque",
      "Tx Hash",
    ];
    const rows = entries.map((entry) => [
      entry.tokenId,
      entry.room.toString(),
      entry.dateYYYYMMDD.toString(),
      entry.roomType,
      formatEther(BigInt(entry.priceWei)),
      entry.priceWei,
      entry.saleType,
      entry.seller,
      entry.buyer,
      entry.blockNumber.toString(),
      entry.blockTimestamp === null ? "" : new Date(entry.blockTimestamp * 1000).toISOString(),
      entry.txHash,
    ]);

    const csvContent = [
      headers.map((header) => `"${header}"`).join(","),
      ...rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sales_history_${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ items: page, total: entries.length, limit, offset });
}
