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
  const { mint, status, reset } = useMintNight();

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

  function onMint(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    setMintedTokenId(null);

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
