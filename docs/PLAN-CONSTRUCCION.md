# Plan de construcción — Hotel Marina del Sol

> Deriva de toda la especificación (`REQUISITOS`, `CASOS-DE-USO`, `DISENO-TECNICO`,
> `PLAN-DE-PRUEBAS`, `MATRIZ-TRAZABILIDAD`, `DISENO-UX`, `SPIKE-BESU`). Respeta los 4 hitos
> ya definidos, pero los reorganiza en **rebanadas verticales** (funcionalidad de punta a
> punta), no en capas.
> **Fecha:** 2026-06-04

## 0. Método

- **Tres niveles:** **Fase** (≈1 semana) → **Trabajo** (≈1–2 días) → **Tarea** (≈1–4 h).
- **Rebanadas verticales:** cada Trabajo entrega un **flujo de usuario demostrable
  end-to-end** (contrato + worker/MCP + web + tests), no una capa aislada.
- **Cimientos (Fase 0):** mínimo esqueleto compartido habilitador; se mantiene lo más
  delgado posible para no caer en capas horizontales.
- **1 tarea ≈ 1 commit atómico** con trailers `Refs:`/`Task:`/`Tests:` (MATRIZ §2).
- **Test-first:** se escribe el `TC-*` (rojo) antes del código (verde).
- **Revisión por trabajo:** al cerrar cada Trabajo, un **team de agentes** lo audita
  completo; las correcciones se aplican y se commitean antes de marcarlo *Done*.
- **Seguimiento (DX):** las tareas se gestionan con el sistema de tareas/`goal` del agente.

### Definición de terminado (DoD) — checklists verificables

**DoD Tarea** ✅
- [ ] Test(s) `TC-*` asociados escritos primero y **en verde**.
- [ ] Código implementado; sin `TODO`/`console.log`/`vm.skip` huérfanos.
- [ ] Lint + format + typecheck OK.
- [ ] Commit atómico con `Refs:`/`Task:`/`Tests:`.

**DoD Trabajo** ✅
- [ ] Todas sus Tareas en *Done* (DoD Tarea).
- [ ] Todos los `TC-*` del Trabajo verdes en CI (Anvil).
- [ ] Entregable **demostrable end-to-end** (flujo del usuario).
- [ ] **Auditoría del team de agentes** ejecutada; críticos/medios resueltos y commiteados.
- [ ] `MATRIZ-TRAZABILIDAD` actualizada (columna Commit) y cobertura sin huérfanos.
- [ ] Sin deuda crítica (`slither` sin *high* si toca contrato; axe sin *critical* si toca UI).

**DoD Fase** ✅
- [ ] Todos los Trabajos de la Fase en *Done*.
- [ ] **E2E de la rebanada** completo en verde (Playwright + MCP wallet).
- [ ] RNF de la fase verificados (rendimiento/accesibilidad/seguridad/observabilidad según aplique).
- [ ] **Demo end-to-end** grabable del flujo de la fase.
- [ ] Auditoría de fase (team) sin críticos abiertos.

---

## 1. Fases, trabajos y tareas

### FASE 0 — Cimientos (habilitador, ~3 días)
> Esqueleto compartido mínimo. **Camino crítico.**

**T0.1 — Scaffold del monorepo + `shared`** · *Refs:* DISENO-TECNICO §2/§13 · *Dep:* —
- Entregables: `pnpm`+`turbo`, `apps/{web,worker,mcp}`, `packages/{contracts,shared,config}`, `packages/shared` con constantes del spike (chainId 81234, fees, `CONFIRMATIONS_N=1`, breakpoints…).
- Aceptación: `pnpm i` OK; `turbo run build` no falla; `shared` exporta constantes tipadas.
- Tareas (h): (a) workspace+turbo 1h · (b) `config` (tsconfig/eslint/tailwind preset) 1h · (c) `shared/constants.ts` + tipos 2h · (d) README de arranque 1h.

**T0.2 — Esqueleto del contrato + CI** · *Refs:* ADR-02/06/24, RNF-16 · *Dep:* T0.1
- Entregables: `HotelNights.sol` con herencia OZ (ERC721+ERC2981+AccessControl+Pausable+ReentrancyGuard+Ownable2Step) compilando con `evmVersion=cancun`; harness Foundry; **job CI** (Anvil `--chain-id 81234`, `forge test`, vitest, playwright, slither, axe).
- Aceptación: `forge build` OK; `forge test` (vacío) verde; CI corre en PR; deploy de humo a Anvil OK.
- Tareas (h): (a) `foundry.toml` + remappings OZ 1h · (b) contrato esqueleto + roles 2h · (c) script de deploy + `deployments/<chainId>.json` 2h · (d) workflow CI 3h.

---

