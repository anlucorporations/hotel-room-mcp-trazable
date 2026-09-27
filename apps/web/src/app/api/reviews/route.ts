import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { NFTsRepository, ReviewError, ReviewsRepository, RoomsRepository } from "@hotel/shared";
import { requireReviewOwnership } from "@/lib/ticket-ownership";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const roomsRepo = new RoomsRepository();
const reviewsRepo = new ReviewsRepository();

const MAX_COMMENT = 1000;

/**
 * POST /api/reviews — alta de una reseña **firmada** por el titular (F6 · D-59, D-58).
 *
 * Requisitos, todos cerrados en fallo:
 *   1. **Noche consumida**: el token debe estar `CHECKED_OUT` (solo reseña quien la ha vivido).
 *   2. **Titularidad**: firma EIP-712 en cabeceras (`x-wallet-address`, `x-signature`, `x-nonce`,
 *      `x-expires-at`); la nota va **dentro de la firma** y el propietario lo decide la cadena
 *      (`requireReviewOwnership`), no el índice.
 *   3. **Una reseña por noche** (índice único).
 *
 * La reseña nace **`PENDING`**: no se publica hasta que el administrador la apruebe (D-58).
 * Respuestas: 201 `{ review }` · 400 datos inválidos · 401 firma/titularidad · 404 token inexistente ·
 * 409 noche no consumida o ya reseñada · 503 titularidad inverificable.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { tokenId?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const tokenId = typeof body.tokenId === "string" ? body.tokenId.trim() : "";
  const rating = typeof body.rating === "number" ? body.rating : NaN;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!tokenId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren tokenId y una nota entera entre 1 y 5." },
      { status: 400 },
    );
  }
  if (comment.length > MAX_COMMENT) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: `El comentario no puede superar ${MAX_COMMENT} caracteres.` },
      { status: 400 },
    );
  }

  try {
    const nft = await nftsRepo.getNFTById(tokenId);
    if (!nft) {
      return NextResponse.json({ error: "TOKEN_NOT_FOUND", message: "Esa noche no existe." }, { status: 404 });
    }
    if (nft.status !== "CHECKED_OUT") {
      return NextResponse.json(
        { error: "STAY_NOT_CONSUMED", message: "Solo puede reseñarse una noche ya consumida (check-out hecho)." },
        { status: 409 },
      );
    }
    // Antes de consumir el nonce: si ya hay reseña, no hace falta firmar de nuevo.
    if (await reviewsRepo.findByToken(tokenId)) {
      return NextResponse.json(
        { error: "ALREADY_REVIEWED", message: "Esta noche ya tiene una reseña enviada." },
        { status: 409 },
      );
    }

    const ownership = await requireReviewOwnership(request, tokenId, rating, nft.currentOwner);
    if (!ownership.ok) return ownership.response;

    const room = await roomsRepo.findByNumber(nft.roomNumber);
    const review = await reviewsRepo.create({
      tokenId,
      roomType: nft.roomType,
      roomId: room?.id ?? null,
      rating,
      comment,
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/reviews] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar la reseña." }, { status: 500 });
  }
}
