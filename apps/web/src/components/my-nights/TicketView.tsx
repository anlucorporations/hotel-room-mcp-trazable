"use client";

import { useTranslations } from "next-intl";
import { formatNightDate } from "@/lib/format";
import { useTicket } from "./useTicket";
import type { OwnedNight } from "./useMyNights";

const PRIMARY_BTN =
  "min-h-touch w-full rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const GHOST_BTN =
  "min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink disabled:opacity-60";

/**
 * Resguardo de check-in del comprador (RF-07 · CU-08): pide la firma del titular y muestra el QR
 * **en pantalla**, con descarga en PNG y el token en texto para el camino manual de recepción.
 *
 * La imagen la dibuja el servidor (`GET /api/qr/:tokenId`); aquí solo se pinta. Si el servidor no
 * pudo dibujarla, el resguardo sigue siendo canjeable: se muestra el token para pegarlo en
 * recepción. La titularidad y el uso único los garantiza la API y el ancla on-chain (D-05).
 */
export function TicketView({ night }: { night: OwnedNight }) {
  const t = useTranslations("ticket");
  const { issue, reset, status, ticket, error } = useTicket(night.tokenId);

  const busy = status === "signing" || status === "requesting";

  return (
    <section
      data-testid={`ticket-${night.tokenId}`}
      aria-labelledby={`ticket-heading-${night.tokenId}`}
      className="mt-4 flex flex-col gap-2 rounded-brand border border-line bg-sand-2 p-3"
    >
      <h4
        id={`ticket-heading-${night.tokenId}`}
        className="font-display text-small font-semibold text-ink"
      >
        {t("title")}
      </h4>

      {status !== "ready" && <p className="text-small text-ink-soft">{t("hint")}</p>}

      {status !== "ready" && (
        <button
          type="button"
          data-testid={`ticket-issue-${night.tokenId}`}
          disabled={busy}
          aria-busy={busy}
          onClick={issue}
          className={PRIMARY_BTN}
        >
          {busy ? t("generating") : t("generate")}
        </button>
      )}

      {error && (
        <p data-testid={`ticket-error-${night.tokenId}`} role="alert" className="text-small text-terracotta-text">
          {error}
        </p>
      )}

      {status === "ready" && ticket && (
        <div className="flex flex-col gap-2">
          {/* El QR llega como PNG en data URL desde la API: `next/image` no aporta nada aquí. */}
          {ticket.qrDataUrl ? (
            <img
              data-testid={`ticket-qr-${night.tokenId}`}
              src={ticket.qrDataUrl}
              width={512}
              height={512}
              alt={t("qrAlt", { room: night.room, date: formatNightDate(night.dateYYYYMMDD) })}
              className="mx-auto h-auto w-full max-w-[16rem] rounded-brand bg-shell p-2"
            />
          ) : (
            <p className="text-small text-terracotta-text">{t("qrUnavailable")}</p>
          )}

          <p className="text-small text-ink">
            <strong>{t("room", { room: ticket.roomNumber })}</strong> ·{" "}
            {formatNightDate(night.dateYYYYMMDD)}
          </p>
          <p className="text-micro text-ink-soft">{t("validUntil", { date: ticket.expiresAt.slice(0, 10) })}</p>

          <label className="flex flex-col text-small text-ink">
            {t("tokenLabel")}
            <textarea
              data-testid={`ticket-jws-${night.tokenId}`}
              readOnly
              rows={2}
              value={ticket.jws}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded-brand border border-line-strong p-2 font-mono text-micro text-ink"
            />
          </label>
          <p className="text-micro text-ink-soft">{t("tokenHint")}</p>

          <div className="flex flex-col gap-2">
            {ticket.qrDataUrl && (
              <a
                data-testid={`ticket-download-${night.tokenId}`}
                download={`resguardo-${night.tokenId}.png`}
                href={ticket.qrDataUrl}
                className={PRIMARY_BTN}
              >
                {t("download")}
              </a>
            )}
            <a
              data-testid={`ticket-open-${night.tokenId}`}
              href={ticket.qrPayload}
              className={GHOST_BTN}
            >
              {t("open")}
            </a>
            <button type="button" onClick={reset} className={GHOST_BTN}>
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
