import { getTranslations } from "next-intl/server";
import { HousekeepingRepository } from "@hotel/shared";
import { currentHousekeepingSession } from "@/lib/housekeeping-suite/session";

export const dynamic = "force-dynamic";

/** Informe de productividad e inspecciones (F6 · CU-V-26): asignaciones y resultados por camarera. */
export default async function AmaDeLlavesReportsPage() {
  const session = await currentHousekeepingSession();
  if (!session.ok) return null;
  const t = await getTranslations("amaDeLlaves");
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const rows = await new HousekeepingRepository().productivityReport(from, to).catch(() => []);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("reports.title")}</h1>
        <p className="text-body text-ink-soft">{t("reports.tagline", { from, to })}</p>
      </header>
      <section className="rounded-brand border border-line px-4 py-3" data-testid="productivity-report">
        {rows.length === 0 ? (
          <p data-testid="empty-state" className="text-small text-ink-soft">{t("reports.empty")}</p>
        ) : (
          <table className="w-full text-small">
            <caption className="sr-only">{t("reports.title")}</caption>
            <thead className="text-left text-micro uppercase tracking-wider text-ink-soft">
              <tr>
                <th scope="col" className="py-1">{t("reports.assignee")}</th>
                <th scope="col" className="py-1">{t("reports.assignments")}</th>
                <th scope="col" className="py-1">{t("reports.completed")}</th>
                <th scope="col" className="py-1">{t("reports.approved")}</th>
                <th scope="col" className="py-1">{t("reports.rejected")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.assignee}>
                  <td className="py-1 text-ink">{row.assignee}</td>
                  <td className="py-1 text-ink-soft">{row.assignments}</td>
                  <td className="py-1 text-ink-soft">{row.completed}</td>
                  <td className="py-1 text-ink-soft">{row.inspectedApproved}</td>
                  <td className="py-1 text-ink-soft">{row.inspectedRejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
