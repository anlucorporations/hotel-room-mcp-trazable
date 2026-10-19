"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChangePinForm } from "@/components/terminal/TerminalLogin";

/** Rotación de PIN desde el propio terminal (F5 · T5.3). */
export default function TerminalChangePinPage() {
  const router = useRouter();
  const t = useTranslations("terminal");
  return (
    <>
      <h1 className="font-display text-h3 font-semibold text-ink">{t("changePinTitle")}</h1>
      <ChangePinForm onDone={() => router.push("/terminal")} />
    </>
  );
}
