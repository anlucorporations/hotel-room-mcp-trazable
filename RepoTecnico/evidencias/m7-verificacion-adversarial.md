# Verificación adversarial independiente · M7 (dashboard y accesibilidad)

**Repositorio:** `hotel-room-mcp-trazable` · **Fecha:** 2026-09-23, 12:05–12:25 (hora local)
**Alcance:** cambios de M7 (D-11, D-16) + las dos deudas asignadas (pausa y titularidad del pase).
**Método:** lectura del código contra el sistema en marcha (Anvil 81234 con `--block-time 2`, PostgreSQL 18,
Redis, worker vivo en `:8787`), `pnpm test:e2e:m7`, `pnpm test`, `pnpm typecheck`, `cast`, `psql` y sondas propias.

> **Aviso de objetivo móvil.** Mientras verificaba, otro agente modificó
> `packages/contracts/scripts/e2e/m7-dashboard.ts` (mtime 12:17:12; pasó de 675 a 800 líneas y añadió la
> comprobación de frontera de mes que yo acababa de señalar como ausente). La evidencia
> `RepoTecnico/evidencias/m7-dashboard-anvil.json` es de las 11:56 (27 comprobaciones, revisión anterior).
> Mis mediciones de cadena/base son de un sistema compartido que sigue avanzando (1 bloque cada 2 s).

---

## 1. Veredicto: **CUMPLE CON RESERVAS**

El núcleo de M7 es real y **no he podido falsearlo**: las tres gráficas existen, se alimentan de agregados
calculados en PostgreSQL y **cuadran** con el histórico por tres vías independientes (SQL, `summarizeHistory`
y una derivación mía desde `/history`); la accesibilidad se mide sobre la paleta real y todas las
combinaciones declaradas cumplen AA; el filtro de pausa existe en `/` y `/reventa`; y el JWS del pase se
emite con el dueño **on-chain**.

Las reservas son sustantivas: (a) el comando de aceptación **no pasa** en el entorno documentado; (b) la
deuda de pausa está cerrada a medias (siguen ofreciéndose `mint` y `markCheckedIn`, y se bloquea un
`withdraw` que la cadena sí permite); (c) la deuda de titularidad está cerrada solo en la emisión del pase,
no en su canje; (d) la página del dashboard **sirve las cifras a clientes anónimos**; (e) la serie mensual
omite el 68 % del volumen primario aunque el dato es recuperable.

---

## 2. Defectos reales

### H1 · ALTA · `/admin/dashboard` entrega todas las cifras a un cliente anónimo
`apps/web/src/app/admin/dashboard/page.tsx:20-61` + `apps/web/src/components/admin/AdminLayout.tsx:227-265`
(ejecuta `fetchAggregates()` en el servidor y pasa `data` como prop al componente cliente `DashboardMetrics`);
`apps/web/src/middleware.ts:24-53` **no** autentica `/admin/*` (solo limita peticiones por IP).

El gate de sesión es **cliente**: `AdminLayout` oculta los hijos, pero el payload RSC que Next envía al
navegador ya contiene el elemento serializado de `DashboardMetrics` con los agregados. Reproducido contra el
build de producción real:

```powershell
pnpm --filter @hotel/web start --port 3210          # build existente en apps/web/.next
Invoke-WebRequest http://127.0.0.1:3210/admin/dashboard -UseBasicParsing   # SIN cookies
#  -> HTTP 200, y en el cuerpo:
#     {"primaryVolumeWei":"4350000000000000000","royaltiesWei":"110000000000000000",
#      "secondaryVolumeWei":"2200000000000000000","soldCount":31,"mintedCount":37,
#      "occupancyRatioPercent":83.78...,"lastBlock":23810,...}, ademas de monthlySeries y topResold
Invoke-WebRequest http://127.0.0.1:3210/api/admin/metrics -UseBasicParsing # SIN cookies -> HTTP 401
```

