# Pool de pruebas E2E del asistente — red Besu de Codecrypto (chainId 81234)

> **Fecha de ejecución:** 2026-10-24 · **Entorno:** producción (`https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app`)
> **Red de despliegue:** Codecrypto Besu (`https://besu.alumnos.codecrypto.academy`, `chainId 81234`)
> **Contrato:** `HotelNights` `0x8b1B398b9c49AFE6394aaE438f6F2E8039120253` (bloque 5 848 830) · `NightAuction` `0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a`
> **Cuentas de prueba:** las **5 últimas cuentas deterministas de Anvil** (#5–#9), con saldo recargado en el **faucet de Codecrypto** (red 81234).
> **Navegador:** Chromium real (Playwright) con una cartera EIP-6963 inyectada («Navegador Wallet») que firma con las claves de Anvil contra el RPC de Besu.

---

## 0. Resumen ejecutivo

Se generó y ejecutó un **pool de pruebas E2E reproducible** de 45 preguntas al asistente (5 cuentas × [4 preguntas de apoyo + 5 consultas erradas/ambiguas]) y, en paralelo, se ejecutaron las **acciones on-chain reales** que el asistente debe saber guiar: reservar 3 noches por cuenta (15 compras primarias), pujar en 2 subastas por cuenta (10 pujas, 10 suites ganadas), poner 1 suite en reventa por cuenta, comprar 1 noche de reventa por cuenta y hacer check-in de una noche reservada y de otra ganada en subasta.

**Resultado del pool (antes de corregir):** las 5 cuentas obtuvieron buena respuesta en la consulta de disponibilidad (5/5), pero el asistente **falló de forma sistemática en subastas y reventa**: 5/5 respuestas fueron incorrectas, confusas o se negaron a ayudar; el check-in se respondió de forma incompleta en 4/5. Además se detectaron 2 respuestas vacías del proveedor LLM, 1 respuesta con fechas equivocadas (preguntó enero de 2027 y contestó noches de octubre de 2026) y 4 consultas erradas que no se resolvieron con la precisión esperada.

**Correcciones implementadas y desplegadas (web `v93`):**

1. **Regla explícita de alcance y de «subasta ≠ reventa»** en el prompt del sistema (antes: el modelo mezclaba ambos conceptos o rechazaba procedimientos que sí son del hotel).
2. **Guía paso a paso de check-in** (Mis noches → resguardo QR → recepción).
3. **Precios siempre en ETH** (nunca en Wei) y **ventana de fechas respetada** (no ofrecer noches de otro rango).
4. **Publicación concurrente**: la API del back-office ahora responde **409 `PUBLISH_IN_PROGRESS`** con el motivo real, en vez de un `INTERNAL_SERVER_ERROR` genérico.
5. **Check-in operativo**: se configuró `RECEPTION_WALLET_PRIVATE_KEY` en la web; el check-in por API ya ancla `markCheckedIn` on-chain (antes devolvía 503 `ANCLAJE_NO_CONFIGURADO`).
6. **Endurecimiento del registro de ventas** usado para descartar «noches fantasma» (se acota al bloque del despliegue vigente).

**Brecha de producto detectada (no es un error del asistente):** el requisito 3.2 («subastar 2 de las noches reservadas por el huésped») **no es posible con el contrato actual**: `NightAuction.createAuction` exige que la noche siga siendo inventario del hotel (`owner == treasury()`); un huésped solo puede revender. El informe lo documenta como limitación y propone el camino (subasta secundaria con escrow) en §7.

---

## 1. Preparación del entorno

### 1.1 Red y contrato correctos (comprobado)

| Comprobación | Resultado |
|---|---|
| `eth_chainId` del RPC de Besu | `0x13d52` = **81234** ✅ |
| `eth_chainId` del RPC de Anvil de desarrollo | `0x7a69` = 31337 (se **descartó** como red del pool) |
| Contrato del registro `packages/shared/deployments/81234.json` | `0x8b1B…0253`, bloque `5848830` ✅ (coincide con la web y el asistente) |
| Faucet de Codecrypto | `https://faucet.codecrypto.academy` — reparte **CC nativo** en chain 81234 |

> No se usó el Anvil de 31337: el pool se ejecutó contra la **red de despliegue real del proyecto** (Besu 81234).

### 1.2 Las 5 cuentas de prueba y su recarga desde el faucet

Las cuentas son las **5 últimas deterministas de Anvil** (semilla pública `test test … junk`), sin valor real.

| Cuenta | Dirección | Faucet (tx) | Cantidad | Saldo final (CC) |
|---|---|---|---|---|
| #5 | `0x9965507D…B0A4dc` | `0x343b88fb…596642` | 50 | 49,07 |
| #6 | `0x976EA740…0C3a0aa9` | `0x86a63690…e6e89e` | 50 | 49,07 |
| #7 | `0x14dC7996…93d9955` | `0xf3622be7…56e9e3` | 50 | 48,91 |
| #8 | `0x23618e81…B5B21E8f` | `0x15b895dc…83a8a8a` | 50 | 48,91 |
| #9 | `0xa0Ee7A14…a79720` | `0x93dc5d69…fd5457` | 50 | 149,07 |

El faucet exige un *proof of work* (SHA-256 con 4 ceros) por petición; el script del pool lo resuelve automáticamente (`scripts/e2e/pool/lib/faucet.mjs`). Los saldos se verificaron on-chain después de la recarga.

---

## 2. Publicación de habitaciones y noches (requisito 2)

Se publicaron **2 habitaciones simples (101/102), 2 dobles (116/117) y 2 suites (201/202)**, cada una en **4 fechas aleatorias** dentro de los 2 meses siguientes (2026-11-05 → 2026-12-24). El proceso real de publicación del back-office encola un job que: registra la habitación (`registerRoom`), ancla la huella de la ficha (`publishRoom`) y **mintea la primera noche** (`mint`).

> **Hallazgo corregido:** al publicar varias fechas de la misma habitación en segundos, la API devolvía `INTERNAL_SERVER_ERROR` porque ya existía un job activo. Ahora responde `409 PUBLISH_IN_PROGRESS` con la fecha en curso (ver §6.4).

Noches publicadas y verificadas on-chain (todas propiedad de la tesorería del hotel):

| Tipo | Habitaciones | Fechas | Noches |
|---|---|---|---|
| SIMPLE | 101, 102 | 2026-11-05 · 11-18 · 12-02 · 12-15 / 11-08 · 11-21 · 12-05 · 12-18 | 8 |
| DOBLE | 116, 117 | 2026-11-10 · 11-24 · 12-08 · 12-20 / 11-12 · 11-27 · 12-10 · 12-22 | 8 |
| SUITE | 201, 202 | 2026-11-14 · 11-29 · 12-12 · 12-23 / 11-16 · 12-01 · 12-14 · 12-24 | 8 |

Además se publicaron:

- **10 noches de suite extra** (203–212 en fechas de noviembre/diciembre) destinadas a las **10 subastas** del pool (2 por cuenta).
- **15 noches exclusivas para las conversaciones** (104–108 simples, 118–122 dobles, 213–217 suites) que **no se compran**: solo se preguntan al asistente, para que la respuesta pueda ser evaluada sin que el inventario haya cambiado antes.

Total: **50 noches minteadas** durante la sesión (24 de la primera tanda + 10 de subastas + 15 exclusivas del pool de conversaciones + 1 de verificación), verificadas una a una contra `ownerOf`/`priceOf` on-chain.

### 2.1 Falsa alarma investigada: las simples 101/102 no aparecían en el catálogo

Al principio se creyó que el catálogo las ocultaba por «fantasmas» de ventas antiguas (los `tokenId` se repiten entre contratos inmutables y `sale_events` no guarda la dirección del contrato). Se acotó la consulta de fantasmas al **bloque del despliegue vigente** —un endurecimiento que se conserva—, pero la verificación demostró que **la causa real era otra**: las habitaciones 101 y 102 tenían **incidencias de mantenimiento abiertas con `blocksSale=true`** (de pruebas anteriores), y la regla de venta del hotel las excluye a propósito. **No era un bug del catálogo.** Se documenta en §6.5 como ambigüedad resuelta; las noches equivalentes (104–108) sí se ofrecieron y se usaron en el pool.

---

## 3. Diseño del pool de pruebas

### 3.1 Reglas del pool

- **5 cuentas** × **máximo 4 preguntas de apoyo** (una por bloque de flujos) + **5 consultas erradas/ambiguas** por cuenta = **45 turnos**.
- Las 4 preguntas de apoyo cubren los 7 flujos pedidos:

| Pregunta | Flujos que cubre |
|---|---|
| `apoyo-1-reservas` | 3.1 reservar 3 habitaciones en fechas distintas |
| `apoyo-2-subasta-pujas` | 3.2 subastar 2 reservadas · 3.3 pujar en 2 subastas y ganar ≥1 |
| `apoyo-3-reventa` | 3.4 poner en reventa 1 ganada · 3.5 comprar 1 en reventa |
| `apoyo-4-uso` | 3.6 usar 1 reservada · 3.7 usar 1 obtenida en subasta |

- Las **consultas erradas** se reparten en 5 conjuntos (A–E) y prueban: fechas imposibles, habitaciones inexistentes, fechas pasadas, fuera de dominio, inyección de prompt, contradicciones, precios/permisos, privacidad de wallets y peticiones ambiguas sin fecha.
- Cada pregunta se hizo en el **navegador real** con la wallet de la cuenta conectada, se capturó la pantalla y se guardó la respuesta JSON del backend (`reply`, `highlights`, `pageAction`, `domainToolCalls`).

### 3.2 Ejecución

- La conversación de apoyo se mantiene en un mismo hilo (contexto real de una conversación de huésped); las consultas erradas se hicieron en un **hilo nuevo** para aislar la prueba de robustez.
- Interfaz manejada: icono flotante del asistente (escritorio) → panel → pregunta → espera de la respuesta → la app **navega al catálogo filtrado** (comportamiento real del producto) → se reabre el panel (el hilo se conserva) → captura.

---

## 4. Resultados del pool del asistente (antes de corregir)

### 4.1 Disponibilidad y reservas (3.1)

| Cuenta | Respuesta | Valoración |
|---|---|---|
| #5 | Ofrece 104 (0,05 ETH), 118 (0,09) y 213 (0,25) y pregunta si prepara la compra | ✅ correcta (pide confirmación) |
| #6 | Igual, con 105/119/214 | ✅ |
| #7 | Igual, con 106/120/215 | ✅ |
| #8 | Igual, con 107/121/216 | ✅ |
| #9 | Igual, con 108/122/217 | ✅ |

**5/5 correctas** en datos y precisión. Matiz: el asistente **nunca prepara la compra en el primer turno** (siempre pide confirmación, por diseño del prompt), así que el flujo completo de 3 reservas consume un turno más de los 4 previstos.

### 4.2 Subasta y pujas (3.2 + 3.3) — **fallo sistemático**

| Cuenta | Respuesta (resumen) | Valoración |
|---|---|---|
| #5 | «Para subastar tus noches, ve a la sección de reventa del hotel» | ❌ mezcla subasta con reventa |
| #6 | «Para subastar tus noches, primero lista las noches que posees» | ❌ inventa un mecanismo inexistente |
| #7 | «No puedo ayudarte a subastar noches ni a pujar en subastas» | ❌ rechaza un procedimiento del hotel |
| #8 | «Para subastar tus noches, ve a la sección de reventa» | ❌ mezcla conceptos |
| #9 | «No puedo ayudarte a subastar tus noches ni a pujar en subastas» | ❌ rechaza |

**0/5 respuestas correctas.** Además citó un manual equivocado («Compra una noche que otro cliente revende») para explicar una subasta. La causa: el *system prompt* no distinguía explícitamente **subasta (hotel → primaria)** de **reventa (huésped → secundaria)** y el modelo rellenaba el hueco con la única vía que conocía.

### 4.3 Reventa (3.4 + 3.5)

| Cuenta | Respuesta | Valoración |
|---|---|---|
| #5 | Guía «Mis noches» + comisión del 10 % | ⚠️ parcial (no detalla /reventa ni el mínimo) |
| #6 | Guía completa con firma en wallet | ✅ parcial |
| #7 | «No puedo ayudarte a poner noches en reventa» | ❌ rechazo |
| #8 | Guía + comisión 10 % | ⚠️ parcial |
| #9 | «No puedo ayudarte…» | ❌ rechazo |

**0/5 completas.** El 10 % es correcto para suites (royalty configurado), pero la respuesta no explica que el royalty lo paga el vendedor ni el precio mínimo de listado.

### 4.4 Uso / check-in (3.6 + 3.7)

| Cuenta | Respuesta | Valoración |
|---|---|---|
| #5 | Menciona el resguardo QR y «Mis noches» | ⚠️ incompleta (no dice cómo generarlo) |
| #6 | «Necesitas tu resguardo QR… ¿quieres que lo busque en los manuales?» | ⚠️ deriva sin resolver |
| #7 | «No he podido completar la respuesta» | ❌ respuesta vacía (fallback) |
| #8 | «Ve a recepción con tu resguardo QR» | ⚠️ incompleta |
| #9 | Menciona QR, recepción y cita el manual | ✅ (la mejor) |

### 4.5 Consultas erradas/ambiguas

| Comportamiento | Ocurrencias | Comentario |
|---|---|---|
| Rechazo correcto de fecha imposible | 5/5 | ✅ |
| Habitación inexistente tratada con honestidad | 4/5 | ⚠️ una derivó a «no disponible» sin decir que no existe |
| Fuera de dominio rechazado | 4/4 | ✅ |
| Inyección de prompt resistida | 1/1 | ✅ |
| Fecha pasada bien resuelta | 0/1 | ❌ pidió de nuevo la fecha en vez de explicar que ya pasó |
| Rango fuera de ventana (enero 2027) | 0/2 | ❌ una contesta con noches de **octubre de 2026** (fechas equivocadas) |
| Contradicciones | 2/3 | ⚠️ una respondió con disponibilidad en vez de pedir aclaración |
| Respuestas vacías del proveedor LLM | 2/45 | ⚠️ el *fallback* evita burbuja vacía, pero no da apoyo |
| Precios en Wei | 1/45 | ⚠️ «50000000000000000 Wei» en vez de «0,05 ETH» |

> Las transcripciones completas y las 45 capturas están en `transcripciones/` y `capturas/`.

---

## 5. Acciones E2E ejecutadas en el navegador (evidencia on-chain)

### 5.1 Resumen de movimientos ejecutados (todos on-chain, red 81234)

| Movimiento | Cantidad | Evidencia |
|---|---|---|
| Noches minteadas para el pool | 50 | eventos `Mint` (40 de los tokens del pool + 10 de la primera tanda/verificación) |
| Compras primarias (reservas) | 15 (3 × 5 cuentas) | eventos `Sale` con `saleType=0` |
| Subastas creadas por el hotel | 10 (2 × 5 cuentas) | eventos `AuctionCreated` |
| Pujas | 10 (2 × 5 cuentas), todas ≥ reserva | eventos `BidPlaced` |
| Subastas liquidadas / suites ganadas | 10 / 10 (2 por cuenta) | eventos `AuctionSettled` |
| Reventas publicadas | 5 (1 por cuenta, 0,30 CC) | eventos `Listed` |
| Compras de reventa | 5 (1 por cuenta, ciclo entre cuentas) | eventos `Sale` con `saleType=1` |
| Check-ins anclados | 11 (5 reservadas + 5 ganadas + 1 prueba de API) | eventos `CheckedIn` + `POST /api/reception/checkin` 200 |
| NFTs visibles en la billetera | **5 por cuenta** (25 en total) | capturas `flujos/capturas/cuenta-*/mis-noches-final-*.png` |

El detalle completo con **hash de transacción, bloque y estado** está en
`flujos/eventos-pool.json` y `flujos/cuenta-{5..9}.json`; la foto final del estado on-chain
(saldos, propiedad, listados y check-ins) está en `flujos/estado-cadena.json`.

### 5.2 Reservas (3.1) — 15 compras reales

Cada cuenta compró sus 3 noches desde el catálogo real (`/catalogo?buscar=…`), pasando por la
revisión con re-verificación on-chain, la firma en la cartera y el recibo de transacción.
Capturas de cada paso en `flujos/capturas/cuenta-N/buy-<tokenId>-{revision,firma,confirmada}.png`.

| Cuenta | Noches compradas (tokenId) | Precio total |
|---|---|---|
| #5 | `11620261110`, `11720261112`, `20120261114` | 0,39 CC |
| #6 | `20220261116`, `11620261124`, `11720261127` | 0,43 CC |
| #7 | `20120261129`, `20220261201`, `11620261208` | 0,59 CC |
| #8 | `11720261210`, `20120261212`, `20220261214` | 0,59 CC |
| #9 | `11620261220`, `11720261222`, `20120261223` | 0,43 CC |

### 5.3 Subastas y pujas (3.3) — 10 subastas, 10 pujas, 10 suites ganadas

El hotel abrió 10 subastas de suites (reserva 0,25 CC, duración 1 h) y cada cuenta pujó por **dos**
desde `/subastas`, firmando en la cartera. Al cierre se liquidaron las 10: cada cuenta **ganó 2
suites** (cumple «pujar en 2 subastas y ganar al menos 1»).

| Cuenta | Subastas pujadas | Ganadas |
|---|---|---|
| #5 | `20320261119`, `20420261122` | 2 |
| #6 | `20520261125`, `20620261130` | 2 |
| #7 | `20720261203`, `20820261206` | 2 |
| #8 | `20920261209`, `21020261211` | 2 |
| #9 | `21120261216`, `21220261219` | 2 |

Capturas: `flujos/capturas/cuenta-N/bid-<tokenId>-{antes,pujada}.png`.

### 5.4 Reventa (3.4 + 3.5) — 5 listados y 5 compras

Cada cuenta puso en reventa **una** de las suites ganadas (0,30 CC) desde `/mis-noches` y compró
**una** noche de reventa de otra cuenta desde `/reventa` (ciclo #5→#6→#7→#8→#9→#5). El royalty
EIP-2981 se liquida al vendedor en la compra secundaria (`saleType=1`).

| Token | Vendedor | Comprador | Precio |
|---|---|---|---|
| `20320261119` | #5 | #9 | 0,30 CC |
| `20520261125` | #6 | #5 | 0,30 CC |
| `20720261203` | #7 | #6 | 0,30 CC |
| `20920261209` | #8 | #7 | 0,30 CC |
| `21120261216` | #9 | #8 | 0,30 CC |

Capturas: `flujos/capturas/cuenta-N/resale-<tokenId>-{listada,pendiente}.png` y
`reventa-<tokenId>-{antes,comprada}.png`.

### 5.5 Uso / check-in (3.6 + 3.7) — 10 noches usadas

Por cada cuenta se generó el **resguardo QR firmado** (EIP-712) de una noche reservada y de una
suite ganada en subasta, y se canjeó en recepción.

| Cuenta | Noche reservada usada | Suite de subasta usada |
|---|---|---|
| #5 | `11620261110` | `20420261122` |
| #6 | `20220261116` | `20620261130` |
| #7 | `20120261129` | `20820261206` |
| #8 | `11720261210` | `21020261211` |
| #9 | `11620261220` | `21220261219` |

El canje se hizo por la **API real de recepción** (`POST /api/reception/checkin`, 200
`CHECKED_IN`, con `onChainTxHash`), y el contrato quedó con `isCheckedIn=true` para cada token.
Capturas: `flujos/capturas/cuenta-N/checkin-<tokenId>-resguardo.png` (QR en pantalla).
(La cuenta #5 usó además `11720261112` para verificar la corrección del 503 → ver §6.3: 11
check-ins en total.)

### 5.6 Visibilidad de los NFTs en la billetera (requisito 6)

Con la cartera de cada cuenta conectada, `/mis-noches` lista sus NFTs con tipo, fecha, precio y
el botón de resguardo. Se verificó que **cada cuenta ve exactamente 5 NFTs** (3 reservados + 2
ganados/comprados; uno de los ganados se revendió y otro se compró en reventa):

| Cuenta | NFTs visibles en la billetera |
|---|---|
| #5 | `11620261110`, `11720261112`, `20120261114`, `20420261122`, `20520261125` |
| #6 | `20220261116`, `11620261124`, `11720261127`, `20620261130`, `20720261203` |
| #7 | `20120261129`, `20220261201`, `20820261206`, `11620261208`, `20920261209` |
| #8 | `11720261210`, `21020261211`, `20120261212`, `20220261214`, `21120261216` |
| #9 | `20320261119`, `21220261219`, `11620261220`, `11720261222`, `20120261223` |

Capturas de página completa: `flujos/capturas/cuenta-*/mis-noches-final-cuenta-*.png`.
JSON por cuenta: `flujos/billetera-cuenta-{5..9}.json`.

### 5.7 Requisito 3.2 (subastar noches propias): no soportado

No se pudo ejecutar porque el contrato **solo permite subastar al hotel** (`owner == treasury()`).
Se documenta como brecha de producto en §7 y se demuestra con la respuesta corregida del asistente
(«No puedes subastar tus noches… la única forma de venderlas es la reventa»).


---

## 6. Errores y ambigüedades corregidos

> Para cada hallazgo: **qué pasó en cristiano**, **por qué pasaba**, **qué se cambió** y **cómo se comprobó**.

### 6.1 El asistente confundía «subastar» con «revender» (y a veces se negaba a ayudar)

**En cristiano.** Le pedías subastar una noche tuya y el asistente te mandaba a «Reventa» a listarla, o te decía «no puedo ayudarte con subastas». Las dos respuestas son malas: en el primer caso te enseña un camino que no existe (tú no puedes abrir una subasta); en el segundo te cierra la puerta a algo que el hotel sí ofrece (pujar).

**Por qué pasaba.** El prompt del asistente decía que podía resolver dudas de «reventa», pero no separaba los dos mercados: **subasta primaria del hotel** (`NightAuction`, la noche aún es del hotel) y **reventa secundaria del huésped** (`list`/`buyResale`, la noche ya es tuya). El modelo, sin esa frontera, mezclaba ambos o prefería no contestar.

**Solución.** Regla explícita en el prompt del sistema:

> «Las subastas las abre SOLO el hotel sobre noches premium de su inventario: un huésped **no puede subastar** sus noches y NO debes darle pasos para subastar una noche suya (ni en Mis noches ni en Reventa). Si lo pide, empieza con "No puedes subastar tus noches" y ofrécele la reventa. Para PUJAR sí: Subastas → elegir → pujar ≥ mínima → firmar.»

**Verificación después del despliegue:**

| Antes (pool v1) | Después (`web:v93`) |
|---|---|
| 0/5 respuestas correctas | 3/3 correctas en la sonda final (`verificacion-correccion-v93/sondeo-v93.json`) |
| Mezclaba reventa con subasta («ve a Reventa a listar tus noches») | «**No puedes subastar tus noches**… la única forma de venderlas es la reventa» + pasos de `Mis noches → Listar` |
| Se negaba a explicar cómo pujar | «Para pujar: Subastas → elegir noche → puja ≥ mínima → firmar» |

Diagrama: `diagramas/02-subasta-vs-reventa.mmd`.

### 6.2 El check-in se contestaba a medias

**En cristiano.** El asistente te decía «ve a recepción con tu QR», pero no te explicaba **dónde se genera ese QR** ni que hace falta firmar con la wallet. El huésped se quedaba a medias.

**Por qué pasaba.** El paso a paso real (Mis noches → «Ver mi resguardo QR» → firma EIP-712 → presentar en recepción) estaba en los manuales, pero el prompt pedía brevedad y el modelo resumía de más; en una cuenta el proveedor devolvió una respuesta vacía.

**Solución.** Regla de check-in en el prompt con los 4 pasos y el aviso de «resguardo de un solo uso». Además se configuró la wallet de recepción en la web (§6.3), de modo que el canje por API funciona.

**Verificación después del despliegue (`web:v93`):** respuesta completa y correcta →
«Mis noches → selecciona la noche → "Ver mi resguardo QR" → firma → presenta el QR en recepción;
es de un solo uso», y el canje real devolvió 200 `CHECKED_IN`.

Diagrama: `diagramas/04-checkin.mmd`.

### 6.3 El check-in por API devolvía 503 en producción

**En cristiano.** La pantalla de recepción no podía cerrar el check-in: la web contestaba «la recepción no tiene wallet on-chain configurada».

**Por qué pasaba.** La variable `RECEPTION_WALLET_PRIVATE_KEY` no estaba definida en el servicio web de Cloud Run; `ReceptionService` arrancaba sin `walletClient` y respondía `ANCLAJE_NO_CONFIGURADO`.

**Solución.** Se añadió la variable con la clave de la hot-wallet de recepción (cuenta Anvil #3, que tiene `RECEPTION_ROLE` en el contrato). Comprobación real: el resguardo firmado de la cuenta #5 se canjeó por `POST /api/reception/checkin` → **200 `CHECKED_IN`**, con `onChainTxHash 0x6e6a…a10b` y `onChainAnchor BROADCAST`.

### 6.4 Publicar dos fechas de la misma habitación devolvía error 500

**En cristiano.** El operador publicaba una fecha y, al publicar la siguiente de la misma habitación, saltaba «error interno» sin explicar nada. En realidad solo había que esperar a que terminara el primer trabajo.

**Por qué pasaba.** El outbox `room_mint_jobs` garantiza un único job activo por habitación (índice único parcial). `enqueue` lanzaba «ya hay una publicación en curso…», y la ruta lo trataba como excepción genérica → `400/500` con `INTERNAL_SERVER_ERROR`.

**Solución.** La ruta captura ese caso y devuelve **409 `PUBLISH_IN_PROGRESS`** con la fecha en curso y el consejo de reintentar. Verificado: primera petición `202`, segunda inmediata `409` con mensaje accionable.

Diagrama: `diagramas/03-publicacion-concurrente.mmd`.

### 6.5 «El catálogo esconde las simples 101 y 102»: hipótesis equivocada, causa real hallada

**En cristiano.** Publicamos las simples 101 y 102 y no salían en el catálogo. Parecía un fallo del índice (ventas viejas de otros contratos que «resucitaban» como si estuvieran vendidas). Se investigó y resultó que **las dos habitaciones tenían averías abiertas** de pruebas anteriores: con una incidencia activa que bloquea la venta, el catálogo **hace bien** en no ofrecerlas.

**Por qué parecía otra cosa.** Los `tokenId` (habitación + fecha) se repiten entre redespliegues inmutables del contrato y `sale_events` no guarda la dirección del contrato; una consulta ingenua puede confundir ventas de la generación anterior con ventas del contrato vigente.

**Solución.** (1) Se **acotó el registro de ventas** usado para descartar fantasmas al **bloque del despliegue vigente** (endurecimiento que evita falsos positivos en futuros redespliegues). (2) Se documentó la causa real y se usaron las simples 104–108 para el pool. **No era un bug del catálogo.**

Diagrama: `diagramas/05-catalogo-101-102.mmd`.

### 6.6 Precios en Wei y fechas fuera de la ventana

**En cristiano.** A una cuenta le contestó «50000000000000000 Wei» en vez de «0,05 ETH», y a otra, preguntando por enero de 2027, le ofreció noches de **octubre de 2026**.

**Por qué pasaba.** El prompt no prohibía el Wei ni fijaba qué hacer cuando el rango pedido cae fuera de los ~90 días publicados.

**Solución.** Reglas añadidas: precios **siempre en ETH** (2–3 decimales), y si el rango cae fuera de la ventana publicada, decirlo **sin ofrecer noches de otras fechas como si fueran de ese rango**. También: si la fecha ya pasó, decirlo en vez de pedirla otra vez.

**Verificación después del despliegue (`web:v93`):**

| Pregunta | Antes | Después |
|---|---|---|
| «¿Qué habitaciones hay en enero de 2027?» | Ofrecía noches de **octubre de 2026** | «No hay noches disponibles en enero de 2027» (sin inventar) |
| «Reservar para ayer» | Volvía a pedir la fecha | «La fecha que indicas ya ha pasado… ¿buscamos otra?» |
| «¿Cuánto cuesta la 104 del 17/11?» | Precio en Wei (una cuenta) | Regla de ETH desplegada; en la sonda final el proveedor LLM devolvió texto vacío (ver §6.7), no un precio en Wei |

Evidencia: `verificacion-correccion-v93/sondeo-v93.json`.

### 6.7 Respuestas vacías del proveedor

**En cristiano.** Dos veces el modelo no devolvió nada y el asistente dijo «No he podido completar la respuesta». El *fallback* evita la burbuja vacía, pero no da apoyo.

**Causa.** Intermitencia del proveedor (Vertex/Gemini), ya conocida (~5 % en la medición H4). Se observó también en la **sonda final de `v93`**: 2 de 5 preguntas (las de precio) devolvieron el *fallback* pese a que la herramienta de catálogo respondió (`highlights` presentes). **No se corrigió con código**; se deja como limitación conocida y se recomienda reintento automático del adaptador y un mensaje de apoyo con accesos directos (Mis noches / Subastas / Reventa).

---

## 7. Brecha de producto: el huésped no puede subastar sus noches (requisito 3.2)

**Qué pedía el encargo.** «Subastar 2 de las 3 habitaciones reservadas» por cada cuenta.

**Qué permite el contrato.** `NightAuction.createAuction` exige `hotel.ownerOf(tokenId) == hotel.treasury()` y que la noche no se haya vendido: **solo el hotel puede abrir subastas**, y solo sobre su inventario primario. El huésped, una vez comprada la noche, solo tiene `list` (reventa) y `unlist`. Por tanto **3.2 no es ejecutable** con el sistema actual.

**Lo que sí se ejecutó** (y demuestra el resto del ciclo): 10 subastas del hotel (2 por cuenta), 10 pujas (2 por cuenta), **10 suites ganadas** (2 por cuenta), 1 reventa por cuenta, 1 compra de reventa por cuenta y check-in de las noches reservadas y ganadas.

**Propuesta (si el negocio quiere 3.2 de verdad).** Añadir **subasta secundaria** con depósito en escrow: contrato nuevo `NightAuctionV2` (o extensión) con `createUserAuction(tokenId, reserve, endTime)` que transfiera la noche a escrow (o use `approve` + `transferFrom` al liquidar), pujas con *pull payments* y royalty EIP-2981 al vendedor; UI «Subastar mi noche» en Mis noches; y una herramienta MCP nueva para que el asistente guíe el flujo. Está fuera del alcance de este pool de pruebas y se documenta como decisión de producto.

---

## 8. Reproducción

```bash
# Requisitos: Node ≥22, pnpm, Foundry (cast), Playwright/Chromium, LD_LIBRARY_PATH con libs del navegador
export LD_LIBRARY_PATH=/home/dsh/tools/libs/usr/lib/x86_64-linux-gnu

# 1) Cuentas + faucet de Codecrypto (red 81234)
node scripts/e2e/pool/lib/faucet.mjs        # (usado por los scripts de preparación)

# 2) Publicación (back-office con TOTP) y verificación on-chain
node scripts/e2e/pool/publish-plan.mjs      # plan de 24 noches (2 simples/2 dobles/2 suites)
node scripts/e2e/pool/publish-auctions.mjs  # 10 suites para subastas
node scripts/e2e/pool/publish-pool-nights.mjs # 15 noches exclusivas del pool de conversaciones
node scripts/e2e/pool/create-auctions.mjs   # 10 subastas (start +2 min, 1 h)

# 3) Pool del asistente (navegador real + wallet inyectada)
cd apps/web
node e2e/pool/run-assistant-pool.mjs        # 5 cuentas × 9 preguntas, capturas + transcripciones

# 4) Flujos on-chain (navegador real)
node e2e/pool/run-flows.mjs --stage=buy
node e2e/pool/run-flows.mjs --stage=bid
node e2e/pool/run-flows.mjs --stage=settle
node e2e/pool/run-checkin.mjs --stage=reserved
node e2e/pool/run-resale.mjs --stage=list
node e2e/pool/run-resale.mjs --stage=buy
node e2e/pool/run-checkin.mjs --stage=auction
```

**Artefactos:**

| Ruta | Contenido |
|---|---|
| `transcripciones/cuenta-{5..9}.json` | 45 turnos con respuesta, `highlights`, `pageAction` y captura asociada |
| `capturas/cuenta-{5..9}/` | 45 capturas del panel del asistente con la página filtrada |
| `flujos/cuenta-{5..9}.json` | Evidencia de compras, pujas, liquidaciones, reventas, compras de reventa y check-ins (tx/estado) |
| `flujos/capturas/` | Capturas de cada movimiento (revisión, firma, recibo, Mis noches, reventa, check-in) |
| `flujos/estado-cadena.json` | Foto final del estado on-chain de cuentas y tokens |
| `flujos/eventos-pool.json` | Eventos on-chain del pool (Mint/Sale/Auction/Bid/Listed/CheckedIn) con tx |
| `verificacion-correccion/` | Mismas preguntas después de desplegar la corrección |
| `diagramas/*.mmd` | Diagramas de proceso en Mermaid |

---

## 9. Limitaciones y pendientes

1. **Subasta de noches propias (3.2)** — no soportada por el contrato actual; **pendiente de decisión de producto** (propuesta en §7).
2. ~~Respuestas vacías del LLM~~ — **corregido en §12.1** (fallback determinista + 3 intentos).
3. ~~El asistente no prepara compras múltiples en el primer turno~~ — **corregido en §12.2** (prepara N compras en un turno si el usuario ya dio habitación y fecha).
4. **Evidencias de captura** — son capturas de escritorio (1440×960); no se repitió el pool en móvil.
5. ~~Catálogo 101/102~~ — **corregido en §12.5** (eran incidencias de mantenimiento de pruebas; resueltas).

---

## 10. Estado final del despliegue y verificación de cierre

| Elemento | Estado |
|---|---|
| Imagen web desplegada | `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:v94` (segunda ronda, §12) |
| Revisiones Cloud Run | `hotel-mcp-web-00099-cnf` (v92), `hotel-mcp-web-00100-rrt` (v93) y `hotel-mcp-web-00101-9gl` (v94, ronda de cierre) — 100 % del tráfico |
| `RECEPTION_WALLET_PRIVATE_KEY` | Configurada en el servicio web (hot-wallet de recepción, `RECEPTION_ROLE`) |
| `/api/health` | `{"status":"ok","service":"web"}` |
| `/health/ready` | `READY` — PostgreSQL `UP`, Redis `UP`, Polygon RPC `UP` |
| `/catalogo` | 200 y sirviendo las noches del pool |
| `POST /api/reception/checkin` | **200 `CHECKED_IN`** con `onChainTxHash` y `onChainAnchor: BROADCAST` |
| `POST /api/admin/rooms/bulk/publish` (conflicto) | **409 `PUBLISH_IN_PROGRESS`** verificado |
| Pruebas unitarias afectadas | `nights-sold-guardian` 21/21 · `prompt` 19/19 · `nfts.repository` 8/8 · `admin/rooms` 76/76 · typecheck web y shared en verde |
| Sonda del asistente `v93/v94` | subasta ✅ · check-in ✅ · ventana de fechas ✅ · fecha pasada ✅ · precio ✅ (fallback determinista con datos reales, §12.1) |

**Conclusión del pool:** el asistente, después de las correcciones, **sabe guiar** los 7 flujos
soportados (reservar, pujar, ganar, revender, comprar reventa y hacer check-in de noches reservadas
y de subasta) y rechaza con claridad lo que el producto no permite (subastar noches propias). Las
acciones se ejecutaron de verdad en la red Besu 81234 y cada cuenta terminó con sus NFTs visibles en
la billetera.

---

## 11. Anexo visual

### 11.1 Diagramas de proceso

**Flujo general del pool**

![Flujo general del pool](diagramas/01-flujo-pool.png)

**Subasta vs. reventa (error corregido)**

![Subasta vs reventa](diagramas/02-subasta-vs-reventa.png)

**Publicación concurrente (error corregido)**

![Publicación concurrente](diagramas/03-publicacion-concurrente.png)

**Check-in (error corregido)**

![Check-in](diagramas/04-checkin.png)

**Catálogo 101/102 (ambigüedad resuelta)**

![Catálogo 101 y 102](diagramas/05-catalogo-101-102.png)

**Flujo on-chain del pool**

![Flujo on-chain](diagramas/06-flujo-onchain.png)

### 11.2 Capturas de los movimientos de cada cuenta

**Cuenta #5 — reserva, puja, reventa, billetera**

| Reserva (recibo) | Puja | Reventa | NFTs en la billetera |
|---|---|---|---|
| ![Compra cuenta 5](flujos/capturas/cuenta-5/buy-11620261110-confirmada.png) | ![Puja cuenta 5](flujos/capturas/cuenta-5/bid-20320261119-pujada.png) | ![Reventa cuenta 5](flujos/capturas/cuenta-5/resale-20320261119-listada.png) | ![Billetera cuenta 5](flujos/capturas/cuenta-5/mis-noches-final-cuenta-5.png) |

**Cuenta #6**

| Reserva (recibo) | Puja | Reventa | NFTs en la billetera |
|---|---|---|---|
| ![Compra cuenta 6](flujos/capturas/cuenta-6/buy-20220261116-confirmada.png) | ![Puja cuenta 6](flujos/capturas/cuenta-6/bid-20520261125-pujada.png) | ![Reventa cuenta 6](flujos/capturas/cuenta-6/resale-20520261125-listada.png) | ![Billetera cuenta 6](flujos/capturas/cuenta-6/mis-noches-final-cuenta-6.png) |

**Cuenta #7**

| Reserva (recibo) | Puja | Reventa | NFTs en la billetera |
|---|---|---|---|
| ![Compra cuenta 7](flujos/capturas/cuenta-7/buy-20120261129-confirmada.png) | ![Puja cuenta 7](flujos/capturas/cuenta-7/bid-20720261203-pujada.png) | ![Reventa cuenta 7](flujos/capturas/cuenta-7/resale-20720261203-listada.png) | ![Billetera cuenta 7](flujos/capturas/cuenta-7/mis-noches-final-cuenta-7.png) |

**Cuenta #8**

| Reserva (recibo) | Puja | Reventa | NFTs en la billetera |
|---|---|---|---|
| ![Compra cuenta 8](flujos/capturas/cuenta-8/buy-11720261210-confirmada.png) | ![Puja cuenta 8](flujos/capturas/cuenta-8/bid-20920261209-pujada.png) | ![Reventa cuenta 8](flujos/capturas/cuenta-8/resale-20920261209-listada.png) | ![Billetera cuenta 8](flujos/capturas/cuenta-8/mis-noches-final-cuenta-8.png) |

**Cuenta #9**

| Reserva (recibo) | Puja | Reventa | NFTs en la billetera |
|---|---|---|---|
| ![Compra cuenta 9](flujos/capturas/cuenta-9/buy-11620261220-confirmada.png) | ![Puja cuenta 9](flujos/capturas/cuenta-9/bid-21120261216-pujada.png) | ![Reventa cuenta 9](flujos/capturas/cuenta-9/resale-21120261216-listada.png) | ![Billetera cuenta 9](flujos/capturas/cuenta-9/mis-noches-final-cuenta-9.png) |

**Check-in (resguardo QR de una noche reservada)**

| Cuenta #5 | Cuenta #6 | Cuenta #7 | Cuenta #8 | Cuenta #9 |
|---|---|---|---|---|
| ![Checkin 5](flujos/capturas/cuenta-5/checkin-11620261110-resguardo.png) | ![Checkin 6](flujos/capturas/cuenta-6/checkin-20220261116-resguardo.png) | ![Checkin 7](flujos/capturas/cuenta-7/checkin-20120261129-resguardo.png) | ![Checkin 8](flujos/capturas/cuenta-8/checkin-11720261210-resguardo.png) | ![Checkin 9](flujos/capturas/cuenta-9/checkin-11620261220-resguardo.png) |

**Capturas del asistente (una por pregunta y cuenta):** `capturas/cuenta-{5..9}/apoyo-*.png` y
`capturas/cuenta-{5..9}/error-*.png` (45 capturas). **Capturas de todos los movimientos:**
`flujos/capturas/cuenta-{5..9}/` (123 capturas).

---

## 12. Segunda ronda de correcciones (2026-10-24, `web:v94`)

Tras revisar el informe, se corrigieron uno a uno los errores pendientes y se verificaron en producción.

### 12.1 Respuestas vacías del LLM → apoyo determinista con datos reales

**En cristiano.** Cuando el proveedor de IA devolvía una respuesta vacía, el asistente contestaba «No he podido completar la respuesta. ¿Puedes reformular?» aunque **ya sabía** qué noches había encontrado. El huésped se quedaba sin el dato que el sistema tenía.

**Solución implementada.**
- El adaptador del modelo ahora hace **3 intentos** ante texto inservible (antes 2).
- Si aun así no hay texto, el orquestador compone una **respuesta determinista con los datos reales del turno**:
  - si hay compras preparadas: «He preparado N compras. Revísalas y fírmalas…»;
  - si hay noches encontradas: lista con **habitación, tipo, fecha y precio en ETH**;
  - si no hay datos: se mantiene el mensaje genérico.
- Se corrigió además que `checkAvailability` no devuelve habitación/fecha/tipo: ahora **se derivan del `tokenId`**, así la tarjeta y el fallback saben qué noche es.

**Verificación en producción (sonda `verificacion-correccion-v94/sondeo-v94.json`):**

| Pregunta | Respuesta observada |
|---|---|
| «¿Cuánto cuesta la habitación 101 para el 5/11/2026?» | El modelo devolvió texto vacío y **entró el fallback**: `Habitación 101 simple del 05/11/2026 por 0.05 ETH` + «Puedes preparar la reserva…» ✅ |
| «¿Está disponible la 102 para el 8/11/2026?» | «Sí… precio 0.05 ETH» ✅ |

Pruebas unitarias: 189 del módulo assistant en verde (incluye fallback con noches, fallback con compras, 3 intentos y derivación desde `tokenId`).

### 12.2 Compras múltiples en un solo turno

**En cristiano.** El asistente pedía confirmación noche por noche y gastaba turnos de más (el encargo limita a 4 preguntas por cuenta).

**Solución.** Regla del prompt: **si el mensaje ya indica habitación y fecha concretas y pide comprar/reservar, no se pide confirmación**; se verifica disponibilidad y se preparan todas las compras en ese mismo turno. La seguridad no cambia: nada se cobra hasta que el huésped firma en su cartera.

**Verificación en producción:** una sola petición con tres noches devolvió **`preparedPurchases: 3`** y la respuesta «He preparado la compra de las tres noches…» (0.05 + 0.09 + 0.25 ETH). ✅

### 12.3 La clave de recepción, cableada en el despliegue

**En cristiano.** El check-in funcionaba porque alguien puso la clave a mano; un redespliegue normal la habría vuelto a apagar.

**Solución.** `infra/gcp/70-deploy-apps.sh` cablea `RECEPTION_WALLET_PRIVATE_KEY` desde el secreto **`hotel-reception-private-key`** (Secret Manager) en el servicio web, avisa si falta y se documentó en `RepoTecnico/entornos_globales.md`. El check-in por API sigue respondiendo **200 `CHECKED_IN`** con ancla on-chain.

### 12.4 Las simples 101/102 ya se ofrecen

**En cristiano.** No salían en el catálogo porque tenían **averías abiertas de pruebas anteriores** que bloquean la venta. No era un bug: era estado legítimo.

**Solución (operación real).** Se resolvieron las 3 incidencias con la API de mantenimiento (acción `resolve`). Verificación: `/catalogo?buscar=101` muestra sus 4 noches, `/catalogo?buscar=102` las suyas, y el asistente confirma disponibilidad y precio. ✅

### 12.5 Estado tras la segunda ronda

| Corrección | Estado |
|---|---|
| Fallback determinista ante respuesta vacía | ✅ desplegado y verificado en producción |
| 3 intentos ante texto inservible | ✅ tests + despliegue |
| Compras múltiples en un turno | ✅ `preparedPurchases: 3` verificado |
| Habitación/fecha derivadas del `tokenId` | ✅ verificado (fallback con datos completos) |
| Check-in en IaC y documentación | ✅ script + docs; API 200 |
| Incidencias 101/102 resueltas | ✅ catálogo y asistente |
| Subasta secundaria del huésped (3.2) | ⏳ **pendiente de decisión de producto** (§7) |
