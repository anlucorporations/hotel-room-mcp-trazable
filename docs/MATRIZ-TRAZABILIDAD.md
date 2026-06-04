# Matriz de trazabilidad end-to-end — Hotel Marina del Sol

> Traza la cadena **Requerimiento → Caso de uso → Escenario → Test → Tarea → Commit →
> Código**, en ambos sentidos. Integra `REQUISITOS.md`, `CASOS-DE-USO.md`,
> `PLAN-DE-PRUEBAS.md` y `DISENO-TECNICO.md`.
> **Versión 2** — correcciones de la auditoría ([`REVISION-PLAN-PRUEBAS.md`](./REVISION-PLAN-PRUEBAS.md)):
> RF-09 al Hito 1, RF-02↔CU-08, RF-04 con firma, Ownable2Step/`setTreasury` trazados,
> Besu operativa.
> **Fecha:** 2026-06-04

## 1. Modelo y estado de la cadena

```
RF/RNF ──► CU ──► Escenario (Gherkin/EARS) ──► Test (TC-*) ──► Tarea (T-*) ──► Commit ──► Código
   ✅          ✅              ✅                   ✅              ⏳            ⏳        ⏳
```

- ✅ definido: RF/RNF → CU → Escenario → Test. ⏳ pendiente: Tarea → Commit → Código (al implementar).
- Tareas `T-*` (§3) tentativas; se formalizan con `sdd-task-generator`.

## 2. Convención para cerrar la traza hasta el commit

```
feat(contracts): implementa buyResale con royalty por pull

Refs: RF-07, RF-08, CU-07
Task: T-211
Tests: TC-CT-040, TC-CT-041, TC-CT-044, TC-CT-048, TC-CT-049
```

`Refs:` requisitos+CU · `Task:` tarea atómica · `Tests:` los `TC-*` que pasa. Traza inversa:
`git log --grep "RF-08"`. Verificación: `sdd-traceability-check`.

## 3. Descomposición tentativa de tareas por hito

| Tarea | Descripción | Hito |
|-------|-------------|------|
| T-001 | Scaffold monorepo (pnpm+Turborepo, `shared`, `config`) | 1 |
| T-002 | Chain config Besu (81234, fees explícitos) + constantes en `shared` | 1 |
| T-003 | CI base (Anvil `--chain-id 81234`, forge, vitest, playwright, axe, slither) | 1 |
| T-110 | Contrato base ERC721+ERC2981+AccessControl+**Ownable2Step** (roles) | 1 |
| T-111 | `mint` + maestro hab→tipo + unicidad + rango de fecha on-chain | 1 |
| T-112 | Validación de calendario off-chain en `shared` (TC-SH-001) + pipeline metadata IPFS | 1 |
| T-113 | Faucet dev/test | 1 |
| T-114 | Auth SIWE (nonce/TTL) + control de acceso back-office | 1 |
| T-115 | `buy` (primaria) + guard `_update` transient + `soldOnce` | 1 |
| **T-116** | **Mini-worker email + idempotencia + catch-up + `/health`** (RF-09, adelantado) | **1** |
| T-210 | `list`/`unlist` + `struct Listing` (+ NotListed/re-list) | 2 |
| T-211 | `buyResale` + royalty ERC2981 + **pull payments** + `claim` | 2 |
| T-212 | Expiración + `burnExpired` (solo no vendidas, NotExpired) | 2 |
| T-213 | `pause`/`unpause` + `withdraw` + `setTreasury` | 2 |
| T-310 | Catálogo + filtros (web RSC + caché + TanStack) + empty/degradado | 3 |
| T-312 | Agregados del worker (histórico + dashboard) | 3 |
| T-313 | Páginas histórico + dashboard (web) | 3 |
| T-410 | MCP server (4 herramientas + filtro type) | 4 |
| T-411 | Orquestación LLM server-side + guardrails + verificación de tx | 4 |
| T-412 | Chat UI + confirmación de tx decodificada + estados | 4 |
| T-900 | Aceptación on-chain en Besu staging (`TC-ACC-*`) | Cierre |

## 4. Matriz maestra (RF → … → código)

> Commit `—` = pendiente. Código = path previsto (diseño §2/§4).