El endpoint `/api/admin/metrics` **sí** está protegido (401) y su docstring afirma «sin sesión válida → 401»;
la página que muestra lo mismo no lo está. M7 multiplicó la superficie de fuga al añadirle la serie, el
desglose y el ranking. Es el único defecto que veo merecedor de corrección antes de dar el hito por bueno.

### H2 · MEDIA · `pnpm test:e2e:m7` no pasa en el entorno documentado (dos causas, ambas del guion)
`packages/contracts/scripts/e2e/m7-dashboard.ts:462-490` (revisión de 12:17; el bloque es idéntico al anterior).

El chequeo de contadores fotografía `worker_aggregate_counters` **alrededor de su propio catch-up** y compara
el delta con las ventas de la corrida. Eso exige dos cosas que el guion no garantiza ni documenta:

1. **Ningún otro agregador escribiendo en la misma base.** Con el worker vivo (`:8787`, `POLL_INTERVAL_MS`
   por defecto 4000, `apps/worker/src/config.ts:34`) y bloques cada 2 s, el worker contabiliza las ventas del
   E2E antes de que el E2E lea `countersBefore`. Resultado de mi ejecución con `pnpm test:e2e:m7`:
   `+0 POL primaria, +0 reventa, +0 royalties, +0 vendidas, +0 minteadas` y aborto en la comprobación 5;
   el artefacto de evidencia no se reescribe (sigue el de las 11:56). Prueba de que el problema es el
   escritor concurrente, no la contabilidad: la base **sí** contiene las 5 ventas de mi corrida
   (bloques 23388-23406, tokens `10320270415`, `11920270515`, `20420270519`) y el `/aggregates` vivo las
   incluye (2027-04: 3 primarias 0,6 ETH + 2 reventas 0,4 ETH) mientras `countersBefore` es anterior a su
   propio `catchUp`.
2. **Agregado ya caliente.** Con una base nueva (o tras el `reset()` documentado) `countersBefore` = 0 y el
   `catchUp` reprocesa todo el histórico: el delta es el total de la cadena y la aserción falla igual. Lo
   reproduje con un esquema aislado (`search_path=m7_verif`, sin worker) →
   `+4.35 POL primaria, +2.2 POL reventa, +0.11 POL royalties, +31 vendidas, +37 minteadas`; y comprobé con
   `eth_getLogs` desde el bloque 0 que **esos totales son exactamente los eventos del contrato** (31 ventas
   primarias = 4,35 POL; 11 secundarias = 2,2 POL; `RoyaltyPaid` = 0,11 POL; 37 `Mint`; 4 `Burn`). Es decir:
   la contabilidad es correcta y quien falla es la suposición del guion.

Receta para obtener una corrida verde: parar el worker durante el E2E (la base del workspace ya está
caliente) o usar una base dedicada con el agregado precalentado. No la ejecuté así para no dejar el entorno
del padre sin worker; ver §4.

### H3 · MEDIA · La titularidad del pase se arregló al emitir, no al canjear
`packages/shared/src/reception/service.ts:278` (y el error `TITULARIDAD_CAMBIADA`, `route.ts:31`).

M7 movió la **emisión** del JWS a `ownerOf` (`apps/web/src/lib/ticket-ownership.ts:99-128`, los tres
endpoints usan `guestWallet: ownership.onChainOwner` — verificado). Pero el **canje** en recepción sigue
autorizando contra el índice off-chain (`nft.currentOwner`), y `markCheckedIn` **no** comprueba propiedad
on-chain (`packages/contracts/src/HotelNights.sol:194-206`: solo rol, existencia, `_soldOnce` y no consumida).
Consecuencia: si una noche se revende y el índice va retrasado (poll de 4 s; sin cota si el listener está
caído o atrasado — el incidente «worker mudo» de M6), un resguardo de 7 días emitido al dueño anterior
**consume una noche que ya no es suya** y el comentario de `service.ts:276-277` («el pase antiguo ya no
sirve») solo es cierto cuando el índice ya se ha puesto al día. La deuda de M5 era exactamente ésta
(`nfts.current_owner` en vez de la cadena) y quedó cerrada a medias.

