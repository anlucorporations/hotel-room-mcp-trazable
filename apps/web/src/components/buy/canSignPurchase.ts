import type { TxStatus } from "@/components/tx/txStatus";

/**
 * Guarda única del botón «Firmar» de una compra (D3).
 *
 * Falla en cerrado por cuatro motivos independientes:
 *   1. la wallet no está lista (sin conectar o en otra red);
 *   2. la tx no pasó la re-verificación on-chain (precio / contrato / cadena);
 *   3. ya hay una operación EN CURSO (`signing`/`pending`): **anti-doble-envío**;
 *   4. el estado es terminal y no admite una firma directa (`confirmed`/`unverifiable`): tras
 *      confirmar o tras no poder leer el recibo, un re-render tardío no debe rehabilitar la firma.
 *
 * El punto 3 lo tenía el handoff del asistente (`PurchaseHandoff`) pero **no** el catálogo
 * (`BuyButton`): un segundo clic cursado antes del re-render podía enviar dos veces la misma
 * compra. La segunda revertiría (`NightNotAvailable`), pero la wallet enseñaría el fallo de una
 * noche que ya era del comprador — justo la confusión que la verificación 2026-10-09 documentó.
 *
 * Los recargos propios de cada flujo (p. ej. el saldo insuficiente del handoff) se añaden fuera:
 * aquí vive **una sola** verdad sobre wallet/verificación/estado, compartida por ambos y testeable
 * sin DOM.
 */
export function canSignPurchase(input: {
  readonly walletReady: boolean;
  readonly verified: boolean;
  readonly status: TxStatus;
}): boolean {
  if (!input.walletReady || !input.verified) return false;
  return (
    input.status !== "signing" &&
    input.status !== "pending" &&
    input.status !== "confirmed" &&
    input.status !== "unverifiable"
  );
}
