# Estado del proyecto — Hotel Marina del Sol

> **Proyecto**: `hotel-room-mcp-trazable` · **Rama de push**: `Hotel-DSH-GCP` (solo remotos de `anlucorporations`) · **Fecha**: 2026-09-27
> **Fase del proceso**: Fase 1 reconstruida (este documento + `requerimientos.md`, `diccionario_datos.md`, `entornos_globales.md`) · Fase 2 con auditoría ya ejecutada · **Fase 3: M0–M9 cerrados y verificados · Plan de reestructuración: F0–F6 completadas y F8 CERRADA (corte ejecutado en GCP + ventana de acuñación completa con barrido global y aviso de agotamiento); F7 (administración financiera) queda fuera de esta entrega (3.ª versión) · Rediseño visual «Brisa Marina» v2.0.0 aplicado a `apps/web` (§38)**
> **Memoria de trabajo**: este archivo. Se actualiza de forma incremental en cada ciclo.

---

## 1. Punto de partida en una página

> **Instantánea histórica (21-09-2026, antes de M0).** Esta sección describe de dónde partía el
> proyecto: sus afirmaciones (pruebas en rojo, contrato legacy desplegado, faucet sin desplegar…)
> **ya no son el estado actual**. El estado vigente es el del registro de avance (§9); se conserva
> sin reescribir para no perder la trazabilidad con la auditoría V5.

El proyecto **no está a medias por falta de código**: hay 21.542 líneas de producción y 7.436 de pruebas. Está a medias porque **lo construido no forma un sistema coherente**: conviven dos generaciones de contratos, la aplicación usa la que no se despliega, hay dos sistemas de autenticación incompletos, dos persistencia descoordinadas, y una parte relevante de la funcionalidad prometida existe como código que nadie invoca.

La auditoría (`INFORME_OPTIMIZACION_V5.md`) concluyó **NO CUMPLE** la premisa del brief: 22 hallazgos, 7 de ellos críticos. Las **17 decisiones** de `DECISIONES-AUDITORIA-V5.md` fijan ya el rumbo (red, contrato, check-in, royalties, autenticación, datos, verificación, privacidad, documentación, dashboard y respuesta al cliente).

**El trabajo de terminación no es "seguir construyendo", es "cerrar y consolidar"**: una sola generación de contrato, un solo sistema de acceso, una sola base de datos, verificación reproducible y documentación que describa la realidad. El plan de §7 lo ordena en 10 hitos verticales.

### Qué está verde hoy (medido)

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | 6/6 tareas OK |
| `forge test` | 14 suites · **117 pruebas, 0 fallos** |
| `pnpm test` (workspace) | **ROJO**: 423 pruebas verdes y **36 rojas** (`@hotel/worker`, por `better-sqlite3`) |
| Cobertura | **no medida** (el CI la ejecuta con `\|\| true` y sin umbral) |
| Infraestructura real | **no validada** (PostgreSQL y Redis nunca levantados contra el sistema) |

### Volumen del código

| Área | Ficheros | De prueba | Líneas | Líneas de prueba |
|---|---|---|---|---|
| `apps/web/src` | 141 | 22 | 9.228 | 1.466 |
| `apps/web/e2e` | 4 | 4 | — | 103 |
| `apps/worker/src` | 22 | 7 | 2.327 | 1.219 |
| `apps/mcp/src` | 15 | 3 | 854 | 398 |
| `apps/monitor/src` | 11 | 3 | 522 | 275 |
| `packages/shared/src` | 65 | 25 | 7.375 | 1.951 |
| `packages/contracts/src` | 8 | — | 991 | — |
| `packages/contracts/test` | 14 | 14 | — | 2.024 |
| `scripts/` | 4 | — | 245 | — |
| **Total** | **284** | **78** | **21.542** | **7.436** |

---

## 2. Inventario y estado por módulo

Estados: **COMPLETO** (hecho y cableado) · **PARCIAL** (existe pero incompleto o mal conectado) · **SIMULADO** (existe como maqueta) · **AUSENTE** · **LEGACY** (fuera de uso por decisión).

### 2.1 Contratos (`packages/contracts`)

| Elemento | Estado | Observación | Decisión |
|---|---|---|---|
| `HotelNights.sol` (≈475 l.) | **COMPLETO** | Contrato canónico con `checkedIn`/`markCheckedIn`/`RECEPTION_ROLE` (D-05), royalty por tipo inmutable (D-06) y suelo de precio de listado (D-06) | D-02, D-05, D-06 |
| `IHotelNights.sol`, `DateLib.sol`, `RoomMaster.sol`, `HotelNightsBootstrap.sol` | **COMPLETO** | Interfaz canónica, calendario y maestro de habitaciones | — |
| `Faucet.sol` | **COMPLETO** | Herramienta de demo: se despliega **solo si** `DEPLOY_FAUCET=true` (M1); en el entorno local está desplegado y financiado con 100 ETH | D-11 |
| `HotelNFT.sol` + `HotelMarketplace.sol` | **RETIRADO** (M9) | Los contratos, sus dos suites y sus ABIs (`hotel-nft.ts`, `hotel-marketplace.ts`) se han **eliminado**: el único contrato del repositorio es `HotelNights`. El guardián de arquitectura impide que reaparezca un ABI legacy | D-02 |
| `script/Deploy.s.sol` | **COMPLETO** | Despliega el canónico `HotelNights` con bootstrap de roles y faucet opcional; el registro lo valida `deployments/schema.ts` | D-02 |
| `scripts/sync-deployment.ts` | **COMPLETO** | Añade el `abiHash` del artefacto y valida contra el esquema; genera `packages/shared/deployments/<chainId>.json` | D-02 |
| `deployments/*.json` | **PARCIAL** | El registro canónico (`packages/shared/deployments/81234.json`) es válido y está sincronizado; los crudos por cadena dejaron de versionarse y quedan ficheros antiguos de Amoy sin uso | D-02, D-08 |
| Suites Foundry | **COMPLETO** | **13 suites / 125 pruebas** verdes sobre el contrato canónico (16/146 en M8: las tres suites y las 21 pruebas de la generación legacy se retiraron en M9) | D-05, D-06 |

### 2.2 Núcleo compartido (`packages/shared`)

| Elemento | Estado | Observación | Decisión |
|---|---|---|---|
| `domain/` (token-id, room-master, night-state, purchase-tx, aggregates, ipfs, faucet, roles) | **COMPLETO** | Capa pura bien construida y testeada; es la mejor parte del repositorio | — |
| `abi/` (4 módulos) | **PARCIAL** | Incluye los ABIs legacy; hay que regenerarlos tras ampliar el contrato | D-02 |
| `db/migrator.ts` | **PARCIAL** | 8 tablas correctas, pero `schema.sql` está desincronizado (6) y `runMigrations` no se invoca en ningún arranque | D-03, D-09 |
| `db/repositories/` (nfts, sessions) | **PARCIAL** | Funcionan, pero con `any` abundante y sin transacciones (`withTransaction` no se usa) | D-04 |
| `auth/service.ts` | **PARCIAL** | bcrypt + TOTP + JWT + rotación + rescate implementados, **sin endpoints cableados** y con secretos por defecto | D-04 |
| `events/listener.ts` | **COMPLETO** | Cableado al runtime del worker: heartbeat, alerta de silencio, reconciliación por chunks que **apila** los eventos del contrato canónico y alimenta el índice `nfts` (M6) | D-12 |
| `queue/notifications.ts` | **COMPLETO** | Cola única: el pipeline de ventas **encola** (fila `PENDING` + trabajo BullMQ), el worker **consume** y la **reconciliación** recupera lo atascado. El `Worker` de BullMQ exigía `maxRetriesPerRequest: null` (con el cliente normal no arrancaba nunca) | D-03 |
| `burner/service.ts` | **COMPLETO** | Quema con el ABI canónico `burnExpired`, troceo por `burnBatchMax`, simulación previa con reintento token a token, espera del recibo y marcado **solo** de lo confirmado; planificador diario en el worker (M6) | D-03 |
| `reception/service.ts` | **COMPLETO** | Check-in con ancla `markCheckedIn` on-chain obligatoria sobre el contrato canónico, simulación previa y cola de nonces de la hot-wallet; resguardo de un solo uso (`jti` en Redis); contingencia sin PII | D-05, D-13 |
| `passes/jws.ts` | **COMPLETO** | JWS real con `jti` de un solo uso (uuid) y `chainId`/`verifyingContract` de la cadena activa; autorización EIP-712 acotada a 5 min; sin secretos por defecto | D-04, D-05 |
| `push/service.ts` | **COMPLETO** | Push real (M6): cifrado `aes128gcm` (RFC 8291) + JWT VAPID (RFC 8292) con `node:crypto`, entrega HTTP y purga de suscripciones caducadas (404/410); opt-in/opt-out cableados | D-03 |
| `pms/adapter.ts` | **SIMULADO** | MOCK que dice haber generado la ficha policial sin enviar nada | D-13 |
| `fiat-onramp/service.ts` | **SIMULADO** | URLs construidas a mano, secreto por defecto, sin webhook | D-11 |
| `backup/service.ts` | **SIMULADO** | Cifra y descifra el mismo objeto en memoria; no toca la base real | D-08 |
| `rates/exchange-service.ts` | **PARCIAL** | Fallback a 1,7 €/POL y factor USD→EUR fijo de 0,92 | — |
| `health/` | **COMPLETO** | Servicio y hooks de salud utilizables | — |
| `logger.ts` | **PARCIAL** | Logging estructurado correcto; el hook de Sentry es condicional y Sentry no está instalado | D-12 |
| `env/index.ts` | **COMPLETO** | Validación `fail-fast` reutilizable; falta el esquema de cada componente | D-03 |
| `redis/client.ts` | **PARCIAL** | Cliente y lock implementados; Redis no está instalado en el entorno | D-10 |

### 2.3 Web (`apps/web`)

| Elemento | Estado | Observación | Decisión |
|---|---|---|---|
| Catálogo, `mis-noches`, `historico`, `recepcion`, `asistente`, legales | **COMPLETO** (UI) | Interfaz existente, con i18n real ES/EN/RU | D-07, D-16 |
| Mercado secundario `/reventa` | **COMPLETO** | Vista propia de reventa (M4): listados vigentes, filtro de noches consumidas y compra `buyResale` con el mismo punto de revisión/firma que el catálogo | D-07 |
| Back-office `admin/*` (7 pantallas) | **COMPLETO** (UI) | Minteo, dashboard, fondos, roles, royalty, pausa, caducadas | D-04, D-16 |
| Compra (`BuyButton`, `useBuyNight`, `usePurchaseReview`) | **COMPLETO** | La revisión construye el calldata y la firma envía **ese mismo objeto** byte a byte (`useSendTransaction`, `verifiedTxRequest`); el catálogo deja de mostrar reventas | D-07 |
| Listado y cobro (`useListNight`, `useClaim`) | **COMPLETO** | `list`/`unlist`/`claim` contra `HotelNights`; el marketplace legacy sale del cliente | D-02, D-07 |
| `/api/admin/*`, `/api/reception/*` | **INSEGURO** | Sin validación de sesión ni rol; métricas financieras abiertas; minteo que escribe en BD sin transacción on-chain | D-04 |
| `/api/qr/[tokenId]`, `/api/qr/[tokenId]/send-email`, `/api/wallet/pass/[tokenId]` | **CERRADO** | La firma EIP-712 del titular es obligatoria (`requireTicketOwnership`): sin ella → 401, y el `nonce` es de un solo uso (M5, H-05) | D-04, D-05 |
| `/api/reception/pms-sync` | **CORREGIDO** | `RECEPTION_ROLE`; rechaza `guestName`/`documentNumber` con 400 y no devuelve PII (D-13) | D-13 |
| `/api/reception/checkin` (+ `/contingency`) | **COMPLETO** | Ancla on-chain con la hot-wallet de recepción (singleton con cola de nonces); 409 al segundo escaneo del mismo resguardo; errores de dominio mapeados a HTTP | D-04, D-05, D-13 |
| Dashboard (`DashboardMetrics`) | **COMPLETO** (D-16) | KPIs + **serie mensual, desglose por tipo y ranking de más revendidas** con librería de gráficos (recharts) y alternativa tabular accesible; lee la **fuente única** (`/aggregates` del worker), no un cálculo propio | D-16 |
| `middleware.ts` | **PARCIAL** | Cabeceras de seguridad correctas; sesión no validada y rate limit en memoria (no multi-instancia) | D-04 |
| Accesibilidad (`lib/a11y`) | **VERIFICADO** (D-11) | La paleta que se mide es la del preset real (igualdad comprobada en test), se escanean los `className` del producto (ningún color fuera de paleta, contraste de cada par texto/fondo ≥ 4.5:1) y las gráficas llevan nombre accesible + tabla de datos; los `emerald-*`/`red-*` fuera de la paleta de recepción y del enlace de salto están corregidos | D-11 |

### 2.4 Servicios de fondo

| Elemento | Estado | Observación | Decisión |
|---|---|---|---|
| `apps/worker` — listener | **COMPLETO** | Cableado al runtime desde M6: polling cada 4 s, confirmaciones configurables, alerta de silencio y alimentación del índice PostgreSQL desde los eventos | D-09, D-12 |
| `apps/worker` — correo y agregados | **COMPLETO** | Agregados e histórico en PostgreSQL, **cola única** de correo con consumidor y reconciliación, y desde M7 agregados del dashboard (serie mensual, desglose y ranking) calculados en SQL | D-03, D-09, D-16 |
| `apps/worker` — HTTP (`/health`, `/aggregates`, `/history`) | **INSEGURO** | CORS `*` y sin autenticación | D-04 |
| `apps/mcp` | **COMPLETO** | 4 herramientas read-only reales contra `HotelNights`; sin caché (reescanea desde el bloque de despliegue). Su test usa `chainId: 31337`, deriva frente a 81234 | D-01 |
| `apps/monitor` | **COMPLETO** | Sondea `/health` y, desde M6, vigila **cadena y saldo de gas** (viveza por bloques y umbral por wallet), con aviso al entrar en fallo y no en cada ciclo | D-12 |

### 2.5 Operación, infraestructura y CI

| Elemento | Estado | Observación | Decisión |
|---|---|---|---|
| `scripts/e2e/amoy-lifecycle.ts` | **RETIRADO** (M8) | Imprimía seis `OK` sin firmar una sola transacción (incluso con el RPC caído, decía «ciclo certificado»). Se ha **eliminado** junto con su script de npm: la red canónica es local (Anvil) y Polygon es fase posterior (D-01/D-11) |
| `scripts/load-tests/run-load-test.ts` | **REAL** (M8) | Medía un servidor de mentira que levantaba él mismo. Ahora mide por HTTP el sistema en marcha, valida el contenido de cada respuesta y falla en duro si no cumple el SLA; artefacto `RepoTecnico/evidencias/load-test.json` |
| `scripts/backup/restore-verify.ts` | **REAL** (M8) | «Restauraba» un objeto en memoria. Ahora hace `pg_dump`, restaura de verdad y compara tabla por tabla (recuentos y sumas) entre origen y restaurada; artefacto `RepoTecnico/evidencias/dr-verify.json` |
| `docker-compose.yml` | **DESALINEADO** | PostgreSQL 16 + Redis 7; el entorno tiene PostgreSQL 18 y no tiene Redis ni Docker | D-10 |
| `Dockerfile` / IaC | **AUSENTE** | El Plan declara una VM de GCP con systemd/Docker que no existe en el repositorio | D-08, D-11 |
| `.gitlab-ci.yml` + `.github/workflows/ci.yml` | **PARCIAL** | `lint`, `test` y `slither` bloquean; cobertura y E2E no; `test:k6`, `test:dr` y `test:e2e:amoy` no se ejecutan | D-08 |
| `.env.example` | **INÚTIL** | Cadena y variables de la generación antigua; le faltan las obligatorias de web, worker, MCP y monitor; copiarlo rompe el arranque `fail-fast` | D-01, D-03, D-10 |
| ADR | **AUSENTE** | El código contiene **66 referencias a `ADR-*`** y no existe ningún ADR en el repositorio | D-15 |

---

## 3. Documentación existente

| Documento | Estado |
|---|---|
| `docs/PRD.md` (v1.1.0), `docs/SRS.md` (v1.3.0), `docs/PLAN-CONSTRUCCION.md` (v1.2.0), `docs/BACKLOG-SPINTS.md` (v1.2.0) | **DESALINEADOS** con el código: describen Polygon, `HotelNFT`+`HotelMarketplace` y 4 roles. Hay que reescribirlos según D-01…D-16 |
| `docs/GUIA-GNOSIS-SAFE.md`, `COMPLIANCE.md`, `DISASTER-RECOVERY.md`, `CLOUDFLARE-WAF-SETUP.md`, `ACCESIBILIDAD-WCAG.md`, `FIAT-ONRAMP.md`, `PMS-INTEGRATION.md` | **PARCIALES**: describen procedimientos que hoy son simulados (PMS, fiat, DR) |
| `docs/PERFORMANCE-REPORT.md` | **NO VÁLIDO** (certificación no reproducible) |
| `docs/BRIEF-CLIENTE-INICIAL.md` | **VIGENTE**: es el origen y el criterio de aceptación del cliente |
| `docs/RESPUESTA-CLIENTE-BORRADOR.md` | **NUEVO**: borrador a validar antes de enviar |
| `RepoTecnico/auditoria_informe.md` | Auditoría v4 (histórico) |
| `RepoTecnico/INFORME_OPTIMIZACION_V5.md` | **VIGENTE**: 22 hallazgos, veredicto NO CUMPLE |
| `RepoTecnico/DECISIONES-AUDITORIA-V5.md` | **VIGENTE**: 17 decisiones |
| `RepoTecnico/ANTIGRAVITY/` | Planes de implementación de Sprint 0 y 1 (histórico) |

---

## 4. Decisiones vigentes

Las 17 decisiones de `DECISIONES-AUDITORIA-V5.md` (D-01 a D-17) están en vigor. Resumen: **Anvil local + `HotelNights` canónico** (D-01/D-02), quema y push y cola y migraciones reales (D-03), **contraseña + TOTP + JWT** como único acceso (D-04), **check-in en la cadena** (D-05), **royalty por tipo inmutable + suelo de precio + bloqueo tras check-in** (D-06), **flujos de compra separados** (D-07), **verificación reproducible y gates bloqueantes** (D-08), **todo en PostgreSQL** (D-09), **PostgreSQL 18 local + Redis nativo** (D-10), **alcance añadido completo** (D-11), **resiliencia alineada a Anvil sin Sentry ni failover** (D-12), **registro de viajeros fuera de la plataforma** (D-13), **minimización de PII y textos legales reescritos** (D-14), **registro de ADR y limpieza de referencias** (D-15), **dashboard con gráficas** (D-16), **borrador de respuesta al cliente** (D-17).

---

## 5. Bloqueantes

| # | Bloqueante | Impacto | Estado |
|---|---|---|---|
| **B-0** | **Token de GitLab en claro** en la URL del remoto `gitlab-public` (`.git/config`): `glpat-…` | Cualquiera con acceso al fichero tiene el token vivo | **PENDIENTE — rotar ya** |
| B-1 | Contraseña del superusuario `postgres`, o creación manual del rol `hotel_admin` y la base `hotel_nft_dev` | Sin esto no hay verificación contra PostgreSQL: bloquea D-09, D-10 y toda la Fase 4 | Pendiente del responsable |
| B-2 | Redis no instalado | Bloquea D-03 (cola y lock) y D-04 (blocklist y rate limit) | Propuesto: `winget install Redis.Redis` |
| B-3 | k6 no instalado | Bloquea la prueba de carga de D-08 | Pendiente |
| B-4 | Proyecto en WalletConnect Cloud (project id) | Bloquea D-11 (WalletConnect v2) | Pendiente del cliente |
| B-5 | Credenciales/certificado del PMS del hotel | Bloquea D-13 y la integración real | Pendiente del cliente |
| B-6 | Fotos definitivas de los tres tipos de habitación | Catálogo con imágenes de relleno | Pendiente del cliente |
| B-7 | Dos firmantes para la multisig y política de custodia | Bloquea D-11 y la respuesta al cliente | Pendiente del cliente |
| B-8 | Confirmaciones menores | ¿Se elimina SIWE por completo? ¿Se declara PostgreSQL 18 en la documentación? | Pendiente del responsable |

---

## 6. Plan de terminación — 10 hitos verticales

Cada hito es una entrega operativa: se puede probar y verificar al terminarlo. El orden minimiza retrabajo (primero el entorno y el contrato, porque todo lo demás depende de ellos).

| Hito | Objetivo | Entregable verificable | Criterio de aceptación | Decisiones |
|---|---|---|---|---|
| **M0** | Entorno reproducible | PostgreSQL con rol y base del proyecto, Redis activo, `.env` válido, `anvil` arrancado en 81234, migraciones aplicadas | `pnpm typecheck` verde, `/health/ready` con PostgreSQL y Redis en `UP` y cadena 81234 respondiendo. Los 36 fallos de `pnpm test` (better-sqlite3) se cierran en **M2**, no en M0 | D-09, D-10, B-1, B-2 |
| **M1** | Contrato canónico completo | `HotelNights` con `checkedIn`/`markCheckedIn`/`RECEPTION_ROLE`, royalty por tipo inmutable, suelo de precio de listado; `Deploy.s.sol` propio, `sync-deployment.ts` arreglado y `deployments/81234.json` válido | `forge test` verde con las nuevas suites + despliegue en Anvil + el registro valida contra `deployments/schema.ts` | D-01, D-02, D-05, D-06 |
| **M2** | Una sola base de datos | Checkpoints y agregados del worker en PostgreSQL; `better-sqlite3` fuera; `runMigrations` en el arranque | `pnpm test` verde sin `better-sqlite3`, worker arrancando desde el bloque de despliegue y sin SQLite en el repo | D-03, D-09 |
| **M3** | Acceso cerrado | Contraseña + TOTP obligatorio en admin y recepción; endpoints cableados; guards en todas las rutas; secretos fuera del código con `fail-fast`; test guardián | 401/403 en cada ruta protegida sin sesión o sin rol; ningún secreto literal en el repositorio; pruebas de seguridad verdes | D-04 |
| **M4** ✅ | Compra y reventa operativas | Primaria en el catálogo y reventa en vista secundaria, cada una con su calldata verificado y firmado; `claim` para el retiro del vendedor | Compra y reventa reales sobre Anvil con hashes documentados; test byte a byte del calldata | D-07 |
| **M5** ✅ | Recepción | Check-in con `markCheckedIn` on-chain, EIP-712 obligatorio, mismo QR rechazado dos veces, contingencia sin PII | E2E «mismo QR dos veces → segundo rechazado» y token consumido no revendible | D-05, D-13 |
| **M6** ✅ | Automatismos | Quema programada a las 12:00 (hora local del hotel) con lock y alerta de gas, push reales con opt-in/opt-out, cola única de correo con reconciliación, listener con heartbeat y alerta de silencio, monitor ampliado | Quema ejecutada por planificador con evidencia; correo despachado por la cola única; alerta de silencio disparada en prueba | D-03, D-12 |
| **M7** ✅ | Dashboard y accesibilidad | Serie mensual, desglose por tipo y ranking de más revendidas; accesibilidad verificada sobre la paleta real | Cifras del dashboard cuadrando con el histórico; tests de accesibilidad sobre los colores reales en verde | D-11, D-16 |
| **M8** ✅ | Verificación reproducible | E2E on-chain real contra Anvil con fallo duro, prueba de carga real con artefacto, gates de CI bloqueantes con cobertura ≥ 80 % | Pipeline en verde con cobertura declarada; certificaciones regeneradas con artefacto; retirada de las anteriores | D-08 |
| **M9** | Documentación y entrega | Registro de ADR, referencias huérfanas limpiadas, PRD/SRS/PLAN/BACKLOG reescritos según las decisiones, respuesta al cliente cerrada y manuales | Trazabilidad brief↔requisito completa; ningún `ADR-*`/`CU-*` sin destino; respuesta al cliente validada | D-14, D-15, D-17 |

**Ruta crítica**: M0 → M1 → M2 → M3 → M4 → M5. Los hitos M6 a M9 no bloquean entre sí y pueden paralelizarse parcialmente.

---

## 7. Próximos pasos inmediatos

1. **Arrancar M9 (documentación y entrega)**: registro de ADR, limpieza de referencias huérfanas (`ADR-*`/`CU-*`), reescritura del PRD/SRS/PLAN/BACKLOG según las decisiones, respuesta al cliente cerrada (D-17) y manuales. M8 dejó el pipeline bloqueante, la cobertura medida y declarada, el `lint` en verde y las tres certificaciones falsas sustituidas por mediciones reales.
2. **Rotar el token de GitLab** expuesto y sacarlo de la URL del remoto (B-0): sigue pendiente del responsable.
3. Rotar la contraseña del superusuario `postgres`, el operador de recepción de pruebas de M5 y las claves VAPID del entorno.
4. Confirmar las decisiones de proceso pendientes (§8).
5. Cotejar con el cliente lo que M4/M5/M6 dejaron abierto: suelo de reventa, royalty por tipo y criterio de custodia (B-4…B-8 no cambian).

## 8. Pendiente de confirmación del responsable

- ¿Se eliminan por completo las rutas y componentes de SIWE, o se conservan documentados como alternativa?
- ¿Se declara **PostgreSQL 18** en la documentación (en lugar de 16) o se fija la versión 16 para igualar el `docker-compose`?
- ¿Se confirma el suelo de reventa de 0,01 ETH y el royalty inmutable del 5 % (simple y doble) / 10 % (suite) como política definitiva del hotel?
- ¿La reventa debe admitir filtros propios (fecha, tipo, precio) como el catálogo, o se mantiene como lista simple hasta M7?

---

## 9. Registro de avance

### 2026-09-21 — Arranque del hito M0

- **B-0 resuelto en el repositorio**: retirado el token de GitLab de las URLs de `origin` y `gitlab-public`; `.git/config` ya no contiene credenciales embebidas. **Falta que el responsable revoque y regenere el token**: el antiguo sigue siendo válido hasta que lo haga.
- **`.env.example` reescrito** (entregable de M0): refleja la red Anvil 81234, el contrato único `HotelNights`, PostgreSQL y Redis; incorpora las variables que el código exige y que faltaban (`CONTRACT_ADDRESS`, `WORKER_*`, `WORKER_BASE_URL`, `MCP_*`, `MONITOR_TARGETS`, `ADMIN_EMAIL`, `ALERT_EMAIL`, `SESSION_SECRET`, `JWT_SECRET`, `TICKET_SIGNING_SECRET`, `CHECKIN_SECRET_KEY`, `NEXT_PUBLIC_*`, `ANTHROPIC_*`) y retira las obsoletas (`HOTEL_NFT_ADDRESS`, `HOTEL_MARKETPLACE_ADDRESS`, `RPC_FALLBACK_URL`, `SENTRY_*`).
- **B-2 en curso**: el paquete `Redis.Redis` de winget es la versión 3.0.504 y **BullMQ 6 exige Redis ≥ 5.0.0** (recomendado 6.2.0), por lo que se instala **Memurai Developer** (compatible con Redis 7.x). La instalación está **bloqueada esperando la aprobación del diálogo de UAC** en el escritorio.
- **B-1 sigue bloqueante**: falta la contraseña del superusuario `postgres` (o la creación manual del rol `hotel_admin` y la base `hotel_nft_dev`) para poder completar M0 y ejecutar la verificación contra PostgreSQL.
- **Decisiones de proceso aplicadas**: se trabaja directamente en **Fase 3** con documentos técnicos mínimos y casos de uso solo de los flujos nuevos (compra separada, check-in, quema automática).

### 2026-09-21 — Base de datos creada (B-1 resuelto)

- **B-1 resuelto.** Creados el rol `hotel_admin` y la base `hotel_nft_dev` (propiedad del rol) en la instancia PostgreSQL 18 local, más la extensión `pgcrypto` (creada como superusuario para evitar problemas de permisos).
- **Esquema aplicado**: las 8 tablas y 23 índices del esquema real, extraídos de `packages/shared/src/db/migrator.ts` en lugar de reescribirlos a mano, para que no derive. Re-ejecución verificada como idempotente y sin errores.
- **Conectividad verificada con el DSN exacto de la aplicación** (`postgresql://hotel_admin:…@127.0.0.1:5432/hotel_nft_dev`) usando el cliente `pg` del proyecto sobre `scram-sha-256`: conecta, 8 tablas, `pgcrypto` instalada.
- **Nota sobre la credencial facilitada**: el usuario `anlucorporations` **no existe** en la instancia local; la contraseña recibida corresponde al superusuario **`postgres`**. El rol de la aplicación se creó con la contraseña que ya figuraba en `.env`. **Recomendación**: rotar la contraseña del superusuario, que se ha compartido en claro por chat, y no reutilizarla en ningún otro entorno.
- **B-2 sigue abierto**: la instalación de Memurai **no llegó a completarse** (el diálogo de UAC no se aprobó: no hay servicio, ni carpeta, ni `winget list` que lo reconozca). Redis sigue ausente y sin él no se puede cerrar M0 ni arrancar la cola de D-03.

### 2026-09-21 — Entorno levantado: Redis y Anvil (B-2 resuelto)

- **B-2 resuelto.** El MSI de Memurai **no instala** en esta máquina: el UAC sí se aprobó (`MsiRunningElevated = 1`) pero el instalador aborta en su propia comprobación de puerto (`ca_SilentCheckIfPortIsAvailable`, con una acción previa que falla por permisos: `SFXCA: Failed to create temp directory. Error code 5`), y el puerto 6379 estaba libre, así que no es un conflicto real.
  **Solución aplicada**: extracción administrativa del MSI oficial (`msiexec /a`) a `C:\Users\lucci\memurai`, sin ejecutar las acciones personalizadas ni instalar servicio. **Sin descargas de terceros.**
- **Redis operativo y verificado**: Memurai 4.1.2 con `redis_version: 7.2.5` (BullMQ 6 exige mínimo 5.0.0 y recomienda 6.2.0). Verificado con los clientes del propio proyecto: `ioredis` responde `PONG` y una cola BullMQ real crea el trabajo, lo recupera y **deduplica por `jobId`**, que es el mecanismo que exige el SRS §6.
- **Script de arranque añadido**: `scripts/dev/start-redis.ps1` (arranca, comprueba versión y permite parar con `-Stop`; acepta `MEMURAI_HOME`).
- **Anvil operativo**: `anvil --chain-id 81234 --block-time 2` en `127.0.0.1:8545`; verificado con `cast`: `chain-id = 81234`, cuenta 0 `0xf39F…2266` con 10.000 ETH, coherente con las claves del entorno.
- **`.env` local regenerado** (62 variables, 45 con valor): secretos fuertes generados para este entorno (JWT, sesión, ticket, AES y MFA del MCP), cadena 81234 y URLs de los servicios propios. Quedan 17 vacías por diseño: direcciones del contrato (se llenan al desplegar en M1), credenciales externas del cliente y claves VAPID (requieren generar un par válido).

### Pendiente inmediato

1. **M1** en curso (contrato): al terminar, desplegar con el nuevo `Deploy.s.sol` y rellenar `CONTRACT_ADDRESS` / `NEXT_PUBLIC_CONTRACT_ADDRESS`.
2. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
3. Rotar la contraseña del superusuario `postgres` compartida por chat.
4. **M2** asume los 36 fallos de `pnpm test` al retirar SQLite del worker.

---

### 2026-09-21 — M0 COMPLETADO y M1 COMPLETADO (con verificación real)

**Entorno (M0).** PostgreSQL 18 con rol `hotel_admin`, base `hotel_nft_dev` y las 8 tablas aplicadas; Redis-compatible (Memurai 4.1.2, `redis_version 7.2.5`) verificado con ioredis y con una cola BullMQ real; Anvil en `chain-id 81234`; `.env` regenerado con secretos fuertes; **`/health/ready` responde HTTP 200 con `postgres`, `redis` y `polygonRPC` en `UP`**. El criterio «`pnpm test` verde» se trasladó a M2 (los 36 fallos son de `better-sqlite3`, que desaparece al retirar SQLite).

**Contrato (M1).** `HotelNights` ampliado con lo decidido: estado `checkedIn` + `markCheckedIn`/`isCheckedIn` con `RECEPTION_ROLE` (D-05), royalty por tipo **inmutable derivado de la habitación** (5 % simple y doble, 10 % suite) con eliminación del parámetro global y del rol de royalty (D-06), y **suelo de precio de listado** gobernable por administración (D-06). **16 suites y 145 pruebas Foundry en verde** (partida: 14 y 117). ABI regenerado, capa de aplicación alineada (roles, panel de royalty informativo, i18n en ES/EN/FR) y `pnpm typecheck` 6/6.

**Despliegue verificado on-chain (no simulado).** Nuevo `Deploy.s.sol` para el contrato canónico con bootstrap de roles y faucet opcional. Desplegado en Anvil y **comprobado con `cast`**: `treasury` correcto, `minListingPrice` 0,01 ETH, admin y MINTER en la cuenta 1, RECEPTION en la cuenta 3, **desplegador revocado como administrador**, `royaltyInfo` = 5 % para habitación 102 y 10 % para la 201, y faucet financiado con 100 ETH. `sync-deployment` genera `packages/shared/deployments/81234.json` con `address`, `block` y `abiHash` — el registro que antes era inválido y rompía el arranque de worker y MCP.

**Bugs reales encontrados y corregidos al verificar (no los detectaban `typecheck` ni los tests):**
1. **Cliente Redis: la primera operación fallaba siempre.** `getRedisClient()` usaba `lazyConnect: true` + `enableOfflineQueue: false`, así que el primer comando de cualquier proceso se rechazaba («Stream isn't writeable…») con Redis levantado: el health check reportaba Redis DOWN y la blocklist de JWT no podía escribir. Corregido en `redis/client.ts`, con **test de regresión** del tiempo límite en `health/service.ts`.
2. **`deploy-amoy.ps1` no parsea bajo PowerShell 5.1** (mismo problema de codificación descrito abajo). **Pendiente de arreglo.**
3. **El barril de `@hotel/shared` rompía el bundle del navegador**: reexporta BullMQ (solo servidor) y los componentes de cliente que importan valores desde `@hotel/shared` arrastraban `child_process` al cliente, de modo que **la home y `/historico` devolvían HTTP 500**. En corrección.
4. ~~`/api/sales/history` devuelve 500 cuando el worker no está levantado~~ **CORRECCIÓN: diagnóstico erróneo del orquestador.** Esa ruta no usa el worker: consulta `sale_events` directamente en PostgreSQL mediante `NFTsRepository.getSalesHistory()` y responde **200 con la lista vacía** cuando no hay ventas (verificado). Los 500 observados entonces provenían del servidor de desarrollo en estado inconsistente tras el fallo del bundle de cliente, no de la ruta. Se deja constancia para no arrastrar un hallazgo falso.

**Restricciones del entorno detectadas:** el servidor de desarrollo de Next consume ~2,2 GB y la máquina quedó con 1,5 GB libres, lo que produjo timeouts y 500 espurios; conviene no mantener varios servidores de desarrollo a la vez. Además, **PowerShell 5.1 interpreta los `.ps1` sin BOM como ANSI**, así que los acentos y guiones largos rompen el análisis sintáctico: los scripts de Windows deben mantenerse en ASCII puro (documentado en `scripts/dev/start-redis.ps1`).

**Aprendizaje que valida la auditoría:** `pnpm typecheck`, las 423 pruebas de workspace y las 145 de Foundry estaban en verde **mientras las dos páginas principales del producto no renderizaban**. Ninguna verificación sustituye a ejecutar el sistema.

### Pendiente inmediato

1. ~~Barril de shared en el cliente (home e histórico en 500)~~ **RESUELTO Y VERIFICADO.** Nuevo punto de entrada isomorfo **`@hotel/shared/domain`** (`packages/shared/src/browser.ts`, expuesto como subpath y como entrada de tsup), con lista cerrada de módulos isomorfos (constantes, red, dominio y ABIs) y sin dependencias de servidor; `src/index.ts` intacto para los consumidores de servidor. Migrados 27 imports de `apps/web` (los de valor, que eran los que rompían, y los de solo tipo por coherencia). **Verificación independiente del orquestador**: `pnpm --filter @hotel/web build` genera **20/20 páginas** sin el error, y en un servidor de desarrollo **nuevo** responden HTTP 200 `/`, `/historico`, `/mis-noches`, `/api/nfts` y `/health/ready` (este último `READY` con PostgreSQL, Redis y cadena en `UP`); la home renderiza el catálogo. **Recomendación derivada**: el fallo se manifestaba en `next dev` mientras `next build` lo toleraba por tree-shaking, así que conviene añadir una regla de lint (`no-restricted-imports`) que prohíba importar el barril raíz desde componentes de cliente, para que una regresión rompa en CI y no solo en desarrollo.
2. ~~`deploy-amoy.ps1` no parsea~~ **RESUELTO**: reescrito en ASCII puro (validado con el analizador de PowerShell 5.1) y alineado con el contrato canónico `HotelNights`.
3. **Decisiones de contrato que el subagente dejó abiertas y conviene confirmar**: `markCheckedIn` permite marcar noches caducadas y sin venta previa (¿es deseable?); `setMinListingPrice` no tiene cota inferior (el admin puede desactivar el suelo); el 2.º argumento del constructor está vestigial; subir el suelo no invalida listados ya creados.
4. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
5. Rotar la contraseña del superusuario `postgres` compartida por chat.
6. **M2** asume los 36 fallos de `pnpm test` al retirar SQLite del worker.

---

### 2026-09-21 — M2 COMPLETADO: una sola base de datos

**Qué cambió.** El worker ya no usa SQLite: todo su estado vive en PostgreSQL, la misma base que la web (D-09). Cuatro tablas nuevas — `worker_checkpoints`, `worker_processed_logs`, `worker_aggregate_counters` y `worker_sale_history` — con importes en `NUMERIC(78,0)` (verificado `precision=78, scale=0`), la fila semilla de contadores y `better-sqlite3` eliminado del proyecto (también de `onlyBuiltDependencies`). Los dos almacenes pasan a `PgCheckpointStore` y `PgAggregateStore` sobre el pool compartido; `applyEvent` conserva la atomicidad con `BEGIN` + `INSERT` de la clave de idempotencia + `SELECT … FOR UPDATE` + `COMMIT` (el `FOR UPDATE` es necesario porque las sumas en wei se calculan en `bigint` en JS y se persisten ya calculadas). `runMigrations()` se ejecuta al arrancar en cerrado (D-03).

**Verificación independiente del orquestador:**
- `pnpm test` (raíz) → **7/7 tareas, exit 0**: shared 151, web 109, worker 72, contracts 145, monitor 25, mcp 23 = **525 pruebas, 0 rojos**. Es la primera vez en el proyecto que la suite completa está en verde.
- `pnpm typecheck` 6/6; `forge test` 16 suites / 145 pruebas.
- Cero referencias a `better-sqlite3|sqlite` en `apps/` y `packages/`.
- Base real: las 4 tablas creadas, `NUMERIC(78,0)` correcto, fila semilla presente.
- **Worker arrancado de verdad** contra PostgreSQL: `/health` → `{"status":"ok","lastBlock":1882,"headBlock":1882,"lag":0}`, `/aggregates` y `/history` responden, y el checkpoint **persiste y avanza** (1615 → 1886 durante la ejecución) mientras el fichero SQLite ha desaparecido.

**Bugs reales encontrados al ejecutar (ninguno detectable con `typecheck` ni con las pruebas):**
1. **Los tres servicios de fondo no arrancaban en desarrollo.** Node no carga `.env` por sí solo (Next sí), así que worker, mcp y monitor fallaban con `EnvironmentValidationError` pidiendo variables que sí estaban en `.env`. Corregido cargando el fichero de la raíz del monorepo en los tres `main.ts`, sin dependencias nuevas (`process.loadEnvFile`). **Mi afirmación de «M0 completado» era optimista**: había verificado la web, no estos tres servicios.
2. **El validador rechazaba el formato de remitente documentado.** `SMTP_FROM` con `Nombre <correo@dominio>` (el formato habitual de la cabecera SMTP y el que muestra `.env.example`) lo rechazaba `z.string().email()`, impidiendo arrancar worker y monitor con la plantilla del repositorio. Añadido `env.emailWithDisplay`, que acepta ambos formatos.
3. **`SMTP_PASS` obligatorio impedía arrancar sin proveedor de correo**, que es justo el caso de una demo local. Ahora es opcional (vacío) con la consecuencia documentada: el envío fallará y quedará registrado para reconciliación, pero el sistema arranca.
4. **Las pruebas contaminaban los artefactos de despliegue.** `forge test` reescribía `deployments/latest.json` y `deployments/31337.json` con la dirección efímera del contrato de prueba, pudiendo falsear el registro que lee el worker. El directorio de salida es ahora explícito (`Config.outputDir`) y las pruebas escriben en `deployments/test/`; además los registros crudos por cadena dejan de versionarse (el registro canónico y validado por esquema es `packages/shared/deployments/<chainId>.json`).

### Pendiente inmediato

1. ~~Decisiones de contrato abiertas~~ **RESUELTAS e implementadas** (D-18, D-19, D-20): `markCheckedIn` exige venta previa, el suelo de reventa no admite 0 y el constructor recibe solo la tesorería. 146 pruebas Foundry en verde.
2. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
3. Rotar la contraseña del superusuario `postgres` compartida por chat.
4. ~~M3~~ **COMPLETADO Y VERIFICADO** (ver el registro de M3 más abajo). El siguiente hito es **M4**: compra primaria y reventa operativas con el calldata verificado y firmado, más el retiro del vendedor.
5. **Redesplegar el contrato endurecido** (D-18/D-19/D-20) y resincronizar el registro: el Anvil en marcha tiene la versión anterior. Reiniciar Anvil mantiene la dirección determinista `0x5FbD…aa3`.
6. Deuda menor anotada: el comentario de `useAdminWrite.ts` que menciona royalty como caso de escritura, la resolución del bloque de despliegue en modo fail-open, la tabla de idempotencia compartida entre correo y agregados (blindaje opcional con columna `source`), `/api/auth/session` reporta 401 (no 403) para un rol ajeno al back-office, y el resguardo QR sigue emitiéndose sin demostrar titularidad (se cierra en M5).

---

### 2026-09-21 — M3 COMPLETADO: acceso cerrado (D-04)

**Qué cambió.** Un solo sistema de autenticación canónico — contraseña + TOTP obligatorio + JWT de 15 min con rotación de refresh — con la tabla `admin_users` (bcrypt + semilla TOTP cifrada con AES-256-GCM y bloqueo temporal), repositorio de usuarios, cifrado reutilizable en `auth/crypto.ts`, guard de autorización y **401/403/500 en todas las rutas de `/api/admin/**` y `/api/reception/**`**. Desaparecen las credenciales embebidas (`SYSTEM_USERS`), el TOTP por defecto `JBSWY3DPEHPK3PXP` y la cadena de conexión con contraseña en `db/pool.ts`: ahora `requireSecret` falla en cerrado. SIWE sale del camino crítico y la pantalla de acceso pasa a contraseña + TOTP. Aprovisionamiento con `pnpm --filter @hotel/shared provision:admin` (y `provision:reception`), que entrega el `otpauth://` y los códigos de rescate una sola vez.

**Verificación de extremo a extremo (la hice yo, contra PostgreSQL, Redis y la web vivos):**

| Paso | Resultado |
|---|---|
| Aprovisionar operador real contra la base | ✅ usuario, semilla y códigos de rescate |
| `GET /api/admin/metrics` sin credenciales | ✅ **401** |
| Token forjado | ✅ **401** |
| Login con contraseña | ✅ **200** con reto MFA |
| TOTP correcto (generado desde la semilla) | ✅ **200** con `accessToken` y rol |
| TOTP incorrecto | ✅ **401** |
| `GET /api/admin/metrics` con el token | ✅ **200** |
| Token de admin en ruta de recepción | ✅ **403** (no 401) |
| Logout | ✅ **200** |
| **El mismo token tras el logout** | ✅ **401** (revocación efectiva) |

`pnpm typecheck` 6/6 y **`pnpm test` en verde con 619 pruebas** (contracts 146, shared 188, web 165, worker 72, monitor 25, mcp 23), sin ninguna conexión real a servicios externos desde las pruebas unitarias (0 `ECONNREFUSED`).

**Bugs reales encontrados al ejecutar (ninguno detectable con `typecheck` ni con las pruebas):**
1. **El camino de aprovisionamiento no podía ejecutarse.** El script se lanzaba con *type stripping* de Node, que exige extensión explícita en los imports relativos, mientras los 128 imports de `src` van sin extensión. Cambiado al runner que ya usa el resto del repo (`tsx`). Sin este arreglo **no había forma de crear un operador**, es decir, la plataforma era inaccesible.
2. **La web nunca cargaba el `.env` de la raíz.** Next solo lee los `.env` de su propio directorio, así que la aplicación venía funcionando **gracias a la cadena de conexión embebida en el código** que M3 retiró (correctamente). Al desaparecer, todas las rutas devolvían 500. Ahora el entorno se carga al evaluar `next.config.mjs`, antes de que Next arranque sus workers.
3. **Una caída de Redis devolvía 401 en vez del 500 documentado**: ioredis lanza `MaxRetriesPerRequestError`, cuyo mensaje no contiene «redis/connect/econnrefused», así que el guard lo clasificaba como credencial inválida y enmascaraba el despliegue roto.
4. **El `logout` devolvía éxito sin revocar el token si Redis fallaba** (el `catch` envolvía también la escritura en la blocklist): el access token seguía sirviendo hasta 15 minutos. Ahora solo se ignoran los errores del propio token, ambas revocaciones se intentan siempre y el fallo de Redis se propaga.

**Nota de proceso.** El subagente de M3 falló a mitad de camino. El estado que dejó era recuperable: 6 errores de tipo en un fichero de prueba (los arreglé: la prueba desestructuraba el resultado del guard y rompía el estrechamiento de la unión discriminada) y 4 pruebas en rojo por mockear módulos internos de un paquete pre-empaquetado. Además arrastró en su limpieza los procesos de Redis y Anvil, que hubo que levantar de nuevo.

---

### 2026-09-23 — M4 COMPLETADO: compra y reventa operativas (D-07)

**Qué cambió.** El cierre del hallazgo H-02. La compra, la reventa y el cobro pasan a tener **un único destino y un único camino de firma**:

- **Se firma lo que se revisa, byte a byte.** `useBuyNight` deja de reenviar `(tokenId, precio)` a un ABI y pasa a usar `useSendTransaction` con el objeto `PurchaseTxData` **ya verificado** (`verifiedTxRequest`, punto único que comparten el catálogo y el asistente). Antes la revisión decodificaba el calldata de `HotelNights` y la firma se enviaba al `HotelMarketplace` legacy: dos contratos, dos generaciones, y se firmaba el equivocado.
- **Un solo destino on-chain.** Desaparecen `marketplaceAddress` y `hotelMarketplaceAbi` del cliente; `list`/`unlist`/`claim` (antes `listForSale`/`cancelListing`/`withdraw`) se envían a `HotelNights` (`useListNight`, `useClaim`). El cobro del vendedor pasa a `claim()`, cuyo saldo se lee con `pendingWithdrawals(address)` del mismo contrato.
- **La reventa tiene su propia vista.** Nuevo `/reventa` (con entrada en la navegación y textos ES/EN/RU): el catálogo deja de mezclar ofertas de reventa (`fetchCatalog` solo primaria) y `fetchResaleMarket()` sirve los listados vigentes, descartando los que el contrato rechazaría (`listingOf.active == false`, noche consumida por check-in o fecha fuera de ventana). La vista nunca anuncia una compra que la cadena vaya a revertir.
- **Errores de reventa completos.** `resaleErrorMessage` reconoce ya `PriceBelowMinimum` (suelo anti-evasión de D-06) y `NightNotResellable` (noche consumida, D-05): antes el usuario solo veía el genérico «no se pudo completar».

**Redespliegue del contrato endurecido (pendiente nº 5 de M2, resuelto).** Anvil reiniciado limpio y `Deploy.s.sol` desplegado con el bootstrap de roles: `HotelNights` en `0x5FbD…aa3` (bloque 7), tesorería en la cuenta 0, **admin/minter/pauser/burner/treasurer en la cuenta 1**, **RECEPTION en la cuenta 3**, **desplegador revocado como administrador** (verificado con `cast`) y faucet de pruebas financiado con 100 ETH. Registro resincronizado (`packages/shared/deployments/81234.json`, `abiHash 0x9fa3…5f58`) y `.env` actualizado (`NEXT_PUBLIC_DEPLOYMENT_BLOCK=7`).

**Verificación independiente del orquestador (ejecutada, no simulada):**

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | 6/6 ✅ |
| `pnpm test` (workspace, sin conexiones reales) | **7/7 tareas, 644 pruebas, 0 rojos** (contracts 146, shared 189, web 182, worker 79, monitor 25, mcp 23) |
| `pnpm test:e2e:m4` (Anvil real, firmando) | ✅ 39/39 aserciones |
| `next build` | ✅ verde, 20/20 páginas estáticas y `/reventa` entre las rutas compiladas (1 warning previo y ajeno: el SDK de MetaMask pide `@react-native-async-storage/async-storage`) |
| Servidor real: `/`, `/reventa`, `/health/ready` | ✅ 200/200/200, `READY` con PostgreSQL, Redis y cadena `UP` |
| Catálogo `/` con una reventa viva on-chain | ✅ muestra la noche **103** (primaria) y **no** la 203 (listada en reventa) |
| Vista `/reventa` | ✅ muestra la 203 (etiqueta «Reventa») y no la 103 |
| **Listado consumido (caso límite real)** | ✅ creado on-chain un listado **activo sobre una noche con check-in** (`listingOf(104/20261023) = (0.3 ETH, true)` con `isCheckedIn = true`, y `buyResale` revierte `NightNotResellable`): la vista `/reventa` **no lo ofrece** y sí muestra el listado vigente de la 203 |
| Guardián de destino legacy | ✅ `legacy-target-guardian.test.ts` (7 invariantes sobre **todo** `apps/web/src`); probado con una sonda de regresión en `src/hooks/`: caza el ABI legacy, un segundo camino de firma y una dirección literal fuera de `config/chain.ts` (3 rojos), y vuelve a verde al retirarla |
| **Artefacto construido** (no solo el código) | ✅ inspeccionados los **45 chunks** del build final (`apps/web/.next/static`): **0 coincidencias** de `listForSale`/`cancelListing`/`marketplaceAddress`/`HotelMarketplace`, sí los selectores canónicos (`buyResale` en 3 chunks, `pendingWithdrawals` en 2) y el guardián de destino (`«no es el contrato canónico»`) |
| Test byte a byte | ✅ `verifiedTxRequest.test.ts` + comparación del `input` **minado** con el calldata verificado en el E2E |

**Verificación adversarial independiente (agente distinto del autor, sin acceso a su razonamiento).** Veredicto: **CUMPLE CON RESERVAS**. Lo que reprodujo por su cuenta:

- `pnpm turbo run typecheck --force` y `run test --force` (sin caché): 6/6 y 7/7, 0 rojos, y los mismos totales tras el arreglo del worker.
- Su **propio** `pnpm test:e2e:m4`, sobre la noche 102 / 2026-10-25 (eligió la primera fecha libre, sin pisar la evidencia anterior): 39/39, incluidas las comparaciones del `input` minado byte a byte. Hashes suyos: `mint 0x9e4a7e36…`, `buyPrimary 0x5b7236c6…`, `list 0xe37cb91a…`, `unlist 0x857fa380…`, `relist 0x3272b8c4…`, `buyResale 0x521babb2…`, `claim 0xcb39bc42…`, `markCheckedIn 0xc0665c6a…`.
- El registro de despliegue contra la cadena: código en `0x5FbD…aa3`, bloque 6 sin código y 7 con él, `treasury()`, `minListingPrice()`, los cinco roles en la cuenta 1, `RECEPTION` en la cuenta 3, desplegador **sin** admin, y el `abiHash` recalculado con el mismo método que `sync-deployment.ts`.
- Los 8 hashes del JSON de evidencia, uno a uno: existen, `to` = contrato canónico, selectores correctos (`buy 0xd96a094a`…), bloques monótonos 217→231 en el orden del guion, `value` 0,1/0,2 ETH y tokenId correcto; y las 39 `comprobaciones` coinciden en orden con los `ok()` del script.
- Todas las escrituras de `apps/web/src`: única dirección de compra/reventa/cobro = `contractAddress`; cero referencias legacy.
- Estado real servido: `/health/ready` `READY`, `/` solo la 103 y `/reventa` solo la 203.
- Y sobre las pruebas nuevas: que el guardián **sí** se pone rojo con una regresión real (un `import` legacy), y —hallazgo importante— que **el “byte a byte” no distingue generaciones** porque `buy(uint256)` del marketplace legacy tiene el mismo selector que el canónico: lo que separa ambos es la **dirección**.

**Reservas del verificador y qué se hizo con cada una:**

| Reserva | Acción en M4 |
|---|---|
| `verifiedTxRequest` no validaba `to`/`value`: la garantía dependía solo de que el llamante usara `review.verified` | **Corregido**: el firmante recibe ahora el contrato esperado y **falla en cerrado** si el destino no es `contractAddress` (el calldata por sí solo no distingue generaciones). Pruebas nuevas para el destino ajeno y para el `value` no numérico; `useBuyNight` y `PurchaseHandoff` lo invocan con `contractAddress` |
| El guardián se dejaba burlar (import en `src/hooks/`, fichero de test, segundo camino de firma con dirección hardcodeada) | **Corregido**: el guardián recorre **todo** `src`, exige que toda llamada a `sendTransaction(` pase por `verifiedTxRequest(`, y prohíbe direcciones literales fuera de `config/chain.ts`. Probado con una sonda de regresión: 3 rojos, y verde al retirarla |
| `fetchCatalog` por PostgreSQL no aplicaba la ventana de 90 días (podía ofrecer una noche vencida) | **Corregido**: el camino de BD filtra con el mismo `inWindow` que el de RPC |
| `fetchResaleMarket` se tragaba los errores por token: un RPC caído ocultaba listados vendibles | **Corregido en parte**: si había listados y **ninguna** lectura respondió, se propaga el error y la vista muestra su estado degradado en vez de una lista vacía engañosa. El fallo parcial (unas lecturas sí, otras no) queda anotado como deuda |
| Legacy vivo fuera del cliente (`hotelMarketplaceAbi` exportado, `listener.ts` con `marketplaceAddress`, `amoy-lifecycle.ts` importándolo) | **Anotado** para M9 (retirada de la generación legacy). La frase «desaparecen del cliente» es literal y cierta; leída como «del repo» sería falsa |
| Ninguna vista filtra `whenNotPaused`: con el contrato en pausa se ofrecen compras que revierten con `EnforcedPause` | **Anotado** para M7 (el back-office ya tiene la pantalla de pausa; falta que las vistas la reflejen) |
| «`next build` 21/21 páginas» no era reproducible | **Corregido** en este documento: el build genera 20/20 páginas estáticas y lista `/reventa`; el «21» era una lectura imprecisa de la tabla de rutas |

**E2E real sobre Anvil (compra primaria → listado → cancelación → re-listado → reventa → `claim` → guardas).** Habitación 102 (primera fecha libre de cada ejecución; en la evidencia actual, 2027-01-11), 0,1 ETH primaria y 0,2 ETH reventa (royalty 5 % = 0,01 ETH al hotel, 0,19 ETH al vendedor). Hashes:

| Paso | Hash |
|---|---|
| `mint` | `0x6515070659d7bfa89dedc97e9f0a302fc648ba415a9c356976a2cd1995745683` |
| `buy` (primaria) | `0x55f20af575db18c1451d8dc8eef0ed33251ac2ae5e3fe975d504d951996da312` |
| `list` | `0x6e3b9114de761bc3a711c678b720ee91e372ae3604b4d4a9df2f7264cc59994a` |
| `unlist` | `0x90be2c8b440e70e1eee868def705f21de943ae71c4cbab06cdf83ee081d0de0b` |
| `list` (re-listado) | `0xb2e84ae7a0ce5bf17237726717461163856e933fc8ccffa75ce612e53f71b8c1` |
| `buyResale` | `0xd3e201b8235619bf65a086457431cca3779527a89140cb2e2d1b4aa2f15564f3` |
| `claim` | `0x0f10364e14e586ee314099084391c1cf0bce0b2e2840c52a2b006c836a476610` |
| `markCheckedIn` | `0xec215dd118558a97862d2d4f508e152d9e2ac15b12607195816c378d8d75c43d` |

Evidencia completa (39 comprobaciones, importes y direcciones): `RepoTecnico/evidencias/m4-e2e-anvil.json`. Reproducible con `pnpm test:e2e:m4` **sin reiniciar la cadena**: el script elige la primera fecha libre de la habitación de prueba.

**Hallazgos reales al ejecutar y revisar (ninguno detectable con `typecheck` ni con las pruebas que había):**
1. **El worker quedaba MUDO tras reiniciar la cadena, y lo hacía en silencio.** Al reiniciar Anvil el contrato vuelve a la misma dirección determinista (`0x5FbD…aa3`), así que `rebindCheckpoint` no detecta redeploy —la dirección no cambió— y el checkpoint persistido de la cadena anterior sobrevivía. Medido en real: `/health` reportaba `lastBlock: 1890` con `headBlock: 367` (**`lag: -1523`**) y **`status: "ok"`**, y `/aggregates` devolvía todo a cero (`mintedCount: 0`, `soldCount: 0`) con cuatro noches minteadas y cinco ventas reales en la cadena. El monitor nunca habría alertado. Corregido con dos reglas mínimas: (a) al arrancar, si el checkpoint de email o el de agregados está por delante de la cabeza, se rebobina al `deploymentBlock` (los agregados, con `reset`, porque describen una cadena que ya no existe) y se registra un aviso; (b) un `lag` negativo degrada la salud en vez de reportar `ok`. Verificado contra el estado real averiado: `/aggregates` pasa a `mintedCount 4`, `soldCount 3`, 0,5 ETH primaria, 0,4 ETH reventa, 0,02 ETH royalty y `lastBlock` pegado a la cabeza; `/history` devuelve las ventas con los hashes del E2E. El verificador independiente lo confirmó **después de añadir otra ejecución del E2E**: el agregado volvió a cuadrar solo (5 minteadas, 4 primarias, 0,6/0,6/0,03 ETH) — sigue la cadena, no un número congelado. 7 pruebas nuevas (79 en el worker). **Es deuda de M6** (listener con heartbeat y alerta de silencio, D-12): se corrige ahora porque el redespliegue de M4 es lo que la destapó y porque sin indexador M5 no tiene datos.
2. **El catálogo secundario podía ofrecer una compra imposible.** Un listado **sobrevive al check-in** en el contrato (`markCheckedIn` no borra `_listings`), así que `listingOf(tokenId).active` puede ser `true` mientras `buyResale` revierte con `NightNotResellable`. `fetchResaleMarket()` descarta ahora esas noches leyendo `isCheckedIn`, el E2E lo comprueba consumiendo una noche (`list` → `NightNotResellable`) y **se verificó además en vivo**: con un listado activo sobre una noche consumida creado a propósito en la cadena (`listingOf(104/20261023) = (0.3 ETH, true)` con `isCheckedIn = true`), la vista `/reventa` no lo ofrece y sí muestra el listado vigente de la 203. Sin esto, la vista habría anunciado reventas que revierten al firmar.
3. **El guardián de destino legacy se puso rojo con mi propio comentario.** La primera pasada detectó `listForSale`/`cancelListing` en un comentario de `useListNight.ts`. Es exactamente su función —una referencia legacy en cualquier forma no debe colarse—, así que se reescribió el comentario en lugar de relajar el guardián.
4. **`unlist` no estaba cubierto por ninguna prueba** y es la operación que apaga la oferta en la vista secundaria. El E2E ahora cancela el listado y vuelve a listarlo, comprobando que `listingOf.active` sigue el estado real tras cada paso.
5. **El punto único de firma no se autovalidaba** (lo demostró la verificación adversarial: `verifiedTxRequest({to: 0x1111…})` devolvía el request sin lanzar). Ahora el firmante recibe el contrato esperado y falla en cerrado si el destino no es `contractAddress`, además de validar la forma del calldata y el `value`. Importa porque **el `buy(uint256)` legacy comparte selector** con el canónico: el calldata es byte a byte idéntico y lo único que distingue ambas generaciones es la dirección. Hay prueba explícita de esa equivalencia y del rechazo del destino ajeno.

**Deuda anotada (no bloquea M5):** **`pnpm lint` sigue rojo por causas previas a M4** —40 errores en `apps/web` (rutas API, tests y `recepcion/page.tsx`) y 56 en `packages/shared` (`any` explícitos y una variable sin usar)—, ninguno en los ficheros de este hito; el `lint` es gate bloqueante en CI, así que entra en el trabajo de M8 (D-08) junto con la cobertura y los E2E. Además: la **generación legacy sigue viva fuera del cliente** (`hotelMarketplaceAbi` exportado y `events/listener.ts` usando `marketplaceAddress`, más `scripts/e2e/amoy-lifecycle.ts`), que es retirada de M9; **ninguna vista filtra `whenNotPaused`**, así que con el contrato en pausa `/` y `/reventa` ofrecen compras que revierten con `EnforcedPause` (M7, donde el back-office ya tiene la pantalla de pausa); en `fetchResaleMarket` un fallo **parcial** de RPC (unas lecturas sí y otras no) sigue mostrando una lista incompleta sin avisar —solo el fallo total degrada la vista—; el `/health` del worker responde **503 con `emailDegraded: true`** mientras no haya proveedor SMTP (`SMTP_PASS` vacío): el checkpoint de email se detiene en la primera venta no entregada, que es el invariante at-least-once documentado en M2 (el agregado y el histórico sí avanzan), y con el correo mal configurado el worker **reintenta el mismo aviso cada ~5 s indefinidamente** llenando el log de `EMAIL_DELIVERY_FAILED`: es el caso que M6 cierra con la cola única y la reconciliación (D-03), conviene limitar el reintento con un tope por evento; `unlist` es la única escritura de reventa que no pasa por un objeto verificado (no hay importe que verificar); el catálogo primario que lee de PostgreSQL puede ofrecer una noche ya vendida si el indexador va retrasado (el contrato la rechaza; la ventana de fechas sí se aplica ya en ambos caminos); la vista secundaria no tiene aún filtros equivalentes a los del catálogo (RF-14 sigue siendo del catálogo primario); y `/reventa` se ha añadido a la lista de rutas del spec de accesibilidad (`e2e/a11y.spec.ts`) pero **la suite de Playwright no es ejecutable en esta máquina**: los binarios instalados de Chromium (1234/1243) no son los que espera la versión de `@playwright/test` (1223), así que las 6 rutas fallan por entorno y no por el código. Es material de M8 (gates de CI), donde además deberá ejecutarse de verdad.

### Pendiente inmediato

1. **M5 (recepción)** es el siguiente hito: `markCheckedIn` on-chain, EIP-712 obligatorio y el mismo QR rechazado dos veces (el filtro de noches consumidas que M4 añadió a la vista secundaria ya depende de `isCheckedIn`).
2. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
3. Rotar la contraseña del superusuario `postgres` compartida por chat.
4. Confirmar con el cliente lo pendiente de M4 que no depende de nosotros: suelo de reventa definitivo, royalties por tipo (5 %/10 %) y política de reventas fuera de la plataforma.
5. Deuda menor heredada: el comentario de `useAdminWrite.ts` que menciona royalty como caso de escritura, la resolución del bloque de despliegue en modo fail-open, la tabla de idempotencia compartida entre correo y agregados, y `/api/auth/session` que reporta 401 (no 403) para un rol ajeno al back-office.
6. **Reservas de la verificación adversarial que no son de M4** (están anotadas con su destino): filtro de `paused()` en `/` y `/reventa` (M7), retirada de la generación legacy de `packages/shared` y `scripts/e2e/amoy-lifecycle.ts` (M9), tope de reintento por evento en el aviso de correo (M6) y aviso al usuario cuando la lectura de listados falla solo en parte (deuda menor).

---

### 2026-09-23 — M5 COMPLETADO: recepción (D-05, D-13)

**Qué cambió.** El check-in deja de ser una promesa y pasa a ser un ancla: **se firma `markCheckedIn(tokenId)` en el contrato canónico o el check-in no ocurre**.

- **Ancla on-chain obligatoria.** `ReceptionService` usaba el ABI de la generación legacy y se instanciaba **sin clientes** —el anclaje nunca ocurría— y devolvía éxito con `onChainTxDispatched: false`. Ahora recibe la hot-wallet de recepción (`RECEPTION_WALLET_PRIVATE_KEY`), exige el hash del ancla y **simula antes de difundir**: como una transacción firmada se difunde aunque vaya a revertir, la simulación es lo que detecta `AlreadyCheckedIn` (reconcilia el índice y responde «ya consumida») y `NightNotSold` (D-18) **antes** de marcar la base. El servicio es **singleton por proceso** en la ruta y **serializa los anclajes**, para que dos check-ins simultáneos en dos puestos no colisionen en el `nonce` de la misma hot-wallet.
- **Resguardo de un solo uso.** Cada ticket JWS lleva ahora un `jti` propio (`createTicketJWS`) y `verifyTicketJWS` **falla en cerrado** si falta. Recepción lo consume en **Redis** (`SET NX EX`, `consumeOnce`) antes de leer el estado: el mismo QR escaneado dos veces —incluso a la vez desde dos puestos— se rechaza con **409 `TICKET_YA_USADO`**. Si el ancla no llega a consumir la noche (RPC caído, wallet sin fondos, noche revendida) el resguardo **se libera** para poder reintentar; si la noche ya estaba consumida, el pase queda gastado.
- **EIP-712 obligatorio (cierre de H-05).** Los **tres** endpoints que emitían el pase (`/api/qr/[tokenId]`, su envío por correo y `/api/wallet/pass/[tokenId]`) verificaban la firma *solo si el cliente enviaba las cabeceras*: sin ellas se emitía un pase válido 7 días para **cualquier** `tokenId`. Ahora un único helper (`requireTicketOwnership`) exige la firma del titular (401 sin ella), acota la vigencia a **5 minutos** y consume el `nonce` una sola vez en Redis (replay → 401).
- **Un check-in por noche, también entre puestos.** El pase de un solo uso cierra el doble escaneo del MISMO resguardo, pero de una noche se pueden emitir varios pases (basta pedir el resguardo dos veces): dos puestos podían leer «noche libre», simular bien y **difundir dos transacciones** —una revertía on-chain— mostrando dos veces «check-in confirmado». Un **cerrojo distribuido por noche** (`RedisCheckInLock`, `SET NX EX` de 15 s) hace que el segundo puesto reciba **409 `CHECKIN_EN_PROCESO`** y que el resguardo no se le gaste al huésped.
- **Contingencia sin PII (D-13/D-14), reforzada tras la verificación adversarial.** La prueba de posesión se valida contra un patrón estricto por tipo: dirección de wallet, hash de transacción o **código de resguardo emitido por el hotel** (`MDS-` + 6-12 caracteres en mayúsculas). Así un nombre, un teléfono o un DNI no pueden satisfacerlo por accidente (el patrón laxo anterior los aceptaba y los **persistía**). La detección de documentos normaliza separadores (`12345678-Z`, `12345678 Z`, `123.456.78z`) y el **motivo de contingencia pasó de texto libre a vocabulario cerrado** (`SIN_DISPOSITIVO`, `RESGUARDO_IMPRESO`, `FALLO_TECNICO`, `OTRO`), porque era el otro campo donde cabía un DNI escrito a mano. El camino de contingencia ancla on-chain **igual** que el del QR y respeta el mismo cerrojo por noche.
- **PMS sin PII (D-13).** `PmsAdapter` ya no genera ninguna ficha policial simulada ni conoce nombre/documento/nacionalidad; la ruta `/api/reception/pms-sync` pasa a `RECEPTION_ROLE` (es un gesto de mostrador) y **rechaza con 400** cualquier cuerpo que traiga `guestName`, `documentNumber`, `documentType` o `guestNationality`.
- **UI de recepción honesta.** El banner de éxito muestra el **hash del ancla** (con enlace si hay explorador), advierte de que cada resguardo sirve una sola vez y de que no se admiten datos personales en la contingencia.

**Verificación ejecutada (real, no simulada):**

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | 6/6 ✅ |
| `pnpm test` | **7/7 tareas, 677 pruebas, 0 rojos** (contracts 146, shared 208, web 196, worker 79, monitor 25, mcp 23) |
| `pnpm test:e2e:m5` (Anvil + PostgreSQL + Redis reales) | ✅ **33/33 comprobaciones** |
| Guardián de M5 (`reception-guardian.test.ts`) | ✅ 5 invariantes: titularidad obligatoria en los tres pases, sin verificaciones EIP-712 sueltas, sin campos de identidad, ABI canónico y consumo del `jti` |
| **Flujo HTTP real completo** (servidor de producción en 3100) | ✅ `/api/qr` sin firma → **401**; con la firma del titular → **200** + JWS; login real de recepción (contraseña + TOTP) → sesión; `POST /api/reception/checkin` → **200** con ancla on-chain (el propio E2E mide **41 ms** en servidor, muy por debajo del SLA de 500 ms); **el mismo resguardo otra vez → 409 `TICKET_YA_USADO`** |
| Cadena tras el check-in | ✅ `isCheckedIn` = true, evento `CheckedIn`, tx firmada por la hot-wallet de recepción y calldata `markCheckedIn(uint256)` |

**Verificación adversarial independiente (agente distinto del autor).** Veredicto: **CUMPLE CON RESERVAS**. Reprodujo por su cuenta `pnpm turbo run typecheck --force` (6/6) y `run test --force` (7/7), ejecutó su **propio** `pnpm test:e2e:m5` (29/29 en ese momento) y verificó los hashes con `cast` (status 1, `from` = recepción, selector `0x37b30f26`, tokenIds decodificados del calldata, evento `CheckedIn`, `isCheckedIn`). Su falsación central: **no encontró ningún camino para usar el mismo pase dos veces** ni para obtener un pase sin firma, y confirmó que la doble confirmación de una noche es imposible on-chain. Además detectó un **defecto real** que he corregido:

| Reserva del verificador | Acción |
|---|---|
| **PII por el camino de contingencia**: con el patrón laxo de «código de resguardo» (`[A-Za-z0-9-]{6,32}`) se aceptaban y **persistían** `JuanPerezGarcia`, `JUAN-PEREZ-GARCIA`, `600123456`, `12345678`; y el campo `reason` era **texto libre** (probó «DNI del huésped 12345678Z…») | **Corregido**: el código de resguardo exige el prefijo que emite el hotel (`MDS-` + 6-12 en mayúsculas) y el motivo pasa a **vocabulario cerrado** (`SIN_DISPOSITIVO`, `RESGUARDO_IMPRESO`, `FALLO_TECNICO`, `OTRO`) con nuevo error de dominio `MOTIVO_INVALIDO`; UI con lista desplegable; 5 pruebas nuevas de evasión y 4 comprobaciones más en el E2E |
| «shared 203 / 672 pruebas» y «200 en 121 ms» no reproducibles | **Corregido**: cifras finales 677 pruebas y, en lugar del tiempo de la comprobación HTTP (sin artefacto duradero), se cita el **41 ms** que mide el E2E en servidor |
| Comentarios «Headers opcionales» en `send-email` y `wallet/pass` | **Corregido**: ahora dicen explícitamente que son obligatorios y que sin ellos la respuesta es 401 |
| `markCheckedIn` no guarda el hash del ancla en la BD (sin traza off-chain de qué tx ancló cada check-in) | **Anotado** para M6/M7 (columna `check_in_tx_hash` en `nfts`): el hash sí se devuelve en la respuesta y la UI lo muestra |
| El guardián es textual y solo mira `apps/web` | **Anotado**: reforzarlo (y cubrir `packages/shared`) junto con el guardián de M4 en M8 |
| Ventana residual del cerrojo (15 s) y falso 200 si el RPC se cuelga | Ya documentada en la deuda de abajo; el verificador la confirmó como el único hueco real |

**Nota de proceso (para futuras verificaciones):** lanzar dos suites a la vez en el mismo workspace se rompe entre sí — `tsup` limpia `packages/shared/dist` al empezar (el otro proceso veía tipos inexistentes: `TS2353`) y las pruebas de Foundry que escriben el registro de despliegue se pisan (`test_DeployFaucetWhenEnabled` falló con «faucet no registrado»). Todo eso desaparece ejecutando en frío. Además, las pruebas de `bcrypt` de `@hotel/shared` superaban el timeout de 15 s cuando turbo ejecutaba los seis paquetes a la vez (fallos intermitentes de una suite verde): el `testTimeout` del paquete sube a 60 s con el motivo documentado.

**E2E de M5 (`packages/contracts/scripts/e2e/m5-checkin.ts`).** Habitaciones 105 (camino QR) y 106 (contingencia), 0,11 ETH primaria y la **primera fecha libre** de cada habitación en cada ejecución (en la evidencia actual: 105 / 2026-10-28 y 106 / 2026-10-26). **33 comprobaciones** (incluye el rechazo de `JuanPerezGarcia`, `600123456` y `12345678` como «código de resguardo»). Hashes del último E2E (evidencia en `RepoTecnico/evidencias/m5-e2e-anvil.json`):

| Paso | Hash |
|---|---|
| `mint` (105) | `0x833f52f4817db956556b15711c314be8c736e47241cafb0e630194aebcad72d2` |
| `buy` (105) | `0x4f4b7a7c31f20b07366de10d5a0b614f06b4253aaca199a936c5b02b8a7c9932` |
| `markCheckedIn` (QR) | `0xb6a1045c20c01d498892c9d565a861a494f452e77dfb917f7d87ec269606e9cf` |
| `mint` (106) | `0x3361f6c1f5dce72ac8f39e2865952ae7c23e75543b9d5e963513bdf03218213a` |
| `buy` (106) | `0x8c9f786fd40015dcd4e5ca7032c20bd97930aff13249dae1078844302fc24f8b` |
| `markCheckedIn` (contingencia) | `0x6dbe5373ba1bc55617e7c60e14ec317e34e1a1f12a8a84fd14a4e61554d9e811` |
| `markCheckedIn` (verificación HTTP manual, ver arriba) | `0x46c4a891d495d7c2f53a3a2b137aacdb9e854a11366bab5392a936a664e36b55` |

Reproducible con `pnpm test:e2e:m5` sin reiniciar la cadena (elige la primera fecha libre de cada habitación).

**Hallazgos reales al ejecutar (ninguno detectable con `typecheck` ni con las pruebas que había):**
1. **Los reverts del ancla no se detectaban.** Una transacción firmada se difunde aunque vaya a revertir —el error solo aparece en el recibo—, así que el `catch` que mapeaba `AlreadyCheckedIn`/`NightNotSold` era **código muerto** y la base podía quedar marcada como consumida con un ancla fallida. Corregido simulando (`simulateContract`) antes de difundir: el coste es una llamada RPC sin espera de minado y el check-in sigue en ~40 ms.
2. **El orden consumo/estado decidía el mensaje.** Con la comprobación de la base antes del consumo, el segundo escaneo devolvía `YA_CONSUMIDA` y el uso único no actuaba como garantía distribuida. Ahora se consume el `jti` primero: dos escaneos simultáneos se resuelven con exactamente un `TICKET_YA_USADO`.
3. **El E2E no terminaba nunca.** El pool de PostgreSQL, el cliente de Redis y la cola de BullMQ mantienen el proceso vivo: sin cierre ordenado el script se quedaba colgado tras completar todas las comprobaciones (la primera ejecución parecía un fallo y era un cierre pendiente). Corregido con `closeRedisClient`/`closeDbPool` y cerrando la cola.
4. **El script no era idempotente.** Repetirlo sobre el mismo Anvil revertía con `DuplicateNight` (y `cast 4byte` no reconoce el selector, hubo que calcularlo): ahora elige la primera fecha libre por habitación.
5. **`server-only` rompía la suite de pruebas.** Al importar las rutas de servidor desde Vitest, el marcador lanzaba («cannot be imported from a Client Component»): se resuelve con un doble vacío documentado en `apps/web/test/empty-server-only.ts` (la protección del bundle la sigue aplicando Next en la compilación).
6. **La carrera que el pase de un solo uso NO cerraba.** Durante la propia verificación apareció el hueco: dos pases distintos de la misma noche (la API permite pedir el resguardo dos veces) escaneados a la vez en dos puestos pasaban los dos la comprobación de estado y difundían dos anclajes, uno de los cuales revertía on-chain mientras ambos mostraban «check-in confirmado». Cerrado con el **cerrojo por noche** y probado (cerrojo ocupado → `CHECKIN_EN_PROCESO` sin gastar el pase; y al liberarlo, el mismo pase entra).
7. **La detección de PII se esquivaba con un guion.** `12345678-Z` no casaba con el patrón de DNI y se almacenaba como «código de resguardo»; ahora se normalizan separadores (espacios, guiones, puntos, barras) antes de comprobar documentos, con pruebas para cada variante.
8. **Un nombre o un teléfono cabían como «código de resguardo»** (lo demostró la verificación adversarial persistiéndolos con el código real): el patrón laxo `[A-Za-z0-9-]{6,32}` no distinguía un dato personal de un código. Cerrado exigiendo el prefijo que emite el hotel (`MDS-…`) y, de paso, **el motivo de contingencia pasó de texto libre a vocabulario cerrado**: era el otro campo donde el mostrador podía dejar escrito un DNI.
9. **Las pruebas de bcrypt superaban el timeout al correr todo el workspace a la vez** (fallos intermitentes de una suite que en frío está verde), y dos suites simultáneas se rompen entre sí por el `dist` compartido y el registro de despliegue de Foundry. Subido el `testTimeout` del paquete con el motivo documentado y anotado el procedimiento para futuras verificaciones.

**Deuda anotada (no bloquea M6):**
- El API devuelve el check-in **tras difundir** el ancla (SLA de recepción < 500 ms medido en 121 ms); el recibo y el evento `CheckedIn` los confirma el worker de forma asíncrona. Si el ancla se minara con revert pese a la simulación, el índice quedaría por delante: lo reconcilia la propia simulación en el siguiente intento (`AlreadyCheckedIn`).
- La titularidad del pase se comprueba contra el **índice** (`nfts.current_owner`), que es con el que se emitió; el E2E comprueba además `ownerOf` on-chain. Endurecerlo a lectura on-chain en la emisión es candidato para M7.
- **Ventana residual del cerrojo**: si un anclaje se colgara más de 15 s (TTL del cerrojo), otro puesto podría entrar y difundir un segundo `markCheckedIn`; la cadena consumiría la noche **una sola vez** (el segundo revierte con `AlreadyCheckedIn`) y el índice queda coherente, pero el segundo puesto vería un 200 con un hash que revierte. Con el RPC sano el anclaje tarda ~40 ms. Reevaluar el TTL cuando M6 añada la alerta de silencio y el monitor de cadena.
- **Caída de la escritura del índice después del ancla**: el primer intento responde 500 y libera el resguardo; el reintento con el **mismo pase** detecta `AlreadyCheckedIn` (la simulación lo ve), reconcilia el índice y responde 409 «ya consumida». La noche acaba consumida exactamente una vez, aunque el mostrador vea un conflicto en el primer intento.
- `nfts.check_in_secret_enc` (AES-256-GCM) sigue poblándose por el listener pero el camino nuevo del pase ya no lo usa (JWS + EIP-712): evaluar su retirada en M9.
- **Sin traza off-chain del ancla** (lo señaló la verificación adversarial): `markCheckedIn` del repositorio solo actualiza `status`/`checked_in_at`; añadir `nfts.check_in_tx_hash` para poder auditar qué transacción consumió cada noche (el hash sí se devuelve en la respuesta y la UI lo muestra). Candidato natural para M6/M7, donde entran observabilidad y dashboard.
- El **guardián de M5 es textual y solo mira `apps/web`**: no detectaría que `packages/shared` volviera a aceptar PII ni que se quitara el chequeo de titularidad dentro de `ticket-ownership.ts`. Reforzarlo (y cubrir `packages/shared`) junto con el guardián de M4 en M8, cuando los gates de CI sean bloqueantes.
- Para la verificación HTTP se aprovisionó un operador de recepción de pruebas (`recepcion.m5@hotel.es`) con contraseña y semilla TOTP impresas **solo en la consola de esta sesión**: si el entorno se comparte, conviene rotarlo con el mismo comando de aprovisionamiento.
- Sigue abierta la deuda de M4 no bloqueante (lint previo rojo, Playwright no ejecutable, filtro de `paused()`, generación legacy fuera del cliente).

### Pendiente inmediato

1. **M6 (automatismos)** es el siguiente hito: quema programada a las 12:00 con lock y alerta de gas, push reales con opt-in/opt-out, cola única de correo con reconciliación, listener con heartbeat y alerta de silencio, monitor ampliado (el worker ya avisa del checkpoint rebobinado y degrada con `lag` negativo, que es la base de la alerta de silencio).
2. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
3. Rotar la contraseña del superusuario `postgres` compartida por chat y el operador de recepción de pruebas.
4. Confirmar con el cliente lo pendiente que no depende de nosotros: suelo de reventa definitivo, royalties por tipo (5 %/10 %) y política de reventas fuera de la plataforma.
5. Deuda menor heredada: el comentario de `useAdminWrite.ts` que menciona royalty como caso de escritura, la resolución del bloque de despliegue en modo fail-open, la tabla de idempotencia compartida entre correo y agregados, y `/api/auth/session` que reporta 401 (no 403) para un rol ajeno al back-office.
6. **Reservas de la verificación adversarial de M4 que siguen vivas** (anotadas con su destino): filtro de `paused()` en `/` y `/reventa` (M7), retirada de la generación legacy de `packages/shared` y `scripts/e2e/amoy-lifecycle.ts` (M9), tope de reintento por evento en el aviso de correo (M6) y aviso al usuario cuando la lectura de listados falla solo en parte (deuda menor).

---

### 2026-09-23 — M6 COMPLETADO: automatismos (D-03, D-12)

**Qué cambió.** El sistema deja de depender de que un humano pulse el botón y de que cada servicio se autovigile.

- **Quema programada (US-09).** `BurnerService` firmaba `burnBatch(uint256[])` con el ABI de la generación **legacy** —función que no existe en el contrato canónico: la transacción habría revertido siempre— y marcaba las filas como `BURNED` **sin mirar el recibo**. Ahora usa `burnExpired`, trocea por el `burnBatchMax()` del contrato, **simula** antes de difundir con reintento token a token (una noche no quemable ya no tumba el lote entero), espera el recibo y marca solo lo confirmado. El **planificador** vive en el worker: se ejecuta a las **12:00 del hotel** (hora de salida; `BURN_HOUR_LOCAL` + `BURN_TIMEZONE`, por defecto `Europe/Madrid`. El plan de §6 dice «12:00» sin zona: se interpreta como la hora local del establecimiento, que es la que significa algo para el negocio; la lectura literal «12:00 **UTC**» se obtiene con `BURN_TIMEZONE=UTC`, sin tocar código) con un cerrojo **por día natural** (una sola instancia quema, también con varias réplicas), libera el cerrojo si el ciclo no se completó (para reintentar tras recargar gas) y avisa a DevOps si el saldo de la hot-wallet baja del umbral. Modo forzado (`BURN_INTERVAL_MS`) para dev/demo.
- **Cola única de correo.** El pipeline de ventas enviaba por SMTP **en línea** mientras la cola BullMQ y la tabla `email_notifications` existían sin consumidor. Ahora el pipeline **encola** (`QueuedMailer` → fila `PENDING` + trabajo BullMQ), el worker **consume** con un `SmtpEmailSender` real y **reconcilia** periódicamente lo atascado. El at-least-once deja de depender del proveedor de correo: un SMTP caído ya no bloquea el ciclo de ventas, y la salud refleja si el correo sale de verdad (el consumidor marca/desmarca `emailDegraded`).
- **Push real (US-18).** `broadcastNotification` incrementaba contadores; ningún navegador recibía nada. Ahora se implementa el protocolo completo con `node:crypto` (sin dependencias nuevas): **cifrado `aes128gcm`** (RFC 8291: ECDH P-256 + HKDF-SHA256 + AES-128-GCM) y **JWT VAPID ES256** (RFC 8292) con entrega HTTP, `TTL`/`Urgency` y **purga** de las suscripciones que el servicio de push ya no reconoce (404/410, el opt-out que aplica el propio navegador). El par VAPID del entorno se ha generado y vive en `.env`.
- **Listener cableado (D-12).** `EventListenerService` no lo instanciaba nadie: sin heartbeat, sin alerta de silencio y sin índice. Ahora se arranca en el worker, y su «reconciliación por chunks» **apila y consolida de verdad** los eventos del contrato canónico (`Mint`/`Sale`/`Listed`/`CheckedIn`/`Burn`), con el royalty adjuntado a su venta y el **estado real del token resuelto on-chain** al consolidar un `Mint` (si ya se vendió o se consumió, la fila no se escribe como «disponible»). La alerta de silencio (sin bloques durante el umbral) se encola a DevOps por la cola única.
- **Monitor ampliado (D-12).** Solo miraba los `/health` de los servicios: un RPC mudo o una hot-wallet sin gas no generaban alerta. Ahora vigila **viveza de la cadena** (ciclos sin bloque nuevo) y el **saldo de las wallets** configuradas, avisando **al entrar en fallo** (y volviendo a avisar tras recuperarse y caer de nuevo), sin inundar el correo.

**Verificación ejecutada (real, no simulada):**

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | 6/6 ✅ |
| `pnpm test` | **7/7 tareas, 723 pruebas, 0 rojos** (contracts 146, shared 236, web 196, worker 92, monitor 30, mcp 23) |
| `pnpm test:e2e:m6` (Anvil + PostgreSQL + Redis + sumideros locales) | ✅ **20/20 comprobaciones** |
| Verificación adversarial independiente | ✅ ejecutada (veredicto **CUMPLE CON RESERVAS**): encontró 4 defectos reales, todos corregidos en esta misma sesión (ver abajo) |
| Regresión de los hitos anteriores | ✅ `pnpm test:e2e:m4` y `pnpm test:e2e:m5` siguen pasando tras el viaje en el tiempo de la cadena |

**E2E de M6 (`packages/contracts/scripts/e2e/m6-automations.ts`)** — habitación 108 (primera fecha libre de cada ejecución; en la evidencia actual, 2027-02-25), 0,12 ETH primaria. Lo que demuestra, en orden: el **listener escribe la fila del índice** desde el evento `Mint` (sin sembrarla a mano); la cadena **viaja en el tiempo** y el **planificador** quema la noche caducada; el recibo confirma, se emite `Burn`, `ownerOf` revierte y el índice queda `BURNED`; el aviso `BURN_EXECUTED` **sale por la cola única** y un **sumidero SMTP local** recibe el mensaje (fila → `SENT`); la **reconciliación** re-encola una notificación atascada; un **servicio de push local verifica el JWT VAPID y descifra** la notificación (RFC 8291/8292); y la **alerta de silencio** se dispara y queda encolada. Hashes de esa ejecución:

| Paso | Hash |
|---|---|
| `mint` (108) | `0xee1591856105b26f65ddb557a648411b127a5b75612d4354b574620f405c8a02` |
| `burnExpired` (planificador) | `0x114192c284c9423108820344ba78cf2a6d11898a960cd028ae35a010506de114` |

Evidencia: `RepoTecnico/evidencias/m6-e2e-anvil.json`. **Cada ejecución del E2E regenera el artefacto y cambia los hashes** (elige la primera fecha libre y la quema es una transacción nueva): la tabla recoge la ejecución documentada.

**Hallazgos reales al ejecutar (ninguno detectable con `typecheck` ni con las pruebas que había):**
1. **El consumidor de la cola no podía arrancar NUNCA.** BullMQ exige `maxRetriesPerRequest: null` en las conexiones bloqueantes y nuestro cliente usaba `3`, así que `new Worker(...)` lanzaba. Es decir: la cola existía y era **inconsumible** — la razón técnica de fondo del hallazgo de la auditoría («el consumidor no se invoca»). Corregido con un cliente bloqueante dedicado (`getBlockingRedisClient`).
2. **El push habría sido indescifrable por cualquier navegador.** La cabecera del marco `aes128gcm` reservaba 5 bytes en lugar de 21 antes del `keyid`, así que la clave pública efímera se truncaba. Lo cazó la prueba de ida y vuelta (cifrado de producción → descifrado independiente), no el typecheck.
3. **La «reconciliación por chunks» no reconciliaba nada**: recorría los logs y solo los contaba, sin apilar ni consolidar un solo evento. Ahora apila, adjunta el royalty de la reventa y consolida con el estado real resuelto on-chain.
4. **Los E2E de M4 y M5 calculaban las fechas con el reloj de la máquina**: tras el viaje en el tiempo de M6, el `mint` revertía con `PastDate`. Ahora ambos usan el **reloj de la cadena**, que es el que decide la caducidad en el contrato.
5. **El worker no tenía planificador ni índice**: la fila de `nfts` la escribía (cuando alguien lo hacía) el listener que nadie instanciaba, de modo que el catálogo servido desde PostgreSQL dependía de sembrados manuales. Cablearlo cierra ese hueco y hace que el catálogo se alimente de la cadena.

**Verificación adversarial independiente y defectos que encontró (todos corregidos).** Veredicto: **CUMPLE CON RESERVAS**. Confirmó on-chain la quema (`burnExpired` firmado por la wallet con `BURNER_ROLE`, `ownerOf` revierte, evento `Burn`), validó el cifrado RFC 8291/8292 con descifrado independiente y ejecutó el E2E (20/20). Y encontró cuatro defectos de diseño reales que las pruebas nuevas no cubrían:

| Defecto encontrado | Corrección aplicada |
|---|---|
| **El índice podía resucitar noches quemadas**: `resolveMintState` caía en su `catch` y devolvía `AVAILABLE` con propietario falso; como `ownerOf` revierte en un token inexistente, un `Mint` consolidado después de la quema reescribía la fila `BURNED` como disponible | Un revert de `ownerOf` significa **BURNED** (propietario cero); si el estado **no se puede determinar** (RPC caído) **no se escribe nada** y se reintenta en el siguiente ciclo. Con pruebas de los dos casos |
| **Correo duplicable**: con `removeOnComplete: true` y el marcado `SENT` posterior al envío, un `PENDING` que sí se entregó se re-encolaba desde la reconciliación (mismo `jobId`, ya borrado) ⇒ segundo envío | Los trabajos completados se **retienen** 1 h / 1000 entradas, de modo que el `jobId` sigue existiendo y el re-encolado es un no-op; además `FAILED` se marca solo **al agotar los intentos** (antes quedaba `FAILED` mientras BullMQ aún reintentaba) |
| **La quema de producción usaba el reloj de la máquina** (el E2E lo inyectaba a mano), y la caducidad la decide el `block.timestamp`: con deriva de cadena se quemarían noches aún no caducadas | El planificador lee la **hora de la cadena** (último bloque) y se la pasa al ciclo; si el RPC falla, degrada al reloj de la máquina y lo registra. Con prueba |
| **Ruido y duplicados**: la alerta de silencio se re-encolaba en **cada** heartbeat; el `id` de los eventos apilados se calculaba y no se usaba como dedupe (un fallo a mitad de reconciliación re-apilaba el rango) | La alerta de silencio se emite **una vez por episodio** (se rearma al volver un bloque) y `stageEvent` **deduplica** por `(txHash, tipo)`. Con pruebas |
| Además: la BD marcaba como quemados los tokens que se **pretendía** quemar, no los que el recibo confirmaba; y el SQL de caducadas usaba `<=` frente al `<` del contrato (la noche del propio día entraba como candidata y se descartaba en la simulación) | El estado se marca con los tokens de los **eventos `Burn`** del recibo (y no se marca nada si el recibo no los declara); el SQL pasa a `<`. Con pruebas |

Queda documentado como **decisión de diseño** (no defecto) que el **monitor mantiene su propio canal SMTP**: una ruta de alerta de operación no debe depender de la misma infraestructura que vigila (si la cola o Redis caen, la alerta tiene que salir igual). El verificador lo señaló como contradicción con «cola única»; la cola única es el canal de **notificaciones del producto**, y así queda en la documentación.

**Nota de proceso:** ejecutar dos suites a la vez en el mismo workspace se rompe entre sí (Foundry reescribe su registro de despliegue y `tsup` limpia `packages/shared/dist`): en una pasada paralela apareció un fallo espurio de `test_DeployFaucetWhenEnabled` («faucet no registrado») que en frío no se reproduce (146/146).

**Deuda anotada (no bloquea M7):**
- El **monitor mantiene su propio canal SMTP** para alertas de operación (decisión deliberada: la alerta no debe depender de la infraestructura que vigila). Si se quiere una sola salida, habría que encolarla y aceptar el acoplamiento.
- Un correo que **agota los reintentos** queda en `FAILED` sin aviso: nada alerta de él. Criterio pendiente para M8 (¿reintento con tope y alerta al superar N fallos?).
- El push se dispara **solo en ventas** y es *best-effort* (un fallo de push nunca bloquea la venta); no hay recordatorios programados de check-in.
- El índice usa **1 confirmación** en Anvil (D-12); en Polygon habría que fijar 32 y probar el reorg real — entra en M8 con el gate de CI.
- La quema **no alerta** cuando descarta tokens no quemables (`skippedTokens` queda en el log y en el resultado del ciclo): si eso ocurriera con frecuencia, convendría un aviso.
- La cadena de desarrollo queda con el reloj adelantado (~2 meses) por los E2E de M6: reiniciar Anvil lo resetea y exige **redesplegar** y resincronizar el registro.
- El `lint` sigue rojo por causas previas (M4) y Playwright sigue sin poder ejecutarse (binarios): material de M8.
- **Nota de proceso (aprendida a golpes en este hito):** no editar los ficheros UTF-8 del repositorio con `Get-Content -Raw`/`Set-Content` de PowerShell —una cadena de reemplazo con acentos se escribe en la página de códigos local y **corrompe el fichero** (pasó con un fichero de pruebas y con este mismo documento, reparados después)—. Las ediciones van por las herramientas de fichero del agente o con `[System.IO.File]::WriteAllText` y codificación explícita.

### 2026-09-23 — Hito M7 cerrado (dashboard y accesibilidad) · D-11, D-16

**Premisa.** Hasta aquí el dashboard eran **siete tarjetas escalares**: ninguna de las tres gráficas prometidas al cliente (serie mensual, desglose por tipo y ranking de más revendidas) existía, y la «certificación WCAG 2.1 AA» se medía contra colores inventados. M7 cierra las dos cosas y, de paso, la deuda que las verificaciones de M4 y M5 habían asignado a este hito.

**Entregable verificable.**

- **Agregados en PostgreSQL (D-09/D-16)**: `worker_sale_history` guarda la **marca temporal del bloque** (reloj de la cadena, no de la máquina) y el worker calcula con SQL de agregación (`GROUP BY`/`FILTER`) la serie mensual (mes natural en la zona del hotel, `AT TIME ZONE`), el desglose por tipo y el ranking de noches más revendidas, además del contador de ventas **sin** fecha. Las cuatro consultas se leen en **una transacción `REPEATABLE READ`**: con el worker escribiendo en paralelo, el payload no puede mezclar dos instantes (una venta en la serie y no en el desglose). El planificador no cambia: la escritura sigue siendo idempotente por `txHash:logIndex`.
- **Dashboard real**: `/admin/dashboard` pinta las tres gráficas con **recharts** y, además de nombre accesible (`role="img"` + `aria-label` con el resumen) y leyenda en HTML, una **tabla de datos equivalente** en un `<details>` nativo. El ranking es una tabla real. La exportación CSV incluye las tres secciones nuevas.
- **Fuente única**: el dashboard, el histórico público y sus dos CSV dejan de calcular por su cuenta. Antes había **tres caminos** para la misma cifra (dashboard desde `sale_events`+`nfts`, histórico desde `sale_events`, worker desde `worker_sale_history`); ahora todos leen el worker, que es lo que hace verificable el criterio «las cifras del dashboard cuadran con el histórico». Se retiraron de `NFTsRepository` las dos lecturas que quedaban sin consumidor (`getFinancialMetrics`, `getSalesHistory`).
- **Accesibilidad sobre la paleta real (D-11, cierre de H-21)**: la paleta medida por los tests se compara con el preset de Tailwind (`preset.cjs`) y, si divergen, la suite se pone roja; se **escanean los `className`** del producto para exigir que ningún color esté fuera de la paleta y que cada par texto/fondo usado cumpla 4.5:1, con composición alfa para los `bg-*/NN`. Los invariantes «semánticos» (que antes comprobaban objetos escritos dentro del propio test) pasan a comprobar los ficheros reales: `lang`, enlace de salto con su destino, un `h1` por ruta, iconos SVG ocultos a lectores y gráficas con alternativa tabular.
- **Deuda cerrada**: `/` y `/reventa` leen `paused()` y, con el contrato en pausa, **no ofrecen la compra** (distinguen además «en pausa» de «no se pudo comprobar»); y los tres endpoints que emiten el pase comprueban la titularidad contra **`ownerOf` on-chain**, no contra el índice, emitiendo el JWS con el dueño de la cadena y registrando el desajuste si el índice va retrasado (RPC caído → 503; token quemado → 404).

**Verificación real (E2E `pnpm test:e2e:m7`, 33 comprobaciones, evidencia `RepoTecnico/evidencias/m7-dashboard-anvil.json`).** Sobre Anvil + PostgreSQL reales: tres ventas primarias (simple, doble y suite) y dos reventas con su `RoyaltyPaid`, repartidas en **dos meses distintos viajando en el reloj de la cadena**, más una venta **en la frontera de mes** (00:30 del día 1 en Madrid = 23:30 UTC del último día del mes anterior) que se cuenta en el mes del hotel y no en el de UTC; los contadores de la base incluyen **exactamente** lo que dicen los recibos y cada venta de la corrida queda en el histórico con su precio, tipo y comprador exactos; y —el criterio de aceptación— la serie mensual, el desglose por tipo y el ranking que calcula el SQL son **idénticos** a los que deriva del histórico `summarizeHistory`, la vía independiente. Se comprueba además el mismo payload por HTTP, que `buy` revierte con `EnforcedPause` con el contrato en pausa, y que tras una reventa manda el dueño nuevo on-chain (y que `ownerOf` de una noche quemada revierte de verdad). El relleno de fechas deja **0 ventas fuera de la serie**.

**Verificación adversarial independiente y defectos que encontró (11, todos atendidos).** Informe completo del verificador en `RepoTecnico/evidencias/m7-verificacion-adversarial.md`. Veredicto: **CUMPLE CON RESERVAS**. No pudo falsear el núcleo —el cuadre se sostiene por **tres vías** (SQL del worker, `summarizeHistory` y una derivación propia desde `/history`), comprobó los 10 hashes del artefacto contra la cadena (precio, `saleType`, comprador y bloque exactos; `royaltyInfo()` recalculado), midió 61.836 instantes comparando el mes SQL con `Intl` (0 discrepancias) y reprodujo los 19 ratios de la paleta al decimal— pero encontró defectos reales, **todos los cuales se han corregido antes de cerrar el hito**:

| Defecto encontrado | Corrección aplicada |
|---|---|
| **H1 (ALTA) · `/admin/dashboard` servía todas las cifras a un cliente ANÓNIMO**: verificado con el build real (HTTP 200 sin cookies conteniendo el payload de agregados) mientras `/api/admin/metrics` daba 401. El gate del layout solo miraba si la cookie EXISTÍA y, en el App Router, la página se renderiza igualmente | El layout verifica la **validez** de la sesión (firma + caducidad + blocklist, con el mismo guard que las rutas) y **la página comprueba la sesión antes de leer nada** (`lib/admin-session.ts`), porque ocultar el árbol no impide que se renderice. Guardián `admin-auth-guardian.test.ts`; **verificado con el build real**: sin cookies → pantalla de acceso, cero cifras en el HTML |
| **H2 (MEDIA) · `pnpm test:e2e:m7` fallaba en el entorno documentado**: con el worker vivo, los contadores avanzan antes de que el guion lea su «antes» (delta 0); con base fría, el delta es el histórico entero | La comprobación de la corrida es **por filas** (cada venta de esta ejecución con su precio, tipo y comprador exactos), no por delta; los contadores se comprueban como cota; y la igualdad SQL↔histórico se reintenta (una escritura concurrente ya no produce un fallo falso). **33/33 en verde con el worker vivo** |
| **H3 (MEDIA) · la titularidad se endureció al EMITIR el pase, no al CANJEARLO**: `processTicketCheckIn` seguía creyendo al índice y `markCheckedIn` no comprueba propiedad, así que un resguardo de 7 días del dueño anterior consumía una noche ya revendida | El canje lee **`ownerOf` on-chain** y exige que coincida con el huésped del JWS; RPC caído → `TITULARIDAD_NO_VERIFICABLE` (503), token inexistente → `TOKEN_QUEMADO`. Un `tokenId` no numérico se rechaza como resguardo inválido. Con pruebas de los tres casos y guardián |
| **H4 (MEDIA) · seguían ofreciéndose `mint`/`markCheckedIn` sin leer `paused()`, y la pausa se diagnosticaba como avería** (revert→`ANCLAJE_FALLIDO`→502 «RPC o wallet») | Se mantiene la decisión de que recepción y minteo son pantallas de personal, pero el revert de pausa pasa a **`CONTRATO_EN_PAUSA` (503) con mensaje de pausa**; el guardián de pausa acota su alcance por escrito (vistas de compra) y comprueba el diagnóstico |
| **H5 (MEDIA) · `AdminFunds` bloqueaba `withdraw` en pausa «porque es `whenNotPaused`»**: es falso (`onlyRole(TREASURER_ROLE) nonReentrant`) y el propio test del contrato lo declara permitido como vía de remediación | Se retira el bloqueo y el aviso pasa a informar de que retirar **sí** está permitido en pausa; guardián que impide reintroducir la premisa falsa |
| **H6 (MEDIA, datos) · la serie mensual omitía el 68 % del volumen primario**: 26/36 filas sin marca temporal, y el verificador demostró que **las 26 eran recuperables** desde su bloque | **Relleno real** (`AggregateProcessor.backfillTimestamps`): lee la cabecera de cada bloque y fecha las filas sin fecha (`AND block_timestamp IS NULL`, idempotente); best-effort, un bloque irrecuperable se queda declarado. Resultado: `undatedSalesCount` **26 → 0** y la serie pasa de 5 a 9 meses |
| **H7 (BAJA) · el escáner de accesibilidad solo leía `className` literales**: 92 de 629 utilidades (14,6 %) fuera de alcance (constantes, ternarios, plantillas) | El escáner cubre **todos los literales** con pinta de utilidad; el emparejamiento texto/fondo excluye los literales con ramas (`?`/`${}`) para no inventar pares y esos colores quedan verificados por la lista declarada. Test sintético de las tres formas |
| **H8 (BAJA) · el doc afirmaba que los binarios de Playwright no están**: sí están, y el spec escanea siempre el estado degradado | Documento corregido con el motivo real (el spec fuerza un worker muerto, así que las gráficas nunca se escanean): pendiente de M8 con worker vivo |
| **H9 (BAJA) · la rama «no se pudo comprobar la pausa» era inalcanzable**: las dos lecturas iban en el mismo `Promise.all`, así que un fallo de `paused()` tumbaba el catálogo entero a estado degradado | Las lecturas se resuelven por separado (`Promise.allSettled`): la pausa desconocida se declara y el catálogo sigue visible. Guardián |
| **H10 (BAJA) · el contraste se redondeaba ANTES de comparar con 4,5**: un 4,4994 se declaraba apto | El veredicto usa el ratio exacto (`contrastRatioRaw`); el redondeo queda solo para mostrarlo. Test con el caso límite construido analíticamente |
| **H11 (BAJA) · `pnpm test` era frágil bajo turbo**: 1.ª ejecución con 1 fallo en `listener-events.test.ts` (umbral de silencio de 1 ms con temporizador real) y, reproducido dos veces, `test_DeployFaucetWhenEnabled` («faucet no registrado») solo bajo turbo | Reloj inyectable en el listener (alerta de silencio determinista) y **directorio de salida propio por prueba** en `Deploy.s.t.sol` (las pruebas compartían `latest.json` y Foundry las ejecuta en paralelo). **`pnpm test` 7/7 verde dos veces seguidas** |

**Suite completa (tras M7 y su verificación)**: `pnpm typecheck` 6/6 · `pnpm test` 7/7 tareas con **806 pruebas** (contracts 146, shared 254, web 243, worker 110, monitor 30, mcp 23) · `pnpm build` de la web en verde con la librería de gráficos integrada · `pnpm test:e2e:m7` **33 comprobaciones** en verde.

**Comprobado además sobre el worker EN MARCHA** (build de producción, `pnpm --filter @hotel/worker start`): `/health` responde con `lag: 0` y `aggregateLag: 0` (y `emailDegraded: true`, el invariante documentado mientras no haya SMTP), y el payload de `/aggregates` coincide **campo a campo** con la derivación independiente del histórico servido en `/history` (48 ventas, **9 meses y 0 ventas sin fecha** tras el relleno: `2026-09`, `2026-12`, `2027-03`…`2027-09`).

**Hashes de la ejecución documentada** (el E2E los regenera en cada pasada, igual que los de M4–M6, y actualiza `RepoTecnico/evidencias/m7-dashboard-anvil.json`):

| Paso | Hash |
|---|---|
| `mint` (simple 103) | `0x4e89867a55193690fc2bd369737be8c90668700caeaa6843518f931dfdaa1830` |
| `buy` (simple 103) | `0xa4100b2fb616b6a9c543fd2ae2f312a65fed43dab8a2298c611fa30ff3c0c9d8` |
| `buyResale` (103) | `0x2438b9a86fb41917f563a583a758f627e0b06c3c6b80a9cd6f6c7ba7dc8ce008` |
| `buy` (doble 119) | `0xd06e35cd71f932fa147a6a64d6eb2ab90fbf0446a0ba6bc802e429d64a5654f5` |
| `buy` (suite 204) | `0x77e8ed6f2111bb6ef5985b461cf9867b73535245d7f17a33db0d7e1ee1f28590` |
| `buyResale` (119) | `0x57d1bf189fc15ae88f8d3ccb0ce9ed21ac76a6a4f22ea07154be68aefc66af71` |
| `buy` en la frontera de mes (105) | `0xc45a891f27346aeda837b260766a4ee2af6aa2444bb321d4162f7c778bc6402a` |

**Hallazgos reales al ejecutar (ninguno detectable con `typecheck` ni con las pruebas que había):**
1. **La migración de M7 no se aplicaba**: el `CREATE INDEX ... (block_timestamp)` iba **antes** del `ALTER TABLE ... ADD COLUMN`, y en PostgreSQL `CREATE TABLE IF NOT EXISTS` no añade columnas a una tabla existente. El worker **no habría arrancado** contra una base ya creada (falló al primer intento real del E2E con «no existe la columna»). Corregido ordenando la migración.
2. **Colores fuera de la paleta en producción**: `recepcion/page.tsx` pintaba sus banners de éxito y error con `emerald-*`/`red-*` (paleta por defecto de Tailwind, no la del hotel) y el enlace de salto usaba `emerald-700`/`emerald-500`. La certificación de accesibilidad no cubría nada de eso porque el test medía otros colores. Corregido a tokens de marca (`olive`, `terracotta-text`, `sand-2`, `sea-deep`) y **ahora el guardián lo impide**.
3. **Los tests de QR/pase hablaban con la Anvil del desarrollador**: al pasar la titularidad a la cadena, las pruebas de `/api/qr` y `/api/wallet/pass` empezaron a consultar `ownerOf` de verdad (404 con Anvil levantada, 200 sin ella). Se dobló el lector de titularidad: la suite es hermética otra vez y el resultado no depende de la cadena de la máquina.
4. **Dos recuentos de la misma noche**: el índice (`nfts`) y los agregados (`worker_aggregate_counters`) se alimentan de dos indexadores distintos (listener y procesador de agregados), de modo que el KPI «noches vendidas» del dashboard y el «ocupación» pueden discrepar del inventario. Se documenta como deuda con destino M8 (unificar el índice del worker) en lugar de esconderse con el fallback que había antes.
5. **El worker no arrancaba con la plantilla del repositorio**: `BURNER_WALLET_PRIVATE_KEY=` y `BURN_INTERVAL_MS=` (vacías, como las deja `.env.example` y como las tenía el `.env` real) NO son «variables ausentes» para zod: la cadena vacía llega al `z.coerce.number()` como `0` y al `regex` de la clave como texto inválido, así que el arranque fallaba en cerrado con `BURN_INTERVAL_MS: Number must be greater than 0`. Apareció al reiniciar el worker para comprobar el dashboard. Corregido con `emptyAsUndefined` en `@hotel/shared/env` (vacío = no definido, pero un valor mal escrito se sigue rechazando) y con pruebas de las dos caras.

**Deuda anotada (no bloquea M8):**
- **Recepción y el back-office de minteo no leen `paused()`**: son pantallas de personal con el operador delante, y el revert se diagnostica ya como pausa (`CONTRATO_EN_PAUSA`, no como avería de anclaje); llevar la pausa a su interfaz es de M8.
- El histórico anterior a M7 **ya no pierde fechas** (rellenadas desde su bloque), pero si la cadena se reiniciara sin redesplegar, esos bloques no existirían y las filas volverían a declararse sin fecha: es el caso que `undatedSalesCount` sigue haciendo visible.
- La zona horaria de los meses es la constante `DASHBOARD_TIME_ZONE` (`Europe/Madrid`) del dominio, no una variable de entorno: es un dato del hotel. Si el hotel cambia de zona, hay que tocar código (documentado).
- `apps/web` no tiene entorno DOM en las pruebas (Node): los invariantes de accesibilidad se comprueban sobre el código y sobre la paleta, no renderizando. Añadir jsdom/`@testing-library` y escanear el dashboard con datos reales con **axe + Playwright** (los binarios SÍ están; el spec fuerza hoy un worker muerto y escanea el estado degradado) es material de M8.

### 2026-09-23 — Hito M8 cerrado (verificación reproducible) · D-08

**Premisa.** La auditoría dejó tres **certificaciones falsas** (`amoy-lifecycle.ts` imprimía seis `OK` sin firmar una transacción; el «benchmark k6» levantaba su propio servidor de mentira y medía ese; la verificación de DR «restauraba» un objeto en memoria), la cobertura estaba **sin medir**, `pnpm lint` estaba **rojo** (115 errores) y el pipeline de CI **no bloqueaba nada** (`|| true` en las tres comprobaciones clave y `allow_failure: true` en el E2E). M8 cierra las cuatro cosas y las deudas que M6 y M7 habían dejado asignadas a este hito.

**Entregables verificables.**

- **Certificaciones reales** (sustituyen a las falsas, que se retiran):
  - **Carga** (`pnpm test:load`): mide por HTTP el **sistema en marcha** (worker en 8787 y, si está levantada, la web), **valida el contenido** de cada respuesta —una respuesta de mentira cuenta como fallo— y **aborta** si el worker no responde. Artefacto: `RepoTecnico/evidencias/load-test.json`. Perfil medido en este entorno: **50 usuarios concurrentes, 20 s → 9.119 peticiones, 0 errores, p95 172 ms** (SLA declarado: p95 < 500 ms, errores < 1 %).
  - **Backup y restauración** (`pnpm test:dr`): `pg_dump` real (188 KiB, SHA-256), restauración real cronometrada (**RTO 0,73 s**) y comparación **tabla por tabla** entre origen y restaurada (recuentos y sumas de control): **283 filas comparadas, 6/6 tablas idénticas**. Artefacto: `RepoTecnico/evidencias/dr-verify.json`.
  - **Amoy**: se **elimina** el guion que «certificaba» un ciclo de vida sin transacciones (y su script de npm). La red canónica del proyecto es local (Anvil 81234) y el lanzamiento público es una fase posterior sujeta a dictamen (D-01/D-11); el guion de k6 (`catalog-load.js`) se conserva para cuando k6 esté instalado (B-3).
- **Pipeline bloqueante** (`.gitlab-ci.yml` reescrito): `setup` (pnpm + Foundry) → `static` (`typecheck`, `lint`, `forge fmt --check`) → `test` (vitest + forge) → `coverage` (vitest con umbrales + `forge coverage` + lcov) → `chain-e2e` (los cuatro E2E on-chain reales contra Anvil con servicios PostgreSQL y Redis, desplegando el contrato y **descubriendo su dirección del broadcast real**) → `web-e2e` (Playwright + axe) → `certifications` (carga + DR) → `security` (Slither `--fail-high`). Cero `allow_failure: true` y cero `|| true` que puedan enmascarar un gate (el único `|| true` es el de matar el proceso de Anvil en el `after_script`). Validado con `js-yaml` y con un validador semántico que comprueba etapas, jobs, servicios, variables y artefactos.
- **`lint` en VERDE**: los **115 errores** (web 37, shared 65, worker 13) están corregidos —`no-explicit-any` con tipos reales, `import type`, variables sin usar— sin cambiar comportamiento.
- **Cobertura medida y con gate**: `test:coverage` en los cinco paquetes vitest (`@vitest/coverage-v8`, informes `text-summary`/`json-summary`/`lcov`) con **umbrales bloqueantes** en cada `vitest.config.ts` y el detalle en `RepoTecnico/cobertura.md`.
- **Deuda de M6/M7 asignada a M8**: un correo que agota los reintentos **ya no queda `FAILED` en silencio** (avisa a DevOps por la cola única, sin alertar sobre una alerta para no entrar en bucle, con pruebas de los cuatro casos); el **relleno de fechas** del histórico (M7) deja la serie mensual completa; y las **pantallas de personal** (minteo y recepción) ya leen `paused()`: avisan y retiran sus botones en lugar de mostrar el revert como avería (`markCheckedIn` y `mint` son `whenNotPaused`). El guardián de pausa cubre ahora las cuatro vistas.
- **Guardianes que cubren `packages/shared`**: el paquete compartido no tenía ninguno (todos vivían en `apps/web`). `packages/shared/src/architecture-guardian.test.ts` fija cinco invariantes, cada uno con una regresión real detrás: el **orden de la migración incremental** (el fallo de M7), que los caminos de escritura usen el ABI **canónico**, que la conexión **bloqueante** de Redis no aparezca en servicios de peticiones, que no haya **secretos embebidos** ni respaldos literales de variables secretas, y la **paridad de tablas** entre `db/schema.sql` y `runMigrations`.

**Hallazgos reales al ejecutar (ninguno detectable con `typecheck` ni con las pruebas que había):**
1. **El pipeline no podía estar verde ni queriendo**: además de los `|| true`, los E2E on-chain exigen `ADMIN_ADDRESS` apuntando a la cuenta 1 (M4 comprueba que el desplegador ya NO tiene `DEFAULT_ADMIN_ROLE`), `BURNER_ROLE` en la cuenta 2 (M6) y `PAUSER_ROLE` en la 1 (M7). Sin esas variables el despliegue es correcto pero los E2E fallan: el pipeline las declara explícitamente y genera su `.env` (los E2E hacen `process.loadEnvFile`, que **lanza** si el fichero no existe).
2. **Con 200 usuarios concurrentes el sistema NO cumple el SLA en una sola máquina, y sabemos por qué**: la medición real da 974 errores de 3.114 peticiones (31 %), todos por *timeout* de 5 s en la web, con este log del servidor: **el pool de PostgreSQL de la web se agota** (`timeout exceeded when trying to connect`), el catálogo cae a su respaldo por RPC y la página SSR supera los 5 s; el plano de datos del worker **no da ni un error** pero sube a p95 ≈ 1,2 s. Dos causas separadas: (a) el generador corre en la **misma máquina** que Next, PostgreSQL, Redis y Anvil, así que la medida incluye contención propia (k6 desde otra máquina es B-3); (b) el **tamaño del pool** de la web (`DATABASE_POOL_MAX`) no está dimensionado para 200 peticiones SSR simultáneas. Se declara como **hallazgo abierto con destino operación/M9** (pool + caché de catálogo o capa CDN de D-11) y NO se disfraza bajando el perfil: el pipeline usa un perfil declarado de 50 usuarios y el de 200 se documenta con sus números.
3. **La cobertura real no llega al 80 % y el hueco está localizado** (medición de cierre con exclusiones declaradas; el detalle, comando a comando, está en `RepoTecnico/cobertura.md`):

   | Paquete | Sentencias | Ramas | Funciones | ¿80 %? |
   |---|---|---|---|---|
   | `packages/mcp` | 93,97 % | 87,23 % | 92,85 % | ✅ (subió desde 58 % con pruebas del adaptador viem: paginación de `getLogs`, decodificación y `ownerOf` como oráculo) |
   | `apps/monitor` | 91,12 % | 86,36 % | 93,10 % | ✅ (subió desde 75 % con pruebas del transporte SMTP: `secure` derivado del puerto 465) |
   | `apps/worker` | 80,68 % | 88,31 % | 85,36 % | ✅ |
   | `packages/shared` | 79,61 % | 80,59 % | **75,29 %** | ❌ (le faltan ~29 sentencias; falla sobre todo en funciones) |
   | `apps/web` | **24,95 %** | 74,05 % | 53,84 % | ❌ (falta ENTERO el entorno DOM) |
   | **Global** | **49,51 %** | 80,68 % | 72,54 % | ❌ |

   Dos matices que importan y que corrijo respecto a mi primera estimación: (a) excluir los **ABI generados** (`src/abi/**`, 3.897 de las 7.497 sentencias de `shared`, de las que 2.105 SÍ se ejecutan) es legítimo y está documentado, pero deja `shared` en **79,6 %**, no en el ≈87 % que estimé contando solo dos de los cuatro ficheros de ABI: mi cuenta dividía por un denominador mal restado; (b) **el 80 % global es, en la práctica, el 80 % de `apps/web`** (8.081 de las 14.261 sentencias del monorepo): aunque los otros cuatro paquetes llegasen al 100 %, el global se quedaría en 78,7 %. El hueco de `web` es de **4.505 sentencias de componentes** (74 % del total) + 1.077 de `app/` (RSC) + 482 de `lib/`, y su prerrequisito es añadir **entorno DOM** (`jsdom` + `@testing-library/react` + dobles de wagmi), que hoy no existe (`environment: "node"` y `include: ["src/**/*.test.ts"]`, sin `.tsx`). Los umbrales quedan como **trinquete** (el valor medido, no el deseado) para que el gate bloquee regresiones **hoy**, y el hueco es deuda declarada, no un 80 % fingido. El gate **sí está cableado** al pipeline (job `coverage`, que recorre los cinco `test:coverage` y publica lcov).

   Nota de alcance del `lint`: `pnpm lint` sale **verde (6/6, 0 errores)**; quedan **19 warnings** de `no-console`, todos en `packages/shared/scripts/create-admin.ts` (script CLI de aprovisionamiento, donde la salida por consola ES el producto): se aceptan como excepción documentada en lugar de silenciar la regla.
4. **Restaurar «de verdad» tropieza con los permisos del rol**: el rol de la aplicación no tiene `CREATEDB` (crear una base exige el superusuario, dependencia B-1), así que la verificación restaura en un **esquema** de la misma base, reescribiendo el destino del volcado y omitiendo las sentencias de `pgcrypto` (cuya dueña es el superusuario). Está declarado en el artefacto (`notaAlcance`); el volcado, la restauración y la comparación son reales, y el esquema se limpia **siempre** (incluso si falla) para no contaminar el siguiente volcado.
5. **Los E2E on-chain exigen indexación exclusiva del contrato**: al re-ejecutar la familia completa con el **worker levantado**, el E2E de M5 falló con «El índice off-chain queda en CHECKED_IN». La causa no era el código: el listener del worker consolidaba los eventos del mismo contrato y **reescribía la fila** que el E2E acababa de marcar (`upsertNFT` del `Mint` posterior al check-in). Con el worker parado, M4/M5/M6/M7 pasan (33/33, 20/20, 33/33 y M4 completo). El pipeline de CI **no arranca el worker** en el job de cadena, así que allí no ocurre; queda documentado como prerrequisito de ejecución local.
6. **El E2E de M4 asumía una cadena virgen para cuentas reutilizadas**: al re-ejecutarlo sobre la misma Anvil, fallaba por **estado acumulado** del vendedor (saldo pendiente de pasadas anteriores), no por un defecto del contrato: comparaba el saldo pendiente en valor absoluto y esperaba `NoFunds` en un `claim` que sí tenía fondos. Corregido con comprobaciones **por delta** (el mismo patrón que ya usaba la tesorería dos líneas más abajo) y drenando el saldo arrastrado antes de comprobar el revert. Sin ese arreglo, la familia de E2E no era re-ejecutable en local, que es justo lo que M8 exige («reproducible»).

**Verificación de cierre (esta revisión, con el worker parado durante los E2E on-chain):** `pnpm lint` **6/6 verde (0 errores)** · `pnpm typecheck` **6/6** · `pnpm test` **7/7 con 835 pruebas** (contracts 146, shared 259, web 244, worker 114, monitor 34, mcp 38) · `pnpm build` de la web en verde · E2E on-chain reales: **M4 completo, M5 33/33, M6 20/20, M7 33/33** · certificaciones: carga real **CUMPLE a 50 concurrentes (9.119 peticiones, 0 errores, p95 172 ms)** y DR real **CUMPLE (6/6 tablas, 283 filas, RTO 0,73 s)** · accesibilidad en navegador real con axe: **12/12 sin violaciones critical/serious**.

**Deuda anotada (no bloquea M9):**
- **Cobertura de `apps/web` (24,95 %)**: es el único hueco grande que queda frente al 80 % (y el que fija el techo global: sin ella, el máximo es 78,7 %). Exige pruebas de componentes y páginas con entorno DOM (jsdom + `@testing-library`) y mocks de wagmi; el umbral trinquete ya impide empeorar. En `packages/shared` (79,6 %, funciones 75 %) faltan dobles de `pg`/`ioredis`/BullMQ y seis tests de helpers puros.
- **Perfil de 200 usuarios**: medir con k6 desde otra máquina (B-3) y dimensionar el pool de la web / cachear el catálogo (o poner la capa CDN de D-11 delante).
- **Polygon real**: el E2E es local; fijar 32 confirmaciones y probar un reorg real es de la fase pública (D-12 deja el valor como configuración).
- **Escaneo axe**: **ya corre** en este entorno — `pnpm --filter @hotel/web exec playwright install chromium-headless-shell` resolvió el build `1223` que faltaba y la suite **pasa 12/12** (proyectos `chromium` y `mobile` × 6 rutas: `/`, `/reventa`, `/historico`, `/admin/dashboard`, `/admin/mint`, `/asistente`), con **0 violaciones critical/serious** medidas por axe sobre el HTML real y la paleta real. Lo que falta es el escenario **con datos**: el spec fuerza `WORKER_BASE_URL` a un puerto muerto (vistas degradadas) y el dashboard exige sesión, así que las gráficas y tablas con cifras reales todavía no entran en el análisis.
- **SCA (`pnpm audit`) sin triar** y **digest de la imagen de Slither** sin fijar (documentado en el propio pipeline).
- **Ejecución local de los E2E**: hay que parar el worker (indexa el mismo contrato y pisa las filas que los E2E afirman). El pipeline no lo arranca, pero conviene que los guiones lo detecten y avisen en lugar de fallar con un mensaje engañoso.
- **Warnings de `lint`**: 19 `no-console` en `packages/shared/scripts/create-admin.ts` (script CLI); se aceptan como excepción documentada.

### Pendiente inmediato

1. **M9 (documentación y entrega)** es el siguiente hito: registro de ADR, limpieza de referencias huérfanas (`ADR-*`/`CU-*`), reescritura del PRD/SRS/PLAN/BACKLOG según las decisiones, respuesta al cliente cerrada (D-17) y manuales.
2. **Revocar y regenerar el token de GitLab** retirado del remoto (el antiguo sigue siendo válido hasta entonces).
3. Rotar la contraseña del superusuario `postgres`, el operador de recepción de pruebas y las **claves VAPID** del entorno si se comparte.
4. Confirmar con el cliente lo pendiente que no depende de nosotros: suelo de reventa, royalty por tipo y custodia de claves.
5. Deuda menor heredada: el comentario de `useAdminWrite.ts`, la resolución del bloque de despliegue en modo fail-open, la tabla de idempotencia compartida entre correo y agregados, `/api/auth/session` reportando 401 en vez de 403, el aviso cuando la lectura de listados falla en parte, y los dos indexadores de la misma noche (índice del listener vs agregados del procesador).

---

### 2026-09-23 — Hito M9 en cierre (documentación y entrega) · D-14, D-15, D-17

**Premisa.** La auditoría dejó el hallazgo **H-16**: el código citaba **66 referencias a documentos que no
existían** (`ADR-01`…`ADR-22`, `DISEÑO-TECNICO`, `DISEÑO-UX`, `CASOS-DE-USO`, `CU-01`…`CU-17`,
`REQUISITOS`). El PRD, el SRS, el plan y el backlog describían **otro sistema** (Polygon como red del MVP,
la pareja `HotelNFT` + `HotelMarketplace`, cuatro roles, Sentry, *failover* multi-RPC, `checkInSecret`
off-chain) y el documento de cumplimiento afirmaba cosas que el código no hace. M9 cierra las tres cosas,
retira la generación legacy y deja la coherencia **protegida por un guardián**.

**Entregables verificables.**

- **Registro de ADR** (`docs/adr/`, 26 decisiones + índice): es el documento **normativo** de las
  decisiones del sistema. Mapea las 20 decisiones de la auditoría (D-01…D-20) y da destino a **todas**
  las referencias huérfanas: los 17 casos de uso (`CU-01`…`CU-17`) quedan catalogados en `docs/SRS.md` §9,
  y `DISEÑO*`, `CASOS-DE-USO` y `REQUISITOS` desaparecen del código.
- **PRD v2.0.0, SRS v2.0.0, PLAN v2.0.0 y BACKLOG v2.0.0** reescritos contra el sistema real, con los
  identificadores (`RF-*`, `RNF-*`, `RT-*`, `CU-*`, `US-*`) conservados para no romper la trazabilidad que
  ya existía en el código, y con una columna de **estado real** en cada tabla. El SRS añade el catálogo de
  casos de uso (§9), la trazabilidad requisito↔prueba↔artefacto (§10) y una **tabla de deuda declarada**
  (§11) con 16 límites conocidos.
- **Guías operativas corregidas**: `COMPLIANCE.md` (ya no afirma que la plataforma envía el parte de
  viajeros ni que cifra un `checkInSecret` que el pase no usa), `DISASTER-RECOVERY.md` (sustituye una
  recuperación de GCP no reproducible por el procedimiento real medido), `PERFORMANCE-REPORT.md` (publica
  los números reales **incluidos los que no favorecen**: 200 concurrentes no cumplen el SLA),
  `PMS-INTEGRATION.md` (la plataforma no captura ni transmite PII) y `FIAT-ONRAMP.md` (el camino con
  tarjeta no tiene pasarela ni webhook: se dice).
- **Respuesta al cliente cerrada** (`docs/RESPUESTA-CLIENTE-BORRADOR.md` v2.0.0): el trabajo de
  terminación pasa a estar **hecho** en la tabla de bloques, se publican los límites del sistema en un
  apartado propio, y quedan como campos del responsable la tarifa, los importes y las fechas. La decisión
  de red (A privada / B Polygon) sigue siendo la pregunta que bloquea precio y plazo.
- **Guardián de documentación** (`packages/shared/src/documentation-guardian.test.ts`, 6 invariantes):
  cero referencias huérfanas en el código, todo `ADR-nn` citado existe, el índice de ADR y el directorio
  están sincronizados, los documentos normativos declaran versión y fecha, todo `CU-*` citado está
  catalogado en el SRS y **todo requisito del PRD aparece en el SRS** (con trazabilidad o declarado sin
  verificación en §10.1). La limpieza deja de ser un hecho puntual y pasa a ser un invariante.
- **Retirada de la generación legacy** (`HotelNFT` + `HotelMarketplace`, sus ABIs y sus suites): era el
  último trabajo de M9 y cierra la reserva que la verificación adversarial de M4 dejó abierta.

**Hallazgos reales al escribir la documentación (ninguno detectable con `typecheck` ni con las pruebas):**

1. **La tabla `admin_sessions` sigue guardando IP y *user agent* en claro.** ADR-24 y la documentación de
   privacidad afirmaban «sin IP ni *user agent* en claro», y **el código los escribe** en cada login, en
   cada verificación de TOTP y en cada rotación de refresh (`auth/service.ts` →
   `sessions.repository.createSession`). Afecta **solo a operadores**, no a compradores. Queda declarado
   como **hueco abierto** con dos salidas posibles (eliminar las columnas o conservarlas hasheadas con
   plazo de publicación en la política): es una decisión de producto, no un arreglo mecánico.
2. **El tipo «doble» no se persiste.** `room_type` sigue restringido a `SIMPLE`/`SUITE` (tipo del
   repositorio), así que el tipo que el cliente pidió y que el contrato sí distingue (con royalty propio
   del 5 %) **no se puede filtrar** desde el catálogo servido por PostgreSQL. No afecta a la cadena ni al
   royalty, pero es una divergencia real entre lo pedido y lo mostrado.
3. **La purga de correos y de sesiones no tiene planificador.** `purgeOldNotifications` existe y **no se
   invoca desde ningún sitio**: el plazo de conservación declarado (90 días) no se cumple solo. Es una
   obligación de minimización de datos, no una mejora cosmética.
4. **El plan de construcción planificaba sobre una VM de GCP y Sentry** que nunca existieron; el
   documento describía un *toolchain* de despliegue que el repositorio no puede reproducir. Reescrito.
5. **La prueba de recuperación documentada no era la que se ejecuta**: describía volcados cifrados en
   Cloud Storage y una recuperación de instancia; lo que existe es `pg_dump` + restauración real en un
   esquema + comparación tabla por tabla, con **RTO 0,73 s** medido y 6/6 tablas idénticas.

**Cierre del hueco de RF-07 (hallazgo de los manuales, corregido en M9).** Al escribir el manual del
comprador apareció que **el resguardo no tenía superficie de cliente**: las tres rutas existían, pero
ninguna pantalla las llamaba, y el QR apuntaba a `/checkin`, que **no existía** (el payload habría dado
404 al escanearlo). Se ha cerrado así:

- **`GET /api/qr/:tokenId`** devuelve, además del token y la URL, la **imagen del QR** (PNG en data URL,
  dibujada en el servidor: sin depender de un servicio externo). Sigue exigiendo la firma EIP-712 del
  titular y el QR incluye exactamente el mismo JWS que se puede canjear.
- **`TicketView`** en «Mis noches»: pide la firma del titular, muestra el QR **en pantalla**, lo ofrece
  **descargable en PNG** y deja el token en texto para el camino manual de recepción.
- **`/checkin#ticket=<JWS>`**: la pantalla que el huésped enseña en recepción. El token viaja en el
  **fragmento** de la URL (el navegador no lo envía al servidor), se pinta el QR y hay un bloque con el
  token para pegarlo en la pantalla de recepción. La validación la sigue haciendo la API de recepción.
- **Dominio y tipos EIP-712 movidos a `domain/ticket-auth.ts`** (entry isomorfo): el componente de
  cliente tiene que firmar el **mismo** mensaje que verifica el servidor, y antes ese mensaje solo existía
  en un módulo que importa `node:crypto`; importarlo del barril raíz habría arrastrado el servidor al
  bundle del navegador (es justo lo que vigila `boundaries.test.ts`).
- **Accesibilidad**: `/mis-noches` y `/checkin` entran en el escaneo de axe (**16/16**: 8 rutas ×
  `chromium`/`mobile`).
- **Un defecto de herramientas corregido de paso**: `pnpm deploy:anvil` llamaba a un script que no
  existe en `packages/contracts` (el real es `deploy:local`), así que el comando documentado no
  desplegaba nada.

**Huecos abiertos que M9 deja anotados:**

- **Pases Apple/Google** (RF-07): el camino está implementado, pero dependen de credenciales del cliente
  y del proveedor, así que no se declaran operativos.
- **Envío del resguardo por correo**: la ruta existe y encola el correo de forma efímera, pero sin SMTP
  configurado no sale.

**Verificación de cierre de M9 (ejecutada sobre el árbol final, con los subagentes ya terminados):**

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | **6/6** ✅ |
| `pnpm lint` | **6/6, 0 errores** (22 warnings `no-console` en el script CLI de aprovisionamiento, donde la salida por consola es el producto: excepción documentada) |
| `pnpm test` | **7/7 tareas, 843 pruebas, 0 rojos** (contracts 125 · shared 277 · web 250 · worker 119 · mcp 38 · monitor 34) |
| `forge test` | **13 suites / 125 pruebas** (la generación legacy retirada: −3 suites, −21 pruebas) |
| `pnpm --filter @hotel/shared build` | **verde**, ESM y **DTS** (el DTS fallaba antes de arreglar la reexportación de `passes/jws.ts`) |
| `pnpm --filter @hotel/web build` | **verde: 21/21 páginas** estáticas (una más que en M8: entra `/checkin`) |
| `pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts` | **16/16 sin violaciones critical/serious** (8 rutas × `chromium`/`mobile`) |
| Cobertura `@hotel/shared` | statements 79,58 % · branches 80,59 % · functions 75,29 % (umbrales en trinquete, verdes) |
| Guardián de documentación | **6/6** |
| Búsqueda de referencias huérfanas | **0** en `apps/`, `packages/` y `scripts/` |
| Migración aplicada sobre la base real | `admin_sessions.ip_address`/`user_agent` → `VARCHAR(80) NULL` + índice de caducidad, verificado con `information_schema` |
| Traza de sesiones migrada | **3/3 filas** pasadas a `hmac-sha256:…`, 0 pendientes (`backfill:session-traces`) |
| Retención ejecutada sobre datos reales | sesión caducada borrada, **sesión vigente conservada**, correo de 120 días borrado y el de 1 día conservado |

### Cierre de las decisiones del responsable (2026-09-23)

Tras la entrevista de M9, el responsable tomó cinco decisiones que ya están implementadas y verificadas:

1. **Traza de sesiones**: se **pseudonimiza con HMAC-SHA256** (`SESSION_TRACE_SECRET`, con respaldo en
   `AES_SECRET_KEY`) en el único punto de escritura, y se migraron las filas anteriores. Se eligió HMAC y
   no un hash simple porque el espacio de IPv4 se enumera en minutos: sin clave, «hashear» no protege.
2. **Retención efectiva**: un **planificador en el worker** (cada 6 h, con cerrojo) borra sesiones
   caducadas, códigos de rescate huérfanos y correos enviados con más de 90 días. Cierra el hallazgo de
   que `purgeOldNotifications` existía y no la invocaba nadie.
3. **Tipo «doble»**: se implementa con el reparto del maestro (101–115 simple, 116–130 doble, 201–220
   suite) mediante `toRoomTypeDb`/`toNightType`; la API de minteo valida el tipo y el filtro del catálogo
   ya lo devuelve.
4. **Carta al cliente reescrita** (v3.0.0): la red privada es **el entregable** y Polygon pasa a ser un
   **bloque presupuestado aparte** (H6) que Carlos debe aprobar; las cuatro cosas que necesitamos de él
   llevan ahora su consecuencia si no llegan.
5. **Rotaciones de credenciales**: el responsable decidió **no** rotarlas por ahora; siguen anotadas como
   pendientes (B-0 incluido, que sigue siendo el riesgo abierto más serio).

### Comprobación del MCP (2026-09-23)

Estado verificado del servidor MCP y de su conexión con la web, con los servicios en marcha:

| Comprobación | Resultado |
|---|---|
| Arranque y `/health` | **200** `{"status":"ok","component":"mcp","details":{"block":30440}}`, contrato `0x5FbD…aa3`, `chainId 81234`, bloque de despliegue 7 |
| Herramientas expuestas | **4**: `listAvailableNights`, `checkAvailability`, `getOwnedNights` (read-only) y `buildPurchaseTx` (prepara sin firmar) |
| Llamada real desde el cliente de la web | `listAvailableNights` → **3 noches** por el transporte Streamable HTTP (mismo `McpToolGateway` que usa el asistente) |
| Protección DNS-rebinding | **Activa**: con un `MCP_ALLOWED_HOSTS` que no incluye el puerto, el MCP responde **403 `Invalid Host header`** (comprobado) |
| Asistente conversacional | **No operativo por configuración**: `ANTHROPIC_API_KEY` está **vacía** en el `.env`, así que `/api/assistant` responde **503** `ASSISTANT_UNAVAILABLE` y la UI muestra su estado alternativo (`assistant-unavailable`) con navegación manual |

**Hallazgo del entorno (no del código)**: el puerto **8788, que el MCP tenía configurado, lo ocupaba un
proceso `python` ajeno al proyecto** (un servidor de ficheros estático, iniciado el 2026-09-23 a las
15:35). Con ese proceso escuchando, el MCP **no puede arrancar** (`EADDRINUSE`). **Resuelto**:
`MCP_PORT=8790` en el `.env`, con `MCP_BASE_URL`, `MONITOR_TARGETS` y `MCP_ALLOWED_HOSTS` alineados.
No se ha tocado el proceso ajeno.

### Despliegue local del sistema completo (2026-09-23)

Se ha levantado el sistema entero y verificado en marcha, con un script reutilizable:
`scripts/dev/deploy-local.ps1` (`-Status` para el estado, `-Stop` para pararlo, `-SkipBuild` para
arrancar sin reconstruir). Además de arrancar los cuatro servicios, resuelve las dos causas de
«sistema en pie pero degradado»:

- **Correo**: sin proveedor SMTP el worker arranca con `emailDegraded: true`, `/health` responde 503 y
  reintenta cada aviso hasta agotarlo. El script levanta un **sumidero SMTP local**
  (`scripts/dev/smtp-sink.ts`, puerto 2525) y apunta a él worker y monitor: el correo se entrega de
  verdad y la salud recupera.
- **Monitor**: `MONITOR_TARGETS` de la plantilla no tiene el formato `nombre=url` que el monitor exige,
  así que **el monitor no arrancaba** (`EnvironmentValidationError`). El script genera
  `.deploy-logs/env.deploy` con el formato correcto y se lo pasa a worker y monitor con `--env-file`.

| Verificación en marcha | Resultado |
|---|---|
| Dependencias | PostgreSQL 5432, Redis 6379 (Memurai) y Anvil 8545 (`chain-id 81234`) **activos** |
| Web | **200** en `/`, `/reventa`, `/historico`, `/mis-noches`, `/checkin`, `/asistente`, `/recepcion`, `/admin/dashboard` y `/health/ready` |
| `/health/ready` | `{"status":"READY","dependencies":{"postgres":"UP","redis":"UP","polygonRPC":"UP"}}` |
| Worker `/health` | **200** `status: ok`, `lag: 0`, `emailDegraded: **false**` (con el sumidero), `aggregateLag: 0` |
| Worker `/aggregates` | 56 minteadas · 47 vendidas · 8 quemadas · 6,49 ETH primaria · 0,19 ETH royalties · **12 meses** en la serie · `undatedSalesCount: 0` |
| Worker `/history` | **66 ventas** servidas desde PostgreSQL |
| MCP `/health` | **200** `ok`, bloque al día; **4 herramientas** expuestas |
| Cadena web → MCP | `listAvailableNights` → **3 noches** con el mismo cliente y transporte que usa el asistente |
| Monitor | Arranca, sondea worker y MCP y vigila cadena y gas de las dos wallets |
| Retención | El planificador se ejecuta al arrancar (`retención: limpieza ejecutada`) |
| Fallos de entrega de correo tras el arranque | **0** (antes de la corrección, el log se llenaba de `EMAIL_DELIVERY_FAILED`) |

**Estado del asistente IA**: montado y probado, pero **no responde** porque `ANTHROPIC_API_KEY` está
vacía en el `.env`; `/api/assistant` devuelve 503 y la interfaz muestra su estado alternativo con
enlace al catálogo. Es una dependencia de pago no presupuestada (RF-20, «PAR»).

**Deuda que M9 añade a la lista (no bloquea la entrega, sí la fase pública):**

- **`pnpm audit` sin triar** y digest de Slither sin fijar (heredado de M8).
- **Asistente conversacional**: falta la `ANTHROPIC_API_KEY` (dependencia de pago no presupuestada).
  Sin ella el resto de la web funciona y ofrece navegación manual.
- **Rotaciones pendientes por decisión del responsable**: token de GitLab (B-0), contraseña del
  superusuario `postgres`, operador de recepción de pruebas y claves VAPID del entorno.
- **Puertos del entorno**: el 8788 está ocupado por un servidor HTTP de otro proyecto; si ese proceso
  desaparece, el MCP puede volver al 8788 actualizando `MCP_PORT`, `MCP_BASE_URL`, `MONITOR_TARGETS` y
  `MCP_ALLOWED_HOSTS`.

### Pendiente inmediato

1. **M9 está cerrado**: la verificación de arriba está en verde. Lo que sigue es **entregar y presentar**
   (PRD/SRS/plan/backlog, ADR, manuales técnicos y de usuario, y la carta al cliente).
2. **Revocar y regenerar el token de GitLab** retirado del remoto (B-0): el antiguo sigue siendo válido
   hasta que el responsable lo haga. **Decisión de M9: se aplaza** (junto con el resto de rotaciones).
3. **Completar la carta** (`docs/RESPUESTA-CLIENTE-BORRADOR.md` v3.0.0) con tarifa, importes y fechas, y
   enviarla. La red privada ya es el entregable; Polygon es el bloque H6 presupuestado aparte.
4. **Confirmar con el cliente** lo que no depende del equipo: suelo de reventa, royalty por tipo,
   custodia de claves, **fotos definitivas**, PMS y la persona de recepción para probar el check-in.
5. Deuda viva con destino: cobertura de `apps/web`, perfil de 200 concurrentes, cierre del HTTP del
   worker, hash del ancla de check-in, unificación de los dos indexadores de la misma noche, `pnpm audit`
   sin triar y digest de Slither sin fijar.

---

*Documento de estado · punto de partida para la Fase 3 · se actualiza de forma incremental al cerrar cada hito.*

---

## 10. Incremento v2 — owner · recepción · reventa (2026-09-25)

> **Origen**: petición directa del responsable para modificar la plataforma con tres frentes.
> **Documentación**: `RepoTecnico/incremento_v2/` (requerimientos, casos de uso con Gherkin/EARS y
> trazabilidad, y plan de desarrollo). **Decisiones**: D-30…D-37.

### Qué se ha construido

| Hito | Entrega | Ficheros clave |
|---|---|---|
| **H1 · Owner con acceso total** | `DEFAULT_ADMIN_ROLE` (`admin@hotel.es`) habilita **todos** los paneles del back-office; `RECEPTION_ROLE` sigue sin acceso a administración. El guard de API también deja pasar al owner a las rutas de recepción. No eleva privilegios on-chain (RF-30.2). | `apps/web/src/lib/admin-roles.ts`, `components/admin/useAdminSession.ts`, `lib/guard.ts` |
| **H2 · Modelo de datos** | Migración idempotente: `nfts.recovery_code` (+ índice único), `additional_charges`, `stay_checkouts` (UNIQUE por token = idempotencia), `checkout_incidents`; estado `CHECKED_OUT`. Código de recuperación derivado del token (estable, sin PII) y backfill. | `packages/shared/src/db/migrator.ts`, `reception/recovery-code.ts`, `db/repositories/reception.repository.ts` |
| **H3 · API de recepción** | `GET /api/reception/overview`, `GET /api/reception/reservations/lookup`, `GET/POST /api/reception/charges`, `POST /api/reception/checkout`. Todas exigen `RECEPTION_ROLE` o owner. Errores mapeados por código. | `apps/web/src/app/api/reception/*`, `lib/reception-errors.ts` |
| **H4 · UI de recepción** | `/recepcion` con puerta de sesión y 3 pestañas: **Hoy** (reservas + estado de las 50 habitaciones), **Check-in** (QR/JWS + código de recuperación + comprobación de reserva) y **Check-out** (verificación, incidencias, alta y cancelación de cargos). i18n ES/EN/RU. | `components/reception/*`, `app/recepcion/page.tsx` |
| **H5 · Mis reventas** | `/mis-noches/mis-reventas`: publicadas (editar/retirar reutilizando `MyNightCard`/`list`/`unlist`), vendidas (eventos `Sale` como vendedor) y saldo pendiente. Aviso in-app de novedades desde la última visita y **suscripción Web Push** (service worker nuevo; el emisor ya existía en el worker). | `components/my-nights/MyResales.tsx`, `useMyNights.ts`, `components/push/useWebPush.ts`, `public/sw.js`, `app/api/push/vapid/route.ts` |

### Decisiones (D-30…D-37)

1. **D-30** Owner = `admin@hotel.es` con `DEFAULT_ADMIN_ROLE`; acceso total sin tocar el contrato.
2. **D-31** Datos de recepción **solo PostgreSQL** (`nfts` + maestro de 50 habitaciones).
3. **D-32** «Código de recuperación» = código de reserva del huésped (`MDS-…`), persistido y estable.
4. **D-33** Check-out y cargos **off-chain en PostgreSQL**; el contrato no cambia.
5. **D-34** Recepción crea los cargos desde la pantalla de check-out.
6. **D-35** Alcance de reventa: «Mis reventas» con publicar/editar/retirar.
7. **D-36** Avisos **in-app + Web Push anónimo**; no se recoge email (se mantiene el PII-free).
8. **D-37** `/recepcion` exige sesión de `RECEPTION_ROLE` o owner.

### Verificación

- `@hotel/shared` **typecheck OK** y build OK; `@hotel/web` **typecheck OK**.
- `@hotel/shared` suite completa: **297/297 en verde** (incluye los nuevos: `recovery-code` 5,
  `day-board` 5, `reception.repository` 10) y el guardián de documentación, actualizado con el
  catálogo **CU-30…CU-37** en `docs/SRS.md` (v2.1.0).
- Web: nuevas pruebas `admin-roles` (6), API de recepción v2 (13), y guardianes
  `boundaries`/`paused`/`a11y`/`guard` ajustados y en verde. `pnpm --filter @hotel/web lint`
  sin errores y **`next build` de producción OK** (la tabla de rutas incluye
  `/recepcion`, `/mis-noches/mis-reventas`, `/api/reception/{overview,charges,checkout,reservations/lookup}`
  y `/api/push/vapid`).
- **Fallo pre-existente ajeno a este incremento**: `manuals-sync.test.ts` exige que
  `docs/manual-cliente.md` referencie una imagen y ese fichero (sin modificar) no referencia
  ninguna. No se toca aquí; queda anotado.
- Nota de entorno: el `node_modules` estaba incompleto y el lockfile desincronizado con
  `packages/shared/package.json`; se sincronizó con el pnpm declarado (`pnpm@10.32.1`) y se declaró
  `jose` (dependencia no declarada que usaban los tests de la web).

### Deuda declarada

- **Cobro de cargos**: el MVP los registra y cancela; no hay pasarela ni conciliación.
- **PMS**: integración real fuera de alcance; el registro de viajeros (RD 933/2021) sigue en el mostrador.
- **Push**: funciona de extremo a extremo en el backend; el service worker es nuevo y conviene probarlo
  en un navegador real (los tests automáticos no cubren la suscripción del navegador).
- **Tests de UI**: los componentes de recepción y reventa se validan con typecheck y pruebas de las
  funciones puras/API; falta E2E Playwright sobre el flujo completo (Anvil + PostgreSQL reales).

### Despliegue en GCP del incremento v2 (2026-09-26)

- Imágenes `web:v2` y `worker:v2` construidas con Cloud Build; revisiones
  `hotel-mcp-{worker,mcp,web}-00002` al 100 %. Detalle en `despliegue_gcp.md` §12.
- La migración (tablas de recepción y `nfts.recovery_code`) la aplicó el **worker al arrancar**.
- **Web Push operativo**: secreto `hotel-vapid-private-key` + `VAPID_*` en worker y web.
- El `Dockerfile` volvió a `--frozen-lockfile` (**P-1 cerrado**) y el script de despliegue publica
  el worker con `--allow-unauthenticated` (**P-3 corregido**: antes lo dejaba privado y la web
  perdía `/aggregates` y `/history`).
- Verificación E2E real: login MFA de `recepcion@hotel.es` y de `admin@hotel.es`; panel del día con
  **50 habitaciones**; reserva 108 con `recoveryCode MDS-PNEKH8K6`; búsqueda por código 200; owner
  con acceso a recepción (D-30/D-37); worker `lag: 0`.
- **Regla de repositorios**: solo se sube a los remotos de `anlucorporations` y solo a la rama
  `Hotel-DSH-GCP`; `codecrypto` queda excluido del `push` por indicación del responsable.

---

## 11. Incremento v3 — menú de cuenta/wallet y sección Sistemas (2026-09-26)

> **Origen**: petición del responsable. **Documentación**: `RepoTecnico/incremento_v3/`
> (requerimientos, casos de uso Gherkin/EARS y plan). **Decisiones**: D-40…D-45.

### Qué se ha construido

| Hito | Entrega | Ficheros clave |
|---|---|---|
| **H1 · Menú desplegable** | Un único `WalletMenu` en el **back-office** y en la **cabecera pública**: título usuario+rol (o wallet), Seguridad, Usuarios/Roles (solo owner), Salir y acciones de wallet; accesible por teclado. | `components/wallet/WalletMenu.tsx`, `lib/wallet-menu-items.ts`, `WalletBar`/`useOnboarding` |
| **H2 · Sistemas** | Grupo de navegación **solo owner** con Contratos, Usuarios, Finanzas y Operaciones; portada con tarjetas y **gate server-side** propio. | `adminNav.ts`, `AdminLayout`, `app/admin/sistemas/layout.tsx` |
| **H3 · Usuarios** | Listar operadores (sin secretos), **crear/rotar** credenciales (contraseña+TOTP+rescate una sola vez) y activar/desactivar (con revocación de sesiones y sin auto-desactivación). | `UsersRepository.listAll`, `/api/admin/system/users`, `SystemUsers` |
| **H4 · Contratos y Finanzas** | Estado on-chain en solo lectura + gobernanza (roles y pausa) y resumen de agregados + retirada, reutilizando los componentes existentes. | `SystemContractState`, `SystemFinances`, `AdminRoles`/`AdminPause`/`AdminFunds` |
| **H5 · Operaciones** | Salud del worker (lag, agregados, degradaciones) con estado degradado explícito si no responde. | `/api/admin/system/operations`, `SystemOperations`, `fetchWorkerHealth` |
| **H6 · Seguridad** | El operador rota su MFA y cambia su contraseña (exigiendo la actual); MFA pasó de solo-owner a **cualquier rol sobre su cuenta**. | `/api/auth/password`, `mfa/setup`, `AdminSecurity` |

### Artefactos de datos (obligatorios del proceso)

- **Nuevos**: `RepoTecnico/diagrama_er.md` (ER Mermaid de las 16 tablas) y `RepoTecnico/base_datos.sql`
  (script PostgreSQL idempotente). **Actualizado**: `diccionario_datos.md` (16 tablas, `recovery_code`,
  tablas de recepción; corregidas dos contradicciones internas sobre `room_type`).
- Validados por parseo estructural contra `packages/shared/src/db/migrator.ts` (0 diferencias de
  columnas/tipos/índices).

### Verificación

- `@hotel/shared`: typecheck y build OK.
- `@hotel/web`: **typecheck OK**; pruebas nuevas `wallet-menu-items` (6), API usuarios (10) y cambio
  de contraseña (4); guardianes (boundaries, a11y, paused, recepción, admin-auth, legacy y
  documentación) en verde; **`next build` de producción OK**.
- Suite web: 296/297 en verde. El único fallo es `manuals-sync.test.ts` (`docs/manual-cliente.md`
  sin referencia de imagen), **pre-existente y ajeno** a este incremento.

### Deuda declarada

- Desactivar a un operador revoca sus **refresh tokens**, pero su access token (≤15 min) sigue válido
  hasta expirar: el blocklist por `jti` de access tokens no está implementado.
- El cambio de contraseña no revoca las demás sesiones del propio operador.
- El alta de operadores no permite cambiar el rol de uno existente (solo alta con rol y baja lógica).

### Despliegue en GCP del incremento v3 (2026-09-26)

- Imagen `web:v3` (Cloud Build) desplegada como revisión `hotel-mcp-web-00003-78m` al 100 %; el
  `worker` y el `mcp` se mantienen en `v2` (no hay cambios de esquema). Detalle en
  `despliegue_gcp.md` §13.
- Desplegado solo con `--image`, conservando las **18** variables/secretos de la revisión previa.
- Verificación E2E real: owner ve 2 operadores en `/api/admin/system/users` **sin** secretos y
  `/api/admin/system/operations` con worker `ok`; la cuenta de recepción recibe **403** en ambas;
  `/reception/overview` sigue en 200.

---

## 12. Propuesta de reestructuración — bloque 1 cerrado y artefactos de datos (2026-09-26)

### Contexto

Análisis de `RepoTecnico/reestructuraHotel.md`: reorganización del producto en tres suites
(Administración con sidebar derecha y acordeón, Front Office con barra superior, Pública como home de
marca) más cinco dominios nuevos (Habitación, Housekeeping, Mantenimiento, Actividades y Motor de
Reservas). **No se ha modificado la estructura del proyecto**: solo se han creado/actualizado documentos.

### Entregables de la propuesta

| Documento | Contenido |
|---|---|
| `RepoTecnico/propuesta_reestructura.md` | Análisis, IA de las tres suites, modelo de datos, plan de fases §7 recompuesto, riesgos y decisiones D-1…D-33 |
| `RepoTecnico/proceso_actual_habitacion.md` | Diagramas del proceso **actual** de creación/publicación de noches (no existe el ente «habitación») |
| `RepoTecnico/proceso_propuesto_habitacion.md` | Proceso **propuesto** de la sección Habitación, con las 33 decisiones registradas |

### Decisiones cerradas (D-1…D-33)

Bloque 1 **cerrado** tras la entrevista una a una. Resumen: gestión de Habitación por el **administrador
con wallet** (D-1); ficha en PostgreSQL y anclaje on-chain solo de la publicación (D-2, D-18); la **BD es
la fuente única del maestro** (D-3) con registro dinámico dentro de `HotelNights` (D-10) y corte final
único (D-24); acuñado **híbrido idempotente** con ventana global configurable y botón manual (D-4, D-11,
D-16, D-17); fotos locales en `./docs/imagenes` con nomenclatura y reglas JPG/≤2 MB/máx. 5 (D-5, D-12,
D-20); idiomas ES obligatorio con respaldo (D-6); inventario abierto, archivado y varios administradores
(D-7, D-8, D-9); dos estados separados (D-19); tipos fijos Simple/Doble/Suite (D-22); home en `/` con
catálogo en `/catalogo` y reseñas anónimas verificadas (D-27, D-28, D-31). Detalle completo en
`proceso_propuesto_habitacion.md`.

### Artefactos de datos (sincronizados en el mismo cambio)

- `base_datos.sql` → **v1.1.0**: nueva sección 3.5 con 9 tablas (`room_types`, `rooms`, `room_images`,
  `room_amenities`, `room_amenity_links`, `room_publications`, `room_status_history`, `reviews`,
  `platform_settings`), sus índices, semillas (tipos, servicios, `mint_window_days = 90`) y comentarios.
  Total **25 tablas** (16 + 9).
- `diccionario_datos.md` → nuevas secciones **§3.8** y **§3.9** con las 9 tablas campo a campo.
- `diagrama_er.md` → nueva sección **§6** con el diagrama Mermaid y matriz de relaciones ampliada
  (filas 7–15); trazabilidad renumerada a §8.
- `packages/shared/src/db/migrator.ts` → las 9 tablas, índices y semillas añadidas a
  `INITIAL_SCHEMA_SQL`; `resetDatabase()` amplía su lista de `DROP` en orden de dependencias. El
  runtime queda **sincronizado** con los tres artefactos (25 tablas). `schema.sql` se conserva como
  referencia histórica (subconjunto) y el guardián sigue en verde.

### Estado

- No se han modificado contrato, rutas ni estructura de carpetas. Único cambio de código: `migrator.ts`
  (esquema aditivo e idempotente).
- Plan de fases recompuesto (F0…F8); el corte de contrato/reset es la fase final (F8).

---

## 13. Bloque 2 — reservas, actividades, housekeeping y mantenimiento (2026-09-26)

### Entrevista (D-34…D-55)

Bloque 2 **cerrado** con 21 decisiones en `RepoTecnico/proceso_propuesto_recepcion.md`:
Recepción/Reservas (D-34…D-43), Actividades (D-44…D-47), Housekeeping (D-48…D-51) y Mantenimiento
(D-52…D-54), más el cierre de datos sobre el contacto del huésped (D-55). Ideas clave: administración
configura y Front Office opera; la reserva **retiene** y el token se emite **solo al pagar el 100 %**;
sin sobreventa; no-show automático; actividades con cupo estricto y cargo al folio; Housekeeping con
reparto automático, web responsive ahora (app nativa en v3) y rol limitado sin wallet; mantenimiento con
bloqueo/liberación automáticos y preventivo con cronograma.

### Artefactos de datos (sincronizados en el mismo cambio)

- `base_datos.sql` → **v1.2.0**: nueva sección 3.6 con **17 tablas** (reservations, reservation_nights,
  reservation_contacts, reservation_status_history, folios, activities, activity_schedules,
  activity_bookings, housekeeping_shifts, housekeeping_assignments, housekeeping_room_logs, supply_items,
  supply_stock_movements, maintenance_incidents, maintenance_incident_events, preventive_plans,
  preventive_tasks), la columna `additional_charges.folio_id`, sus índices, la semilla de suministros y
  los comentarios. Total **42 tablas**.
- `diccionario_datos.md` → nueva sección **§3.10**; retención del contacto de reserva (D-55) añadida.
- `diagrama_er.md` → nueva sección **§7** con el diagrama Mermaid; matriz de relaciones ampliada
  (filas 16–38); trazabilidad renumerada a §9.
- `packages/shared/src/db/migrator.ts` → las 17 tablas, índices y semillas añadidas a
  `INITIAL_SCHEMA_SQL`; `resetDatabase()` amplía su lista de `DROP` a **42 tablas** en orden de
  dependencias.

### Verificación

- `@hotel/shared`: **typecheck OK**; guardianes de arquitectura (9) y documentación (6) **en verde**.
- Paridad automática migrator ↔ `base_datos.sql`: **42/42 tablas**, 17/17 del bloque 2 con columnas e
  índices idénticos; CREATE/DROP equilibrados (42/42). No hay `psql`/Docker en el entorno, así que la
  **ejecución** del DDL queda pendiente de una base de datos real.

### Deuda declarada

- El **rol `HOUSEKEEPING`** decidido en D-50 no existe aún como rol del sistema: hoy los operadores son
  `DEFAULT_ADMIN_ROLE`/`RECEPTION_ROLE`. Falta decidir si vive en la BD o en el contrato (bloque 3).
- La **disponibilidad (D-41)** debe cruzar `reservation_nights` activas con tokens `nfts` y bloqueos de
  mantenimiento: el índice único parcial cubre reservas, pero no el choque reserva↔token (queda en la
  capa de aplicación).
- Los **tokens no se acuñan** todavía al pagar el 100 % (D-39): es lógica de la API de reservas, aún no
  implementada.
- Igual que en la F1, no se ha tocado el contrato ni las rutas.

---

## 14. Bloque 3 — cierres técnicos y roles del personal (2026-09-26)

### Entrevista (D-56…D-64)

Bloque 3 con **9 decisiones** en `RepoTecnico/proceso_propuesto_bloque3.md`:

- **D-56** Roles `HOUSEKEEPING` y `MAINTENANCE` **en la base de datos**, sin wallet (contraseña + TOTP).
- **D-57** Reserva ↔ token: al acuñar se **omiten** las noches reservadas; al pagar el 100 % se **asigna**
  el token no vendido o se **acuña y vende**.
- **D-58/D-59** Reseñas: **moderación previa** del administrador y **firma EIP-712** del titular de la
  noche consumida.
- **D-60** **Anticipo off-chain** (folio) y **liquidación con wallet on-chain**; el contrato no cambia.
- **D-61** Confirmación por **web + email**; **Telegram a la cuarta versión** (ajusta D-38).
- **D-62/D-63** Rutas independientes **`/housekeeping`** y **`/mantenimiento`** para el personal.
- **D-64** Alertas de stock en el panel de **Lencería** + notificación; sin panel de compras (v3).

**Pregunta aplazada por el cliente:** alcance del **escaneo axe** (RNF-15) en las rutas nuevas.

### Cambios en artefactos

- **No hay tablas nuevas**: los roles de D-56 son vocabulario de `admin_users.role`, no un cambio de
  esquema. Se actualizó la documentación del rol en `base_datos.sql`, `migrator.ts`, `diccionario_datos.md`
  y `diagrama_er.md`.
- `propuesta_reestructura.md`: IA ampliada con las rutas de personal (nuevo §4.5) y registro de
  D-34…D-64.
- El modelo de datos sigue en **42 tablas**, sincronizado.

### Verificación

- `@hotel/shared`: **typecheck OK**; guardianes de arquitectura (9) y documentación (6) **en verde**.
- Sin cambios de esquema, por lo que la paridad migrator ↔ artefactos se mantiene (42/42).

### Deuda declarada

- La **lógica** de D-57 (omitir reservas al acuñar, asignar/acuñar al pagar el 100 %), de D-58/D-59
  (moderación y firma de reseñas) y de D-60 (conciliación anticipo/liquidación) **no está implementada**:
  es trabajo de F2 (Front Office) y F6 (Pública).
- El **contrato `HotelNights`** sigue sin cambios; el corte de la fase F8 mantiene su alcance (registro
  dinámico + reset).
- El escaneo de accesibilidad de las rutas nuevas queda **aplazado** por decisión del cliente.

---

## 15. Bloque 4 — Suite Pública (2026-09-26)

### Entrevista (D-65…D-72)

Bloque 4 con **8 decisiones** en `RepoTecnico/proceso_propuesto_publica.md`:

- **D-65** Reserva desde la web: retiene la noche, **anticipo por transferencia** y **liquidación con
  wallet**.
- **D-66** **Galería propia del hotel** gestionada por el administrador (`docs/imagenes`,
  `hotel-<seccion>-<fecha>-<n>`).
- **D-67** Contacto con dirección/teléfono/email y **mapa OpenStreetMap** (sin clave).
- **D-68** Reseñas aprobadas en **home y ficha**, con **nota media**.
- **D-69** «Planes especiales» como **escaparates informativos**, sin lógica de precios.
- **D-70** **Categoría (estrellas)** + sección de **experiencia** (galería/servicios/reseñas); sin
  valoración por categorías.
- **D-71** Home **one-page** con secciones ancla + páginas propias (`/catalogo`, `/reventa`, …).
- **D-72** La **wallet se conecta al inicio** de la reserva.

### Cambios en artefactos

- **No hay cambios de esquema** (42 tablas sin tocar). Las decisiones de este bloque son de experiencia
  de usuario, rutas y flujo; el detalle de producto vive en `propuesta_reestructura.md` (§4.4) y en el
  documento del bloque.
- `propuesta_reestructura.md`: §4.4 reescrita (home one-page y flujo de reserva) y registro D-65…D-72.

### Deuda declarada

- La **galería del hotel** (D-66) no tiene tabla propia en esta entrega: reutiliza el patrón de
  `room_images`/`docs/imagenes`. Si se quiere gestionar desde el back-office, falta decidir su modelo de
  datos (posible `hotel_images`) antes de F6.
- **OpenStreetMap** (D-67) es una dependencia externa de solo lectura; debe entrar en la CSP y en la
  política de rendimiento (LCP) de la web pública.
- Los **planes informativos** (D-69) no tienen entidad de datos; se gestionarán como contenido si F6 los
  necesita editables.

---

## 16. Bloque 5 — galería, planes y accesibilidad (2026-09-26)

### Entrevista (D-73…D-75)

Bloque 5 con **3 decisiones** en `RepoTecnico/proceso_propuesto_bloque5.md`:

- **D-73** Galería del hotel en tabla **`hotel_images`** (sección de la home, posición, portada, alt text
  por idioma; reglas de imagen de `room_images`, gestionada por el administrador con wallet).
- **D-74** Planes especiales en tabla **`hotel_offers`** (título/descripción multilingües, imagen,
  vigencia, orden, activo; **sin precios**).
- **D-75** El escaneo **axe** se extiende a **todas las rutas nuevas** (tres suites + `/housekeeping` +
  `/mantenimiento`), en escritorio y móvil, con el umbral vigente (cierra la pregunta aplazada del
  bloque 3).

### Artefactos de datos (sincronizados en el mismo cambio)

- `base_datos.sql` → **v1.3.0**: nueva sección 3.7 con **2 tablas** (`hotel_images`, `hotel_offers`), sus
  índices y comentarios. Total **44 tablas**.
- `diccionario_datos.md` → nueva sección **§3.11**.
- `diagrama_er.md` → nueva sección **§6.2**; matriz de relaciones ampliada (fila 39).
- `packages/shared/src/db/migrator.ts` → las 2 tablas, índices añadidos a `INITIAL_SCHEMA_SQL`;
  `resetDatabase()` amplía su lista de `DROP` a **44 tablas**.

### Verificación

- `@hotel/shared`: typecheck OK; guardianes de arquitectura (9) y documentación (6) en verde.
- Paridad migrator ↔ `base_datos.sql`: **44/44 tablas**, 2/2 del bloque 5 con columnas e índices
  idénticos; CREATE/DROP equilibrados (44/44).

### Deuda declarada

- Resueltas las deudas de D-66 (galería) y D-69 (planes): ahora tienen entidad de datos.
- Sigue pendiente la **implementación de lógica** (no el esquema): galería/planes no tienen API ni UI
  todavía (trabajo de F6).
- El **contrato** sigue sin cambios; el corte F8 mantiene su alcance.

---

## 17. Plan definitivo consolidado (2026-09-26)

Se consolida toda la entrevista en [`plan_definitivo.md`](plan_definitivo.md) — **versión 1.0**, pendiente
de aprobación del responsable (fase F0):

- Integra las **75 decisiones (D-1…D-75)** y las **44 tablas** ya sincronizadas.
- Define **8 fases** (F0…F8): F1 shell+Habitación, F2 Front Office/Reservas, F3 Housekeeping,
  F4 Mantenimiento, F5 Actividades, F6 Pública, F7 financiera (3.ª versión, fuera), **F8 corte final**
  (registro dinámico de contrato + reset + primera ventana de acuñado).
- Incluye arquitectura de información destino, trazabilidad decisiones→fases, gates de calidad
  (typecheck, tests con trinquete, axe en todas las rutas nuevas, i18n, privacidad), matriz de permisos y
  riesgos globales.
- `propuesta_reestructura.md` §7 queda marcado como **superado** por el plan definitivo.

**Próximo paso:** aprobación de F0 y arranque de **F1** (shell de Administración + sección Habitación),
que es el primer entregable operativo.

---

## 18. F1 en curso — shell de Administración + Habitación (2026-09-26)

**F0 aprobado** por el responsable. Arranca **F1**.

### Hecho

- **Roles de BD (D-56)**: `HOUSEKEEPING` y `MAINTENANCE` añadidos en los 8 puntos que enumeraban roles
  (`users.repository.ts`, `sessions.repository.ts`, `env/index.ts`, `guard.ts`, ruta `system/users`,
  `mfa/verify`, `create-admin.ts`, `SystemUsers.tsx`) y en los 3 catálogos i18n
  (`system.roleHousekeeping`, `system.roleMaintenance`).
- **`guard.ts`**: `RequiredRole` pasa a ser `AuthRole`; las rutas sin rol explícito siguen reservadas a
  **gestión** (`DEFAULT_ADMIN_ROLE`/`RECEPTION_ROLE`) y los roles de personal **deben declarar su rol**,
  de modo que añadirlos **no amplía** el acceso del back-office clásico.
- **`RoomsRepository`** (`packages/shared/src/db/repositories/rooms.repository.ts`): listado (excluye
  archivadas D-8), alta con número único (D-7), edición parcial, archivar, dos estados con historial
  (D-19), galería (posición 1..5 y portada única, D-20) y publicaciones ancladas (D-2/D-18).
  **17 pruebas** en verde.

### Verificación

- `@hotel/shared`: typecheck y build OK; 70 pruebas de auth/repos/env en verde.
- `@hotel/web`: typecheck OK; 41 pruebas de guard/roles/usuarios en verde.
- Paridad i18n ES/EN/RU comprobada.
- Esquema: sin cambios (44 tablas).

### Pendiente de F1

Shell del sidebar derecho con acordeón (D-29), UI de la sección con i18n y escaneo axe de las rutas
nuevas.

### Avance (ronda 2)

- **API de habitaciones**: `GET/POST /api/admin/rooms`, `GET/PATCH/DELETE /api/admin/rooms/[id]` con
  validación compartida (`apps/web/src/lib/rooms.ts`), huella keccak256 de la ficha y `PATCH` que
  **rechaza publicar** (exige el endpoint con TOTP). `POST /api/admin/rooms/[id]/publish` verifica TOTP
  contra la semilla del operador, exige descripción ES (D-21) y una foto (D-20), registra la publicación
  y la marca anclada o pendiente (D-18).
- **Galería**: `apps/web/src/lib/room-images.ts` (nomenclatura D-5/D-12, anti-traversal, JPG ≤2 MB),
  servido `GET /api/rooms/images/[file]` (expone `docs/imagenes` fuera de `public/`) y administración
  `GET/POST /api/admin/rooms/[id]/images` + `PATCH/DELETE …/[imageId]`.
- **Pruebas nuevas**: 17 (repositorio) + 25 (API habitaciones/publicación) + 8 (librería de imágenes) +
  11 (rutas de imágenes) = **61 pruebas en verde**; `@hotel/web` typecheck OK.

### Avance (ronda 3) — shell e interfaz

- **Shell de Administración (D-29)**: `adminNav.ts` reorganizado en **secciones** (`ADMIN_NAV_SECTIONS`);
  `AdminLayout` pasa el sidebar a la **derecha** y lo convierte en **acordeón de una sola sección
  abierta** (arranca en la de la ruta activa), con botón de menú en móvil (`aria-expanded`/`aria-controls`).
- **Sección Habitación** (`/admin/habitacion`): página + `RoomsAdmin` con alta, listado, ficha editable,
  galería (subir JPG, marcar portada, eliminar), pausar/publicar (modal TOTP) y archivar. i18n del
  namespace `rooms` en ES/EN/RU con paridad y claves de sección en `admin.nav`.
- **Fronteras**: se añadió el tipo isomorfo `BackOfficeRoleName` en `@hotel/shared/domain` (para que el
  cliente no importe el barril raíz) y `lib/rooms.ts` pasa a `server-only`. El guardián `boundaries` está
  en verde.
- **Build de producción** de `@hotel/web`: **OK**; la ruta `/admin/habitacion` queda compilada.
- **Pruebas**: 198 pruebas de `lib` + `api/admin` (197 en verde); el único fallo es
  `manuals-sync.test.ts`, **preexistente y ajeno**. `a11y` estático 17/17.

### Limitaciones declaradas

- **Anclaje on-chain de la publicación**: F1 calcula y guarda la **huella keccak256** y exige TOTP, pero la
  **firma con wallet y la transacción** necesitan el **registro dinámico del contrato (F8, D-10)**. Por
  ahora la publicación queda `PENDING_ANCHOR` (202).
- **axe E2E**: `/admin/habitacion` ya está en `e2e/a11y.spec.ts`, pero el navegador no arranca en este
  entorno por falta de `libnspr4`/`libnss3` y no haber root para instalarlos; queda para CI.

---

## 19. F1 · Anclaje on-chain — corte de contrato adelantado (2026-09-26)

El responsable eligió **adelantar el corte de contrato (F8)** para cerrar el anclaje de la publicación
dentro de F1. Ejecutado:

### Contrato (`HotelNights.sol`)

- **Registro dinámico de habitaciones** (D-3/D-10): `registerRoom(room, roomType)`,
  `updateRoomType`, `isRoomRegistered`, `roomTypeOf`; **arranca vacío** (D-13) y `RoomMaster` queda como
  **semilla de carga y referencia histórica** (D-14), ya no como autoridad. `mint` exige
  `isRoomRegistered` (error `RoomNotRegistered`) y el tipo se lee del registro.
- **Anclaje de la publicación** (D-18): `publishRoom(room, contentHash)` guarda la huella y emite
  `RoomPublished`; `publicationHashOf` la expone. Solo `DEFAULT_ADMIN_ROLE`.
- Errores/eventos nuevos en `IHotelNights`; ABI regenerado (`packages/shared/src/abi/hotel-nights.ts`).
- El royalty sigue **inmutable por tipo**, ahora leído del registro on-chain.

### Aplicación

- `RoomsAdmin`: al publicar, sincroniza el registro (`registerRoom` si falta) y ancla la huella
  (`publishRoom`) con la wallet; envía `txHash` a la API, que marca la publicación **anclada** (200).
  Sin wallet/RPC, la publicación sigue funcionando y queda `PENDING_ANCHOR` (202).

### Verificación

- **Foundry: 139 pruebas en verde** (14 suites), incluidas **14 nuevas** del registro y el anclaje
  (`test/HotelNights.rooms.t.sol`). Los `setUp` siembran el registro con `RoomRegistrySeed` (D-14).
- **Integración real en Anvil**: despliegue del contrato, `isRoomRegistered(101) = false` (D-13),
  `registerRoom(101,"simple")`, `publishRoom(101, 0xab…)` y `publicationHashOf(101)` idéntico a la huella.
- `@hotel/web`: typecheck OK, **build de producción OK**, 58 pruebas de habitaciones/fronteras en verde.

### Pendiente declarado (resto de F8)

- **Reset total** coordinado (D-15) y **siembra** de las 50 habitaciones desde la BD (D-3).
- **Ventana de acuñado** global con botón manual (D-4/D-11/D-17).
- **Paso `registerRoom`** en los scripts de desarrollo/E2E (`seed-demo`, `inject-data`, `e2e/m4…m7`)
  antes de mintear: sin él, esos scripts fallan con `RoomNotRegistered` y no se han podido re-ejecutar
  aquí (requieren Anvil y datos).

### Cierre de F1

**F1 COMPLETADA (2026-09-26)** por aceptación del responsable: los scripts de desarrollo/E2E quedan como
**deuda de F8** (junto con el reset, la siembra desde la BD y la ventana de acuñado), y el axe E2E como
limitación de entorno cubierta en CI. El objetivo de la fase se da por cumplido con el anclaje on-chain
verificado en Anvil y **139 pruebas Foundry** en verde.

---

## 20. F2 en curso — Front Office y Motor de Reservas (2026-09-26)

Arranca **F2** (D-26, D-32, D-34…D-43, D-55, D-57, D-60).

### Hecho

- **`ReservationsRepository`** (`packages/shared/src/db/repositories/reservations.repository.ts`):
  - Disponibilidad **exacta** noche a noche (`FREE`/`RESERVED`/`SOLD`) cruzando reservas activas y
    tokens vendidos (D-41/D-57).
  - Alta **reteniendo** noches en transacción; la BD impide la sobreventa con el índice único parcial
    `(room_id, night_date) WHERE active` y el repositorio traduce la violación a `UNAVAILABLE` (D-41).
  - Contacto **cifrado (AES-256-GCM) y purgable** (D-55); folio abierto al crear (D-60).
  - `confirmReservation` (sin emitir token, D-39), `cancelReservation`/`markNoShow` liberando inventario
    (D-40/D-42), `expireHolds` (D-37), `modifyReservation` con recálculo (D-43),
    `recordDeposit` (D-60) y `assignToken` (D-57).
  - **13 pruebas** en verde.
- **API de recepción** (`apps/web/src/app/api/reception/`): `GET /availability`,
  `GET/POST /reservations`, `GET/PATCH/DELETE /reservations/[id]`, `POST …/confirm`,
  `POST …/deposit`. Todas exigen `RECEPTION_ROLE`; ninguna registra PII en claro. **14 pruebas**.
- `@hotel/shared` typecheck y build OK; `@hotel/web` typecheck OK.

### Pendiente de F2

- **Shell Front Office** con barra superior (D-32) y reubicación de `/recepcion/*`.
- **UI del motor de reservas** (i18n ES/EN/RU).
- **Regla reserva↔token en el acuñado** (D-57): al acuñar la ventana se omiten las noches reservadas y
  al pagar el 100 % se asigna el token no vendido o se acuña (D-39).
- **Reserva con wallet** desde la web (D-65/D-72) y **purga programada** de contactos.

### Avance (ronda 1) — shell, UI y regla reserva↔token

- **Shell Front Office (D-32)**: `recepcion/layout.tsx` + `FrontOfficeShell` (barra superior
  Operación · Reservas). `/recepcion` sigue siendo la raíz; la página se movió al layout sin duplicar
  `PublicShell`.
- **UI del motor de reservas** en `/recepcion/reservas` (`ReservationsAdmin`): alta con comprobación de
  disponibilidad, confirmar/cancelar y listado; gating por `RECEPTION_ROLE`; i18n ES/EN/RU con paridad.
- **Endpoint** `GET /api/reception/rooms` (solo habitaciones `PUBLISHED`, sin campos sensibles).
- **D-57 en el acuñado**: `isNightReserved` en el repositorio y, en `/api/admin/mint`, las noches
  reservadas se **omiten** (`omittedReservedNights`) o el lote entero devuelve **409 `RESERVED_NIGHTS`**.
- **Verificación**: `@hotel/shared` 30/30; `@hotel/web` 73/73 (incluye recepción, admin, guardianes de
  recepción y fronteras); typecheck de ambos; **build de producción OK** con `/recepcion` y
  `/recepcion/reservas`; `/recepcion/reservas` añadida al escaneo axe de `e2e/a11y.spec.ts`.
- **Pendiente**: liquidación al 100 % con asignación/acuñado (D-39/D-57) desde la web con wallet
  (D-65/D-72), purga programada de contactos (D-55) y `no-show` automático programado (D-42).

### Avance (ronda 2) — liquidación y automatización

- **Plan de liquidación al 100 % (D-57/D-60)**: `ReservationsRepository.planSettlement` decide noche a
  noche **asignar** el token no vendido (lo enlaza), marcar **`needsMint`** si no existe, o
  **`conflicts`** si ya lo compró otra persona. Endpoint `POST /api/reception/reservations/[id]/settle`
  (409 `SETTLEMENT_CONFLICT`); la compra/acuñado on-chain la firma la wallet en la suite pública (F6).
- **Automatización (D-37/D-42/D-55)**: `purgeExpiredData` (`packages/shared/src/maintenance/retention.ts`)
  ahora también ejecuta `expireHolds` (bloqueos vencidos), `markNoShows` (confirmadas sin presentarse) y
  `purgeContacts` (contactos de estancias terminadas). El **planificador de retención del worker** ya
  las corre cada 6 h, así que el vencimiento, el no-show y la purga son automáticos. `PurgeResult` gana
  `expiredHolds`, `noShows` y `purgedContacts`.
- **Verificación**: `@hotel/shared` 34/34 (19 del repositorio de reservas), `@hotel/web` 51/51 en
  recepción, `@hotel/worker` typecheck y 5/5 de retención, typecheck de web, **build de producción OK**.
- **Pendiente**: reserva y liquidación **con wallet** desde la suite pública (D-65/D-72, F6) y no-show
  con **hora límite configurable** (hoy es por fecha de entrada).

### Avance (ronda 3) — configuración persistida y no-show con hora

- **`SettingsRepository`** (`platform_settings`): `get`, `getNumber` (con respaldo) y `set` con upsert.
  Claves: ventana de acuñado (D-11), **anticipo** (D-37), **plazo de bloqueo** (D-37) y **hora del
  no-show** (D-42).
- **`GET/PUT /api/admin/settings`** (solo owner): lee los ajustes vigentes y valida rangos antes de
  escribir (0-100 % de anticipo, 1-720 h de plazo, 0-23 h de no-show, 1-365 días de ventana).
- **Alta de reserva**: si no se pasa importe, el anticipo y el plazo se leen de los ajustes
  (respaldo 30 % / 24 h), de modo que son **configurables sin desplegar**.
- **No-show con hora límite (D-42)**: `markNoShows(now, noShowHour)` marca las confirmadas de hoy solo
  cuando la hora actual supera la configurada (y siempre las de días anteriores); el worker lee la hora
  de los ajustes.
- **Verificación**: `@hotel/shared` **87/87** (todos los repositorios + guardianes), `@hotel/worker`
  5/5, `@hotel/web` 57/57 en administración/recepción, typecheck de ambos y **build de producción OK**.
- **Pendiente**: **reserva y liquidación con wallet** desde la suite pública (D-65/D-72, F6) y una
  **pantalla de ajustes** en el back-office (la API ya está; la UI es conveniencia).

### Avance (ronda 4) — pantalla de ajustes

- **`/admin/sistemas/ajustes`** (`SettingsAdmin`): formulario para la **ventana de acuñado** (D-11),
  el **anticipo** (D-37), el **plazo de bloqueo** (D-37) y la **hora del no-show** (D-42), con rangos
  validados y aviso de resultado. Entrada nueva en el menú **Sistemas** (solo owner).
- i18n ES/EN/RU con paridad (namespace `settings` + `admin.nav.settings` + títulos del panel); la ruta
  se añade al escaneo axe.
- **Verificación**: `@hotel/web` typecheck OK, 10/10 en ajustes/fronteras/guardián de admin, **build de
  producción OK** con `/admin/sistemas/ajustes`.
- Con esto la configuración queda **de punta a punta**: UI → API → `platform_settings` → alta de reserva.
- **Pendiente**: **reserva y liquidación con wallet** desde la suite pública (D-65/D-72, F6).

### Avance (ronda 5) — corrección del historial y cierre de F2

- **Defecto corregido** en `reservation_status_history`: las transiciones (confirmar/cancelar/no-show)
  escribían `from_value = NULL` y la modificación anotaba `'MODIFIED'` como si fuera un estado. Ahora se
  lee el estado **anterior real** y se registra la transición `from → to`; la modificación anota el
  estado vigente a ambos lados con el motivo «Modificación de reserva».
- **Pruebas**: 2 nuevas que verifican `PENDING → CONFIRMED` y `CONFIRMED → CANCELLED` en el historial.
- **Verificación**: `@hotel/shared` **89/89**, `@hotel/web` **129/129** (admin + recepción + guardianes)
  y typecheck, `@hotel/worker` typecheck 5/5, **build de producción OK**.

### Cierre de F2

**F2 COMPLETADA (2026-09-26).** Cubre el shell Front Office (D-32), el motor de reservas completo
(crear/confirmar/modificar/cancelar, disponibilidad exacta sin sobreventa, anticipo y vencimiento
configurables), el no-show automático con hora, la regla reserva↔token (D-57), el folio con anticipo
off-chain y la configuración persistida con su pantalla. **La reserva y la liquidación con wallet
quedan en F6** (suite pública), tal como fija el plan; **el axe E2E** sigue cubierto en CI por la
limitación de librerías del entorno.

---

## 21. F3 — Housekeeping (2026-09-27)

Suite Administración → **Housekeeping** y ruta de personal `/housekeeping`: tablero en tiempo real,
reparto automático por ocupación, estados operativos y lencería con alertas. Cubre **D-19, D-30,
D-48…D-51, D-62 y D-64**.

### Hecho

- **`HousekeepingRepository`** (`packages/shared/src/db/repositories/housekeeping.repository.ts`):
  turnos por día y etiqueta (D-48), **habitaciones a limpiar deducidas de la ocupación** con su motivo
  (`CHECKOUT`/`DIRTY`/`STAYOVER`), **reparto automático rotatorio e idempotente** (`autoAssign`, no pisa
  lo ya asignado), **ajuste manual** (`assignRoom`/`unassignRoom`), estados operativos con traza en
  `housekeeping_room_logs` (`startAssignment`, `completeAssignment`, `setRoomOperationalStatus`) y
  **lencería** (`listSupplyItems`, `listLowStock`, `restock`, `consumeSupplies`, `listMovements`).
  El consumo **nunca deja stock negativo**: descuenta como mucho lo disponible y registra el consumo real.
- **Descuento automático + umbral (D-51)**: al terminar una habitación se aplica el consumo por defecto
  (`DEFAULT_CLEANING_CONSUMPTION`: jabón, papel, toallas y sábanas) y se devuelven los artículos que
  quedan **bajo umbral**.
- **API `/api/housekeeping`** (rol `HOUSEKEEPING`; el owner también entra, D-56):
  turnos (`GET`/`POST`), asignaciones (`GET`/`POST`/`DELETE`), habitaciones a limpiar (`GET`),
  cambio de estado (`POST /rooms/[id]/status`) y **flujo SSE** (`GET /stream`).
  Y **panel de Lencería** `GET/POST /api/admin/housekeeping/supplies` (solo owner).
- **Tablero en tiempo real (D-30)**: `GET /api/housekeeping/stream` sondea la fuente única
  (PostgreSQL) cada **1,5 s** y emite un evento `board` **solo cuando cambia** la firma del tablero
  (`boardSignature`). Al ser sondeo sobre la base, funciona con **varias instancias** de la web.
- **UI `/housekeeping`** (D-50/D-62): ruta independiente, móvil, un toque por acción (crear turno,
  reparto automático, empezar/terminar, asignar a mano), indicador *en directo*, aviso de stock bajo y
  gating por rol (`HOUSEKEEPING` o owner) con el acceso canónico.
- **UI `/admin/housekeeping/lenceria`** (D-64): existencias, umbral crítico, resaltado de lo que está
  bajo umbral y reposición. Entrada nueva en el menú de Administración (sección **Housekeeping**).
- **Notificación web/email (D-64)**: además del panel, cuando limpiar una habitación o un ajuste deja un
  artículo bajo umbral se encola un aviso operativo (`DEVOPS_ALERT`) al responsable vía la cola única
  (`apps/web/src/lib/low-stock.ts`). Es tolerante a fallo: sin destinatario o sin Redis, el stock ya se
  descontó y el panel sigue mostrando la alerta.
- **Check-out → `DIRTY` (D-19)**: `ReceptionRepository.createCheckout` deja la habitación en `DIRTY` y
  anota la transición en `housekeeping_room_logs`, de modo que el check-out alimenta el reparto de limpieza.
- **i18n ES/EN/RU** con paridad (899 claves por idioma) en los namespaces `housekeeping` y `supplies`.

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **398**, `@hotel/shared` **353**, `@hotel/worker`
  **119**, `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.081 pruebas, 0 fallos,
  con `forge` en el PATH).
- Pruebas nuevas de F3: **13** del repositorio de Housekeeping (más 23 con el de recepción) y **17**
  en la web (12 de API + 5 de utilidades del tablero), con `boundaries` y `a11y` (escáner de color)
  en verde.
- Rutas `/housekeeping` y `/admin/housekeeping/lenceria` añadidas al escaneo axe de `e2e/a11y.spec.ts`.
- **Build de producción OK**: `next build` compila `/housekeeping`, `/admin/housekeeping/lenceria` y las
  siete rutas de `/api/housekeeping/*`.

### Limitaciones declaradas

- El **axe E2E** sigue sin poder ejecutarse en este entorno (faltan `libnspr4`/`libnss3` y no hay root);
  queda cubierto en CI, como en F1/F2.
- El **aviso por correo** de stock bajo requiere `DEVOPS_ALERT_EMAIL` configurado; sin él, la alerta
  vive solo en el panel de Lencería (comportamiento por diseño, no silencioso: se registra el motivo).
- El **SSE por sondeo** a 1,5 s cumple el criterio de <2 s; no se introduce un bus en memoria para no
  romper el despliegue multi-instancia.

---

## 22. F4 — Mantenimiento y Servicios Técnicos (2026-09-27)

Suite Administración → **Mantenimiento** y ruta de personal `/mantenimiento`: incidencias con bloqueo
de venta, preventivo con cronograma y aviso de tareas vencidas. Cubre **D-52, D-53, D-54 y D-63**.

### Hecho

- **`MaintenanceRepository`** (`packages/shared/src/db/repositories/maintenance.repository.ts`):
  incidencias con ciclo de vida y **eventos con actor** (`reportIncident`, `assignIncident`,
  `resolveIncident`, `cancelIncident`), **bloqueo de venta** (`listBlockedRoomIds`, `isRoomBlocked`),
  planes preventivos (`createPlan`, `listPlans`, `setPlanActive`) y tareas con **generación de la
  siguiente al cerrar** (`completeTask`/`skipTask`), **listado de vencidas** (`listDueTasks`) y
  **registro del cumplimiento** (quién y cuándo). **13 pruebas**.
- **Bloqueo y liberación automáticos (D-53)**: la incidencia `OPEN`/`IN_PROGRESS` con `blocks_sale`
  retira la habitación de la venta **sin tocar su publicación**; al resolverla o cancelarla, el filtro
  desaparece solo. La restricción se aplica en el punto de venta:
  `ReservationsRepository.createReservation` devuelve **`ROOM_BLOCKED`**, `/api/reception/rooms`
  excluye las bloqueadas y `/api/reception/availability` responde `blocked: true`.
- **API `/api/mantenimiento`** (rol `MAINTENANCE`; el owner también entra): incidencias
  (`GET`/`POST`, con **recepción y limpieza** habilitadas para reportar, D-52), transición
  (`PATCH /incidents/[id]`), tareas (`GET /tasks`, `PATCH /tasks/[id]`), tablero (`GET /board`) y
  habitaciones reportables (`GET /rooms`).
- **API admin `/api/admin/mantenimiento/*`** (solo owner): supervisión de incidencias y planes
  preventivos (`GET`/`POST /plans`, `PATCH /plans/[id]`).
- **Guard multi-rol (D-52)**: `requireRole` admite ahora **varios roles alternativos**; el owner
  sigue satisfaciendo cualquiera.
- **UI `/mantenimiento`** (D-63): tablero móvil del técnico con incidencias abiertas
  (asignármela/resolver/cancelar), tareas vencidas (hecha/omitir) y formulario de reporte.
- **UI `/admin/mantenimiento/incidencias` y `/admin/mantenimiento/preventivo`** (owner), con la
  sección **Mantenimiento** en el menú de Administración.
- **Reporte desde recepción y limpieza (D-52)**: el formulario `ReportIncidentPanel` se integra en el
  tablero de recepción y en el de housekeeping.
- **Aviso programado (D-54)**: `preventive-scheduler` del worker avisa **una vez al día** (cerrojo por
  día, correo por la cola única) de las tareas vencidas o de hoy; el muestrario del técnico las ve
  igualmente si el correo no está configurado. **4 pruebas**.
- **Vocabulario isomorfo**: tipos de avería, prioridades, estados y periodicidades en
  `@hotel/shared/domain`, compartidos por formularios de cliente y validación de servidor.
- **i18n ES/EN/RU** con paridad (979 claves por idioma) en el namespace `maintenance`.

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **410**, `@hotel/shared` **367**, `@hotel/worker`
  **123**, `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.111 pruebas, 0 fallos).
- Pruebas nuevas de F4: **13** del repositorio de Mantenimiento y **1** de `ROOM_BLOCKED` en reservas,
  **4** del planificador preventivo y **12** de API en la web; `boundaries` y `a11y` en verde.
- `/mantenimiento`, `/admin/mantenimiento/incidencias` y `/admin/mantenimiento/preventivo` añadidas al
  escaneo axe de `e2e/a11y.spec.ts`.

### Limitaciones declaradas

- El **correo del aviso preventivo** requiere `MAINTENANCE_ALERT_EMAIL` (o `DEVOPS_ALERT_EMAIL`); sin
  destinatario, el planificador registra el motivo y el aviso vive en el tablero del técnico.
- El **axe E2E** sigue cubierto en CI por la limitación de librerías del entorno (igual que F1–F3).

---

## 23. F5 — Actividades (2026-09-27)

Suite Administración → **Actividades** y pestaña de actividades en Front Office: catálogo y horarios
con **cupo estricto**, inscripción **solo de estancias activas**, **cargo al folio** y **lista de
espera opcional**. Cubre **D-44…D-47**.

### Hecho

- **`ActivitiesRepository`** (`packages/shared/src/db/repositories/activities.repository.ts`):
  catálogo y horarios (`createActivity`, `updateActivity`, `createSchedule`, `setScheduleActive`,
  `listSchedules` con ocupación y plazas libres), inscripción (`book`) y cancelación con
  **promoción automática** de la lista de espera (`cancelBooking`). **11 pruebas**.
- **Cupo estricto sin sobreventa (D-47)**: el horario se bloquea con `FOR UPDATE` durante la
  inscripción; dos recepcionistas concurrentes no pueden superar el aforo.
- **Lista de espera opcional (D-47)**: con el horario lleno, `allowWaitlist` deja la inscripción en
  `WAITLIST` sin cargo; al cancelar una plaza, la primera de la espera **se promociona** y se le crea
  su cargo.
- **Solo estancias activas (D-45)**: la reserva debe estar `CONFIRMED` y en curso en la fecha de la
  actividad.
- **Cargo al folio (D-46)**: la inscripción crea una línea en `additional_charges` ligada al
  **folio** de la estancia. Se relaja `additional_charges.token_id` a **NULL** (migración idempotente):
  una reserva confirmada puede no tener todavía token (llega con la liquidación, D-57). Artefactos de
  datos sincronizados (`base_datos.sql`, `diccionario_datos.md`, `diagrama_er.md`).
- **API admin `/api/admin/actividades/*`** (owner): catálogo (`GET`/`POST`, `PATCH`), horarios
  (`GET`/`POST`, `PATCH`). **API recepción `/api/reception/actividades/*`** (`RECEPTION_ROLE`):
  horarios del día, inscripciones (`GET`/`POST`) y cancelación (`DELETE`, devuelve la promocionada).
- **UI**: `/admin/actividades` (catálogo y horarios) y pestaña **Actividades** en `/recepcion`
  (inscripción con ocupación real, lista de espera y cancelación).
- **i18n ES/EN/RU** con paridad (1.027 claves por idioma) en el namespace `activities`.

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test` (por paquetes): `@hotel/web` **420**, `@hotel/shared` **378**, `@hotel/worker` **123**,
  `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.132 pruebas, 0 fallos).
- Pruebas nuevas de F5: **11** del repositorio de Actividades y **10** de API en la web; `boundaries`
  y `a11y` en verde.
- **Endurecido** el test de códigos de rescate de `auth.test.ts`: bcrypt con 8 hashes + 8
  comparaciones quedaba al borde de 15 s bajo la ejecución de todo el workspace en paralelo y se
  volvía intermitente; ahora tolera 30 s manteniendo la afirmación.
- `/admin/actividades` añadida al escaneo axe; **build de producción OK** con las ocho rutas nuevas de
  actividades.

### Limitaciones declaradas

- El cargo de actividad se **imputa al folio**; el **cobro** es de la contabilidad de la 3.ª versión
  (D-33), igual que el resto de `additional_charges`.
- La inscripción se apoya en una **reserva** (el modelo `activity_bookings.reservation_id` es
  obligatorio); una noche comprada sin reserva asociada queda para cuando exista ese vínculo.
- El **axe E2E** sigue cubierto en CI por la limitación de librerías del entorno.

---

## 24. Navegación de suites desde la suite pública (2026-09-27)

Ajuste de navegación pedido por el responsable, cerrado con **D-76** y **D-77**. **No cambia el
modelo de datos** (`diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` siguen sincronizados
sin cambios).

**D-76 (decisión del cliente, aplicada).** La **suite pública es el home del proyecto**: vive en la
raíz `/` y ninguna otra suite ocupa esa ruta. La primera entrada de la cabecera pasa a llamarse
**«Inicio»** (`/`); el catálogo sigue sirviéndose en esa misma página.

**D-77 (decisión del cliente, aplicada).** Desde la suite pública, el **menú de Usuario** de la barra
de navegación ofrece el **acceso a las otras suites según el tipo de usuario**:

| Tipo de usuario | Suites que ve en el menú |
|---|---|
| Owner (`DEFAULT_ADMIN_ROLE`) | Administración · Recepción · Housekeeping · Mantenimiento |
| Recepción (`RECEPTION_ROLE`) | Front Office (`/recepcion`) |
| Housekeeping | su ruta (`/housekeeping`) |
| Mantenimiento | su ruta (`/mantenimiento`) |
| Otros roles de back-office (minter, pauser, burner, tesorería) | Administración |
| **Sin sesión** | **solo «Iniciar sesión»** (`/admin`), sin accesos a suites |

### Hecho

- **`suite-access.ts`** (`apps/web/src/lib/suite-access.ts`): función pura que traduce roles → suites;
  es **solo vista** (cada suite revalida el rol en servidor), con **6 pruebas**.
- **`walletMenuItems`** ampliado con las acciones `suiteAdmin`, `suiteReception`, `suiteHousekeeping`
  y `suiteMaintenance`, agrupadas bajo el encabezado **«Tus suites»**; sin sesión solo «Iniciar
  sesión». **7 pruebas**.
- **`WalletMenu`**: la insignia de rol admite ya los roles de personal sin wallet
  (`HOUSEKEEPING`, `MAINTENANCE`), que antes habrían quedado sin etiqueta.
- **`SiteHeader`**: la cabecera pública conoce la **sesión** (`useAdminSession`) y la pasa al menú;
  la primera entrada de navegación es **«Inicio»**. Al ser solo vista, no concede permisos: sin
  sesión válida el menú no ofrece suites y cada suite mantiene su guard.
- **i18n ES/EN/RU** con paridad (1.034 claves por idioma): `shell.navHome` y el bloque de suites/roles
  del namespace `walletMenu`.

### Verificación

- `pnpm typecheck` de la web en verde.
- Pruebas nuevas/actualizadas: **6** de `suite-access` y **7** de `wallet-menu-items`; `boundaries`
  (frontera cliente/servidor) en verde (los módulos nuevos no importan el barril raíz).

---

## 25. F6.1 — Home one-page de la suite pública y catálogo en `/catalogo` (2026-09-27)

Primer incremento vertical de **F6**. Cierra **D-31** (el catálogo en su propia página) y sienta la
**home one-page** en `/` con las secciones informativas de la suite pública (base de D-66…D-71).
**No cambia el modelo de datos** (los tres artefactos siguen sincronizados sin cambios).

### Descomposición de F6 (para no mezclar entregas)
| Incremento | Alcance |
|---|---|
| **F6.1 ✅** | Home one-page en `/`, catálogo en `/catalogo`, contenido de `hotel_images`/`hotel_offers`/`reviews`/`activities` y contacto con mapa |
| F6.2 | Reseñas completas: alta **firmada EIP-712** del titular de una noche consumida y **moderación** del administrador (D-28, D-58, D-59) |
| F6.3 | **Reserva con wallet**: retención, anticipo por transferencia y liquidación al 100 % (D-65, D-72) |
| F6.4 | Gestión de **galería y planes** desde el back-office (D-73, D-74) |

### Hecho

- **`ContentRepository`** (`packages/shared`): lectura de `hotel_images` (galería por sección y
  portada) y `hotel_offers` (planes activos y vigentes por fecha). **4 pruebas**.
- **`ReviewsRepository`** (`packages/shared`): reseñas **`APPROVED`** (anónimas: sin `token_id` ni
  `room_id`), **nota media** con recuento y listado por estado para la futura moderación. **4 pruebas**.
- **`getHomeContent()`** (`apps/web/src/lib/home-content.ts`): agrega las cuatro fuentes con
  `allSettled`; si una falla, su sección queda vacía y **la home sigue sirviendo** (degradación
  elegante). Marcado `server-only`.
- **Home one-page `/`** (`HomeSections`): marca y categoría, servicios, estilos de habitación, planes,
  actividades, experiencia con galería, reseñas con nota media y contacto con **mapa OpenStreetMap**
  (`iframe` con `title` accesible y `loading="lazy"`, D-67).
- **Catálogo en `/catalogo`** (D-31): misma parrilla, filtros y compra; `/` deja de ser el catálogo.
  Navegación con la entrada **«Catálogo»** y cabecera propia.
- **Servidor de imágenes de contenido** `GET /api/content/images/[file]` con validación de nombre y
  defensa contra traversal (`lib/hotel-images.ts`, 5 pruebas), caché inmutable.
- **CSP**: se añade `frame-src https://www.openstreetmap.org` (solo ese origen) para el mapa.
- **i18n ES/EN/RU** con paridad (1.086 claves por idioma): namespace `home` completo, `shell.navCatalog`
  y `catalog.pageTitle/pageTagline`.

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **432**, `@hotel/shared` **386**, `@hotel/worker` **123**,
  `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.152 pruebas, 0 fallos).
- Pruebas nuevas: **8** de contenido/reseñas en `@hotel/shared` y **5** de imágenes de contenido en la web.
- Guardianes actualizados al nuevo mapa de rutas: `paused-guardian` apunta al catálogo en
  `app/catalogo/page.tsx` y el guardián de `h1` por ruta reconoce el shell `HomeSections`.
- `/` y `/catalogo` en el escaneo axe de `e2e/a11y.spec.ts`; **build de producción OK** con la home y
  el catálogo.

---

## 26. F6.2 — Reseñas firmadas (EIP-712) y moderación (2026-09-27)

Segundo incremento de **F6**. Cierra **D-59** (solo reseña el titular on-chain de una noche
**consumida**, acreditado con firma EIP-712) y **D-58** (moderación previa del administrador con
motivo). Extiende **D-28** (reseñas anónimas).

### Hecho

- **Firma EIP-712 de reseña** (`packages/shared`): nuevo tipo `REVIEW_AUTH_TYPES` (`SubmitReview`:
  `tokenId`, `rating`, `nonce`, `expiresAt`) en el dominio isomorfo y verificador
  `verifyEIP712ReviewRequest`. La **nota va dentro de la firma**: el servidor rechaza una reseña cuya
  nota no sea la firmada. Reutiliza el dominio del resguardo y el patrón de ADR-05 (nonce de un solo
  uso + vigencia ≤ 5 min).
- **Guardián reutilizable** (`lib/ticket-ownership.ts`): se extrae el núcleo `requireOwnership`
  (cabeceras, TTL, nonce, titularidad **on-chain** por `ownerOf`) para que el resguardo y la reseña
  compartan exactamente las mismas defensas; `requireReviewOwnership` solo cambia el mensaje firmado.
- **Esquema**: `reviews.moderation_notes VARCHAR(200)` (migración idempotente) sincronizada en
  `base_datos.sql`, `diccionario_datos.md` y `diagrama_er.md`.
- **`ReviewsRepository`**: alta `PENDING` (`create`, `ALREADY_REVIEWED` ante duplicado),
  `findByToken`, `moderate` (solo sobre `PENDING`, con quién/cuándo/motivo) y lectura pública ya
  existente. **9 pruebas**.
- **API**: `POST /api/reviews` (público) exige token `CHECKED_OUT`, ausencia de reseña previa y
  **firma del titular**; 201 `PENDING`. `GET /api/admin/reviews?status=…` y
  `PATCH /api/admin/reviews/[id]` (`approve`/`reject` + motivo), solo owner. **10 pruebas**.
- **UI**: `/admin/resenas` (moderación con motivo y estados) y formulario **«Dejar reseña»** en
  `/mis-noches` para las noches pasadas, que firma con la wallet del titular. Sección **Reseñas** en
  el menú de Administración.
- **i18n ES/EN/RU** con paridad (1.115 claves por idioma).

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **446**, `@hotel/shared` **391**, `@hotel/worker` **123**,
  `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.171 pruebas, 0 fallos).
- Pruebas nuevas: **9** del repositorio de reseñas, **10** de API y **4** del guardián de reseñas.
- Candado de revisión: solo las reseñas **`APPROVED`** alimentan la home (`ReviewsRepository.listApproved`
  y `summary`), de modo que una reseña `PENDING` **no se publica** (D-58).
- `/admin/resenas` añadida al escaneo axe de `e2e/a11y.spec.ts`; **build de producción OK** con las
  rutas `/admin/resenas` y `/api/reviews`.

---

## 27. F6.3 — Reserva con wallet desde la suite pública (2026-09-27)

Tercer incremento de **F6**. Cierra **D-65** (retener la noche + anticipo por transferencia +
liquidación al 100 %) y **D-72** (la wallet se conecta al inicio), reutilizando el motor de reservas
de F2. **No cambia el modelo de datos.**

### Hecho

- **Precio público reproducible** (`weiToEurCents`, función pura en `packages/shared`): convierte la
  tarifa base (wei) a céntimos de euro con la tasa EUR actual; el anticipo es el porcentaje
  configurado (D-37). **3 pruebas**.
- **API pública**:
  - `GET /api/public/rooms`: habitaciones publicadas y **no bloqueadas** (D-53), con su tarifa base.
  - `POST /api/public/reservations`: **wallet obligatoria** (D-72), valida fechas y correo opcional,
    calcula el total a partir de la tarifa y **retiene la noche** (D-35) con el contacto mínimo cifrado
    (D-55: correo si se da, si no la wallet). Devuelve las **instrucciones del anticipo** (importe,
    referencia `MDS-…` y fecha límite). **7 pruebas**.
  - `GET /api/public/reservations/[id]`: estado de la reserva (el UUID actúa como capacidad; **sin PII**).
  - `POST /api/public/reservations/[id]/settle`: **liquidación al 100 %** (D-57): asigna el token no
    vendido, marca `needsMint` o responde **409** ante conflicto.
- **UI `/reservar`** (`ReserveFlow`): la wallet **primero** (con `WalletBar` si falta conexión o red),
  selección de habitación y fechas, correo opcional, y tras retener muestra anticipo, referencia,
  plazo e instrucciones de transferencia, con actualización de estado y conciliación al 100 %.
- **Navegación**: entrada **«Reservar»** en la cabecera pública y CTA **«Reservar con wallet»** en la
  home.
- **i18n ES/EN/RU** con paridad (1.146 claves por idioma).

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **453**, `@hotel/shared` **394**, `@hotel/worker` **123**,
  `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.181 pruebas, 0 fallos).
- Pruebas nuevas: **3** del conversor `weiToEurCents` y **7** de la API pública de reservas.
- **build de producción OK** con `/reservar` y las rutas `/api/public/*`.
- `/reservar` añadida al escaneo axe de `e2e/a11y.spec.ts`.

### Limitaciones declaradas

- El **anticipo lo confirma recepción** (off-chain) y la **liquidación** la firma la wallet al comprar
  el token (D-60); esta entrega deja la reserva y su conciliación, no el cobro.
- El endpoint público no lleva **límite de tasa** propio: el propio motor limita por inventario (un
  bloqueo activo por habitación y noche) y el bloqueo **vence** solo (D-37); queda anotado añadir un
  rate-limit por IP si el tráfico lo exige.

---

## 28. F6.4 — Gestión de la galería y los planes (2026-09-27) · **F6 COMPLETADA**

Cuarto y último incremento de **F6**. Cierra **D-73** (galería `hotel_images` gestionada por el
administrador con wallet) y **D-74** (planes `hotel_offers` editables, sin precios). Con esto **F6
queda completa**.

### Hecho

- **`ContentRepository` (escritura)**: alta/baja de imágenes con **portada por sección**, alta/edición/
  activación/baja de planes, con `ContentError` (`POSITION_TAKEN`, `OFFER_CODE_TAKEN`). **9 pruebas**.
- **Nombres canónicos de galería** (D-66): `hotel-<seccion>-<AAAA-MM-DD>-<n>.jpg` con validación e
  índice 1..20 (`buildHotelImageFileName`, `isHotelImageName`); se guarda en el mismo `docs/imagenes`.
- **API admin** (solo owner): `GET/POST /api/admin/content/images`, `DELETE/PATCH /api/admin/content/images/[id]`,
  `GET/POST /api/admin/content/offers` y `PATCH/DELETE /api/admin/content/offers/[id]`.
  La subida valida **solo JPG ≤ 2 MB** y guarda el fichero en disco.
- **UI `/admin/contenido`** (`ContentAdmin`): subida de imágenes por sección con alt text, portada y
  borrado; planes con vigencia, activo y borrado. Entrada **Contenido** en el menú (sección Plataforma).
- **i18n ES/EN/RU** con paridad (1.181 claves por idioma).

### Verificación

- `pnpm typecheck`: **6/6 tareas OK**.
- `pnpm test`: **7/7 tareas OK** — `@hotel/web` **461**, `@hotel/shared` **399**, `@hotel/worker` **123**,
  `@hotel/mcp` **38**, `@hotel/monitor` **34** y Foundry **139** (1.194 pruebas, 0 fallos).
- Pruebas nuevas: **5** de escritura en el repositorio de contenido, **2** del nombre de galería y **6**
  de la API de contenido.
- `/admin/contenido` añadida al escaneo axe de `e2e/a11y.spec.ts`; **build de producción OK** con la
  ruta y las cuatro rutas de API.

### Cierre de F6

Con F6.1–F6.4 la **Suite Pública** del plan queda construida: home one-page en `/`, catálogo en
`/catalogo`, reseñas firmadas y moderadas, **reserva con wallet** en `/reservar`, y gestión de
galería/planes. Lo que **no** es de F6 y sigue pendiente del plan: el **corte de contrato de F8**
(registro de habitaciones + siembra) y la **Administración financiera (F7, 3.ª versión)**.

---

## 29. F8 CERRADA — ventana de acuñación, barrido global y aviso de agotamiento (2026-09-27)

**Premisa.** El corte de F8 (contrato con registro dinámico, siembra de las 50 habitaciones, reset D-15
y redespliegue) ya estaba **ejecutado** (`despliegue_gcp.md` §18). Quedaban abiertas las **dos últimas
piezas de la parte 4**: el **correo de agotamiento** (D-17) y el **banco de pruebas del barrido
multi-habitación**; además, el cálculo de la ventana vivía **duplicado** en la ruta `window-overview`.

### Hecho

1. **Cálculo en una sola fuente** (`packages/shared/src/maintenance/mint-window-watch.ts`):
   `buildMintWindowOverview` (ventana vigente + estado por habitación publicada, ordenado por lo que
   más falta) y `selectLowRooms`. Lo comparten la ruta del back-office y el planificador del worker, de
   modo que **la vista y el correo no pueden discrepar**. `MintWindowOverview` publica el `threshold`.
2. **Ruta refactorizada** (`GET /api/admin/rooms/window-overview`): sin lógica propia, responde el
   resumen compartido (misma forma de respuesta; sus **3 pruebas** siguen en verde).
3. **Aviso de agotamiento (D-17)** — `apps/worker/src/mint-window-scheduler.ts`: planificador a la hora
   local del hotel (`MINT_WINDOW_ALERT_HOUR_LOCAL`, por defecto 8) con **cerrojo de pasada**, correo
   por la **cola única** (`DEVOPS_ALERT`, sin PII) al destinatario `MINT_WINDOW_ALERT_EMAIL` (respaldo
   `ADMIN_EMAIL`). Emite **una vez por episodio y habitación** (estado en Redis con `SET NX` y
   caducidad de 30 días), **rearma** cuando la habitación deja de estar en agotamiento y **rearma lo
   reclamado si el encolado falla**, para no perder el aviso. Cableado en `main.ts` con su parada
   ordenada; variables nuevas documentadas en `.env.example` (`MINT_WINDOW_ALERT_EMAIL`,
   `MINT_WINDOW_ALERT_HOUR_LOCAL`, `MINT_WINDOW_CHECK_INTERVAL_MS`).
4. **Banco de pruebas REAL del barrido multi-habitación**: `pnpm test:e2e:f8`
   (`packages/contracts/scripts/e2e/f8-mint-window.ts`), orquestado por
   `scripts/dev/f8-mint-window-sweep.sh` sobre un **Anvil desechable** (no toca GCP, ni PostgreSQL, ni
   Redis): registra 3 habitaciones (simple/doble/suite), acuña 15 noches, repite el barrido, intenta el
   duplicado y comprueba el agotamiento. Evidencia:
   `RepoTecnico/evidencias/f8-mint-window-sweep.json`.

### Verificación ejecutada

| Verificación | Resultado |
|---|---|
| `pnpm typecheck` | **6/6** ✅ |
| `pnpm lint` | **6/6, 0 errores** (51 warnings `no-console` en scripts CLI, la excepción documentada) |
| `pnpm test` | **7/7 tareas** ✅ (incluye las **6** pruebas multi-habitación del resumen y las **9** del planificador) |
| `pnpm --filter @hotel/web build` | ✅ verde, con la ruta `window-overview` refactorizada |
| `forge test` | **14 suites / 139 pruebas**, 0 fallos |
| **Banco de pruebas F8** (`bash scripts/dev/f8-mint-window-sweep.sh`) | ✅ 3 habitaciones registradas; **15 noches** acuñadas con recibo en `success`; **segundo barrido = 0 pendientes y 0 transacciones** (idempotencia D-16); **el duplicado revierte on-chain**; agotamiento con **5 noches libres** (< 7) y **rearme** al ampliar a 12 |

### Hallazgos reales al ejecutar (ninguno detectable con `typecheck` ni con las pruebas que había)

1. **El barrido local fallaba con `AccessControlUnauthorizedAccount`.** El constructor de `HotelNights`
   solo concede `DEFAULT_ADMIN_ROLE` a quien despliega: el bootstrap completo de roles vive en
   `Deploy.s.sol`, no en el constructor. Un `forge create` directo (el camino del ensayo local) deja al
   operador **sin `MINTER_ROLE`**, así que el acuñado revierte. El banco de pruebas **concede el rol si
   falta** (y no envía nada si ya lo tiene, como en el Anvil global). Queda documentado que el registro
   de habitaciones y el acuñado tienen **prerrequisitos de rol distintos**.
2. **`pnpm lint` estaba rojo en `packages/shared` por una causa previa** (F1): un `!=` en
   `rooms.repository.ts` violaba `eqeqeq`. Corregido con la comparación explícita
   `!== null && !== undefined` (misma semántica que `!= null`, sin la ambigüedad). Sin esto, el gate de
   lint del pipeline habría seguido bloqueando.

### Documentación actualizada en el mismo cierre

`F8-ventana-acunado.md` (estado completo, decisiones, plan 1–10 y verificación),
`F8-runbook.md` (§2/§3 al día y §10 con el registro del cierre), `F8-preflight.md` (**marcado como
histórico**: el corte ya se ejecutó y su baseline es la de partida), `plan_definitivo.md` (F8 sin
pendientes de código), `despliegue_gcp.md` §18, `Manuales/03-operacion/02-e2e-y-verificacion.md`
(§2 orden y **§7 nuevo** con el banco de F8) y `Manuales/03-operacion/README.md` (fila de diagnóstico
del correo de agotamiento).

### Lo que queda de F8: **operativo, no de código** (depende del cliente o del entorno)

| # | Pendiente | Por qué no se cierra aquí |
|---|---|---|
| 1 | **Publicar las 50 fichas** (hoy `DRAFT`) | Necesitan descripción ES definitiva e **imagen del hotel** (decisión y material del cliente); al publicar se anclan y se dispara el primer acuñado (D-4) |
| 2 | **SMTP real** (cerrar `emailDegraded`) | Faltan credenciales del proveedor; sin ellas el correo queda `PENDING`/reintentado, no se pierde |
| 3 | **Redesplegar `worker` (y `web`) con la imagen de este cierre** | El planificador de agotamiento y el cálculo unificado **no están** en la revisión desplegada (`worker:f8`); `gcloud` no es utilizable en este entorno (snap sin permisos), así que la publicación de imágenes queda para la ventana del responsable |

**Deuda que este cierre no toca** (sigue en su sitio): cobertura de `apps/web`, perfil de 200
concurrentes, Polygon real (32 confirmaciones), los dos indexadores de la misma noche, `pnpm audit` sin
triar y digest de Slither sin fijar, y el modo lote de `/admin/mint` (hoy firma 1 noche por pasada:
el camino operativo es «Acuñar ventana» / «Barrido global»).

---

## 30. Imagen visual — propuesta de evolución (2026-09-27) · `@visualUiUx`

**Origen**: análisis de [`propuestaVisual-Hotel.md`](./propuestaVisual-Hotel.md) (propuesta externa
«Marina Sol»: lujo costero, océano + arena + terracota + champagne, tipografías editoriales y app
móvil) a petición del responsable.

**Entregables de esta ronda** (Fase 1 del skill `visual-ui-ux`, sin tocar código de producto):

| Artefacto | Contenido |
|---|---|
| [`propuesta_imagen_visual.md`](./propuesta_imagen_visual.md) | Propuesta completa: análisis del documento, diagnóstico del sistema real, paleta por **roles semánticos** con HEX/HSL y ratios, tipografía (con el hueco cirílico), espaciado/radios/elevación/rejilla, inventario de componentes por Atomic Design, aplicación a las **5 suites**, hoja de ruta A–E con ficheros exactos y gates |
| `scripts/design/contrast-audit.mjs` | **Instrumento** reproducible (sin dependencias, misma matemática WCAG 2.1 que `lib/a11y/contrast.ts`): 3 conjuntos de paleta y **32 pares medidos** con veredicto y corrección |

**Veredicto**: la dirección del documento es buena, pero adoptarlo **como sustitución** rompería
WCAG AA en **5 pares** y descartaría un sistema ya protegido por guardianes; además ignora 4 de las 5
suites (personal) y no cierra el defecto real detectable: **el ruso no tiene glifos** en las dos
tipografías de marca (Fraunces sin cirílico; Hanken Grotesk solo el bloque extendido, sin el rango ruso
básico) con paridad ES/EN/RU declarada. Recomendación: **evolución aditiva** (mantener los 12 tokens;
añadir `ocean`, `ocean-soft`, `champagne`, `line-strong`, `ink-disabled`, estados y velo).

**Hallazgo nuevo (H-7)**: los controles de formulario usan hoy `border-line` (#E7DCC6) como única
frontera → **~1,10:1**, por debajo del 3:1 que exige **WCAG 2.1 · 1.4.11** para el límite de
componentes activos. Axe no lo detecta y el escáner propio mide pares texto/fondo. Corrección
propuesta: token `line-strong` #8F7F5F (3,27–3,91:1) en `input`/`select`/`textarea` + **prueba nueva**
de contraste de borde en CI.

**Pendiente**: las **3 decisiones de calibración** (§6 de la propuesta) bloquean la generación de
tokens, del `Manual_Identidad_Visual.md` y de los componentes nuevos. Sin cambios en contrato, rutas ni
modelo de datos (los tres artefactos de datos siguen sincronizados sin cambios).

### Decisiones aprobadas e implementación (misma fecha)

El responsable aprobó las tres recomendaciones: **evolución aditiva** de la paleta, ámbito de **las 5
suites** y **cascada cirílica**. En la misma ronda se implementaron y verificaron las dos primeras
fases de la hoja de ruta:

| Fase | Qué entró | Verificación |
|---|---|---|
| **A · Tokens aditivos** | `preset.cjs`: `ocean`, `ocean-soft`, `champagne`, `line-strong`, `success(-bg)`, `warning(-bg)`, `error(-bg)`, `info(-bg)`; niveles tipográficos `display`, `h4`, `body-lg`, `body-sm`, `caption`, `overline`, `code`; radio `brand-xs`. Espejo `palette.ts` con **24 pares declarados** nuevos, `globals.css` (`:root`) y documentación (`docs/DISENO-UX.md` §2.1–2.3, `docs/ACCESIBILIDAD-WCAG.md` §0) | `a11y.test.ts` **17/17** (igualdad preset↔palette incluida) |
| **B · Cascada cirílica** | `layout.tsx`: `Playfair Display` + `Inter` con `subsets:["cyrillic"]` y `preload:false`; pilas del preset y de `globals.css` con el respaldo después de la fuente de marca | Guardián nuevo `cyrillic-fonts.test.ts` **4/4** |
| **A.2 · Frontera de controles (H-7)** | `line-strong #8F7F5F` en los **89 controles** con frontera y las **11** constantes `FIELD` (**28 ficheros**); los 184 filetes decorativos conservan `line`. Guardián nuevo `control-boundary.test.ts`: mide 3:1 en los tres lienzos, deriva del contraste qué tokens pueden ser frontera, exige `line-strong` por defecto y comprueba los bordes de estado | `@hotel/web` **478 pruebas**; guardián **5/5** y **falsificado** a mano (un `border-line` en un control → rojo con fichero y clase) |
| **C.1 · Componentes de la suite pública** | `Hero` (foto a sangre de la portada `HERO` con velo `bg-ocean/65`, 4,93:1 con texto blanco; cae a `bg-ocean` sin foto), `Stars` (imagen con nombre accesible; lógica pura en `lib/stars.ts`), `SuiteCard` horizontal (una habitación **publicada por tipo**, con su foto, capacidad, camas y m², sin inventar precio), `ExperienceCard` (alt como pie visible) y `TestimonialCard`; home integrada con **datos reales** y `getHomeContent` ampliado con `hero` y `suites` (degradación elegante por fuente) | `@hotel/web` **487 pruebas** (nuevas: `stars` 4, paridad i18n 4) y a11y **18/18**; build de producción OK |

| **C.2 · Barra de reserva y resumen flotante** | `BookingBar` (entrada, salida y huéspedes → `/reservar?from=…&to=…&guests=…`), montada **flotando** sobre el hero en `/` y **en línea** en `/catalogo`; `StickySummary` en `/reservar` (habitación, fechas, noches, precio por noche y total, `tablet:sticky`). La página `/reservar` lee la búsqueda en el **servidor** (`parseBookingQuery`) y el flujo preselecciona la primera habitación **con capacidad suficiente**; `/api/public/rooms` publica `capacity`, `sizeM2` y `perNightCents` **con la misma tasa que el cobro** (best-effort: sin tasa, `null` y se dice que el importe se confirma al retener) | `@hotel/web` **499 pruebas** (nuevas: **12** de `lib/booking`, con **convergencia comprobada** contra `nightsBetween` del servidor); smoke test en producción: `/`, `/catalogo` y `/reservar` (incluso con parámetros basura) responden **200** con la barra montada |

| **C.3 · DataTable de personal** | `components/ui/DataTable.tsx`: tabla **densa** con `<caption>` solo para lectores, `scope="col"`/`scope="row"`, región desplazable con nombre y `tabIndex={0}` (WCAG 2.1.1), densidad `compact`/`comfortable`, cabecera fija y columnas ocultables en móvil **sin sacarlas del DOM**. Migrada `/admin/mantenimiento/incidencias`; añadido el `<caption>` que faltaba en **6 tablas** (`maintenance` ×2, `activities` ×2, `rooms`, `reception`) con claves ES/EN/RU | `@hotel/web` **504 pruebas**; guardián nuevo `table-semantics.test.ts` **5/5**, **derivado de todas las tablas del producto** y **falsificado** (quitar un caption → rojo con fichero y etiqueta); smoke test: `/admin/mantenimiento/incidencias` y las rutas de personal responden **200** sin errores |

| **D · Piezas de marca y vista previa social** | `app/opengraph-image.tsx`: imagen social **generada en código** con los tokens (1200×630, marino + champagne + arena) en lugar de un PNG suelto; metadata `og:*`/`twitter:card` y `metadataBase` con `NEXT_PUBLIC_SITE_URL` (documentada en `.env.example`). Registro marino (`ocean`) en la **portada** y en los títulos de las pantallas de recepción/reventa; **maqueta del catálogo** al día (tokens, hero oscuro y barra de reserva) | `@hotel/web` **510 pruebas**; guardián nuevo `brand-pieces.test.ts` **6/6** (HEX **derivados del preset**, `role="img"`+`<title>` por ilustración, OG en código, variables de la maqueta); verificado en producción: `/opengraph-image` → **200 `image/png`, PNG válido 1200×630, 105 KB**, y el `<head>` declara `og:image` |

| **F · Aplicación al producto** | El registro marino entra en el **sidebar de administración** (`bg-ocean`, enlaces `text-sand`, secciones `champagne`, entrada activa como pastilla `bg-shell text-ocean` / 14,5:1) y los **30 estilos de estado improvisados** de **18 ficheros** pasan a los tokens semánticos (banners de error → `error`/`error-bg`, confirmaciones → `success`/`success-bg`, avisos → `warning`/`warning-bg`, insignia «en directo» → `success`). Par nuevo declarado: `ocean` sobre `shell` | `@hotel/web` **510 pruebas** y los 4 guardianes de accesibilidad en verde; `typecheck` y `lint` 6/6; build OK |

| **Release `v9` en GCP** | Imágenes `web/worker/mcp/monitor:v9` construidas con Cloud Build y desplegadas **solo con `--image`** (sin tocar contrato, base de datos ni reset): web `00009-76r`, worker `00007-scm`, mcp `00004-bl7` y worker pool del monitor al día. Detalle y rollback en `despliegue_gcp.md` §19 | `/health/ready` **READY**; `/` 200 con hero y **barra de reserva**; **imagen social 1200×630 servida** con `og:image` de producción; worker `lag 0` y **planificador de agotamiento de F8 activo**; **arreglo de entorno**: al worker le faltaba `CHECKIN_SECRET_KEY` (su listener fallaba al consolidar `CheckedIn`) y se añadió desde Secret Manager |

| **Nombres de imagen de toda la plataforma** | Catálogo [`catalogo_imagenes.md`](./catalogo_imagenes.md): tres familias con patrón propio —habitación `<nº>-<Tipo>-<fecha>-<1..5>.jpg`, contenido `hotel-<seccion>-<fecha>-<n>.jpg` y manuales `doc-<pantalla>-<elemento>.svg`— con el **mapa de las 50 habitaciones** y el de las secciones de la home. Renombrados los 13 ficheros que no seguían patrón (9 ilustraciones a `doc-*`, el PNG de portada y las 3 fotos a la portada canónica de 101/116/201) y **actualizadas todas las referencias**: manuales, README, script del pipeline, `manuals.generated.ts`, copias públicas y el guardián de manuales | Guardián nuevo `images-naming.test.ts` **6/6** (valida cada fichero con el **validador real** del producto, cruza el tipo del nombre con el maestro, exige `doc-` en las ilustraciones y que ninguna referencia de los manuales esté rota) y **falsificado** (quitar el prefijo `doc-` pone 3 pruebas en rojo). El pipeline de manuales gana `--no-pdf` para entornos sin Chromium |

| **Release `v10` en GCP** | Release **solo de web** (los dos commits posteriores a `v9` no tocan `packages/` ni migraciones ni contrato): `web:v10` construida con Cloud Build y desplegada **solo con `--image`**, conservando **18 variables y 9 secretos**; `worker`, `mcp` y `monitor` **no se reconstruyen** y siguen en `v9`. Detalle y rollback en `despliegue_gcp.md` §20 | `/health/ready` **READY**; home **200**; las **9 páginas nuevas** de la suite pública → **200** con su título y contenido real; imagen social **1200×630** servida con `og:image` de producción; regresión de 14 rutas públicas **200** y APIs protegidas **401**; worker `lag 0` (bloque 478). **Desbloqueo de proceso**: el `gcloud` del snap no es utilizable, pero el SDK de `/home/dsh/google-cloud-sdk/bin/gcloud` sí (con `PATH` por delante) |

| **Redistribución AdminLTE del back-office** | Shell de administración rehecho al estilo AdminLTE **con los tokens de marca** (**D-78**: sidebar **izquierda** fija y plegable a mini, navbar, migas de pan derivadas de la ruta, `content-wrapper` y pie) y arreglo del **acordeón**, que se veía siempre abierto porque el atributo `hidden` convivía con la clase `flex` y el preflight de Tailwind v3 no declara `[hidden]{display:none}`; los KPI del dashboard pasan al patrón `small-box` (**D-79**). Detalle en §32 | Guardián nuevo `admin-shell.test.ts` **13/13** y **falsificado** (reintroducir `hidden={!open}` lo pone rojo), derivaciones puras de la ruta, `@hotel/web` **537 pruebas**, `typecheck`/`lint` OK y build de producción OK |

| **Release `v11` en GCP** | Release **solo de web** (los commits `f53dd9b` de manuales y `5f76ba3` de AdminLTE no tocan `packages/`, migraciones ni contrato): `web:v11` construida con Cloud Build y desplegada **solo con `--image`**, conservando **18 variables y 9 secretos**; `worker`, `mcp` y `monitor` siguen en `v9`. Push en los tres remotos. Detalle y rollback en `despliegue_gcp.md` §21 | `/health/ready` **READY**; home **200**; `/ayuda` **200** con las **32** tarjetas de caso de uso, los 9 bloques y el mapa de iniciación; `/ayuda/cu-16-roles` **200** con infografía; PDF **200 `application/pdf`**; 9 páginas públicas y 11 rutas de regresión **200**; APIs protegidas **401**; worker `lag 0` (bloque 478). Corrección de la traza de §20: la API de actividades es `/api/admin/actividades/activities` |

| **Reparto de las barras del back-office** | Navbar reducido a un solo destino —**Ayuda**— (**D-81**) y **bloque de sesión** (usuario + roles + `WalletMenu`) trasladado al final del panel Administración; **Sistemas integrado** en ese panel como subgrupo reservado al owner (**D-80**), con migas de tres niveles y `WalletMenu` con variante `sidebar` anclada al viewport. Detalle en §33 | `admin-shell.test.ts` pasa de **13 a 23 pruebas**, con **tres sondas de falsificación** en rojo (billetera devuelta a la navbar, subgrupo sin gating de owner, desplegable sin re-anclaje al scroll); suite completa **70 ficheros · 547 pruebas**; RF-41/RF-40 enmendados en `incremento_v3/requerimientos_incremento.md` §7; typecheck, lint y build OK |

| **Release `v12` en GCP** | Release **solo de web** del reparto de barras (**D-80/D-81**, commit `095b8cd`): `web:v12` construida con Cloud Build y desplegada **solo con `--image`**, conservando **18 variables y 9 secretos**; `worker`, `mcp` y `monitor` siguen en `v9`. Detalle y rollback en `despliegue_gcp.md` §22 | `/health/ready` **READY**; home **200** (134 KB); `/ayuda` **200**; **16 rutas públicas** de regresión **200**; las cuatro suites sin sesión sirven el gate con **cero** marcadores de panel; APIs protegidas **401**; imagen social **1200×630**; worker `lag 0` (bloque 478). **Hallazgo**: el rediseño del back-office **no se veía sin sesión** —`AdminSignInScreen` tenía plantilla propia y no pasaba por `AdminLayout`—; **cerrado en §34 (D-82)** |

| **Acceso unificado bajo la plantilla (D-82)** | Cierra el hallazgo de la release `v12`: `AdminSignInScreen` pintaba su propia plantilla y por eso el HTML servido **sin sesión** no contenía ninguna marca del shell AdminLTE. `AdminLayout` gana el prop `gate` y el acceso se compone a través del shell; retirado el `WalletBar` del acceso. Detalle en §34 | `admin-shell.test.ts` pasa de **23 a 27 pruebas** y `admin-auth-guardian.test.ts` de **4 a 5**, con **tres sondas de falsificación** en rojo; suite completa **70 ficheros · 552 pruebas**; typecheck, lint y build OK |

| **Release `v13` en GCP** | Release **solo de web** del acceso unificado (**D-82**, commit `7a263b6`): `web:v13` construida con Cloud Build y desplegada **solo con `--image`**, conservando **18 variables y 9 secretos**; `worker`, `mcp` y `monitor` siguen en `v9`. Detalle y rollback en `despliegue_gcp.md` §23 | **El HTML servido sin sesión contiene ya la plantilla del shell** (`admin-sidebar`, `admin-nav-toggle`, `admin-help-link`, pie «Panel de administración») con el `<h1>` canónico y **cero** marcadores de panel ⇒ hallazgo de §22 cerrado con evidencia de tráfico real; `/health/ready` **READY**; 18 rutas públicas **200**; APIs protegidas **401**; imagen social **1200×630**; worker `lag 0` (bloque 479). **Efecto colateral medido**: las suites de personal muestran ahora el acceso del back-office (título y marca), no el suyo |

| **F9 · integridad catálogo ↔ cadena** | El catálogo deja de depender solo del índice: dos capas (exclusión estructural por `sale_events` + lectura `soldOnce`) y aviso honesto cuando se ocultan noches. **Lección registrada**: el control por agregados (`minted − sold`) se descartó porque una noche revendida sigue siendo ofertable. Detalle en §36 | `@hotel/shared` **430 pruebas**, `@hotel/web` **583** (guardián 6 → **13**), `@hotel/worker` **132**; **tres sondas de falsificación** en rojo; typecheck, lint y build OK |

| **Releases `v15`/`v16` en GCP (F9)** | Desplegada la integridad catálogo ↔ cadena. Dos hallazgos operativos: (1) el tráfico del servicio estaba **fijado por nombre**, así que `deploy --image` creaba y **retiraba** la revisión sin servirla; (2) la consulta nueva era **SQL inválido** (`DISTINCT` + `ORDER BY` de expresión) y la capa F9 quedaba inerte cayendo al respaldo RPC. Corregido con `GROUP BY`, guardián de forma y validación contra PostgreSQL real; procedimiento de despliegue con canario etiquetado. Detalle en `despliegue_gcp.md` §26 y §37 | `@hotel/shared` **431** · `@hotel/web` **583** · `@hotel/worker` **132**; guardián SQL **falsificado**; canario `v16` con logs limpios **antes** de mover tráfico; producción `00019-jef` al 100 % con `/health/ready` READY, `/catalogo` 200, aviso 0, 7 rutas de regresión 200, APIs 401 y **18 variables/9 secretos** conservados |

| **Release `v17` en GCP** | Push de `9dd0d62`+`0829481` a los tres remotos y despliegue de `web:v17` **desde el commit ya remoto**, por trazabilidad (`v15`/`v16` se construyeron de un árbol sin pushear). **Sin delta funcional**: verificado que el catálogo produce un HTML idéntico byte a byte (154.716 B). Procedimiento con canario etiquetado + `update-traffic`. Detalle en `despliegue_gcp.md` §27 | Canario verde antes de mover tráfico y **logs sin el error de SQL ni respaldo RPC**; `/health/ready` READY; **18 rutas públicas 200**; gate sin panel en las cuatro suites; APIs **401**; imagen social 1200×630; **18 variables y 9 secretos** conservados; worker `lag 0` (bloque 479) |

**Hallazgos que destaparon los guardianes nuevos (C.1–C.3)**: (a) `text-caption`/`text-body-lg` de la
escala tipográfica nueva se leían como «color desconocido» — corregido y con **prueba que deriva la
lista del preset real**; (b) la paridad i18n **no estaba verificada por ninguna prueba**: el guardián
nuevo `i18n-parity.test.ts` (1.228 claves idénticas en ES/EN/RU, sin valores en blanco y con los mismos
marcadores) destapó **dos defectos previos**: `admin.expiredManual` no comunicaba «hasta {max}» en EN/RU
y `assistant.handoff.insufficientBalance` perdía `{have}` y `{need}` en EN/RU. Ambos corregidos; (c) el
resumen previo al cobro podía separarse del importe real, así que la tasa se unificó en la API y una
prueba **cruza** el cálculo de noches del cliente con el del servidor; (d) **6 de 13 tablas** no tenían
nombre accesible: ahora todo `<table>` del producto debe declarar `<caption>`/`aria-label` y
`scope="col"`, con guardián derivado y exención explícita para tablas de presentación.

**Pendiente de la propuesta**: **ninguno — ciclo cerrado**. La Fase **E** (`Manual_Identidad_Visual.md`
v1.0.0, con brief, guía de estilo, tokens, inventario de componentes, do's & don'ts, pares aprobados y
**prohibidos con su ratio** y changelog) se escribió **después** de A–D precisamente para no
desincronizar tokens y manual: sus tablas se derivan del código y quedan cubiertas por los mismos
guardianes. Lo único que sigue **propuesto y no aprobado** es el **modo noche** del personal (§3.6 de
la propuesta), que duplicaría la matriz de pares a verificar. Queda **observado y no exigido** H-8: 27
botones/enlaces «fantasma» con `border-line` (el criterio 1.4.11 aplica a la información visual
necesaria para identificar el componente y un botón con etiqueta visible se identifica por su texto; el
foco ya cumple). Sigue sin tocarse contrato, rutas ni modelo de datos.

---

## 31. Suite pública completa y cierre de las demás suites (2026-09-28)

**Petición del responsable**: (1) llenar la suite pública con información coherente para atraer
visitas, incluyendo la Ayuda, siendo **la única sin sesión ni cartera**; (1.1) convertir cada sección
de la home en su propia página y dejar el inicio como resumen; (1.2) nutrir la barra superior de esas
páginas; (1.3) añadir **Empresa** y **Instalaciones** (distribución del hotel y características de cada
tipo de habitación); (2) restringir las demás suites a usuarios inscritos.

### Decisiones aprobadas (entrevista de 3)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Alcance de la cartera | **Sesión validada en servidor para todas las suites no públicas**; la cartera se exige donde ya es imprescindible (comprar, reservar, revender, administrar). Housekeeping y mantenimiento siguen con contraseña + TOTP **sin cartera** (D-56) |
| 2 | Origen del contenido | **Híbrido**: habitaciones, planes, actividades, reseñas y galería desde las tablas reales; «Empresa» e «Instalaciones» como texto institucional en i18n ES/EN/RU. **Sin cambios en el modelo de datos** |
| 3 | Mapa de páginas | **Una página por sección** + Empresa e Instalaciones, con la home como resumen |

### Hecho

**Suite pública (9 páginas nuevas, todas con `PublicShell`, `<h1>` propio y contenido real):**

| Ruta | Contenido |
|---|---|
| `/empresa` | Quién es el hotel y cómo trabaja (reserva directa, noches en propiedad, privacidad, transparencia) + **cifras del inventario real**: 50 habitaciones, 2 plantas, 3 tipos, 3 idiomas |
| `/instalaciones` | **Distribución** del hotel por plantas (tabla con `DataTable`: planta, numeración, tipos, cuántas), zonas comunes, accesibilidad y enlaces a habitaciones y contacto |
| `/servicios` | Los seis servicios con su descripción (mismas claves que la home, sin duplicar textos) y lo que incluye cualquier estancia |
| `/habitaciones` | Los **tres tipos** con rango real de capacidad y superficie (calculado del inventario), ficha de muestra con foto (`SuiteCard`) y los tres pasos de la compra |
| `/experiencias` | Galería completa de la sección `EXPERIENCE` (la home enseña seis) |
| `/actividades` | Catálogo activo con precio |
| `/planes` | Planes informativos activos (D-69) |
| `/resenas` | **Todas** las reseñas aprobadas con la nota media (la home enseña tres) |
| `/contacto` | Dirección, teléfono, correo, mapa OpenStreetMap, cómo llegar y el aviso de que el registro de viajeros sigue en el mostrador (D-13) |

**Home como resumen**: cada sección termina en un enlace «Ver más» a su página (7 enlaces
verificados), los listados se recortan (planes 2, actividades 3, galería 6, reseñas 3) y se añade una
banda de descubrimiento con Empresa, Instalaciones y Ayuda.

**Navegación** (`SiteHeader`): primarios (Inicio, Habitaciones, Catálogo, Reservar) + dos
desplegables `<details>` accesibles **sin JavaScript** («El hotel»: Empresa, Instalaciones, Servicios,
Planes, Reseñas, Contacto; «Descubre»: Experiencias, Actividades, Reventa, Mis noches, Histórico,
Asistente, Ayuda). El panel móvil los agrupa con encabezados y el **pie** enlaza las páginas de
sección.

**Cierre de las suites no públicas** (requisito 2): `/recepcion` (rol `RECEPTION_ROLE`),
`/housekeeping` (`HOUSEKEEPING`) y `/mantenimiento` (`MAINTENANCE`) pasan a tener **layout con puerta
en servidor** (`currentAdminSession(rol)`, que ahora acepta el rol exigido; el owner entra a todas) y
sirven la pantalla de acceso canónica en lugar del panel. La suite pública **no** importa el guard de
sesión.

### Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` · `pnpm lint` | **6/6** · **6/6** |
| `pnpm --filter @hotel/web test` | **69 ficheros · 524 pruebas** (nuevas: guardián de suite pública 8) |
| `pnpm --filter @hotel/web build` | **OK · 54 páginas** estáticas (9 más que antes) |
| Smoke test en producción local | **14 rutas públicas → 200** con un solo `<h1>` y la navegación; **`/recepcion`, `/housekeeping` y `/mantenimiento` → 200 con la pantalla de acceso y SIN panel** (los marcadores del panel no aparecen en el HTML) |
| i18n | 1.312 claves idénticas en ES/EN/RU (paridad vigilada) |

### Hallazgos y mejoras del proceso

1. **El escáner de contraste cruzaba variantes** (lo destapó la primera versión de los botones
   «contorno»): medía el texto de reposo (`text-sea`) contra el fondo del `hover` (`hover:bg-sea-deep`
   = 1,41:1) aunque en ese estado el texto cambia a arena. Ahora el emparejamiento es **por variante**
   con herencia explícita (una variante sin color propio hereda el de reposo), que es la regla real de
   CSS. Se **falsificó** con una sonda `hover:bg-sea` sin texto propio: el guardián la caza con
   «hover: text-sea sobre hover:bg-sea = 1:1».
2. **La delegación del `<h1>` no puede ser hueca**: el guardián de accesibilidad acepta `<PageHeader`
   como cabecera delegada de las páginas de sección y, en el mismo test, exige que ese componente
   contenga el `<h1>`.
3. **`lib/public-content.ts` entra en la lista blanca de la frontera cliente/servidor** (declara
   `server-only`): lee el maestro de habitaciones y cae a `buildRoomSeed` si la base no responde, así
   que la página sigue sirviendo información **real** sin BD.


---

## 32. Redistribución AdminLTE del back-office y arreglo del acordeón (2026-09-29)

**Petición del responsable**: (1) dar a la suite de administración una **distribución al estilo
AdminLTE**; (2) **corregir la barra de navegación**, porque «el efecto acordeón no se carga
adecuadamente».

### Diagnóstico (causa raíz del acordeón)

El panel de cada sección se pintaba con el **atributo** `hidden` junto a la **clase** `flex`
(`AdminLayout.tsx`):

```tsx
<ul id={`nav-section-panel-${section.key}`} hidden={!open} className="mt-1 flex flex-col gap-1">
```

La causa **exacta**, comprobada sobre el CSS compilado de la release (`.next/static/css`), es de
especificidad y orden, no de ausencia de regla: el preflight de Tailwind v3.4 **sí** declara
`[hidden]:where(:not([hidden=until-found])){display:none}`, pero lo hace en la **capa base** y con
especificidad **(0,1,0)** —`:where()` no suma—, mientras que `.flex{display:flex}` es una utilidad con
la **misma especificidad** y **posterior** en la hoja (posición 13.577 frente a 11.574 del CSS
construido). El `flex` gana, así que **las siete secciones se veían siempre abiertas** y el acordeón no
existía, aunque `aria-expanded` dijera lo contrario. El defecto pasó desapercibido porque el
back-office **no tenía ningún guardián de plantilla** (solo pruebas de funciones puras) y porque
`aria-expanded` era coherente con el estado de React mientras el DOM mostraba otra cosa.

**Segundo defecto, encontrado al escribir el guardián**: `breadcrumbForPathname` resolvía con el
**primer** destino que casaba, y `/admin/sistemas` es prefijo de `/admin/sistemas/ajustes`, así que la
miga y la sección activas eran las del grupo y no las de la página. Se corrige con **coincidencia más
específica** (el `href` más largo) en `bestMatch`.

### Decisiones de la entrevista (4)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Alcance del rediseño | **Shell completo + dashboard**: la plantilla se rehace; de las páginas solo `/admin/dashboard` pasa al patrón `small-box`. Las otras 22 páginas **no se tocan** (el titular sigue siendo `AdminPanel`) |
| 2 | Comportamiento del sidebar | **Plegable a mini-sidebar** (solo iconos) en escritorio; en móvil, **cajón** con velo. Iconos **SVG en línea**, sin dependencias nuevas |
| 3 | Acordeón | **Una sección a la vez** (D-29) **+ auto-apertura de la sección activa**, resincronizada con la ruta (enlace profundo, atrás/adelante, recarga) |
| 4 | Identidad cromática | **Tokens de marca**: estructura AdminLTE con el registro marino/champagne/arena ya aprobado (no se importa la paleta por defecto de AdminLTE) |

**D-78 (decisión del cliente, aplicada).** El shell de administración adopta la **distribución
AdminLTE** —sidebar **izquierda** fija y plegable, navbar superior, cabecera de contenido con **migas
de pan derivadas de la ruta**, `content-wrapper` y pie— **manteniendo los tokens de marca**. Sustituye
**solo la posición y la distribución** de D-29: el **acordeón de una sección abierta sigue vigente**.

**D-79 (decisión del cliente, aplicada).** El rediseño cubre **la plantilla y el dashboard**
(`small-box`); el interior de las demás páginas de administración queda fuera de este incremento.

### Hecho

- **`adminIcons.tsx`** (nuevo): ocho iconos de sección + hamburguesa, cheurón y plegado, dibujados en
  línea con `currentColor`, `aria-hidden` y `focusable="false"`. El `Record<AdminIconKey, …>` obliga
  en `tsc` a que **toda sección tenga icono**.
- **`adminNav.ts`**: cada sección declara su `icon`; se añaden las derivaciones puras
  `isActiveHref` (exige el separador: `/admin/mint` no casa con `/admin/mintaje`), `sectionForPathname`,
  `navEntryForPathname` y `breadcrumbForPathname` (Inicio → sección → entrada).
- **`AdminLayout.tsx`**: reescrito con la distribución AdminLTE. **Mini-sidebar** en escritorio (el
  nombre accesible se conserva con `sr-only`, nunca desaparece del DOM); **cajón** en móvil que se
  cierra con velo, con **`Escape`** y al navegar, con **foco gestionado** y bloqueo de scroll del
  fondo que se libera si la ventana pasa a escritorio. El acordeón **plega por clase**, resincroniza la
  sección activa con la ruta y, con el sidebar plegado, abrir una sección lo despliega.
- **Dashboard**: los siete KPI pasan al patrón `small-box` (dato grande, icono decorativo, banda de
  fórmula al pie). Se mantiene la decisión **UX#34**: sin mini-barras para magnitudes heterogéneas.
- **i18n**: 8 claves nuevas en `admin.nav` (ES/EN/RU) con paridad verificada por el guardián.
- **Guardián nuevo `admin-shell.test.ts`** (13 pruebas): derivaciones puras, iconos, contrato del shell
  (prohibición del atributo `hidden`, cableado `aria-expanded`/`aria-controls`, resincronización con la
  ruta, cajón con velo y `Escape`, piezas AdminLTE) y presencia de las claves i18n.

### Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` | **70 ficheros · 537 pruebas** en verde (13 nuevas del guardián del shell) |
| `pnpm --filter @hotel/web typecheck` · `lint` | **OK** · **0 errores** (2 avisos previos, ajenos al cambio) |
| **Falsificación del guardián** | Reintroducido `hidden={!open}` + `flex` → la prueba **se pone roja** señalando la causa; restaurado, verde |
| Guardianes de identidad y accesibilidad | `a11y` (18), `control-boundary` (5), `i18n-parity` (4), `boundaries` (1), `brand-pieces` (6) e `images-naming` (6) en verde |
| `pnpm --filter @hotel/web build` | **OK** · **52** rutas de página y **84** de API compiladas sin errores (medido sobre `.next/app-path-routes-manifest.json`) |

---

## 33. Reparto de las barras del back-office: Ayuda arriba, sesión y Sistemas en Administración (2026-09-29)

**Petición del responsable**: modificar las barras de navegación de la suite de administración para
que (1) **la barra superior solo albergue el acceso a la sección Ayuda**; (2) el **panel
Administración incluya el menú de usuario y la conexión/desconexión de la billetera**; (3) el mismo
panel **integre las funciones especiales de Sistemas**.

### Decisiones de la entrevista (3)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Contenido exacto de la barra superior | **Ayuda + botón de menú en móvil**. Se retiran marca (escritorio), chips de roles y billetera. La hamburguesa se conserva porque sin ella el cajón de navegación sería inalcanzable en pantallas pequeñas |
| 2 | Forma del bloque usuario + billetera | **Bloque de sesión al final del panel Administración**: cabecera con icono, usuario + rol y el desplegable `WalletMenu` reutilizado (RF-40), más los chips de roles de la sesión. No se duplica la lógica del menú |
| 3 | Integración de Sistemas | **Subgrupo anidado** dentro de Administración, visible solo para el owner, con sus seis entradas; **desaparece el bloque aparte** que había bajo el acordeón |

**D-80 (decisión del cliente, aplicada).** Las funciones especiales de **Sistemas** (RF-41) se integran
en el **panel Administración** como subgrupo reservado al owner. Cambia solo la **agrupación visual**:
el gating, las rutas y las APIs siguen exigiendo `DEFAULT_ADMIN_ROLE` en servidor (RF-41.1).

**D-81 (decisión del cliente, aplicada).** La **barra superior** del back-office queda para un único
destino de navegación —**Ayuda**— y el **bloque de sesión** (usuario, roles y billetera) se traslada al
panel Administración. El contenido del menú de cuenta no varía (CU-40).

### Hecho

- **`adminNav.ts`**: nuevo tipo `AdminNavGroup` y campo opcional `ownerGroup` en `AdminNavSection`;
  `ADMIN_SYSTEMS_NAV` se declara **antes** de las secciones y se consume como `ownerGroup` de
  Administración. Derivaciones puras adaptadas: `sectionItems`, `ADMIN_NAV` (ahora incluye el
  subgrupo), `sectionForPathname` (`/admin/sistemas/*` abre **Administración**), `navEntryForPathname`
  (devuelve `group`) y `breadcrumbForPathname` (**Inicio → sección → subgrupo → entrada**).
- **`AdminLayout.tsx`**: `Topbar` reducida a hamburguesa + marca móvil + enlace a Ayuda
  (`data-testid="admin-help-link"`); fuera `RoleChips` y `WalletMenu`. En el panel de cada sección se
  renderizan `OwnerGroup` (condicionado a `session.isOwner`) y `SessionBlock` (solo en Administración).
  El bloque «Sistemas» independiente queda eliminado.
- **`WalletMenu.tsx`**: prop `variant?: "header" \| "sidebar"` (por defecto `"header"`, comportamiento
  idéntico al de siempre en la cabecera pública). La variante `sidebar` **ancla el desplegable al
  viewport** midiendo el disparador, porque el sidebar es un contenedor con `overflow-y-auto` y un
  descendiente `absolute` habría resultado **recortado** contra su borde inferior. Se recoloca solo si
  no cabe hacia abajo, y se re-mide en `resize` y en `scroll` con `capture: true` (el scroll del
  sidebar no burbuja).
- **`adminIcons.tsx`**: `HelpIcon` (interrogante en círculo) y `UserIcon` (cabecera del bloque de
  sesión), decorativos y con `currentColor`.
- **i18n**: claves `admin.nav.ayuda` y `admin.nav.sessionTitle` en ES/EN/RU (paridad verificada).
- **Requisito enmendado**: `RepoTecnico/incremento_v3/requerimientos_incremento.md` §7 registra el
  cambio de presentación de RF-41/RF-40 sin alterar su alcance ni sus criterios Gherkin.

### Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web typecheck` · `lint` | **OK** · **0 errores** (los 2 avisos previos, ajenos) |
| `admin-shell.test.ts` | **23 pruebas** (de 13 a 23): derivaciones con subgrupo, migas de tres niveles, reparto de barras y anclaje del desplegable |
| **Falsificación** (3 sondas) | Devolver `WalletMenu` a la navbar → rojo · quitar el gating `session.isOwner` del subgrupo → rojo · suprimir el re-anclaje al `scroll` → rojo. Restaurado, verde |
| Guardianes de identidad y accesibilidad | `a11y` 18 · `control-boundary` 5 · `table-semantics` 5 · `cyrillic-fonts` 4 · `i18n-parity` 4 · `boundaries` 1 · `admin-roles` 6 · `suite-access` 6 → verde |
| Pruebas de wallet y menú | `wallet-menu-items` 7 · `switchChainError` 6 → verde (el menú público no cambia) |
| `pnpm --filter @hotel/web build` | **OK** (exit 0) · **52** rutas de página y **84** de API (`.next/app-path-routes-manifest.json`) |

### Lo que NO se pudo verificar aquí (y por qué)

Se intentó la **verificación visual real** del back-office (render con sesión, cajón móvil y
desplegable abierto). No fue posible en este entorno y **no se afirma nada al respecto**:

- La suite `/admin/*` exige sesión canónica, y `/api/auth/session` termina en una lectura de
  PostgreSQL (`countRemainingRecoveryCodes`). **No hay servidor Postgres en el host**: solo cliente
  (`~/tools/postgres` trae `psql`/`pg_dump`, no `postgres`/`initdb`), sin `docker` ni `podman`.
- Se montó un sustituto: Redis en memoria propio (RESP, verificado contra `ioredis`) y **PGlite**
  (Postgres 18.3 compilado a WASM) expuesto por el protocolo wire con `@electric-sql/pglite-socket`,
  sobre el esquema real del producto (**44 tablas** creadas). El resultado útil es que **descartó**
  un defecto nuestro: `SELECT COALESCE(NULL, TRUE)`, `NOW()`, `INSERT … RETURNING` y
  `ON CONFLICT DO UPDATE` funcionan todos sobre PGlite; quien falla es la **capa socket**, que corta
  la conexión contra el cliente `pg` del pool. Por eso `/health/ready` devolvió
  `postgres: DOWN · "Connection terminated unexpectedly"` y el render de `/admin/dashboard` nunca
  llegó a completarse.
- El navegador sí está disponible cargando librerías propias
  (`LD_LIBRARY_PATH=/home/dsh/tools/libs/…`), pero la **página nunca llegó a pintarse**, así que no
  hay captura de pantalla del shell con sesión.

**Pendiente para la ventana del responsable (con base de datos real):** revisar visualmente el
back-office autenticado —cajón móvil, plegado a mini, bloque de sesión y subgrupo Sistemas— y abrir
el desplegable de billetera dentro del sidebar para confirmar en pantalla lo que la sonda de layout
midió fuera del DOM.

### Verificación empírica que SÍ se obtuvo (fuera del DOM)

Sonda con Chromium real (`chromium_headless_shell` + `LD_LIBRARY_PATH` de `~/tools/libs`) sobre el
mismo mecanismo de colocación que usa `WalletMenu`:

| Medición | Resultado |
|---|---|
| Panel en `absolute` dentro de un contenedor con `overflow-y-auto` | sobresale **343 px** del borde inferior del sidebar → **recortado** |
| Panel anclado al viewport (variante `sidebar`) | `top 572 → bottom 894` con ventana de 900 px: **dentro del viewport** |
| Cambio de lado cuando abajo no cabe | **confirmado** (`ladoCambiado: true`) |

Esto es lo que justifica la variante `sidebar`: sin ella, el menú de usuario habría quedado cortado
contra el pie del sidebar en cuanto el disparador estuviera cerca del borde inferior.

---

## 34. Acceso del back-office unificado bajo la plantilla AdminLTE (2026-09-29) · **cierra el hallazgo de §33/`v12`**

**Petición del responsable**: «soluciona el hallazgo que destapó esta verificación».

**El defecto.** `/admin/dashboard` sin sesión respondía **200 con la pantalla de acceso correcta** y
**cero marcadores del panel** —la seguridad estaba bien—, pero ese HTML **no contenía ninguna marca
del shell nuevo** (`admin-sidebar`, `admin-nav-toggle`, `admin-help-link`,
`nav-section-administracion`). La causa: `app/admin/layout.tsx` renderiza `AdminSignInScreen`, y ese
componente pintaba **su propia plantilla** (`div min-h-screen` + `header` con marca y `WalletBar` +
`main`) en lugar de pasar por `AdminLayout`. Resultado: la distribución D-78/D-80/D-81 solo era
visible **con sesión iniciada**, y existían dos plantillas paralelas para el mismo back-office.

**D-82 (decisión del responsable, aplicada).** La **pantalla de acceso del back-office se renderiza
bajo la misma plantilla** que el panel. Se resuelve dando a `AdminLayout` un prop `gate?: boolean`:
con `gate` se pinta el `shell` con `SignInGate` como contenido. El acceso conserva su `<h1>` canónico
(D-04) y el `CredentialForm`, y **mantiene sidebar y migas ocultos** porque aún no hay sesión que los
justifique. Se retira el `WalletBar` del acceso: sin sesión no hay transacción que firmar, y la
billetera ya vive en el bloque de sesión del panel Administración (D-81).

**Alcance deliberado.** Solo se unifica el acceso del **back-office** (`/admin/**`, incluido Sistemas).
Las suites de personal (`/recepcion`, `/housekeeping`, `/mantenimiento`) siguen sirviendo la misma
tarjeta **fuera del shell**: van dentro de `PublicShell`, que ya aporta cabecera y `<main id="contenido">`,
y anidar `AdminLayout` dentro habría producido dos `<header>`, dos `<main>` y dos pies en el mismo
documento (regresión de landmarks que axe reporta). Además esas tres rutas muestran hoy la tarjeta
genérica de back-office aunque tienen sus propios títulos de namespace (`reception.gateTitle`,
`housekeeping.gateTitle`, `maintenance.gateTitle`): es una **mejora pendiente de producto**, no un
defecto de plantilla, y queda declarada abajo.

### Hecho

- `AdminLayout.tsx` — prop `gate`, rama `if (gate) return shell(<SignInGate … />)` antes del caso de
  carga, documentación del porqué y retirada del `WalletBar` del acceso.
- `AdminSignInScreen.tsx` — pasa de 70 líneas con plantilla propia a un **envoltorio mínimo** que
  delega en `<AdminLayout gate>`; conserva el `router.refresh()` que reevalúa el gate RSC al obtener
  sesión.
- Guardianes: `admin-shell.test.ts` **23 → 27 pruebas** (nuevo `describe` D-82) y
  `admin-auth-guardian.test.ts` **4 → 5** (la propiedad del gate, que es del acceso y no del panel).

### Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` | **70 ficheros · 552 pruebas** en verde (antes 547) |
| **Falsificación** (3 sondas) | Devolver la plantilla propia al acceso → **3 pruebas en rojo**; neutralizar la rama `gate` del shell → rojo; pintar el sidebar sin sesión → rojo. Restaurado, **27/27** |
| `typecheck` · `lint` | **OK** · **0 errores** en los ficheros tocados |
| `pnpm --filter @hotel/web build` | **OK** (exit 0) · **52** páginas y **84** rutas de API |
| Prohibiciones fijadas | En el acceso: ningún `<header>`/`<main>`/`<h1>` propio, sin `min-h-screen`, sin import de `WalletBar` ni de `CredentialForm`; en el shell, un único `<h1>` |

### Pendiente declarado (no ocultado)

1. ~~No se ha podido comprobar el HTML servido~~ — **comprobado al desplegar `v13`**
   (`despliegue_gcp.md` §23): `/admin/dashboard` sin sesión devuelve 200 con `admin-sidebar`,
   `admin-nav-toggle`, `admin-help-link` y el pie del shell, el `<h1>` canónico D-04 y **cero**
   marcadores de panel. En local seguía sin ser reproducible (no hay servidor PostgreSQL en el host),
   pero el gate responde igual en producción, que es donde importa.
2. **Suites de personal — efecto colateral MEDIDO en `v12`→`v13`**: al reutilizar
   `AdminSignInScreen`, las tres suites sirven ahora el acceso **del back-office** (marca y
   `admin.gateTitle` = «Back-office · acceso con contraseña y TOTP») en lugar del suyo
   (`reception.gateTitle` = «Acceso de recepción»). La puerta y el rol exigido siguen siendo los de
   cada suite, así que no hay fallo de seguridad: es confusión de ámbito. Queda **fijado en código**
   con una prueba en `public-suite.test.ts` («el acceso sin sesión de las suites de personal usa aún
   el acceso genérico»), que fallará el día que se dé una variante propia —que es lo deseado—. Decisión
   de producto pendiente: variante por suite (título + plantilla propios dentro de `PublicShell`) o
   aceptar el acceso unificado.

---

## 35. Diagnóstico en producción (GCP) del error «No pudimos verificar el precio on-chain» (2026-09-30)

**Petición del responsable**: antes de tocar el entorno local, verificar la versión desplegada en GCP.

**El mensaje**. Corresponde a `verifyFailed` del paso «Revisar tu reserva»
(`apps/web/src/components/buy/usePurchaseReview.ts:103`): salta cuando el cliente **no puede leer el
precio on-chain** (`priceOf`/`listingOf`) del contrato. Es el mecanismo de seguridad ADR-11: sin
lectura no se firma. La causa NO es el RPC ni la red: `/health/ready` responde `READY`
(postgres/redis/polygonRPC `UP`), el worker marca `lag 0`, y las lecturas `priceOf` contra el Anvil
de producción (`https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app`, chainId 31337, contrato
`0xc66a…7b6F`, v12) responden con normalidad desde esta máquina.

**Causa raíz medida (dos defectos reales, ambos de coherencia catálogo ↔ cadena):**

1. **Reseña fantasma en el catálogo primario → la verificación del cliente cae.** El flujo público
   construye la tx con `value = priceWei` del **catálogo**, pero el contrato exige
   `msg.value == _price[tokenId]` (compra **primaria**). Para una noche ya vendida que el catálogo aún
   ofrece como primaria, el `expectedPriceWei` enviado es el precio del **listado de reventa** (o un
   valor desfasado) y la lectura/comparación del cliente no cierra → `verifyFailed`. Medido on-chain:
   las **6 noches vendidas** siguen apareciendo disponibles porque el índice PostgreSQL no las marcó
   `SOLD` (ver punto 2), y `buy()` sobre ellas revierte con `NightNotAvailable` (selector observado
   `0x192c75e3`/`0x0dd2ebbe`). El guardián hizo su trabajo: bloqueó la firma de una compra que la
   cadena iba a rechazar — pero el origen es un catálogo sucio, no un fallo del cliente.
2. **El worker nunca procesa los eventos `Sale` → el índice `nfts` queda obsoleto.** Evidencia dura:
   - Cadena: 96 `Mint`, **7 `Sale`** (bloques 379–384 y 386), 1 `Listed`, 1 `RoyaltyPaid`; head 479.
   - `/aggregates` del worker SÍ cuenta `soldCount: 6` → el listener **sí ve los Sale** al apilar.
   - Pero el catálogo servido por BD (`queryCatalog status='AVAILABLE'`) los sigue ofreciendo: la
     ruta de consolidación `NFTSold` → `updateNFTStatus(...,'SOLD')` (`packages/shared/src/events/listener.ts:310`)
     **no está materializada en la imagen desplegada del worker** o falla al escribir. Coincide con el pendiente
     operativo nº 3 de §29: *«Redesplegar worker (y web) con la imagen de este cierre»* — el worker de
     producción sigue en `worker:f8` anterior a F8-cierre. Además `/health` del worker responde
     `"status":"down"` con `emailDegraded: true` (sin SMTP), lo que degrada el checkpoint de email
     pero **no** explica el estado obsoleto del índice.
   - Consecuencia directa para el huésped: ve en `/` y `/catalogo` noches **ya vendidas**, pulsa
     Reservar, y el paso «Revisar» se queda en rojo con este mensaje.

**Verificaciones complementarias (todo en verde, descartadas como causa):** contrato desplegado =
bytecode local exacto (sha256 del `deployedBytecode` idéntico); `paused() == false`; reloj del Anvil
en hora (+0 respecto a real, sin deriva); registro de habitaciones correcto (101–150, `roomTypeOf`
OK); `isRoomRegistered` OK; los 6 `ownerOf` de las noches vendidas apuntan a compradores reales;
reventa (`108-20261103`, listada a 0,15 ETH y revendida) cerrada correctamente (`listingOf` vacío,
`buyResale` revierte `NotListed`/`NightNotResellable` como debe).

**Acción correctiva propuesta (Fase 3 · ciclo pequeño, sin cambios de modelo de datos):**

1. **Redesplegar el `worker` con la revisión actual** (la de F8-cerrada/v12) para que la consolidación
   `NFTSold → SOLD` del índice vuelva a ejecutarse; tras el despliegue, forzar un barrido de
   reconciliación y comprobar que `queryCatalog(AVAILABLE)` deja de devolver las 6 noches vendidas.
2. **Endurecer el catálogo por BD** (defensa en profundidad): aunque el índice esté sano, la vista
   pública debería contrastar el `status` de BD con una lectura barata on-chain (`soldOnce`) en las
   noches que se van a servir, o el `POST` de reserva/revisión debería volver a comprobar
   `_soldOnce[tokenId]` antes de ofrecer firmar. Elimina la clase entera de «fantasmas» si el índice
   vuelve a ir tarde.
3. **Mejorar el mensaje del paso «Revisar»** (producto): hoy «comprueba tu conexión» es engañoso
   cuando la causa real es que la noche ya no está disponible; conviene distinguir «noche ya vendida
   — elige otra» de «fallo de red». Afecta a `usePurchaseReview` + i18n ES/EN/RU.

**Pendiente de decidir por el responsable**: ejecutar (1) requiere ventana de despliegue (gcloud no
es utilizable desde este entorno, igual que en §29); (2) y (3) son código y pueden hacerse aquí.

### Cierre de (2) y (3) — código entregado el mismo día (2026-09-30)

**(2) Catálogo endurecido** (`apps/web/src/lib/nights.ts`): nuevo `filterSoldOnChain` +
`classifySoldOnce` + lector inyectable `SoldOnceReader` (patrón DIP idéntico a
`onchain-ownership`). El camino de BD de `fetchCatalog` pasa ahora por la lectura on-chain
`soldOnce` de cada noche servida: las confirmadas como vendidas **se retiran**; las que no se
pudieron leer **se conservan** (fallar en abierto: un pico de red no debe ocultar inventario sano;
la garantía final sigue siendo la re-verificación del paso «Revisar»). Concurrencia acotada con el
mismo `RPC_CONCURRENCY` de siempre.

**(3) Mensaje honesto en el paso «Revisar»**: `usePurchaseReview` añade la lectura auxiliar
`soldOnce` (solo primaria; reventa queda en `"unknown"` porque su autoridad es `listingOf`) y expone
`soldOnceState ∈ {checking, sold, free, unknown}`. Con la cadena respondiendo «vendido», tanto el
catálogo (`BuyButton`) como el asistente (`PurchaseHandoff`) dicen **«Esta noche ya está vendida.
Elige otra noche»** con enlace acción al catálogo, en lugar del engañoso «comprueba tu conexión».
El reintento de lectura se conserva para el fallo de red puro. i18n ES/EN/RU con paridad
(claves `buy.nightAlreadySold`, `buy.pickAnotherNight`, `assistant.handoff.nightAlreadySold`).

| Verificación | Resultado |
|---|---|
| Pruebas nuevas | `nights-sold-guardian.test.ts` **6** + `purchase-review-messages.test.ts` **17** = **23** ✅ |
| **Falsificación** | quitar el filtro del catálogo → **6 rojas**; neutralizar la rama nueva del botón → **1 roja**; restaurado → 23/23 ✅ |
| `pnpm --filter @hotel/web typecheck` | ✅ |
| `pnpm --filter @hotel/web lint` | ✅ 0 errores (los 2 avisos previos, ajenos) |
| `pnpm --filter @hotel/web test` | **72 ficheros · 576 pruebas** ✅ |
| `pnpm --filter @hotel/shared test` | **45 ficheros · 418 pruebas** ✅ |
| `pnpm --filter @hotel/web build` | ✅ (advertencias previas, sin errores nuevos) |

**(1) Redesplegado el mismo día (release `v14`, 2026-09-30 — detalle en `despliegue_gcp.md` §24).**
El binario del snap fallaba (`snap-confine`) pero `/snap/google-cloud-cli/current/bin/gcloud` con
`CLOUDSDK_CONFIG` sí funciona. Cloud Build `worker:v14` + `web:v14` desde el commit local §35 (sin
push), subido después a los tres remotos de `anlucorporations` junto con el registro (§25:
release `v14` completa también para mcp y monitor); despliegue **solo con `--image`** y
verificación revisión a revisión: **18/18 variables conservadas** en ambos servicios. Evidencia de cierre: los logs del worker muestran los **7 eventos
`NFTSold` consolidados** que la `v9` nunca escribió, y `/catalogo` sirve **87 noches sin ninguna de
las 6 vendidas fantasma**. Regresión pública completa en 200. **§35 CERRADO en sus tres puntos.**

---

## 36. F9 · Integridad catálogo ↔ cadena: el índice no puede mandar solo (2026-09-30)

**Petición del responsable**: continuar la Fase 3. Elegido con entrevista (3 preguntas): **ciclo F9
· integridad catálogo ↔ cadena**, degradación **«ocultar las fantasmas»** y **código + desplegar**.

### El hallazgo que cambió el diseño (y por qué NO hay un contador global)

El primer intento medía el desfase restando agregados: `esperado = minted − sold − burned` contra
`available`. **La propia prueba lo tumbó**: una noche vendida y después listada en reventa sigue siendo
inventario ofertable, así que restar ventas primarias al total produce falsos positivos —el caso real
de producción (7 `Sale`, 1 de ellos revendido) caía justo ahí. Se descartó el enfoque y la regla
definitiva es **por `tokenId`**: dos fuentes dicen cosas distintas de *la misma noche* o nada.

Queda registrado como lección de diseño: `minted − sold` no es un techo de disponibilidad cuando
existe mercado secundario.

### Hecho

| Pieza | Cambio |
|---|---|
| `packages/shared/src/domain/index-integrity.ts` *(nuevo)* | Dominio puro: `classifyNightIntegrity` → `ok` / `ghost` / `deficit` / `indeterminate`; `shouldHideNight`; `summarizeNightIntegrity` (listas deduplicadas y ordenadas para logs deterministas). Exportado por el barril raíz **y** por `@hotel/shared/domain` (`browser.ts`), sin dependencias de Node (contrato isomorfo verificado por grep) |
| `NFTsRepository.listGhostPrimarySales()` *(nuevo)* | La decisión se ejerce en SQL: venta **primaria** + índice `AVAILABLE` + `NOT EXISTS` de reventa **activa**. Devuelve `{tokenId, roomNumber, checkInDate}` con los mismos tipos que `mapRowToNFT` |
| `apps/web/src/lib/nights.ts` | `fetchCatalog` pasa a devolver **`CatalogResult { nights, hiddenSoldCount }`** y aplica **dos capas** en el camino de BD: 1ª estructural (`excludeGhosts`, sin red) y 2ª on-chain (`filterSoldOnChain`, §35). El desfase se **registra** (`console.warn` con los tokens), no se silencia. El fallback RPC devuelve `hiddenSoldCount: 0`: allí no hay dos fuentes que contradecirse, avisar de sincronización sería mentira |
| `/catalogo` | Aviso honesto `role="status"` (`data-testid="catalog-sync-notice"`) con par `info`/`info-bg` ya declarado y medido, estilo de los avisos existentes (`rounded-brand-lg border … bg-…-bg`) |
| i18n | `catalog.syncingNotice` en ES/EN/RU, paridad y placeholder `{count}` idénticos en los tres idiomas |

### Verificación

| Comprobación | Resultado |
|---|---|
| `@hotel/shared` test | **46 ficheros · 430 pruebas** (nuevas: 8 del dominio + 2 del repositorio) |
| `@hotel/web` test | **72 ficheros · 583 pruebas** (guardián `nights-sold-guardian` de 6 → **13**: dos capas, orden capa 1 → capa 2, desfase registrado, 4 pruebas de `excludeGhosts`) |
| `@hotel/worker` test | **15 ficheros · 132 pruebas** |
| **Falsificación** (3 sondas) | quitar la proyección de la exclusión → rojo · silenciar el `console.warn` del desfase → rojo · eliminar la consulta de ventas → **2 rojas** (capa 1 y orden). Restaurado: 13/13 |
| typecheck · lint · build | OK · **0 errores** (los 2 avisos previos, ajenos) · **52** páginas y **84** API |

**Lo que este ciclo NO arregla (declarado).** No corrige la causa del desfase: si el worker deja de
consolidar `NFTSold`, el índice seguirá mintiendo y ahora el catálogo lo oculta y lo dice. La
reconciliación del índice sigue siendo operativa (redesplegar/barra de eventos), y la segunda capa
on-chain continúa siendo la autoridad final antes de firmar.

**Pendiente abierto detectado aquí**: `sale_events` registra también las reventas, pero la consulta de
fantasmas filtra `is_secondary = FALSE` a propósito; si algún día se quiere el mismo contraste sobre el
mercado secundario hará falta una regla distinta (la oferta mandaría `listings`, no `nfts.status`).


---

## 37. F9 desplegada (`v15`→`v16`): dos hallazgos operativos y una lección sobre los mocks (2026-10-01)

**Corrección a §36.** Allí se declaró la capa estructural F9 como verificada (pruebas + falsificación).
Era cierto **en local**, pero el despliegue demostró que en producción **no llegó a ejecutarse** hasta
`v16`. Este apartado documenta los dos hallazgos y lo que cambia en la forma de verificar.

### Hallazgo 1 · Un mock no valida SQL

`listGhostPrimarySales` se escribió como `SELECT DISTINCT … ORDER BY se.token_id::NUMERIC`. PostgreSQL
lo rechaza —«for SELECT DISTINCT, ORDER BY expressions must appear in select list», confirmado en los
logs de producción con `routine: 'transformDistinctClause'`—. Las pruebas no lo vieron porque el doble
del pool está mockeado: se comprobaban **subcadenas** de la consulta, nunca su sintaxis. En producción
la excepción se tragaba el `try` de `fetchCatalog`, que caía a su respaldo por RPC en **cada**
petición: el catálogo seguía sirviendo (200) mientras la capa nueva estaba muerta, y el aviso de
sincronización era inalcanzable.

**Qué cambia**:
- La forma es `GROUP BY se.token_id` (deduplica igual y admite expresiones en el `ORDER BY`).
- Guardián nuevo en `nfts.repository.test.ts`: prohibido `SELECT DISTINCT` en esa consulta, exigido
  `GROUP BY` y `ORDER BY … ::NUMERIC`. **Falsificado**: restaurar la forma de `v15` pone la prueba en
  rojo.
- La sintaxis se validó contra un **motor PostgreSQL real** (PGlite 0.5.8 · PostgreSQL 18.3 WASM) con
  un caso de cada tipo: fantasma (venta primaria sin reventa) → devuelta; vendida **con reventa
  activa** → excluida; solo venta secundaria → excluida; noche sana → fuera; ya `SOLD` → fuera. La
  misma prueba **reproduce el rechazo** de la forma antigua, así que el defecto queda caracterizado,
  no solo corregido.
- **Regla adoptada**: cuando una consulta sea nueva o cambie de forma, validarla contra un motor real
  (PGlite vale) antes de desplegar; el mock sirve para la lógica de mapeo, no para la sintaxis.

### Hallazgo 2 · El tráfico de `hotel-mcp-web` estaba **fijado por nombre**

El primer `v15` creó la revisión `00015-jhk` y Cloud Run la **retiró a los 32 s**: el `spec.traffic`
del servicio fijaba el 100 % a `00014-sn9` por nombre, así que la revisión nueva no recibía tráfico y
Cloud Run la daba de baja. El `describe` mostraba `image: web:v15` mientras el tráfico servía `v14`:
un estado engañoso que solo se detecta mirando `status.traffic`.

**Procedimiento corregido y probado en `v16`**: `deploy --no-traffic --tag=<tag>` → verificar el
canario en su URL propia → `update-traffic --to-revisions=<revisión>=100`. (`--to-latest` no existe en
`gcloud run deploy` de este SDK.) Detalle en `despliegue_gcp.md` §26.

### Estado

| Comprobación | Resultado |
|---|---|
| `@hotel/shared` · `@hotel/web` · `@hotel/worker` | **431** · **583** · **132** pruebas en verde |
| Falsificación del guardián SQL | Restaurar la forma `DISTINCT` → **rojo**; restaurado → verde |
| Canario `v16` (tag) antes de mover tráfico | `/health/ready` **READY**, `/catalogo` **200**, aviso **0**, **logs sin error de SQL ni respaldo RPC** |
| Producción `v16` (`hotel-mcp-web-00019-jef`, 100 %) | `/health/ready` **READY**; `/catalogo` **200**; 7 rutas de regresión **200**; APIs protegidas **401**; **18 variables y 9 secretos** conservados |
| Comparativa `v15` | El error `DISTINCT` aparecía en cada petición del catálogo |

**Lección de método**: las cifras de prueba en verde no acreditan que una capa **se ejecute** en
producción. Lo que lo acreditó aquí fue leer los logs de la revisión nueva y verlos limpios (y verlos
sucios en la anterior). Un despliegue con canario etiquetado permitió además detectarlo **antes** de
exponerlo al huésped.

---

## 38. Rediseño visual «Brisa Marina» — identidad completa de `apps/web` (2026-10) · `@asistenteProyecto` + `@visualUiUx`

### Encargo y calibración

Encargo del responsable: *«identidad visual para todo el proyecto, fresca con estilo profesional;
estilo AdminLTE para la suite de administrador y landing page para la página principal»*. La
entrevista de calibración (bloque de 3) fijó: **rediseño completo desde cero** (no evolución
aditiva), dirección **más luminosa y aérea**, alcance **solo `apps/web`**.

Antes de tocar nada se auditó el acoplamiento real: el proyecto **ya tenía** identidad implementada
(`Manual_Identidad_Visual.md` v1.2.2, «Mediterráneo editorial»), **AdminLTE ya aplicado** al
back-office (v1.2.0) y **landing ya existente** (hero + `BookingBar`). El rediseño **conserva la
arquitectura de información y la distribución AdminLTE** —que son las que el responsable pidió— y
sustituye el sistema visual completo: vocabulario de tokens, valores, tipografías y elevación.

### Qué cambió

| Pieza | Antes | Ahora |
|---|---|---|
| Lienzo | `sand #FBF6EC` (arena cálida) | **`mist #F4F9FC`** (porcelana fría) |
| Primario | `sea #0E5A63` (teal apagado) | **`azure #0F6C9C`** (azur vívido) |
| Registro oscuro | `ocean #0F2C3F` | **`navy #0E2A3F`** (marino frío) · `navy-soft` |
| Acento | `terracotta` / `terracotta-text` | **`coral` / `coral-text`** |
| Detalle premium | `gold` / `champagne` | **`amber` / `pearl`** |
| Estado disponible | `olive #5E6B45` | **`fern #276E4C`** |
| Display | Fraunces (sin cirílico) | **Playfair Display** (cirílico nativo) |
| UI | Hanken Grotesk + respaldo Inter | **Manrope** (cirílico nativo) |
| Cascada cirílica | 2 respaldos `preload:false` | **eliminada**: la cubre la marca |
| Elevación | sombras con tinte teal cálido | **sombras frías y difusas** (marino/azur) |

### Método (por qué no se rompió nada)

1. **Fuentes de verdad identificadas y reescritas a la vez**: `packages/config/tailwind/preset.cjs`
   (tokens), `apps/web/src/lib/a11y/palette.ts` (espejo medible), `apps/web/src/app/globals.css`
   (`:root` de runtime), `apps/web/src/app/layout.tsx` (fuentes) y `scripts/design/contrast-audit.mjs`
   (instrumento).
2. **Migración token a token con script acotado por contexto** (`/tmp/migrate-brisa.mjs`): solo
   utilidades de clase, variables CSS, accesos `PALETTE.x`, cadenas exactas de token en los tests de
   paleta y HEX de la paleta. **No** se tocó prosa ni textos de traducción (la primera búsqueda daba
   falsos positivos como «proce**sand**o»). Resultado: **141 ficheros, 3.184 reemplazos** en un paso,
   con los guardianes como red de seguridad.
3. **7 guardianes adaptados, no desactivados**: `cyrillic-fonts.test.ts` se reescribió para exigir la
   cobertura cirílica de **las fuentes de marca**; `a11y.test.ts`, `brand-pieces.test.ts`,
   `control-boundary.test.ts` y `admin-shell.test.ts` siguen midiendo sobre el preset real.
4. **Piezas de marca migradas**: los **42 SVG** de `docs/imagenes`, la maqueta
   `docs/ux-mockups/catalogo.html`, la imagen social generada en código y el generador de manuales
   `apps/web/scripts/build-manuals.mjs`.
5. **Documentación alineada**: `Manual_Identidad_Visual.md` **v2.0.0** (reescrito),
   `docs/DISENO-UX.md` §2, `docs/ACCESIBILIDAD-WCAG.md` **v2.0.0** y el nuevo
   `RepoTecnico/analisis_visual.md` (informe de Fase 1 del skill).

### Dos correcciones que salieron de medir (no de mirar)

- `warning` pasó de `#96690E` a **`#8A5F0C`**: sobre su propia banda daba **4,29:1** (no AA).
- `fern` pasó de `#2E7D57` a **`#276E4C`**: el chip «LIBRE» de recepción
  (`text-fern` sobre `bg-fern/10`) daba **4,18:1**; ahora **5,04:1**.

Ninguna de las dos la habría detectado una revisión visual: las encontró el guardián de pares del
mismo elemento, que compone el alfa y mide.

### Estado

| Comprobación | Resultado |
|---|---|
| `node scripts/design/contrast-audit.mjs` | **50 pares** · **0** por debajo de su mínimo |
| Guardianes de identidad (`vitest run src/lib src/components/admin`) | **36 ficheros · 277 pruebas en verde** |
| Suite completa de `@hotel/web` | **72 ficheros · 584 pruebas en verde** |
| `pnpm --filter @hotel/web typecheck` | verde (hubo que reconstruir `@hotel/shared`: su `dist` estaba obsoleto) |
| `pnpm --filter @hotel/web build` | verde, **20/20 páginas** y fuentes `woff2` descargadas |
| Ficheros con el sistema nuevo | **142** (código, guardianes, ilustraciones, maqueta y documentación) |
| Evidencia visual | `RepoTecnico/evidencias/identidad-brisa-marina.png` (hoja de identidad a 2x) + `.html` openable, **generados** por `scripts/design/brand-sheet.mjs` desde el preset y las fuentes reales del build |
| **Escaneo axe con navegador real** | **70/70** (35 rutas × `chromium` + `Pixel 5`) **sin violaciones `critical`/`serious`**, sobre el build de producción con PostgreSQL 16 y Redis 7 locales y RPC/worker apagados a propósito |
| Capturas del producto real | `pantalla-landing.png` · `pantalla-catalogo.png` · `pantalla-contacto.png` (y `-antes-del-arreglo.png` como evidencia del defecto) · `pantalla-admin-acceso.png` · `pantalla-admin-dashboard.png` · `pantalla-admin-minteo.png` · `pantalla-recepcion.png` — servidor real, build de producción; el back-office con sesión real vía login + TOTP y **consola sin `MISSING_MESSAGE`** |
| Manuales regenerados | `pnpm --filter @hotel/web manuals` → **35 manuales · 428 secciones**, 0 restos de la paleta anterior en `docs/pdf/` |

### Publicación: push y release `v18` en GCP (2026-10-02)

| Paso | Detalle |
|---|---|
| Commit | **`b761a3e`** — *feat(identidad): rediseño visual «Brisa Marina» v2.0.0 en toda la web* (256 ficheros) |
| Push | **`github`**: `0829481..b761a3e` (rama `Hotel-DSH-GCP`) ✅ · **`codecrypto` (GitLab): rechazado** — sin credenciales válidas en el entorno (**B-0** sigue abierto, hay que regenerar el token) |
| Imagen | Cloud Build **`web:v18`** (3m03s, build `b3ed7710-b192-4984-a1ec-69dadb6c11f2`) con los `NEXT_PUBLIC_*` de `v17` |
| Revisión | **`hotel-mcp-web-00023-rep`** al **100 %** (canario `v18` verificado antes de mover tráfico) |
| Rollback | `gcloud run services update-traffic hotel-mcp-web --to-revisions=hotel-mcp-web-00021-tid=100` |
| Configuración | **18 variables y 9 secretos conservados, cero diferencias**; misma SA y VPC |
| Verificación en producción | `/health/ready` **READY**; 9 rutas → **200**; el CSS servido trae `--mist/--azure/--navy/--coral-text` y **cero** restos de `--sand/--sea`; `axe` **0 violaciones** en el canario; logs **sin errores ni `MISSING_MESSAGE`** |
| Fuera de la release | El arreglo **D-84** (redondeo al céntimo) se apartó en un `stash` durante el build: su test está **rojo** y no podía entrar en la imagen. El trabajo sigue en el árbol, sin commitear |
| Detalle de método | `gcloud builds submit` empaqueta el **árbol de trabajo**, no el commit: sin apartar el trabajo en curso, la imagen habría llevado lógica no versionada |

### Hallazgo colateral del escaneo: cuatro claves i18n rotas (corregido + guardián nuevo)

El escaneo axe destapó algo **ajeno al rediseño pero real**: el servidor registraba
`MISSING_MESSAGE` en cada petición de `/contacto` y el huésped veía el literal `home.travelers.title`.
Causa: la página pedía `home.travelers.*` y `home.howToArrive.*` mientras las cuatro claves viven en el
namespace **`contact`**; en el mismo barrido apareció un `system.operationsTitle2` huérfano que el
back-office (`SystemOperations`) pedía como `system.operationsTitle`.

- **Corregido**: los tres enlaces a su namespace real (sin inventar copy: se usan las traducciones que
  ya existían en ES/EN/RU) y renombrada la clave huérfana en los tres catálogos.
- **Blindado**: guardián nuevo `apps/web/src/lib/i18n-keys.test.ts`, que resuelve estáticamente los
  enlaces `getTranslations("ns")`/`useTranslations("ns")` de `src/**` y exige que **toda clave pedida
  exista en ES, EN y RU**. El guardián de paridad no podía verlo: una clave ausente en los **tres**
  idiomas es «paritaria». Límite declarado: las claves con plantilla (49) no son resolubles.
- **Lección de método**: el defecto llevaba en el producto desde la suite pública (commit del
  2026-09-28) y **ninguna** de las 584 pruebas lo veía; lo encontró *ejecutar el sistema y leer su
  consola*, no una aserción.

### Cómo se reprodujo el entorno de la verificación (y cómo se restauró)

El escaneo axe y las capturas exigen el sistema **en marcha**. En este entorno no había servicios
levantados; se usaron los paquetes ya extraídos en `/tmp` (los dejó una sesión anterior):

```bash
# PostgreSQL 16 (datos en /tmp/pgdata)
export LD_LIBRARY_PATH=/tmp/pgroot/usr/lib/x86_64-linux-gnu:/tmp/pgroot/usr/lib/postgresql/16/lib
/tmp/pgroot/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -l /tmp/pg-start.log \
  -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start

# Redis 7 (script de la sesión anterior; escucha en loopback + IP del host y sin autenticación)
sh /tmp/redis7/start-redis.sh

# App con el backend apagado a propósito (mide también los estados degradados)
cd apps/web && RPC_URL=http://127.0.0.1:1 WORKER_BASE_URL=http://127.0.0.1:1 \
  SESSION_SECRET=e2e-test-secret ANTHROPIC_API_KEY= pnpm start --port 3100
```

Notas de la sesión: el navegador de Playwright necesita `LD_LIBRARY_PATH` apuntando a las
bibliotecas extraídas (`/tmp/playwright-libs/extracted/usr/lib/x86_64-linux-gnu`) y `pnpm manuals`
también (genera los PDF con el mismo navegador). Se aprovisionó un operador **local de pruebas**
(`admin@marinadelsol.es`, `DEFAULT_ADMIN_ROLE`) para capturar el back-office con sesión real:
conviene rotarlo con el mismo comando de aprovisionamiento y **no reutilizar esa contraseña**.
Al terminar se **pararon los tres servicios** (PostgreSQL, Redis y la app): el entorno queda como
estaba.

### Cierre de aplicación: ninguna superficie viva con la imagen anterior (2026-10)

Barrido final (tokens y HEX del sistema anterior en todo el repositorio, excluidos los documentos que
son **registro histórico**). Superficies vivas **con la identidad nueva**:

| Superficie | Estado |
|---|---|
| `apps/web` (tokens, CSS, fuentes, 48 rutas y sus suites) | ✅ migrada y verificada (584→588 pruebas en verde) |
| `docs/imagenes/*.svg` (42 piezas) + `opengraph-image.tsx` + `docs/ux-mockups/catalogo.html` | ✅ migradas (guardián `brand-pieces.test.ts` deriva los HEX del preset) |
| `docs/pdf/**` (35 manuales) y `apps/web/public/manual/**` | ✅ regenerados con `pnpm --filter @hotel/web manuals` |
| Documentación viva: `DISENO-UX.md`, `ACCESIBILIDAD-WCAG.md`, `Manual_Identidad_Visual.md` v2.0.0, `analisis_visual.md` | ✅ al día |
| **Instrucciones de producción futura** (rol CREATIVO y equipo de manuales) | ✅ `RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md` (tabla de paleta + tipografías + reglas de color) y `docs/imagenes/README.md` (guía de estilo) actualizados a «Brisa Marina» |

**Se conservan a propósito con los valores antiguos** (son el registro de lo decidido entonces, no
instrucciones): `propuestaVisual-Hotel.md`, `propuesta_imagen_visual.md`, las secciones históricas de
este documento, la tabla antes/después de `analisis_visual.md` y el changelog del manual.

Verificación tras el barrido: guardianes de documentación en verde (`images-naming`, `brand-pieces`,
`help/manuals-sync`, `i18n-keys` → **24/24**).

### Publicación: push y release `v19` en GCP (2026-10-03)

| Paso | Detalle |
|---|---|
| Commit | **`20aae23`** — *feat(admin): acceso sin recargar, Sistemas al primer nivel y gestión completa de habitaciones* (33 ficheros) |
| Push | **`github`** y **`codecrypto` (GitLab)** → `7080df2..20aae23`. GitLab, que venía rechazando la autenticación (B-0), **aceptó** en esta ocasión |
| Imágenes | `worker:v19` (2m09s) y `web:v19` (2m47s), construidas desde el commit |
| Revisión | **`hotel-mcp-worker-00010-jut`** (aplica la migración con `runMigrations` al arrancar) y **`hotel-mcp-web-00025-tec`**, ambas al **100 %** |
| Configuración | Web: **18 variables y 9 secretos conservados, cero diferencias**; misma SA y VPC |
| Producción | 6 rutas → **200**, `/health/ready` **READY**, logs sin errores; worker con `lag 0` y `aggregateLag 0` |
| Rollback | `update-traffic … --to-revisions=hotel-mcp-web-00023-rep=100` (web) y `…worker-00008-fnt=100` (worker) |
| Fuera de la release | D-84 (test rojo) apartado en un `stash` durante los builds y restaurado después |
| Límite declarado | Las pantallas nuevas del panel no se pudieron ejercitar en producción (requieren sesión de owner con TOTP); se verificaron en navegador local y contra PostgreSQL real antes de desplegar |

### Release `v20`: precios en euros correctos (2026-10-04)

| Paso | Detalle |
|---|---|
| Commits | **`b63a8bd`** (fix D-84 de tasas: redondeo al céntimo, sin tasa inventada, fuentes del nativo) y **`9714ec1`** (utilidades de inyección de datos y su documentación) |
| Push | `75cde47..9714ec1` en **github** y **codecrypto** |
| Imagen / revisión | **`web:v20`** → **`hotel-mcp-web-00027-dil`** al **100 %**; worker sin cambios |
| Defecto medido (A/B) | `v19`: **0 céntimos** (la reserva se bloqueaba) → canario `v20` con caché envenenada: **1** → producción `v20` con caché renovada: **11 948 céntimos (119,48 €/noche)** |
| Hallazgo operativo | La clave de caché `hotel:rates:pol_eur` es **agnóstica del activo**: mientras `v19` servía tráfico, reescribía la tasa de POL cada 5 minutos y la revisión nueva la leía. Al mover el tráfico y expirar el TTL, la tasa convergió a la de ETH (medido cada 55 s) |
| Pendiente derivado | Renombrar la clave de caché para que dependa del activo (dos líneas + prueba): **propuesto**, no incluido |
| Verificación | 8 rutas de producción → **200**, logs sin errores, `@hotel/shared` **444 pruebas** en verde |

### Pendiente derivado (declarado, no oculto)

1. **Escaneo axe con datos reales** (dashboard con cifras y gráficas): el spec fuerza vistas
   degradadas; requiere una base poblada y Anvil con noches vivas.
2. La **app nativa del hotel** (llave NFC, conserjería, chat de mayordomía) sigue **fuera** del alcance
   de esta entrega: es la 3.ª versión (D-49/D-50) y no existe dominio de negocio para ella en el
   modelo. Si se aborda, será un ciclo propio con su propio sistema visual.
3. El **modo noche** del personal sigue propuesto y no aprobado (multiplicaría la matriz de pares).
4. Detalle cosmético observado en el back-office: la marca del sidebar se recorta («Panel · Mari…») por
   el ancho del panel. No se toca porque el contrato del shell está fijado por `admin-shell.test.ts`;
   queda a decisión del responsable (acortar la etiqueta o permitir dos líneas).
---

## 39. Panel de administración: acceso sin recargar, Sistemas al primer nivel y gestión de habitaciones (2026-10-02) · `@asistenteProyecto`

### Lo pedido por el responsable

1. Al iniciar sesión, el formulario no desaparecía hasta recargar la página.
2. En el panel: (2.1) sacar **Sistemas** del panel Administración y ponerlo al primer nivel del sidebar;
   (2.2) en la sección **Habitación**: alta con formulario flotante (físicas, decorativas, servicios,
   espacios y hasta 4 fotos), tabla solo de resumen con ficha flotante al seleccionar, y una **ficha
   reutilizable** con secciones según el perfil del usuario y un calendario de días publicados y
   reservados.

### 1 · El acceso ya no exige recargar (defecto real corregido)

**Causa raíz.** `AdminSignInScreen` abría **su propia** instancia de `useAdminSession` y en ella
observaba `sessionUsername` para lanzar `router.refresh()`; el formulario, en cambio, usa la instancia
de `AdminLayout`. La instancia observada **nunca** veía el login, así que el refresco que re-evalúa el
gate del servidor no se disparaba nunca.

**Arreglo.** El refresco vive ahora en `SignInGate` (dentro de `AdminLayout`), que es quien comparte la
sesión con `CredentialForm`; `AdminSignInScreen` queda como envoltorio sin estado. **Guardián nuevo**
en `admin-shell.test.ts` («Back-office · el acceso se resuelve sin recargar»): fija que el refresco está
en el shell y que la pantalla de acceso no abre una segunda sesión (comprobado por import/uso, no por la
palabra suelta del comentario).

### 2.1 · Sistemas, sección de primer nivel (revierte D-80)

`adminNav.ts`: se retira el concepto de **subgrupo** (`AdminNavGroup`/`ownerGroup`) y **Sistemas** pasa a
ser una sección propia (`key: "sistemas"`, icono `server`) con sus seis entradas, al mismo nivel que
Habitación o Recepción. Las migas pasan de tres niveles (Administración › Sistemas › Ajustes) a dos
(Sistemas › Ajustes). El bloque de sesión (D-81) sigue dentro del panel Administración. El guardián del
shell se actualizó en consecuencia (y comprueba que ninguna sección anida ya subgrupos y que las
entradas de Sistemas siguen reservadas al owner).

### 2.2 · Gestión de habitaciones

**Modelo de datos (migración incremental, validada contra PostgreSQL real).** `rooms` gana nueve
columnas (vista `SEA|GARDEN|INTERIOR`, balcón, accesible PMR, estilo decorativo
`MEDITERRANEAN|CONTEMPORARY|CLASSIC|RUSTIC|MINIMAL`, paleta, materiales y notas de decoración ES/EN/RU)
con sus `CHECK`, y nacen `room_space_types` (catálogo trilingüe de espacios, con semilla de seis) y
`room_spaces` (espacio + superficie por habitación). Los tres artefactos de datos
(`diccionario_datos.md`, `diagrama_er.md`, `base_datos.sql`) se actualizaron en el mismo turno.

**Verificación contra el motor (lección de F9).** La migración se aplicó **dos veces** sobre la base de
desarrollo (idempotente) y `base_datos.sql` se ejecutó entero dentro de una transacción con `ROLLBACK`
(0 errores). El SQL de reemplazo de conjuntos se probó contra PostgreSQL real y **destapó dos defectos
que un mock no ve**:

| Defecto detectado | Corrección |
|---|---|
| `WITH removed AS (DELETE …) INSERT … ON CONFLICT` en una sola sentencia: el `ON CONFLICT` evalúa la instantánea **previa** al borrado, así que los servicios que ya estaban se saltaban y **se perdían** (medido: `WIFI, AC, TV` → reemplazo por `WIFI, MINIBAR` dejaba solo `MINIBAR`) | `setRoomAmenities`/`setRoomSpaces` pasan a **transacción explícita** (DELETE + INSERT) sobre el pool inyectado |
| `unnest($2::varchar[]) AS code` sin lista de columnas: el alias nombra la tabla y el `SELECT` insertaba **cero filas** | Alias con columnas explícitas: `AS t(code)` |

**API.** `GET /api/admin/rooms/[id]` devuelve además servicios, espacios y las **noches ocupadas** de la
ventana pedida (`?from&to`, por defecto un semestre alrededor de hoy); `POST`/`PATCH` aceptan
`amenityCodes` y `spaces` (validados antes de escribir, para no dejar fichas a medias); y
`GET /api/admin/rooms/options` sirve los tres catálogos del formulario. Las listas cerradas viven ahora
en `apps/web/src/lib/room-fields.ts` (sin `server-only`), de modo que **la validación del servidor y el
formulario comparten una sola fuente** —antes `RoomsAdmin` duplicaba los tipos a mano.

**Matriz de visibilidad de la ficha** (decisión del responsable, en `room-fields.ts`): owner todo;
recepción físicas/servicios/espacios/publicaciones; housekeeping y mantenimiento
físicas/decorativas/servicios/espacios (sin comercial); huésped físicas/decorativas/servicios/espacios y
disponibilidad publicada.

**i18n.** 65 claves nuevas en los tres catálogos (`admin.room*`), añadidas **antes** de la UI para que
las dos delegaciones de interfaz no compitieran por los mismos ficheros.

**Riesgo señalado (no resuelto en este ciclo).** Las fotos de habitación se escriben en el sistema de
ficheros del contenedor (`ROOM_IMAGES_DIR`, por defecto `docs/imagenes`). El servicio `hotel-mcp-web` de
Cloud Run **no monta ningún volumen**, así que en producción las fotos subidas se pierden al
redesplegar o al escalar a otra instancia. Es un riesgo **preexistente** (D-5/D-12/D-20) que la nueva
carga de fotos hace visible; la corrección natural es un bucket de Cloud Storage (o un volumen GCS) como
ciclo propio.

### Estado

| Comprobación | Resultado |
|---|---|
| Migración sobre PostgreSQL real (dos pasadas) | **idempotente**; 9 columnas, 2 tablas y 6 semillas verificadas |
| `base_datos.sql` completo en transacción con `ROLLBACK` | **0 errores** (idempotente sobre base ya migrada) |
| Repositorio de habitaciones (`@hotel/shared`) | **25 pruebas** (17 previas + 8 nuevas) |
| Parseo y reglas de la ficha (`apps/web/src/lib/rooms.test.ts`) | **20 pruebas** (10 nuevas) |
| API de habitaciones | **46 pruebas** (5 ficheros) |
| Guardián del shell del back-office | **28 pruebas** |
| Interfaz (formulario flotante, tabla resumen y ficha con calendario) | entregada por dos agentes en paralelo; verificada (abajo) |
| Pruebas focalizadas de la web (`src/lib`, `src/components`, `api/admin/rooms`) | **409 pruebas** en verde (49 ficheros) |

### Interfaz entregada y verificada (2026-10-02)

| Pieza | Ficheros | Qué hace |
|---|---|---|
| Formulario flotante | `components/admin/rooms/RoomFormDialog.tsx`, `ModalShell.tsx`, `useModalDialog.ts`, `room-dto.ts` | `role="dialog"` + `aria-modal` + foco/trampa/`Escape`; secciones físicas, decoración, servicios, espacios y **hasta 4 fotos** reescaladas en el navegador (`createImageBitmap` + `canvas`, lado mayor 1600 px, JPEG 0,75) antes de subirlas; la portada se marca tras crear la ficha |
| Tabla resumen + ficha flotante | `components/admin/rooms/RoomsAdmin.tsx` | Columnas de resumen (nº, tipo, capacidad, camas, m², precio en ETH, estado, estado operativo) y apertura de la **ficha flotante** que monta el componente reutilizable |
| Ficha reutilizable | `components/rooms/RoomDetailCard.tsx` | Secciones por **perfil** (matriz del responsable), sin depender del contexto de administración; contrato de cliente propio (no importa el barril de servidor) |
| Calendario | `components/rooms/RoomCalendar.tsx`, `lib/room-calendar.ts` (+ test) | Cuatro estados (publicada, reservada, ambas, libre) con leyenda, símbolo y `aria-label` por día, resumen `role="status"` y navegación de mes |

**Verificación en navegador real** (con una ruta temporal de vista previa, ya eliminada, porque el sandbox
borró PostgreSQL y Redis de `/tmp` y no era posible el recorrido con base de datos):

| Comprobación | Resultado |
|---|---|
| `axe` sobre el **formulario** abierto | **0 violaciones** `critical`/`serious` |
| `axe` sobre la **ficha** (owner y huésped) | **0 violaciones** `critical`/`serious` (tras corregir el defecto de contraste que se detalla abajo) |
| Secciones por perfil medidas en el DOM | OWNER **6** · GUEST **5** · sección comercial en GUEST **0** |
| Calendario | 35 días pintados con estado y `aria-label`; leyenda con las cuatro clases |
| Evidencia | `RepoTecnico/evidencias/panel-formulario-habitacion.png` y `panel-ficha-habitacion.png` |

**Defecto real que destapó el escaneo (corregido).** Los días de los meses vecinos del calendario se
atenuaban con `opacity-60`: el texto quedaba en **2,87:1** sobre blanco (axe, `color-contrast`, serio).
Se sustituyó por un **borde discontinuo** — señal que además no depende del color (WCAG 1.4.1) — dejando
los colores de estado del sistema. Un mock no lo habría visto: hizo falta renderizar y medir.

**Ajuste de arquitectura derivado de verificar.** `RoomFormDialog` pedía `apiFetch` al contexto del
panel (`useAdminContext`), lo que impedía montarlo fuera del shell y por tanto probarlo en navegador.
Ahora lo recibe **por props** (el panel se lo pasa): se puede montar y probar aislado, y el acoplamiento
con el shell baja.

---

## 40. Tablero de habitaciones: iconos de estado, acciones rápidas y acciones masivas (2026-10-04) · `@asistenteProyecto`

**Petición del responsable** (Admin → subsección Habitaciones):
1. el listado muestra un **icono** que distingue si la habitación está Publicada, Reservada u Ocupada, y
   si está Limpia, En Mantenimiento o Activa;
2. se **elimina el botón «Ver ficha»** y se sustituye por una **zona de acciones rápidas** (Publicar,
   Reservar, Activar/Desactivar), **solo iconos**;
3. en la **cabecera de la tabla** un **icono de acciones masivas**: al activarlo aparecen casillas de
   selección (primera columna, oculta fuera de ese modo) y **solo se pueden marcar** las elegibles por
   acción — PUBLICAR: habilitada (limpia y sin reserva) y no publicada; LIBERAR: las reservadas;
   ACTIVAR/DESACTIVAR: las activas y sin reserva.

**Hallazgo de vocabulario (resuelto con el responsable antes de codificar).** Tres de los estados
pedidos **no existen como tales** en el modelo: `rooms` tiene `publicationStatus`
(`DRAFT`/`PUBLISHED`/`PAUSED`/`MAINTENANCE`/`OUT_OF_SERVICE`) y `operationalStatus`
(`CLEAN`/`DIRTY`/`OCCUPIED`), y **«Reservada» no es un estado**: las reservas viven por noche en
`reservations`/`reservation_nights` (y `nfts` para noches vendidas). Se acordó (4/4 respuestas
recomendadas):

| Concepto pedido | Decisión acordada |
|---|---|
| **Reservada** | Derivado: ≥1 noche ocupada en la ventana **hoy → +150 días** (misma ventana que la ficha). No cambia el modelo de datos. |
| **LIBERAR** | Cancela las reservas **activas** (`PENDING`/`CONFIRMED`) con noches en esa ventana (los tokens no se cancelan por esta vía). |
| **Activa** / Activar-Desactivar | «Activa» = `PUBLISHED`; la acción conmuta `PUBLISHED` ↔ `PAUSED`, **sin TOTP**. |
| **Reservar** (acción rápida) | Abre la **ficha** en su sección de calendario (las reservas son por fecha). |
| **PUBLICAR masivo** | Un **único TOTP** para el lote; anclaje on-chain **best-effort** por habitación (`PENDING_ANCHOR` si falta). |

**Extensión de API necesaria (regla de reanudación).** `PATCH /api/admin/rooms/[id]` rechazaba pasar a
`PUBLISHED` (exige TOTP, D-2/D-18). Como la acción pedida es «sin TOTP», se admitió **`PAUSED →
PUBLISHED`** por `PATCH` — es **reanudar** una ficha ya publicada y anclada, no una publicación nueva.
Desde cualquier otro estado se mantiene el flujo con TOTP.

### Cambios por capa

| Capa | Cambio |
|---|---|
| `packages/shared` · `RoomsRepository` | `countReservedNightsByRooms(ids, from, to)` (una consulta para todo el lote) y `listReleaseableReservationIds(roomId, from, to)` (solo `PENDING`/`CONFIRMED`). |
| `GET /api/admin/rooms` | Añade `reservedNights` por habitación y `reservedWindow` (hoy → +150 días). |
| `PATCH /api/admin/rooms/[id]` | Admite `PUBLISHED` **solo desde `PAUSED`** (reanudación). |
| `POST /api/admin/rooms/bulk/publish` | Nuevo: lote + **un** TOTP, `txHashes` opcionales, resultado por habitación; una sola habitación no tumba al resto. |
| `POST /api/admin/rooms/bulk/release` | Nuevo: cancela las reservas activas de la ventana. Sin TOTP (la cancelación de reservas nunca lo exigió). |
| `POST /api/admin/rooms/bulk/toggle` | Nuevo: `PUBLISHED` ↔ `PAUSED`; `NOT_TOGGLEABLE` desde el resto de estados. |
| `components/admin/rooms/roomIcons.tsx` | Nuevo: 15 iconos SVG **en línea** (patrón de `adminIcons.tsx`) — sin dependencias de terceros y con color por token. |
| `components/admin/rooms/room-bulk.ts` | Nuevo: reglas de elegibilidad **puras** (una sola fuente para la interfaz). |
| `components/admin/rooms/RoomsAdmin.tsx` | Iconos por estado + distintivo «Reservada»; columna de acciones rápidas; cabecera masiva con selección y contadores; `publishBatch` con anclaje best-effort. |
| `messages/{es,en,ru}.json` | 18 claves nuevas en el namespace `admin` (paridad en los tres idiomas). |

### Verificación del ciclo

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` (`apps/web`) | **0 errores** |
| `eslint` de `components/admin/rooms` y `app/api/admin/rooms` | **0 avisos** |
| `vitest` de `app/api/admin/rooms/**` | **63/63** (incluye `bulk/bulk.test.ts`: 15 nuevas) |
| `vitest` de `RoomsRepository` | **28/28** (3 nuevas para los métodos masivos) |
| `vitest` de `components/admin/rooms/room-bulk.test.ts` | **11/11** (reglas de elegibilidad) |
| `vitest` de **todo** `@hotel/web` (suite completa) | **649/649** en 76 archivos, **0 fallos** (incluye `boundaries.test.ts`) |
| Guardianes de i18n (`i18n-keys`, `i18n-parity`) y `admin-shell` | **36/36** |
| `next build` de `@hotel/web` | **exit 0**; se genera `admin/habitacion` (`page.js` + chunk de cliente) |

**Sin migración de base de datos.** El ciclo **no** toca el modelo: `reservedNights` es una consulta
derivada sobre `reservations`/`reservation_nights`/`nfts`, y las tres acciones masivas usan métodos ya
existentes (`setPublicationStatus`, `cancelReservation`) más los dos nuevos de lectura. Por tanto
`base_datos.sql`, `diccionario_datos.md` y `diagrama_er.md` **no cambian** (se mantienen sincronizados
al no haber cambio de esquema).

**Clave retirada.** Al eliminar el botón «Ver ficha» quedó huérfana `roomOpenDetail` en el namespace
`admin`: se ha retirado de los tres idiomas (los guardianes `i18n-keys`/`i18n-parity` siguen en verde).

**El acuñado de ventana sobrevive a la acción rápida.** `runMintWindow` leía solo de la ficha abierta; ahora
acepta el id de la habitación, de modo que publicar desde la fila (sin abrir ficha) sigue acuñando la ventana
en el primer momento (F8 · D-4).

**Pendiente de verificación visual.** El recorrido en navegador con `axe` (patrón de §39) queda para la
próxima ventana con PostgreSQL/Redis levantados: aquí no hay servidor de la app en marcha, así que la
evidencia visual de este ciclo no se ha capturado. Lo verificado es compilación + pruebas + lint.

### Despliegue (release v21 → v22)

| Paso | Detalle |
|---|---|
| `push` | `e9793b8` a los tres remotos de `anlucorporations` (`origin`, `github`, `codecrypto`), rama `Hotel-DSH-GCP` |
| Imagen | `web:v22` (Cloud Build `96d6aece…`, 2m48s) — solo `web`; `worker`/`mcp`/`monitor` no cambian |
| Revisión | `hotel-mcp-web-00030-xaf` sirviendo el **100 %** del tráfico; etiqueta `v22` |
| Canario | La `v21` (`00029-fey`) se retiró y **eliminó**: su verificación en producción destapó el defecto del `bigint` |
| Verificación | 50 habitaciones con `reservedNights` **numérico**, ventana hoy→+150d, 6 con reservas; endpoints masivos 401/403/400 según contrato |

**Defecto real que destapó la verificación en producción.** `reservedNights` viajaba como **cadena**
(``"1"``) porque `COUNT()` es `bigint` y node-postgres lo entrega así; el cast `as number` no convierte
en ejecución. Con `=== 0` estricto, **PUBLICAR y ACTIVAR/DESACTIVAR** habrían quedado deshabilitadas
para todo el mundo (fallo silencioso: botones siempre en gris, sin error). Corregido en el repositorio
(`Number(row.nights)`), en la regla pura (`reservedNightsOf`) y al cargar el listado; el test del
repositorio ahora devuelve **cadenas**, como el driver. Detalle en `despliegue_gcp.md` §42.

> **Ninguna acción masiva se ejecutó contra producción**: publicar, liberar o conmutar estado mutan
> datos reales y requieren orden explícita del responsable.

---

## 41. Subsección «Publicar»: CalendarioHabitaciones y gestión del día (2026-10-04) · `@asistenteProyecto`

**Petición del responsable** (Admin → Habitación → subsección «Publicar»):
1. un **calendario** con el estado de las habitaciones **por día** (Publicadas, Reservadas, Ocupadas),
   con **icono y total**, para ver el mapa de lo disponible por **día, semana, mes y trimestre**,
   reutilizable desde cualquier parte del sistema (`CalendarioHabitaciones`);
2. al **seleccionar un día**, administrar sus habitaciones (publicar, reservar, liberar) y un **panel
   de servicios** (mantenimiento y cambio de lencería).

**Decisiones acordadas con el responsable** (5 respuestas):

| Pregunta | Decisión |
|---|---|
| Dónde vive | **Reemplaza** la subsección existente «Publicar noche» (`/admin/mint`) |
| Conteo por día | **Tres contadores independientes** (solape permitido, como «AMBAS» del calendario por habitación) **+ estado «En mantenimiento»** |
| Acción Publicar | Publica la **habitación completa** (ventana de 90 noches, TOTP), como hoy; sin cambio de modelo |
| Acción Reservar | **Reserva real** con canal y precio (`createReservation`), `PENDING` con hold de 24 h |
| Servicios | Mantenimiento → **incidencia** real; Lencería → **asignación de housekeeping** del turno |
| Minteo on-chain | Se **integra en el panel del día** (no se pierde la capacidad de CU-02) |
| Acceso | **Owner y recepción**; publicar y acuñar siguen exigiendo owner/`MINTER_ROLE` |

**Dos huecos del modelo que obligaron a decidir.** «Publicar» **no es por día** (la publicación acuña la
ventana de 90 noches con TOTP), y «cambio de lencería» **no tiene modelo propio** (Lencería es stock:
`supply_items`), así que se reutiliza la asignación de housekeeping del turno.

### Qué se construyó

| Capa | Pieza |
|---|---|
| `packages/shared` · `RoomsRepository` | `listRoomDayStates(from, to)` (mapa disperso por habitación y día: publicado/reservado/ocupado) y `listRoomIdsInMaintenance()` |
| `apps/web/src/lib/room-board-calendar.ts` | Lógica **pura**: `rangeForView` (día/semana/mes/trimestre en UTC), `enumerateDates`, `aggregateBoardDays`, `isDayRoomEligible` |
| `GET /api/admin/rooms/calendar` | `?from&to` → totales por día; `?date` → todas las habitaciones con su estado y resumen. Owner + recepción |
| `POST /api/admin/rooms/bulk/release` | Ahora acepta `date` para liberar **solo esa noche** (además de la ventana por defecto) |
| `components/rooms/CalendarioHabitaciones.tsx` | Componente **reutilizable** de presentación: vistas, navegación, iconos con totales, leyenda y a11y (icono + texto, `aria-pressed`) |
| `components/rooms/roomIcons.tsx` | Se **mueve** desde `components/admin/rooms/` a una ubicación neutral para que cualquier módulo lo use |
| `components/admin/rooms/RoomsBoardAdmin.tsx` | Contenedor: vista, periodo, día seleccionado, lista de habitaciones y selección por elegibilidad |
| `components/admin/rooms/BoardDayActions.tsx` | Panel del día: publicar (TOTP), reservar (canal/precio), liberar (día), acuñar (integra `AdminMint`) y servicios (incidencia + lencería) |
| `components/admin/AdminPanel.tsx` | Admite **varios roles** (`requiredRole` acepta lista) para owner + recepción |
| `adminNav.ts` | «Publicar noche» (`/admin/mint`) se sustituye por «Publicar» (`/admin/habitacion/publicar`) |
| i18n | 56 claves nuevas en `es`/`en`/`ru` |

### Verificación del ciclo

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` (`apps/web`) | **0 errores** |
| `eslint` de las piezas nuevas | **0 errores · 0 avisos** |
| `vitest` de `@hotel/web` (suite completa) | **678/678** en 78 archivos, **0 fallos** (29 pruebas nuevas) |
| Lógica pura (`room-board-calendar.test.ts`) | **18/18** (vistas, agregación, elegibilidad) |
| Endpoint del calendario (`calendar.test.ts`) | **6/6** (guardas, totales, detalle del día) |
| `RoomsRepository` (métodos nuevos) | **3/3** dentro de los 31 del archivo |
| Guardián de páginas del back-office | Se actualiza la lista: entra `app/admin/habitacion/publicar/page.tsx` y sale `app/admin/mint/page.tsx` |
| `next build` de `@hotel/web` | **exit 0**; se genera `admin/habitacion/publicar` y desaparece `admin/mint` |
| Chunk de cliente servido | Contiene `calendario-habitaciones`, `rooms/calendar`, `board-view-`, `board-action-`, `board-run-publish`, `board-mint-form`, `board-maintenance-form`, `board-linen-form`, `board-select-eligible` |

**Sin migración de base de datos.** Los dos métodos nuevos son de **solo lectura** (`listRoomDayStates`,
`listRoomIdsInMaintenance`) sobre tablas que ya existían (`room_publications`, `reservation_nights`,
`nfts`, `maintenance_incidents`); las acciones reutilizan endpoints que ya existían o se amplían con un
parámetro opcional (`bulk/release` acepta `date`). Por tanto `base_datos.sql`, `diccionario_datos.md` y
`diagrama_er.md` **no cambian**.

**Limitación conocida y documentada.** El estado «En mantenimiento» es **actual** (publicación en
mantenimiento o incidencia abierta que bloquea la venta): como las incidencias no tienen día
programado, se pinta en **todos** los días de la vista. Refinarlo a un rango de fechas exigiría añadir
fechas de planificación a las incidencias (cambio de modelo).

**Pendiente, con su dueño:**
1. **Manuales**: `docs/` y `manuals.generated.ts` siguen describiendo la pantalla `/admin/mint`, que ya
   no existe. Toca regenerar con `pnpm --filter @hotel/web run manuals` tras ajustar el manual fuente
   (tarea del subagente `@manuales`); no se ha editado a mano un archivo generado.
2. **Verificación visual** con navegador y `axe` (patrón de §39/§40): pendiente de una ventana con
   PostgreSQL/Redis levantados.

### Ajuste de textos de estado (2026-10-04, petición del responsable)

Los botones de la ficha y la columna «Publicación» de la tabla comparten las claves `rooms.status.*`, así
que el cambio se aplicó a **ambas** (alcance confirmado con el responsable) y en los **tres idiomas**:

| Clave | Antes | Ahora |
|---|---|---|
| `rooms.status.MAINTENANCE` | En mantenimiento / Under maintenance / На обслуживании | **MANTENIMIENTO** / MAINTENANCE / ОБСЛУЖИВАНИЕ |
| `rooms.status.OUT_OF_SERVICE` | Fuera de servicio / Out of service / Не в эксплуатации | **SERVICIO** / SERVICE / СЕРВИС |

**Consecuencia aceptada.** La **leyenda del calendario** usa otra clave (`admin.boardLegendMaintenance`) y
sigue diciendo «En mantenimiento»: el calendario describe el estado, los botones y la columna usan la
etiqueta corta. También se observa (sin cambiar) que `RoomDetailCard` pinta el **código crudo**
(`MAINTENANCE`) en dos sitios, no la etiqueta traducida: comportamiento anterior a este ciclo.

### Despliegue (release v23)

| Paso | Detalle |
|---|---|
| `push` | `a8e79ac` a los tres remotos de `anlucorporations`, rama `Hotel-DSH-GCP` |
| Imagen | `web:v23` (Cloud Build `0d649e89…`, 3m10s) — solo `web` |
| Revisión | `hotel-mcp-web-00033-men` sirviendo el **100 %**; etiqueta `v23` (y `v22` conservada para volver atrás) |
| Verificación | Rutas nuevas 200 y `/admin/mint` 404; calendario autenticado con 50 habitaciones y 88 días; etiquetas MANTENIMIENTO/SERVICIO servidas y «Fuera de servicio» ausente |

Sin defecto en el canario esta vez, así que no hubo que reconstruir ni retirar revisiones.
Detalle en `despliegue_gcp.md` §43.

---

## 42. Plataforma inicializada desde cero (2026-10-05) · `@asistenteProyecto`

**Objetivo del responsable:** base off-chain limpia para arrancar el recorrido de casos de uso, **sin**
reiniciar los servicios globales (Foundry/Anvil y PostgreSQL/Cloud SQL).

**Hecho.** Respaldo verificado (backup nativo `1791211892354` + export
`gs://hotel-mcp-backups/pre-reset-20261005_145308.sql`), borrado de **36 tablas** operativas y
conservación de **8** (operadores y catálogos/semillas), con los **dos checkpoints del worker fijados a
la cabeza de la cadena (479)** para que no reindexe el pasado.

| | Antes | Después |
|---|---|---|
| Habitaciones | 50 | **0** |
| Noches (`nfts`) | 95 | **0** |
| Ventas (`sale_events`) | 91 | **0** |
| Operadores | 2 | **2** (conservados) |
| Catálogos y planes | tipos 3 · servicios 8 · espacios 6 · lencería 4 · planes 1 | **intactos** |

**Verificación:** conteos a cero tras 90 s (el worker no repuebla), `lag 0` en cadena y agregados,
login E2E con TOTP correcto y catálogos servidos por la API.

**Tres hallazgos documentados en detalle en `despliegue_gcp.md` §44:**
1. el job documentado `hotel-mcp-inject-data` **no tiene red** y no alcanza la base privada: se creó
   `hotel-mcp-reset-all` con VPC;
2. `TRUNCATE … CASCADE` habría borrado `preventive_plans`; el reset usa **`DELETE` ordenado**, con el
   orden validado por una prueba contra `base_datos.sql`;
3. el worker se declara `down` por `emailDegraded` (`SMTP_HOST=smtp.invalid`), condición **previa**
   (revisión del 2026-10-03) y ajena al reset.

**Artefactos nuevos:** `packages/shared/src/db/reset-plan.ts` (+ prueba), `packages/shared/scripts/reset-all.ts`
(seco por defecto, `--apply`) y el comando `reset:all`.

---

## 43. `@planta`: esquema de habitaciones inyectado (2026-10-05) · `@inyectaDatos`

**Petición del responsable**: analizar la estructura del alta de habitación y crear un script
(**`@planta`**, exclusivo de este proyecto) que poblara la planta: por planta 3 dobles para familias
pequeñas, 2 suites de lujo para ejecutivos y 5 simples para parejas, con **TV y aire acondicionado en
todas**, usando las imágenes de `docs/imagenes` por tipo y rellenando el texto que faltaba.

**Decisiones acordadas** (5 respuestas): las plantas son **1, 2, 3 y 4** (se incluyó el 2.º); los
servicios que el catálogo **no** sabe codificar (servicio a la habitación, escritorio de trabajo,
jacuzzi, iluminación graduable) van **redactados en la descripción**; «vista a la piscina» se
representa con `viewKind = GARDEN`; y los precios son **0,06 ETH (simple) · 0,10 ETH (doble) ·
0,80 ETH (suite)**, todas en `DRAFT` para que publicar forme parte del recorrido de casos de uso.

**Resultado (verificado en producción):** **40 habitaciones** (101–110, 201–210, 301–310, 401–410) ·
12 dobles · 8 suites · 20 simples, cada una con sus servicios, espacios, descripciones en es/en/ru y
su **foto registrada en `room_images`** (`is_cover`) y servida por `/api/rooms/images/<fichero>`.

**Dos hallazgos operativos** (detalle en `BaseOperaciones/estado_inyeccion.md`):
1. el alta en ráfaga devuelve **429 del límite del borde (WAF)**; el script reintenta con retroceso,
   pero lo decisivo fue **consultar primero el listado** para no gastar cuota en altas que ya existen;
2. las fotos **se sirven desde el contenedor**: además de la fila off-chain, los 40 ficheros quedan en
   `docs/imagenes/` del repositorio para que viajen en la imagen de la web (garantía entre instancias).

**Artefactos**: `scripts/planta.ts`, `RepoTecnico/BaseOperaciones/estructura_datos.md` (entidades,
relaciones y diagrama Mermaid del alta) y el estado de inyección actualizado.

### Despliegue (release v25) — las fotos, dentro de la imagen

El canario de la `v24` destapó un **defecto previo**: `.dockerignore`/`.gcloudignore` excluían `docs`, y
las fotos (habitación y contenido) viven en `docs/imagenes` → **todas daban 404** en una instancia nueva,
incluidas las semilla. Corregido quitando `docs` de ambas listas (Docker no permite re-incluir una
subcarpeta de una carpeta excluida) y desplegado como **`v25`** (`hotel-mcp-web-00036-zox` al 100 %):
**40/40 fotos servidas en la URL pública**, más las tres semilla. Detalle en `despliegue_gcp.md` §45.

### Despliegue (release v26) — procedencia limpia

Tras el `/push` (`0e3f931` en los tres remotos), se reconstruyó la web para que la imagen quedara
anclada a un SHA: **`v26`** (`hotel-mcp-web-00039-wiz` al 100 %), con `v25` conservada como vuelta
atrás. Verificado en producción: **40/40 fotos servidas**, `/health/ready` READY y las **40
habitaciones** intactas (12 dobles · 8 suites · 20 simples). Detalle en `despliegue_gcp.md` §46.

### Despliegue (release v27) — la foto de la habitación en el catálogo

El catálogo pintaba un **placeholder por tipo** (`/images/<tipo>.svg`) en vez de la foto de la
habitación. Corregido resolviendo la portada por **número** de habitación (`listCoverImagesByRoomNumbers`),
con `withCoverUrls` (puro, probado) y una cadena de degradación foto real → imagen de tipo → aviso, que
**nunca** enseña la foto de otra habitación. Suite: web **683/683** · shared **457/457** · typecheck y
eslint limpios. Release **`v27`** (`hotel-mcp-web-00041-xok` al 100 %, `v26` como vuelta atrás):
verificado en producción que el HTML pasa de **2 placeholders a 0** y sirve
`/api/rooms/images/101-Doble-2026-10-05-1.jpg`. Detalle en `despliegue_gcp.md` §47.

### Ciclo de verificación (releases v28 y v29) — reserva, frontend y Anvil

La reserva funcionaba por API pero **no en el navegador**: la CSP del middleware no permitía el RPC
del despliegue (Anvil en Cloud Run), así que el navegador rechazaba la conexión y el flujo de reserva
—que depende de la wallet— fallaba en silencio. Corregido derivando los orígenes del RPC del entorno
(`v28`). Verificado con Chromium real: **0 errores de CSP**, 6 páginas 200, cartera conectada al Anvil
real y retención pública completada (201 + instrucciones de anticipo), además de reserva desde el panel
del día («1 reservas creadas»). Apareció y se corrigió también una traducción ausente del menú
(`admin.nav.publishBoard`) con su guardián (`v29`). Detalle en `despliegue_gcp.md` §48–§49.

### Quema programada: revisada y **ejecutándose** (2026-10-05)

El worker desplegado **no tenía ninguna variable de quema**, así que el planificador diario
(`burnExpired`, 12:00 Europe/Madrid) **nunca arrancaba**. Se concedió `BURNER_ROLE` a la hot-wallet
documentada (cuenta 2, tx `0x10a4fcff…`, bloque 486), se guardó su clave en el secreto
`hotel-burner-private-key` (con IAM para la SA del worker) y se activó el planificador. Verificado en
producción: **ciclo ejecutado** a las 19:42:44 (`reason: NO_TOKENS`, sin caducadas pendientes) y modo
**diario** restaurado. De paso se descubrió que el tráfico del worker estaba **fijado por nombre de
revisión**, así que las revisiones nuevas se retiraban al instante: corregido a `latestRevision`.
Detalle en `despliegue_gcp.md` §52 y `BaseOperaciones/cuentas_anvil.md`.

### Cartera: cualquier billetera + optimización de MetaMask (2026-10-05)

**Petición**: que el proyecto funcione con **cualquier** cartera y optimizar los procesos de MetaMask.

**Antes**: `providers.tsx` registraba un único `injected()` y `useOnboarding.connect()` creaba un
`injected()` **nuevo en cada clic** — sólo funcionaba la cartera que ocupara `window.ethereum`, se
ignoraban las demás instaladas y MetaMask volvía a pedir permisos en cada intento.

**Cambios**:
| Cambio | Efecto |
|---|---|
| `multiInjectedProviderDiscovery: true` (EIP-6963) | wagmi descubre **todas** las carteras inyectadas (MetaMask, Rabby, Coinbase, Brave…) y cada una es un conector con su nombre e icono: sirve cualquiera |
| `injected({ shimDisconnect: true })` | si el usuario desconecta desde la extensión, la web no se queda en «conectada» (sesión fantasma) |
| `connect()` usa el conector **ya configurado** (prefiere MetaMask, si no el primero disponible) | no se re-instancia el conector por clic y se evitan peticiones de permiso repetidas |
| `http(rpcUrl, { batch: true, retryCount: 2 })` | agrupa las lecturas del mismo tick (multicall) y tolera un fallo puntual del RPC |
| `pollingInterval: 12_000` (antes 4 s por defecto) | menos sondeos de saldo/red a la cartera (MetaMask los reenvía al RPC) sin perder frescura |

**Ya cubierto** (no se tocó): el alta de la red en la cartera cuando no la conoce (`switchChain` de
wagmi dispara `wallet_addEthereumChain`; el error 4902 se clasifica en `switchChainError.ts` con su
test), y la CSP ya permitía los dominios de WalletConnect por si más adelante se añade ese conector.

**Verificado**: `tsc --noEmit` y `eslint` limpios. **Pendiente**: build + despliegue (v36) y prueba en
navegador con dos carteras distintas (la inyectada de prueba y una segunda vía EIP-6963).

---

## 10. Cambio de alcance (2026-10-06): suite de recepción y ciclo de vida de la habitación

Se recibe petición del cliente para modificar la suite de recepción:

1. **Post-check-out**: la habitación debe pasar a estar **indispuesta** para limpieza y cambio de lencería,
   y solo volver a disponible cuando se libere explícitamente.
2. **Estado de las habitaciones**: convertir la subsección en un resumen interactivo donde, al seleccionar
   una habitación, se despliegue una **ficha detalle** con zona Habitación y zona Huésped, mostrando
   información distinta según el estado (Reservada, Ocupada, Mantenimiento, Libre).

**Documentación afectada**:
- `RepoTecnico/requerimientos.md` §6: RF-50…RF-55 detallados con las decisiones del cliente.
- `RepoTecnico/diccionario_datos.md`, `RepoTecnico/diagrama_er.md`, `RepoTecnico/base_datos.sql`:
  actualizados de forma sincronizada: nuevo estado `PENDING_CLEANING`, catálogo `room_cleaning_checklist_items`,
  tabla `room_cleaning_checklists` y contadores de ocupación en `reservations`.
- Fuente de verdad `packages/shared/src/db/migrator.ts`: migraciones incrementales añadidas.
- Casos de uso `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/`: CU-31 y CU-34 requerirán revisión;
  se crearán CU-38 (liberar habitación) y CU-39 (ficha detalle de habitación) si procede.

**Decisiones cerradas con el cliente**:
- Estado post-check-out: `PENDING_CLEANING`; recepción libera manualmente a `CLEAN`.
- Checklist fijo de 6 ítems; obligatorios excepto `SPECIAL_REQUESTS`.
- Datos de huéspedes: contadores en `reservations`; wallet = `nfts.current_owner`.
- Calendario ocupado: rango completo de la reserva con iconos por fecha.
- Mantenimiento: descripción del incidente abierto.

**Implementación realizada**:
- `packages/shared/src/db/migrator.ts`, `RepoTecnico/base_datos.sql`: nuevo estado `PENDING_CLEANING`,
  catálogo `room_cleaning_checklist_items`, tabla `room_cleaning_checklists`, contadores en `reservations`.
- `packages/shared/src/db/reset-plan.ts`: clasificadas las nuevas tablas en el plan de reset.
- `packages/shared/src/reception/day-board.ts`: nuevo estado `PENDIENTE_LIMPIEZA` y prioridad del estado
  operativo sobre el estado de la noche.
- `packages/shared/src/db/repositories/reception.repository.ts`: checkout deja la habitación en
  `PENDING_CLEANING`; nuevo método `releaseRoom` y `getOperationalStatusByRoom`.
- `apps/web/src/app/api/reception/overview/route.ts`: usa el estado operativo para el panel del día.
- `apps/web/src/app/api/reception/rooms/[roomNumber]/route.ts`: endpoint de ficha detalle con zona
  habitación (checklist, mantenimiento, calendario) y zona huésped (ocupación + wallet).
- `apps/web/src/app/api/reception/rooms/[roomNumber]/release/route.ts`: endpoint para liberar habitación.
- `apps/web/src/components/reception/DayBoard.tsx`, `ReceptionDashboard.tsx`, `RoomDetailPanel.tsx`:
  rejilla clickeable y ficha detalle.
- `apps/web/src/components/reception/ReservationsAdmin.tsx`,
  `apps/web/src/app/api/reception/reservations/route.ts`,
  `packages/shared/src/db/repositories/reservations.repository.ts`: formulario de reserva incluye
  adultos, niños, bebés, mascotas y acceso PMR.
- Traducciones ES/EN/RU para los nuevos textos.

**Verificación**:
- `pnpm typecheck`: 6/6 OK.
- `pnpm --filter @hotel/shared test -- reception/day-board.test.ts`: 6/6 OK.
- `pnpm --filter @hotel/shared test -- db/repositories/reception.repository.test.ts`: 10/10 OK.
- `pnpm --filter @hotel/shared test -- db/reset-plan.test.ts`: 5/5 OK.
- `pnpm --filter @hotel/web test -- src/app/api/reception/reception-v2.test.ts`: 13/13 OK.

**Casos de uso actualizados**:
- `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-31-panel-dia-recepcion.md`: rejilla
  clickeable, ficha detalle y contador de pendientes de limpieza.
- `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md`: post-check-out pasa a
  **Pendiente de limpieza** en lugar de Salida.
- `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-38-liberar-habitacion.md`: nuevo CU para
  liberar habitación.
- `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-39-ficha-detalle-habitacion.md`: nuevo CU
  para la ficha detalle por estado.

**Despliegue (release v36) — suite de recepción actualizada (2026-10-06)**

- Push a los tres remotos (`origin`, `github`, `codecrypto`) en rama `Hotel-DSH-GCP`: commit
  `f6fbf3e`.
- Cloud Build: imagen `europe-west1-docker.pkg.dev/hotel-mcp/hotel-mcp/web:v36` construida con éxito.
- Cloud Run: revisión `hotel-mcp-web-00063-put` desplegada con etiqueta `v36` y tráfico al **100 %**.
- Health check de la revisión v36: `200 READY` (postgres, redis y polygonRPC UP).
- URL de producción: https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app
- URL directa de v36: https://v36---hotel-mcp-web-d6jlzeq5yq-ew.a.run.app

**Despliegue complementario (release v36) — worker y MCP (2026-10-06)**

- Cloud Build: imágenes `worker:v36` y `mcp:v36` construidas con éxito.
- Cloud Run:
  - Worker: revisión `hotel-mcp-worker-00013-qvg` al **100 %**.
  - MCP: revisión `hotel-mcp-mcp-00005-tnl` al **100 %**.
- Web redeployada (`hotel-mcp-web-00063-put`) apuntando a las URLs canónicas de worker y MCP.
- URLs de servicio:
  - Web: https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app
  - Worker: https://hotel-mcp-worker-d6jlzeq5yq-ew.a.run.app
  - MCP: https://hotel-mcp-mcp-d6jlzeq5yq-ew.a.run.app

**Verificación del «404 incrustado» en `/recepcion` (2026-10-06)**: **falso positivo, sin defecto**. El
texto `404 This page could not be found.` que reportó la verificación aparece **solo dentro de las
etiquetas `<script>`** del *flight payload* RSC, donde Next.js serializa la definición por defecto de la
frontera `notFound` de cada segmento del router. Confirmado: las páginas públicas (`/`, `/catalogo`,
`/contacto`) contienen el mismo texto en su payload; las ocurrencias en el marcado renderizado son **0**;
el estado es **200** y el `<h1>` se sirve correctamente. No se modificó ningún fichero para «corregirlo».

**Redespliegue de la release v36 (2026-10-06)**: sin cambios de código respecto a `f6fbf3e`; se
redesplegaron las imágenes `v36` ya construidas. Sirviendo al 100 %: web `hotel-mcp-web-00063-put`
(tag `v36`), worker `hotel-mcp-worker-00014-lq2` y mcp `hotel-mcp-mcp-00005-tnl`. `/health/ready` 200
READY y `/recepcion` 200. En el mismo push se publicó la documentación de la propuesta vNext
(commit `e247bf2`).

**Ficha detalle guiada por estado (2026-10-06)**: se revisó la ficha contra la especificación del cliente y
se corrigieron tres carencias reales:

1. **La API no devolvía `state`** (el contrato lo documentaba). Ahora `GET /api/reception/rooms/:n`
   calcula y devuelve `state` ∈ `LIBRE | RESERVADA | OCUPADA | MANTENIMIENTO | PENDIENTE_LIMPIEZA`.
2. **La ocupación se leía de `reservations.status`**, que solo admite `PENDING|CONFIRMED|CANCELLED|
   NO_SHOW|COMPLETED`; el check-in vive en `nfts.status` (`CHECKED_IN`). Una habitación ocupada podía
   quedarse sin calendario. Ahora la ocupación se deriva de la **noche de hoy** (`reservation_nights` +
   `nfts`) y del estado operativo.
3. **La ficha no era dependiente del estado**: mostraba checklist + calendario + huésped a la vez. Ahora
   la Zona Habitación se renderiza según `state` (calendario solo en OCUPADA, descripción solo en
   MANTENIMIENTO, checklist en RESERVADA/LIBRE/PENDIENTE_LIMPIEZA) y los cuatro iconos del calendario se
   muestran **siempre**, en color si la acción se realizó y apagados si no.

El criterio de estado se extrajo a la función pura `resolveRoomDetailState()` en
`packages/shared/src/reception/day-board.ts`, con 6 pruebas unitarias (12 en total en el archivo).
**Sin cambios de esquema**: las tablas y columnas ya existían y se verificaron contra producción, por lo
que `diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` no requieren edición.

**Release v37 y hallazgo del pin de tráfico (2026-10-06)**: desplegada la ficha detalle por estado
(commit `c8b4792`). Al verificar se descubrió que **web y mcp servían revisiones antiguas**: el tráfico
estaba pinnado por revisión (patrón de §56 de `despliegue_gcp.md`), así que las revisiones nuevas quedaban
al 0 % aunque `gcloud run deploy` informara de «serving 100 percent». La verificación previa de la v36
(health + esquema) fue **insuficiente** porque el health lo servía una revisión antigua sana y el esquema
lo aplica el worker, que sí se desplegó bien.

Tras mover el tráfico explícitamente, sirven al 100 %: web `hotel-mcp-web-00044-dnw` (tag `v37`),
worker `hotel-mcp-worker-00015-64w` y mcp `hotel-mcp-mcp-00008-kps`. La comprobación concluyente ahora
incluye inspeccionar los *bundles* servidos: los cuatro marcadores exclusivos de v37
(`room-detail-state`, `preArrivalHint`, `calendarEmpty`, `pendingCleaningHint`) pasan de 0 a 1.

**Próximo paso**: añadir tests E2E/UI de la ficha detalle y de la liberación; confirmar con el cliente el
comportamiento observado en producción.

---

## 11. Propuesta vNext — Suite de Operaciones: Mantenimiento + Ama de llaves (2026-10-06) · `@asistenteProyecto`

**Solicitud del cliente**: incorporar en una siguiente versión de la plataforma:
1. Un **Jefe de Mantenimiento** que resuelva solicitudes de mantenimiento de habitaciones, plan de mantenimiento de infraestructura (piscina, bomba de agua, plomería, electricidad, etc.) y mantenimiento rutinario de áreas comunes (recolección de desechos sólidos, jardines, etc.).
2. Un **Ama de llaves** que coordine las actividades de las mucamas, supervise el estado de limpieza y suministro de habitaciones, revise cada habitación tras la limpieza (check-out o servicio diario) y notifique mantenimiento o cargos a la habitación por daños del huésped.
3. **Acceso on-chain** para que ambos operadores firmen movimientos en su plataforma, analizando cuáles son obligatoriamente con wallet y cuáles no.

**Estado**: propuesta de Fase 1 (Concepto) generada y aislada en `RepoTecnico/propuesta_vNext/`. **No se modifica código, contratos ni esquema actual.**

### Artefactos generados

| Artefacto | Ubicación | Estado |
|---|---|---|
| Requerimientos | `RepoTecnico/propuesta_vNext/requerimientos.md` | ✅ Completo |
| Diccionario de datos | `RepoTecnico/propuesta_vNext/diccionario_datos.md` | ✅ Sincronizado |
| Diagrama ER | `RepoTecnico/propuesta_vNext/diagrama_er.md` | ✅ Sincronizado |
| Script SQL | `RepoTecnico/propuesta_vNext/base_datos.sql` | ✅ Ejecutable e idempotente |
| Entornos globales | `RepoTecnico/propuesta_vNext/entornos_globales.md` | ✅ Completo |

### Decisiones clave de la propuesta

- Se crea un **contrato auxiliar `HotelOperations.sol`** para los eventos on-chain de mantenimiento, inspecciones y cargos por daños; el contrato `HotelNights.sol` actual **no se modifica**.
- Los **jefes** (`HEAD_MAINTENANCE`, `HEAD_KEEPER`) conectan wallet y firman; los **subordinados** (técnicos y camareras) usan sesión tradicional sin wallet.
- **Firma on-chain obligatoria** para:
  - Bloqueo/desbloqueo de habitación por mantenimiento.
  - Certificación de inspección post-limpieza.
  - Cargo por daños a habitación.
- **Firma on-chain obligatoria** para verificación de tareas preventivas críticas: **Filtro/Bomba de Piscina, Bomba de Agua, Ascensor, Generador Eléctrico**.
- **Sin firma on-chain** para: apertura de tickets, asignaciones, estados intermedios, configuración y mantenimiento rutinario de áreas comunes.

### Decisiones confirmadas por el cliente (2026-10-06)

| # | Decisión | Implicación |
|---|---|---|
| D-C1 | Jefe de Mantenimiento y Ama de llaves son **roles separados** con wallets diferentes | Dos roles on-chain separados y dos wallets |
| D-C2 | Técnicos/camareras usan **terminales fijos sin wallet** | Autenticación tradicional; solo se asocia tarea a personal |
| D-C3 | Áreas críticas con firma obligatoria: Filtro/Bomba Piscina, Bomba de Agua, Ascensor, Generador Eléctrico | Semilla de `maintenance_area_types` con `is_critical = TRUE` |
| D-C4 | Cargos por daños se imputan al **noche/token vendido** | `housekeeping_damage_charges.token_id` → `nfts(token_id)` |
| D-C5 | Inspección de limpieza se registra **por habitación en general** | `housekeeping_inspections.room_id` como FK principal |
| D-C6 | El Jefe de Mantenimiento **siempre firma él mismo** en operación normal; en emergencia, la **wallet del Owner/Administrador** actúa como respaldo/custodia compartida | `DEFAULT_ADMIN_ROLE`/`owner` tiene capacidad de firma de emergencia para operaciones críticas de mantenimiento |

### Decisión de auditoría resuelta (2026-10-06)

| # | Decisión | Implicación |
|---|---|---|
| D-C13 | Wallet de respaldo/custodia compartida = **wallet del Owner/Administrador** | `operator_wallets.role = 'OWNER_BACKUP'` para emergencias de `HEAD_MAINTENANCE` |

### Decisiones técnicas resueltas (2026-10-06)

| # | Decisión | Implicación |
|---|---|---|
| D-C7 | Prioridad: **definir bien el alcance** antes de fechas/presupuesto | Propuesta permanece en Fase 1 hasta aprobación |
| D-C8 | El Ama de llaves **no bloquea** habitaciones por limpieza | Solo abre ticket al Jefe de Mantenimiento |
| D-C9 | Tras inspección aprobada, la venta **no se libera automáticamente** | Recepción/Admin activa la publicación manualmente |
| D-C10 | Técnicos/camareras usan **PIN corto** en terminal fijo | Tabla `terminal_operators` con `pin_hash` (bcrypt) |
| D-C11 | Cargo por daños es **nota interna** cobrada en el **check-out** | Se suma al folio/estado de cuenta de la estancia |
| D-C12 | Foto/evidencia es **opcional pero recomendada** | El sistema advierte si falta, pero no bloquea |
| D-C14 | El huésped es **notificado del cargo por daños** con evidencia e importe; tiene plazo para reclamar antes del check-out | Tabla `damage_charge_guest_notifications`; canal email/Telegram/web; cobro en check-out si no reclama |
| D-C15 | La **inspección mantiene firma on-chain** aunque no libere venta; la liberación manual por Recepción/Admin puede firmarse o no según política interna | `housekeeping_inspections.signature_id` obligatoria; liberación con firma opcional configurable |
| D-C16 | Firmas **EIP-712 off-chain** verificadas criptográficamente en BD y comprobadas contra snapshot de roles | `on_chain_signatures`: `nonce`, `domain_hash`, `recovered_signer`, `verified_at`, `role_snapshot`; estado `SIGNED` exige firma válida |
| D-C17 | Política de PIN completa | 4-6 dígitos, bcrypt, bloqueo tras 5 fallos, rotación 90 días, PIN de un solo uso inicial, timeout de sesión 5 min |
| D-C18 | Política de resiliencia de anclaje | Backoff exponencial, máx. 8 reintentos, TTL 24 h, estado `PENDING_ANCHOR`, bloqueo de nueva acción sobre la entidad pendiente |
| D-C19 | Política de privacidad/GDPR de la notificación | Datos mínimos, fotos cifradas con retención 90 días, base contractual, canal preferido, derecho de acceso/supresión |
| D-C20 | Áreas críticas desglosadas en tipos específicos | `POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR` con `is_critical = TRUE` |
| D-C21 | Auditoría completa de acciones off-chain | Tabla `operator_audit_log` (actor, rol, entidad, acción, valores, terminal, timestamp) |
| D-C22 | Gobernanza de feature flags | Solo Owner con TOTP + auditoría; desactivar flags obligatorios exige firma on-chain del cambio |
| D-C23 | Alcance on-chain confirmado | Firma **obligatoria** en bloqueo/desbloqueo de habitación y cargos por daños; **opcional** en inspección; se crea `HotelOperations.sol` sin tocar `HotelNights.sol` |
| D-C24 | Soporte = Administrador (Owner) | Lectura de cola de anclajes y terminales; recuperación de PIN; escalado de firmas fallidas y caída de RPC |
| D-C25 | Backup/recuperación | RPO 1 h, RTO 4 h, dump diario + WAL/PITR, evidencias replicadas, retención 30 d + 12 m |
| D-C26 | Rendimiento medible | Tablero p95 < 500 ms; listados p95 < 800 ms (pág. 50); firma p95 < 5 s; 20 usuarios / 50 habitaciones / 90 días |
| D-C27 | Cargo por daños **sin firma on-chain** | Solo auditoría off-chain; firma obligatoria on-chain limitada a bloqueo/desbloqueo de habitación (ajusta D-C23) |
| D-C28 | Accesibilidad: solo usabilidad móvil | Sin estándar formal WCAG; buenas prácticas básicas (riesgo aceptado) |
| D-C29 | Usabilidad de terminales | ≤ 30 s/tarea, ≤ 3 toques, idioma del operario, botones amplios, confirmación visual+sonora |
| D-C30 | Terminales sin modo offline | Bloqueo optimista, degradación graceful ante caída de Redis/PostgreSQL |
| D-C31 | Cumplimiento y auditoría | Retención 5 años, append-only con hash encadenado, exportación de evidencias |
| D-C32 | Criterios observables de firma | Icono ⛓, etiqueta, `data-testid`, botón disabled sin wallet, modal de previsualización |
| D-C33 | Alerta de suministros | Umbral configurable (20 % por defecto), notificación al Ama de llaves, recordatorio diario, cierre automático al reponer |
| D-C34 | Firmas por tipo (sin "recomendada") | Resolver incidencia: no; preventivo crítico: obligatorio; preventivo no crítico: no; flags solo dev/test |
| D-C35 | Permisos del técnico de mantenimiento | Solo sus incidencias/tareas y áreas; sin importes, huéspedes, cargos, config ni firma |
| D-C36 | El técnico puede reportar incidencias | Vocabulario `RECEPTION`, `HEAD_KEEPER`, `HOUSEKEEPER`, `HEAD_MAINTENANCE`, `MAINTENANCE_TECH` con CHECK en SQL |
| D-C37 | Permisos de Recepción | Reporta incidencias, publica/despublica venta y resuelve reclamaciones; sin firma on-chain |
| D-C38 | Validación de subordinados | SLA 24 h, estado `PENDING_VERIFICATION_EXPIRED`, escalado al Administrador |
| D-C39 | Contrato inmutable con evento genérico | `OperationalAction(actionType, entityId, payloadHash, signer, timestamp)`; sin proxy ni redeploy al añadir tipos |
| D-C40 | Ruta `/ama-de-llaves` con redirección desde `/housekeeping` | No rompe enlaces existentes; la UI la llama "Ama de llaves" |
| D-C41 | Informes/notificaciones = propuesta del equipo | `RF-M-11`, `RF-M-12`, `RF-K-10` quedan en prioridad baja para Fase 2 |
| D-C42 | Autenticación de jefes | Contraseña + TOTP; wallet desacoplada solo para firmar EIP-712 |

### Modelo de datos resumido

- Nuevas tablas: `operator_wallets`, `on_chain_signatures`, `maintenance_area_types`, `maintenance_areas`, `maintenance_area_tasks`, `maintenance_area_logs`, `housekeeping_inspections`, `housekeeping_damage_charges`.
- Tablas extendidas: `admin_users` (nuevos roles), `maintenance_incidents`, `preventive_plans`, `preventive_tasks`, `rooms`, `additional_charges` (vía FK), `nfts` (vía `housekeeping_damage_charges.token_id`).
- Nuevas tablas adicionales: `terminal_operators` (PIN de terminales fijos), `damage_charge_guest_notifications` (notificación al huésped), `operator_audit_log` (auditoría off-chain).

### Estado de auditoría (2026-10-06)

- Informe: `RepoTecnico/propuesta_vNext/INFORME_AUDITORIA_VNEXT_V1.md` (con **Anexo A — Estado de resolución**)
- Veredicto inicial: **NO LISTA** para Fase 2
- Hallazgos: 3 CRÍTICOS, 19 ALTOS, 13 MEDIOS, 4 BAJOS
- **Resueltos: 39/39 hallazgos** (3 CRÍTICOS, 19 ALTOS, 13 MEDIOS, 4 BAJOS) mediante las decisiones D-C13…D-C42.
- **Veredicto final: APTA para Fase 2** (pendiente de validación del cliente).

### Decisiones de auditoría resueltas (2026-10-06)

| # | Decisión | Implicación |
|---|---|---|
| D-C13 | Wallet de respaldo = wallet del Owner/Administrador | `operator_wallets.role = 'OWNER_BACKUP'` (H-13) |
| D-C14 | Notificación al huésped con evidencia, importe y plazo de reclamación | `damage_charge_guest_notifications` (H-36) |
| D-C15 | La inspección no libera venta | Firma certifica revisión (H-06) |
| D-C16 | Firma EIP-712 off-chain verificada criptográficamente + snapshot de roles | Campos de verificación en `on_chain_signatures` (H-10) |
| D-C17 | Política de PIN completa | 4-6 dígitos, bcrypt, 5 fallos, 90 días, 1 uso, 5 min (H-01) |
| D-C18 | Resiliencia de anclaje | Backoff, 8 reintentos, TTL 24 h, `PENDING_ANCHOR` (H-07) |
| D-C19 | Privacidad/GDPR | Datos mínimos, fotos cifradas, retención 90 d (H-15) |
| D-C20 | Áreas críticas desglosadas | `POOL_FILTER`, `WATER_PUMP`, `ELEVATOR`, `ELECTRIC_GENERATOR` (H-02) |
| D-C21 | Auditoría off-chain completa | `operator_audit_log` (H-12/H-14) |
| D-C22 | Gobernanza de feature flags | Solo Owner + TOTP; desactivar obligatorios exige firma (H-11) |
| D-C23 | Alcance on-chain | Bloqueo/cargos obligatorios; inspección opcional; `HotelOperations.sol` (H-31/H-32) |
| D-C24 | Soporte = Administrador | Cola/terminales y escalado (H-37) |
| D-C25 | Backup/recuperación | RPO 1 h, RTO 4 h, PITR (H-18) |
| D-C26 | Rendimiento medible | p95 y escenario de carga (H-23) |

**Próximo paso**: con los 39 hallazgos resueltos, validar el alcance con el cliente y pasar a **Fase 2** (casos de uso Gherkin/EARS + trazabilidad, gráficos y documento técnico).

---

### Fase 2 — Casos de uso, gráficos y documento técnico (2026-10-06)

**Artefactos generados:**

| Artefacto | Ruta | Contenido |
|---|---|---|
| Casos de uso | `RepoTecnico/propuesta_vNext/casos_uso.md` | 45 CU-V, 204 escenarios Gherkin, postcondiciones, trazabilidad |
| Gráficos | `RepoTecnico/propuesta_vNext/casos_uso/` | Diagramas UML, 8 secuencias, 6 máquinas de estados |
| Documento técnico | `RepoTecnico/propuesta_vNext/documento_tecnico.md` | Rev. 1.1.0 · 11 secciones + anexos |

**Auditorías ejecutadas:**

| Auditoría | Hallazgos | Estado |
|---|---|---|
| Casos de uso | 20 (2 CRIT, 3 ALTA, 12 MEDIA, 3 BAJA) | ✅ 20/20 corregidos |
| Documento técnico | 18 (2 CRIT, 5 ALTA, 10 MEDIA, 1 BAJA) | ✅ 18/18 corregidos |

**Decisión de vocabulario (Opción A):** el SQL es la fuente de verdad. Estados canónicos aplicados a SQL, diccionario, diagrama ER, casos de uso y requerimientos.

**Arquitectura adoptada tras la auditoría técnica:**
- Firma **meta-transacción/relayer EIP-712**: el contrato verifica la firma y emite `signer = recovered_signer` (nunca `msg.sender`); la hot wallet del worker **no** tiene roles.
- Acción `CONFIG` (solo `DEFAULT_ADMIN_ROLE`) y respaldo `OWNER_BACKUP` con `backup_for_role` on-chain.
- `entityId = keccak256(actionType ‖ uuid16)`; `deadline` + `consumed_at` + índice único `(signer_address, nonce)`.
- Cola de anclaje = **outbox transaccional PostgreSQL**; **sin reconciliador de reorgs** (ADR-18, coherente con ADR-10/QBFT).
- Riesgos nuevos: R-13 (SPOF worker), R-14 (custodia de claves), R-15 (GDPR supresión vs retención).

**Gráficos regenerados (rev. 1.1.0):** 17 bloques Mermaid validados con `mermaid.parse` (17/17 OK); vocabulario canónico aplicado; corregida la modelización de reorgs en CU-V-43 (coherente con ADR-10/ADR-18).

**Coherencia final verificada:**
- Vocabulario canónico en SQL, diccionario, diagrama ER, casos de uso, gráficos, requerimientos y documento técnico.
- Recuentos: **12 tablas nuevas** + **5 tablas extendidas** (44 → 56 tablas).
- Fences Mermaid balanceados en todos los archivos.
- SQL: 12 `CREATE TABLE` + 26 `ALTER TABLE`, idempotente (necesita verificación con `psql`, no disponible en el entorno).

**Estado de la Fase 2: CERRADA.** Artefactos listos para validación del cliente antes de pasar a Fase 3 (desarrollo).

---

### Fase 3 — Plan de desarrollo vertical (2026-10-06)

**Decisión del cliente:** *solo el plan* — no se modifica código, contratos ni base de datos del sistema.

**Artefacto:** `RepoTecnico/propuesta_vNext/plan_desarrollo.md` (759 líneas)

- **10 ciclos verticales F1–F10**, cada uno con entregable demostrable, tareas con rutas reales del monorepo, RF/RNF + CU-V, migración, pruebas/gates, riesgos y dependencias.
- **Esfuerzo total: 77 días-persona** (~15–16 semanas secuencial, ~13 con solapes).
- **Primer ciclo:** F1 — Fundaciones (esquema vNext + auditoría append-only), 4 días.
- **Ruta crítica:** F1 → F2 → F3 → F4 → F6 → F7 → F10.
- Criterios globales A1–A14 y decisiones pendientes D1–D12.
- **D7/T1.2 resueltos:** se reordenó `base_datos.sql` para crear `operator_audit_log` antes de `housekeeping_damage_charges` (dependencia FK).

**Decisiones D1–D12 resueltas (2026-10-06):**

| # | Resolución |
|---|---|
| D1 | Canal de notificación al huésped = **email** (web de respaldo); plazo 24 h antes del check-out |
| D2 | `INSPECTION_REQUIRES_SIGNATURE = false` |
| D3 | **Retirar** roles heredados `HOUSEKEEPING`/`MAINTENANCE`; re-crear usuarios |
| D4 | Wallet **autocustodiada** por el jefe; el sistema nunca ve la clave |
| D5 | **Safe multisig 2-de-3** como `DEFAULT_ADMIN_ROLE` |
| D6 | Tope de cargo = **3× tarifa de la noche**; por encima aprueba el Administrador |
| D7 | ✅ Orden FK corregido en `base_datos.sql` |
| D8 | Sincronización manual validada por el **guardián** ampliado a `base_datos.sql` |
| D9 | **Redirecciones** `/admin/mantenimiento` → `/mantenimiento` y `/admin/housekeeping` → `/ama-de-llaves` |
| D10 | Aceptación **solo en Anvil**; Besu en fase posterior |
| D11 | Validación SQL en CI con `psql` (PostgreSQL **16**) |
| D12 | B-4/B-5/B-6 desacoplados; **MetaMask**; sin PMS; sin SIWE |

**Estado:** plan y decisiones cerrados. La implementación **no está autorizada** en esta entrega (el cliente pidió solo la propuesta).

---

## 12. UI — formularios y fichas flotantes en las suites de personal (2026-10-06) · `@asistenteProyecto`

**Solicitud del cliente**: en las suites de **Admin, Mantenimiento, Recepción y Ama de llaves**, todos
los formularios y fichas deben ser **flotantes**, con estructura de **título**, **cuerpo** y **pie** con
los botones según el caso.

### Infraestructura compartida

Se promovió el diálogo que solo usaba la sección Habitación a un componente común:

| Artefacto | Ruta | Qué aporta |
|---|---|---|
| `ModalShell` | `apps/web/src/components/ui/ModalShell.tsx` | Estructura fija **título · cuerpo · pie**; velo, cierre, ancho configurable y scroll interno |
| `useModalDialog` | `apps/web/src/components/ui/useModalDialog.ts` | Foco al abrir, trampa de foco, `Escape`, devolución del foco al disparador y bloqueo del scroll de fondo |
| `MODAL_PRIMARY` / `MODAL_SECONDARY` / `MODAL_DANGER` | `apps/web/src/components/ui/ModalShell.tsx` | Estilos de los botones del pie, para que todas las fichas se vean igual |
| Namespace `common` | `apps/web/messages/{es,en,ru}.json` | Etiquetas compartidas del pie: cancelar, cerrar, guardar, confirmar, crear… |

`admin/rooms/ModalShell.tsx` y `admin/rooms/useModalDialog.ts` se retiraron; los tres consumidores de
Habitación apuntan ya al componente compartido.

### Formularios y fichas convertidos

| Suite | Componente | Ficha flotante |
|---|---|---|
| Recepción | `RoomDetailPanel` | **Ficha detalle** de la habitación (dos zonas) |
| Recepción | `CheckInPanel` | Check-in por **QR/JWS** y por **código de recuperación** |
| Recepción | `CheckoutPanel` | **Alta de cargo** y **confirmación de salida** |
| Recepción | `ReservationsAdmin` | **Alta de reserva** |
| Recepción | `ActivitiesPanel` | **Inscripción** en actividad |
| Mantenimiento | `ReportIncidentPanel` | **Reporte de avería** |
| Ama de llaves | `HousekeepingBoard` | **Crear turno** y **reparto automático** |
| Admin | `AdminSecurity` | **Cambio de contraseña** |
| Admin | `AdminExpired` | **Quema de caducadas** |
| Admin | `system/SettingsAdmin` | **Ajustes de plataforma** |
| Admin | `system/SystemUsers` | **Alta/rotación de credenciales** |
| Admin | `maintenance/PreventiveAdmin` | **Nuevo plan preventivo** |
| Admin | `activities/ActivitiesAdmin` | **Nueva actividad** y **nuevo horario** |
| Admin | `content/ContentAdmin` | **Subir imagen** y **nuevo plan informativo** |
| Admin | `AdminRoles` | **Conceder/revocar rol** e **iniciar transferencia** de ownership |
| Admin | `AdminMint` | **Publicar noche** y **re-confirmación TOTP/MFA** |
| Admin | `housekeeping/SuppliesAdmin` | **Reposición** de un artículo |
| Admin | `reviews/ReviewsModeration` | **Moderación** de una reseña (aprobar/rechazar) |
| Admin | `rooms/*` | Alta/edición, **ficha de detalle** y publicación: botones ya en el **pie** |

Patrón: el panel muestra un resumen y un botón; la ficha flotante contiene el formulario en el **cuerpo**
y los botones en el **pie** (el botón de envío usa `form="<id>"` para no duplicar el formulario).

### Otros formularios

- **Puerta de acceso** (`CredentialForm`): el título lo aporta el contenedor y el formulario se
  reestructuró en **cuerpo** (campos) y **pie** (botones de entrar y de cambio a código de rescate),
  separados por una línea. No usa el velo de `ModalShell` porque es la pantalla de acceso, no una ficha
  sobre contenido.
- **Transacciones** (`TxModal`, compartido por Admin): ya era un diálogo flotante con título, cuerpo y
  bloque de acciones.
- Los **filtros** de listado (fecha en `DayBoard`/`MaintenanceBoard`, estado en `IncidentsAdmin`,
  selección de habitaciones en `RoomsBoardAdmin`) no son formularios de alta/edición y se dejan como
  controles en línea.

### Despliegue (release v38, 2026-10-06)

Commit `aeee4f2` publicado en los tres remotos. Imágenes `web:v38`, `worker:v38` y `mcp:v38` construidas
y desplegadas; sirviendo al 100 %: web `hotel-mcp-web-00045-t8m` (etiqueta `v38`), worker
`hotel-mcp-worker-00016-gsq` y mcp `hotel-mcp-mcp-00009-sjx`. Se desplegó con `--no-traffic`, se verificó
el canario `v38` (salud + marcadores de código en los bundles) y **después** se movió el tráfico
explícitamente; `/health/ready` responde 200 READY.

### Pendiente

- Revisión visual en navegador de las fichas convertidas.

### Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web typecheck` | OK |
| `pnpm --filter @hotel/web build` | OK |
| `pnpm typecheck` (monorepo) | **6/6 OK** |
| `pnpm --filter @hotel/web test` | **707/707 OK** (83 archivos) |

---

## 13. Conexión de billetera — no se reconocía MetaMask (2026-10-06) · `@asistenteProyecto`

**Síntoma del cliente**: la aplicación **no reconoce la cartera de MetaMask**.

### Causa raíz (verificada en el código del framework)

`providers.tsx` creaba la configuración de wagmi con **`ssr: true`**. En `@wagmi/core`
(`createConfig.js`) la lista de conectores se construye así:

```js
const mipd = typeof window !== 'undefined' && multiInjectedProviderDiscovery ? createMipd() : undefined;
const connectors = createStore(() => {
  ...conectores declarados...
  if (!ssr && mipd) { ...añade los descubiertos por EIP-6963... }   // ← `!ssr`
});
```

Con `ssr: true` el descubrimiento **EIP-6963 nunca se ejecuta**: MetaMask no aparece ni por nombre ni
con su id (`io.metamask`) y solo queda el conector genérico «Injected» (el que ocupa
`window.ethereum`), que no es «reconocer MetaMask». Además, `useOnboarding.connect()` buscaba
`id === "metaMask"`, un id que **no existe** cuando la cartera llega por EIP-6963 (su id es el RDNS),
así que la búsqueda siempre fallaba.

### Correcciones

| Fichero | Cambio |
|---|---|
| `apps/web/src/app/providers.tsx` | `ssr: false` (el proyecto no usa la hidratación por cookie de wagmi, así que no hay regresión) |
| `apps/web/src/lib/wallet-connectors.ts` | `isMetaMaskConnector` / `pickPreferredConnector` (prefiere MetaMask por id, `rdns` o nombre) y `visibleWalletConnectors` (oculta el `injected` genérico duplicado cuando ya hay carteras descubiertas) |
| `apps/web/src/components/wallet/useOnboarding.ts` | `connect()` usa `pickPreferredConnector`; `hasWallet` cuenta también las carteras descubiertas (antes solo `window.ethereum`, lo que deshabilitaba los botones con carteras solo-EIP-6963) |
| `apps/web/src/components/wallet/WalletMenu.tsx` | el selector usa `visibleWalletConnectors` |

### Verificación

Se añadió `apps/web/src/lib/wallet-discovery.test.ts`, que **simula el navegador** (un `window` mínimo
con `addEventListener`/`dispatchEvent`, que es todo lo que usa `mipd`) y anuncia un proveedor EIP-6963
como MetaMask. Prueba el antes y el después sobre `@wagmi/core` real:

| Configuración | Conectores | Resultado |
|---|---|---|
| `ssr: false` (arreglado) | incluye **`io.metamask`** | MetaMask reconocida |
| `ssr: true` (defecto anterior) | solo `["injected"]` | MetaMask **no** reconocida |

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test -- wallet-discovery wallet-connectors` | **11/11 OK** |
| `pnpm --filter @hotel/web typecheck` | OK |
| `pnpm --filter @hotel/web build` | OK |

**Nota**: no se pudo hacer la comprobación en navegador real con Playwright — el Chromium instalado
falla al arrancar por falta de `libnspr4.so` y no hay permisos para instalarlo. La prueba contra
`@wagmi/core` es determinista y queda como guardián de regresión en CI.

### Despliegue (release v39, 2026-10-06)

Commit `35c13ef` publicado en los tres remotos. Solo cambió `apps/web`, así que se construyó y desplegó
únicamente la web (`web:v39`); worker (`hotel-mcp-worker-00016-gsq`) y mcp (`hotel-mcp-mcp-00009-sjx`)
siguen en v38, que es su versión vigente.

| Comprobación | Resultado |
|---|---|
| Imagen `web:v39` (Cloud Build `367b4716`) | ✅ SUCCESS |
| Canario `v39` (`hotel-mcp-web-00046-9t9`, 0 %) | `/health/ready` 200 READY |
| Código servido en el canario | contiene `io.metamask` (exclusivo de v39) |
| Código servido en v38 (antes de mover) | **no** contenía `io.metamask` |
| Tráfico tras mover | `hotel-mcp-web-00046-9t9` al **100 %** (etiqueta `v39`) |
| Producción final | bundles con `io.metamask` ✅ · `/health/ready` 200 READY |

Procedimiento: `--no-traffic` → etiqueta de canario → verificación (salud + marcador de código) →
`update-traffic --to-revisions=…=100` → reetiquetado a `v39`.

---

## 14. Propuesta v3 — Asistente IA de bajo coste (2026-10-07) · `@asistenteProyecto`

**Estado: 🟡 propuesta pendiente de conformidad — no se ha modificado ninguna línea de código.**

Análisis de `RepoTecnico/propuesta_asiatente_hotel.md` y propuesta del incremento **v3**: asistente
conversacional con coste mínimo, reutilizando el asistente ya construido (`apps/web/src/lib/assistant/`,
17 módulos + tests) y las 4 herramientas MCP existentes.

| Decisión | Contenido |
|---|---|
| LLM | **Vertex AI · Gemini 2.5 Flash-Lite** (endpoint regional `europe-west1`) con **Vercel AI SDK** detrás del puerto `LlmClient`; **sin secretos nuevos** (IAM con la SA `hotel-mcp-run@`). Decisión **revisada** tras la verificación de §14.1 |
| RAG | **Sin `pgvector`**: índice BM25 generado en build desde `build-manuals.mjs` (35 documentos) y consultado en memoria del MCP |
| MCP | **4 → 5 herramientas** (`searchHotelManuals`, `camelCase`); se descartan `snake_case` y las 2 herramientas restantes |
| BD | **Sin cambios** → los 3 artefactos de datos siguen sincronizados |
| Infra | **0 recursos nuevos** en GCP |
| Coste incremental | **≈ 2,6 USD/mes** (frente a 32–60 USD/mes de la propuesta original y ~82 USD/mes con Sonnet) |
| Plazo | 3–5 días (H1 adaptador Vercel AI SDK + Vertex/Gemini · H2 índice+tool · H3 prompt ES + citas + saneador de PII · H4 presupuestos · H5 despliegue canario) |

**Decisiones confirmadas por el usuario (2026-10-07):** A1 = **Vercel AI SDK + Vertex AI Gemini 2.5
Flash-Lite** (revisado tras §14.1) · A2 = `min-instances=0` con *keep-warm* solo durante la demo ·
B2 = audiencia cliente final / huésped · B3 = solo español en la primera iteración (EN/RU pasan a v3.1) ·
C3 = RAG como **5ª herramienta del MCP** · D1 = **Vertex AI regional `europe-west1`** (revisado) ·
D2 = **sanitizar la entrada**, que se convierte en el nuevo **RNF-27**, ahora como defensa en profundidad.

**Pendiente (no bloqueante):** A3 (presupuesto máximo mensual), B1 (fuente de conocimiento: 35 documentos
o añadir `RepoTecnico/Manuales/**`), C1 (activar H0 con Anthropic mientras se desarrolla la v3) y
C2 (ventana y volumen de la prueba). Se requiere **conformidad explícita** para pasar a la Fase 3.

### 14.1 Verificación del modelo LLM contra la infraestructura desplegada (2026-10-07)

Comprobado el despliegue real y las fuentes oficiales de Google Cloud. **Conclusión: la elección de
Qwen 2.5 14B en un proveedor externo no era la más adecuada para esta infraestructura. El usuario aprobó
el cambio a Vertex AI · Gemini 2.5 Flash-Lite en `europe-west1` (2026-10-07).**

| Hallazgo verificado | Consecuencia |
|---|---|
| El despliegue usa `--vpc-egress=private-ranges-only` → el tráfico a APIs públicas **no pasa por Cloud NAT** | El coste de red no discrimina entre opciones |
| **Vertex AI se autentica con la SA ya desplegada** `hotel-mcp-run@` | Gemini Flash-Lite usa **0 recursos GCP nuevos**; el proveedor externo exige **1 secreto** |
| **Qwen 2.5 14B no está en el catálogo gestionado de Vertex** (solo la familia Qwen3) | Qwen 2.5 14B obligaría a GPU residente (400–700 USD/mes) |
| **Qwen en Vertex usa el endpoint *global*** (`locations/global`), no `europe-west1` | Tampoco resuelve la residencia del dato en la UE |
| `europe-west1` **sí** figura entre las regiones soportadas de Cloud Run GPU | Autoalojar Qwen añadiría el servicio con GPU que se quiere evitar |

**Veredicto:** la opción que menos recursos GCP consume es **Vertex AI · Gemini 2.5 Flash-Lite con
endpoint regional `europe-west1`** (cero recursos nuevos, dato en la UE, latencia en región, ~2,6 USD/mes).
El proveedor externo ahorra ~1 USD/mes a cambio de un secreto, exportar conversaciones de huéspedes fuera
de la UE y latencia transatlántica. **La decisión del Vercel AI SDK se mantiene**, y **A1 quedó confirmado
como Vertex AI · Gemini 2.5 Flash-Lite** en el §12 del documento.

Detalle y fuentes: `RepoTecnico/propuesta_v3_asistente_ia.md` §5.4.

Nuevos requisitos propuestos: RF-56…RF-60 (→ CU-47, CU-08), RNF-22…RNF-27 (→ CU-48), RT-13…RT-15.
Documento completo: `RepoTecnico/propuesta_v3_asistente_ia.md`.

### 14.2 Fase 3 · Hito H1 — adaptador Vercel AI SDK + Vertex AI (2026-10-07) · COMPLETADO

**Objetivo del hito**: que el asistente responda con Vertex AI · Gemini 2.5 Flash-Lite, sin tocar el
orquestador ni sus guardrails, y con conmutador por variable de entorno.

| Artefacto | Cambio |
|---|---|
| `apps/web/src/lib/assistant/vercel-ai-client.ts` | **Nuevo**. Adaptador del puerto `LlmClient` sobre `generateText` + `tools` del Vercel AI SDK. Las herramientas se declaran **sin `execute`**: es el orquestador existente quien las ejecuta y valida la tx |
| `apps/web/src/lib/assistant/llm-provider.ts` | **Nuevo**. Fábrica/conmutador: `vertex` (por defecto) \| `anthropic` \| error. Import dinámico del SDK de Vertex |
| `apps/web/src/app/api/assistant/route.ts` | Compone el LLM vía `createLlmClient(process.env)` **antes** de parsear el cuerpo; el 503 se emite si falta configuración |
| `apps/web/package.json` | `+ ai@7.0.130`, `+ @ai-sdk/google-vertex@5.0.104` |
| `.env.example`, `RepoTecnico/entornos_globales.md` | Documentadas `ASSISTANT_PROVIDER`, `VERTEX_MODEL`, `VERTEX_LOCATION`, `VERTEX_MAX_OUTPUT_TOKENS` (§3.7 nueva) |

**Decisiones de implementación**
- El adaptador **normaliza la entrada de las herramientas**: la especificación V4 del SDK admite el
  argumento como objeto (`LanguageModelV4ToolCallPart.input: unknown`) o como string JSON
  (`LanguageModelV4ToolCall.input: string`). Sin normalizar, un `JSON.stringify` podría llegar a
  `callTool` en lugar del objeto que el MCP espera.
- El proveedor de Vertex **exige proyecto explícito** (`AI_LoadSettingError`). La fábrica lo resuelve
  desde `GOOGLE_VERTEX_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` (estas dos las inyecta
  Cloud Run) y, si no lo encuentra, **falla en cerrado (503)** en vez de propagar un 500.

**Verificación**

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web typecheck` | ✅ limpio |
| `pnpm --filter @hotel/web test` (suite completa) | ✅ **737/737** en 87 ficheros |
| Suite del asistente | ✅ **56 tests** (33 previos intactos + 23 nuevos) |
| Lint de los ficheros tocados | ✅ 0 errores y 0 avisos |
| Tests nuevos | `vercel-ai-client.test.ts` (11), `llm-provider.test.ts` (8), `app/api/assistant/route.test.ts` (4) |
| Criterio H1 | ✅ la ruta responde 503/400 según configuración y **sin llamar al modelo**; el orquestador no se modificó |

**Pendiente para H5 (despliegue), no para H1**: habilitar `aiplatform.googleapis.com`,
`roles/aiplatform.user` a `hotel-mcp-run@` y las variables en `70-deploy-apps.sh`. El bloque de lint
con 17 errores preexistentes (`PreventiveAdmin.tsx`, `ReviewsModeration.tsx`, …) es **anterior** a este
hito y no pertenece a estos ficheros.

### 14.3 Decisiones pendientes y siguiente hito (2026-10-07)

**H2 (índice de conocimiento + `searchHotelManuals`) NO iniciado**: el usuario revisa antes el hito H1.

| Punto | Estado |
|---|---|
| **B1 — fuente del índice** | ✅ **Decidido**: los 35 documentos de `build-manuals.mjs` **+ `RepoTecnico/Manuales/**`** |
| **A3 — presupuesto máximo mensual** | ⏳ Pendiente (lo necesita H4 para fijar el tope del contador de tokens) |
| **C1 — activar Anthropic mientras tanto** | ⏳ Pendiente (ya no es indispensable: basta `ASSISTANT_PROVIDER=anthropic` + clave) |
| **C2 — ventana y volumen de la prueba** | ⏳ Pendiente (lo necesita H4/H5) |

> ⚠️ **Consecuencia de B1 a resolver en el diseño de H2.** El árbol `RepoTecnico/Manuales/**` es
> documentación **técnica y operativa interna**, mientras que la audiencia confirmada del asistente
> (B2) es el **cliente final / huésped**. Indexar ambos sin distinción haría que el asistente pudiera
> citar procedimientos internos ante un huésped. H2 debe por tanto **etiquetar cada fragmento con su
> audiencia y filtrar en la consulta**, y decidir si el asistente expone alguna vez contenido de
> audiencia `interno`/`recepción`.

### 14.4 Fase 3 · Hito H2 — índice de conocimiento + `searchHotelManuals` (2026-10-07) · COMPLETADO

**Objetivo del hito**: que el asistente pueda responder sobre los manuales del hotel con una 5ª
herramienta MCP, sin base de datos y sin coste por token de embeddings.

| Artefacto | Cambio |
|---|---|
| `apps/mcp/scripts/build-knowledge-index.mjs` | **Nuevo** generador dedicado del índice (52 fragmentos de 3 manuales) |
| `apps/mcp/src/knowledge/index.generated.ts` | **Nuevo** artefacto generado (55 KB), con audiencia por fragmento |
| `apps/mcp/src/knowledge/search.ts` | **Nuevo** motor BM25 en memoria: normalización ES, escalera de audiencias, memoización por audiencia |
| `apps/mcp/src/tools/schemas.ts` | **Nueva** `searchHotelManualsShape` (`query`, `audience`, `limit`) |
| `apps/mcp/src/tools/tools.ts` | **Nueva** `searchHotelManuals()` (local, no depende de `ChainReader`) |
| `apps/mcp/src/server.ts` | Registra la herramienta → **4 read-only + `buildPurchaseTx` = 5** |
| `apps/mcp/package.json`, `main.ts`, `http-server.test.ts` | Script `knowledge` y recuento de herramientas actualizado |

**Verificación**

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/mcp test` | ✅ **61/61** (20 nuevos de motor+índice, 3 del envoltorio) |
| `pnpm --filter @hotel/mcp typecheck` / `lint` / `build` | ✅ limpios · bundle **80 KB** |
| `pnpm --filter @hotel/web test` (suite completa) | ✅ **737/737** |
| Recuperación real | ✅ «cómo compro una noche» → manual del comprador; «qué significa cada mensaje» (audiencia recepción) → manual de recepción |
| Confinamiento | ✅ con la audiencia por defecto, ninguna consulta devuelve documentación interna |

**Hallazgos (dos de seguridad, uno preexistente)**

1. **D-04 vs. contenido interno.** Al indexar `RepoTecnico/Manuales/**` dentro de `apps/mcp/`, el
   fichero generado arrastraba una **semilla TOTP de ejemplo** y hacía fallar el guardián de secretos
   (`secrets-guardian.test.ts`), que escanea `apps/` y `packages/`. Conclusión: la documentación
   técnica no puede materializarse dentro de una aplicación.
2. **Exfiltración por parámetro.** El MCP se despliega con `--allow-unauthenticated` y `audience` la
   elige quien llama: indexar contenido interno habría permitido a cualquiera extraer runbooks y
   procedimientos. Se acota el índice a los **3 manuales dirigidos a personas** (nuevo riesgo R12 en
   la propuesta) y un test impide reintroducirlo.
3. **La tubería de manuales estaba rota en HEAD.** `apps/web/scripts/build-manuals.mjs` falla con
   `casos de uso sin orden declarado en CU_ORDER: cu-38-liberar-habitacion, cu-39-ficha-detalle-habitacion`.
   Al procesarlos se destapan además dos defectos de contenido en esos dos CU (CU-39 repite el
   `blockquote` del lead; CU-38 no referencia ninguna imagen). **No se ha tocado**: es trabajo ajeno a
   H2 y se resuelve en su propio cambio. Por eso el índice se genera con un script dedicado y no
   extendiendo esa tubería.

**Pendiente para H3**: prompt con citación (`manual §sección`) y saneador de PII. **Pendiente de
contenido del cliente**: los manuales dirigidos a personas no cubren **servicios, normas ni ubicación**
del hotel, así que RF-56 queda cubierto solo para lo que existe (flujo de compra y operativa de
recepción) hasta que el hotel aporte ese contenido.

### 14.5 Manual del huésped — plantilla pendiente de contenido del cliente (2026-10-07)

Decisión del usuario (revisión de B1): **añadir un manual del huésped con el contenido del cliente**
para completar RF-56 (servicios, normas y ubicación), que hoy no está cubierto por ningún documento.

| Punto | Estado |
|---|---|
| Plantilla creada | `docs/manual-huesped.md` — 8 secciones con la lista exacta de datos a rellenar |
| Indexación | Registrada en `apps/mcp/scripts/build-knowledge-index.mjs` con audiencia `cliente` |
| Comportamiento mientras esté vacío | El generador **avisa y no indexa nada** del manual: el asistente no puede responder con una plantilla |
| Contenido | ⏳ **Pendiente del hotel** (dirección, horarios, servicios, normas, urgencias, reventa y FAQ) |

> **No se ha inventado ningún dato del hotel.** El asistente respondería como cierto cualquier
> contenido que se indexe, así que la dirección, los horarios y los precios deben venir del cliente.
> Los apartados son comentarios `<!-- PENDIENTE ... -->` que no se indexan.

**Pendiente al rellenarlo**: (1) ejecutar `corepack pnpm --filter @hotel/mcp run knowledge`;
(2) decidir si el manual entra también en la web (`apps/web/scripts/build-manuals.mjs`), lo que hoy
exige arreglar antes esa tubería (ver §14.4, hallazgo 3) y añadir al menos una imagen, porque el
guardián de manuales lo requiere.

### 14.6 Equipo de manuales — Manuales del huésped, todos sus casos (2026-10-07) · COMPLETADO

Encargo: «genera los manuales del huésped con todos los casos que el huésped puede solicitar».
**17 casos**, todos derivados del sistema real (ninguno inventado).

| Artefacto | Contenido |
|---|---|
| `RepoTecnico/Manuales/06-huesped/*.md` | **17 manuales técnicos** (1 935 líneas) con las secciones `Qué hace el sistema · Recorrido real · Piezas de código implicadas · Datos y estados · Casos límite · Referencias` |
| `docs/Manuales/06-huesped/*.md` | **17 manuales literales** (1 193 líneas con el índice) para el huésped, con «Empezar en 5 minutos», «Paso a paso», «Si algo no funciona» y «Preguntas rápidas» |
| `docs/Manuales/06-huesped/README.md` | Índice del árbol por momento: Antes de llegar · Conseguir tu noche · Si te sobra la noche · Durante la estancia · Después · Cuando algo va mal |
| `docs/imagenes/doc-huesped-*.svg` | **7 ilustraciones** (56 KB): estados de una noche, flujos de compra, asistente, reventa, check-in y checkout, e infografía de los 17 casos |
| `docs/pdf/huesped/manual-huesped.html` + `README.md` | Versión imprimible A4 autocontenida (136 KB, portada + índice + 17 capítulos) y guía de exportación a PDF |
| `apps/mcp/scripts/build-knowledge-index.mjs` | El generador del índice incorpora los 17 casos como audiencia `cliente` |

**Los 17 casos**: 01 qué es una noche · 02 preparar la cartera · 03 ver noches disponibles · 04 comprar
una noche · 05 comprar en reventa · 06 mis noches · 07 pedir al asistente · 08 poner la noche en
reventa · 09 avisos de reventa · 10 entrar con el QR · 11 extras durante la estancia · 12 salir y
cerrar la cuenta · 13 dejar una reseña · 14 histórico de ventas · 15 menú de cartera · 16 dinero de
prueba · 17 si algo no funciona.

**Verificación**

| Comprobación | Resultado |
|---|---|
| Referencias `ruta:línea` de los manuales técnicos | ✅ **832 únicas, 0 inválidas** (fichero existe y línea dentro de rango) |
| Datos del hotel inventados | ✅ **ninguno**: 7 marcas `PENDIENTE DEL CLIENTE` (reparto de tipos por habitación, hora de entrada, hora de salida, llaves y cobro, catálogo de extras y precios, horario de recepción) |
| Fuga de jerga técnica a los manuales literales | ✅ ninguna (sin rutas de código ni nombres de función) |
| Paleta e índices de imagen | ✅ solo HEX del preset y los 7 ficheros con prefijo `doc-` en la raíz de `docs/imagenes/` |
| Índice de conocimiento | ✅ **188 fragmentos de 21 manuales** (cliente 153 · recepción 17 · propietario 18) |
| Tests | ✅ `@hotel/mcp` **63/63** · `@hotel/web` **737/737** |

**Incidencias resueltas durante el encargo**

1. **La fase literaria del workflow se cayó en silencio** (6 ítems sin escribir fichero). Se detuvo el
   workflow conservando los 15 manuales técnicos ya escritos y se reejecutó esa fase con subagentes
   propios, que sí completaron los 17.
2. **El guardián de imágenes prohíbe subcarpetas** en `docs/imagenes/` y exige el prefijo `doc-`:
   las 7 ilustraciones se generaron planas y con el nombre canónico (el encargo inicial apuntaba a
   `docs/imagenes/huesped/`, que habría roto `images-naming.test.ts`).
3. **Falso positivo de la propia comprobación de credenciales**: marcaba «no crea una cuenta con
   contraseña: tu cartera es tu identidad». Los patrones se recalibraron para detectar credenciales
   reales (PEM, clave privada de 32 bytes, `sk-…`, `AIza…`, JWT, semilla TOTP base32) sin bloquear prosa.

**Pendiente**: (a) el contenido del hotel en `docs/manual-huesped.md` (RF-56); (b) incorporar los
manuales del huésped a la web (`/ayuda`), que hoy exige arreglar antes la tubería de manuales (§14.4,
hallazgo 3); (c) el PDF no se puede generar en esta máquina (faltan `libnspr4`/`libnss3`) — queda el
HTML imprimible y la guía de exportación en `docs/pdf/huesped/README.md` (carpeta **ignorada por git**,
como el resto de `docs/pdf/`).

### 14.7 Manual del huésped en la plataforma — rol INTEGRADOR (2026-10-07) · COMPLETADO

Cierra el equipo de manuales: el manual del huésped ya es **navegable dentro de la web**, con sus
ilustraciones y su versión imprimible descargable.

| Artefacto | Contenido |
|---|---|
| `apps/web/scripts/build-huesped-manuals.mjs` | Generador dedicado: convierte los 17 `.md` en HTML **escapado**, publica las ilustraciones y la versión imprimible, y falla si una imagen referenciada no existe |
| `apps/web/src/lib/help/huesped.generated.ts` | Artefacto generado: 17 casos, 73 secciones, unión tipada de momentos |
| `apps/web/src/lib/help/group-topics.ts` | Agrupador temas/sub-secciones **compartido** con la ayuda existente (se eliminó la copia local de `ayuda/[slug]`) |
| `apps/web/src/app/ayuda/huesped/page.tsx` | Índice por momento del viaje, con la infografía de los 17 casos y descarga del manual completo |
| `apps/web/src/app/ayuda/huesped/[slug]/page.tsx` | Un caso por página, con índice lateral, ilustración, fuente y descarga |
| `apps/web/src/app/ayuda/page.tsx` | Nuevo bloque de acceso al manual del huésped (no se tocó nada de lo existente) |
| `apps/web/messages/{es,en,ru}.json` | 9 claves nuevas de interfaz (incluida la pluralización), **paridad verificada** |
| `apps/web/src/lib/help/huesped-sync.test.ts` | Guardián: 10 tests |
| `apps/web/public/manual/` | `manual-huesped.html` + 7 ilustraciones publicadas (versionadas, como el resto) |

**Decisión de diseño**: **no** se extendió `apps/web/scripts/build-manuals.mjs`. Esa tubería sigue
rota en HEAD (CU-38 sin ilustración, CU-39 con dos citas en el preámbulo) e impone una política de
formato (una cita y al menos una imagen por manual) que estas guías cortas no siguen. Un generador
propio evita tocar documentos y código ajenos a este encargo y mantiene el invariante con su guardián.

**Verificación**

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` | ✅ **747/747** en 88 ficheros (10 nuevos) |
| Guardián del manual del huésped | ✅ 10/10 (cobertura, títulos, secciones, imágenes, escapado, una sola cita) |
| `typecheck` · lint de los ficheros nuevos | ✅ limpios |
| `next build` | ✅ `/ayuda/huesped` y **17 rutas** pre-renderizadas de `/ayuda/huesped/[slug]` |

**Incidencia encontrada y corregida**: el generador calculaba el cuerpo sin el `H1` pero iteraba sobre
las líneas completas, así que el título se colaba como primer párrafo de la cita inicial. Lo detectó
el propio guardián («el lead tiene más de una cita»); corregido y verificado: 17/17 con una sola cita.

**Nota de entorno**: en esta máquina (1 GB de RAM) `next build` necesita
`NODE_OPTIONS=--max-old-space-size=4096`; con el heap por defecto termina en OOM. No es un problema del
código, pero conviene saberlo para reproducir la verificación.

### 14.8 Fase 3 · H2.1 — ajustes de recuperación y guardián del índice (2026-10-07) · COMPLETADO

Cierre de la deuda que dejó abierta el hito H2.

| Cambio | Detalle |
|---|---|
| **BM25F con peso por campo** | `search.ts`: título del documento ×3, título de sección ×2, cuerpo ×1, con longitud ponderada. Un término del título es mejor señal que el mismo término perdido en el cuerpo |
| **Deduplicación por sección** | Una sección larga se parte en `…~1`, `…~2`; antes **dos trozos de la misma sección ocupaban dos de los tres huecos** y desplazaban a otros manuales. Ahora se conserva el mejor fragmento de cada sección |
| **Plurales irregulares en «-ces»** | `veces→vez`, `luces→luz`, `lápices→lapiz`, `peces→pez`. Se probó añadir «jes» a las terminaciones y **rompía «mensajes»** (`→ mensaj`): retirado y con guarda de regresión |
| **Guardián de sincronía del índice** | `apps/mcp/src/knowledge/index-sync.test.ts` (5 tests): toda fuente citada existe, toda fuente indexable está indexada, títulos y secciones coinciden con el markdown, y el índice no contiene documentación interna. Era el **único artefacto generado sin guardián** |
| **Documentación al día** | 6 documentos decían «4 herramientas»: `01-monorepo.md`, `docs/DISENO-TECNICO.md` (fila nueva en la tabla), `docs/PRD.md`, `docs/SRS.md` (×2), `01-arquitectura/README.md` y `CU-08-asistente-ia.md` (×3, incluidas las líneas citadas de `server.ts`, corregidas a 46/56/66/92/75) |
| **Script raíz** | `pnpm knowledge` regenera el índice (antes solo existía el del subpaquete) |

**Verificación**

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/mcp test` | ✅ **72/72** (67 previos + 5 del guardián) |
| `pnpm --filter @hotel/web test` | ✅ **747/747** |
| `typecheck` · `lint` · `build` del MCP | ✅ limpios · bundle 221 KB |
| Índice | 188 fragmentos de 20 documentos · 189 KB · construcción 34,9 ms · consulta 0,24 ms |

**Corrección de un dato que di mal**: en el informe de revisión de H2 dije que el bundle del MCP era de
**80 KB**. Era un valor obsoleto: correspondía al índice de 52 fragmentos (solo los 3 manuales), antes
de incorporar los 17 casos del huésped. El valor real es **221 KB** (el índice aporta 189 KB).

**Precisión sobre un hallazgo que retiro.** En el informe de revisión afirmé un «sesgo hacia las
secciones de FAQ» y puse como prueba que «puedo revender mi noche» devolvía el caso 01 como primer
resultado. Al leer el contenido, la FAQ del caso 01 contiene literalmente
«**¿Puedo revenderla?** Sí, mientras no la hayas usado en recepción»: el primer resultado era
**correcto**. La observación era superficial. Lo que sí queda es una limitación medida: no hay
lematización verbal («compro» ≠ «compra»), de modo que el manual exacto puede quedar por detrás de una
FAQ que contenga la forma conjugada; el manual correcto **sigue entrando en el top-3**, que es el
criterio de aceptación del hito. Se probará con consultas reales en H3/H4.

**Pendiente de H2 que sigue abierto**: los renglones del prompt (es H3) y el despliegue (es H5).

### 14.9 Regla de `push` de esta línea de trabajo (2026-10-07)

**Instrucción del responsable**: en esta línea de trabajo (v3: asistente IA y manuales del huésped) el
`push` va **solo a la rama `Hotel-DSH-GCP-v3`**. `main` y `Hotel-DSH-GCP` no se mueven.

| Rama | Estado |
|---|---|
| `Hotel-DSH-GCP-v3` | **Rama de trabajo y único destino de `push`**. Publicada en `origin` (`6fc47a6`) |
| `Hotel-DSH-GCP` | Congelada en `42255fd` (no recibe los commits de la v3) |
| `main` | Intacta en `42255fd` |

Queda registrado también en `RepoTecnico/entornos_globales.md` §1, que es donde el equipo consulta la
política de repositorios y ramas.

### 14.10 Fase 3 · Hito H3 — prompt con citación y saneador de PII (2026-10-08) · COMPLETADO

**Objetivo del hito**: que el asistente **use** el conocimiento indexado en H2 con citas verificables y
que ninguna PII del huésped salga hacia el proveedor del modelo.

| Artefacto | Cambio |
|---|---|
| `apps/web/src/lib/assistant/prompt.ts` | Prompt v3: dominio ampliado a las dudas del hotel (RF-56), uso **obligatorio** de `searchHotelManuals` y prohibición de responder de memoria, formato de citación (RF-59), español y búsqueda en español (RF-58) y brevedad explícita (RNF-24) |
| `apps/web/src/lib/assistant/pii-sanitizer.ts` | **Nuevo** saneador (RNF-27): enmascara correo, teléfono, DNI/NIE, IBAN y presentaciones explícitas de nombre, sobre **todo el historial** |
| `apps/web/src/app/api/assistant/route.ts` | Aplica el saneador en el punto de salida y registra **solo las categorías**, nunca el dato |
| `apps/web/src/lib/assistant/prompt.test.ts` | **Nuevo**: 17 tests que guardan las reglas del prompt (ningún test las cubría: el orquestador usa un doble) |
| `apps/web/src/lib/assistant/pii-sanitizer.test.ts` | **Nuevo**: 15 tests |
| `apps/web/src/app/api/assistant/route-sanitizer.test.ts` | **Nuevo**: 3 tests de integración que inspeccionan lo que el modelo habría recibido |

**Decisiones de diseño**

- **El saneador no toca lo que el asistente necesita**: fechas `AAAAMMDD`, `tokenId`, direcciones de
  wallet, importes, números de habitación ni códigos de resguardo. Un falso positivo habría roto el
  flujo de compra, que es peor que el riesgo que evita. Hay tests explícitos para cada uno.
- **Límite declarado**: no es un detector semántico. Un nombre suelto en mitad de una frase no se
  detecta; solo las presentaciones explícitas («me llamo…», «soy…», «mi nombre es…»). Reduce el riesgo,
  no lo elimina.
- **Se sanea todo el historial**, no solo el último mensaje: el proveedor recibe la conversación
  completa en cada petición, así que un dato del primer turno volvería a salir en el quinto.

**Verificación**

| Comprobación | Resultado |
|---|---|
| `pnpm --filter @hotel/web test` | ✅ **782/782** en 91 ficheros (35 tests nuevos) |
| `typecheck` · lint de los ficheros de H3 | ✅ limpios |
| RF-59 (citación) | ✅ `prompt.test.ts` exige citar `Manual §sección` y solo de lo devuelto por la herramienta |
| RNF-27 (PII) | ✅ la prueba de integración confirma que `ana@example.com`, `611 222 333` y `Ana López` **no** llegan al modelo, y que `20260615` sí |

**Incidencia encontrada y corregida**: la primera versión de la regla de nombres no detectaba «Soy Ana»
ni «Me llamo Carlos» (el disparador estaba en minúscula). Se reescribió con un *lookbehind* que admite
la mayúscula inicial y exige que el nombre empiece en mayúscula, de modo que «Soy de Alicante» y «soy el
dueño» siguen sin enmascararse. Lo detectaron los propios tests.

**Pendiente de H3 que no es suyo**: el modelo sigue sin desplegar (H5) y el prompt no se ha probado
contra el modelo real con conversaciones reales (H4, con la medición de coste y latencia).

### 14.11 Fase 3 · Hito H4 — presupuestos, telemetría y medición (2026-10-08) · COMPLETADO (medición real pendiente de H5)

**Objetivo**: que el coste y la latencia del asistente sean **medibles y estén acotados**, no estimados.

| Artefacto | Cambio |
|---|---|
| `apps/web/src/lib/assistant/token-budget.ts` | **Nuevo** (RNF-24): estimador de tokens conservador (3,5 car./token) y presupuesto de entrada con **ventana deslizante** de turnos. Nunca recorta un mensaje a medias |
| `apps/web/src/lib/assistant/metrics.ts` | **Nuevo**: consumo agregado, línea de telemetría JSON sin PII y **presupuesto mensual** en memoria con modos `soft`/`hard` |
| `apps/web/src/lib/assistant/pricing.ts` | **Nuevo** (RNF-22): tarifas por modelo, sobrescribibles por entorno. Un modelo desconocido usa la tarifa **más cara** para sobreestimar |
| `types.ts` · `orchestrator.ts` · adaptadores | El puerto `LlmClient` informa del consumo; el orquestador lo agrega por petición y expone `llmCalls`, `usage` y `droppedTurns`. El **tope de rondas de herramientas baja de 4 a 2** (cada ronda se factura) |
| `route.ts` | Aplica el presupuesto, corta en modo `hard` si el mes está agotado, y registra **una línea por petición** (modelo, tokens, coste, latencia, enmascarados). La respuesta al cliente **no cambia de contrato** |
| `apps/web/scripts/measure-assistant.ts` | **Nuevo** arnés de medición: N conversaciones, p50/p95, tokens y coste, con informe JSON en `RepoTecnico/evidencias/`. Modo `--mock` sin red y modo real |

**Medición (modo `--mock`, 20 conversaciones)**

| Métrica | Valor |
|---|---|
| Tokens de entrada | 43 884 (≈ **2 194 por conversación**, derivados del payload real: prompt, esquemas y turnos) |
| Tokens de salida | 2 600 (≈ 130 por conversación) |
| Coste estimado con `gemini-2.5-flash-lite` | **0,27 USD por 1 000 conversaciones** |
| Margen frente a RNF-22 (≤5 USD/mes) | **≈18×** |
| Latencia p95 del **código** | 0,2 ms (sin modelo: el mock no tiene red) |
| Llamadas al modelo por conversación | 2 (una con herramienta y otra de cierre) |

**Lo que esta medición NO es.** El modo `--mock` no mide el modelo: no hay credenciales de GCP ni
`aiplatform.googleapis.com` habilitado (eso es H5). Mide el **volumen de tokens que construye nuestro
código** y extrapola con la tarifa real, que es la parte que podemos controlar y donde están las
palancas (prompt, esquemas, ventana de turnos, rondas). El p95 real y el consumo facturado se miden
ejecutando el arnés sin `--mock` tras H5.

**Caché de contexto: no implementada, y por qué.** El proveedor `@ai-sdk/google-vertex` **no expone**
la caché de contexto explícita de Vertex (`cachedContent` no aparece en su API), así que no se puede
configurar desde el código. Sí se aprovecha lo que no requiere configuración: el prompt de sistema es
estable (prefijo cacheable de forma implícita) y se han aplicado las palancas que sí dependen de
nosotros (prompt más corto, 2 rondas en vez de 4, ventana de 12 turnos). Los tokens de caché se
**registran** (`cachedInputTokens`) para poder comprobar en H5 si Vertex los sirve.

**Pendiente de H4 que depende de H5**: ejecutar el arnés sin `--mock` y anotar el p95 real, el consumo
facturado y si hay aciertos de caché.

### 14.12 Fase 3 · Hito H4 — medición REAL contra Vertex AI (2026-10-08)

Se ejecutó el arnés **sin `--mock`**, contra `gemini-2.5-flash-lite` en `europe-west1`, con 20
conversaciones representativas por ronda (8 rondas). Además de las cifras, la medición sirvió para
**encontrar y corregir tres defectos reales** que ningún test detectaba.

**Preparación necesaria (paso 1 de H5, ya hecho)**

| Acción | Estado |
|---|---|
| `aiplatform.googleapis.com` habilitado en `hotel-mcp` | ✅ (gratuito y reversible; sin recursos creados) |
| Credencial para medir | Token **efímero** de `gcloud` inyectado como cabecera **solo en el arnés**. No se crearon claves de servicio, no se escribió ningún secreto en disco y **no se concedió ningún permiso de Vertex a esta instancia** |

**Resultado final (20 conversaciones, razonamiento desactivado)**

| Métrica | Valor | Requisito |
|---|---|---|
| p50 | **1 246 ms** | — |
| **p95** | **2 278 ms** | ✅ RNF-25 (≤2 500 ms) |
| máx | 2 786 ms | — |
| Tokens de entrada | 40 657 (≈2 033/conversación) | ✅ RNF-24 (≤6 000/petición) |
| Tokens de salida | 2 244 (≈112/conversación) | ✅ RNF-24 (≤512) |
| Coste | **0,248 USD / 1 000 conversaciones** | ✅ RNF-22 (≤5 USD/mes, margen ≈20×) |
| Respuestas inservibles | **0/20** | — |
| Conversaciones que usaron herramienta | **20/20** | RF-56 |

**Serie completa de medidas (para dejar constancia de la varianza)**

| Ronda | p50 | p95 | máx | USD/1 000 | inservibles |
|---|---|---|---|---|---|
| 1 (con razonamiento) | 1 154 | 2 553 | 7 943 | 0,185 | — |
| 2 (con razonamiento) | 1 058 | 2 013 | 2 723 | 0,191 | 6/20 |
| 3 (con razonamiento) | 1 333 | 2 310 | 7 404 | 0,194 | 8/20 |
| 4 (con razonamiento) | 1 155 | 2 005 | 2 709 | 0,207 | 8/20 |
| 5 (+ reintento) | 1 266 | 2 316 | 2 752 | 0,238 | 1/20 |
| 6 (+ mensaje de reserva) | 1 203 | 2 649 | 13 498 | 0,233 | 0/20 |
| 7 (+ guarda de pseudollamada) | 1 569 | 2 857 | 3 067 | 0,268 | 0/20 |
| **8 (+ razonamiento desactivado)** | **1 246** | **2 278** | **2 786** | **0,248** | **0/20** |

Con 20 muestras, el p95 es el **segundo peor valor**: una sola llamada lenta del proveedor (7,4-13,5 s)
decide si se cumple el requisito. Por eso RNF-25 se considera **cumplido pero frágil**, y hay que
remedirlo en H5 con más volumen y desde Cloud Run.

**Defectos encontrados por la medición y corregidos**

1. **40 % de respuestas vacías.** Gemini 2.5 Flash-Lite devuelve a veces un candidato sin texto (gasta
   unos tokens de razonamiento y no escribe respuesta). `maxRetries` del SDK no lo cubre: no es un
   error de protocolo. → **Reintento acotado** en el adaptador (el consumo de ambos intentos se suma,
   porque el proveedor los factura) + **mensaje de reserva** en el orquestador para que el huésped
   nunca reciba una burbuja vacía. Resultado: 8/20 → **0/20**.
2. **El guardrail de dominio rechazaba procedimientos del hotel.** «¿Cómo conecto mi cartera y me pongo
   en la red correcta?» —el caso 02 del manual— se respondía con «No puedo ayudarte con eso». El
   modelo lo clasificaba como tema ajeno. → El prompt ahora enumera los procedimientos del hotel
   (cartera y red, resguardo QR, extras) y avisa de que **no** se rechacen. Resultado: conversaciones
   sin herramienta 6/20 → 1/20.
3. **Pseudollamada escrita como texto.** En una ocasión el modelo escribió
   `tool_code / print(default_api.searchHotelManuals())` como texto: el huésped habría visto
   pseudocódigo. → Se detecta y se reintenta, y si persiste se sustituye por el mensaje de reserva.

**La palanca de latencia (hallazgo principal).** El **razonamiento** de Gemini 2.5 estaba activo por
defecto y era la causa dominante de la latencia y de la truncación: con él, una misma pregunta tardaba
1 638 ms y a veces **agotaba el tope de 512 tokens antes de escribir la respuesta**; con
`thinkingBudget: 0`, 914 ms y sin truncar. Se expone como `VERTEX_THINKING_BUDGET` (por defecto `0`) y
al desactivarlo el p95 pasó de 2 857 ms a **2 278 ms** y las conversaciones que usan la herramienta
subieron a 20/20.

**Cómo repetir la medición**

```bash
export PATH="/home/dsh/google-cloud-sdk/bin:$PATH"     # el snap de gcloud está roto en esta máquina
corepack pnpm --filter @hotel/web exec tsx scripts/measure-assistant.ts --runs=20
```
Los informes quedan en `RepoTecnico/evidencias/h4-medicion-real.json` (y `…-mock.json`).

### 14.13 Fase 3 · Hito H5 — el asistente está EN PRODUCCIÓN (2026-10-08) · COMPLETADO

Release **v40** desplegada con canario. Registro completo en `despliegue_gcp.md` §63.

| Qué | Estado |
|---|---|
| `aiplatform.googleapis.com` | ✅ habilitada (gratuita, reversible) |
| `roles/aiplatform.user` a `hotel-mcp-run@` | ✅ concedido y verificado |
| Variables del asistente en la web | ✅ en `70-deploy-apps.sh` (incluida `GOOGLE_CLOUD_PROJECT`, sin la cual el asistente falla **en cerrado**) |
| Imágenes | `web:v40` y `mcp:v40` construidas con Cloud Build (el MCP **hay que reconstruirlo**: el índice va dentro) |
| Canario | MCP verificado (5 herramientas) → tráfico; web verificada (asistente responde) → tráfico |
| Tráfico | 100 % en `hotel-mcp-web-00078-dec` y `hotel-mcp-mcp-00013-daq`, **comprobado explícitamente** |

**El asistente responde**: preguntas reales devuelven respuestas citadas («…*Manual del comprador §6*…»)
usando la herramienta (`domainToolCalls: 1`), y la pregunta de la cartera que en H4 se rechazaba ahora
se contesta con pasos.

**Verificación en producción**: 5 peticiones seguidas a 1,30-1,78 s; telemetría `assistant_request` con
tokens y coste en Cloud Logging; y una petición con nombre, correo y móvil dejó **0 coincidencias de
PII** en los logs (solo las categorías enmascaradas).

**Hallazgo — el cold start se paga en la primera pregunta**: 7,0 s y 9,7 s en frío frente a ~1 s en
caliente, con `min-instances=0` en web y MCP. RNF-25 habla de instancias calientes, así que se cumple
en caliente; se documenta el efecto (que es justo lo que el requisito pedía) y se mantiene el coste
mínimo en el piloto.

**Pendiente del cliente**: el contenido del hotel en `docs/manual-huesped.md` (7 marcas
`PENDIENTE DEL CLIENTE`). El asistente ya responde, pero sobre lo que hay indexado.

### 14.14 Decisiones A3, C1 y C2 (2026-10-08) — cerradas

| Decisión | Resolución | Motivo |
|---|---|---|
| **A3** · presupuesto máximo | **5 USD/mes en modo `hard`** (`ASSISTANT_BUDGET_MODE=hard`) | Es el techo de RNF-22. Con el coste medido (0,248 USD/1.000 conversaciones) son **~20.000 conversaciones/mes**: solo puede saltar por abuso o fallo descontrolado, y entonces es mejor parar (503, con la alternativa manual ya prevista) que gastar en silencio |
| **C1** · activar H0 con Anthropic | **No aplica** | El asistente ya está en producción con Vertex desde la v40. El puente con Anthropic (~82 USD/mes) habría costado ~330 veces más por el mismo servicio |
| **C2** · ventana y volumen de la prueba | **30 días desde la v40** (2026-10-08 → 2026-11-07, prorrogable) · **1.000 conversaciones/mes** de referencia | Da un coste esperado de **0,25 USD/mes** dentro del techo de 5. La validación **funcional** sigue bloqueada por el contenido del cliente |

**Aplicado en producción**: revisión `hotel-mcp-web-00048-lz8` (imagen `web:v40`) sirviendo el 100 %
del tráfico con `ASSISTANT_BUDGET_MODE=hard` y `ASSISTANT_MONTHLY_BUDGET_USD=5`; verificado que el
asistente sigue respondiendo con citas después del cambio. El script `70-deploy-apps.sh` ya lleva el
modo duro, así que la próxima release lo conserva.

**Límite conocido de A3**: el contador de gasto vive en memoria de cada instancia (hasta 3) y se pierde
al reciclar el contenedor, así que es una red de seguridad, no contabilidad. La fuente de verdad es la
facturación de GCP, y lo recomendado es un **presupuesto con alerta** en la cuenta de facturación: la
API `billingbudgets.googleapis.com` no está habilitada y no se ha tocado la cuenta de facturación.

**B1 sigue abierta** (confirmar el corpus acotado, ya implementado y en producción, o abrir más
adelante una superficie interna autenticada aparte).
