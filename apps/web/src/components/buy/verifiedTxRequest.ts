import { getAddress, type Address, type Hex } from "viem";
import { decodePurchaseTx, type PurchaseTxData } from "@hotel/shared/domain";

/**
 * Traducción del objeto **verificado** al request de firma (D-07, ADR-11, RNF-19).
 *
 * La decisión D-07 exige que la revisión construya el calldata y que la firma envíe **ese mismo
 * objeto**: ni reconstruido a partir de `(tokenId, price)`, ni vuelto a codificar con otro ABI.
 * Aquí se copian los tres únicos campos que viajan a la wallet —`to`, `data` y `value`— sin
 * tocar un byte del calldata y sin releer el precio. Lo que el usuario vio y se re-verificó
 * contra el precio on-chain es, literalmente, lo que firma.
 *
 * **Falla en cerrado** con tres comprobaciones independientes del llamante:
 *   1. el `data` decodifica como `buy`/`buyResale` (no se firma otra función);
 *   2. `to` es exactamente el contrato canónico esperado;
 *   3. el `value` es convertible a `bigint` (un valor malformado no se convierte en 0 silencioso).
 *
 * La comprobación (2) no es cosmética: el `buy(uint256)` de la generación legacy
 * (`HotelMarketplace`, ya **retirada del repositorio** en M9) tenía **el mismo selector** que el
 * canónico, así que aquel calldata era byte a byte idéntico al válido. Lo que separaba ambos
 * destinos era **la dirección**, y esa es la lección que queda: sin este chequeo, un llamante
 * nuevo que no pasara por la revisión firmaría contra el contrato equivocado sin que ninguna otra
 * verificación lo notara (hallazgo de la verificación adversarial de M4). El destino alternativo
 * puede reaparecer con cualquier otro contrato, no solo con el legacy.
 *
 * Es el punto único de firma que comparten el catálogo (`BuyButton`) y el asistente
 * (`PurchaseHandoff`), de modo que una regresión solo puede romper en un sitio.
 */
export interface VerifiedTxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

export function verifiedTxRequest(
  tx: PurchaseTxData,
  expectedContract: Address,
): VerifiedTxRequest {
  // 1. Guardián de forma: el firmante solo acepta compras verificables.
  decodePurchaseTx(tx.data);

  // 2. Guardián de destino: el único contrato canónico (el calldata NO distingue generaciones).
  if (getAddress(tx.to) !== getAddress(expectedContract)) {
    throw new Error(
      `El destino de la compra (${tx.to}) no es el contrato canónico (${expectedContract}).`,
    );
  }

  // 3. Guardián de importe: `BigInt` lanza si el valor no es un entero en wei.
  return { to: tx.to, data: tx.data, value: BigInt(tx.value) };
}
