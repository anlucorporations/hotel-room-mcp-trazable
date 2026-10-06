"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { parseEther } from "viem";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import {
  buildNightMetadata,
  dateToYYYYMMDD,
  isRoomInMaster,
  isValidCalendarDate,
  roomTypeOf,
  toRoomTypeDb,
  encodeTokenId,
  type RoomTypeDb,
} from "@hotel/shared/domain";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useMintNight } from "./useMintNight";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";
import { MODAL_PRIMARY, MODAL_SECONDARY, ModalShell } from "@/components/ui/ModalShell";

const FIELD = "min-h-touch rounded-brand border border-line-strong bg-shell px-3 text-ink";
const SUBMIT =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

function parseDateInput(value: string): { yyyymmdd: number; valid: boolean } {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return { yyyymmdd: 0, valid: false };
  return {
    yyyymmdd: dateToYYYYMMDD({ year: y, month: m, day: d }),
    valid: isValidCalendarDate({ year: y, month: m, day: d }),
  };
}

/**
 * Publicar noche (CU-02, docs/SRS.md §9): formulario de minteo dentro del AdminLayout. La sesión canónica
 * (usuario + contraseña + TOTP, D-04) y el gating por rol los gobierna el AdminLayout; aquí se
 * valida (maestro/fecha/precio), se re-confirma el TOTP y se firma la tx, con confirmación
 * legible en `TxModal`.
 */
/**
 * Props opcionales (2026-10-04): el **panel del día** del tablero de disponibilidad monta este
 * formulario con la habitación y la fecha ya elegidas. Pasa una `key` distinta por objetivo para que
 * el cambio reinicie los campos.
 */
export interface AdminMintProps {
  readonly initialRoomNumber?: number;
  readonly initialDate?: string;
}

