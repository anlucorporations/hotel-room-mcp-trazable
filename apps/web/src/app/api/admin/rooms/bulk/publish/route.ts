import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthService, RoomMintJobsRepository, RoomsRepository, type RoomRecord } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { isMintOnPublishEnabled } from "@/lib/mint-on-publish";
import { bulkPublishErrorEntries, summarizeBulkPublishResults } from "@/lib/room-bulk-feedback";
import { roomContentHash } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const authService = new AuthService();
const mintJobsRepo = new RoomMintJobsRepository();

/** Límite de saneo (2026-10-04): evita lotes desproporcionados y protege el endpoint. */
const MAX_BULK_ROOMS = 50;

/** Hash de transacción real (`0x` + 64 hex) o `null`. */
function readTxHash(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : null;
}

interface BulkRoomResult {
  roomId: string;
  roomNumber: number | null;
  ok: boolean;
  /** D-85: la publicación se ha encolado (registro+anclaje+minteo los hará el worker). */
  queued?: boolean;
  jobId?: string;
  onChainAnchored?: boolean;
  error?: string;
  message?: string;
}

interface PreparedPublication {
  room: RoomRecord;
  contentHash: string;
  hasDescription: boolean;
  hasImage: boolean;
}

/** Carga la ficha y calcula su huella y sus mínimos para publicar (idéntico al flujo unitario, D-6/D-20/D-21). */
async function preparePublication(id: string): Promise<PreparedPublication | null> {
  const room = await roomsRepo.findById(id);
  if (!room) return null;
  const images = await roomsRepo.listImages(id);
  const contentHash = roomContentHash({
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    capacity: room.capacity,
    beds: room.beds,
    sizeM2: room.sizeM2,
    descriptionEs: room.descriptionEs,
    descriptionEn: room.descriptionEn,
    descriptionRu: room.descriptionRu,
    baseRateWei: room.baseRateWei,
    imageFileNames: images.map((image) => image.fileName),
  });
  return {
    room,
    contentHash,
    hasDescription: Boolean(room.descriptionEs && room.descriptionEs.trim().length > 0),
    hasImage: images.length > 0,
  };
}

