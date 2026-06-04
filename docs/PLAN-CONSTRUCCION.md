# Plan de construcción — Hotel Marina del Sol

> Deriva de toda la especificación. Respeta los 4 hitos, reorganizados en **rebanadas
> verticales**. **Versión 2** — incorpora las correcciones de la auditoría
> ([`REVISION-PLAN-CONSTRUCCION.md`](./REVISION-PLAN-CONSTRUCCION.md)): cobertura completa
> (secretos, /health MCP+faucet, bootstrap de roles, fixtures, despliegue), numeración de
> tareas unificada con la matriz, DoD por tipo de fase, dependencias corregidas, capacidad
> declarada y carga rebalanceada.
> **Fecha:** 2026-06-04

## 0. Método

- **Tres niveles:** **Fase** → **Trabajo** (`T<fase>.<n>`, ≤ ~16 h) → **Tarea** (≈1–4 h).
- **Numeración canónica:** `T<fase>.<n>` (este id es el único; la `MATRIZ-TRAZABILIDAD`
  usa el mismo). 1 Trabajo = 1 PR; 1 Tarea ≈ 1 commit atómico con `Refs:`/`Task:`/`Tests:`.
- **Capacidad asumida:** **1 desarrollador, ~40 h/semana** (supuesto — ajustar si cambia).
  Por eso «Fase» = iteración; cada fase declara **horas vs capacidad** (una fase de >40 h
  ocupa >1 semana o requiere un 2.º dev en lo paralelizable).
- **Rebanadas verticales:** cada Trabajo entrega un flujo end-to-end demostrable; la
  **Fase 0** es el mínimo habilitador (no es rebanada, tiene DoD propio).
- **Test-first**, **commits atómicos**, **revisión por team de agentes por Trabajo**.

### DoD — checklists verificables

**DoD Tarea** ✅ test(s) `TC-*` escritos primero y en verde · sin `TODO`/`console.log` huérfanos · lint+typecheck OK · commit atómico con trailers.

**DoD Trabajo** ✅ todas sus Tareas *Done* · `TC-*` del Trabajo verdes en CI · **cobertura** (contrato 100 % ramas de su lógica; worker/MCP ≥90 % líneas) · **invariants del Trabajo sin contraejemplo** (TC-CT-017/018/046/049 en su Trabajo de origen) · entregable demostrable · **auditoría del team aplicada** · `MATRIZ` actualizada (Commit) · sin deuda crítica (slither sin *high*; axe sin *critical* si toca UI).

**DoD Fase — por tipo:**
- **Habilitadora (F0):** ✅ pipeline CI verde end-to-end (compila, deploy de humo a Anvil `--chain-id 81234`, suites vacías verdes), `shared` publicado, secretos inyectables.
- **De rebanada (F1–F4):** ✅ todos los Trabajos *Done* · **E2E de la rebanada** en verde (Playwright + MCP wallet) · RNF de la fase verificados (tabla Fase→RNF/TC abajo) · **demo end-to-end** grabable.
- **Aceptación (F5):** ✅ `TC-ACC-*` y RNF-22 en Besu staging · checklist de release.

**Tabla Fase → RNF/TC verificados**
| Fase | RNF / TC |
|------|----------|
| F1 | RNF-01/02/11 (TC-NF-001/002/040), RNF-05, RNF-12/14/17 (parcial), RNF-19 |
| F2 | RNF-10/14/15 (TC-CT reentrancy/guard/pausa), TC-NF-050 (slither) |
| F3 | RNF-17 (TC-NF-020/WK-030/031), RNF-20 (TC-NF-030), RNF-11 (LCP) |
| F4 | RNF-19; OOD = indicador **nightly** (TC-NF-010, no es gate de Done) |
| F5 | RNF-03/22 (TC-ACC-001/002/010/011/012) |

---

## FASE 0 — Cimientos (habilitador) · **~22 h (≈0,6 sem)** · *camino crítico*

