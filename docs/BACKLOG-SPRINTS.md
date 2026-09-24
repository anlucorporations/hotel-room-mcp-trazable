# Backlog de sprints e historias de usuario

## Hotel Marina del Sol: plataforma de noches tokenizadas

> **Versión**: 2.0.0 (reescritura completa; sustituye a la v1.2.0)
> **Fecha**: 2026-09-23 · **Hito**: M9 · **Decisión de origen**: D-15
> **Alineación**: [`docs/PRD.md`](PRD.md) v2.0.0 · [`docs/SRS.md`](SRS.md) v2.0.0 · [`docs/adr/`](adr/README.md)
> **Estado del proyecto**: [`RepoTecnico/estado_proyecto.md`](../RepoTecnico/estado_proyecto.md)

## 0. Cómo se lee este backlog

La v1.2.0 era un plan: seis sprints de dos semanas, 13 semanas, con historias que **nunca se ejecutaron
como estaban escritas**. La realidad fue otra: los sprints se construyeron con dos generaciones de
contratos conviviendo, y la auditoría V5 los declaró **NO CUMPLE** por eso. La terminación se hizo
después, en **10 hitos verticales** (M0–M9) que cerraron los 22 hallazgos.

Este documento conserva **los identificadores `US-*`** (el código y las pruebas los citan) y dice, para
cada historia, **qué existe hoy de verdad**: su estado real, dónde se verifica y qué deuda arrastra.
No hay historias «completadas» sin una ejecución o una prueba que lo demuestre.

**Estados**: **OK** (cumplida y verificada) · **PAR** (cumplida en parte, con deuda declarada) ·
**RETIRADA** (fuera del sistema por decisión) · **FASE POSTERIOR** (fuera del alcance entregado) ·
**PENDIENTE** (bloqueada por el cliente o por el entorno).

### Definición de hecho (DoD) real

La DoD de la v1.2.0 pedía revisión por un par, cobertura ≥ 80 % y análisis Slither. La DoD **vigente**
es la de [`docs/adr/ADR-23-verificacion-reproducible-y-gates.md`](adr/ADR-23-verificacion-reproducible-y-gates.md):

- [ ] `pnpm typecheck`, `pnpm lint` y `pnpm test` en verde (turbo, sin caché).
- [ ] La funcionalidad es **alcanzable desde la interfaz o la ruta**, no solo código que nadie invoca.
- [ ] Hay una prueba o un E2E que la ejerce **contra el sistema en marcha** (no un doble del sistema).
- [ ] Si toca la cadena, se ejecuta un E2E on-chain con **hashes** y artefacto en `RepoTecnico/evidencias/`.
- [ ] Si publica una cifra de calidad, tiene **instrumento de medida** y artefacto; si no, se declara sin medir.
- [ ] La deuda que queda se escribe (aquí y en `estado_proyecto.md`), no se esconde.
- [ ] Ningún secreto nuevo en el repositorio (guardián en verde).

## 1. Roadmap real

| Fase | Contenido | Estado |
|---|---|---|
| **Sprints 0–6** (13 semanas planificadas) | Construcción inicial: dominio, contratos, API, web, recepción, worker, carga y compliance | **Entregado con reservas**: la auditoría V5 encontró 22 hallazgos (7 críticos) |
| **Fase 2 — Resiliencia y alcance añadido** | DR, WAF, accesibilidad, fiat on-ramp y conector PMS | Entregado; PMS y fiat quedan **simulados** hasta tener credenciales/webhook |
| **Fase 3 — Terminación vertical (M0–M9)** | Cerrar y consolidar: una red, un contrato, un acceso, una base de datos, verificación reproducible y documentación real | **M0–M8 cerrados y verificados; M9 en cierre** |

Los hitos verticales sustituyen a la cadence de sprints para el trabajo de terminación porque cada uno
es una **entrega operable y comprobable**, no una capa:

