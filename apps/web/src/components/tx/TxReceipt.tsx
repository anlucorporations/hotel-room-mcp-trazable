"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { txExplorerUrl } from "@/config/chain";

/** Acorta un hash 0x… para mostrarlo cuando no hay explorador (UX#2/#13). */
function shortenHash(hash: `0x${string}`): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/**
 * Recibo verificable de una transacción (UX#2/#8/#13/#14): si la cadena tiene explorador
 * configurado muestra un enlace «Ver transacción»; si no, degrada honestamente a hash acortado
 * + botón «Copiar». Genérico y reutilizable (compra, mint, listado…), sin copy de dominio.
 * `testId` por defecto `receipt` (estado «Hecho», esperado por el plan de pruebas §7); el
 * minado pasa otro id para no confundirse con el éxito.
 */
export function TxReceipt({
  hash,
  testId = "receipt",
}: {
  hash: `0x${string}`;
  testId?: string;
}) {
  const t = useTranslations("buy");
  const [copied, setCopied] = useState(false);
  const explorer = txExplorerUrl(hash);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles (contexto inseguro): el hash sigue visible para copiar a mano.
    }
  }

  return (
    <div
      data-testid={testId}
      className="mt-3 rounded-brand bg-mist-2 px-3 py-2 text-micro text-ink-soft"
    >
      <p className="font-semibold text-ink">{t("receipt")}</p>
      {explorer ? (
        <a
          data-testid="receipt-explorer"
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block break-all font-semibold text-azure underline hover:text-azure-deep"
        >
          {t("viewTransaction")}
        </a>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <code data-testid="receipt-hash" className="break-all">
            {shortenHash(hash)}
          </code>
          <button
            type="button"
            data-testid="receipt-copy"
            onClick={copy}
            className="shrink-0 rounded-brand border border-line px-2 py-1 font-semibold text-ink hover:bg-mist"
          >
            {copied ? t("copied") : t("copyHash")}
          </button>
        </div>
      )}
    </div>
  );
}