/**
 * POST /api/admin/rooms/bulk/publish — publicación masiva (2026-10-04, tablero Admin).
 *
 * Publica un lote de habitaciones con **un único** código TOTP del operador (política D-2/D-18): la
 * re-confirmación se aplica una vez sobre el operador, no por habitación. Cada habitación se valida y se
 * registra de forma independiente, de modo que un fallo puntual (sin descripción, sin foto, ya
 * publicada…) no tumba al resto.
 *
 * El anclaje on-chain es **best-effort**: el cliente puede aportar `txHashes` (`roomId → hash`) para las
 * habitaciones que ya ancló en chain con su wallet. Sin hash, la habitación se registra y queda
 * `PENDING_ANCHOR` (pendiente de anclaje, D-18).
 *
 * Respuesta: `200` si al menos una habitación se publica; `400` si ninguna. `results` detalla siempre
 * cada habitación.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { roomIds?: unknown; confirmTotpCode?: unknown; txHashes?: unknown; date?: unknown }
    | null;

  // Publicación masiva acotada a la fecha seleccionada en el tablero (2026-10-22). Sin `date` se
  // mantiene el comportamiento histórico (ficha completa y primera noche).
  const rawDate = typeof body?.date === "string" && body.date.trim().length > 0 ? body.date.trim() : null;
  let targetDate: string | null = null;
  if (rawDate !== null) {
    const parsed = new Date(`${rawDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rawDate) {
      return NextResponse.json(
        { error: "INVALID_DATE", message: "La fecha seleccionada debe ser AAAA-MM-DD." },
        { status: 400 },
      );
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    if (rawDate < todayIso) {
      return NextResponse.json(
        { error: "DATE_IN_PAST", message: "No se puede publicar una fecha que ya pasó." },
        { status: 400 },
      );
    }
    targetDate = rawDate;
  }

  const roomIds = Array.isArray(body?.roomIds)
    ? [...new Set(body.roomIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : [];
  if (roomIds.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Se requiere una lista no vacía de roomIds." },
      { status: 400 },
    );
  }
  if (roomIds.length > MAX_BULK_ROOMS) {
    return NextResponse.json(
      { error: "BULK_TOO_LARGE", message: `Máximo ${MAX_BULK_ROOMS} habitaciones por lote.` },
      { status: 400 },
    );
  }

  const confirmCode = typeof body?.confirmTotpCode === "string" ? body.confirmTotpCode : undefined;
  if (!confirmCode) {
    return NextResponse.json(
      { error: "MFA_REQUIRED", message: "Se requiere re-confirmación TOTP (confirmTotpCode)." },
      { status: 403 },
    );
  }

  const user = await authService.findUser(auth.session.username);
  if (!user || !user.active) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Operador inexistente o inactivo." },
      { status: 401 },
    );
  }
  if (!authService.verifyUserTotp(user, confirmCode)) {
    return NextResponse.json(
      { error: "INVALID_MFA", message: "Código TOTP inválido o expirado." },
      { status: 403 },
    );
  }

  const txHashes =
    body?.txHashes && typeof body.txHashes === "object" && !Array.isArray(body.txHashes)
      ? (body.txHashes as Record<string, unknown>)
      : {};

  const results: BulkRoomResult[] = [];
  const mintOnPublish = isMintOnPublishEnabled();
  for (const id of roomIds) {
    try {
      const prepared = await preparePublication(id);
      if (!prepared) {
        results.push({ roomId: id, roomNumber: null, ok: false, error: "ROOM_NOT_FOUND", message: "La habitación no existe." });
        continue;
      }
      const { room, contentHash } = prepared;
      if (room.archivedAt !== null) {
        results.push({ roomId: id, roomNumber: room.roomNumber, ok: false, error: "ALREADY_ARCHIVED", message: "La habitación está archivada." });
        continue;
      }
      // Con fecha seleccionada sí se admite una habitación ya publicada: se añade esa noche.
      if (room.publicationStatus === "PUBLISHED" && targetDate === null) {
        results.push({ roomId: id, roomNumber: room.roomNumber, ok: false, error: "ALREADY_PUBLISHED", message: "La habitación ya está publicada." });
        continue;
      }
      if (!prepared.hasDescription) {
        results.push({ roomId: id, roomNumber: room.roomNumber, ok: false, error: "PUBLISH_REQUIRES_DESCRIPTION", message: "Para publicar se exige la descripción en español (D-6/D-21)." });
        continue;
      }
      if (!prepared.hasImage) {
        results.push({ roomId: id, roomNumber: room.roomNumber, ok: false, error: "PUBLISH_REQUIRES_IMAGE", message: "Para publicar se exige al menos una foto (D-20)." });
        continue;
      }

      // D-85: el lote solo ENCOLA. El worker registra cada habitación, ancla la huella y mintea su
      // primera noche; si algo falla, esa habitación se queda en DRAFT y el job queda FAILED.
      if (mintOnPublish) {
        const job = await mintJobsRepo.enqueue({
          roomId: id,
          targetDate,
          contentHash,
          signature: null,
          signerAddress: null,
          publishedBy: auth.session.username,
        });
        results.push({
          roomId: id,
          roomNumber: room.roomNumber,
          ok: true,
          queued: true,
          jobId: job.id,
          onChainAnchored: false,
        });
        continue;
      }

      if (targetDate !== null) {
        results.push({ roomId: id, roomNumber: room.roomNumber, ok: false, error: "DATE_REQUIRES_MINT_ON_PUBLISH", message: "Publicar por fecha exige MINT_ON_PUBLISH_ENABLED." });
        continue;
      }
      const txHash = readTxHash(txHashes[id]);
      const publication = await roomsRepo.recordPublication({
        roomId: id,
        contentHash,
        txHash,
        signature: null,
        signerAddress: null,
        publishedBy: auth.session.username,
      });
      await roomsRepo.setPublicationStatus(
        id,
        "PUBLISHED",
        auth.session.username,
        "Publicada masivamente desde back-office (2026-10-04)",
      );
      results.push({
        roomId: id,
        roomNumber: room.roomNumber,
        ok: true,
        onChainAnchored: publication.onChainAnchored,
      });
    } catch (error: unknown) {
      console.error(`[API /api/admin/rooms/bulk/publish] habitación ${id}:`, error);
      results.push({
        roomId: id,
        roomNumber: null,
        ok: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "No se pudo publicar esta habitación.",
      });
    }
  }

  const succeeded = results.filter((result) => result.ok);
  if (succeeded.length === 0) {
    // Sin ninguna publicación, se devuelve el **motivo agregado** para que la interfaz (y cualquier
    // otro cliente) no se quede con un 400 mudo. Cada `results[i]` conserva su detalle.
    return NextResponse.json({ results, published: 0, queued: 0, message: failureSummary(results) }, { status: 400 });
  }
  if (mintOnPublish) {
    return NextResponse.json(
      { results, published: 0, queued: succeeded.length, ...(targetDate !== null ? { date: targetDate } : {}) },
      { status: 202 },
    );
  }
  return NextResponse.json({ results, published: succeeded.length, queued: 0 });
}

/** Texto agregado de por qué no se publicó ninguna habitación (motivos de la API, en español). */
function failureSummary(results: readonly BulkRoomResult[]): string {
  const feedback = summarizeBulkPublishResults(results, 0);
  const labels: Readonly<Record<string, string>> = {
    PUBLISH_REQUIRES_IMAGE: "sin foto (se exige al menos una, D-20)",
    PUBLISH_REQUIRES_DESCRIPTION: "sin descripción en español (D-6/D-21)",
    ALREADY_PUBLISHED: "ya publicadas",
    ALREADY_ARCHIVED: "archivadas",
    ROOM_NOT_FOUND: "inexistentes",
    INTERNAL_SERVER_ERROR: "con error interno",
  };
  const parts = bulkPublishErrorEntries(feedback).map(
    ({ code, count }) => `${count} ${labels[code] ?? "con error desconocido"}`,
  );
  return parts.length > 0
    ? `No se pudo publicar ninguna habitación: ${parts.join("; ")}.`
    : "No se pudo publicar ninguna habitación.";
}