| Hito | Objetivo | Estado | Evidencia |
|---|---|---|---|
| **M0** | Entorno reproducible (PostgreSQL, Redis, Anvil, `.env`, migraciones) | ✅ | `/health/ready` con PostgreSQL, Redis y cadena `UP` |
| **M1** | Contrato canónico completo (check-in, royalty por tipo, suelo) | ✅ | Foundry en verde y despliegue verificado con `cast` (tras retirar la generación legacy en M9: **13 suites / 125 pruebas**) |
| **M2** | Una sola base de datos (SQLite fuera) | ✅ | 525 pruebas verdes y checkpoint avanzando en PostgreSQL |
| **M3** | Acceso cerrado (contraseña + TOTP + guards, secretos fuera) | ✅ | 401/403 en cada ruta; 619 pruebas verdes |
| **M4** | Compra y reventa operativas | ✅ | E2E M4 (39 comprobaciones) + verificación adversarial |
| **M5** | Recepción con ancla on-chain y resguardo de un solo uso | ✅ | E2E M5 (33 comprobaciones) |
| **M6** | Automatismos (quema, push, cola única, listener, monitor) | ✅ | E2E M6 (20 comprobaciones) |
| **M7** | Dashboard con gráficas y accesibilidad real | ✅ | E2E M7 (33 comprobaciones) + axe en verde (16/16 tras añadir `/mis-noches` y `/checkin`) |
| **M8** | Verificación reproducible y gates bloqueantes | ✅ | Carga real, DR real, pipeline sin `\|\| true` |
| **M9** | Documentación y entrega | **En curso** | ADR, PRD/SRS/plan/backlog, respuesta al cliente y manuales |

## 2. Historias de usuario

### Sprint 0 — Cimientos

#### US-00 · Configuración del monorepo, CI/CD y observabilidad (8 SP) — **OK**

Monorepo pnpm + turbo con 6 paquetes; turbo ejecuta `typecheck`, `lint`, `test`, `build` y `coverage`;
el pipeline de GitLab tiene etapas **bloqueantes** (`setup`, `static`, `test`, `coverage`, `chain-e2e`,
`web-e2e`, `certifications`, `security`) sin `|| true` ni `allow_failure` (ADR-23). La observabilidad
es **logging estructurado JSON**; Sentry se **retiró** del alcance (ADR-26).

### Sprint 1 — Contratos

#### US-01 · Contrato con `AccessControl`, `Pausable` y check-in (8 SP) — **OK (reescrita)**

La historia pedía `HotelNFT.sol` con `markCheckedIn`. Se entregó **`HotelNights.sol`**, el contrato
canónico único: ERC-721 + `AccessControl` + `Pausable`, `markCheckedIn` con `RECEPTION_ROLE` que exige
venta previa (`NightNotSold`), `soldOnce`, `pendingWithdrawals`/`claim` y transferencias directas
bloqueadas (ADR-05, ADR-07, ADR-15, ADR-16). `HotelNFT.sol` es **legacy** y sale del runtime (ADR-02).

#### US-02 · Contrato de mercado con *pull-over-push* y `minListingPrice` (8 SP) — **OK (reescrita)**

La historia pedía `HotelMarketplace.sol`. El mercado vive **dentro** de `HotelNights`: `list`,
`unlist`, `buyResale`, `claim` y `minListingPrice` que **nunca puede ser 0** (ADR-19), junto al royalty
**por tipo, inmutable** derivado del maestro de habitaciones (ADR-18). Pruebas:
`HotelNights.resale.t.sol`, `HotelNights.royalty.t.sol`, `HotelNights.buy.t.sol`,
`HotelNights.invariants.t.sol`.

#### US-03 · Entorno local, despliegue Foundry y registro sincronizado (5 SP) — **OK**

`Deploy.s.sol` despliega `HotelNights` con bootstrap de roles (revocando `DEFAULT_ADMIN_ROLE` al
desplegador, ADR-06) y faucet opcional (ADR-13); `pnpm --filter @hotel/contracts sync` genera
`packages/shared/deployments/<chainId>.json` validado contra el esquema, que es la **fuente única** del
bloque de despliegue (ADR-09).

### Sprint 2 — Datos, acceso y catálogo

