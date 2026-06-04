"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/** Estado degradado del catálogo cuando el RPC no responde (CU-04 04a). */
export function DegradedState() {
  const t = useTranslations("catalog");
  const router = useRouter();
  return (
    <div data-testid="degraded-state" className="rounded-md bg-amber-50 px-4 py-6 text-center text-amber-800">
      <p>{t("degraded")}</p>
      <button
        type="button"
        data-testid="retry"
        onClick={() => router.refresh()}
        className="mt-3 min-h-touch rounded-md bg-amber-700 px-4 py-2 font-semibold text-white"
      >
        {t("retry")}
      </button>
    </div>
  );
}