**T0.1 — Scaffold monorepo + `shared` + decisiones de infra** · *Refs:* DISENO §2/§13/§16 · *Dep:* —
- Entregables: pnpm+turbo; `apps/{web,worker,mcp}`+`packages/{contracts,shared,config}`; `shared/constants.ts` (chainId 81234, fees, `CONFIRMATIONS_N=1`, `GETLOGS_MAX_RANGE`, breakpoints, `MIN_GAS_PRICE_WEI`, `FAUCET_*`); **decisión Pinata vs Kubo** + subida única de las 3 imágenes a IPFS (CIDs en `shared`).
- Aceptación: `pnpm i` + `turbo build` OK; `shared` exporta constantes tipadas; 3 CIDs de imagen fijados.
- Tareas (h): workspace+turbo 1 · config 1 · constants+tipos 2 · decisión+subida IPFS 2.

**T0.2 — Esqueleto del contrato + bootstrap de roles + CI** · *Refs:* ADR-02/06/24, RNF-14/16 · *Dep:* T0.1
- Entregables: `HotelNights.sol` (OZ, `evmVersion=cancun`) con **6 roles** (DEFAULT_ADMIN, MINTER, ROYALTY_ADMIN, PAUSER, BURNER, **TREASURER**); script de deploy con **bootstrap** (asignar roles → revocar EOA) + `deployments/<chainId>.json {address, deploymentBlock, abiHash}`; CI (Anvil `--chain-id 81234`, forge/vitest/playwright/slither/axe).
- Aceptación: `forge build` OK; deploy de humo a Anvil; `hasRole` correcto para los 6 roles y EOA revocado (test); CI verde en PR.
- Tareas (h): foundry+remappings 1 · contrato esqueleto+roles 2 · deploy+bootstrap+deployments.json 3 · workflow CI 3.

**T0.3 🆕 — Gestión de secretos + fixtures + rebind** · *Refs:* DISENO §12/§14, REQUISITOS §10, RNF-13, PLAN-PRUEBAS §3 · *Dep:* T0.2
- Entregables: **secret manager por entorno** (`.env.example`, inyección en CI y runtime web/worker/mcp/api-route, rotación, *cero secretos en repo*); **seed/fixtures** (mint 50×90, wallets prefinanciadas por faucet, ventas/listados de ejemplo); **script de rebind** del checkpoint del worker + re-cálculo de agregados en redeploy.
- Aceptación: arranque fail-fast si falta un secreto; `grep` de secretos en repo = 0; seed reproducible; test «address cambia → worker reprocesa sin duplicar».
- Tareas (h): secret manager 3 · seed/fixtures 50×90 2 · rebind+deployments 2.

---

## FASE 1 — Vender una noche · **~62 h (≈1,5 sem a 40 h, o 1 sem con 2 devs)**
> Rebanada: del minteo a la compra con aviso. **CP:** T1.1→T1.3. **∥:** T1.2 ∥ T1.4 (∥ entre sí, ambas tras T1.1).

**T1.1 — Mintear una noche (contrato + admin)** · *Refs:* RF-01/05/18a/18b/19, RNF-14 · *CU:* CU-01/02 · *Dep:* T0.2, T0.3 · **~16 h**
- Entregables: `mint()`+unicidad+maestro hab→tipo+rango on-chain; calendario off-chain (`TC-SH-001`); back-office `/admin/mint` (SIWE+rol); pipeline metadata IPFS (**CID fijado ANTES del mint**); faucet dev **con `/health` + `FAUCET_LOW_THRESHOLD`**.
- Aceptación (CU-02): mint OK→`Mint`+DISPONIBLE; duplicado→`DuplicateNight`; fuera maestro→`RoomNotInMaster`; precio 0→`InvalidPrice`; fecha pasada→`PastDate`; rango inválido→`InvalidDate`; **`tokenURI` resoluble en el bloque del mint**; rechazo de firma→sin cambios (`TC-E2E-022` parte CU-02).
- Tests: TC-CT-001/010..017, TC-SH-001, TC-INT-001, TC-CT-100/101/102 (faucet+saldo bajo).
- Tareas (h): test-first 3 · mint+maestro+rango 4 · tokenId+invariant 2 · metadata IPFS (CID pre-mint) 2 · SIWE+acceso 3 · UI mint 2 · faucet+/health 2. *(→ partir en PR contrato / PR back-office)*

