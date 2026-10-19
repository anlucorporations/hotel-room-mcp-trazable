import { getTranslations } from "next-intl/server";
import { TerminalBoard } from "@/components/terminal/TerminalBoard";

export const dynamic = "force-dynamic";

/** Tablero del terminal (F5 · T5.1): mis tareas e incidencias asignadas. */
export default async function TerminalPage() {
  const t = await getTranslations("terminal");
  return (
    <>
      <h1 className="font-display text-h3 font-semibold text-ink">{t("boardTitle")}</h1>
      <TerminalBoard />
    </>
  );
}
