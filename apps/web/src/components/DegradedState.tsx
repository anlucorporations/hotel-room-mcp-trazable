"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Estado degradado reutilizable cuando una fuente (RPC/worker) no responde (CU-04/09/11).
 * Por defecto usa los textos del catálogo; cada página puede pasar los suyos.
 */
export function DegradedState({
  message,
  retryLabel,
}: {
  message?: string;
  retryLabel?: string;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  return (
    <div data-testid="degraded-state" className="rounded-md bg-amber-50 px-4 py-6 text-center text-amber-800">
      <p>{message ?? t("degraded")}</p>
      <button
        type="button"
        data-testid="retry"
        onClick={() => router.refresh()}
        className="mt-3 min-h-touch rounded-md bg-amber-700 px-4 py-2 font-semibold text-white"
      >
        {retryLabel ?? t("retry")}
      </button>
    </div>
  );
}
