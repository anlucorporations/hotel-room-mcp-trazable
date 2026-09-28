"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { formatNightDate } from "@/lib/format";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useExpiredNights } from "./useExpiredNights";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";

const PRIMARY =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-terracotta px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";
const FIELD = "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink";

const DEFAULT_BATCH_MAX = 50; // BURN_BATCH_MAX por defecto (CU-13, docs/SRS.md §9); se confirma on-chain.

/** Parsea tokenIds separados por coma/espacio/salto de línea, sin duplicados ni vacíos. */
function parseTokenIds(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
}

/**
 * Caducadas (CU-13, BURNER): escanea las noches del hotel expiradas no vendidas y quema un lote
 * ≤ `BURN_BATCH_MAX` con `burnExpired`. El escaneo por RPC es bajo demanda (puede ser costoso);
 * se ofrece además entrada manual de tokenIds. El contrato valida cada token (`NotExpired`/
 * `AlreadySold`/`BatchTooLarge`).
 *
 * `burnExpired` es IRREVERSIBLE y `whenNotPaused`: exige confirmación explícita en el `TxModal`
 * mostrando recuento + tokenIds (UX#21), deshabilita el botón con aviso si el sistema está en
 * pausa (MINOR#33) y usa copy genérica del ciclo de tx (MAJOR#9).
 */
export function AdminExpired() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const batchMax = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "BURN_BATCH_MAX",
  });
  const max = batchMax.data !== undefined ? Number(batchMax.data) : DEFAULT_BATCH_MAX;
  const paused = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const isPaused = paused.data === true;

  const [scanEnabled, setScanEnabled] = useState(false);
  const scan = useExpiredNights(scanEnabled);
  const { send, reset, status, hash, error } = useAdminWrite();

  const [manual, setManual] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const busy = status === "signing" || status === "pending";
  const txErrorKind = error ? classifyAdminTxError(error) : null;
  const errorId = "expired-form-error";
  const hasFormError = Boolean(formError);

  // Lote efectivo: tokenIds manuales si los hay; si no, las candidatas escaneadas (hasta `max`).
  const scanResult = scan.data;
  const scanned = useMemo(() => scanResult?.nights ?? [], [scanResult]);
  // Aviso de escaneo parcial: el lote escaneado puede estar incompleto (MINOR#35).
  const scanPartial = scanResult?.partial ?? false;
  const batch = useMemo(() => {
    const manualIds = parseTokenIds(manual);
    if (manualIds.length > 0) return manualIds;
    return scanned.slice(0, max).map((n) => n.tokenId);
  }, [manual, scanned, max]);

  const { refetch: refetchScan } = scan;
  useEffect(() => {
    if (status === "confirmed" && scanEnabled) void refetchScan();
  }, [status, scanEnabled, refetchScan]);

  const phase = confirming && status === "idle" ? "review" : status;

  function closeModal(): void {
    setConfirming(false);
    reset();
  }

  function onBurn(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    if (batch.length === 0) return setFormError(t("expiredEmptyBatch"));
    if (batch.length > max) return setFormError(t("expiredTooLarge", { max }));
    setConfirming(true); // confirmación explícita antes de firmar (UX#21).
  }

  function confirm(): void {
    send("burnExpired", [batch.map((id) => BigInt(id))]);
  }

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="expired-scan"
          onClick={() => (scanEnabled ? void scan.refetch() : setScanEnabled(true))}
          disabled={scan.isFetching}
          className={PRIMARY}
        >
          {scan.isFetching ? t("expiredScanning") : t("expiredScan")}
        </button>
        {scanEnabled && !scan.isFetching && !scan.isError && (
          <p data-testid="expired-count" className="text-ink">
            {t("expiredCount", { count: scanned.length })}
          </p>
        )}
        {scan.isError && (
          <p role="alert" className="text-terracotta-text">
            {scan.error?.message === "SCAN_CONFIG_INVALID"
              ? t("scanConfigError")
              : t("expiredScanError")}
          </p>
        )}
      </div>

      {/* El escaneo no pudo verificar algunas noches por error de red: recuento incompleto (MINOR#35). */}
      {scanPartial && !scan.isFetching && (
        <p data-testid="expired-partial" role="alert" className="mt-3 text-small text-terracotta-text">
          {t("scanPartialError")}
        </p>
      )}

      {scanned.length > 0 && (
        <ul className="mt-4 flex max-h-48 flex-col gap-1 overflow-auto rounded-brand bg-sand-2 p-3 text-small text-ink">
          {scanned.slice(0, max).map((n) => (
            <li key={n.tokenId} className="flex justify-between gap-3">
              <span className="font-mono">{n.tokenId}</span>
              <span className="text-ink-soft">{formatNightDate(n.dateYYYYMMDD)}</span>
            </li>
          ))}
        </ul>
      )}

      {isPaused && (
        <p data-testid="expired-paused" role="alert" className="mt-4 text-small text-terracotta-text">
          {t("pausedWarning")}
        </p>
      )}

      <form onSubmit={onBurn} className="mt-5 flex flex-col gap-3">
        <label
          htmlFor="expired-manual"
          className="flex flex-col gap-1 text-small font-medium text-ink"
        >
          {t("expiredManual", { max })}
          <textarea
            id="expired-manual"
            data-testid="expired-manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={2}
            inputMode="numeric"
            placeholder="10220260615, 10320260616"
            aria-invalid={hasFormError || undefined}
            aria-describedby={hasFormError ? errorId : undefined}
            className={FIELD}
          />
        </label>
        <p className="text-micro text-ink-soft">{t("expiredBatchHint", { count: batch.length, max })}</p>
        <button type="submit" data-testid="expired-burn" disabled={busy || isPaused} className={DANGER}>
          {t("expiredBurn", { count: batch.length })}
        </button>
        {formError && (
          <p id={errorId} data-testid="expired-error" role="alert" className="text-terracotta-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p role="alert" className="text-terracotta-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
      </form>

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        copy={txCopy}
        reviewBody={
          <div data-testid="expired-confirm" className="flex flex-col gap-2 text-small text-ink">
            <p>{t("expiredConfirm", { count: batch.length })}</p>
            <p className="font-medium">{t("expiredConfirmTokens")}</p>
            <ul className="max-h-40 overflow-auto rounded-brand bg-sand-2 p-3 font-mono text-micro">
              {batch.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </div>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="expired-confirm-action"
              onClick={confirm}
              className={DANGER}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink"
            >
              {t("cancel")}
            </button>
          </>
        }
      />
    </AdminCard>
  );
}
