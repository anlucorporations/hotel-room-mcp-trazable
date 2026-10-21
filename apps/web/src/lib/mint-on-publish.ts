/**
 * Feature flag de **publicación con minteo on-chain** (2026-10-21, D-85).
 *
 * Con `MINT_ON_PUBLISH_ENABLED=true`, los endpoints de publicar (unitario y masivo) dejan un job en
 * `room_mint_jobs` y responden `202 PENDING_ONCHAIN`; el worker relayer registra la habitación,
 * ancla la huella y mintea la primera noche, y **solo entonces** la deja `PUBLISHED`.
 *
 * Sin la variable (o con cualquier otro valor) se mantiene el flujo anterior: publicación off-chain
 * inmediata y anclaje opcional desde la wallet del navegador. Así el cambio es reversible sin
 * desplegar si algo falla (RUNBOOK §9.5).
 */
export function isMintOnPublishEnabled(): boolean {
  return process.env.MINT_ON_PUBLISH_ENABLED === "true";
}
