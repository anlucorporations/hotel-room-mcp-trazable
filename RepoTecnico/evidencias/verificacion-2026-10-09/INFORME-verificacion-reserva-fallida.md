# Verificación — «al hacer una reserva la wallet da la transacción por fallida, pero la plataforma la agrega a Mis noches»

- **Fecha:** 2026-10-09
- **Alcance:** compra de una noche en el catálogo (`BuyButton` → `useBuyNight` → `HotelNights.buy`/`buyResale`) y el origen de datos de la página `/mis-noches` (`useMyNights`).
- **Método:** trazado del código + **reproducción ejecutable** contra un nodo Anvil con el contrato **real** `HotelNights` y las **mismas librerías** del cliente (`viem@2.52.0`, `wagmi@2.19.5` / `@wagmi/core@2.22.1`), incluyendo el código real de la app (`buildPurchaseTxData`, `verifiedTxRequest`, `deriveTxStatus`).
- **Evidencia cruda:** [`verificacion-reserva-fallida.json`](./verificacion-reserva-fallida.json)

---

## 0. Caso concreto aportado por el usuario — la transacción **SE ASENTÓ**

Datos aportados: tx `0xe281c5f13f73acb5e084a3d2cf26ba16a1e3f7903b20b2de31403cff8cc357fc` · wallet `0x7e42E367dEc8621F4b76B4340E41fc220aAC4eB8`. Consultados contra el **Anvil de producción** (`https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app`, chainId 31337) y el contrato `0xC66AB83418C20A65C3f8e83B3d11c8C3a6097b6F` (el `NEXT_PUBLIC_CONTRACT_ADDRESS` de la web).

| Comprobación | Resultado |
|---|---|
| `receipt.status` | **`1` (success)** |
| Bloque / hora | 502 · 2026-10-09 22:29:18 UTC (nonce 1) |
| `input` | `0xd96a094a…` = **`buy(uint256)`** → tokenId **`10120261011`** (habitación **101**, **2026-10-11**) |
| `value` | 0,05 ETH · evento `Sale` con `price` 0,05 ETH y `saleType` 0 (PRIMARY) |
| Log `Sale` (`0x68481077…`) | seller `0xf39F…` (tesorería) · **buyer `0x7e42E367…` (la wallet del usuario)** |
| Log `Transfer` (ERC-721) | `0xf39F…` → **`0x7e42E367…`** · tokenId `10120261011` |
| `ownerOf(10120261011)` | **`0x7e42E367dEc8621F4b76B4340E41fc220aAC4eB8`** (la wallet del usuario) |
| `soldOnce(10120261011)` | `true` |
| `balanceOf(wallet)` | **2** noches |

Y la transacción **inmediatamente anterior** de la misma wallet también se asentó:

| | tx `0xf600eb880af9b431d9f30298165db096c2bb2fc9ea80b7a363e14cb111cf9b78` |
|---|---|
| Bloque / hora | 501 · 2026-10-09 22:22:11 UTC (nonce 0) |
| `buy(…)` → tokenId | **`10120261009`** (habitación **101**, **2026-10-09**) |
| `receipt.status` | **`1` (success)** · `Sale` buyer = `0x7e42E367…` · `ownerOf` = `0x7e42E367…` |

El barrido de bloques de la wallet (fondos en el bloque 500; `nonce` actual = 2) muestra que **sus dos únicas transacciones en cadena son esas dos compras y ambas terminaron en `success`**. No hay ninguna compra revertida de esa wallet en la cadena.

**Conclusión del caso concreto:** la noche que el usuario vio en «Mis noches» **es suya de verdad** (evento `Sale` + `ownerOf`), así que la plataforma hizo lo correcto; lo que falló fue el **reporte de la wallet** (falso negativo) — exactamente la explicación nº 1 del §4. Esto **confirma** la verificación estructural: una compra revertida no llega a «Mis noches», y esta compra no revirtió.

---

## 1. Veredicto

**El comportamiento reportado no se reproduce como defecto de la plataforma.**

Una compra **revertida**:

1. la cadena la marca `reverted`,
2. wagmi/viem **hacen fallar** la consulta del recibo (no la resuelven con éxito),
3. la app la clasifica como `reverted` («No se completó la reserva»), y
4. **no** emite el evento `Sale` ni cambia `ownerOf`, que son las **dos únicas** fuentes de `/mis-noches`.

Por tanto, **una noche cuya compra revirtió no puede aparecer en «Mis noches»**. Si la noche está en la lista, la transacción **sí se asentó en la cadena**: lo que falló fue el *reporte de la wallet* (o se trataba de otra transacción).

---

## 2. Evidencia (reproducción on-chain, contrato real)

Contrato `HotelNights` desplegado en Anvil, habitación 999, noches `99920261220` y `99920261221`, precio 0,1 ETH. La transacción se construye con el **mismo** calldata verificado que firma la web.

| # | Caso | `receipt.status` (cadena) | `waitForTransactionReceipt` (wagmi) | `deriveTxStatus` (app) | Evento `Sale` | `ownerOf` | ¿Aparece en «Mis noches»? |
|---|------|---------------------------|-------------------------------------|------------------------|---------------|-----------|---------------------------|
| A | Compra con **pago incorrecto** (revierte) | `reverted` | **lanza** | `reverted` | **no** | tesorería | **NO** |
| B | Compra **correcta** | `success` | resuelve | `confirmed` | **sí** (`buyer`) | comprador | **SÍ** |
| C | **Reintento** sobre la noche ya vendida | `reverted` | lanza | `reverted` | no | comprador anterior | **NO** |

Hashes (Anvil, contrato `0x0b306bf915c4d645ff596e518faf3f9669b97016`):

- A — pago incorrecto (0,1 ETH − 1 wei): `0x28b1bb1c8100ba636f858dcf08e8558ea242b1a44e8b05b76afc02b72a47af9b`
- B — compra correcta: `0x124f49de1d602de549c28f6405e397d2a95115153de5d2a928af03a8747757e4`
- C — reintento sobre vendida: `0xeb357981e9cf932eb5e1e54320ed93a2db5aa5121cb1c46a22fd9cb48f1a34e9`

En el caso A, wagmi lanzó exactamente:

```
Execution reverted with reason: custom error 0x0d35e921: … (IncorrectPayment)
```

---

## 3. Por qué es estructuralmente imposible que una compra revertida se añada a «Mis noches»

### 3.1 `/mis-noches` solo lee la cadena

`apps/web/src/components/my-nights/useMyNights.ts`:

1. **Candidatas:** eventos `Sale` con `buyer = <tu wallet>` (`paginatedSaleLogs`).
2. **Confirmación de propiedad:** `ownerOf(tokenId) === <tu wallet>` (`ownsToken`).

No hay índice off-chain, ni caché optimista, ni escritura en base de datos camino de esa página.

### 3.2 Una transacción revertida no deja rastro

En `HotelNights.buy` (y `buyResale`) el `emit Sale` y la transferencia del NFT viven en la **misma transacción**. Si algo revierte (`NightNotAvailable`, `IncorrectPayment`, `NightExpired`, `EnforcedPause`…), la EVM revierte **todo**, incluidos los *logs*. Por eso el caso A no tiene `Sale` y `ownerOf` sigue siendo la tesorería.

### 3.3 La app sí distingue el revert

`apps/web/src/components/buy/useBuyNight.ts` traduce la consulta del recibo a las señales de `deriveTxStatus`:

```ts
const receipt = useWaitForTransactionReceipt({ hash });
const status = deriveTxStatus({
  isPending,
  hash,
  isConfirming: receipt.isLoading,
  isConfirmed: receipt.isSuccess,
  isReverted: receipt.isError,
});
```

Y **`@wagmi/core` rechaza las transacciones revertidas**: su acción `waitForTransactionReceipt` comprueba `receipt.status === 'reverted'`, recupera el motivo y **lanza** (`node_modules/@wagmi/core/dist/esm/actions/waitForTransactionReceipt.js`). Verificado con Anvil en el caso A. Por eso `isError = true` y `deriveTxStatus` devuelve `reverted` (el orden del `if` que pone `isConfirmed` antes que `isReverted` **no** llega a morder: `isSuccess` es `false`).

