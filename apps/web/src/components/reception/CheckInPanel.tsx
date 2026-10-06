"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress, txExplorerUrl } from "@/config/chain";
import { MODAL_PRIMARY, MODAL_SECONDARY, ModalShell } from "@/components/ui/ModalShell";
import type { Reservation } from "./types";

type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface CheckInSuccess {
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
  onChainTxHash?: string;
  executionTimeMs?: number;
}

const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-50";

/**
 * Sección de Check-in (RF-33, CU-32/CU-33): resguardo QR/JWS y búsqueda por **código de
 * recuperación** (D-32) con comprobación de la reserva antes de registrar la entrada. Reutiliza los
 * endpoints existentes `/api/reception/checkin` y `/api/reception/checkin/contingency`.
 */
export function CheckInPanel({
  apiFetch,
  onDone,
}: {
  apiFetch: ApiFetch;
  onDone: () => void;
}) {
  const t = useTranslations("reception");
  const tCommon = useTranslations("common");
  const [ticketJws, setTicketJws] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Diálogo flotante abierto: los formularios de check-in viven en fichas flotantes. */
  const [dialog, setDialog] = useState<"qr" | "recovery" | null>(null);

  // Código de recuperación
  const [code, setCode] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);

  const pausedRead = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const isPaused = pausedRead.data === true;

  async function submitQr(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let jws = ticketJws.trim();
      if (jws.includes("#ticket=")) jws = jws.split("#ticket=")[1] || jws;
      const res = await apiFetch("/api/reception/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketJws: jws }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("errorGeneric"));
      setResult(data);
      setTicketJws("");
      setDialog(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function lookupReservation(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setReservation(null);
    setResult(null);
    try {
      const res = await apiFetch(
        `/api/reception/reservations/lookup?code=${encodeURIComponent(code.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("checkinRecoveryNotFound"));
      setReservation(data.reservation);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmRecovery(): Promise<void> {
    if (!reservation) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/reception/checkin/contingency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: reservation.roomNumber,
          checkInDate: reservation.checkInDate,
          possessionProofType: "VOUCHER_CODE",
          possessionProofValue: reservation.recoveryCode ?? code.trim().toUpperCase(),
          reason: "RESGUARDO_IMPRESO",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("errorGeneric"));
      setResult(data);
      setReservation(null);
      setCode("");
      setDialog(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {isPaused && (
        <p data-testid="reception-paused" role="status" className="rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text">
          {t("pausedNotice")}
        </p>
      )}

      {result && (
        <div data-testid="checkin-success-banner" className="rounded-brand border border-success/40 bg-success-bg p-4 text-ink">
          <p className="font-semibold">{t("checkinSuccess")}</p>
          <p className="text-small text-ink-soft">
            {t("checkinSuccessRoom", { room: result.roomNumber, date: result.checkInDate })}
          </p>
          {result.onChainTxHash && (
            <p className="mt-1 text-micro text-ink-soft">
              {t("checkinTx")}:{" "}
              {txExplorerUrl(result.onChainTxHash as `0x${string}`) ? (
                <a href={txExplorerUrl(result.onChainTxHash as `0x${string}`) as string} target="_blank" rel="noreferrer" className="font-mono underline">
                  {result.onChainTxHash.slice(0, 18)}…
                </a>
              ) : (
                <span className="font-mono">{result.onChainTxHash.slice(0, 18)}…</span>
              )}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" data-testid="checkin-error-banner" className="rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text">
          {error}
        </p>
      )}

      {/* Punto de entrada: cada formulario de check-in es una ficha flotante. */}
      <section className="flex flex-col gap-4 rounded-brand-lg border border-line bg-shell p-5 shadow-card">
        <div>
          <h3 className="font-display text-h3 font-semibold">{t("checkinQrTitle")}</h3>
          <p className="mt-1 text-small text-ink-soft">{t("checkinQrHint")}</p>
        </div>
        <div>
          <h3 className="font-display text-h3 font-semibold">{t("checkinRecoveryTitle")}</h3>
          <p className="mt-1 text-small text-ink-soft">{t("checkinRecoveryHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="checkin-open-qr" onClick={() => setDialog("qr")} className={ACTION}>
            {t("checkinQrTitle")}
          </button>
          <button
            type="button"
            data-testid="checkin-open-recovery"
            onClick={() => setDialog("recovery")}
            className="min-h-touch rounded-pill border border-line px-4 font-medium text-ink transition-colors hover:bg-mist-2"
          >
            {t("checkinRecoveryTitle")}
          </button>
        </div>
      </section>

      {dialog === "qr" && (
        <ModalShell
          testId="checkin-qr-dialog"
          title={t("checkinQrTitle")}
          subtitle={t("checkinQrHint")}
          closeLabel={tCommon("close")}
          onClose={() => setDialog(null)}
          footerTestId="checkin-qr-footer"
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} className={MODAL_SECONDARY}>
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="checkin-qr-form"
                disabled={loading || !ticketJws.trim() || isPaused}
                className={MODAL_PRIMARY}
              >
                {loading ? t("processing") : t("checkinQrSubmit")}
              </button>
            </>
          }
        >
          <form id="checkin-qr-form" onSubmit={submitQr} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("checkinQrLabel")}
              <textarea
                rows={5}
                required
                value={ticketJws}
                onChange={(event) => setTicketJws(event.target.value)}
                data-testid="checkin-jws"
                className="w-full rounded-brand border border-line-strong bg-mist-2 p-3 font-mono text-small text-ink outline-none focus:border-azure"
              />
            </label>
          </form>
        </ModalShell>
      )}

      {dialog === "recovery" && (
        <ModalShell
          testId="checkin-recovery-dialog"
          title={t("checkinRecoveryTitle")}
          subtitle={t("checkinRecoveryHint")}
          closeLabel={tCommon("close")}
          onClose={() => setDialog(null)}
          footerTestId="checkin-recovery-footer"
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} className={MODAL_SECONDARY}>
                {tCommon("close")}
              </button>
              <button
                type="submit"
                form="checkin-recovery-form"
                disabled={loading || !code.trim()}
                className={MODAL_PRIMARY}
              >
                {loading ? t("processing") : t("checkinRecoverySubmit")}
              </button>
            </>
          }
        >
          <form id="checkin-recovery-form" onSubmit={lookupReservation} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("checkinRecoveryLabel")}
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="MDS-XXXXXXXX"
                data-testid="recovery-code-input"
                className={`${FIELD} font-mono`}
              />
            </label>
          </form>

          {reservation && (
            <div data-testid="recovery-result" className="mt-4 rounded-brand border border-line bg-mist-2 p-4">
              <p className="font-semibold">{t("checkinRecoveryFound")}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-small">
                <div><dt className="text-ink-soft">{t("colRoom")}</dt><dd className="font-semibold">{reservation.roomNumber}</dd></div>
                <div><dt className="text-ink-soft">{t("colType")}</dt><dd>{reservation.roomType}</dd></div>
                <div><dt className="text-ink-soft">{t("checkInDateLabel")}</dt><dd>{reservation.checkInDate}</dd></div>
                <div><dt className="text-ink-soft">{t("colStatus")}</dt><dd>{reservation.status}</dd></div>
              </dl>
              <button
                type="button"
                onClick={() => void confirmRecovery()}
                disabled={loading || isPaused || reservation.status !== "SOLD"}
                data-testid="recovery-confirm"
                className={`mt-3 ${ACTION}`}
              >
                {t("checkinRecoveryConfirm")}
              </button>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
