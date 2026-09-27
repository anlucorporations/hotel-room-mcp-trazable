import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AuthService, RoomsRepository, type RoomRecord } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { roomContentHash, verifyRoomPublicationSignature } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const authService = new AuthService();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Hash de transacción real (`0x` + 64 hex) o `undefined` si no se aportó. */
function readTxHash(value: unknown): string | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : undefined;
}

interface PreparedPublication {
  room: RoomRecord;
  contentHash: string;
  hasDescription: boolean;
  hasImage: boolean;
}

/** Carga la ficha y calcula su **huella** y si cumple los mínimos para publicar (D-6/D-20/D-21). */
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
 * GET /api/admin/rooms/[id]/publish — prepara la publicación: devuelve la **huella** que el
 * administrador debe firmar con su wallet (D-1/D-2) y si cumple los mínimos.
 *
 * La firma es EIP-191 (`personal_sign`) sobre la huella; el anclaje on-chain de esa huella llega con
 * el registro dinámico del contrato (F8, D-10). Mientras tanto, la publicación se registra como
 * **pendiente de anclaje**.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const prepared = await preparePublication(id);
    if (!prepared) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    return NextResponse.json({
      contentHash: prepared.contentHash,
      canPublish: prepared.hasDescription && prepared.hasImage,
      hasDescription: prepared.hasDescription,
      hasImage: prepared.hasImage,
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/publish] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo preparar la publicación." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/rooms/[id]/publish — publica la ficha (D-1, D-2, D-18, D-21).
 *
 * Doble control, igual que el minteo (RF-03):
 *   1. **Sesión + rol** `DEFAULT_ADMIN_ROLE` (D-1).
 *   2. **Re-confirmación TOTP** contra la semilla cifrada del operador autenticado.
 *
 * Además, si llega `signature`/`signerAddress` (la wallet del administrador firmando la huella), se
 * **verifican** y se guardan (D-1/D-2). Exige los mínimos para publicar: **descripción en español**
 * (D-6/D-21) y **al menos una foto** (D-20). Si llega `txHash` real, la publicación queda **anclada**
 * (D-18); si no, **pendiente de anclaje**.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { confirmTotpCode?: unknown; txHash?: unknown; signature?: unknown; signerAddress?: unknown }
    | null;

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

  try {
    const prepared = await preparePublication(id);
    if (!prepared) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no existe." }, { status: 404 });
    }
    if (!prepared.hasDescription) {
      return NextResponse.json(
        {
          error: "PUBLISH_REQUIRES_DESCRIPTION",
          message: "Para publicar se exige la descripción en español (D-6/D-21).",
        },
        { status: 400 },
      );
    }
    if (!prepared.hasImage) {
      return NextResponse.json(
        { error: "PUBLISH_REQUIRES_IMAGE", message: "Para publicar se exige al menos una foto (D-20)." },
        { status: 400 },
      );
    }

    // Firma opcional de la wallet: si viene una, vienen las dos y deben verificar la huella.
    const signature = typeof body?.signature === "string" ? body.signature : null;
    const signerAddress = typeof body?.signerAddress === "string" ? body.signerAddress : null;
    if (signature !== null || signerAddress !== null) {
      if (!signature || !signerAddress) {
        return NextResponse.json(
          { error: "INVALID_SIGNATURE", message: "signature y signerAddress deben venir juntas." },
          { status: 400 },
        );
      }
      const valid = await verifyRoomPublicationSignature({
        contentHash: prepared.contentHash,
        signature,
        signerAddress,
      });
      if (!valid) {
        return NextResponse.json(
          {
            error: "INVALID_SIGNATURE",
            message: "La firma no corresponde a la huella de la ficha o el firmante no coincide.",
          },
          { status: 422 },
        );
      }
    }

    const txHash = readTxHash(body?.txHash);
    const publication = await roomsRepo.recordPublication({
      roomId: id,
      contentHash: prepared.contentHash,
      txHash: txHash ?? null,
      signature,
      signerAddress,
      publishedBy: auth.session.username,
    });
    const published = await roomsRepo.setPublicationStatus(
      id,
      "PUBLISHED",
      auth.session.username,
      "Publicada desde back-office",
    );

    return NextResponse.json(
      {
        status: publication.onChainAnchored ? "SUCCESS" : "PENDING_ANCHOR",
        room: published ?? prepared.room,
        publication,
        contentHash: prepared.contentHash,
        onChainAnchored: publication.onChainAnchored,
        signed: publication.signature !== null,
      },
      { status: publication.onChainAnchored ? 200 : 202 },
    );
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/[id]/publish] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo publicar la habitación." },
      { status: 500 },
    );
  }
}
