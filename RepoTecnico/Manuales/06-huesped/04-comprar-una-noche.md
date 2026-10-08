# Comprar una noche al hotel

> El huésped elige una noche libre en el catálogo, revisa habitación, fecha e importe, y la firma con su cartera; desde ese momento la ficha es suya.

## Qué hace el sistema

La compra arranca en el botón de la tarjeta de la noche. Ese botón lo pinta la propia tarjeta y su etiqueta cambia según el estado del visitante: `Reservar` con cartera lista, `Conecta para reservar` si no hay conexión, `Cambia de red para reservar` si está en otra red e `Instala una wallet` si no hay ninguna (`apps/web/src/components/NightCard.tsx:140`; `apps/web/src/components/buy/BuyButton.tsx:117`).

Antes de abrir la revisión, el sistema comprueba el saldo de la cartera conectada. Si no llega al precio de la noche, bloquea el botón y explica cuánto falta, con el desglose de lo que tiene y lo que necesita (`apps/web/src/components/buy/BuyButton.tsx:52`, `:54`, `:141`).

Cuando el visitante está listo, el sistema construye los datos exactos de la transacción: destino, datos codificados y valor. La función que se llama es `buy` para la venta del hotel (`packages/shared/src/domain/purchase-tx.ts:35`, `:39`). El destino es siempre el contrato canónico (`apps/web/src/config/chain.ts:13`).

Después abre la ventana «Revisar tu reserva». Ahí no se enseña una promesa: se enseña la transacción **decodificada**. El sistema lee el identificador real del calldata, deriva la habitación y la fecha, y vuelve a leer el precio en la cadena antes de dejar firmar (`apps/web/src/components/buy/usePurchaseReview.ts:57`, `:72`, `:116`). La comprobación final compara destino, cadena, importe e identificador contra lo esperado (`packages/shared/src/domain/purchase-tx.ts:86`).

Hasta que la revisión no queda verificada, el botón «Confirmar y firmar» está deshabilitado: el sistema falla en cerrado y no firma nada que no haya verificado (`apps/web/src/components/buy/BuyButton.tsx:104`, `:250`).

La firma envía **exactamente el mismo objeto** que se revisó, sin reconstruirlo ni volver a leer el precio (`apps/web/src/components/buy/BuyButton.tsx:106`; `apps/web/src/components/buy/useBuyNight.ts:32`). Antes de firmar, un guardián vuelve a comprobar que el destino es el contrato canónico (`apps/web/src/components/buy/verifiedTxRequest.ts:35`, `:43`).

En la cadena, la compra primaria comprueba que la noche no esté vendida, que no se haya consumido con un check-in, que no esté expirada y que el importe sea **exactamente** el precio (`packages/contracts/src/HotelNights.sol:156`, `:158`, `:163`, `:164`, `:167`). Luego marca la noche como vendida, transfiere la ficha al comprador y paga el importe entero a la tesorería del hotel (`packages/contracts/src/HotelNights.sol:170`, `:179`, `:181`).

## Recorrido real

