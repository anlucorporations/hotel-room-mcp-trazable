import { getTranslations } from "next-intl/server";
import { TerminalReportForm } from "@/components/terminal/TerminalReportForm";

export const dynamic = "force-dynamic";

/** Reporte de avería desde el terminal (F5 · T5.2). */
export default async function TerminalReportPage() {
  const t = await getTranslations("terminal");
  return (
    <>
      <h1 className="font-display text-h3 font-semibold text-ink">{t("reportTitle")}</h1>
      <TerminalReportForm />
    </>
  );
}
