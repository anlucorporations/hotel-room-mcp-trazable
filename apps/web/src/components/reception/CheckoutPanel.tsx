"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CHECKOUT_INCIDENT_KINDS, type CheckoutIncidentKind } from "@hotel/shared/domain";
import type { Charge, CheckoutReceipt, Reservation } from "./types";

type ApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

const FIELD =
  "min-h-touch w-full rounded-brand border border-line bg-shell px-3 text-ink outline-none focus:border-sea";
const ACTION =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-50";

const INCIDENT_KEY: Readonly<Record<CheckoutIncidentKind, string>> = {
  DANOS: "incidentDanos",
  FALTA_LIMPIEZA: "incidentLimpieza",
  OBJETO_OLVIDADO: "incidentObjeto",
  MINIBAR_CONSUMIDO: "incidentMinibar",
  AVERIA: "incidentAveria",
  OTRO: "incidentOtro",
};

/**
 * Sección de Check-out (RF-34/RF-35, CU-34/CU-35): verificación de la habitación, incidencias y
 * cancelación de cargos adicionales. Todo off-chain en PostgreSQL (D-33) e idempotente (RNF-34).
 */
export function CheckoutPanel({
  apiFetch,
  reservations,
  onDone,
}: {
  apiFetch: ApiFetch;
  reservations: readonly Reservation[];
  onDone: () => void;
}) {
  const t = useTranslations("reception");
  const inHouse = reservations;

  const [tokenId, setTokenId] = useState("");
  const [charges, setCharges] = useState<readonly Charge[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);

  // Alta de cargo
  const [concept, setConcept] = useState("");
  const [amountEur, setAmountEur] = useState("");

  // Verificación de habitación
  const [roomCondition, setRoomCondition] = useState<"OK" | "INCIDENCIA">("OK");
  const [incidentKind, setIncidentKind] = useState<CheckoutIncidentKind>("DANOS");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [notes, setNotes] = useState("");

  const reservation = inHouse.find((item) => item.tokenId === tokenId) ?? null;

  const loadCharges = useCallback(
    async (id: string): Promise<void> => {
      if (!id) {
        setCharges([]);
        return;
      }
      const res = await apiFetch(`/api/reception/charges?tokenId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCharges(data.charges ?? []);
    },
    [apiFetch],
  );

  useEffect(() => {
    setSelected([]);
    setReceipt(null);
    void loadCharges(tokenId);
  }, [tokenId, loadCharges]);

  async function addCharge(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    const cents = Math.round(Number.parseFloat(amountEur.replace(",", ".")) * 100);
    if (!tokenId || !concept.trim() || !Number.isFinite(cents) || cents <= 0) {
      setError(t("chargeInvalid"));
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/reception/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId, concept: concept.trim(), amountCents: cents }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("errorGeneric"));
      }
      setConcept("");
      setAmountEur("");
      await loadCharges(tokenId);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function confirmCheckout(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tokenId) return;
    setLoading(true);
    setError(null);
    try {
      const incidents =
        roomCondition === "INCIDENCIA"
          ? [{ kind: incidentKind, description: incidentDescription.trim() || null }]
          : [];
      const res = await apiFetch("/api/reception/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId,
          roomCondition,
          notes: notes.trim() || null,
          incidents,
          cancelChargeIds: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("errorGeneric"));
      setReceipt(data);
      setSelected([]);
      await loadCharges(tokenId);
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  const pending = charges.filter((charge) => charge.status === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-brand border border-line bg-shell p-5">
        <h3 className="font-display text-h3 font-semibold">{t("checkoutTitle")}</h3>
        <p className="mt-1 text-small text-ink-soft">{t("checkoutHint")}</p>

        <label className="mt-4 flex flex-col gap-1 text-small text-ink">
          {t("checkoutSelectLabel")}
          <select
            data-testid="checkout-token"
            value={tokenId}
            onChange={(event) => setTokenId(event.target.value)}
            className={FIELD}
          >
            <option value="">{t("checkoutSelectPlaceholder")}</option>
            {inHouse.map((item) => (
              <option key={item.tokenId} value={item.tokenId}>
                {t("checkoutOption", { room: item.roomNumber, date: item.checkInDate })}
              </option>
            ))}
          </select>
        </label>
        {inHouse.length === 0 && (
          <p data-testid="checkout-empty" className="mt-2 text-small text-ink-soft">
            {t("checkoutNoCheckin")}
          </p>
        )}
        {reservation && (
          <p className="mt-2 text-small text-ink-soft">
            {t("checkoutStay", { room: reservation.roomNumber, date: reservation.checkInDate })}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" data-testid="checkout-error" className="rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-small text-terracotta-text">
          {error}
        </p>
      )}

      {receipt && (
        <div data-testid="checkout-success" role="status" className="rounded-brand border border-olive bg-sand-2 p-4">
          <p className="font-semibold">{receipt.created ? t("checkoutSuccess") : t("checkoutAlready")}</p>
          <p className="text-small text-ink-soft">
            {t("checkoutChargesCancelled", { count: receipt.checkout.chargesCancelled })}
          </p>
        </div>
      )}

      {tokenId && (
        <>
          <section className="rounded-brand border border-line bg-shell p-5">
            <h3 className="font-display text-h3 font-semibold">{t("checkoutChargesTitle")}</h3>
            {charges.length === 0 ? (
              <p data-testid="charges-empty" className="mt-2 text-small text-ink-soft">
                {t("checkoutChargesEmpty")}
              </p>
            ) : (
              <ul data-testid="charges-list" className="mt-3 flex flex-col gap-2">
                {charges.map((charge) => {
                  const isPending = charge.status === "PENDING";
                  return (
                    <li key={charge.id} className="flex items-center gap-3 rounded-brand border border-line px-3 py-2 text-small">
                      {isPending && (
                        <input
                          type="checkbox"
                          data-testid={`charge-select-${charge.id}`}
                          checked={selected.includes(charge.id)}
                          onChange={(event) =>
                            setSelected((prev) =>
                              event.target.checked
                                ? [...prev, charge.id]
                                : prev.filter((id) => id !== charge.id),
                            )
                          }
                          aria-label={t("chargeCancelLabel", { concept: charge.concept })}
                        />
                      )}
                      <span className="flex-1">
                        {charge.concept} · {(charge.amountCents / 100).toFixed(2)} {charge.currency}
                      </span>
                      <span className="text-micro uppercase text-ink-soft">
                        {isPending ? t("chargePending") : t("chargeCancelled")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <form onSubmit={addCharge} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-1 flex-col gap-1 text-small text-ink">
                {t("chargeConceptLabel")}
                <input value={concept} onChange={(event) => setConcept(event.target.value)} data-testid="charge-concept" className={FIELD} />
              </label>
              <label className="flex w-32 flex-col gap-1 text-small text-ink">
                {t("chargeAmountLabel")}
                <input value={amountEur} onChange={(event) => setAmountEur(event.target.value)} inputMode="decimal" data-testid="charge-amount" className={FIELD} />
              </label>
              <button type="submit" disabled={loading} className={ACTION}>
                {t("chargeAdd")}
              </button>
            </form>
          </section>

          <form onSubmit={confirmCheckout} className="rounded-brand border border-line bg-shell p-5">
            <h3 className="font-display text-h3 font-semibold">{t("roomConditionLabel")}</h3>
            <div className="mt-3 flex flex-wrap gap-4 text-small text-ink">
              <label className="flex items-center gap-2">
                <input type="radio" name="condition" checked={roomCondition === "OK"} onChange={() => setRoomCondition("OK")} data-testid="condition-ok" />
                {t("roomConditionOk")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="condition" checked={roomCondition === "INCIDENCIA"} onChange={() => setRoomCondition("INCIDENCIA")} data-testid="condition-incident" />
                {t("roomConditionIncident")}
              </label>
            </div>

            {roomCondition === "INCIDENCIA" && (
              <div className="mt-4 grid gap-3 tablet:grid-cols-2">
                <label className="flex flex-col gap-1 text-small text-ink">
                  {t("incidentKindLabel")}
                  <select value={incidentKind} onChange={(event) => setIncidentKind(event.target.value as CheckoutIncidentKind)} data-testid="incident-kind" className={FIELD}>
                    {CHECKOUT_INCIDENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{t(INCIDENT_KEY[kind] as "incidentDanos")}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-small text-ink">
                  {t("incidentDescriptionLabel")}
                  <input value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} data-testid="incident-description" className={FIELD} />
                </label>
              </div>
            )}

            <label className="mt-4 flex flex-col gap-1 text-small text-ink">
              {t("notesLabel")}
              <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} data-testid="checkout-notes" className="w-full rounded-brand border border-line bg-sand-2 p-3 text-small text-ink outline-none focus:border-sea" />
            </label>

            <p className="mt-3 text-small text-ink-soft">
              {t("checkoutCancelSelected", { count: selected.length, pending: pending.length })}
            </p>

            <button type="submit" disabled={loading} data-testid="checkout-confirm" className={`mt-3 ${ACTION}`}>
              {loading ? t("processing") : t("checkoutConfirm")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