### H4 · MEDIA · Siguen ofreciéndose operaciones pausables, y la pausa se diagnostica como fallo de RPC
- `apps/web/src/components/admin/AdminMint.tsx` (botón `mint-action`, `disabled={busy}`, líneas 246-254) no
  lee `paused()`, y `mint` es `whenNotPaused` (`HotelNights.sol:128-132`). Mitigación parcial: el revert se
  traduce después (`adminTxError.ts` → clave `paused`), o sea que el usuario se entera **tras** firmar.
  Contraste: `AdminExpired.tsx:48-53,147-173` sí lee `paused()` — el patrón existe y no se aplicó aquí.
- `apps/web/src/app/recepcion/page.tsx` no lee `paused()`, y `markCheckedIn` es `whenNotPaused`
  (`HotelNights.sol:194-198`). Un resguardo válido durante una pausa acaba en `ANCLAJE_FALLIDO`
  (`packages/shared/src/reception/service.ts:505-508`) → **HTTP 502**, que el propio mapa documenta como «el
  ancla on-chain no se pudo ejecutar (RPC o wallet)» (`apps/web/src/app/api/reception/checkin/route.ts:36`):
  una pausa deliberada se comunica como avería de infraestructura, y la vista no da ninguna pista.
- El guardián que afirma «ninguna vista ofrece una operación que la cadena va a revertir por pausa»
  (`apps/web/src/lib/paused-guardian.test.ts:5-17`) solo inspecciona `/`, `/reventa`, `NightCard` y el aviso:
  ni `AdminMint` ni `/recepcion` entran en su alcance, así que estos huecos pasan en verde.

### H5 · MEDIA · `AdminFunds` bloquea el `withdraw` que la cadena sí permite en pausa
`apps/web/src/components/admin/AdminFunds.tsx:22` (comentario «Como `withdraw` es `whenNotPaused`»),
`:117-121`, `:129` (`disabled={busy || nothingToWithdraw || isPaused}`) frente a
`packages/contracts/src/HotelNights.sol:320` (`withdraw()` solo lleva `onlyRole(TREASURER_ROLE) nonReentrant`;
**no** tiene `whenNotPaused`).

El propio repositorio dice lo contrario de la vista, en un test que pasa
(`packages/contracts/test/HotelNights.admin.t.sol:98`: `nft.withdraw(); // permitido en pausa (remediación)`;
la suite `HotelNights.admin.t.sol` da 13/13). La premisa falsa está escrita dos veces
(`AdminFunds.tsx:22` y `apps/web/src/components/admin/adminTxError.ts:9`, que también nombra `withdraw` como
`whenNotPaused`). Efecto: en el estado de emergencia la tesorería no puede retirar desde la UI. No pude
re-demonstrarlo en cadena porque el residual retirable es 0 (balance = `totalPending` = 0,85 ETH → `withdraw`
revierte `NoFunds` con o sin pausa); la fuente + el test del propio repo son concluyentes.

### H6 · MEDIA (datos) · La serie mensual omite el 68 % del volumen primario, y el dato es recuperable
`packages/shared/src/db/migrator.ts:210,221` (columna `block_timestamp` nullable; el `ALTER` no rellena nada)
y `apps/worker/src/aggregate-store.ts:144` (`WHERE block_timestamp IS NOT NULL`).

