import type { PurchaseTxData } from "@hotel/shared/domain";
import type { PreparedPurchase } from "./types";

/**
 * **Estancia de varias noches** (petición del responsable, 2026-10-13: «no se realizan la reserva en
 * rango de fechas»).
 *
 * El MCP devuelve, para `prepareStayTx`, un plan con **una tx por noche** en una misma habitación.
 * Este módulo es la pieza **pura** que traduce ese resultado —no confiable, viene de otro servicio—
 * a la lista de compras preparadas que el orquestador valida una a una, y que mezcla las compras de
 * varias herramientas del turno sin repetir noches.
 *
 * Criterio **todo o nada**: si el plan llega incompleto o con una noche mal formada, se descarta
 * entero. El huésped no debe firmar media estancia creyendo que firma la estancia entera.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** ¿Tiene forma de transacción de compra? El contenido real lo re-verifica `validatePreparedTx`. */
function isPurchaseTxData(value: unknown): value is PurchaseTxData {
  if (!isRecord(value)) return false;
  return (
    typeof value.to === "string" &&
    typeof value.data === "string" &&
    typeof value.value === "string" &&
    typeof value.chainId === "number"
  );
}

/** Noches comprables de un plan de estancia; `null` si alguna no tiene forma esperada. */
function stayNightsOf(value: unknown): PreparedPurchase[] | null {
  if (!isRecord(value) || !Array.isArray(value.nights)) return null;
  const purchases: PreparedPurchase[] = [];
  for (const night of value.nights) {
    const purchase = purchaseOf(night);
    if (purchase === null) return null;
    purchases.push(purchase);
  }
  return purchases;
}

/**
 * Compras de un plan de estancia (`prepareStayTx`). Devuelve `[]` —y el turno queda sin compra— si
 * el plan no tiene forma o **no trae ninguna noche**: nunca se ofrece un plan vacío ni parcial.
 */
export function stayPurchasesFrom(value: unknown): PreparedPurchase[] {
  const purchases = stayNightsOf(value);
  return purchases === null || purchases.length === 0 ? [] : purchases;
}

/** Normaliza una compra suelta (`{ tokenId, tx }`); `null` si no tiene forma. */
function purchaseOf(value: unknown): PreparedPurchase | null {
  if (!isRecord(value)) return null;
  const rawToken = value.tokenId;
  const tokenId = typeof rawToken === "string" || typeof rawToken === "number" ? String(rawToken) : null;
  if (tokenId === null || !isPurchaseTxData(value.tx)) return null;
  return { tokenId, tx: value.tx };
}

/**
 * Compras preparadas de una respuesta del API, **normalizadas** (no se confía en el cliente ni en
 * datos de otra versión): acepta la lista nueva (`preparedPurchases`) y, si no llega, la compra
 * suelta de siempre (`preparedPurchase`). Así el formato de estancia y el de una noche conviven.
 */
export function sanitizePreparedPurchases(batch: unknown, single: unknown): PreparedPurchase[] {
  if (Array.isArray(batch)) {
    const purchases = batch.map(purchaseOf);
    // Todo o nada también al leer: si UNA entrada viene mal, no se ofrece la lista a medias (el
    // huésped firmaría una estancia incompleta sin saberlo). Se cae a la compra suelta si existe.
    if (purchases.length > 0 && purchases.every((purchase): purchase is PreparedPurchase => purchase !== null)) {
      return mergePreparedPurchases([], purchases);
    }
  }
  const one = purchaseOf(single);
  return one === null ? [] : [one];
}

/**
 * Acumula las compras preparadas de un turno sin repetir `tokenId` (varias herramientas pueden
 * aportar noches) y conservando el orden de llegada: las primeras noches de la estancia, primero.
 */
export function mergePreparedPurchases(
  current: readonly PreparedPurchase[],
  incoming: readonly PreparedPurchase[],
): PreparedPurchase[] {
  const byToken = new Map<string, PreparedPurchase>();
  for (const purchase of [...current, ...incoming]) {
    if (!byToken.has(purchase.tokenId)) byToken.set(purchase.tokenId, purchase);
  }
  return [...byToken.values()];
}
