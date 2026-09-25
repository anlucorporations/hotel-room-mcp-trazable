# 01 · Mapa del monorepo

> **Gestor**: pnpm workspaces (`pnpm-workspace.yaml`) + **turbo** (`turbo.json`). Node ≥ 24, `pnpm@10.32.1`.
> **Regla**: cada paquete se construye y se prueba **desde la raíz** con un filtro; no ejecutes dos
> suites a la vez en el mismo workspace (se pisan `packages/shared/dist` y el registro de Foundry).

## 1. Estructura de primer nivel

| Ruta | Contenido |
|---|---|
| `apps/web` | Aplicación Next.js: catálogo, reventa, mis noches, histórico, recepción, asistente y back-office |
| `apps/worker` | Indexador, agregados, cola de correo, planificador de quema y HTTP de datos |
| `apps/mcp` | Servidor MCP con herramientas read-only y preparación de la compra |
| `apps/monitor` | Sondeo de `/health`, viveza de cadena y saldo de gas |
| `packages/contracts` | `HotelNights.sol`, librerías, pruebas Foundry y scripts de despliegue/sincronización |
| `packages/shared` | Dominio, ABIs, base de datos, autenticación, eventos, colas, servicios y registro de despliegues |
| `packages/config` | Preset de Tailwind, configuración base de TypeScript y ESLint compartida |
| `scripts/` | Operación: respaldo/DR, arranque de Redis en Windows y medidor de carga |
| `docs/` | PRD, SRS, plan, backlog, guías operativas y el **registro de ADR** |
| `RepoTecnico/` | Documentación de gestión: estado, datos, entornos, cobertura, auditoría y **evidencias** |
| `.env.example` | Contrato de variables de entorno (marca `[OBLIGATORIA]`) |

## 2. `apps/*` — dónde vive cada cosa

### 2.1 `apps/web` (puerto 3000)

| Ruta | Qué hay |
|---|---|
| `src/app/**/page.tsx` | Rutas públicas: `/`, `/reventa`, `/mis-noches`, `/historico`, `/recepcion`, `/asistente`, `/privacidad`, `/terminos` |
| `src/app/admin/**` | Siete pantallas de back-office: minteo, dashboard, fondos, roles, royalty, pausa, caducadas |
| `src/app/api/**` | Las **25** rutas de API (`auth`, `admin`, `reception`, `qr`, `wallet`, `nfts`, `sales`, `push`, `fiat`, `assistant`, `health`) |
| `src/app/health/**` | `live` y `ready` (esta última devuelve `READY`/`DEGRADED` con `postgres`, `redis`, `polygonRPC`) |
| `src/components/**` | UI por dominio: `buy/`, `catalog/`, `my-nights/`, `resale/`, `dashboard/`, `admin/`, `assistant/`, `layout/`, `wallet/`, `tx/` |
| `src/lib/**` | Servidor: guard de sesión, `verifiedTxRequest` vive en `components/buy/`, `ticket-ownership`, `worker-api`, `a11y/` |
| `src/config/chain.ts` | **Único** sitio con la dirección y el `chainId` del cliente |
| `src/i18n/` | Catálogos de mensajes ES / EN / RU |
| `e2e/` | Specs de Playwright: `a11y.spec.ts` (axe), `home.spec.ts`, `asistente.spec.ts`, `observabilidad.spec.ts` |
| `test/` | Dobles de prueba compartidos (`empty-server-only.ts` y compañía) |

### 2.2 `apps/worker` (puerto 8787)

| Fichero | Función |
|---|---|
| `src/main.ts` | Punto de entrada: `process.loadEnvFile` del `.env` raíz y arranque en cerrado |
| `src/run-worker.ts`, `src/listener-runtime.ts` | Bucle de polling, heartbeat y cableado del listener |
| `src/chain-source.ts` | Lectura de bloques y logs de la cadena |
| `src/checkpoint-store.ts`, `src/rebind.ts` | Checkpoint persistido y **rebobinado** al bloque de despliegue |
| `src/aggregate-processor.ts`, `src/aggregate-store.ts` | Agregados, histórico y `backfillTimestamps` |
| `src/email-consumer.ts`, `src/queued-mailer.ts`, `src/mailer.ts` | Cola única de correo, consumidor y reconciliación |
| `src/burn-scheduler.ts` | Planificador de la quema (hora local del hotel, cerrojo por día) |
| `src/sale-processor.ts`, `src/sale-notifier.ts` | Procesado de ventas y avisos |
| `src/health.ts` | Traducción del estado a informe de salud (`lag`, `aggregateLag`, `emailDegraded`) |
| `src/http-server.ts` | `GET /health`, `GET /aggregates`, `GET /history` (CORS `*`, **sin autenticación**: deuda) |
| `src/config.ts` | Esquema zod de las variables del worker |