Medido en la base del workspace: 26 de 36 filas sin fecha; KPI primario 3,7 ETH frente a **1,2 ETH** de la
serie (32 %); faltan 2,5 ETH. Y las 26 filas **son recuperables**: verifiqué una a una que su bloque existe
en la cadena, que contiene la propia `tx_hash` de la fila y que tiene timestamp válido
(`%TEMP%\m7-undated-recoverable.mjs`): 26/26, pertenecientes a **2026-09 (22)** y **2026-12 (4)**. Lo
confirmé por la vía fuerte: al reprocesar el histórico desde el bloque 0 en un esquema limpio, las 42 filas
quedan **todas** datadas y la serie resultante coloca exactamente 22 ventas en 2026-09 y 4 en 2026-12. El
comentario del código («en lugar de inventar fecha», `migrator.ts:207-209`) es una falsa dicotomía: leer el
timestamp del bloque que contiene la propia venta no es inventar nada, y el remedio documentado en
`RepoTecnico/estado_proyecto.md:583` (un `reset` completo) además borra la idempotencia y reprocesa todo.
Está declarado en la UI (`DashboardMetrics.tsx:90-98`, `dashboard.undatedWarning`), por eso es MEDIA y no
bloqueante; pero el criterio «las cifras del dashboard cuadran con el histórico» hoy solo se cumple sobre el
subconjunto datado.

### H7 · BAJA · El guardián de accesibilidad solo lee `className` literales (14,6 % de los colores, fuera)
`apps/web/src/lib/a11y/color-usage.ts:102-116` (`extractClassAttributes` reconoce `className="..."`,
`className='...'` y plantillas **sin** `${}`) y `apps/web/src/lib/a11y/a11y.test.ts:98-102` construye las
`usages` solo con eso.

Medido con un parser propio equivalente: el guardián analiza **537** utilidades de color y en el producto hay
**629** → **92 (14,6 %)** quedan fuera, concentradas en constantes y ternarios/plantillas:
`FilterBar.tsx` 7/20, `AdminPause.tsx` 5/10, `AdminMint.tsx` 22/28, `CredentialForm.tsx` 9/16,
`WalletBar.tsx` 8/13, `NightCard.tsx` 14/16… Un `text-red-600` dentro de `const DANGER = "..."` o de un
ternario pasaría hoy el guardián. **No hay violación oculta ahora mismo**: al medir las 629 con las mismas
reglas del test (paleta real + composición alfa) salen 0 tokens fuera de paleta y 0 pares texto/fondo por
debajo de 4,5:1. El agujero es de *vigilancia*, no de estado.

### H8 · BAJA · La accesibilidad en navegador nunca ve el dashboard, y la excusa del documento es falsa
`apps/web/e2e/a11y.spec.ts:12` incluye `/admin/dashboard`, pero `apps/web/playwright.config.ts:30-35` fuerza
`WORKER_BASE_URL=http://127.0.0.1:1`: la página siempre pinta el estado degradado, así que **axe nunca escanea
las gráficas**, su leyenda ni las tablas alternativas. `docs/ACCESIBILIDAD-WCAG.md:103` justifica ese
pendiente con «hoy los binarios no están disponibles en el entorno»: en este workspace **sí** lo están
(`%LOCALAPPDATA%\ms-playwright` con `chromium-1234`, `chromium-1243` y `chromium_headless_shell`;
`@playwright/test` 1.60.0; y `apps/web/.next` tiene build de producción), luego la suite es ejecutable y el
hueco de cobertura es una decisión, no una imposibilidad.

### H9 · BAJA · El tercer estado del aviso de pausa es inalcanzable
`apps/web/src/app/page.tsx:59-65` y `apps/web/src/app/reventa/page.tsx:20-29` resuelven `paused` dentro del
mismo `Promise.all` que construye la lista: si falla `paused()`, revienta el `Promise.all`, `nights` queda
`null` y se pinta `DegradedState`. La rama «no se pudo comprobar» de
`apps/web/src/components/ContractPausedBanner.tsx:13-27` (que `paused-guardian.test.ts:53-57` se limita a
comprobar como texto) **nunca se renderiza**, y un fallo transitorio de `paused()` esconde el catálogo entero
en vez de mostrarlo con el aviso de estado desconocido.

