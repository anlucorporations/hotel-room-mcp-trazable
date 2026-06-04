/**
 * Genera el plan de seed determinista (T0.3) y muestra un resumen.
 *
 * El catálogo (50×90) y los subconjuntos de ejemplo (vendidos/listados) se derivan de
 * `@hotel/shared/fixtures`. La aplicación on-chain (mint por el rol MINTER + ventas/listados
 * de ejemplo + prefinanciación de wallets por faucet) se realiza en F1/F2, cuando existen
 * `mint()/buy()/list()`.
 */
import { buildSeedPlan } from "@hotel/shared/fixtures";

// "Hoy" en UTC; el catálogo arranca al día siguiente para no generar noches pasadas.
const today = new Date();
const startDate = {
  year: today.getUTCFullYear(),
  month: today.getUTCMonth() + 1,
  day: today.getUTCDate() + 1,
};

const plan = buildSeedPlan({ startDate });

const summary = {
  startDate,
  totalNights: plan.nights.length,
  soldExamples: plan.soldTokenIds.length,
  listedExamples: plan.listedTokenIds.length,
  sample: plan.nights.slice(0, 3).map((night) => ({
    tokenId: night.tokenId.toString(),
    room: night.room,
    date: night.dateYYYYMMDD,
    type: night.roomType,
    priceWei: night.priceWei.toString(),
  })),
};

console.log(JSON.stringify(summary, null, 2));
console.log(
  "\nℹ Seed determinista y reproducible. La aplicación on-chain (mint 50×90, ventas/" +
    "listados de ejemplo, prefinanciación por faucet) se ejecuta en F1/F2.",
);
