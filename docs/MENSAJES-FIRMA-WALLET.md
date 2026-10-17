# Mensajes de firma y autorización en la wallet

> **Ciclo C0 · RF-11 / RNF-19 · ADR-30.** Este documento inventaría **todo** lo que el proyecto
> pide firmar o autorizar a una wallet, con el mensaje que ve hoy el usuario, el problema, el mensaje
> propuesto en lenguaje llano y el proceso para que la wallet muestre el mensaje correcto.
>
> Fuente de verdad ejecutable: `packages/shared/src/domain/wallet-messages.ts` (catálogo
> `WALLET_MESSAGE_SPECS` + formateadores + estructuras EIP-712) y su guardián
> `wallet-messages.test.ts`. Si un mensaje cambia, cambia su ficha y su prueba en el mismo commit.

## 1. Objetivo y principios

La wallet **solo enseña lo que la aplicación le envía**. Si se firma un `bytes32` opaco, un `tokenId`
o una marca de tiempo en epoch, el usuario firma a ciegas: no puede saber qué autoriza ni detectar
una petición maliciosa. El objetivo es que **cada pantalla de firma diga, en lenguaje coloquial, qué
se autoriza, sobre qué noche/habitación, con qué vigencia y qué NO autoriza**.

| # | Principio | Cómo se cumple |
|---|---|---|
| P1 | **Motivo primero** | Todo mensaje abre con una frase llana («Descargar el resguardo de tu noche»). |
| P2 | **Datos legibles** | Habitación (`201`), tipo (`suite`) y noche (`2026-11-15`) en lugar de `tokenId`/hashes. |
| P3 | **Qué NO autoriza** | Cada ficha lo declara de forma explícita (defensa anti-confusión y anti-phishing). |
| P4 | **Determinismo** | El servidor **reconstruye** el texto byte a byte; nada de locales, zonas horarias ni formato dependiente del navegador. |
| P5 | **Anti-phishing** | El mensaje firmado incluye el **dominio** desde el que se firma. |
| P6 | **Mínimo dato** | Se firma lo que hace falta para verificar; no se filtra PII ni importes que la acción no mueve. |

## 2. Inventario: qué firma hoy la wallet

| # | Interacción | CU | Método | Qué ve hoy la wallet | Problema |
|---|---|---|---|---|---|
| 1 | Publicar la ficha de una habitación (back-office) | CU-32 (panel de habitaciones) | `personal_sign` (EIP-191) sobre `contentHash` | Un `0x…` de 32 bytes, sin contexto | **Opaco**: no se sabe qué se firma ni para qué |
| 2 | Descargar el resguardo QR | CU-08 | `eth_signTypedData_v4` `DownloadTicket` | `tokenId: 20120261115`, `nonce: "9f2c…"`, `expiresAt: 1792250400` | Identificador y epoch ilegibles; sin motivo ni noche |
| 3 | Enviar una reseña | CU-47 (reseñas) | `eth_signTypedData_v4` `SubmitReview` | `tokenId`, `rating: 4`, `nonce`, `expiresAt` | Igual: `rating` se entiende, el resto no |
| 4 | Operación del hotel (vNext F2) | CU-38/39 (recepción) | `eth_signTypedData_v4` `OperationalAction` | `actionType`, `entityId`, `payloadHash`, `nonce`, `deadline` (todo `bytes32`) | **Todo hashado**: solo se entiende si la app lo explica antes |
| 5 | Comprar primaria/reventa, reventa, cobro, check-in, mint, publicar, roles, pausa, tesorería/royalty, subasta | CU-02, 05, 06, 07, 12, 14, 15, 48, 49 | **transacción** | «Contract interaction» + datos (o la función y argumentos si la wallet conoce el contrato) | La wallet no permite texto libre; el calldata puede aparecer crudo |

> **Nota**: el **acceso** al back-office ya **no** pide firma a la wallet (D-04: usuario + contraseña +
> TOTP). Las rutas `/api/auth/nonce` siguen vivas porque **emiten el nonce de un solo uso** que usan
> el resguardo, la reseña y las operaciones (anti-replay). El SIWE se conserva solo como verificación
> heredada; no es una interacción de firma del producto.

## 3. Proceso: cómo se diseña y verifica un mensaje

```
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐
   │ 1. Descubrir │→ │ 2. Catalogar │→ │ 3. Redactar      │→ │ 4. Verificar  │
   │ qué firma la │   │ en el módulo │   │ motivo + datos   │   │ determinismo  │
   │ wallet       │   │ de mensajes  │   │ + qué NO + plazo │   │ + firma real  │
   └──────────────┘   └──────────────┘   └──────────────────┘   └───────────────┘
          │                  │                    │                      │
          ▼                  ▼                    ▼                      ▼
   grep de firmas      WALLET_MESSAGE_SPECS   copia en `messages/`   tests unitarios
   (signMessage,       (id, título, resumen,  + formateadores       + guardián del catálogo
   signTypedData,      «qué no», riesgo)      deterministas         + prueba E2E de la wallet
   transacciones)
```

