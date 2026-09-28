# SRS — Especificación de Requisitos de Software

## Hotel Marina del Sol: plataforma de noches tokenizadas

> **Versión**: 2.2.0 (añade el incremento v3: menú de cuenta/wallet y sección Sistemas; catálogo CU-40…CU-46)
> **Fecha**: 2026-09-26 · **Hito**: Incremento v3 · **Decisión de origen**: D-15, D-40…D-45
> **Referencia de producto**: [`docs/PRD.md`](PRD.md) v2.0.0
> **Decisiones normativas**: [`docs/adr/`](adr/README.md)
> **Origen de requisitos**: [`docs/BRIEF-CLIENTE-INICIAL.md`](BRIEF-CLIENTE-INICIAL.md)

## 0. Qué cambia respecto a la versión 1.3.0

La v1.3.0 describía otra arquitectura: Polygon Amoy/PoS como red del MVP, `HotelNFT` +
`HotelMarketplace`, cuatro roles, `checkInSecret` off-chain cifrado, Sentry, *failover* multi-RPC y
JWT RS256. **Nada de eso es el sistema que se ejecuta.** Esta versión documenta el sistema real y
mantiene los identificadores (`RF-*`, `RNF-*`, `RT-*`, `CU-*`, `US-*`) porque el código y las
pruebas los citan: cambiarlos rompería la trazabilidad que este documento existe para dar.

---

## 1. Introducción

### 1.1 Propósito

Definir la arquitectura, los contratos, las interfaces HTTP, el modelo de datos, los casos de uso y
los criterios de resiliencia **del sistema que está construido y verificado**, de modo que cualquier
afirmación del PRD pueda seguirse hasta el código, la prueba y el artefacto que la demuestra.

### 1.2 Alcance entregado

Plataforma web de venta de noches de hotel como tokens ERC-721 sobre **`HotelNights`** en una **red
local Anvil** (`chainId 81234`): catálogo primario con filtros e i18n real (ES/EN/RU), compra anónima
con wallet y firma de lo revisado, mercado secundario en vista propia con royalty inmutable por tipo
y suelo de precio, resguardo QR con titularidad EIP-712 y check-in **anclado on-chain** de un solo
uso, quema programada desatendida, avisos push reales, cola única de correo con reconciliación,
dashboard con agregados calculados en PostgreSQL, accesibilidad WCAG 2.1 AA verificada sobre la
paleta real, y verificación reproducible con artefactos.

### 1.3 Definiciones

| Término | Definición en este sistema |
|---|---|
| **Noche (token)** | ERC-721 único que representa el derecho de ocupación de **una habitación en una fecha**; `tokenId = keccak256(roomNumber, AAAAMMDD)` |
| **tokenId** | `uint256` derivado de forma determinística de habitación y fecha civil **UTC** (ADR-08) |
| **Reserva de inventario** | Noche minteada a la tesorería del hotel y todavía no vendida |
| **Venta primaria** | Primera venta de una noche, desde la tesorería del hotel; única por token (`soldOnce`, ADR-16) |
| **Reventa** | Venta posterior, entre particulares, dentro del contrato (mercado propio) |
| **`claim()`** | Retiro por *pull* de los importes acreditados (vendedor, hotel por royalty): ADR-15 |
| **`markCheckedIn`** | Ancla on-chain del consumo de una noche, firmada por una cuenta con `RECEPTION_ROLE` (ADR-05) |
| **Resguardo (ticket)** | JWS firmado con `jti` de un solo uso que acredita el derecho de check-in |
| **Recibo** | `TransactionReceipt` de la cadena; es la única prueba de que una escritura ocurrió |
| **Agregados** | Métricas y series que el worker calcula en PostgreSQL y sirve por `/aggregates` (ADR-25) |
| **Trinquete de cobertura** | Umbral de cobertura fijado en el valor **medido** para bloquear regresiones (ADR-23) |
| **EIP-712** | Firma tipada del titular que autoriza la emisión del resguardo de **su** token |

---

## 2. Arquitectura

