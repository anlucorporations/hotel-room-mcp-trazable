# Matriz de trazabilidad end-to-end — Hotel Marina del Sol

> Cadena **Requerimiento → Caso de uso → Escenario → Test → Trabajo → Commit → Código**.
> **Versión 3** — numeración de tareas **unificada con `PLAN-CONSTRUCCION.md`**
> (`T<fase>.<n>`, sin `T-NNN`); RF-06 dividido (CU-01 vs CU-16); `setTreasury`, secretos y
> `/health` trazados; alineada con la auditoría del plan.
> **Fecha:** 2026-06-04

## 1. Modelo y estado de la cadena
```
RF/RNF ─► CU ─► Escenario (Gherkin/EARS) ─► Test (TC-*) ─► Trabajo (T<fase>.<n>) ─► Commit ─► Código
   ✅       ✅           ✅                     ✅                 ✅                    ✅        ✅
```
✅ **FASES 0–4.5 implementadas, commiteadas y pusheadas** (contrato + worker + MCP + web con
UX «Mediterráneo», back-office completo y asistente IA): commits atómicos `T<fase>.<n>` en
`main` (GitLab). Suites verdes: forge 75 · vitest 156 (shared/web/mcp/worker/monitor) · E2E
Playwright (chromium+mobile) + compra real con wallet on-demand. ✅ **FASE 5 (T5.1) ejecutada**
en Besu 81234: contrato desplegado (`0x9fD16e…`, owner aceptado, EOA revocado) + faucet, y
aceptación `TC-ACC-010/011/012` PASS + compra primaria real firmada (`ownerOf`→comprador,
worker `soldCount=1`). Ver runbook §1.5.

## 2. Convención de commit (traza hasta el commit)
```
feat(contracts): buyResale con royalty por pull

Refs: RF-07, RF-08, CU-07
Task: T2.2
Tests: TC-CT-040, TC-CT-041, TC-CT-044, TC-CT-048, TC-CT-049
```
`Refs:` requisitos+CU · `Task:` Trabajo (`T<fase>.<n>`) · `Tests:` los `TC-*` que pasa.
Traza inversa `git log --grep "RF-08"`; verificación `sdd-traceability-check`.

## 3. Trabajos (única numeración canónica = la del plan de construcción)
`T0.1` scaffold+shared+IPFS · `T0.2` esqueleto contrato+roles+bootstrap+CI · `T0.3` secretos+fixtures+rebind ·
`T1.1` mint+admin+faucet · `T1.2` catálogo+filtros · `T1.3` compra primaria+onboarding · `T1.4` worker email ·
`T2.1` listar/cancelar · `T2.2` comprar reventa+royalty+claim · `T2.3` caducidad/burn · `T2.4` royalty/pausa/withdraw/setTreasury ·
`T3.1` histórico · `T3.2` dashboard · `T3.3` roles/ownership+observabilidad · `T3.4` a11y/perf/i18n ·
`T4.1` MCP server · `T4.2` orquestación LLM · `T4.3` chat UI · `T5.1` deploy+aceptación Besu.

## 4. Matriz maestra (RF → … → código)
> Commit `—` = pendiente. Código = path previsto (DISEÑO §2/§4).

