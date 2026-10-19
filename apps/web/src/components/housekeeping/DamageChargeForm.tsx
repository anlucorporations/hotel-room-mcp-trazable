"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DamageNotificationView } from "@/lib/damages/types";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/**
 * Alta de **cargo por daños** desde el ama de llaves (F7 · T7.2/T7.7).
 *
 * `data-testid="damage-charge-form"`: registra importe, descripción y evidencia; sin evidencia muestra
 * `evidence-missing` (no bloquea, D-C12). El cargo se vincula a la noche vendida (token) y **no**
 * genera ninguna firma ni evento on-chain (D-C27).
 */
export function DamageChargeForm({
  rooms,
  tokens,
  initialCharges,
}: {
  readonly rooms: readonly { id: string; roomNumber: number }[];
  readonly tokens: readonly { tokenId: string; roomNumber: number; label: string }[];
  readonly initialCharges: readonly DamageNotificationView[];
}) {
  const t = useTranslations("damages");
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [tokenId, setTokenId] = useState(tokens[0]?.tokenId ?? "");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [evidencePath, setEvidencePath] = useState("");
  const [charges, setCharges] = useState(initialCharges);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setClaimUrl(null);
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    try {
      const response = await fetch("/api/housekeeping/damage-charges", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          tokenId,
          concept: concept.trim() || undefined,
          damageDescription: description.trim(),
          amountCents,
          evidencePath: evidencePath.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { claimUrl?: string; message?: string }
        | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setClaimUrl(data?.claimUrl ?? null);
      setConcept("");
      setAmount("");
      setDescription("");
      setEvidencePath("");
      const refreshed = await fetch(`/api/housekeeping/damage-charges?tokenId=${encodeURIComponent(tokenId)}`, {
        credentials: "same-origin",
      }).then((res) => res.json());
      setCharges((refreshed?.notifications ?? []) as DamageNotificationView[]);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="damage-charge-form">
      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("form.title")}</h2>
        <p className="text-small text-ink-soft">{t("form.hint")}</p>
        <div className="grid gap-2 tablet:grid-cols-2">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("form.room")}
            <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.roomNumber}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("form.night")}
            <select className={FIELD} value={tokenId} onChange={(event) => setTokenId(event.target.value)}>
              {tokens.map((token) => (
                <option key={token.tokenId} value={token.tokenId}>{token.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("form.concept")}
            <input className={FIELD} maxLength={120} value={concept} onChange={(event) => setConcept(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("form.amount")}
            <input className={FIELD} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-small text-ink tablet:col-span-2">
            {t("form.description")}
            <input className={FIELD} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-small text-ink tablet:col-span-2">
            {t("form.evidence")}
            <input className={FIELD} maxLength={500} value={evidencePath} onChange={(event) => setEvidencePath(event.target.value)} />
          </label>
        </div>
        {evidencePath.trim() === "" && (
          <p data-testid="evidence-missing" role="status" className="w-fit rounded-brand-sm border border-line bg-mist-2 px-3 py-1 text-micro text-ink-soft">
            {t("form.evidenceMissing")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BUTTON} disabled={busy || !description.trim() || !amount} onClick={() => void submit()}>
            {t("form.submit")}
          </button>
          {claimUrl !== null && <p role="status" className="text-small text-success">{t("form.created", { url: claimUrl })}</p>}
        </div>
        {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      </section>

      <section className="rounded-brand border border-line px-4 py-3" data-testid="damage-charge-list">
        <h2 className="text-h4 font-semibold text-ink">{t("list.title")}</h2>
        {charges.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("list.empty")}</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-line text-small text-ink">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {charge.concept} · {charge.damageDescription} · {charge.roomNumber ?? "—"}
                </span>
                <span className="font-semibold">{formatEuros(charge.amountCents, charge.currency)}</span>
                <span className="rounded-pill bg-mist-2 px-2 py-0.5 text-micro font-semibold">{t(`status.${charge.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatEuros(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amountCents / 100);
}