### FASE 1 — Vender una noche (Semana 1)
> Rebanada: **del minteo del admin a la compra del cliente con aviso por email.**
> **Camino crítico:** T1.1 → T1.3. **Paralelizable:** T1.2 (web) ∥ T1.4 (worker).

**T1.1 — Mintear una noche (admin)** · *Refs:* RF-01/05/18a/18b/19, RNF-14 · *CU:* CU-01/02 · *Dep:* T0.2
- Entregables: `mint()` + unicidad determinística + maestro hab→tipo + validación de rango on-chain; back-office `/admin/mint` con SIWE+rol; pipeline de metadata IPFS; faucet dev.
- Aceptación (CU-02): mint correcto emite `Mint` y queda DISPONIBLE; duplicado→`DuplicateNight`; fuera de maestro→`RoomNotInMaster`; precio 0→`InvalidPrice`; fecha pasada→`PastDate`; rango inválido→`InvalidDate`.
- Tests: TC-CT-010/011/012/013/014/015/016/017, TC-SH-001, TC-INT-001, TC-CT-001, TC-CT-100/101/102.
- Tareas (h): (a) test-first unicidad/mint 3h · (b) `mint`+maestro+rango 4h · (c) tokenId + invariant 2h · (d) pipeline metadata IPFS 3h · (e) SIWE + control de acceso 4h · (f) UI mint 3h · (g) faucet dev 2h.

**T1.2 — Catálogo público + filtros** · *Refs:* RF-02/14, RNF-01/02/11/12, Dec.23 · *CU:* CU-04 · *Dep:* T1.1 (datos), T0.1 — *∥ con T1.4*
- Entregables: lectura RPC (ventana 90d) + caché RSC/TanStack; grid responsive (tokens UX); filtros; paginación `load-more`; estados `empty/degraded/img-fallback`.
- Aceptación (CU-04): listado/filtros; RPC timeout→`degraded-state`+`retry`; imagen caída→`img-fallback`; LCP<2.5s; render<1s; sin scroll horizontal a 320px.
- Tests: TC-E2E-010/011/012/013/014, TC-NF-001/002/011/040.
- Tareas (h): (a) chain config + reads viem 3h · (b) catálogo RSC + caché 4h · (c) NightCard + tokens 3h · (d) filtros + paginación 3h · (e) estados + a11y 3h · (f) perf/LCP 2h.

**T1.3 — Comprar una noche (primaria)** · *Refs:* RF-03/01/04, RNF-05/14/18/19 · *CU:* CU-05/17 · *Dep:* T1.1, T1.2
- Entregables: `buy()` payable + guard `_update` transient (EIP-1153) + `soldOnce` + 100% a TREASURY (sin royalty); onboarding web3 (conectar/añadir red/estados tx); `TxModal` accesible.
- Aceptación (CU-05): compra OK (`Sale(PRIMARY)`, sin `RoyaltyPaid`); ya vendida→`NightNotAvailable`; expirada→`NightExpired`; reentrancy→revert+no-duplicación; concurrencia→exactamente una; rechazo de firma→sin cambios.
- Tests: TC-CT-020/021/022/023/024/025/018, TC-E2E-020/021/022/060/061/062/063, TC-CT-046 (guard).
- Tareas (h): (a) test-first compra/guard 3h · (b) `buy`+transient+`soldOnce` 4h · (c) invariant guard/soldOnce 2h · (d) onboarding web3 3h · (e) TxModal a11y 4h · (f) E2E MCP wallet 3h.

**T1.4 — Aviso de venta al admin** · *Refs:* RF-09, RNF-12/17 · *CU:* CU-10 · *Dep:* T1.1 (eventos) — *∥ con T1.2*
- Entregables: mini-worker (viem watch, `CONFIRMATIONS_N=1`), email (nodemailer mock en test), idempotencia+checkpoint SQLite, `/health`.
- Aceptación (CU-10): email tras `Sale` (1/idempotency-key); reinicio→catch-up sin duplicar; `/health` 200/503.
- Tests: TC-WK-001/002/003/004/005/006/030/031.
- Tareas (h): (a) listener+checkpoint 3h · (b) idempotencia+catch-up 3h · (c) email+backoff 2h · (d) `/health`+lag 2h.

---

### FASE 2 — Mercado secundario (Semana 2)
> Rebanada: **revender, comprar reventa con royalty, caducar/limpiar, operar.**
> **Camino crítico:** T2.1 → T2.2. **Paralelizable:** T2.3 ∥ T2.4.

**T2.1 — Listar / cancelar reventa** · *Refs:* RF-07, RNF-10 · *CU:* CU-06 · *Dep:* T1.3
- Entregables: `list/unlist` + `struct Listing`; UI «Mis noches» + `ResaleManager`.
- Aceptación (CU-06): listar→`Listed`; cancelar→`Unlisted`; no-owner→`NotOwner`; precio 0→`InvalidPrice`; expirada→`NightExpired`; sin listado→`NotListed`; re-list.
- Tests: TC-CT-030..036.
- Tareas (h): (a) test-first listing 2h · (b) list/unlist+struct 3h · (c) UI Mis noches 3h · (d) ResaleManager 3h.