**Reglas del proceso**

1. **Una fuente, dos constructores.** El texto/EIP-712 se construye con **una función pura** de
   `@hotel/shared/domain`; el cliente la usa para firmar y el servidor **la misma** para verificar.
   Nunca se duplica la plantilla en dos sitios (fue el error que motivó ADR-30).
2. **Determinismo probado.** Horas en **UTC** con formato fijo (`2026-10-17 14:18 UTC`), fechas de
   noche **solo-fecha** (`2026-11-15`), importes con coma decimal fija. Prohibido `toLocaleString`.
3. **Ventana y nonce.** Toda firma puntual lleva `nonce` de un solo uso y vigencia corta (5 min).
4. **Cambio de estructura = cambio coordinado.** Si se renombra un campo de un `types` EIP-712, en el
   **mismo commit** se actualizan firmante, verificador y pruebas; si la firma la valida un contrato
   **desplegado** (operaciones), no se cambia sin ventana de redeploy.
5. **Idioma.** El mensaje **firmado** es canónico en español (lo reconstruye el servidor); la UI que
   lo rodea está localizada (es/en/ru). Una firma multilingüe exigiría guardar el idioma junto al
   nonce (evolución futura, no bloqueante).

## 4. Fichas por interacción

### 4.1 Publicar la ficha de una habitación (`personal_sign`)

| | |
|---|---|
| **Disparador** | El administrador publica la ficha de una habitación en `/admin/habitacion`. |
| **Hoy** | `signMessage({ message: contentHash })` → la wallet muestra **solo** `0x3f2a…`. |
| **Propuesta** | Texto llano (ver abajo) que **incluye** la huella, la habitación, la hora UTC y el dominio. |
| **Estructura** | Texto de 9 líneas, determinista (`roomPublicationMessage`). |
| **Verifica** | `verifyRoomPublicationSignature` reconstruye el texto con los datos de la BD + `issuedAt` recibido y comprueba EIP-191 (EOA y EIP-1271). |
| **Anti-replay** | `issuedAt` acotado a ±5 min (`isFreshPublicationSignature`). |
| **Qué NO autoriza** | Pagos, precios ni otras acciones del contrato. |

Mensaje propuesto (exacto):

```
Marina del Sol · Autorización de publicación

Vas a autorizar la publicación de la ficha de la habitación 201 (suite).
Huella del contenido: 0x3f2a5c9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c

Esta firma solo acredita que apruebas ese contenido.
No autoriza pagos, ni precios, ni otras acciones del contrato.

Fecha de la firma: 2026-10-17 14:18 UTC
Web del hotel: hotel-mcp-web-d6jlzeq5yq-ew.a.run.app
```

> La huella sigue firmándose (es lo que se ancla on-chain en `publishRoom`), pero **ya no es lo único
> que se ve**: el usuario sabe qué ficha aprueba y desde qué web.

### 4.2 Descargar el resguardo QR (`eth_signTypedData_v4`)

| | |
|---|---|
| **Disparador** | El titular pide de nuevo su resguardo en `/mis-noches`. |
| **Hoy** | `DownloadTicket { tokenId, nonce, expiresAt }` con dominio «Hotel Marina del Sol» v1. |
| **Propuesta** | `TicketAuthorization { motivo, habitacion, noche, nonce, validoHasta }` (v2, `WALLET_DOMAIN_VERSION = "2"`). |
| **Verifica** | `verifyEIP712TicketRequest` (servidor) + `ownerOf` en cadena + nonce de un solo uso. |
| **Qué NO autoriza** | Pagos, reventas ni el check-in de otra noche. |

Mensaje propuesto (lo que la wallet muestra como filas):

| Campo | Valor |
|---|---|
| `motivo` | Descargar el resguardo de mi noche |
| `habitacion` | 201 |
| `noche` | 2026-11-15 |
| `nonce` | 9f2c… (lo emite el hotel) |
| `validoHasta` | 1792250400 |

> `validoHasta` sigue siendo numérico a propósito: el servidor lo compara con el reloj **sin estado**
> (cualquier firma con más de 5 min de vigencia se rechaza). La fecha legible de la noche ya está en
> `noche`; la app muestra además «válido hasta las 21:45» en su revisión previa.

### 4.3 Enviar una reseña (`eth_signTypedData_v4`)

| | |
|---|---|
| **Disparador** | El titular de una noche **consumida** envía su reseña. |
| **Hoy** | `SubmitReview { tokenId, rating, nonce, expiresAt }`. |
| **Propuesta** | `ReviewAuthorization { motivo, habitacion, noche, estrellas, nonce, validoHasta }`. |
| **Verifica** | `verifyEIP712ReviewRequest` + `ownerOf` + nonce de un solo uso. |
| **Clave de seguridad** | La nota va **dentro de la firma**: no se puede alterar después de firmar. |
| **Qué NO autoriza** | Pagos ni reventas. |

