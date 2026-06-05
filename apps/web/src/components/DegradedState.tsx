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
    <div
      data-testid="degraded-state"
      role="alert"
      className="flex flex-col items-center rounded-brand-lg border border-dashed border-line bg-sand-2 px-5 py-12 text-center"
    >
      <span aria-hidden="true" className="mb-3.5 text-sea opacity-60">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <p className="max-w-[40ch] text-ink-soft">{message ?? t("degraded")}</p>
      <button
        type="button"
        data-testid="retry"
        onClick={() => router.refresh()}
        className="mt-5 inline-flex min-h-touch items-center rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep"
      >
        {retryLabel ?? t("retry")}
      </button>
    </div>
  );
}
