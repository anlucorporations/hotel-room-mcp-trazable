import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository } from "@hotel/shared";
import { roomCoverUrl } from "@/lib/room-image-url";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/** Tope defensivo: el huésped tiene unas pocas noches, pero la ruta es pública. */
const MAX_ROOMS = 60;

/**
 * GET /api/public/rooms/covers?numbers=101,305
 *
 * **Foto de la habitación por número** (2026-10-05). «Mis noches» y el catálogo descubren las noches
 * **on-chain**, donde solo existe el número de habitación; la foto vive en el maestro off-chain
 * (`room_images`). Esta ruta resuelve ese salto en una sola consulta, sin exponer nada más del maestro:
 * devuelve únicamente `{ covers: { "<nº>": { url, alt } } }`.
 *
 * Pública a propósito: solo entrega imágenes que ya sirve `/api/rooms/images/<fichero>` en abierto.
 * Falla en blando (200 con `covers` vacío) porque una foto que no se puede resolver no debe romper la
 * página del huésped: la tarjeta cae entonces a su imagen de tipo.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("numbers") ?? "";
  const numbers = [
    ...new Set(
      raw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0 && value <= 99999),
    ),
  ].slice(0, MAX_ROOMS);

  if (numbers.length === 0) return NextResponse.json({ covers: {} });

  try {
    const covers = await roomsRepo.listCoverImagesByRoomNumbers(numbers);
    const payload = Object.fromEntries(
      [...covers].map(([room, cover]) => [
        String(room),
        { url: roomCoverUrl(cover.fileName), alt: cover.altTextEs ?? null },
      ]),
    );
    return NextResponse.json(
      { covers: payload },
      // Las fotos de una habitación cambian poco: se puede cachear en el borde sin riesgo.
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
    );
  } catch (error: unknown) {
    console.warn("[API /api/public/rooms/covers] GET:", error);
    return NextResponse.json({ covers: {} });
  }
}
