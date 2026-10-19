import { getTranslations } from "next-intl/server";
import { HousekeepingRepository, SupplyAlertsRepository, suggestedRestockQty } from "@hotel/shared";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";

export const dynamic = "force-dynamic";

/** Lencería y suministros (F6 · T6.1): estado del stock y alertas abiertas; la reposición es del responsable. */
export default async function AmaDeLlavesSuppliesPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const repo = new HousekeepingRepository();
  const [items, lowStock, alerts, openAlerts] = await Promise.all([
    repo.listSupplyItems().catch(() => []),
    repo.listLowStock().catch(() => []),
    repo.listOpenAlerts().catch(() => []),
    new SupplyAlertsRepository().listOpen().catch(() => []),
  ]);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("supplies.title")}</h1>
        <p className="text-body text-ink-soft">{t("supplies.tagline")}</p>
      </header>
      <section className="rounded-brand border border-line px-4 py-3" data-testid="supplies-board">
        <h2 className="text-h4 font-semibold text-ink">{t("supplies.catalogTitle")}</h2>
        {items.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("supplies.empty")}</p>
        ) : (
          <table className="mt-2 w-full text-small">
            <caption className="sr-only">{t("supplies.catalogTitle")}</caption>
            <thead className="text-left text-micro uppercase tracking-wider text-ink-soft">
              <tr>
                <th scope="col" className="py-1">{t("supplies.item")}</th>
                <th scope="col" className="py-1">{t("supplies.stock")}</th>
                <th scope="col" className="py-1">{t("supplies.threshold")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.code}>
                  <td className="py-1 text-ink">{item.nameEs}</td>
                  <td className="py-1 text-ink-soft">{item.stockQty} {item.unit}</td>
                  <td className="py-1 text-ink-soft">{item.thresholdQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("supplies.alertsTitle")}</h2>
        {lowStock.length === 0 && alerts.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("supplies.alertsEmpty")}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-small text-ink-soft">
            {lowStock.map((item) => {
              const alert = openAlerts.find((row) => row.supplyItemId === item.id);
              return (
                <li key={item.code} data-testid="supply-alert">
                  {item.nameEs}: {t("supplies.belowThreshold", { stock: item.stockQty, threshold: item.thresholdQty })}
                  {" · "}
                  {t("supplies.suggested", {
                    qty: suggestedRestockQty({ stockQty: item.stockQty, thresholdQty: item.thresholdQty }),
                    unit: item.unit,
                  })}
                  {" · "}
                  {alert?.lastRemindedAt
                    ? t("supplies.lastReminded", { date: alert.lastRemindedAt.toLocaleDateString() })
                    : t("supplies.pendingReminder")}
                </li>
              );
            })}
            {alerts.map((alert) => (
              <li key={alert.id} data-testid="supply-alert">
                {t("supplies.openAlert", { id: alert.id.slice(0, 8) })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