**T2.2 — Comprar reventa con royalty** · *Refs:* RF-07/08/03, RNF-10/14 · *CU:* CU-07 · *Dep:* T2.1
- Entregables: `buyResale` + royalty ERC-2981 (fuente única) + **pull payments** + `claim()`.
- Aceptación (CU-07): reparto correcto (acredita receptor/vendedor) + `Sale(SECONDARY)`+`RoyaltyPaid`; precio no divisible→suma exacta; importe≠→`IncorrectPayment`; transfer directo→`DirectTransferDisabled`; reentrancy `buyResale`/`claim`→revert+no-dup; receptor-contrato que rechaza no bloquea.
- Tests: TC-CT-040..049.
- Tareas (h): (a) test-first reventa+royalty 3h · (b) `buyResale`+ERC2981 3h · (c) pull+`claim` 3h · (d) invariant contabilidad pull 2h · (e) reentrancy `claim` 2h · (f) UI cobrar 2h.

**T2.3 — Caducidad y burn** · *Refs:* RF-17 · *CU:* CU-13 · *Dep:* T1.1 — *∥ con T2.4*
- Entregables: expiración lógica + `burnExpired` (solo no vendidas, lote) + UI admin.
- Aceptación (CU-13): expirada no comprable/revendible; burn lote no-vendidas; cliente→`AlreadySold`; sin rol→revert; lote>max→`BatchTooLarge`; no expirado→`NotExpired`; en pausa→`EnforcedPause`.
- Tests: TC-CT-060..067.
- Tareas (h): (a) regla expiración + tests 2h · (b) `burnExpired` 3h · (c) UI «Caducadas» 2h.

**T2.4 — Royalty config + pausa + withdraw** · *Refs:* RF-08, RNF-13/15 · *CU:* CU-12/14/15 · *Dep:* T1.1 — *∥ con T2.3*
- Entregables: `setRoyaltyBps`, `pause/unpause`, `withdraw` (todo a TREASURY, nonReentrant), `setTreasury`; controles admin.
- Aceptación: bordes royalty {0..2000}; pausa bloquea compra/reventa/mint/burn; withdraw total+`Withdrawn`; sin rol→revert; sin fondos→`NoFunds`.
- Tests: TC-CT-050/051/070..083/094/095/096.
- Tareas (h): (a) royalty config+tests 2h · (b) pausa 2h · (c) withdraw+setTreasury 3h · (d) UI admin 2h.

---

### FASE 3 — Confianza y operación (Semana 3)
> Rebanada: **transparencia pública + panel del hotelero + robustez.**
> **Paralelizable:** T3.1 ∥ T3.2 (ambas sobre el worker); T3.4 transversal.

**T3.1 — Histórico público** · *Refs:* RF-15, RNF-05 · *CU:* CU-09 · *Dep:* T2.2
- Entregables: agregados del worker (paginación `getLogs`≤5000) + UI histórico (orden total, sin PII).
- Aceptación (CU-09): orden total; sin PII; token quemado sigue; vacío/degradado.
- Tests: TC-WK-010/011, TC-E2E-040/041/042.
- Tareas (h): (a) agregados+paginación 4h · (b) UI histórico 3h · (c) estados 2h.

**T3.2 — Dashboard admin** · *Refs:* RF-10, RNF-17 · *CU:* CU-11 · *Dep:* T2.2 — *∥ con T3.1*
- Entregables: métricas (vendido, royalties, ocupación=vendidas/minteadas) + UI.
- Aceptación (CU-11): ratio 30/100=30%; div/0→0%; royalties solo secundarias; degradado.
- Tests: TC-WK-020/021/022, TC-E2E-050/051.
- Tareas (h): (a) agregados métricas 3h · (b) UI dashboard 3h.

**T3.3 — Roles/ownership + observabilidad** · *Refs:* RF-06, RNF-13/17 · *CU:* CU-16 · *Dep:* T2.4
- Entregables: `grant/revoke` + Ownable2Step; monitor `/health` + alertas + lag.
- Aceptación (CU-16): grant/revoke con rol; sin admin→revert; ownership 2 pasos.
- Tests: TC-CT-090/091/092/093, TC-NF-020.
- Tareas (h): (a) roles/ownership 3h · (b) monitor+alertas 3h.