### 2.3 `apps/mcp` (puerto 8788) y `apps/monitor`

| Fichero | Función |
|---|---|
| `mcp/src/server.ts` | Registra las **4** herramientas: `listAvailableNights`, `checkAvailability`, `getOwnedNights`, `buildPurchaseTx` |
| `mcp/src/tools/**` | Núcleo de las herramientas, esquemas zod y errores de dominio |
| `mcp/src/chain/viem-chain-reader.ts` | Adaptador viem; pagina `getLogs` y usa `ownerOf` como oráculo |
| `mcp/src/http-server.ts`, `health.ts` | Transporte HTTP y salud del MCP |
| `monitor/src/monitor-core.ts`, `probe.ts` | Bucle de sondeo de `MONITOR_TARGETS` |
| `monitor/src/chain-monitor.ts` | Viveza de la cadena (ciclos sin bloque nuevo) |
| `monitor/src/alerter.ts` | Alertas por **SMTP propio** (no usa la cola del producto: es deliberado) |
| `monitor/src/config.ts` | `GAS_WALLETS`, `MIN_GAS_NATIVE`, `STALL_CYCLES`, `ALERT_EMAIL` |

## 3. `packages/*` — dónde vive cada cosa

### 3.1 `packages/contracts` (Foundry)

| Ruta | Contenido |
|---|---|
| `src/HotelNights.sol` | Contrato canónico (inmutable, sin proxy: ADR-22) |
| `src/libraries/` | `RoomMaster.sol` (maestro de 50 habitaciones) y `DateLib.sol` (calendario) |
| `src/Faucet.sol` | Faucet de pruebas: solo se despliega con `DEPLOY_FAUCET=true` |
| `src/HotelNFT.sol`, `src/HotelMarketplace.sol` | **Retirados del árbol en M9** (ADR-02). Un guardián de `packages/shared` prohíbe reintroducir sus identificadores (`hotelNftAbi`, `hotelMarketplaceAbi`) |
| `test/` | **13 ficheros de suite / 125 pruebas** (medido con `pnpm test:contracts` al cerrar M9): `HotelNights.{mint,buy,resale,checkin,burn,royalty,roles,admin,ownership,invariants}.t.sol`, `Deploy.s.t.sol`, `Faucet.t.sol` y `DateLib.t.sol`. Las cifras de **16 suites / 146 pruebas** que aparecen en los registros de M1–M8 son **anteriores** a la retirada de la generación legacy |
| `script/Deploy.s.sol` | Despliegue con bootstrap de roles y faucet opcional |
| `scripts/sync-deployment.ts` | Añade `abiHash` y valida contra el esquema del registro |
| `scripts/gen-abi.ts` | Regenera los ABI de `packages/shared/src/abi/**` |
| `scripts/e2e/m4…m7*.ts` | Los cuatro guiones E2E on-chain |
| `scripts/inject-data.ts` | **Inyección de datos** (`pnpm --filter @hotel/contracts inject:data`): deja la topología de cuentas (cuenta 0 propietaria, 1 check-in, 2 y 3 usuarios), los roles on-chain, los operadores de la BD y un surtido de noches con ventas y reventas. Ver [`docs/inyeccion-datos.md`](../../../docs/inyeccion-datos.md) |
| `scripts/verify-accounts.ts` | Comprobación **de solo lectura** de la topología: roles de cada cuenta y tesorería |
| `scripts/dev-accounts.ts` | Las cuatro cuentas de desarrollo de Anvil, en un solo sitio (vectores públicos de prueba) |
| `deployments/` | Registro **crudo** escrito por Foundry (no versionado); el canónico vive en `packages/shared/deployments/<chainId>.json` |

### 3.2 `packages/shared` (fuente única)

| Carpeta | Contenido |
|---|---|
| `src/domain/` | Capa pura: `token-id`, `room-master`, `night-state`, `purchase-tx`, `aggregates`, `ipfs`, `faucet`, `roles` |
| `src/db/` | `migrator.ts` (**fuente de verdad del esquema**, 13 tablas), `pool.ts`, `schema.sql` (referencia histórica con guardián de paridad) y `repositories/` |
| `src/auth/`, `src/passes/`, `src/reception/`, `src/redis/` | Autenticación (bcrypt + TOTP + JWT), JWS del resguardo, check-in y cliente/locks de Redis |
| `src/events/`, `src/queue/`, `src/burner/`, `src/push/` | Listener, cola única, quema y push (RFC 8291/8292) |
| `src/health/`, `src/env/`, `src/logger.ts`, `src/network.ts`, `src/constants.ts` | Salud, validación *fail-fast* de entorno, logging JSON y red |
| `src/abi/` | ABI generados (`pnpm contracts:build` + `gen:abi`); empiezan con «NO editar a mano» |
| `src/deployments/` | Esquema y lectura del registro |
| `scripts/create-admin.ts` | Aprovisionamiento de operadores (imprime `otpauth://` y códigos de rescate **una vez**) |