**T1.2 — Catálogo público + filtros** · *Refs:* RF-02/14, RNF-01/02/11/12, Dec.23 · *CU:* CU-04 · *Dep:* T1.1 · *∥ con T1.4* · **~16 h**
- Entregables: lectura RPC (ventana 90d)+caché RSC/TanStack; grid responsive; filtros (no permite 0); paginación `load-more`+`end-of-list`; estados `empty/degraded/img-fallback`; **render del estado `LISTADA_SECUNDARIO`** (badge Reventa/precio) para que CU-07 sea descubrible.
- Aceptación (CU-04): listado/filtros; **catálogo vacío→`empty-state` 0 tarjetas (TC-E2E-014)**; RPC timeout→`degraded-state`+`retry`; imagen caída→`img-fallback`; muestra reventas; LCP<2.5s; render<1s; sin scroll horizontal 320px.
- Tests: TC-E2E-010/011/012/013/014, TC-NF-001/002/011/040.
- Tareas (h): reads viem 3 · catálogo RSC+caché 4 · NightCard+tokens+reventa 3 · filtros+paginación 3 · estados+a11y 3.

**T1.3 — Comprar una noche (primaria) + onboarding** · *Refs:* RF-03/01/04, RNF-05/14/18/19 · *CU:* CU-05/17 · *Dep:* T1.1, T1.2 · **~18 h**
- Entregables: `buy()` payable+guard `_update` transient (EIP-1153)+`soldOnce`+100 % a TREASURY; onboarding web3; `TxModal` accesible.
- Aceptación (CU-05): compra OK (`Sale(PRIMARY)`, sin `RoyaltyPaid`); ya vendida→`NightNotAvailable`; expirada→`NightExpired`; reentrancy→revert **+ no-duplicación**; concurrencia→exactamente una; rechazo firma→sin cambios.
- **Aceptación (CU-17):** conexión + alta de red (chainId 81234) habilita compra (TC-E2E-060); sin `window.ethereum`→`no-wallet`+guía (TC-E2E-061); red incorrecta→`wrong-network` sin construir tx (TC-E2E-062); estados de tx pendiente/confirmada/revertida (TC-E2E-063); **rechazo de conexión (17b) sin error bloqueante (TC-E2E-064 🆕)**.
- Tests: TC-CT-018/020..025/046, TC-E2E-020/021/022/060..064.
- Tareas (h): test-first 3 · `buy`+transient+`soldOnce` 4 · invariant guard/soldOnce 2 · onboarding 3 · TxModal a11y 4 · E2E 2.

**T1.4 — Aviso de venta (worker)** · *Refs:* RF-09, RNF-12/17 · *CU:* CU-10 · *Dep:* T1.1, T0.3 · *∥ con T1.2* · **~12 h**
- Entregables: mini-worker (`CONFIRMATIONS_N=1`), email idempotente+checkpoint SQLite, `/health`+lag, secretos SMTP (T0.3).
- Aceptación (CU-10): email tras `Sale` (1/idempotency-key); reinicio→catch-up sin duplicar; fallo SMTP→backoff+alerta; `/health` 200/503+`COMPONENT_DOWN`.
- Tests: TC-WK-001..006/030/031.
- Tareas (h): listener+checkpoint 3 · idempotencia+catch-up 3 · email+backoff 2 · `/health`+lag 2 · rebind hook 2.