| RF | CU | Tests (TC) | Trabajo(s) | Commit | Código previsto |
|----|----|-----------|-----------|--------|-----------------|
| RF-01 | CU-02, CU-05 | TC-CT-010/017, TC-CT-020 | T0.2, T1.1, T1.3 | — | `packages/contracts/src/HotelNights.sol` |
| RF-02 | CU-04, CU-08 | TC-E2E-010, TC-MCP-001/008 | T1.2, T4.1 | — | `apps/web/src/app/page.tsx` + `src/components/{catalog,CatalogClient,NightCard}`, `apps/mcp/src` |
| RF-03 | CU-05, CU-07 | TC-CT-020, TC-CT-040, TC-ACC-001 | T1.3, T2.2 | — | `HotelNights.sol` |
| RF-04 | CU-17, CU-05/07 | TC-E2E-060..064, TC-E2E-020/023, TC-ACC-002 | T1.3, T4.3, **Rev.** | — | `apps/web/src/config/chain.ts`, `packages/shared/src/network.ts`, `apps/web/src/components/wallet/{useOnboarding,WalletBar,switchChainError}.tsx` (onboarding guiado + manejo error 4902) |
| RF-05 | CU-02 | TC-CT-010 | T1.1 | — | `apps/web/src/app/admin/mint`, `HotelNights.sol` |
| RF-06 (CU-01) | CU-01 | TC-INT-001, TC-CT-001 | T1.1 | — | `HotelNights.sol`, `apps/web/src/lib/{session,nonce-store}.ts` + `src/app/api/auth/*` |
| RF-06 (CU-16) | CU-16 | TC-CT-090/091/092/093 | **T3.3** | — | `HotelNights.sol` (AccessControl/Ownable2Step) |
| RF-07 | CU-06, CU-07 | TC-CT-030..036, TC-CT-040..049, TC-E2E-023 | T2.1, T2.2 | — | `HotelNights.sol` |
| RF-08 | CU-07, CU-12 | TC-CT-040/041, TC-CT-050/051 | T2.2, T2.4 | — | `HotelNights.sol` |
| RF-09 | CU-10 | TC-WK-001..006 | T1.4 | — | `apps/worker/src` |
| RF-10 | CU-11 | TC-WK-020/021/022, TC-E2E-050/051 | T3.2 | — | `apps/worker`, `apps/web/src/app/admin/dashboard` (gateado server-side bajo `/admin/layout.tsx`, CU-11) |
| RF-12 | CU-08 | TC-MCP-001..008, TC-E2E-030/031 | T4.1, T4.2, T4.3 | — | `apps/mcp/src`, `apps/web/src/{lib,components}/assistant`, `apps/web/src/app/{asistente,api/assistant}`, `packages/shared/src/domain/purchase-tx.ts` |
| RF-14 | CU-04 | TC-E2E-011 | T1.2 | — | `apps/web/src/app/page.tsx` + `src/components/{catalog,CatalogClient,NightCard}` |
| RF-15 | CU-09 | TC-WK-010/011, TC-E2E-040/041/042 | T3.1 | — | `apps/worker`, `apps/web/src/app/historico` |
| RF-17 | CU-13 | TC-CT-060..067 | T2.3 | — | `HotelNights.sol` |
| RF-18a | CU-02 | TC-CT-012 | T1.1 | — | `HotelNights.sol`, `packages/shared/src/domain/room-master.ts` |
| RF-18b | CU-02 | TC-CT-010 | T1.1 | — | `HotelNights.sol` |
| RF-19 | CU-02 | TC-CT-011/016/017 | T1.1 | — | `HotelNights.sol` |
| RF-21 | CU-PR-01 | TC-CT-100/101/102 | T1.1 (faucet dev), **Rev.** | — | `packages/contracts/src/Faucet.sol` (testeado) + `script/Deploy.s.sol` (deploy+fund gateado por `DEPLOY_FAUCET`) + `apps/web/src/components/wallet/{useFaucet,FaucetButton}.tsx` + `packages/shared/src/domain/faucet.ts`. **End-to-end** (deploy→fund→`NEXT_PUBLIC_FAUCET_ADDRESS`→UI «Conseguir ETH de prueba»); oculto en producción. Supera la financiación manual de FASE 4.5 |

