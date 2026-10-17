# ADR-30 · Mensajes firmados legibles en la wallet

- **Estado:** aceptado.
- **Fecha:** 2026-10-17.
- **Ciclo:** C0 (RF-11 / RNF-19).
- **Contexto:** anteriormente las firmas mostraban datos opacos por dos motivos: `personal_sign`
  sobre una **huella** (`contentHash`, 32 bytes) y EIP-712 con **identificadores**
  (`tokenId`, `expiresAt` en epoch). La wallet es la última pantalla antes de autorizar: si no dice
  qué se firma, el usuario firma a ciegas y no puede detectar una petición maliciosa.

## Decisión

1. **Un módulo único de mensajes** en `packages/shared/src/domain/wallet-messages.ts`:
   - catálogo `WALLET_MESSAGE_SPECS` (una ficha por interacción: título llano, resumen, **qué NO
     autoriza**, método, campos, quién verifica y riesgo);
   - formateadores **deterministas** (`formatNightISO`, `formatNightLong`, `formatUtcTimestamp`,
     `formatCC`, `nightLabelForToken`) sin `toLocaleString` ni zonas horarias;
   - **EIP-712 v2** del resguardo (`TicketAuthorization`) y de la reseña (`ReviewAuthorization`) con
     campos legibles (`motivo`, `habitacion`, `noche`, `estrellas`, `nonce`, `validoHasta`) y
     `WALLET_DOMAIN_VERSION = "2"`;
   - texto llano de la **publicación de contenido** (`roomPublicationMessage`) que incluye la huella,
     la habitación, la hora UTC y el **dominio** (anti-phishing).
2. **Una función pura, dos constructores**: cliente y servidor construyen el mensaje con la **misma**
   función; el verificador lo reconstruye. Se prohíbe duplicar plantillas.
3. **Mensaje canónico en español** y determinista (el servidor no guarda el texto firmado).
4. **`validoHasta` sigue siendo numérico** en EIP-712: permite validar la vigencia de forma **sin
   estado**; la fecha legible de la noche va en `noche` y la app explica la vigencia en su revisión.
5. **No se cambian** las firmas que valida un **contrato desplegado** (`OperationalAction` de
   `HotelOperations`) sin ventana de redeploy: se documentan y se compensan con la revisión previa.
6. **Las transacciones no admiten texto libre** (la wallet pinta función/calldata): la revisión legible
   obligatoria en la app (ADR-11) + el copy catalogado son la mitigación.

## Consecuencias

- Cambiar un mensaje exige tocar **catálogo + prueba + este documento + documento de mensajes** en el
  mismo commit; el guardián `wallet-messages.test.ts` falla si falta una interacción o si un mensaje
  EIP-712 vuelve a usar identificadores opacos.
- El resguardo y la reseña pasan a **estructura v2**: firmante, verificadores y pruebas se actualizan
  de forma coordinada (plan de migración en `docs/MENSAJES-FIRMA-WALLET.md` §6). Las firmas pendientes
  de 5 minutos dejan de valer durante el despliegue (impacto asumido: son de un solo uso).
- Sin impacto on-chain ni de esquema (B6); no hay dependencias nuevas.
- Las operaciones vNext quedan con la firma opaca actual hasta la próxima ventana de contrato.

## Alternativas descartadas

- **Solo revisión en la app, sin cambiar la firma**: no cumple el objetivo (la wallet seguiría opaca).
- **Añadir un campo `descripcion` a `OperationalAction`**: rompe `ACTION_TYPEHASH` del contrato
  desplegado.
- **Firma multilingüe**: exige guardar el idioma junto al nonce y complica la reconstrucción
  determinista; se pospone.
- **Expiración como fecha ISO firmada**: más legible, pero obliga a parsear un valor firmado para la
  validación de vigencia; se valora para v3.

## Verificación

- `packages/shared/src/domain/wallet-messages.test.ts`: cobertura del catálogo, lenguaje llano,
  ausencia de identificadores opacos en EIP-712, determinismo de los formateadores y del texto de
  publicación, ventana de 5 minutos.
- `docs/MENSAJES-FIRMA-WALLET.md`: fichas, mensajes actuales vs propuestos, proceso y migración.
- Aceptación manual (pendiente): revisar cada pantalla de firma en MetaMask desktop y móvil
  (WalletConnect) — TC-ACC-004.