1. Abre `/catalogo` y busca la noche que quieras (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:38`).
2. Filtra si te hace falta por tipo, mes, precio máximo o número de habitación (`apps/web/src/components/CatalogClient.tsx:115`).
3. Pulsa `Reservar` en la tarjeta de esa noche (`apps/web/src/components/buy/BuyButton.tsx:117`).
4. Si no tienes la cartera conectada, el sistema te la pide; si estás en otra red, te ofrece cambiarla (`apps/web/src/components/buy/BuyButton.tsx:95`).
5. Si te falta saldo, verás «Te faltan {missing} {symbol} (tienes {have}, necesitas {need}).» y, si el grifo de pruebas está configurado, el botón para conseguir ETH de prueba (`apps/web/src/components/buy/BuyButton.tsx:141`; `apps/web/messages/es.json:298`).
6. Se abre la ventana **Revisar tu reserva** (`apps/web/messages/es.json:278`) con el aviso «Esto es lo que vas a firmar. Comprueba el importe y la noche antes de confirmar.» (`apps/web/messages/es.json:279`).
7. Comprueba las cinco líneas: `Habitación`, `Noche`, `Importe`, `Token` y `Contrato` (`apps/web/src/components/buy/PurchaseReviewDetails.tsx:18`).
8. Espera a que termine la verificación. Mientras dura, se ve «Verificando el precio on-chain…» con un indicador de carga (`apps/web/src/components/buy/BuyButton.tsx:172`; `apps/web/messages/es.json:287`).
9. Pulsa `Confirmar y firmar` (`apps/web/src/components/buy/BuyButton.tsx:258`; `apps/web/messages/es.json:285`).
10. Firma en tu cartera. La ventana pasa por tres estados: «Confirma en tu wallet», «Reservando tu noche…» y «¡Noche reservada!» (`apps/web/src/components/buy/TxModal.tsx:175`; `apps/web/messages/es.json:300`, `:301`, `:302`).
11. Al terminar, verás el recibo con el enlace o el identificador de la transacción y el botón `Ver en Mis noches` (`apps/web/src/components/tx/TxReceipt.tsx:19`; `apps/web/src/components/buy/BuyButton.tsx:265`).
12. En `/mis-noches`, la noche aparece con la etiqueta `Tuya` (`apps/web/src/components/my-nights/MyNightCard.tsx:115`).

## Piezas de código implicadas

- Botón y flujo de compra: `apps/web/src/components/buy/BuyButton.tsx:30`, `:52`, `:95`, `:104`, `:106`, `:117`, `:141`, `:250`, `:258`, `:265`.
- Revisión decodificada: `apps/web/src/components/buy/usePurchaseReview.ts:57`, `:66`, `:72`, `:85`, `:96`, `:122`, `:125`, `:129`.
- Detalle que ve el huésped: `apps/web/src/components/buy/PurchaseReviewDetails.tsx:13`, `:18`.
- Firma y envío: `apps/web/src/components/buy/useBuyNight.ts:28`, `:32`; `apps/web/src/components/buy/verifiedTxRequest.ts:35`, `:43`.
- Construcción y verificación de la transacción: `packages/shared/src/domain/purchase-tx.ts:35`, `:39`, `:59`, `:86`.
- Re-verificación en cliente: `apps/web/src/components/assistant/reverify.ts:38`.
- Modal de la operación: `apps/web/src/components/buy/TxModal.tsx:99`, `:120`, `:123`, `:141`.
- Recibo: `apps/web/src/components/tx/TxReceipt.tsx:19`.
- Compra en el contrato: `packages/contracts/src/HotelNights.sol:156`, `:158`, `:167`, `:170`, `:179`, `:181`.
- Errores del contrato: `packages/contracts/src/IHotelNights.sol:67`, `:68`, `:70`.
- Destino canónico: `apps/web/src/config/chain.ts:13`, `:17`.

## Datos y estados

- **Objeto de la transacción** (`PurchaseTxData`): destino, datos, valor en wei y `chainId` (`packages/shared/src/domain/purchase-tx.ts:19`).
- **Datos de la revisión** (`PurchaseReview`): identificador real, habitación, fecha, tipo, destino, importe en wei, si es reventa, resultado de la re-verificación, si está verificada, si está verificando, si falló la verificación y el estado de venta previa (`apps/web/src/components/buy/usePurchaseReview.ts:20`).
- **Estados de la operación** (`TxStatus`): `idle`, `signing`, `pending`, `confirmed`, `reverted` (`apps/web/src/components/tx/txStatus.ts:2`). En la ventana, el paso previo es `review` (`apps/web/src/components/buy/TxModal.tsx:12`).
- **Campos de la ventana de revisión:** `Habitación`, `Noche`, `Importe`, `Token`, `Contrato` (`apps/web/messages/es.json:280`, `:281`, `:282`, `:283`, `:284`).
- **Mensajes reales:**
  - «Te faltan {missing} {symbol} (tienes {have}, necesitas {need}).» (`apps/web/messages/es.json:298`).
  - «Has cancelado la firma. Puedes intentarlo de nuevo cuando quieras.» (`apps/web/messages/es.json:312`).
  - «No se pudo completar la reserva. Revisa que estés en la red correcta y vuelve a intentarlo.» (`apps/web/messages/es.json:313`).
  - «El precio de esta noche acaba de cambiar; por tu seguridad no la firmamos con un importe antiguo. Vuelve a abrir la reserva.» (`apps/web/messages/es.json:286`).
  - «No pudimos verificar el precio on-chain. Comprueba tu conexión a la red e inténtalo de nuevo.» + botón `Reintentar verificación` (`apps/web/messages/es.json:288`, `:289`).
  - «Esta noche ya está vendida. Elige otra noche del catálogo.» + enlace `Elegir otra noche` (`apps/web/messages/es.json:315`, `:316`).
  - «No se completó la reserva» y «No se realizó ningún cargo. Puedes intentarlo de nuevo.» (`apps/web/messages/es.json:303`, `:309`).
  - «No se cobrará nada hasta que firmes.» (`apps/web/messages/es.json:290`).
  - «Puedes cerrar: la reserva continúa y aparecerá en «Mis noches».» (`apps/web/messages/es.json:296`).
- **Errores del contrato al comprar:** `NightNotAvailable`, `NightExpired`, `IncorrectPayment` (`packages/contracts/src/IHotelNights.sol:68`, `:67`, `:70`).
- **Una sola venta primaria.** La marca de venta previa impide vender dos veces la misma noche (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- **Sin royalty en la primaria.** El importe entero va a la tesorería del hotel (`packages/contracts/src/HotelNights.sol:181`).

## Casos límite y errores

- **Sin saldo.** Botón bloqueado y mensaje con la cantidad exacta que falta; si hay grifo, se puede pedir ETH de prueba ahí mismo (`apps/web/src/components/buy/BuyButton.tsx:141`).
- **Precio cambiado.** Si el precio de la cadena ya no es el de la revisión, la firma queda deshabilitada y se explica el motivo (`apps/web/src/components/buy/usePurchaseReview.ts:148`).
- **No se pudo leer el precio.** Si falla la lectura de la cadena, se distingue del precio cambiado y se ofrece `Reintentar verificación` (`apps/web/src/components/buy/usePurchaseReview.ts:125`; `apps/web/src/components/buy/BuyButton.tsx:186`).
- **Noche ya vendida.** El sistema lee si la noche tuvo venta previa; si es así, avisa y ofrece elegir otra, en lugar de culpar a la conexión del huésped (`apps/web/src/components/buy/usePurchaseReview.ts:129`; `apps/web/src/components/buy/BuyButton.tsx:191`).
- **Firma cancelada.** Al cerrar la cartera no se cobra nada; el estado vuelve a la revisión y se puede reintentar (`apps/web/src/components/tx/txError.ts:26`; `apps/web/messages/es.json:312`).
- **Transacción revertida.** Se muestra el mensaje de fallo, se ofrece reintentar y el recibo sigue disponible durante el minado (`apps/web/src/components/buy/TxModal.tsx:228`, `:254`).
- **Noche expirada.** La cadena rechaza la compra de una noche cuya fecha pasó (`packages/contracts/src/IHotelNights.sol:67`).
- **Contrato en pausa.** Las tarjetas retiran el botón de compra y muestran «Ventas en pausa» (`apps/web/src/components/NightCard.tsx:132`).
- **Cerrar durante la firma.** La ventana no se puede cerrar mientras la cartera está firmando; durante el minado sí, y la reserva continúa (`apps/web/src/components/buy/TxModal.tsx:120`; `apps/web/messages/es.json:296`).
- **No confundir flujos.** El botón `Reservar` de la tarjeta compra la ficha de una noche. La entrada «Reservar» del menú abre `/reservar`, un flujo distinto de reserva de estancia con anticipo por transferencia (`apps/web/src/components/reserve/ReserveFlow.tsx:52`).
- **Red de pruebas.** La compra funciona sobre una red de pruebas; no es venta al público todavía (`docs/manual-comprador.md:257`).

## Referencias

- CU-05 · Comprar una noche al hotel (`docs/Manuales/05-casos-de-uso/04-ventas/CU-05-compra-primaria.md:1`).
- CU-04 · Ver y filtrar las noches disponibles (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-04-catalogo.md:1`).
- CU-17 · Conectar la cartera y ponerse en la red correcta (`docs/Manuales/05-casos-de-uso/03-onboarding-y-descubrimiento/CU-17-onboarding-web3.md:1`).
- Guía del comprador, apartados 3 y 4 (`docs/manual-comprador.md:63`, `:125`).
- ADR-01 · Red canónica local y contrato único (`docs/adr/ADR-01-red-y-contrato-canonicos.md:1`).
- ADR-11 · Nunca se firma una transacción no verificada (`docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md:1`).
- ADR-16 · Una sola venta primaria por noche (`docs/adr/ADR-16-venta-primaria-unica.md:1`).
- SRS §7 (interfaz y accesibilidad) y §9 (catálogo de casos de uso) (`docs/SRS.md:306`, `:342`).
- RF-12 y RNF-19 (`packages/shared/src/domain/purchase-tx.ts:12`; `apps/web/src/components/assistant/reverify.ts:4`).
