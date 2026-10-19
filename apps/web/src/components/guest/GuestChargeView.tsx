"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface GuestCharge {
  readonly id: string;
  readonly status: string;
  readonly dueDate: string;
  readonly claimable: boolean;
  readonly amountCents: number;
  readonly currency: string;
  readonly concept: string;
  readonly description: string;
  readonly roomNumber: number | null;
  readonly evidenceAvailable: boolean;
  readonly resolvedAccepted: boolean;
}

const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/**
 * Vista del huésped de un aviso de cargo por daños (F7 · T7.4, CU-V-41/42).
 *
 * Capability link por UUID: consulta el aviso y permite **reclamar** (DISPUTED) o **aceptar**
 * (ACKNOWLEDGED) dentro del plazo. No muestra datos personales ni de otras estancias.
 */
export function GuestChargeView({ id }: { readonly id: string }) {
  const t = useTranslations("damages");
  const [charge, setCharge] = useState<GuestCharge | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/damage-charges/${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setCharge(data as GuestCharge);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "claim" | "acknowledge"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/damage-charges/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes.trim() || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-small text-ink-soft">{t("loading")}</p>;
  if (error !== null) return <p role="alert" className="text-small text-error">{error}</p>;
  if (charge === null) return <p data-testid="empty-state" className="text-small text-ink-soft">{t("guest.notFound")}</p>;

  return (
    <section className="flex flex-col gap-3" data-testid="guest-damage-charge">
      <dl className="grid gap-2 rounded-brand border border-line px-4 py-3 text-small tablet:grid-cols-2">
        <div>
          <dt className="text-micro uppercase tracking-wider text-ink-soft">{t("guest.concept")}</dt>
          <dd className="font-semibold text-ink">{charge.concept}</dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wider text-ink-soft">{t("guest.amount")}</dt>
          <dd className="font-semibold text-ink">
            {new Intl.NumberFormat("es-ES", { style: "currency", currency: charge.currency }).format(charge.amountCents / 100)}
          </dd>
        </div>
        <div className="tablet:col-span-2">
          <dt className="text-micro uppercase tracking-wider text-ink-soft">{t("guest.description")}</dt>
          <dd className="text-ink">{charge.description}</dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wider text-ink-soft">{t("guest.due")}</dt>
          <dd className="text-ink">{new Date(charge.dueDate).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wider text-ink-soft">{t("guest.status")}</dt>
          <dd className="font-semibold text-ink">{t(`status.${charge.status}`)}</dd>
        </div>
        {charge.evidenceAvailable && (
          <p className="tablet:col-span-2 text-micro text-ink-soft">{t("guest.evidenceAvailable")}</p>
        )}
      </dl>

      {charge.claimable && (
        <div className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("guest.notes")}
            <textarea className={`${FIELD} min-h-24 py-2`} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void act("claim")}>
              {t("guest.claim")}
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void act("acknowledge")}>
              {t("guest.acknowledge")}
            </button>
          </div>
        </div>
      )}

      {charge.status === "DISPUTED" && (
        <p className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-ink">{t("guest.disputed")}</p>
      )}
      {charge.resolvedAccepted && (
        <p className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-ink">{t("guest.resolvedAccepted")}</p>
      )}
    </section>
  );
}
