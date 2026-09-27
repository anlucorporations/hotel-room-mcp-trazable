import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolveRoomImagePath } from "@/lib/room-images";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ file: string }>;
}

/**
 * GET /api/rooms/images/[file] — sirve una foto de habitación desde `docs/imagenes` (D-5).
 *
 * `docs/` no lo sirve Next por defecto (sirve `public/`), así que la carpeta se expone con este
 * handler. El nombre se valida contra el patrón canónico y la ruta resuelta **no puede salir** de la
 * carpeta (defensa contra traversal). Solo se sirven JPG con caché larga e inmutable: el nombre
 * incluye fecha y versión, así que el contenido de una URL nunca cambia.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse | Response> {
  const { file } = await params;
  const absolute = resolveRoomImagePath(file);
  if (!absolute) {
    return NextResponse.json(
      { error: "INVALID_IMAGE_NAME", message: "Nombre de imagen no válido." },
      { status: 400 },
    );
  }

  try {
    const bytes = await readFile(absolute);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "IMAGE_NOT_FOUND", message: "La imagen no existe." }, { status: 404 });
  }
}