#### US-04 · Esquema de base de datos, pool y *health checks* (5 SP) — **OK**

**13 tablas** y sus índices, migraciones incrementales e idempotentes aplicadas al arranque con el
**orden** como invariante comprobado por guardián; pool compartido y `/health/ready` con PostgreSQL,
Redis y cadena. Diccionario: [`RepoTecnico/diccionario_datos.md`](../RepoTecnico/diccionario_datos.md).

#### US-05 · Autenticación con MFA obligatorio, blocklist y *rate limiting* (13 SP) — **OK**

Contraseña + **TOTP obligatorio** + JWT de 15 min con rotación de refresh y blocklist en Redis;
operadores en base de datos con semilla TOTP **cifrada**; guards con 401/403 en todas las rutas de
administración y recepción; aprovisionamiento por comando (ADR-04).

#### US-06 · Cotización EUR con caché (3 SP) — **PAR**

Caché y respaldo funcionan, pero el respaldo es un **factor fijo declarado** que envejece (ADR-14).
No hay instrumento que mida el «< 5 ms» que pedía la historia.

#### US-07b · Endpoints del catálogo y metadatos (5 SP) — **OK**

`GET /api/nfts` (catálogo **primario**) y `GET /api/nfts/[tokenId]/metadata`; la reventa tiene su
propia vista y su propia lectura (ADR-02, ADR-11).

#### US-07 · Sincronizador de eventos con alerta y anti-reorgs (8 SP) — **OK**

Listener cableado al runtime con *heartbeat*, alerta de silencio (una por episodio), consolidación del
índice resolviendo el estado **on-chain**, deduplicación por `(txHash, logIndex)` y rebobinado cuando
el checkpoint va por delante de la cabeza (ADR-09, ADR-26). **1 confirmación** en Anvil; el reorg real
de Polygon es deuda de la fase pública (ADR-10).

#### US-08 · Cola asíncrona de notificaciones (3 SP) — **OK (con defecto histórico corregido)**

La cola existía **sin consumidor** y el `Worker` de BullMQ no podía arrancar (`maxRetriesPerRequest`
debía ser `null`). Ahora: **cola única** con `jobId` determinista, consumidor real, reconciliación de
lo atascado y aviso a DevOps cuando un correo agota intentos (ADR-21).

#### US-09 · Bot *burner* con lock y alerta de gas (5 SP) — **OK**

Planificador a las **12:00 de la zona del hotel** con cerrojo por día natural, `burnExpired` por lotes
con simulación previa, reintento token a token, espera del recibo y marcado **solo** de lo confirmado;
aviso si el saldo de la hot-wallet baja del umbral (ADR-21).

#### US-17 · Histórico público de ventas y reventas (5 SP) — **OK**

`/historico` y su CSV leen los agregados del worker (fuente única, ADR-25); sin PII: solo wallets,
habitación, fecha e importe.

### Sprint 3 — Automatismos y despliegue

#### US-20 · Primer despliegue en Polygon Amoy vía Foundry en GCP (hito) — **RETIRADA**

Se **eliminó** el guion que «certificaba» un ciclo de vida en Amoy sin firmar una sola transacción
(incluso con el RPC caído decía «ciclo certificado»). La red canónica es local y Polygon es fase
posterior con su dictamen (D-01, D-08, ADR-23).

### Sprint 4 — Tienda pública, resguardo y pases

#### US-10 · Catálogo público responsivo e histórico (5 SP) — **OK**

`/` con catálogo primario, filtros combinables (`FilterBar`), i18n real y estados degradados honestos;
`/reventa` separada (ADR-11).

#### US-11 · Conexión de wallet y checkout anónimo on-chain (8 SP) — **OK**

Compra en tres pasos donde **la firma envía el objeto revisado**, con `verifiedTxRequest` fallando en
cerrado si el destino no es el contrato canónico; compra anónima, sin datos personales (ADR-11,
ADR-24). WalletConnect v2 queda **pendiente** del *project id* del cliente (B-4).

#### US-12 · Resguardo QR seguro y pases digitales (8 SP) — **OK (pases en PAR)**

