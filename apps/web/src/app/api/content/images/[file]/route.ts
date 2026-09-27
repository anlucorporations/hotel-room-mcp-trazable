import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolveContentImagePath } from "@/lib/hotel-images";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ file: string }>;
}

/**
 * GET /api/content/images/[file] — sirve una imagen de **contenido** de la suite pública (F6).
 *
 * Igual que las fotos de habitación (F1 · D-5), la carpeta `docs/imagenes` no la sirve Next, así que
 * se expone con este handler validando el nombre y la ruta (defensa contra traversal). Solo JPG, con
 * caché inmutable: el nombre incluye fecha y versión.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse | Response> {
  const { file } = await params;
  const absolute = resolveContentImagePath(file);
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
