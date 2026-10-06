"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { MODAL_PRIMARY, MODAL_SECONDARY, ModalShell } from "@/components/ui/ModalShell";

interface SupplyItem {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string | null;
  unit: string;
  stockQty: number;
  thresholdQty: number;
}

/**
 * Panel de **Lencería** (F3 · D-51, D-64): existencias, umbral crítico y reposición.
 *
 * Es donde el responsable ve la **alerta de stock bajo** y repone. Solo owner. La alerta también se
 * envía por correo desde la API cuando limpiar una habitación deja un artículo bajo umbral (D-64).
 */
export function SuppliesAdmin() {
  const t = useTranslations("supplies");
  const session = useAdminSession();

  const [items, setItems] = useState<readonly SupplyItem[]>([]);
  const [lowStock, setLowStock] = useState<readonly SupplyItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await session.apiFetch("/api/admin/housekeeping/supplies");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("loadError"));
      setItems(((data as { items?: SupplyItem[] }).items ?? []) as readonly SupplyItem[]);
      setLowStock(((data as { lowStock?: SupplyItem[] }).lowStock ?? []) as readonly SupplyItem[]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [session, t]);

  useEffect(() => {
    if (session.sessionUsername) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionUsername]);

  if (session.isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }

  if (!session.sessionUsername || !session.hasRole("DEFAULT_ADMIN_ROLE")) {
    return (
      <p data-testid="supplies-role-denied" role="alert" className="rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  /** Ficha flotante de reposición del artículo elegido. */
  const [restockItem, setRestockItem] = useState<SupplyItem | null>(null);
  const tCommon = useTranslations("common");

  const restock = async (item: SupplyItem): Promise<void> => {
    const quantity = Number(quantities[item.id] ?? "");
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setNotice(null);
    setError(null);
    try {
      const res = await session.apiFetch("/api/admin/housekeeping/supplies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("restockError"));
      setQuantities((current) => ({ ...current, [item.id]: "" }));
      setNotice(t("restockDone", { code: item.code }));
      setRestockItem(null);
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("restockError"));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {lowStock.length > 0 && (
        <div role="alert" data-testid="supplies-low-stock" className="rounded-brand-lg border border-error/40 bg-error-bg px-4 py-3">
          <h2 className="text-small font-semibold text-ink">{t("lowStockTitle")}</h2>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-soft">
            {lowStock.map((item) => (
              <li key={item.id}>
                {item.nameEs}: {item.stockQty} {item.unit} ({t("threshold")} {item.thresholdQty})
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <p role="status" className="text-small text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-brand-lg border border-error/40 bg-error-bg px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-ink-soft">
          {t("loading")}
        </p>
      ) : (
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
              <th scope="col" className="py-2">{t("item")}</th>
              <th scope="col" className="py-2">{t("stock")}</th>
              <th scope="col" className="py-2">{t("threshold")}</th>
              <th scope="col" className="py-2">{t("restock")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low = item.thresholdQty > 0 && item.stockQty <= item.thresholdQty;
              return (
                <tr key={item.id} className={`border-b border-line/60 ${low ? "bg-coral/5" : ""}`}>
                  <th scope="row" className="py-2 text-left font-medium text-ink">
                    {item.nameEs}
                    {low && <span className="ml-2 rounded-pill bg-coral/20 px-2 py-0.5 text-micro text-ink">{t("low")}</span>}
                  </th>
                  <td className="py-2 text-ink">{item.stockQty} {item.unit}</td>
                  <td className="py-2 text-ink-soft">{item.thresholdQty}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      data-testid={`supply-open-restock-${item.code}`}
                      onClick={() => setRestockItem(item)}
                      className="min-h-touch rounded-pill bg-azure px-3 text-small font-semibold text-shell"
                    >
                      {t("restockAction")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {restockItem && (
        <ModalShell
          testId="supply-restock-dialog"
          title={t("restockAction")}
          subtitle={t("restockFor", { item: restockItem.nameEs })}
          closeLabel={tCommon("close")}
          onClose={() => setRestockItem(null)}
          panelClassName="max-w-md"
          footerTestId="supply-restock-footer"
          footer={
            <>
              <button type="button" onClick={() => setRestockItem(null)} className={MODAL_SECONDARY}>
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                data-testid="supply-restock-confirm"
                onClick={() => void restock(restockItem)}
                className={MODAL_PRIMARY}
              >
                {t("restockAction")}
              </button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("restock")}
            <input
              type="number"
              min={1}
              autoFocus
              aria-label={t("restockFor", { item: restockItem.nameEs })}
              value={quantities[restockItem.id] ?? ""}
              onChange={(event) => setQuantities((current) => ({ ...current, [restockItem.id]: event.target.value }))}
              className="min-h-touch w-32 rounded-brand-sm border border-line-strong bg-mist px-3"
            />
          </label>
        </ModalShell>
      )}
    </div>
  );
}