El resguardo es un JWS con `jti` de un solo uso y **exige la firma EIP-712 del titular** contra
`ownerOf` on-chain en los tres endpoints que lo emiten (ADR-05). La **superficie de compra** existe
desde M9: la tarjeta de «Mis noches» pide la firma, muestra el QR **en pantalla**, lo ofrece
**descargable en PNG** y deja el token en texto para el camino manual; `/checkin#ticket=…` es la
pantalla que el huésped enseña en recepción. Los **pases Apple/Google** están implementados en el
camino pero **pendientes de credenciales** del cliente para funcionar de verdad.

#### US-13 · Internacionalización ES/EN/RU (3 SP) — **OK**

Tres catálogos de mensajes completos.

#### US-21 · Tests E2E de frontend con Playwright (2 SP) — **OK**

Suite de accesibilidad con **axe en navegador real**: 8 rutas × `chromium`/`mobile`, **16/16 sin
violaciones critical/serious** (incluidas `/mis-noches` y `/checkin`). Deuda: el escenario **con datos**
(worker vivo y dashboard con sesión) no entra todavía en el escaneo.

### Sprint 5 — Recepción, reventa y panel

#### US-14 · Validación en recepción con MFA, on-chain y contingencia (6 SP) — **OK**

Ancla `markCheckedIn` **obligatoria** con simulación previa; resguardo de un solo uso (409
`TICKET_YA_USADO`); **cerrojo por noche** para que dos puestos no confirmen dos veces (409
`CHECKIN_EN_PROCESO`); contingencia con **vocabulario cerrado** de motivo y sin PII (ADR-05, ADR-20).
Medido: **~41 ms** en servidor frente al SLA de 500 ms.

#### US-15 · Mercado de reventa propio con flujo guiado y cobro (7 SP) — **OK**

`/reventa` descarta los listados que el contrato rechazaría (noche consumida, fuera de ventana,
listado inactivo) y el vendedor cobra con `claim()` (ADR-15).

#### US-16 · Back-office: minteo con re-MFA y dashboard (8 SP) — **OK**

Minteo on-chain con re-confirmación TOTP contra la semilla cifrada del operador; dashboard con 7 KPIs,
serie mensual, desglose por tipo, ranking de más revendidas y CSV, leyendo la **fuente única**
(ADR-25). La página comprueba la **validez** de la sesión antes de leer nada (un defecto real: servía
las cifras a un cliente anónimo).

#### US-18 · Notificaciones web push *opt-in* (3 SP) — **OK**

Protocolo real: cifrado `aes128gcm` (RFC 8291) y JWT VAPID ES256 (RFC 8292) con `node:crypto`,
entrega HTTP y purga de suscripciones caducadas (404/410). Es *best-effort*: nunca bloquea una venta.

#### US-22 · Tests E2E de frontend, Sprint 5 (hito) — **OK**

Cubierto por la suite de axe y por los E2E on-chain M4–M7.

### Sprint 6 — Carga, validación y compliance

#### US-23 · Pruebas de carga k6 con 200 usuarios (6 SP) — **PAR (medido y declarado)**

El «benchmark k6» original **levantaba su propio servidor de mentira** y medía ese. Ahora
`pnpm test:load` mide por HTTP el sistema en marcha, valida el contenido de cada respuesta y aborta si
el worker no responde: **50 concurrentes → 9.119 peticiones, 0 errores, p95 172 ms** (SLA: p95 < 500 ms,
errores < 1 %). A **200 concurrentes en una sola máquina no se cumple** (31 % de *timeouts* por
agotamiento del pool de la web): se declara con sus números y su destino operativo, en lugar de
disfrazarlo. k6 sigue **pendiente de instalación** (B-3).

#### US-24 · Validación integral y ciclo E2E completo (6 SP) — **OK (replanteada)**

Sustituido por cuatro E2E on-chain reales sobre Anvil con hashes y fallo duro —M4 (compra, reventa y
`claim`), M5 (check-in), M6 (automatismos), M7 (dashboard)— más la verificación de recuperación real
(`pg_dump` + restauración + comparación tabla por tabla, RTO 0,73 s). Evidencias en
`RepoTecnico/evidencias/`.

