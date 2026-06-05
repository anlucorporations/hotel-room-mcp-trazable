"use client";

import { useTranslations } from "next-intl";
import { useFaucet } from "./useFaucet";
import { useOnboarding } from "./useOnboarding";

const TOUCH = "min-h-touch min-w-touch";
const BTN =
  `${TOUCH} rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60`;

/** Formatea un epoch (s) como hora local HH:MM (cuándo estará disponible el faucet). */
function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Botón «Conseguir ETH de prueba» (RF-21 / CU-PR-01, UX#3). Solo se renderiza cuando el
 * faucet está configurado y la wallet está conectada en la red correcta — fuera de ahí (E2E
 * hermético, producción) devuelve `null` y no aparece nada. El resultado se anuncia por
 * `aria-live` (RNF-01); el área táctil cumple ≥44px.
 */
export function FaucetButton() {
  const t = useTranslations("faucet");
  const { isConnected, isWrongNetwork } = useOnboarding();
  const { enabled, availability, cooldownUntil, canDispense, isDispensing, status, dispense } =
    useFaucet();

  // Honestidad: nada de faucet si no está habilitado o la wallet no está lista en la red.
  if (!enabled || !isConnected || isWrongNetwork) return null;

  const label = isDispensing
    ? t("dispensing")
    : availability.kind === "empty"
      ? t("emptyShort")
      : t("get");

  // Mensaje accionable según el estado (se anuncia por aria-live).
  let message: string | null = null;
  let tone: "ok" | "warn" = "ok";
  if (status === "confirmed") {
    message = t("success");
  } else if (availability.kind === "empty") {
    message = t("empty");
    tone = "warn";
  } else if (availability.kind === "cooldown" && cooldownUntil !== null) {
    message = t("cooldown", { time: formatTime(cooldownUntil) });
    tone = "warn";
  } else if (status === "reverted" && cooldownUntil !== null) {
    message = t("cooldown", { time: formatTime(cooldownUntil) });
    tone = "warn";
  } else if (status === "reverted") {
    message = t("error");
    tone = "warn";
  }

  return (
    <div data-testid="faucet" className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="faucet-dispense"
        onClick={dispense}
        disabled={!canDispense}
        aria-disabled={!canDispense}
        aria-busy={isDispensing}
        className={BTN}
      >
        {label}
      </button>
      <p
        data-testid="faucet-status"
        role="status"
        aria-live="polite"
        className={`text-small ${tone === "warn" ? "text-terracotta-text" : "text-ink-soft"}`}
      >
        {message}
      </p>
    </div>
  );
}
