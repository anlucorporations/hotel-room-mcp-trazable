"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { PublicShell } from "@/components/layout/PublicShell";

interface TicketClaims {
  tokenId?: string;
  roomNumber?: number;
  checkInDate?: string;
  roomType?: string;
  expiresAt?: number;
  jti?: string;
}

/** Decodifica el payload (`jti`/claims) de un JWS compacto sin verificar la firma. */
function decodeClaims(jws: string): TicketClaims | null {
  const segment = jws.split(".")[1];
  if (!segment) return null;
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as TicketClaims;
  } catch {
    return null;
  }
}

/**
 * Página que **muestra el resguardo** al llegar al hotel (RF-07 · CU-08).
 *
 * El resguardo viaja en el **fragmento** de la URL (`/checkin#ticket=<JWS>`), que el navegador no
 * envía al servidor: aquí se lee en el cliente, se pinta el QR para que recepción lo escanee y se
 * deja el token en texto para el camino manual (el mostrador puede pegarlo en su pantalla). La
 * validación —titularidad, uso único y ancla on-chain— la hace la API de recepción al canjearlo, no
 * esta página: aquí solo se muestra.
 */
export default function CheckInPage() {
  const t = useTranslations("ticket");
  const [jws, setJws] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [claims, setClaims] = useState<TicketClaims | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const value = params.get("ticket");
    if (!value) return;
    setJws(value);
    setClaims(decodeClaims(value));

    // El QR se dibuja en el cliente a partir de la URL completa: el servidor nunca ve el fragmento.
    void QRCode.toDataURL(window.location.href, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      color: { dark: "#101F2C", light: "#FFFFFF" },
    })
      .then(setQrDataUrl)
      // Sin imagen, la pantalla sigue sirviendo: el token se puede copiar y pegar en recepción.
      .catch(() => setQrDataUrl(null));
  }, []);

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("checkinTitle")}</h1>
          <p className="text-body text-ink-soft">{t("checkinHint")}</p>
        </header>

        {!jws && (
          <div className="flex flex-col gap-3 rounded-brand-lg border border-line bg-mist-2 p-5">
            <p role="alert" className="text-body text-ink">
              {t("checkinMissing")}
            </p>
            <Link href="/mis-noches" className="min-h-touch rounded-brand bg-azure px-4 py-2 text-center font-semibold text-shell">
              {t("checkinGoToMyNights")}
            </Link>
          </div>
        )}

        {jws && (
          <>
            <ul className="flex flex-col gap-1 rounded-brand-lg border border-line bg-shell p-5 text-body text-ink">
              {claims?.roomNumber !== undefined && (
                <li>
                  <strong>{t("room", { room: claims.roomNumber })}</strong>
                </li>
              )}
              {claims?.checkInDate && (
                <li>
                  <strong>{t("checkinDateLabel")}</strong> {claims.checkInDate}
                </li>
              )}
            </ul>

            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- PNG en data URL generado en el cliente
              <img
                data-testid="checkin-qr"
                src={qrDataUrl}
                width={512}
                height={512}
                alt={t("checkinQrAlt")}
                className="mx-auto h-auto w-full max-w-sm rounded-brand-lg border border-line bg-shell p-3"
              />
            ) : (
              <p className="text-small text-coral-text">{t("qrUnavailable")}</p>
            )}

            <p className="text-small text-ink-soft">{t("checkinStaffHint")}</p>

            <details className="rounded-brand border border-line bg-mist-2 p-3">
              <summary className="cursor-pointer text-small font-semibold text-ink">{t("checkinManual")}</summary>
              <textarea
                data-testid="checkin-jws"
                readOnly
                rows={4}
                value={jws}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded-brand border border-line-strong p-2 font-mono text-micro text-ink"
              />
            </details>
          </>
        )}
      </div>
    </PublicShell>
  );
}
