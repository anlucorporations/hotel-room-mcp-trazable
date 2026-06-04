"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { TxStatus } from "@/components/tx/txStatus";

const TESTID: Partial<Record<TxStatus, string>> = {
  signing: "tx-signing",
  pending: "tx-pending",
  confirmed: "tx-confirmed",
  reverted: "tx-reverted",
};

/** Modal accesible con el estado de la transacción (RNF-19/20: foco, teclado, aria-live). */
export function TxModal({ status, onClose }: { status: TxStatus; onClose: () => void }) {
  const t = useTranslations("buy");
  const closeRef = useRef<HTMLButtonElement>(null);
  const isDone = status === "confirmed" || status === "reverted";
  const isOpen = status !== "idle";

  useEffect(() => {
    if (isOpen && isDone) closeRef.current?.focus();
  }, [isOpen, isDone]);

  useEffect(() => {
    if (!isOpen || !isDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, isDone, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" data-testid={TESTID[status]}>
        <h2 id="tx-modal-title" className="text-lg font-semibold">
          {t(`status.${status}`)}
        </h2>
        <p className="mt-2 text-sm text-slate-600" role="status" aria-live="polite">
          {t(`statusHint.${status}`)}
        </p>
        {isDone && (
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="mt-4 min-h-touch w-full rounded-md bg-slate-800 px-4 py-2 font-semibold text-white"
          >
            {t("close")}
          </button>
        )}
      </div>
    </div>
  );
}
