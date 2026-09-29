# Estado del proyecto — Hotel Marina del Sol

> **Proyecto**: `hotel-room-mcp-trazable` · **Rama de push**: `Hotel-DSH-GCP` (solo remotos de `anlucorporations`) · **Fecha**: 2026-09-27
> **Fase del proceso**: Fase 1 reconstruida (este documento + `requerimientos.md`, `diccionario_datos.md`, `entornos_globales.md`) · Fase 2 con auditoría ya ejecutada · **Fase 3: M0–M9 cerrados y verificados · Plan de reestructuración: F0–F6 completadas y F8 CERRADA (corte ejecutado en GCP + ventana de acuñación completa con barrido global y aviso de agotamiento); F7 (administración financiera) queda fuera de esta entrega (3.ª versión)**
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

**Hallazgo del entorno (no del código)**: el puerto **8788, que el MCP tenía configurado, lo ocupa un
proceso `python` ajeno al proyecto** (`python -m http.server 8788 --directory C:\GGTO\proyecto\app`,
iniciado el 2026-09-23 a las 15:35). Con ese proceso escuchando, el MCP **no puede arrancar**
(`EADDRINUSE`). **Resuelto**: `MCP_PORT=8790` en el `.env`, con `MCP_BASE_URL`, `MONITOR_TARGETS` y
`MCP_ALLOWED_HOSTS` alineados. No se ha tocado el proceso del otro proyecto.

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

