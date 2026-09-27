import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { boardSignature, defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/** Cadencia del sondeo del tablero: garantiza el reflejo en **< 2 s** que pide D-30. */
const POLL_INTERVAL_MS = 1500;

/**
 * GET /api/housekeeping/stream?date=AAAA-MM-DD — tablero en **tiempo real** por SSE (D-30, D-50).
 *
 * Emite un evento `board` con la instantánea del día **cada vez que cambia** (firma distinta) y un
 * `event: ping` periódico para mantener viva la conexión. El cliente (`/housekeeping`) escucha con
 * `EventSource` y repinta; así un cambio hecho en un puesto aparece en los demás en menos de 2 s.
 *
 * Se sondea la fuente única (PostgreSQL), de modo que funciona con **varias instancias** de la web:
 * un bus en memoria no cruzaría procesos. Rol `HOUSEKEEPING` (owner incluido, D-56).
 */
export async function GET(request: NextRequest): Promise<Response | NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastSignature = "";

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };

      const write = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;
        try {
          const board = await repo.getBoard(date);
          const signature = boardSignature(board);
          if (signature !== lastSignature) {
            lastSignature = signature;
            write("board", board);
          } else {
            write("ping", { at: new Date().toISOString() });
          }
        } catch (error: unknown) {
          console.error("[API /api/housekeeping/stream] tick:", error);
          write("error", { message: "No se pudo leer el tablero." });
        }
      };

      request.signal.addEventListener("abort", close);
      await tick();
      timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
      // Si la conexión se abortó durante el primer sondeo, no dejamos el intervalo vivo.
      if (closed && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