En esa fase la UI muestra: **«No se completó la reserva»** + «No se realizó ningún cargo. Puedes intentarlo de nuevo.» (`apps/web/messages/es.json`, namespace `buy.status`/`buy.statusHint`).

---

## 4. Qué pudo ver el usuario (explicaciones compatibles con lo observado)

1. **La transacción sí se asentó y la wallet mostró un falso negativo** (RPC propio desincronizado, nonce, *speed-up* en la wallet, o un error de la wallet al difundir). La plataforma refleja la cadena y por eso la noche está en «Mis noches». Es la explicación más probable cuando **la noche aparece de verdad** — y es la que **confirma el caso concreto del §0**.
2. **Dos intentos del mismo huésped:** el primero se asentó (noche adquirida) y el segundo revirtió por `NightNotAvailable`. La wallet enseña el fallo del segundo, mientras «Mis noches» muestra la noche del primero. Conducta correcta de la plataforma, pero confusa.
3. **Se vio el aviso de éxito, no la lista real.** El modal, al confirmar, dice «La noche ya es tuya. Aparecerá en «Mis noches»»; durante el minado dice «Puedes cerrar: la reserva continúa y aparecerá en «Mis noches»». Es un *aviso*, no la lista.
4. **Reserva con retención (F6, `/reservar`):** esa ruta **crea una retención en base de datos sin ninguna transacción de wallet** (D-35) y no alimenta `/mis-noches`; su pago se concilia aparte (anticipo por transferencia + compra del token).

---

## 5. Defectos reales encontrados y su arreglo

| # | Sev. | Hallazgo | Estado |
|---|------|----------|--------|
| D1 | Media | En el paso «revertido» la app **descartaba el motivo** del fallo: `useBuyNight` exponía el `error` de `useSendTransaction` (nulo en un revert) y **no** el del recibo, así que el huésped veía un mensaje genérico en vez de «esta noche ya está vendida» / «importe incorrecto». | **ARREGLADO** · `buyOutcome.ts` (`buyErrorMessage`) + `useBuyNight` expone `failureKey`; `BuyButton`/`PurchaseHandoff` lo pintan. |
| D2 | Media | El éxito se derivaba **solo** de `receipt.isSuccess`. Si la wallet **reemplaza/cancela** la tx, viem resuelve el recibo del **reemplazo** y la app podía anunciar «¡Noche reservada!» de una operación que no compró la noche. | **ARREGLADO** · `receiptConfirmsNight` exige el evento `Transfer` del contrato canónico para el `tokenId` firmado; si no, `reverted` + `buyError.replaced`. |
| D3 | Baja | `BuyButton` no incluía `busy` en su guarda de firma (el handoff del asistente sí), lo que dejaba una ventana de doble envío de la misma compra. | **ARREGLADO** · `canSignPurchase` (pieza pura) compartida por catálogo y asistente: sin wallet lista, sin re-verificación o con una operación en curso (`signing`/`pending`) o terminal (`confirmed`/`unverifiable`) no se firma. |
| D4 | Baja | El aviso «puedes cerrar… aparecerá en «Mis noches»» durante el minado prometía algo que no se cumple si la tx revierte. | **ARREGLADO** · copy condicional y honesto en ES/EN/RU (catálogo y asistente): «la transacción sigue en la red. Si se confirma, la noche aparecerá en «Mis noches»; si falla, no se te cobrará nada». |
| D5 | Media | Cualquier error de la consulta del recibo se traducía a `reverted`: un fallo **transitorio** del RPC decía «No se completó la reserva» de una compra que **sí** se asentó. Era la variante que reproduce el reporte **dentro de la propia app**. | **ARREGLADO** · `classifyReceiptError` separa revert (error con motivo) de fallo de lectura; nuevo estado `TxStatus = "unverifiable"` con su copy y acciones («Comprobar de nuevo» + «Ver en Mis noches»), sin volver a firmar. |

