import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  DEFAULT_DEPOSIT_PERCENT,
  DEFAULT_HOLD_HOURS,
  ReservationError,
  ReservationsRepository,
  RESERVATION_DEPOSIT_PERCENT_KEY,
  RESERVATION_HOLD_HOURS_KEY,
  SettingsRepository,
  type ReservationBookingStatus,
  type ReservationChannel,
  type ReservationContactChannel,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();
const settingsRepo = new SettingsRepository();

const CHANNELS: readonly ReservationChannel[] = ["WEB", "COUNTER"];
const STATUSES: readonly ReservationBookingStatus[] = ["PENDING", "CONFIRMED", "CANCELLED", "NO_SHOW", "COMPLETED"];
const CONTACT_CHANNELS: readonly ReservationContactChannel[] = ["EMAIL", "TELEGRAM", "WEB"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/reception/reservations?status=&checkInDate= — lista de reservas (D-34).
 * Protegida: `RECEPTION_ROLE` o owner.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const status = request.nextUrl.searchParams.get("status");
  const checkInDate = request.nextUrl.searchParams.get("checkInDate");
  try {
    const reservations = await reservationsRepo.listReservations({
      status: status && STATUSES.includes(status as ReservationBookingStatus) ? (status as ReservationBookingStatus) : undefined,
      checkInDate: checkInDate ?? undefined,
    });
    return NextResponse.json({ reservations });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las reservas." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reception/reservations — crea la reserva **reteniendo** las noches (D-35/D-37/D-55/D-60).
 *
 * La disponibilidad es exacta (sin sobreventa). El contacto se guarda **cifrado**; nunca se registra
 * en claro en logs. Devuelve 409 `UNAVAILABLE` si alguna noche ya está reservada o vendida.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se espera un objeto JSON." }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : undefined;
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate : undefined;
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate : undefined;
  const channel = body.channel === undefined ? "COUNTER" : body.channel;
  const totalCents = Number(body.totalCents);

  if (!roomId || !checkInDate || !checkOutDate || !DATE_RE.test(checkInDate) || !DATE_RE.test(checkOutDate)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "roomId, checkInDate y checkOutDate (AAAA-MM-DD) son obligatorios." },
      { status: 400 },
    );
  }
  if (typeof channel !== "string" || !CHANNELS.includes(channel as ReservationChannel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL", message: "Canal no válido (WEB · COUNTER)." }, { status: 400 });
  }
  if (!Number.isFinite(totalCents) || totalCents < 0) {
    return NextResponse.json({ error: "INVALID_TOTAL", message: "El importe total no es válido." }, { status: 400 });
  }

  let contact: { channel: ReservationContactChannel; value: string } | undefined;
  if (body.contact !== undefined) {
    const raw = body.contact as Record<string, unknown>;
    const contactChannel = raw?.channel;
    const value = raw?.value;
    if (typeof contactChannel !== "string" || !CONTACT_CHANNELS.includes(contactChannel as ReservationContactChannel)) {
      return NextResponse.json({ error: "INVALID_CONTACT", message: "Canal de contacto no válido." }, { status: 400 });
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "INVALID_CONTACT", message: "El contacto está vacío." }, { status: 400 });
    }
    contact = { channel: contactChannel as ReservationContactChannel, value: value.trim() };
  }

  try {
    // D-37: anticipo y plazo son **configurables** (platform_settings) con respaldo 30 % / 24 h.
    const holdHours =
      typeof body.holdHours === "number"
        ? body.holdHours
        : await settingsRepo.getNumber(RESERVATION_HOLD_HOURS_KEY, DEFAULT_HOLD_HOURS);
    const depositPercent = await settingsRepo.getNumber(RESERVATION_DEPOSIT_PERCENT_KEY, DEFAULT_DEPOSIT_PERCENT);
    const depositRequiredCents =
      typeof body.depositRequiredCents === "number"
        ? body.depositRequiredCents
        : Math.round((totalCents * depositPercent) / 100);

    const toCount = (value: unknown): number | undefined => {
      if (typeof value !== "number") return undefined;
      return Number.isInteger(value) && value >= 0 ? value : undefined;
    };

    const reservation = await reservationsRepo.createReservation({
      roomId,
      checkInDate,
      checkOutDate,
      channel: channel as ReservationChannel,
      createdBy: auth.session.username,
      totalCents,
      depositRequiredCents,
      contact,
      holdHours,
      adultCount: toCount(body.adultCount),
      childCount: toCount(body.childCount),
      babyCount: toCount(body.babyCount),
      petCount: toCount(body.petCount),
      accessibilityCount: toCount(body.accessibilityCount),
    });
    const folio = await reservationsRepo.findFolio(reservation.id);
    return NextResponse.json({ reservation, folio }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ReservationError) {
      const status = error.code === "UNAVAILABLE" ? 409 : error.code === "ROOM_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/reception/reservations] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear la reserva." },
      { status: 500 },
    );
  }
}