export function AdminMint({ initialRoomNumber, initialDate }: AdminMintProps = {}) {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const { mint, status, hash, error: mintError, reset } = useMintNight();

  const [room, setRoom] = useState(initialRoomNumber === undefined ? "" : String(initialRoomNumber));
  const [date, setDate] = useState(initialDate ?? "");
  const [priceEth, setPriceEth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState(false);

  // Batch minting states
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState("1");

  // Re-MFA states (US-16)
  const [isMfaOpen, setIsMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isSubmittingMfa, setIsSubmittingMfa] = useState(false);

  const busy = status === "signing" || status === "pending" || isSubmittingMfa;
  // Pausa del contrato (M8): `mint` lleva `whenNotPaused`; con el contrato en pausa el botón se
  // retira para no ofrecer una transacción que la cadena va a revertir con `EnforcedPause`.
  const paused = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "paused",
  });
  const isPaused = paused.data === true;
  const txErrorKind = mintError ? classifyAdminTxError(mintError) : null;
  const errorId = "mint-form-error";
  const hasFormError = Boolean(formError);

  /** Ficha flotante del formulario de publicación de noche. */
  const [mintOpen, setMintOpen] = useState(false);
  const tCommon = useTranslations("common");

  function handleFormSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    setMintedTokenId(null);
    setPendingAnchor(false);
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
    setMintOpen(false);
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
        roomType: RoomTypeDb;
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
          // El tipo lo decide el maestro y se traduce a su vocabulario. Antes era
          // `=== "suite" ? "SUITE" : "SIMPLE"`, así que una habitación doble entraba como simple
          // (M9): ahora persiste su tipo y el catálogo puede filtrarlo.
          roomType: toRoomTypeDb(type) ?? "SIMPLE",
          checkInDate: dateStr,
          basePriceWei,
        });
      }

      // `allowUnanchored=true` es EXPLÍCITO: esta llamada registra la noche antes de que la
      // wallet firme el minteo, así que todavía no existe hash de transacción. El servidor
      // persiste la fila como PENDIENTE DE ANCLAJE (`on_chain_anchored = FALSE`, hash centinela
      // cero) y la excluye del catálogo hasta que se ancle; nunca se escribe un hash inventado.
      const res = await fetch("/api/admin/mint?allowUnanchored=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items, confirmTotpCode: mfaCode.trim(), allowUnanchored: true }),
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
      setPendingAnchor(data.onChainAnchored === false);

      // Trigger on-chain single mint if 1 item
      const { yyyymmdd } = parseDateInput(date);
      const generatedTokenId = encodeTokenId(roomNum, yyyymmdd).toString();
      setMintedTokenId(data.tokenIds?.join(", ") || generatedTokenId);

      const metadata = buildNightMetadata({ room: roomNum, dateYYYYMMDD: yyyymmdd, roomType: type! });
      const metadataURI = `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(metadata),
      )}`;
      mint(roomNum, yyyymmdd, parseEther(priceEth || "0"), metadataURI);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : t("mfaError"));
      setIsSubmittingMfa(false);
    }
  }

  return (
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-h3 font-semibold text-ink">{t("mintTitle")}</h2>
          <p className="mt-1 text-small text-ink-soft">{t("mintTagline")}</p>
        </div>
        <button
          type="button"
          data-testid="mint-open"
          onClick={() => setMintOpen(true)}
          className={SUBMIT}
        >
          {t("mint")}
        </button>
      </div>

      {mintOpen && (
        <ModalShell
          testId="mint-dialog"
          title={t("mintTitle")}
          subtitle={t("mintTagline")}
          closeLabel={tCommon("close")}
          onClose={() => setMintOpen(false)}
          footerTestId="mint-footer"
          footer={
            <>
              <button type="button" onClick={() => setMintOpen(false)} className={MODAL_SECONDARY}>
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="mint-form"
                data-testid="mint-action"
                disabled={busy || isPaused}
                className={MODAL_PRIMARY}
              >
                {busy ? t("minting") : t("mint")}
              </button>
            </>
          }
        >
          <form id="mint-form" onSubmit={handleFormSubmit} className="flex max-w-md flex-col gap-4">
        <label className="flex items-center gap-2 text-small font-medium text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={isBatchMode}
            onChange={(e) => setIsBatchMode(e.target.checked)}
            data-testid="mint-batch-toggle"
            className="rounded border-line-strong"
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

        {/* Pausa del contrato (M8 · H4 de la verificación de M7): `mint` es `whenNotPaused`, así
            que con el sistema en pausa no se ofrece la operación en lugar de dejar que revierta. */}
        {isPaused && (
          <p data-testid="mint-paused" role="status" className="text-small text-coral-text">
            {t("pausedWarning")}
          </p>
        )}


        {formError && (
          <p id={errorId} data-testid="mint-error" role="alert" className="text-coral-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p data-testid="mint-tx-error" role="alert" className="text-coral-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
        {mintedTokenId && (
          <p data-testid="mint-success" className="text-azure-deep font-semibold">
            {t("minted", { tokenId: mintedTokenId })}
          </p>
        )}
        {mintedTokenId && pendingAnchor && (
          <p data-testid="mint-pending-anchor" role="status" className="text-small text-ink-soft">
            {t("mintPendingAnchor")}
          </p>
        )}
      </form>
        </ModalShell>
      )}

      {/* Re-confirmación TOTP / MFA (US-16) en ficha flotante con título, cuerpo y pie. */}
      {isMfaOpen && (
        <ModalShell
          testId="mfa-dialog"
          title={t("mfaTitle")}
          subtitle={t("mfaTagline")}
          closeLabel={tCommon("close")}
          onClose={() => setIsMfaOpen(false)}
          panelClassName="max-w-md"
          footerTestId="mfa-footer"
          footer={
            <>
              <button
                type="button"
                data-testid="mfa-cancel-btn"
                onClick={() => setIsMfaOpen(false)}
                disabled={isSubmittingMfa}
                className={MODAL_SECONDARY}
              >
                {t("mfaCancel")}
              </button>
              <button
                type="submit"
                form="mfa-form"
                data-testid="mfa-submit-btn"
                disabled={isSubmittingMfa || mfaCode.length !== 6}
                className={MODAL_PRIMARY}
              >
                {isSubmittingMfa ? t("processing") : t("mfaConfirm")}
              </button>
            </>
          }
        >
          <form id="mfa-form" onSubmit={executeMintWithMfa} className="flex flex-col gap-3">
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
              <p data-testid="mfa-error" role="alert" className="text-small text-coral-text">
                {mfaError}
              </p>
            )}
          </form>
        </ModalShell>
      )}

      <TxModal phase={status} onClose={reset} hash={hash} copy={txCopy} />
    </AdminCard>
  );
}