### H10 · BAJA (latente) · El umbral de contraste se compara ya redondeado
`apps/web/src/lib/a11y/contrast.ts:31` devuelve `Number(ratio.toFixed(2))` y la línea 43 compara `ratio >= 4.5`.
Cualquier par con ratio real en **[4,495, 4,5)** se declara apto: lo demostré con un color sintético de ratio
real 4,4994 que la función devuelve como `4.5` (apto). Hoy no afecta a nada: el par real más ajustado es
`shell` sobre `terracotta` = **4,6165** y todas las combinaciones declaradas superan 4,5 con margen. Es una
trampa para el próximo token que alguien añada.

### H11 · BAJA · `pnpm test` es frágil bajo el paralelismo de turbo (no es de M7)
Primera ejecución de `pnpm test`: `@hotel/shared` **1 fallo / 244 pasan** en
`packages/shared/src/events/listener-events.test.ts:207` («la alerta de silencio se emite UNA vez por
episodio»), y turbo **aborta el run completo** (las suites de web y worker se cancelan sin resumen). Causa: el
test configura `silenceThresholdMs: 1` con temporizadores reales, así que basta superar 1 ms entre
`onNewBlock(200n)` y `checkSilenceAlert()` para que vuelva a alertar. Segunda ejecución: 7/7 tareas y 783
pruebas en verde. Es código de M6, pero hace que «783 pruebas en verde» dependa del planificador.

---

## 3. Qué comprobé yo mismo (comandos) y qué NO pude falsear

| Comprobación | Cómo | Resultado |
|---|---|---|
| Artefacto de evidencia (10 hashes) contra la cadena | `cast receipt` + decodificación de `Sale`/`RoyaltyPaid`/`Mint` con el ABI canónico (`%TEMP%\m7-chain-verify.mjs`) | 5 ventas y 2 `RoyaltyPaid` con **precio, `saleType`, comprador, `tokenId` y bloque idénticos** al artefacto; 0 discrepancias. `royaltyInfo()` recalculado por `eth_call` = 0,0075 / 0,0125 ETH declarados |
| Contadores vs recibos | `psql` sobre `worker_aggregate_counters` y `worker_sale_history` | `primary 3,7 = Σ` primarias del histórico, `secondary 1,8 = Σ`, `sold 27 = 27 filas primarias`, `undatedSalesCount 26 = COUNT(*) WHERE block_timestamp IS NULL` |
| Contadores vs cadena **desde el bloque 0** | esquema aislado + `eth_getLogs` de los 4 eventos | 4,35 POL primaria (31), 2,2 POL reventa (11), 0,11 POL royalties, 37 `Mint`, 4 `Burn` — **coincidencia exacta**; las 42 filas quedaron datadas |
| «Las cifras cuadran» (criterio de aceptación) | `/aggregates` vivo del worker vs recálculo por `psql` vs **mi propia** derivación desde `/history` | serie mensual, desglose por tipo y ranking (incluido el desempate `count desc, volumen desc, tokenId::NUMERIC asc` con 4 empates reales) **idénticos** por las tres vías |
| Mes del hotel vs mes UTC | 61.836 instantes comparando `date_trunc('month', ts AT TIME ZONE 'Europe/Madrid')` en PostgreSQL con `Intl` del dominio | **0 discrepancias** (incluye cambios de hora y fronteras de mes). Nota: el E2E de las 11:56 no ejercía ningún caso en que Madrid ≠ UTC; la revisión de las 12:17 añade esa frontera |
| Paleta y contraste (H-21) | comparación de `palette.ts` con `packages/config/tailwind/preset.cjs` + recálculo de la fórmula W3C | los 12 hex y las 12 claves coinciden; los **19 ratios documentados** se reproducen exactamente (15,95 / 14,81 / … / 5,38; `shell` sobre `terracotta` = 4,62) |
| Colores reales de todo el producto | sonda propia sobre **todos** los literales de `apps/web/src` (no solo `className`) | 0 tokens fuera de paleta, 0 pares texto/fondo <4,5:1 en el mismo literal |
| Pausa y titularidad | `cast call paused()`, `ownerOf` de quemado/inexistente, `hasRole(TREASURER_ROLE)`, lectura cruzada de `HotelNights.sol` y del guion E2E | `paused()` = false y `ownerOf` de quemado revierte (404 real); el resto según §2 |
| `pnpm test` | turbo completo, 2 veces, y luego por paquete | 1.ª: **falla** (shared 1/245, flakes, tareas canceladas). 2.ª: **7/7 tareas, 783 pruebas** — shared 245, worker 105, web 234, contracts 146, monitor 30, mcp 23 |
| `pnpm typecheck` | turbo (cacheado) y `--force` | **6/6**, 0 cacheadas en el forzado, exit 0 |
| `pnpm test:e2e:m7` | 2 ejecuciones (base compartida con worker vivo; esquema aislado y frío) | **falla** en la comprobación de contadores por las dos causas de H2; el artefacto de evidencia no se reescribe |
| Fuga del dashboard | build real servido en `:3210`, `Invoke-WebRequest` sin cookies | HTTP 200 con `primaryVolumeWei`, `monthlySeries`, `topResold`, `undatedSalesCount`; `/api/admin/metrics` 401 |