**T3.4 — Accesibilidad, rendimiento, i18n-ready** · *Refs:* RNF-01/11/19/20, RNF-06 · *Dep:* T1.2, T3.1, T3.2
- Entregables: axe-core en CI; presupuesto LCP; `next-intl` (ES) con claves aisladas.
- Aceptación: axe 0 critical/serious; LCP<2.5s; copy externalizado.
- Tests: TC-NF-030/040, TC-NF-001/002.
- Tareas (h): (a) a11y pass+axe 3h · (b) perf 2h · (c) i18n scaffolding 2h.

---

### FASE 4 — Asistente IA (Semana 4)
> Rebanada: **consultar y comprar conversando.** **Camino crítico:** T4.1 → T4.2 → T4.3.

**T4.1 — MCP server del contrato** · *Refs:* RF-12/02 · *CU:* CU-08 · *Dep:* T2.2
- Entregables: 4 herramientas (`listAvailableNights`,`checkAvailability`,`getOwnedNights`,`buildPurchaseTx`) read-only + preparación de tx (sin firma).
- Aceptación: `buildPurchaseTx` decodificable (to/value/chainId/selector) sin firma; filtro `type`.
- Tests: TC-MCP-001/002/003/004/007/008.
- Tareas (h): (a) server MCP + tools read 3h · (b) `buildPurchaseTx`+validación 3h.

**T4.2 — Orquestación LLM + guardrails** · *Refs:* RF-12, RNF-19 · *CU:* CU-08 · *Dep:* T4.1
- Entregables: LLM server-side (API route) + prompt acotado + verificación de tx (server+cliente).
- Aceptación: fuera de dominio→0 tool-calls; prompt injection no expone/no ejecuta; OOD≥48/50 (nightly).
- Tests: TC-MCP-005a/006, TC-NF-010.
- Tareas (h): (a) orquestación server-side 4h · (b) guardrails+validación 3h.

**T4.3 — Chat UI + estados** · *Refs:* RF-12, RNF-19 · *CU:* CU-08 · *Dep:* T4.2, T1.3 (TxModal)
- Entregables: panel chat + handoff a firma con tx decodificada + `assistant-unavailable`.
- Aceptación: chat→preparar→firmar con `value==priceOf`; indisponible→fallback manual.
- Tests: TC-E2E-030/031.
- Tareas (h): (a) chat UI 3h · (b) handoff+estados 3h.

---

### FASE 5 — Aceptación en Besu (Cierre, ~2 días)
**T5.1 — Deploy + aceptación on-chain** · *Refs:* RNF-03/22, todo · *CU:* — · *Dep:* todas
- Entregables: deploy a Besu staging; MetaMask real; medición X/Y/Z.
- Aceptación: TC-ACC-001/002/010/011/012 (bloque P50≤3s/P95≤6s; RPC P95≤400ms; 0 eventos perdidos; firma real).
- Tareas (h): (a) deploy + publicación ABI 2h · (b) TC-ACC + RNF-22 4h · (c) checklist de release 2h.

---

## 2. Camino crítico y paralelización

```
F0.1 ─ F0.2 ─┬─ T1.1 ─┬─ T1.3 ─ T2.1 ─ T2.2 ─┬─ T3.1 ┐
             │        │                       ├─ T4.1 ─ T4.2 ─ T4.3 ─ T5.1
             ├─ T1.2  │        (∥) T2.3       └─ T3.2 ┘
             └─(∥)    └─ T1.4  (∥) T2.4         (∥) T3.3 / T3.4
```
- **Camino crítico:** F0.1→F0.2→T1.1→T1.3→T2.1→T2.2→T4.1→T4.2→T4.3→T5.1 (la lógica del contrato encadena casi todo; el asistente depende de la reventa).
- **Paralelizable:** T1.2 (catálogo) ∥ T1.4 (worker); T2.3 ∥ T2.4; T3.1 ∥ T3.2 ∥ T3.3/T3.4. El **UX/componentes** (DISENO-UX) alimenta toda la web y puede prepararse en paralelo desde F0.
- **Recurso único (contrato):** T1.1/T1.3/T2.1/T2.2/T2.3/T2.4/T3.3 tocan `HotelNights.sol` → conviene **un solo responsable o worktrees** para evitar conflictos (aislar en ramas/worktree por trabajo).

## 3. Flujo de ejecución por Trabajo

1. `git switch -c work/T<x.y>-slug` (rama por trabajo).
2. **Test-first:** escribir `TC-*` (rojo) → commit `test: …`.
3. Implementar tareas → **commits atómicos** (`feat/fix: … + Refs/Task/Tests`).
4. `forge test` + vitest + playwright + lint en verde.
5. **Auditoría del team de agentes** del Trabajo completo → informe.
6. Aplicar correcciones → commits → re-verificar.
7. Actualizar `MATRIZ-TRAZABILIDAD` (Commit) → marcar Trabajo *Done* (DoD).
8. Merge a `main` (o PR) cuando la Fase cierra su E2E.

## 4. Estado
- **Fase 0** en curso (scaffold). Resto encolado según este plan.