## 4. `scripts/*`

| Ruta | Para qué |
|---|---|
| `scripts/dev/start-redis.ps1` | Arranca/para el Redis-compatible de Windows (ASCII puro; acepta `-Stop` y `MEMURAI_HOME`) |
| `scripts/backup/restore-verify.ts` | `pnpm test:dr`: volcado real, restauración real y comparación tabla por tabla |
| `scripts/load-tests/run-load-test.ts` | `pnpm test:load`: mide por HTTP el sistema en marcha y valida el contenido |
| `scripts/load-tests/catalog-load.js` | Guion de **k6** (conservado; k6 no está instalado: B-3) |
| `scripts/backup/backup-postgres.sh` | Volcado lógico de referencia |
| `RepoTecnico/evidencias/*.json` | Artefactos de cada certificación (carga, DR, E2E M4–M7) |

## 5. Qué comando construye y prueba cada paquete

| Paquete | Construir | Probar | Cobertura |
|---|---|---|---|
| raíz (todos) | `pnpm build` | `pnpm test` | `pnpm test:coverage` |
| `@hotel/contracts` | `pnpm contracts:build` (`forge build`) | `pnpm test:contracts` (`forge test -vvv`; 13 ficheros de suite tras retirar la legacy) | `forge coverage` en CI |
| `@hotel/shared` | `pnpm --filter @hotel/shared build` (tsup) | `pnpm --filter @hotel/shared test` | `pnpm --filter @hotel/shared test:coverage` |
| `@hotel/web` | `pnpm --filter @hotel/web build` (next build) | `pnpm --filter @hotel/web test` · `pnpm --filter @hotel/web exec playwright test` | `pnpm --filter @hotel/web test:coverage` |
| `@hotel/worker` | `pnpm --filter @hotel/worker build` | `pnpm --filter @hotel/worker test` | `pnpm --filter @hotel/worker test:coverage` |
| `@hotel/mcp` | `pnpm --filter @hotel/mcp build` | `pnpm --filter @hotel/mcp test` | `pnpm --filter @hotel/mcp test:coverage` |
| `@hotel/monitor` | `pnpm --filter @hotel/monitor build` | `pnpm --filter @hotel/monitor test` | `pnpm --filter @hotel/monitor test:coverage` |

Referencia de cierre de **M9** (árbol final): `pnpm typecheck` 6/6 · `pnpm lint` 6/6 (0 errores, 19
warnings `no-console` documentados) · `pnpm test` 7/7 tareas con **827 pruebas** (contracts 125,
shared 266, web 250, worker 114, mcp 38, monitor 34) · `forge test` **13 suites / 125 pruebas** ·
`next build` 21/21 páginas · axe 16/16. (El cierre de M8 dio 835 pruebas y 16 suites / 146 pruebas:
la diferencia es la retirada de la generación legacy y las pruebas nuevas del resguardo.)

### Comandos operativos de la raíz

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm test:contracts
pnpm test:e2e:m4        # y m5, m6, m7
pnpm test:load
pnpm test:dr
pnpm contracts:build
pnpm --filter @hotel/contracts sync
pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es
pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
pnpm --filter @hotel/web dev        # y worker, mcp, monitor
```

## 6. Deuda y discrepancias anotadas en este mapa

- **`pnpm deploy:anvil` no funciona hoy**: el script raíz delega en
- **RESUELTO en M9**: `pnpm deploy:anvil` de la raíz llamaba a `pnpm --filter @hotel/contracts
  deploy:anvil`, un script que **no existía** (el real es `deploy:local`), así que el comando
  documentado no desplegaba nada. El script raíz ya apunta a `deploy:local`; el comando canónico sigue
  siendo `forge script script/Deploy.s.sol:Deploy …`.
- `scripts/e2e/` en la raíz está **vacío**: los guiones E2E viven en `packages/contracts/scripts/e2e/`.
- La generación **legacy** `HotelNFT`/`HotelMarketplace` se **retiró del árbol** en M9 (ADR-02): ya no
  está en `src/`, ni en `packages/shared/src/abi/`, ni en las suites Foundry, y un guardián impide que
  vuelva. La documentación normativa ya está alineada (**13 suites / 125 pruebas**, medido).
- `apps/mcp/src/**` contiene una prueba con `chainId: 31337` que deriva del canónico **81234**.
- El HTTP del worker **no autentica y su CORS es abierto** (`Access-Control-Allow-Origin: *`).

---

*Volver al índice: [`../README.md`](../README.md) · Arquitectura: [`README.md`](README.md)*
