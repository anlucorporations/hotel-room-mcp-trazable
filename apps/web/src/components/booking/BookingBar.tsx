"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  bookingSearchParams,
  isoDate,
  nextDay,
  validateStay,
  MAX_GUESTS,
  type BookingDateProblem,
} from "@/lib/booking";

/**
 * Barra de reserva (propuesta de imagen visual §3.7 · Fase C.2).
 *
 * Es el elemento de conversión de la suite pública: recoge **entrada, salida y huéspedes** y lleva
 * al flujo de reserva con la búsqueda en la URL (`/reservar?from=…&to=…&guests=…`), que es lo que
 * permite compartir el enlace y volver atrás sin perder la selección.
 *
 * Reglas que aplica **en el propio formulario** (las mismas del dominio, `lib/booking.ts`): la noche
 * de hoy no es vendible (la ventana empieza mañana, D-4) y la salida debe ser posterior a la entrada.
 * Si no se cumple, se explica en línea (`role="alert"`) en vez de dejar avanzar al huésped.
 *
 * Los campos usan `border-line-strong`: la frontera de un control cumple 3:1 (WCAG 1.4.11) y lo
 * vigila `control-boundary.test.ts`.
 */
export function BookingBar({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const t = useTranslations("booking");
  const router = useRouter();

  const [checkIn, setCheckIn] = useState(isoDate(1));
  const [checkOut, setCheckOut] = useState(isoDate(2));
  const [guests, setGuests] = useState(2);
  const [problem, setProblem] = useState<BookingDateProblem | null>(null);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const issue = validateStay(checkIn, checkOut);
    if (issue !== null) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    const params = bookingSearchParams({ checkInDate: checkIn, checkOutDate: checkOut, guests });
    router.push(`/reservar?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("ariaLabel")}
      data-testid="booking-bar"
      className={`grid gap-3 rounded-brand-lg border border-line bg-shell p-4 shadow-card tablet:grid-cols-[repeat(3,minmax(0,1fr))_auto] tablet:items-end ${
        variant === "floating" ? "" : "tablet:shadow-none"
      }`.trim()}
    >
      <label className="flex flex-col gap-1 text-small">
        <span className="font-medium text-ink">{t("checkIn")}</span>
        <input
          type="date"
          required
          value={checkIn}
          min={isoDate(1)}
          onChange={(event) => {
            const value = event.target.value;
            setCheckIn(value);
            // La salida nunca puede quedar por detrás de la nueva entrada: se adelanta sola.
            if (value && checkOut <= value) setCheckOut(nextDay(value));
          }}
          className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-small">
        <span className="font-medium text-ink">{t("checkOut")}</span>
        <input
          type="date"
          required
          value={checkOut}
          min={nextDay(checkIn)}
          onChange={(event) => setCheckOut(event.target.value)}
          className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-small">
        <span className="font-medium text-ink">{t("guests")}</span>
        <select
          value={guests}
          onChange={(event) => setGuests(Number(event.target.value))}
          className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3 text-ink"
        >
          {Array.from({ length: MAX_GUESTS }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {t("guestsOption", { count: value })}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="min-h-touch rounded-pill bg-azure px-5 text-small font-semibold text-shell transition-colors hover:bg-azure-deep"
      >
        {t("submit")}
      </button>

      {problem !== null && (
        <p role="alert" className="text-small text-coral-text tablet:col-span-4">
          {t(`errors.${problem}` as "errors.ANTERIOR_A_MANANA")}
        </p>
      )}
    </form>
  );
}