### 2.1 Componentes reales

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ apps/web (Next.js, App Router, RSC)                                              │
│  Catálogo / · Reventa /reventa · Mis noches · Histórico /historico               │
│  Recepción /recepcion · Asistente · Back-office /admin/* (7 pantallas)           │
│  25 rutas de API bajo /api/** (auth, admin, reception, qr, wallet, nfts, push…)  │
│  Agregados: lee el worker · Cadena: viem/wagmi (cliente) y viem (servidor)       │
└───────────┬──────────────────────────────────────────────────────────────────────┘
            │ HTTPS/REST                              │ RPC JSON (viem)
┌───────────▼───────────────────┐        ┌────────────▼───────────────────────────┐
│ apps/worker (Node)            │        │ packages/contracts · HotelNights.sol   │
│  Listener + heartbeat         │◄──────►│  ERC-721 + AccessControl + Pausable    │
│  Agregados (SQL) y /history   │  RPC   │  Royalty por tipo (EIP-2981)           │
│  Cola única de correo         │        │  Suelo de precio · soldOnce · pending  │
│  Planificador de quema        │        └────────────────────────────────────────┘
│  HTTP /health /aggregates     │                     ▲
└───────────┬───────────────────┘                     │ RPC
            │ PostgreSQL (pool) · Redis (cola, locks) │
┌───────────▼───────────┐   ┌──────────────────┐   ┌──┴─────────────────────────┐
│ PostgreSQL 18         │   │ Redis ≥ 5 (7.x)  │   │ apps/mcp (read-only)       │
│ 13 tablas             │   │ cola·locks·block │   │ 4 herramientas + prepare   │
└───────────────────────┘   └──────────────────┘   └────────────────────────────┘
                            apps/monitor: /health + viveza de cadena + gas (SMTP propio)
```

### 2.2 Stack

| Capa | Tecnología | Nota |
|---|---|---|
| Monorepo | pnpm workspaces + **turbo** | Node ≥ 24; `pnpm@10` |
| Contratos | **Foundry** (`forge`, `anvil`, `cast`) | **13 suites, 125 pruebas** (la generación legacy se retiró en M9) |
| Web | Next.js (App Router) + React + Tailwind + recharts | i18n ES/EN/RU; cliente wagmi/viem |
| Backend | Node + TypeScript (`tsx`) | worker, mcp, monitor |
| Persistencia | **PostgreSQL 18** (`pg`) | única; 13 tablas |
| Cola / locks | **BullMQ 6** sobre Redis ≥ 5 | `maxRetriesPerRequest: null` en conexiones bloqueantes |
| Pruebas | Vitest (+ coverage v8), Foundry, Playwright + axe | umbrales en trinquete |
| CI | GitLab CI (etapas bloqueantes) | sin `\|\| true` ni `allow_failure` |

### 2.3 Principios de diseño

1. **Un solo contrato y un solo destino de escritura** (ADR-02).
2. **Un solo punto de firma**, que verifica calldata, importe y destino antes de firmar (ADR-11).
3. **La cadena decide lo que es cierto**; la base de datos es un índice que se puede reconstruir
   (ADR-09). Cuando el índice y la cadena discrepan, manda la cadena.
4. **Fallo en cerrado** para secretos, titularidad, pausa y configuración (ADR-04).
5. **Sin estado compartido en proceso**: locks en Redis para lo que debe ser único (check-in, quema).

---

## 3. Contrato `HotelNights`

### 3.1 Superficie pública (canónica)

| Grupo | Funciones | Roles |
|---|---|---|
| Inventario | `mint(roomNumber, dateYYYYMMDD, priceWei)` | `MINTER_ROLE` (y `whenNotPaused`) |
| Venta primaria | `buy(tokenId)` *payable* | cualquiera; requiere noche disponible |
| Listado / reventa | `list(tokenId, priceWei)`, `unlist(tokenId)`, `buyResale(tokenId)` *payable* | titular de la noche; respeta suelo |
| Cobros | `claim()`, `pendingWithdrawals(address)` | beneficiario acreditado (ADR-15) |
| Check-in | `markCheckedIn(tokenId)`, `isCheckedIn(tokenId)` | `RECEPTION_ROLE` (y `whenNotPaused`); exige venta previa |
| Quema | `burnExpired(tokenIds)`, `burnBatchMax()` | `BURNER_ROLE` |
| Royalty | `royaltyInfo(tokenId, salePrice)` (EIP-2981) | consulta; **inmutable**, derivado del tipo (ADR-18) |
| Gobernanza | `setMinListingPrice(wei)` (nunca 0), `pause()`, `unpause()`, `withdrawFunds()` | `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `TREASURER_ROLE` |
| Lectura | `ownerOf`, `roomOf`, `soldOnce`, `listingOf`, `isExpired`, `roomMaster` | cualquiera |

### 3.2 Reglas económicas y de estado

- **Royalty**: `simple` y `doble` → 5 %; `suite` → 10 %. Fijado en el mint desde el maestro de
  habitaciones y **no modificable** (D-06, ADR-18). No existe parámetro global ni rol de royalty.
- **Suelo de listado**: `minListingPrice` (0,01 ETH en la red local); `list` por debajo revierte con
  `PriceBelowMinimum`; `setMinListingPrice(0)` revierte con `InvalidPrice` (D-19, ADR-19). Subir el
  suelo **no** invalida listados ya creados (deuda declarada).
- **Una sola venta primaria** por token (`soldOnce`); `markCheckedIn` sin venta previa revierte con
  `NightNotSold` (D-18, ADR-16).
- **Noche consumida**: `markCheckedIn` es irreversible; `list` y `buyResale` sobre una noche
  consumida revierten con `NightNotResellable` (D-05).
- **Transferencias directas bloqueadas** con `DirectTransferDisabled`: el token solo se mueve por
  `buy`, `buyResale` y quema; `mint` y `burn` se permiten (ADR-07).
- **Precios en wei** con `NUMERIC(78,0)` en base de datos y `string` en JSON: nunca coma flotante.

### 3.3 Errores de dominio relevantes

| Error | Cuándo | Traducción en la aplicación |
|---|---|---|
| `NightNotSold` | check-in sin venta primaria | 409 con mensaje de dominio |
| `AlreadyCheckedIn` | segundo anclaje de la misma noche | 409 «ya consumida» |
| `NightNotResellable` | reventa/consumo incompatible | 409 con mensaje propio |
| `PriceBelowMinimum` | listado por debajo del suelo | 409 con mensaje propio |
| `DirectTransferDisabled` | transferencia fuera del mercado | no se ofrece en la interfaz |
| `EnforcedPause` | escritura con el contrato en pausa | 503 **`CONTRATO_EN_PAUSA`** (no se diagnostica como avería) |
| `InvalidPrice` | suelo de listado a 0 | no se ofrece en la interfaz |

### 3.4 Eventos consumidos por el indexador

`Mint`, `Sale`, `Listed`, `CheckedIn`, `Burn`, `RoyaltyPaid`, `MinListingPriceUpdated`, `Paused`,
`Unpaused`. El listener consolida el estado **resolviendo el token on-chain** (`ownerOf`) y el
`Sale`/`RoyaltyPaid` se emparejan por transacción y `logIndex`.

---

## 4. Interfaces HTTP

Todas las rutas viven en `apps/web/src/app/api/**`. **Regla general**: las rutas de `/api/admin/**` y
`/api/reception/**` exigen sesión **válida** (firma + caducidad + blocklist) **y el rol**
correspondiente; sin sesión → **401**, con rol ajeno → **403** (ADR-04).

### 4.1 Autenticación

| Método y ruta | Cuerpo / cabeceras | Respuesta |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | **200** con reto de MFA · **401** credenciales inválidas · **429** bloqueo temporal |
| `POST /api/auth/mfa/verify` | `{ challengeToken, totpCode }` | **200** con `accessToken` y rol · **401** código incorrecto |
| `POST /api/auth/mfa/setup` | sesión de administración | semilla TOTP (persistida cifrada) y códigos de rescate |
| `POST /api/auth/refresh` | refresh token (hash en base de datos) | **200** con token nuevo y **rotación** del refresh |
| `POST /api/auth/logout` | `Authorization: Bearer` | **200**; el access token queda en la **blocklist** y deja de servir |
| `GET /api/auth/session` | cookie/Bearer | **200** con el rol · **401** sin sesión válida |

### 4.2 Administración

| Ruta | Rol | Notas |
|---|---|---|
| `GET /api/admin/metrics` | administración | métricas financieras; lee la **fuente única** (ADR-25) |
| `POST /api/admin/mint` | `MINTER_ROLE` + TOTP re-confirmado | escribe **en la cadena** (no solo en base de datos) |
| `POST /api/admin/roles`, `/api/admin/royalty` | administración | gestión de roles; royalty **informativo** (ADR-18) |

### 4.3 Recepción

| Ruta | Rol | Notas |
|---|---|---|
| `POST /api/reception/checkin` | `RECEPTION_ROLE` | ancla `markCheckedIn`; **409 `TICKET_YA_USADO`** al segundo escaneo y **409 `CHECKIN_EN_PROCESO`** si otro puesto está anclando |
| `POST /api/reception/checkin/contingency` | `RECEPTION_ROLE` | vocabulario cerrado de motivo; **rechaza PII**; mismo cerrojo por noche |
| `POST /api/reception/pms-sync` | `RECEPTION_ROLE` | **400** si el cuerpo trae `guestName`, `documentNumber`, `documentType` o `guestNationality` |

### 4.4 Resguardo, wallet y compra

| Ruta | Requisito | Notas |
|---|---|---|
| `GET /api/qr/[tokenId]` | **firma EIP-712 del titular** | sin firma → **401**; `nonce` de un solo uso (replay → **401**); vigencia 5 min. Devuelve el JWS, la URL `…/checkin#ticket=<JWS>` y la **imagen del QR** (PNG en data URL) para mostrarla o descargarla (RF-07) |
| `POST /api/qr/[tokenId]/send-email` | ídem | mismo helper `requireTicketOwnership`; el correo del resguardo se encola de forma **efímera** (no se persiste ni se asocia a la wallet) |
| `GET /api/wallet/pass/[tokenId]` | ídem | pases Apple/Google Wallet |
| `GET /checkin#ticket=<JWS>` (página) | pública | **pantalla del resguardo** que se enseña en recepción: lee el token del **fragmento** de la URL (el navegador no lo envía al servidor), pinta el QR y ofrece el token en texto para el camino manual. No valida nada: el canje lo hace la API de recepción |
| `GET /api/nfts`, `GET /api/nfts/[tokenId]/metadata` | pública | catálogo primario y metadatos |
| `GET /api/sales/history` | pública | histórico **sin PII** (solo wallets, habitación, fecha, importe) |
| `POST /api/push/subscribe`, `/unsubscribe` | pública | consentimiento explícito y *opt-out* |
| `GET /api/fiat/session` | pública | enlace de compra con tarjeta (servicio declarado, ver deuda) |
| `POST /api/assistant` | pública | asistente → MCP → validación server-side independiente del LLM |
| `GET /api/health` | pública | salud de la web |

### 4.5 Servicios propios

| Servicio | Puerto | Rutas |
|---|---|---|
| Worker | 8787 | `GET /health` (con `lag`, `aggregateLag`, `emailDegraded`), `GET /aggregates`, `GET /history` |
| MCP | 8788 | 4 herramientas **read-only** + preparación de la compra (`buildPurchaseTx`); nunca firma |

> **Deuda declarada**: el HTTP del worker no exige autenticación y tiene CORS abierto; en un despliegue
> público debe cerrarse (o ponerse detrás de la capa de red/WAF de D-11).

### 4.6 Aprovisionamiento de operadores (`CU-PR-01`)

No es una ruta HTTP: es un comando que crea o rota un operador y **muestra una sola vez** el
`otpauth://` y los códigos de rescate.

```bash
pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es
pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
```

En la base solo quedan el hash **bcrypt** y la semilla TOTP **cifrada con AES-256-GCM**
(`AES_SECRET_KEY`). El secreto TOTP por defecto y las credenciales embebidas se eliminaron (ADR-04).

---

## 5. Modelo de datos (PostgreSQL, 13 tablas)

Diccionario completo, columna a columna: [`RepoTecnico/diccionario_datos.md`](../RepoTecnico/diccionario_datos.md).

| Grupo | Tablas | Contenido |
|---|---|---|
| Inventario y ventas | `nfts`, `listings`, `sale_events` | índice de noches, ofertas y ventas con royalty |
| Operadores | `admin_users`, `admin_sessions`, `mfa_recovery_codes` | hash bcrypt, semilla TOTP cifrada, refresh con rotación, códigos de rescate |
| Comunicaciones | `email_notifications`, `push_subscriptions` | cola persistente de correo y suscripciones push con *opt-out* |
| Recepción | `checkin_contingency_logs` | check-in asistido **sin PII** (motivo de vocabulario cerrado) |
| Worker | `worker_checkpoints`, `worker_processed_logs`, `worker_aggregate_counters`, `worker_sale_history` | progreso, idempotencia por `(txHash, logIndex)`, contadores y ventas con **marca temporal del bloque** |

**Reglas de datos**: importes en `NUMERIC(78,0)` (wei, sin pérdida); migraciones **incrementales e
idempotentes** aplicadas al arranque, con el **orden** como invariante comprobado por guardián
(`CREATE TABLE IF NOT EXISTS` no añade columnas); los agregados se leen en una transacción
`REPEATABLE READ` para que el payload no mezcle dos instantes (ADR-25); la fecha de negocio
(`block_timestamp`) es la del **bloque**, no la de la máquina.

**Tipos de habitación (M9)**: el vocabulario de `nfts.room_type` es **`SIMPLE` · `DOBLE` · `SUITE`**,
el del maestro de habitaciones. La traducción entre el dominio (`simple`/`doble`/`suite`) y la base se
hace en **un único sitio** (`toRoomTypeDb`/`toNightType` en `domain/room-master.ts`), porque antes cada
punto de lectura hacía `=== "suite" ? "SUITE" : "SIMPLE"` y una habitación **doble** se persistía como
simple: el cliente la pedía en el brief, el contrato le da su propio royalty (5 %) y el catálogo no
podía filtrarla. El tipo llega del evento `Mint`; si no es reconocible, se resuelve por número de
habitación con el maestro, y si tampoco aparece, la fila **no se escribe** (mejor ausente que mal
clasificada) y queda registrado.

**Retención (M9)**: los plazos de conservación **se ejecutan**. Un planificador del worker corre cada
`RETENTION_INTERVAL_MS` (6 h por defecto) con cerrojo distribuido y borra: sesiones **caducadas** (con
ellas desaparece la traza pseudonimizada de acceso), códigos de rescate de operadores que ya no existen,
y notificaciones **enviadas** con más de `NOTIFICATIONS_RETENTION_DAYS` (90). La traza de acceso de los
operadores se guarda **pseudonimizada con HMAC-SHA256** (`hmac-sha256:<64 hex>`), nunca en claro
(ADR-24).

### 5.1 Contrato de datos de los agregados

`DashboardAggregates` (servido por `/aggregates`) incluye:

- **7 KPIs**: noches minteadas, vendidas y quemadas; volumen primario; volumen secundario; royalties;
  ocupación comercial (`soldCount / mintedCount`, 0 si no hay minteo — sin `NaN`).
- **Serie mensual** (`monthlySeries`): mes natural `YYYY-MM` en la zona del hotel, con volumen y
  número de ventas de cada tipo.
- **Desglose por tipo** (`roomTypeBreakdown`): simple, doble, suite y `desconocido` (noches fuera del
  maestro se declaran en lugar de mentir su tipo), en orden canónico estable.
- **Ranking de más revendidas** (`topResold`, máximo 10) con orden total determinista.
- **`undatedSalesCount`**: ventas sin marca temporal de bloque que quedan **fuera** de la serie. Existe
  para que la diferencia sea auditable en vez de invisible (tras el relleno de M7 vale 0).
- **`timeZone`**: la zona con la que se agruparon los meses, declarada en el propio payload.

`summarizeHistory()` es la **vía independiente** que deriva los mismos agregados del histórico; su
igualdad con el SQL del worker **es** el criterio de aceptación del dashboard (ADR-25).

---

## 6. Resiliencia, observabilidad y seguridad operativa

| Asunto | Comportamiento real |
|---|---|
| Fallo de RPC | Degradación declarada: el catálogo cae a lectura RPC o muestra estado degradado; la titularidad no verificable responde **503**, no 401 |
| Reorganización | 1 confirmación en Anvil (32 como configuración de mainnet, **sin probar reorg real**: deuda) |
| Silencio de la cadena | El listener dispara **una** alerta por episodio y la rearma al volver un bloque |
| Checkpoint adelantado | Si el checkpoint va por delante de la cabeza (redespliegue), **rebobina** al bloque de despliegue y lo registra; `lag` negativo **degrada** la salud (antes reportaba `ok`) |
| Saldo de gas | El planificador de quema y el monitor avisan si la wallet baja del umbral; el monitor avisa **al entrar en fallo**, no en cada ciclo |
| Quema con revert | Simulación previa y reintento **token a token**: una noche no quemable no tumba el lote; solo se marca lo que confirman los eventos `Burn` del recibo |
| Correo caído | La cola persiste el trabajo; el consumidor reintenta y la **reconciliación** recupera lo atascado; un correo que agota intentos **avisa a DevOps** |
| Redis caído | El logout **propaga** el fallo en vez de simular éxito; el guard no lo confunde con credencial inválida |
| Secreto ausente | `requireSecret` lanza `MissingSecretError` y el proceso **no arranca** (CWE-798) |
| Errores en producción | Logging **estructurado JSON**; Sentry **no** se usa (ADR-26) |

---

## 7. Interfaz y accesibilidad

- **Rutas públicas** (2026-09-28): `/` (home resumen), `/empresa`, `/instalaciones`, `/servicios`,
  `/habitaciones`, `/experiencias`, `/actividades`, `/planes`, `/resenas`, `/contacto`, `/catalogo`,
  `/reservar`, `/reventa`, `/mis-noches`, `/mis-noches/mis-reventas`, `/historico`, `/checkin`,
  `/asistente`, `/ayuda`, `/privacidad` y `/terminos`. La **suite pública es la única que se abre sin
  sesión ni cartera**; el resto de suites (administración, recepción, housekeeping y mantenimiento)
  exigen una **sesión validada en servidor** con su rol (el owner entra a todas).
- **Idiomas**: ES / EN / RU con catálogos de mensajes reales.
- **Compra en tres pasos**: seleccionar → **revisar** (calldata, importe y destino) → firmar el objeto
  revisado. Nunca se firma un objeto reconstruido (ADR-11).
- **Estados degradados honestos**: si una lectura falla, la vista lo declara; las vistas de compra
  distinguen «en pausa» de «no se pudo comprobar» y no ofrecen una compra que revertiría.
- **Accesibilidad**: `lang`, enlace de salto al contenido, un `h1` por ruta, iconos decorativos
  ocultos a lectores, gráficas con `role="img"` y nombre accesible **más tabla de datos equivalente**;
  contraste ≥ 4.5:1 con el **ratio exacto** y sin colores fuera de la paleta del preset. Escaneo axe:
  **16/16 sin violaciones critical/serious** (8 rutas —`/`, `/reventa`, `/historico`, `/mis-noches`,
  `/checkin`, `/admin/dashboard`, `/admin/mint`, `/asistente`— × `chromium`/`mobile`). Detalle:
  [`docs/ACCESIBILIDAD-WCAG.md`](ACCESIBILIDAD-WCAG.md).

---

## 8. Modelo de despliegue y entorno

| Elemento | Valor |
|---|---|
| Red | Anvil `http://127.0.0.1:8545`, `chainId 81234` |
| Despliegue | `forge script script/Deploy.s.sol:Deploy --broadcast --slow` + bootstrap de roles |
| Registro | `packages/shared/deployments/81234.json` (`address`, `block`, `abiHash`) validado por esquema |
| Sincronización | `pnpm --filter @hotel/contracts sync` |
| Servicios locales | PostgreSQL 18 (5432), Redis-compatible (6379), web (3000), worker (8787), mcp (8788) |
| Configuración | `.env` en la raíz; **contrato de variables** en `.env.example`; cada componente carga el fichero y valida con zod |
| Contrato inmutable | Un cambio de reglas = redespliegue + resincronización; **no** hay *proxy* (ADR-22) |

---

## 9. Catálogo de casos de uso

Los identificadores `CU-*` que el código cita quedan definidos **aquí** (antes eran referencias
huérfanas: la decisión D-15 los trae a este catálogo). `CU-PR-*` son casos de proceso/operación.

| CU | Caso de uso | Actor | Requisito | Realización |
|---|---|---|---|---|
| **CU-01** | Autenticarse en el back-office (contraseña + TOTP) y cerrar sesión con revocación | Propietario | RNF-06 | `/api/auth/*`, ADR-04 |
| **CU-02** | Dar de alta inventario (mintear una noche) con re-confirmación de TOTP | Propietario | RF-03, RF-18a | `AdminMint`, `/api/admin/mint`, `mint` |
| **CU-03** | Aprovisionar o rotar un operador y entregar su TOTP una sola vez | Responsable técnico | RNF-06 | `CU-PR-01`, ADR-04 |
| **CU-04** | Explorar el catálogo y filtrar por fecha, precio, tipo y habitación | Comprador | RF-01, RF-02 | `/`, `FilterBar` |
| **CU-05** | Comprar una noche en venta primaria (revisar, firmar y confirmar) | Comprador | RF-04, RF-13 | ADR-11, `buy` |
| **CU-06** | Poner en reventa una noche propia y retirarla | Portador | RF-06, RF-16 | `list`/`unlist`, `/reventa` |
| **CU-07** | Cobrar lo acreditado por las reventas propias | Portador | RF-15 | `claim()`, ADR-15 |
| **CU-08** | Emitir y validar el resguardo de check-in (con titularidad y sin doble uso) | Portador, Recepcionista | RF-07, RF-08 | ADR-05 |
| **CU-09** | Consultar el histórico público de ventas y reventas | Público | RF-10 | `/historico`, ADR-25 |
| **CU-10** | Recibir aviso por correo tras una venta (cola única con reconciliación) | Propietario | RF-05 | ADR-21 |
| **CU-11** | Consultar el dashboard con KPIs, gráficas y exportación CSV | Propietario | RF-09 | ADR-25 |
| **CU-12** | Gestionar roles de operador y re-confirmar operaciones sensibles | Propietario | RF-14 | ADR-04 |
| **CU-13** | Quemar las noches caducadas no vendidas (automático y manual) | Sistema, Propietario | RF-11 | `burn-scheduler`, ADR-21 |
| **CU-14** | Pausar y reanudar el contrato, con las vistas reflejando la pausa | Propietario | RF-03 | ADR-07, `/admin/pausa` |
| **CU-15** | Retirar los fondos de la tesorería | Propietario | RF-03 | `withdrawFunds`, `/admin/fondos` |
| **CU-16** | Pedir una noche al asistente y comprarla tras confirmar | Comprador | RF-20 | MCP + `validate-tx` |
| **CU-17** | Suscribirse a avisos push y darse de baja | Comprador | RF-12 | RFC 8291/8292, ADR-24 |
| **CU-30** | Operar **todos** los paneles del back-office con la cuenta owner (`DEFAULT_ADMIN_ROLE`) | Propietario | RF-30 | `admin-roles.ts`, D-30 |
| **CU-31** | Ver las reservas del día y el estado de las 50 habitaciones | Recepcionista | RF-31, RF-32 | `/recepcion`, `overview`, D-31 |
| **CU-32** | Localizar una reserva por código de recuperación y comprobarla | Recepcionista | RF-33 | `lookup`, D-32 |
| **CU-33** | Registrar el check-in por QR/JWS desde el panel del día | Recepcionista | RF-33 | `/api/reception/checkin`, D-05 |
| **CU-34** | Registrar el check-out verificando la habitación y cancelando cargos | Recepcionista | RF-34 | `checkout`, `stay_checkouts`, D-33 |
| **CU-35** | Dar de alta cargos adicionales de una estancia | Recepcionista | RF-35 | `additional_charges`, D-34 |
| **CU-36** | Publicar, editar el precio y retirar una reventa propia | Portador | RF-36 | `/mis-noches/mis-reventas`, `list`/`unlist` |
| **CU-37** | Recibir avisos in-app y push de las reventas propias | Portador | RF-37 | `useWebPush`, `sw.js`, D-36 |
| **CU-40** | Usar el menú desplegable de cuenta/wallet (identidad, rol, accesos y salir) | Todos | RF-40 | `WalletMenu`, `wallet-menu-items.ts`, D-40 |
| **CU-41** | Entrar en la sección **Sistemas** (solo owner) | Propietario | RF-41 | `adminNav`, `app/admin/sistemas/*`, D-42 |
| **CU-42** | Gestionar los usuarios de la plataforma (listar/crear-rotar/activar) | Propietario | RF-42 | `/api/admin/system/users`, `SystemUsers`, D-43 |
| **CU-43** | Consultar y gobernar el contrato desde Sistemas | Propietario | RF-43 | `SystemContractState`, `AdminRoles`, `AdminPause` |
| **CU-44** | Consultar finanzas y retirar a tesorería desde Sistemas | Propietario | RF-44 | `SystemFinances`, `AdminFunds` |
| **CU-45** | Consultar operaciones (salud del worker y de la cadena) | Propietario | RF-45 | `/api/admin/system/operations`, `SystemOperations` |
| **CU-46** | Gestionar la seguridad de la propia cuenta (MFA y contraseña) | Todos | RF-46 | `/api/auth/password`, `/api/auth/mfa/setup`, `AdminSecurity`, D-45 |
| **CU-PR-01** | Aprovisionar operadores (comando, no ruta) | Responsable técnico | RNF-06 | §4.6 |
| **CU-PR-02** | Desplegar en la red local con roles, faucet opcional y registro sincronizado | Responsable técnico | RT-02 | ADR-06, ADR-13 |

---

## 10. Trazabilidad

Origen → requisito → caso de uso → historia → prueba. La tabla del PRD §7 cubre la vista de negocio;
esta es la vista de verificación, con el artefacto que lo demuestra.

| Requisito | CU | US | Prueba / artefacto |
|---|---|---|---|
| RF-01, RF-02 | CU-04 | US-12 | `apps/web/src/components/catalog/FilterBar.tsx`; `RepoTecnico/evidencias/load-test.json` |
| RF-03, RF-18a | CU-02 | US-04 | `HotelNights.mint.t.sol`, `HotelNights.royalty.t.sol`, E2E M4 |
| RF-04, RF-13 | CU-05 | US-05 | `verifiedTxRequest.test.ts`, `PurchaseTxData` byte a byte, E2E M4 |
| RF-05 | CU-10 | US-08 | `email-consumer.test.ts`, E2E M6 (sumidero SMTP local) |
| RF-06, RF-15, RF-16 | CU-06, CU-07 | US-06, US-16 | `HotelNights.resale.t.sol`, E2E M4 (`buyResale`, `claim`) |
| RF-07, RF-08 | CU-08 | US-07 | E2E M5 (33 comprobaciones), `reception-guardian.test.ts` |
| RF-09 | CU-11 | US-14 | E2E M7 (SQL ↔ `summarizeHistory` ↔ derivación propia) |
| RF-10 | CU-09 | US-10 | `apps/worker/src/http-server.test.ts`, E2E M7 |
| RF-11 | CU-13 | US-09 | `burn-scheduler.test.ts`, E2E M6 |
| RF-12 | CU-17 | US-18 | `web-push.test.ts` (cifrado RFC 8291/8292) y E2E M6 |
| RF-14 | CU-12 | US-25 | `/api/admin/admin.test.ts`, E2E M7 |
| RF-17, RNF-11, RNF-12 | CU-08 | US-07 | `pms.test.ts`, `reception.test.ts` (rechazo de PII) |
| RF-19 | CU-PR-02 | US-16 | `Deploy.s.t.sol`, ADR-13 |
| RF-20 | CU-16 | US-11 | `orchestrator.test.ts`, `validate-tx.test.ts` |
| RNF-02, RNF-05, RNF-21 | — | US-19, US-20 | `scripts/load-tests/run-load-test.ts` y `RepoTecnico/evidencias/load-test.json` |
| RNF-04 | — | US-19 | `scripts/backup/restore-verify.ts` y `RepoTecnico/evidencias/dr-verify.json` |
| RNF-06, RNF-19 | CU-01 | US-13 | `auth.test.ts`, `secrets-guardian.test.ts`, `admin-auth-guardian.test.ts` |
| RNF-07 | — | US-02 | `forge test`: 13 suites / 125 pruebas |
| RNF-10, RNF-20 | — | US-15 | `listener-events.test.ts`, `chain-monitor.test.ts`, ADR-26 |
| RNF-13, RNF-14, RNF-15 | — | US-22 | `apps/web/e2e/a11y.spec.ts` (axe, 16/16: 8 rutas × `chromium`/`mobile`), `lib/a11y/*` |
| RNF-17 | — | US-20 | `pnpm test:coverage` + `RepoTecnico/cobertura.md` |
| RNF-18 | — | US-21 | `docs/adr/` + guardián de documentación |
| RT-01…RT-12 | CU-PR-02 | US-01 | `Deploy.s.sol`, `sync-deployment`, `.env.example`, `entornos_globales.md` |

### 10.1 Requisitos sin fila de verificación, y por qué

No todo requisito del PRD tiene una prueba: algunos **no están entregados** y decirlo es parte de la
trazabilidad. Estos son, con su motivo y su condición para activarse:

| Requisito | Estado | Motivo de no tener fila |
|---|---|---|
| **RF-18** (multisig de custodios) | **AUS** | Depende de que el cliente designe los dos firmantes y la política de custodia (B-7). El despliegue ya revoca el admin del desplegador (ADR-06); el multisig es el paso siguiente |
| **RF-21** (subastas de la suite) | **FASE POSTERIOR** | Diferido por decisión (D-11); no hay diseño ni código |
| **RF-22** (metadatos en Arweave) | **PAR** | El camino `ipfs://` con gateway propio está implementado (ADR-12); Arweave y el *pinning* automático son fase posterior |
| **RF-23** (MiCA y fiscalidad) | **FASE POSTERIOR** | Lo firma un asesor externo; es gate de la venta al público, no del MVP |

---

## 11. Deuda declarada y límites conocidos

Lo que sigue **no** está resuelto y se declara a propósito: un SRS que esconde la deuda obliga a
descubrirla en producción.

1. **Cobertura de `apps/web` (24,95 %)**: falta el entorno DOM y dobles de wagmi. Es el hueco que fija
   el techo global (78,7 %). El umbral está en trinquete y el pipeline bloquea regresiones.
2. **200 usuarios concurrentes**: no cumple el SLA en una sola máquina (31 % de *timeouts* por
   agotamiento del pool de la web al competir con el generador); exige dimensionar el pool y cachear
   el catálogo o poner una capa CDN. La medición real a 50 concurrentes sí cumple (p95 172 ms).
3. **`lag`/reorg real en Polygon**: 32 confirmaciones y prueba de reorganización, fase pública.
4. **Escaneo axe con datos**: hoy escanea rutas con worker muerto y dashboard sin sesión.
5. **Ventana residual del cerrojo de check-in** (TTL 15 s): si un anclaje se colgara, otro puesto
   podría difundir un segundo `markCheckedIn`; la cadena consume la noche una sola vez igualmente.
6. **Sin traza off-chain del ancla**: falta `nfts.check_in_tx_hash` para auditar qué transacción
   consumió cada noche (el hash sí se devuelve en la respuesta y la UI lo muestra).
7. **Dos indexadores de la misma noche** (índice del listener y agregados del procesador) que pueden
   discrepar entre sí; unificarlos es deuda con destino operación.
8. **Subir el suelo de listado no revisa los listados ya creados.**
9. **El HTTP del worker no autentica y su CORS es abierto** (cerrar antes de exponerlo).
10. **`fetchResaleMarket`**: un fallo **parcial** de RPC muestra una lista incompleta sin avisar (el
    fallo total sí degrada la vista declarándolo).
11. **`unlist`** es la única escritura de reventa sin objeto verificado (no tiene importe).
12. **Warnings de `lint`**: 19 `no-console` en `packages/shared/scripts/create-admin.ts`, donde la
    salida por consola **es** el producto (excepción documentada).
13. **`pnpm audit` (SCA) sin triar** y **digest de Slither sin fijar**.
14. **Los E2E locales requieren el worker parado** (indexa el mismo contrato y pisa las filas que los
    guiones afirman); el pipeline no lo arranca, pero conviene que los guiones lo detecten y avisen.
15. **`fiat-onramp`** construye la sesión de pago con la pasarela declarada pero **sin webhook**: no hay
    conciliación automática de la compra con tarjeta.
16. **Backup**: el rol de la aplicación no tiene `CREATEDB`, así que la verificación de DR restaura en
    un esquema de la misma base (declarado en el artefacto).

---

*SRS v2.0.0 · reescrito en M9 · el código cita los ADR y este documento; ambos citan las pruebas.*