| RF | CU | Tests (TC) | Hito | Tarea(s) | Commit | Código previsto |
|----|----|-----------|------|----------|--------|-----------------|
| RF-01 | CU-02, CU-05 | TC-CT-010/017, TC-CT-020 | 1 | T-110, T-111, T-115 | — | `packages/contracts/src/HotelNights.sol` |
| RF-02 | CU-04, **CU-08** | TC-E2E-010, **TC-MCP-001/008** | 3/4 | T-310, T-410 | — | `apps/web/app/(catalog)`, `apps/mcp/src` |
| RF-03 | CU-05, CU-07 | TC-CT-020, TC-CT-040, TC-ACC-001 | 1/2 | T-115, T-211 | — | `HotelNights.sol` |
| RF-04 | CU-17, **CU-05, CU-07** | TC-E2E-060/063, **TC-E2E-020**, TC-ACC-001/002 | 3 | T-310, T-412 | — | `apps/web/lib/web3`, `shared/chains` |
| RF-05 | CU-02 | TC-CT-010 | 1 | T-111, T-114 | — | `apps/web/app/admin/mint`, `HotelNights.sol` |
| RF-06 | CU-01, CU-16 | TC-INT-001, TC-CT-001/090/091/**092/093** | 1 | T-110, T-114 | — | `HotelNights.sol`, `apps/web/lib/auth` |
| RF-07 | CU-06, CU-07 | TC-CT-030..036, TC-CT-040..049 | 2 | T-210, T-211 | — | `HotelNights.sol` |
| RF-08 | CU-07, CU-12 | TC-CT-040/041, TC-CT-050/051 | 2 | T-211, T-213 | — | `HotelNights.sol` |
| RF-09 | CU-10 | TC-WK-001..006 | **1** | **T-116** | — | `apps/worker/src` |
| RF-10 | CU-11 | TC-WK-020/021/022, TC-E2E-050/051 | 3 | T-312, T-313 | — | `apps/worker`, `apps/web/app/admin/dashboard` |
| RF-12 | CU-08 | TC-MCP-001..008, TC-E2E-030/031 | 4 | T-410, T-411, T-412 | — | `apps/mcp/src`, `apps/web/app/chat` |
| RF-14 | CU-04 | TC-E2E-011 | 3 | T-310 | — | `apps/web/app/(catalog)` |
| RF-15 | CU-09 | TC-WK-010/011, TC-E2E-040/041/042 | 3 | T-312, T-313 | — | `apps/worker`, `apps/web/app/historico` |
| RF-17 | CU-13 | TC-CT-060..067 | 2 | T-212 | — | `HotelNights.sol` |
| RF-18a | CU-02 | TC-CT-012 | 1 | T-111, T-112 | — | `HotelNights.sol`, `shared/rooms` |
| RF-18b | CU-02 | TC-CT-010 | 1 | T-111 | — | `HotelNights.sol` |
| RF-19 | CU-02 | TC-CT-011/016/017 | 1 | T-111 | — | `HotelNights.sol` |
| RF-21 | CU-PR-01 | TC-CT-100/101/102 | 1 (dev) | T-113 | — | `packages/contracts` (dev) |

### RNF

| RNF | Tests | Hito | Tarea(s) | Commit |
|-----|-------|------|----------|--------|
| RNF-01 | TC-NF-040 | 3 | T-310 | — |
| RNF-02 | TC-NF-001/002 | 3 | T-310 | — |
| RNF-11 | TC-NF-011 | 3 | T-310 | — |
| RNF-03 | TC-ACC-001 | cierre | T-900 | — |
| RNF-05 | TC-E2E-040, TC-CT-020 | 1/3 | T-115, T-312 | — |
| RNF-10 | TC-CT-043/046 | 2 | T-115, T-211 | — |
| RNF-12 | TC-E2E-012/013/042/051, TC-WK-004/006 | 3 | T-310, T-116 | — |
| RNF-13 | TC-CT-001/051/064/081/091/096 | 1/2 | T-110, T-213 | — |
| RNF-14 | TC-CT-024/044/048/083, TC-NF-050 | 1/2 | T-115, T-211, T-213 | — |
| RNF-15 | TC-CT-070..083 | 2 | T-213 | — |
| RNF-17 | TC-WK-030/031, TC-NF-020 | 1/3 | T-116 | — |
| RNF-18 | TC-E2E-061, TC-ACC-002 | 3/cierre | T-310, T-900 | — |
| RNF-19 | TC-E2E-060/063 | 3/4 | T-310, T-412 | — |
| RNF-20 | TC-NF-030 | 3 | T-310, T-313 | — |
| RNF-22 | TC-ACC-010/011/012 | cierre | T-900 | — |
| RNF-16 | (PLAN-DE-PRUEBAS.md) | — | — | — |
| RNF-06/07/21 | Fase 2 / proceso | F2 | — | — |

## 5. Verificación de integridad de la traza

- **RF del MVP sin CU:** 0. **CU sin test:** 0. **Test huérfano:** 0.
- **TC referenciados sin definir:** 0 (los antes fantasma —TC-NF-020/030/040/050,
  TC-WK-030, TC-ACC-010/011/012— ya tienen fila y oráculo en PLAN §4/§5).
- **RF-09** trazado a **Hito 1** (coherente con REQUISITOS §6). **RF-02↔CU-08**,
  **RF-04** con firma (CU-05/07), **Ownable2Step** (TC-CT-092/093) y **`setTreasury`**
  (TC-CT-094..096) trazados.
- **RNF sin verificación:** 0 (RNF-06/07/21 fuera del MVP por decisión). `TC-ACC-*`
  ejecutables en **Besu staging** (red operativa).
- **Pendiente:** columnas Tarea/Commit/Código (tramos ⏳), reconstruibles por los trailers (§2).

## 6. Cómo se mantiene viva la matriz

1. `sdd-task-generator` confirma/ajusta las tareas `T-*`.
2. Cada commit añade `Refs/Task/Tests`.
3. `sdd-traceability-check` valida: 0 requisitos sin commit, 0 commits sin `Refs`, 0 TC sin ejecutar.
4. Se regenera tras cada hito.
