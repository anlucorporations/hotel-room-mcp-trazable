"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { parseEther } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useSignMessage } from "wagmi";
import {
  buildNightMetadata,
  dateToYYYYMMDD,
  isRoomInMaster,
  isValidCalendarDate,
  roomTypeOf,
  encodeTokenId,
} from "@hotel/shared";
import { activeChain } from "@/config/chain";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { classifyTxError } from "@/components/tx/txError";
import { useMintNight } from "./useMintNight";

const BTN = "min-h-touch rounded-md bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-60";

function parseDateInput(value: string): { yyyymmdd: number; valid: boolean } {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return { yyyymmdd: 0, valid: false };
  return {
    yyyymmdd: dateToYYYYMMDD({ year: y, month: m, day: d }),
    valid: isValidCalendarDate({ year: y, month: m, day: d }),
  };
}

/** Back-office de minteo (CU-01 acceso por SIWE+rol; CU-02 minteo). */
export function AdminMint() {
  const t = useTranslations("admin");
  const { isConnected, address, connect } = useOnboarding();
  const { signMessageAsync } = useSignMessage();
  const { mint, status, error: mintError, reset } = useMintNight();

  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [room, setRoom] = useState("");
  const [date, setDate] = useState("");
  const [priceEth, setPriceEth] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json() as Promise<{ address: string | null }>)
      .then((data) => setSessionAddress(data.address));
  }, []);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!address) return;
    const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
    const message = createSiweMessage({
      address,
      chainId: activeChain.id,
      domain: window.location.host,
      nonce,
      uri: window.location.origin,
      version: "1",
      statement: "Acceso al back-office del Hotel Marina del Sol.",
    });
    const signature = await signMessageAsync({ message });
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (res.ok) {
      const data = (await res.json()) as { address: string };
      setSessionAddress(data.address);
    } else if (res.status === 403) {
      setAuthError(t("noRole"));
    } else {
      setAuthError(t("signInPrompt"));
    }
  }, [address, signMessageAsync, t]);

  // Si la wallet cambió a otra cuenta tras iniciar sesión, el minteo lo firmaría una cuenta
  // distinta de la autenticada (probablemente sin rol MINTER): avisamos pero NO bloqueamos el
  // formulario, para que el usuario pueda reintentar (o volver a iniciar sesión).
  const accountMismatch = Boolean(
    sessionAddress && address && address.toLowerCase() !== sessionAddress.toLowerCase(),
  );
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

  if (!isConnected) {
    return (
      <button type="button" onClick={connect} className={BTN}>
        {t("connectPrompt")}
      </button>
    );
  }

  if (!sessionAddress) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-slate-600">{t("signInPrompt")}</p>
        <button type="button" onClick={() => void signIn()} className={BTN}>
          {t("signIn")}
        </button>
        {authError && (
          <p data-testid="auth-error" className="text-red-700">
            {authError}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onMint} className="flex max-w-md flex-col gap-4">
      {accountMismatch && (
        <div
          data-testid="account-mismatch"
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
        >
          <span>{t("accountChanged")}</span>
          <button type="button" onClick={() => void signIn()} className="self-start underline">
            {t("resign")}
          </button>
        </div>
      )}
      <label className="flex flex-col gap-1">
        {t("room")}
        <input
          data-testid="mint-room"
          type="number"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          required
          className="min-h-touch rounded-md border border-slate-300 px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        {t("date")}
        <input
          data-testid="mint-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="min-h-touch rounded-md border border-slate-300 px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        {t("price")}
        <input
          data-testid="mint-price"
          type="number"
          step="0.001"
          min="0"
          value={priceEth}
          onChange={(e) => setPriceEth(e.target.value)}
          required
          className="min-h-touch rounded-md border border-slate-300 px-3"
        />
      </label>

      <button type="submit" data-testid="mint-submit" disabled={status === "signing" || status === "pending"} className={BTN}>
        {status === "signing" || status === "pending" ? t("minting") : t("mint")}
      </button>

      {formError && (
        <p data-testid="mint-error" className="text-red-700">
          {formError}
        </p>
      )}
      {!formError && txErrorKind && (
        <p data-testid="mint-tx-error" role="alert" className="text-red-700">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}
      {status === "confirmed" && mintedTokenId && (
        <p data-testid="mint-success" className="text-emerald-700">
          {t("minted", { tokenId: mintedTokenId })}
          <button type="button" onClick={reset} className="ml-2 underline">
            ✕
          </button>
        </p>
      )}
    </form>
  );
}