### 5.1 Qué cambió (D1 + D2 + D3 + D4 + D5)

| Fichero | Cambio |
|---|---|
| `apps/web/src/components/buy/buyOutcome.ts` **(nuevo)** | Pieza pura: `buyErrorMessage` (D1), `classifyReceiptError` (D5), `receiptConfirmsNight` (D2) y `classifyBuyOutcome` (estado + motivo). |
| `apps/web/src/components/buy/useBuyNight.ts` | Consume `classifyBuyOutcome`; expone `failureKey` y `retryReceipt` (releer el recibo **sin** volver a firmar). |
| `apps/web/src/components/tx/txStatus.ts` | Nuevo estado `unverifiable` + señal opcional `isUnverifiable` (retrocompatible: quien no la pasa no cambia). |
| `apps/web/src/components/buy/TxModal.tsx` | Fase `unverifiable` con su testid (`tx-unverifiable`), aviso propio y acciones de error. |
| `apps/web/src/components/buy/BuyButton.tsx` | Pinta el motivo real; en `unverifiable` ofrece «Comprobar de nuevo» + «Ver en Mis noches» en lugar de reintentar la firma. |
| `apps/web/src/components/assistant/PurchaseHandoff.tsx` | Deja de duplicar la lógica: usa `useBuyNight` (misma clasificación) y colapsa la firma en `unverifiable`. |
| `apps/web/messages/{es,en,ru}.json` | `buy.status.unverifiable`, `buy.statusHint.unverifiable`, `buy.recheckReceipt` y `buy.buyError.*` (paridad ES/EN/RU verificada). **D4:** `buy.pendingClosable` y `assistant.handoff.pendingClosable` pasan a un condicional honesto. |
| `apps/web/src/components/buy/buyOutcome.test.ts` **(nuevo)** | 15 pruebas herméticas de D1/D2/D5 y de los estados. |
| `apps/web/src/components/buy/canSignPurchase.ts` **(nuevo)** | D3: guarda pura de firma (wallet + verificación + estado) compartida por catálogo y asistente. |
| `apps/web/src/components/buy/canSignPurchase.test.ts` **(nuevo)** | Pruebas de la guarda (anti-doble-envío y fallo cerrado). |
| `apps/web/src/components/buy/revertedReceipt.test.ts` | Regresión de la frontera (recibo revertido ⇒ la consulta de wagmi rechaza ⇒ `reverted`). |

---

## 6. Recomendación

- **Caso concreto: CERRADO** (ver §0). Las dos transacciones de la wallet se asentaron en la cadena; la noche es suya y «Mis noches» la muestra correctamente. El «fallo» lo reportó la wallet, no la plataforma.
- **D1 + D2 + D3 + D4 + D5: ARREGLADOS** en este ciclo (§5.1), con pruebas herméticas y la suite web en verde. El comportamiento visible del reporte no cambia cuando la cadena responde bien; lo que cambia es que la app ya no puede (a) perder el motivo del fallo, (b) dar por comprada una transacción que la red no confirma como compra, (c) declarar «no se completó» cuando en realidad **no pudo leer** el recibo, (d) firmar dos veces la misma compra, ni (e) prometer que la noche aparecerá pase lo que pase.
- **No quedan defectos abiertos** de esta verificación.

---

## 7. Reproducibilidad

La reproducción on-chain es autocontenida (solo necesita un nodo Anvil):

```bash
anvil --port 8545 --chain-id 81234                       # terminal 1
cd apps/web && ./node_modules/.bin/tsx scripts/verify-reserva-fallida.mts
```

El script despliega su propio `HotelNights`, mintea dos noches y comprueba A/B/C; termina con
código de salida ≠ 0 si alguna aserción falla y reescribe la evidencia JSON. El `@wagmi/core` que
consume la app se comprobó además sobre una transacción real revertida (ver §2, caso A). La prueba
de regresión hermética de esa frontera vive en
`apps/web/src/components/buy/revertedReceipt.test.ts`.