**No encontré ningún defecto en**: la matemática del contraste, la igualdad paleta/preset, la equivalencia
mes-SQL/mes-`Intl`, el desempate del ranking, la idempotencia por `txHash:logIndex`, el orden total del
histórico, la coherencia entre `resaleCount`/`resaleVolumeWei` y el histórico, ni en la emisión del JWS con el
dueño on-chain en los tres endpoints.

---

## 4. Reservas (lo que no pude verificar y por qué)

1. **No obtuve una corrida verde de `pnpm test:e2e:m7`.** Solo hay dos caminos y ambos estaban bloqueados: la
   base compartida tiene un escritor concurrente (el worker, que el padre necesita para la web) y una base
   nueva arranca fría. No paré el worker ni reinicié Anvil para no dejar el entorno del padre a medias; el
   guion de 12:17 sigue exigiendo esas condiciones y no las documenta. **No he verificado, por tanto, que la
   revisión actual produzca 27 (o más) comprobaciones verdes**: el artefacto de 27 es de la revisión anterior.
2. **H3 (canje del pase contra el índice) es un hallazgo de código, no reproducido de punta a punta**: haría
   falta una sesión `RECEPTION_ROLE` (usuario+contraseña+TOTP) y forzar un retraso del listener.
3. **H5 no lo pude demostrar en cadena** (residual retirable 0 → `NoFunds` con y sin pausa). Tampoco conseguí
   que funcionara el forzado de la ranura `_paused` con `cast call --override-state-diff` (devolvía
   `paused() = false`), así que la prueba es la fuente + el test del propio repositorio, no una transacción.
4. **No rendericé React ni ejecuté axe en navegador**: `apps/web` no tiene entorno DOM en vitest y no lancé
   Playwright (habría exigido un servidor de build propio mientras otro verificador puede estar usándolo).
   La conformidad axe de las gráficas reales sigue sin medirse (H8).
5. **H2/H11 dependen de la carga**: los recuentos son de las 12:12–12:22 con el worker vivo, la cadena minando
   cada 2 s y otros agentes trabajando sobre el mismo repositorio (el guion E2E cambió a las 12:17).
6. **No toqué el código del hito.** Restauré el entorno: borré el esquema auxiliar `m7_verif` que creé para
   aislar el E2E, paré el servidor de la prueba de fuga (`:3210`) y no sobrescribí
   `RepoTecnico/evidencias/m7-dashboard-anvil.json` (sigue con mtime 11:56).