---

## FASE 2 — Mercado secundario · **~52 h (≈1,3 sem)**
> **CP:** T2.1→T2.2. **∥:** T2.3 ∥ T2.4 → **ambos tocan `HotelNights.sol`: en worktrees separados, integra T2.3 antes** (ver §3).

**T2.1 — Listar / cancelar reventa** · *Refs:* RF-07, RNF-10 · *CU:* CU-06 · *Dep:* T1.3 · **~12 h**
- Entregables: `list/unlist`+`struct Listing`; UI «Mis noches»+`ResaleManager`.
- Aceptación (CU-06): listar→`Listed`; cancelar→`Unlisted`; no-owner→`NotOwner`; precio 0→`InvalidPrice`; expirada→`NightExpired`; sin listado→`NotListed`; re-list; **rechazo de firma→sin cambios (TC-E2E-022 parte CU-06)**.
- Tests: TC-CT-030..036.

**T2.2 — Comprar reventa con royalty (end-to-end)** · *Refs:* RF-07/08/03, RNF-10/14 · *CU:* CU-07 · *Dep:* T2.1 · **~18 h**
- Entregables: `buyResale`+royalty ERC-2981 (fuente única)+**pull payments**+`claim()`; **UI comprar reventa** y **UI cobrar (claim)** diferenciadas.
- Aceptación (CU-07): reparto (acredita receptor/vendedor)+`Sale(SECONDARY)`+`RoyaltyPaid`; no divisible→suma exacta; importe≠→`IncorrectPayment`; transfer directo→`DirectTransferDisabled`; reentrancy `buyResale`/`claim`→revert+no-dup; receptor que rechaza ETH no bloquea; **listado inexistente→`NotListed` (TC-CT-047)**.
- Tests: TC-CT-040..049, **TC-E2E-023 🆕** (card Reventa→firma→`ownerOf`+`Sale(SECONDARY)`+`RoyaltyPaid`+pull).

**T2.3 — Caducidad y burn** · *Refs:* RF-17 · *CU:* CU-13 · *Dep:* T1.1, **T1.3** (soldOnce/ADR-16) · *∥ con T2.4* · **~10 h**
- Aceptación (CU-13): expirada no comprable/revendible; burn lote no-vendidas; cliente→`AlreadySold`; sin rol→revert; lote>max→`BatchTooLarge`; no expirado→`NotExpired`; en pausa→`EnforcedPause`. Tests: TC-CT-060..067.

