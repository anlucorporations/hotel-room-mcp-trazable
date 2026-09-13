"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { parseEther } from "viem";
import {
  buildNightMetadata,
  dateToYYYYMMDD,
  isRoomInMaster,
  isValidCalendarDate,
  roomTypeOf,
  encodeTokenId,
} from "@hotel/shared";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useMintNight } from "./useMintNight";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";

const FIELD = "min-h-touch rounded-brand border border-line bg-shell px-3 text-ink";
const SUBMIT =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

function parseDateInput(value: string): { yyyymmdd: number; valid: boolean } {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return { yyyymmdd: 0, valid: false };
  return {
    yyyymmdd: dateToYYYYMMDD({ year: y, month: m, day: d }),
    valid: isValidCalendarDate({ year: y, month: m, day: d }),
  };
}

/**
 * Publicar noche (CU-02): formulario de minteo dentro del AdminLayout. El acceso/sesión SIWE y
 * el gating por rol MINTER los gobierna el AdminLayout; aquí solo se valida (maestro/fecha/precio)
 * y se firma la tx, con confirmación legible en `TxModal`.
 */
export function AdminMint() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const { mint, status, hash, error: mintError, reset } = useMintNight();

  const [room, setRoom] = useState("");
  const [date, setDate] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);

  // Batch minting states
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState("1");

  // Re-MFA states (US-16)
  const [isMfaOpen, setIsMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isSubmittingMfa, setIsSubmittingMfa] = useState(false);

  const busy = status === "signing" || status === "pending" || isSubmittingMfa;
  const txErrorKind = mintError ? classifyAdminTxError(mintError) : null;
  const errorId = "mint-form-error";
  const hasFormError = Boolean(formError);

  function handleFormSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    setMintedTokenId(null);
    reset();

    const roomNum = Number(room);
    if (!isRoomInMaster(roomNum)) return setFormError(t("invalidRoom"));
    const { valid } = parseDateInput(date);
    if (!valid) return setFormError(t("invalidDate"));
    const type = roomTypeOf(roomNum);
    if (!type) return setFormError(t("invalidRoom"));

    // Open MFA prompt before executing
    setMfaCode("");
    setMfaError(null);
    setIsMfaOpen(true);
  }

  async function executeMintWithMfa(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!mfaCode || mfaCode.trim().length !== 6) {
      setMfaError(t("mfaError"));
      return;
    }

    setIsSubmittingMfa(true);
    setMfaError(null);

    try {
      const roomNum = Number(room);
      const type = roomTypeOf(roomNum);
      const count = isBatchMode ? Math.min(Math.max(1, Number(batchCount) || 1), 50) : 1;
      const basePriceWei = parseEther(priceEth || "0").toString();

      // Build batch items
      const items: Array<{
        roomNumber: number;
        roomType: "SIMPLE" | "SUITE";
        checkInDate: string;
        basePriceWei: string;
      }> = [];

      const baseDate = new Date(date);
      for (let i = 0; i < count; i++) {
        const currentDate = new Date(baseDate);
        currentDate.setDate(baseDate.getDate() + i);
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
        const dd = String(currentDate.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;

        items.push({
          roomNumber: roomNum,
          roomType: (type === "suite" ? "SUITE" : "SIMPLE"),
          checkInDate: dateStr,
          basePriceWei,
        });
      }

      const res = await fetch("/api/admin/mint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mfa-token": mfaCode.trim(),
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMfaError(data.message || t("mfaError"));
        setIsSubmittingMfa(false);
        return;
      }

      // Close MFA Modal
      setIsMfaOpen(false);
      setIsSubmittingMfa(false);

      // Trigger on-chain single mint if 1 item
      const { yyyymmdd } = parseDateInput(date);
      const generatedTokenId = encodeTokenId(roomNum, yyyymmdd).toString();
      setMintedTokenId(data.tokenIds?.join(", ") || generatedTokenId);

      const metadata = buildNightMetadata({ room: roomNum, dateYYYYMMDD: yyyymmdd, roomType: type! });
      const metadataURI = `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(metadata),
      )}`;
      mint(roomNum, yyyymmdd, parseEther(priceEth || "0"), metadataURI);
    } catch (err: any) {
      setMfaError(err?.message || t("mfaError"));
      setIsSubmittingMfa(false);
    }
  }

  return (
    <AdminCard>
      <form onSubmit={handleFormSubmit} className="flex max-w-md flex-col gap-4">
        <label className="flex items-center gap-2 text-small font-medium text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={isBatchMode}
            onChange={(e) => setIsBatchMode(e.target.checked)}
            data-testid="mint-batch-toggle"
            className="rounded border-line"
          />
          {t("batchMint")}
        </label>

        <label htmlFor="mint-room" className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("room")}
          <input
            id="mint-room"
            data-testid="mint-room"
            type="number"
            inputMode="numeric"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            required
            aria-invalid={hasFormError || undefined}
            aria-describedby={hasFormError ? errorId : undefined}
            className={FIELD}
          />
        </label>
        <label htmlFor="mint-date" className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("date")}
          <input
            id="mint-date"
            data-testid="mint-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            aria-invalid={hasFormError || undefined}
            aria-describedby={hasFormError ? errorId : undefined}
            className={FIELD}
          />
        </label>

        {isBatchMode && (
          <label htmlFor="mint-batch-count" className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("batchCount")} (1–50)
            <input
              id="mint-batch-count"
              data-testid="mint-batch-count"
              type="number"
              min="1"
              max="50"
              value={batchCount}
              onChange={(e) => setBatchCount(e.target.value)}
              required
              className={FIELD}
            />
          </label>
        )}

        <label htmlFor="mint-price" className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("price")}
          <input
            id="mint-price"
            data-testid="mint-price"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            value={priceEth}
            onChange={(e) => setPriceEth(e.target.value)}
            required
            aria-invalid={hasFormError || undefined}
            aria-describedby={hasFormError ? errorId : undefined}
            className={FIELD}
          />
        </label>

        <button
          type="submit"
          data-testid="mint-action"
          id="mint-submit"
          disabled={busy}
          className={SUBMIT}
        >
          {busy ? t("minting") : t("mint")}
        </button>

        {formError && (
          <p id={errorId} data-testid="mint-error" role="alert" className="text-terracotta-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p data-testid="mint-tx-error" role="alert" className="text-terracotta-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
        {mintedTokenId && (
          <p data-testid="mint-success" className="text-sea-deep font-semibold">
            {t("minted", { tokenId: mintedTokenId })}
          </p>
        )}
      </form>

      {/* Modal de Re-Confirmación TOTP / MFA (US-16) */}
      {isMfaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-brand bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">{t("mfaTitle")}</h3>
            <p className="mt-1 text-small text-ink/70">{t("mfaTagline")}</p>

            <form onSubmit={executeMintWithMfa} className="mt-4 flex flex-col gap-3">
              <label htmlFor="mfa-token-input" className="flex flex-col gap-1 text-small font-medium text-ink">
                {t("mfaCode")}
                <input
                  id="mfa-token-input"
                  data-testid="mfa-token-input"
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  autoFocus
                  required
                  className={FIELD}
                />
              </label>

              {mfaError && (
                <p data-testid="mfa-error" role="alert" className="text-small text-terracotta-text">
                  {mfaError}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  data-testid="mfa-cancel-btn"
                  onClick={() => setIsMfaOpen(false)}
                  disabled={isSubmittingMfa}
                  className="rounded-pill border border-line px-4 py-2 text-small font-medium text-ink hover:bg-black/5"
                >
                  {t("mfaCancel")}
                </button>
                <button
                  type="submit"
                  data-testid="mfa-submit-btn"
                  disabled={isSubmittingMfa || mfaCode.length !== 6}
                  className="rounded-pill bg-sea px-4 py-2 text-small font-semibold text-white hover:bg-sea-deep disabled:opacity-50"
                >
                  {isSubmittingMfa ? t("processing") : t("mfaConfirm")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TxModal phase={status} onClose={reset} hash={hash} copy={txCopy} />
    </AdminCard>
  );
}
