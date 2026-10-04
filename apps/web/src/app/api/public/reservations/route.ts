import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ExchangeRateService,
  ReservationError,
  ReservationsRepository,
  RoomsRepository,
  SettingsRepository,
  RESERVATION_DEPOSIT_PERCENT_KEY,
  RESERVATION_HOLD_HOURS_KEY,
  nightsBetween,
  weiToEurCents,
} from "@hotel/shared";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const reservationsRepo = new ReservationsRepository();
const settingsRepo = new SettingsRepository();
const rates = new ExchangeRateService();

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Referencia corta y legible del anticipo (derivada del id; no es un secreto). */
function transferReference(id: string): string {
  return `MDS-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * POST /api/public/reservations — **retención** de una noche desde la web pública (F6 · D-65, D-72).
 *
 * Flujo público, sin sesión y **con la wallet primero** (D-72): el huésped conecta su cartera, elige
 * habitación y fechas, y el sistema **retiene la noche** (D-35) sin cobrar nada. La respuesta trae las
 * **instrucciones de anticipo** (importe, referencia y fecha límite): el anticipo se paga por
 * **transferencia** y lo confirma recepción; la **liquidación** se paga con la wallet (D-60).
 *
 * Precio: se calcula a partir de la tarifa base de la habitación (wei) y la tasa EUR actual; el
 * anticipo es el porcentaje configurado (D-37). Sin tarifa disponible → 409.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    roomId?: unknown;
    checkInDate?: unknown;
    checkOutDate?: unknown;
    wallet?: unknown;
    email?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate : "";
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate : "";
  const wallet = typeof body.wallet === "string" ? body.wallet : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!roomId || !DATE_RE.test(checkInDate) || !DATE_RE.test(checkOutDate)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren roomId y fechas AAAA-MM-DD." },
      { status: 400 },
    );
  }
  if (!WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Conecta una cartera válida para reservar (D-72)." },
      { status: 400 },
    );
  }
  if (email.length > 0 && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "El correo no es válido." }, { status: 400 });
  }

  try {
    const room = await roomsRepo.findById(roomId);
    if (!room || room.publicationStatus !== "PUBLISHED") {
      return NextResponse.json({ error: "ROOM_NOT_FOUND", message: "La habitación no está disponible." }, { status: 404 });
    }

    const nights = nightsBetween(checkInDate, checkOutDate).length;
    const rate = await rates.getRate();
    const perNightCents = room.baseRateWei ? weiToEurCents(room.baseRateWei, rate.rate) : null;

    // D-84: antes las dos causas compartían un mismo 409 que culpaba a la habitación. Con la tasa de
    // POL (0,112 EUR) el céntimo truncado daba 0 y el huésped leía «no tiene tarifa publicada» teniendo
    // tarifa. Ahora cada causa dice lo suyo:
    //   · sin tasa EUR → fallo NUESTRO del proveedor: 503 reintentable (no se crea la reserva).
    //   · sin tarifa publicable (o un valor que no llega ni a un céntimo) → 409 de estado.
    if (rate.rate === null) {
      return NextResponse.json(
        {
          error: "RATE_UNAVAILABLE",
          message: "No podemos calcular el precio en euros ahora mismo. Inténtalo en unos minutos.",
        },
        { status: 503 },
      );
    }
    if (perNightCents === null) {
      return NextResponse.json(
        { error: "PRICE_UNAVAILABLE", message: "La habitación no tiene tarifa publicada todavía." },
        { status: 409 },
      );
    }
    const totalCents = perNightCents * nights;
    const depositPercent = await settingsRepo.getNumber(RESERVATION_DEPOSIT_PERCENT_KEY, 30);
    const holdHours = await settingsRepo.getNumber(RESERVATION_HOLD_HOURS_KEY, 24);
    const depositRequiredCents = Math.round((totalCents * depositPercent) / 100);

    const reservation = await reservationsRepo.createReservation({
      roomId,
      checkInDate,
      checkOutDate,
      channel: "WEB",
      createdBy: `web:${wallet}`,
      totalCents,
      depositRequiredCents,
      holdHours,
      // D-55: contacto mínimo. Se guarda cifrado; con correo se usa el correo, sin él la wallet.
      contact: email
        ? { channel: "EMAIL", value: email }
        : { channel: "WEB", value: wallet },
    });

    return NextResponse.json(
      {
        reservation,
        payment: {
          amountCents: reservation.depositRequiredCents,
          reference: transferReference(reservation.id),
          deadline: reservation.holdExpiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof ReservationError) {
      const status = error.code === "ROOM_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/public/reservations] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo retener la noche." },
      { status: 500 },
    );
  }
}