**T2.4 — Royalty config + pausa + withdraw + setTreasury** · *Refs:* RF-08, RNF-13/15 · *CU:* CU-12/14/**16** · *Dep:* T1.1 · *∥ con T2.3* · **~12 h**
- Entregables: `setRoyaltyBps`, `pause/unpause`, `withdraw` (**rol `TREASURER`**, todo a TREASURY, nonReentrant), `setTreasury`.
- Aceptación: bordes royalty {0..2000}; **en pausa se bloquean** compra/reventa/mint/burn **y se permiten** withdraw (TC-CT-072) y grant/revoke (TC-CT-076); **tras unpause compra→`Sale(PRIMARY)` (TC-CT-073)**; withdraw total+`Withdrawn`, sin rol→revert, sin fondos→`NoFunds`, reentrancy→revert+saldo 0 (TC-CT-083); `setTreasury` OK+`TreasuryUpdated`, address(0)→revert, sin rol→revert (TC-CT-094/095/096).
- Tests: TC-CT-050/051/070..083/094/095/096.

---

## FASE 3 — Confianza y operación · **~34 h (≈0,9 sem)**
> **∥:** T3.1 ∥ T3.2 (ambas dep T2.2 **y T1.4** infra worker). T3.3 dep T2.4. **T3.4 sucede a T3.1/T3.2**.

**T3.1 — Histórico público** · *Refs:* RF-15, RNF-05 · *CU:* CU-09 · *Dep:* T2.2, **T1.4** · **~9 h**
- Agregados worker (paginación `getLogs`≤5000) + UI. Aceptación (CU-09): orden total; sin PII; token quemado sigue; vacío/degradado (TC-E2E-041/042). Tests: TC-WK-010/011, TC-E2E-040/041/042.

**T3.2 — Dashboard admin** · *Refs:* RF-10, RNF-17 · *CU:* CU-11 · *Dep:* T2.2, **T1.4** · *∥ T3.1* · **~6 h**
- Aceptación (CU-11): ratio 30/100=30 %; div/0→0 %; royalties solo secundarias; **cada métrica con unidad (ETH) y periodo (TC-E2E-050)**; degradado. Tests: TC-WK-020/021/022, TC-E2E-050/051.

**T3.3 — Roles/ownership + observabilidad** · *Refs:* RF-06(CU-16), RNF-13/17 · *CU:* CU-16 · *Dep:* T2.4 · **~9 h**
- Entregables: `grant/revoke`+Ownable2Step; **monitor que sondea `/health` de worker+MCP+faucet** + alertas + lag.
- Aceptación: grant/revoke con rol; sin admin→revert; ownership 2 pasos (TC-CT-090..093); **monitor: 503/`COMPONENT_DOWN` o lag>umbral → alerta (TC-NF-020)** sin duplicar `/health` del worker.
- Tests: TC-CT-090..093, TC-NF-020.

**T3.4 — Accesibilidad, rendimiento, i18n-ready** · *Refs:* RNF-01/11/19/20, RNF-06 · *Dep:* T1.2, T3.1, T3.2 · **~7 h**
- axe-core en CI (TC-NF-030, 0 critical/serious); presupuesto LCP; `next-intl` (ES). Tests: TC-NF-030/040, TC-NF-001/002.

---

## FASE 4 — Asistente IA · **~28 h (≈0,7 sem)** · *CP:* T4.1→T4.2→T4.3

**T4.1 — MCP server del contrato** · *Refs:* RF-12/02 · *CU:* CU-08 · *Dep:* T2.2 · **~10 h**
- Entregables: 4 herramientas read-only + `buildPurchaseTx` (sin firma) + **`/health` del MCP**.
- Aceptación: `buildPurchaseTx` decodificable (to/value/chainId/selector); filtro `type`; `/health` 200/503. Tests: TC-MCP-001/002/003/004/007/008, **`/health` (TC-NF-020 lo monitoriza)**.
- Tareas (h): server+tools read 3 · `buildPurchaseTx`+validación server-side (TC-MCP-004) 3 · transporte HTTP 2 · `/health` 2.

**T4.2 — Orquestación LLM + guardrails** · *Refs:* RF-12, RNF-19 · *CU:* CU-08 · *Dep:* T4.1 · **~10 h**
- Entregables: LLM server-side (API route, secreto `ANTHROPIC_API_KEY` de T0.3) + prompt acotado + verificación de tx.
- Aceptación (**DoD = deterministas**): fuera de dominio→0 tool-calls (TC-MCP-005a); prompt injection no expone/no ejecuta (TC-MCP-006). **OOD≥48/50 = indicador nightly (TC-NF-010), NO gate de Done.**
- Tareas (h): orquestación server-side 4 · prompt+guardrails 3 · validación/verificación tx 3.

**T4.3 — Chat UI + estados** · *Refs:* RF-12, RNF-19 · *CU:* CU-08 · *Dep:* T4.2, T1.3 · **~8 h**
- panel chat + handoff a firma con tx decodificada (`value==priceOf`) + `assistant-unavailable`. Tests: TC-E2E-030/031.

---

## FASE 5 — Aceptación en Besu · **~16 h (≈0,4 sem)** · *Dep:* todas
> **Precondición bloqueante:** wallet de pruebas financiada en Besu 81234 (responsable Codecrypto) + buffer por inestabilidad de la red (estuvo caída).

**T5.1 — Despliegue + aceptación on-chain** · *Refs:* RNF-03/22/21 · *Dep:* todas
- Entregables: deploy del contrato + **despliegue coordinado de web/worker/mcp** en Besu (variables por entorno, orden de arranque, `/health`); MetaMask real; medición X/Y/Z; **runbook de operación por componente (RNF-21)**.
- Aceptación: TC-ACC-001/002/010/011/012 (bloque P50≤3s/P95≤6s; RPC P95≤400ms; 0 eventos perdidos; firma real); slither sin *high* + triage de *medium* (TC-NF-050); checklist de release.
- Tareas (h): deploy contrato+ABI 2 · despliegue web/worker/mcp+secretos 3 · suite worker en Besu (RNF-22 Z) 3 · TC-ACC + MetaMask real 4 · runbook+release 2 · buffer 2.

---

## 2. Camino crítico y paralelización

```
T0.1 → T0.2 → T0.3 ┐
                   ├ T1.1 ─┬─ T1.2 ─────┐
                   │       ├─ T1.4 ─────┤(∥ T1.2)
                   │       └─ T1.3 ◄────┘(dep T1.1,T1.2)
                   │            │
                   │            └ T2.1 → T2.2 ─┬─ T3.1 ◄ (dep T2.2,T1.4) ┐
                   │                  │        ├─ T3.2 ◄ (dep T2.2,T1.4) ─┤→ T3.4
                   │                  │        └─ T4.1 → T4.2 → T4.3      │
                   ├ (T2.3 dep T1.1,T1.3) ∥ (T2.4 dep T1.1) → T3.3 ◄ (dep T2.4)
                   └ todas ───────────────────────────────────────────────→ T5.1
```
- **Camino crítico (por horas):** T0.1→T0.2→T0.3→T1.1→T1.3→T2.1→T2.2→T4.1→T4.2→T4.3→T5.1 ≈ **núcleo contrato+IA**. Cadena competidora (operación T3.1/T3.2→T3.4) es más corta; domina la de IA.
- **Paralelizable:** T1.2 ∥ T1.4; T2.3 ∥ T2.4; T3.1 ∥ T3.2. Con 1 dev se serializa; un 2.º dev en la web/worker acorta F1/F3.
- **Recurso único `HotelNights.sol`** (T1.1/T1.3/T2.1/T2.2/T2.3/T2.4/T3.3): **un solo responsable**; los ∥ que tocan el contrato (T2.3/T2.4) van en **worktrees** e **integran T2.3 antes que T2.4** para minimizar conflictos.
- **Total ≈ 214 h ≈ 5,4 semanas** a 40 h/sem (1 dev). Con 2 devs en lo paralelizable ≈ 4 semanas.

## 3. Flujo de ejecución por Trabajo
1. `git switch -c work/T<x.y>-slug` (o `git worktree` si toca el contrato en paralelo).
2. **Test-first** (`TC-*` rojo) → `test: …`.
3. Tareas → **commits atómicos** (`feat/fix … + Refs/Task/Tests`).
4. CI verde (forge/vitest/playwright/lint/slither/axe).
5. **Auditoría del team de agentes** del Trabajo → correcciones → commits.
6. `MATRIZ` (Commit) actualizada → **1 Trabajo = 1 PR** contra la **rama de fase** con PR-gate obligatorio.
7. **Integración del contrato:** un único responsable mergea los Trabajos que tocan `HotelNights.sol`; conflictos en `packages/shared` se resuelven por rebase del último.
8. Rama de fase → `main` al cerrar el **DoD Fase** (E2E de la rebanada). Responsable de merge: lead.

## 4. Estado
- Pre-construcción: especificación + plan **auditados**. Pendiente: arrancar **Fase 0**.
