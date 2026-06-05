"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { classifyTxError } from "@/components/tx/txError";
import { formatNightDate } from "@/lib/format";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useExpiredNights } from "./useExpiredNights";

const PRIMARY =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-terracotta px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";
const FIELD = "min-h-touch w-full rounded-brand border border-line bg-shell px-3 text-ink";

const DEFAULT_BATCH_MAX = 50; // BURN_BATCH_MAX por defecto (CU-13); se confirma on-chain.

/** Parsea tokenIds separados por coma/espacio/salto de línea, sin duplicados ni vacíos. */
function parseTokenIds(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))];
}

/**
 * Caducadas (CU-13, BURNER): escanea las noches del hotel expiradas no vendidas y quema un lote
 * ≤ `BURN_BATCH_MAX` con `burnExpired`. El escaneo por RPC es bajo demanda (puede ser costoso);
 * se ofrece además entrada manual de tokenIds. El contrato valida cada token (`NotExpired`/
 * `AlreadySold`/`BatchTooLarge`).
 */
export function AdminExpired() {
  const t = useTranslations("admin");
  const batchMax = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "BURN_BATCH_MAX",
  });
  const max = batchMax.data !== undefined ? Number(batchMax.data) : DEFAULT_BATCH_MAX;

  const [scanEnabled, setScanEnabled] = useState(false);
  const scan = useExpiredNights(scanEnabled);
  const { send, reset, status, hash, error } = useAdminWrite();

  const [manual, setManual] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const busy = status === "signing" || status === "pending";
  const txErrorKind = error ? classifyTxError(error) : null;

  // Lote efectivo: tokenIds manuales si los hay; si no, las candidatas escaneadas (hasta `max`).
  const scanData = scan.data;
  const scanned = useMemo(() => scanData ?? [], [scanData]);
  const batch = useMemo(() => {
    const manualIds = parseTokenIds(manual);
    if (manualIds.length > 0) return manualIds;
    return scanned.slice(0, max).map((n) => n.tokenId);
  }, [manual, scanned, max]);

  const { refetch: refetchScan } = scan;
  useEffect(() => {
    if (status === "confirmed" && scanEnabled) void refetchScan();
  }, [status, scanEnabled, refetchScan]);

  function onBurn(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    if (batch.length === 0) return setFormError(t("expiredEmptyBatch"));
    if (batch.length > max) return setFormError(t("expiredTooLarge", { max }));
    reset();
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
            {t("expiredScanError")}
          </p>
        )}
      </div>

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

      <form onSubmit={onBurn} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("expiredManual", { max })}
          <textarea
            data-testid="expired-manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            rows={2}
            placeholder="10220260615, 10320260616"
            className={FIELD}
          />
        </label>
        <p className="text-micro text-ink-soft">{t("expiredBatchHint", { count: batch.length, max })}</p>
        <button type="submit" data-testid="expired-burn" disabled={busy} className={DANGER}>
          {busy ? t("processing") : t("expiredBurn", { count: batch.length })}
        </button>
        {formError && (
          <p data-testid="expired-error" role="alert" className="text-terracotta-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p role="alert" className="text-terracotta-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
      </form>
      <TxModal phase={status} onClose={reset} hash={hash} />
    </AdminCard>
  );
}