#### US-25 · Formalización del hito regulatorio (`H-COMPLIANCE`) (4 SP) — **PAR**

La obligación del RD 933/2021 se cumple **fuera de la plataforma** en el PMS/mostrador y la ruta
rechaza datos de filiación (ADR-20). El **dictamen MiCA/fiscal** lo firma un abogado y es gate de la
fase pública, no del MVP: no se declara certificado.

## 3. Trabajo pendiente con su dueño

| # | Pendiente | Estado | Dueño |
|---|---|---|---|
| 1 | Revocar y regenerar el token de GitLab retirado del remoto (B-0) | **Pendiente** (decisión de M9: se aplaza) | Responsable |
| 2 | Rotar la contraseña del superusuario `postgres` y las claves del entorno compartido (VAPID, operador de pruebas) | **Pendiente** (decisión de M9: se aplaza) | Responsable |
| 3 | Cobertura de `apps/web` (24,95 %): entorno DOM con jsdom + `@testing-library` y dobles de wagmi | **Pendiente** | Equipo |
| 4 | Dimensionar el pool de la web y cachear el catálogo (o capa CDN) para el perfil de 200 concurrentes | **Pendiente** | Equipo / operación |
| 5 | Cerrar el HTTP del worker (autenticación y CORS) antes de exponerlo | **Pendiente** | Equipo |
| 6 | Unificar los dos indexadores de la misma noche (índice del listener y agregados) | **Pendiente** | Equipo |
| 7 | Guardar el hash del ancla de check-in (`nfts.check_in_tx_hash`) | **Pendiente** | Equipo |
| 8 | Escaneo axe **con datos** (worker vivo y dashboard con sesión) | **Pendiente** | Equipo |
| 9 | `projectId` de WalletConnect Cloud (B-4) | **Pendiente** | Cliente |
| 10 | Credenciales o certificado del PMS (B-5) y decisión sobre `SES.HOSPEDAJES` | **Pendiente** | Cliente |
| 11 | 3 fotos definitivas de los tipos de habitación (B-6) | **Pendiente** | Cliente |
| 12 | Dos firmantes para la multisig y política de custodia de claves (B-7) | **Pendiente** | Cliente |
| 13 | Fecha de entrega (junio no es alcanzable) y validación de cifras de coste | **Pendiente** | Responsable + cliente |
| 14 | `pnpm audit` triado y digest de la imagen de Slither fijado | **Pendiente** | Equipo |
| 15 | Red pública: 32 confirmaciones, prueba de reorg real y dictamen MiCA/fiscal | **Fase posterior** | Cliente + abogado |

### Trabajo cerrado tras la entrevista de M9

Estas tres deudas estaban en la lista y **ya no lo están**: el responsable decidió cómo resolverlas y se
implementaron con su prueba (ver [`../RepoTecnico/estado_proyecto.md`](../RepoTecnico/estado_proyecto.md)
§9, «Cierre de las decisiones del responsable»).

| Deuda | Cómo se cerró |
|---|---|
| Traza de sesiones de operadores en claro | **Pseudonimización con HMAC-SHA256** (`SESSION_TRACE_SECRET` con respaldo en `AES_SECRET_KEY`), en un único punto de escritura, con las filas anteriores migradas (`backfill:session-traces`) y sin poder revertirse por fuerza bruta |
| Plazos de retención que no se ejecutaban | **Planificador en el worker** (cada 6 h, con cerrojo): borra sesiones caducadas, códigos de rescate huérfanos y correos enviados con más de 90 días |
| Tipo «doble» que se perdía al persistir | Vocabulario de la base `SIMPLE`/`DOBLE`/`SUITE` con traducción en un único sitio, validación en la API de minteo y filtro del catálogo funcionando |

---

*Backlog v2.0.0 · reescrito en M9 · ninguna historia se marca cumplida sin una ejecución que lo demuestre.*
