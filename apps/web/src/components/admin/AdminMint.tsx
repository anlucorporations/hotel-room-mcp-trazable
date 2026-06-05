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
import { classifyTxError } from "@/components/tx/txError";
import { AdminCard } from "./AdminPanel";
import { useMintNight } from "./useMintNight";

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
  const { mint, status, hash, error: mintError, reset } = useMintNight();

  const [room, setRoom] = useState("");
  const [date, setDate] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);

  const busy = status === "signing" || status === "pending";
  const txErrorKind = mintError ? classifyTxError(mintError) : null;

  function onMint(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    setMintedTokenId(null);
    reset(); // descarta el resultado/error de un intento anterior antes de reintentar.

    const roomNum = Number(room);
    if (!isRoomInMaster(roomNum)) return setFormError(t("invalidRoom"));
    const { yyyymmdd, valid } = parseDateInput(date);
    if (!valid) return setFormError(t("invalidDate"));
    const type = roomTypeOf(roomNum);
    if (!type) return setFormError(t("invalidRoom"));

    const metadata = buildNightMetadata({ room: roomNum, dateYYYYMMDD: yyyymmdd, roomType: type });
    // Dev: tokenURI auto-resoluble como data: URI. En prod, ipfs:// vía pinning (ADR-12).
    const metadataURI = `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(metadata),
    )}`;

    setMintedTokenId(encodeTokenId(roomNum, yyyymmdd).toString());
    mint(roomNum, yyyymmdd, parseEther(priceEth || "0"), metadataURI);
  }

  return (
    <AdminCard>
      <form onSubmit={onMint} className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("room")}
          <input
            data-testid="mint-room"
            type="number"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            required
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("date")}
          <input
            data-testid="mint-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium text-ink">
          {t("price")}
          <input
            data-testid="mint-price"
            type="number"
            step="0.001"
            min="0"
            value={priceEth}
            onChange={(e) => setPriceEth(e.target.value)}
            required
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
          <p data-testid="mint-error" role="alert" className="text-terracotta-text">
            {formError}
          </p>
        )}
        {!formError && txErrorKind && (
          <p data-testid="mint-tx-error" role="alert" className="text-terracotta-text">
            {t(`txError.${txErrorKind}`)}
          </p>
        )}
        {status === "confirmed" && mintedTokenId && (
          <p data-testid="mint-success" className="text-sea-deep">
            {t("minted", { tokenId: mintedTokenId })}
          </p>
        )}
      </form>
      <TxModal phase={status} onClose={reset} hash={hash} />
    </AdminCard>
  );
}