### RNF
| RNF | Tests | Trabajo(s) | Commit |
|-----|-------|-----------|--------|
| RNF-01 | TC-NF-040 | T1.2, T3.4 | — |
| RNF-02 / RNF-11 | objetivos en constantes (`RENDER_TARGET_MS`/`LCP_TARGET_MS`) + medición on-demand `apps/web/scripts/measure-perf.mjs`; TC-NF-001/002/011 NO son gate de CI | T1.2, T3.4, T4.5 | — |
| RNF-03 | TC-ACC-001 (compra primaria real firmada en Besu 81234; `buy()` status success, `ownerOf`→comprador, worker `soldCount=1`; **re-PASS 2026-06-11 por la UI completa** con `e2e-wallet-buy.mjs` + `BUYER_PK` firma cliente, tx `0x24aea781…c994cf80`) | **T5.1 ✅** | — |
| RNF-05 | TC-E2E-040, TC-CT-020 | T1.3, T3.1 | — |
| RNF-10 | TC-CT-043/046 | T1.3, T2.1, T2.2 | — |
| RNF-12 | TC-E2E-012/013/042/051, TC-WK-004/006 | T1.2, T1.4 | — |
| RNF-13 (on-chain) | TC-CT-001/051/064/081/091/094/095/096 | T0.2, T2.4, T3.3 | — |
| RNF-13 (secretos off-chain) | arranque fail-fast + «0 secretos en repo» | **T0.3** | — |
| RNF-14 | TC-CT-024/044/048/083, **TC-NF-050 (slither)** | T1.3, T2.2, T2.4, T5.1 | — |
| RNF-15 | TC-CT-070..083 | T2.4 | — |
| RNF-16 | (PLAN-DE-PRUEBAS.md) + CI | T0.2 | — |
| RNF-17 | TC-WK-030/031 (worker), `/health` MCP (`http-server.test.ts` 200/503), TC-NF-020 (monitor). *El faucet es on-chain: sin servidor `/health`.* | T1.4, T4.1, T3.3 | — |
| RNF-18 | proyecto Playwright «mobile» (suite hermética) + `apps/web/scripts/e2e-wallet-buy.mjs` (compra con wallet, on-demand; Anvil y **Besu vía `BUYER_PK`** firma cliente) + TC-ACC-002 (MetaMask real, T5.1) | T1.3, T4.5, T5.1 | — |
| RNF-19 | TC-E2E-060/063, TC-E2E-030 (panel decodificado E2E + unit `reverify`/`validate-tx` para `value==priceOf`) | T1.3, T4.3 | — |
| RNF-20 | TC-NF-030 | T3.4 | — |
| RNF-21 (runbook) | runbook por componente → `docs/RUNBOOK.md` (deploy 2-pasos, **§1.5 Besu/FASE 5**, env por componente, faucet, observabilidad, incidencias, rotación de secretos, checklist release) | **Rev. + T5.1 ✅** | — |
| RNF-22 | TC-ACC-010/011/012 medidos en Besu (`scripts/measure-besu.mjs`): bloque P50/P95=2s (≤3/≤6), RPC P95≈44ms (≤400), 12/12 eventos indexables (0 perdidos) | **T5.1 ✅** | — |
| RNF-06/07 | Fase 2 (fuera MVP) | — | — |

## 5. Verificación de integridad de la traza
- **RF del MVP sin CU/Trabajo:** 0. **CU sin test:** 0. La trazabilidad TC↔test es **por convención** (no todos los tests llevan el tag `TC-` inline); `TC-ACC-*` y `TC-NF-001/002` son **diferidos a T5.1 / medición on-demand**, no gates de CI. Flujo de compra con wallet en navegador: `scripts/e2e-wallet-buy.mjs` (on-demand; **TC-ACC-001 PASS en Besu 2026-06-11** con firma cliente `BUYER_PK`). `TC-ACC-002` (add-network con MetaMask real) = manual del operador.
- **Numeración unificada:** un único esquema `T<fase>.<n>` en plan + matriz + commits (`Task:`). Sin `T-NNN`.
- **RF-06 dividido:** CU-01/SIWE → T1.1 (Hito/Fase 1); CU-16 roles+Ownable2Step → T3.3 (Fase 3).
- **`setTreasury` (TC-CT-094/095/096):** hogar único en **T2.4** (CU-16), en fila tabular RNF-13.
- **`/health`** (RNF-17): worker (T1.4), MCP (T4.1, testeado), monitor end-to-end (T3.3). El faucet es on-chain (sin servidor `/health`).
- **Secretos** (RNF-13 off-chain): trazado a **T0.3** con oráculo verificable.
- **RNF-14 `slither`** (TC-NF-050): trazado a T5.1 (cierre del contrato) con triage de *medium*.
- **RNF-21 (runbook):** clasificado **en el MVP**, entregado en `docs/RUNBOOK.md` (revisión integral); la sección de aceptación en Besu se completará en T5.1.
- **Pendiente:** Commit/Código (⏳), reconstruibles por los trailers (§2).

## 6. Cómo se mantiene viva la matriz
1. Cada commit añade `Refs/Task/Tests` (§2). 2. `sdd-traceability-check` valida (0 requisitos sin commit, 0 commits sin `Refs`). 3. Se regenera tras cada Fase.