| Campo | Valor |
|---|---|
| `motivo` | Publicar mi reseña de la noche |
| `habitacion` | 201 |
| `noche` | 2026-11-15 |
| `estrellas` | 4 |
| `nonce` | 9f2c… |
| `validoHasta` | 1792250400 |

### 4.4 Operación del hotel (vNext F2) — **limitación de contrato**

| | |
|---|---|
| **Disparador** | Recepción/maintenance firman una acción operativa que se ancla on-chain. |
| **Hoy** | `OperationalAction { actionType, entityId, payloadHash, nonce, deadline }` (5 `bytes32`/`uint256`). |
| **Por qué no se puede mejorar ya** | La firma la valida **`HotelOperations` desplegado** (`ECDSA.recover` sobre `ACTION_TYPEHASH`): renombrar o añadir campos cambiaría el hash de tipo y **rompería las firmas** sin redeploy. |
| **Mitigación actual** | La app muestra el resumen en lenguaje llano antes de firmar (`TxModal` review) y el vocabulario de recepción (`reception/checkout-vocabulary`). |
| **Propuesta v3** | Añadir al `ACTION_TYPEHASH` un campo `string descripcion` (o `bytes32 descripcionHash` + texto off-chain) para que la wallet pinte la frase; requiere ventana de contrato. |

### 4.5 Transacciones on-chain (comprar, reventa, cobro, check-in, roles, pausa, subasta…)

| | |
|---|---|
| **Qué ve el usuario** | MetaMask/Besu muestran **«Contract interaction»** con el calldata, o la función y argumentos si la wallet conoce el ABI/contrato verificado. **No se puede personalizar el texto libre** de una transacción. |
| **Qué hacemos** | La revisión legible es **obligatoria en la app** antes de firmar (ADR-11): `TxModal` fase `review` con habitación, noche e importe. El catálogo `WALLET_MESSAGE_SPECS` fija el copy de cada una (comprar, reventa, cobro, check-in, mint, publicar, roles, pausa, tesorería/royalty, puja y gestión de subasta). |
| **Mejora recomendada** | Verificar los contratos en un explorador (si la red Besu de Codecrypto lo ofrece) para que la wallet decodifique función y argumentos; y mantener el copy de revisión como fuente única. |

## 5. Decisiones y limitaciones

1. **Mensaje firmado canónico en español.** El servidor reconstruye el texto; el idioma no puede variar
   sin guardar el locale junto al nonce. Decisión: canónico es; la UI alrededor sí está localizada.
2. **`validoHasta` numérico** en EIP-712 (verificación sin estado). La fecha legible de la noche va en
   `noche`; la vigencia se explica en la app.
3. **Operaciones vNext**: no se toca la firma hasta la próxima ventana de contrato.
4. **Transacciones**: el texto no es personalizable por la dApp; se compensa con revisión previa
   obligatoria y copy catalogado.
5. **SIWE heredado**: el acceso no lo usa (D-04). No se elimina para no romper verificaciones legacy ni
   el flujo de nonces.

## 6. Plan de migración

| Fase | Alcance | Estado |
|---|---|---|
| **1. Estructura + catálogo + doc** | `wallet-messages.ts` (catálogo, formateadores, EIP-712 v2, texto de publicación), pruebas, este documento, ADR-30, CU-50 y TC | **Hecha** |
| **2. Resguardo y reseña** | Firmantes (`useTicket`, `useReviewSubmission`), verificadores (`verifyEIP712*`, rutas `/api/qr`, `/api/reviews`, `passes/jws`) y sus pruebas → estructuras v2 | Siguiente |
| **3. Publicación de contenido** | Sustituir `personal_sign(contentHash)` por `roomPublicationMessage(...)`; la API recibe `issuedAt` y valida la ventana de 5 min | Siguiente |
| **4. Operaciones vNext** | Campo de descripción en `ACTION_TYPEHASH` → **ventana de contrato** (HotelOperations) | Bloqueada por redeploy |
| **5. Aceptación** | Revisión de cada pantalla de firma en MetaMask desktop y móvil (WalletConnect) + evidencia | Pendiente |

## 7. Trazabilidad

| Elemento | Referencia |
|---|---|
| Caso de uso | **CU-50** — Comprender y autorizar lo que se firma en la wallet (SRS §9) |
| Requisitos | RF-04/RF-07/RF-16 (firmas de uso), RNF-19 (estados de transacción comprensibles), RNF-18 (móvil) |
| Decisión | **ADR-30** (mensajes firmados legibles en la wallet) |
| Pruebas | `wallet-messages.test.ts` (17) · **TC-E2E-074** (catálogo y determinismo) · **TC-ACC-004** (revisión en wallet real) |
