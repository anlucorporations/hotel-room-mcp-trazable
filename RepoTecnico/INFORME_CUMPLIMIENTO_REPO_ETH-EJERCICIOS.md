# Informe de cumplimiento — proyecto vs. repositorio de referencia

> **Repositorio de referencia (pliego/solución base):** `https://gitlab.codecrypto.academy/misbia/eth-ejercicios/hotel-room-mcp-trazable.git` @ `b1d7466` (rama `main`)
> **Proyecto evaluado:** `Hotel-DSH-GCP-v3` @ `d9681c5` (desplegado en producción: `web:v55` / `mcp:v55`)
> **Fecha del informe:** 2026-10-13
> **Alcance:** áreas técnicas (contrato, web, back-office, worker, MCP/IA) e infraestructura (CI/CD, cloud, observabilidad, secretos, DR)

---

## 1. Resumen ejecutivo

El repositorio de referencia **no es un pliego externo distinto**: es un *snapshot* del mismo proyecto. Sus documentos normativos (`docs/REQUISITOS.md`, `docs/MATRIZ-TRAZABILIDAD.md`, `docs/CASOS-DE-USO.md`, `docs/PLAN-DE-PRUEBAS.md`, `docs/BRIEF-CLIENTE-INICIAL.md`) son **byte a byte idénticos** a los de este proyecto. La comparación es, por tanto, *apples-to-apples*: se mide **cuánto del pliego común está implementado y cuánto se ha superado**.

| Métrica | Resultado |
|---|---|
| **Cumplimiento del núcleo MVP del pliego** (RF-01…RF-21 MVP + RNF + Fases 0–4) | **≈ 99 %** |
| **Cumplimiento global** (incluye Fase 2 RF-11/13/16/20 y cierre Besu) | **≈ 95 %** |
| **Áreas por encima del pliego** (superación neta) | **6 de 9** |
| **Requisitos del MVP no cubiertos** | 0,5 de 18 RF y 0,5 de 20 RNF aplicables |
| **Requisitos de Fase 2 (fuera del MVP) no cubiertos** | 1 completo (RF-13 subastas) + 1 parcial (RF-20 identidad) |
| **Multiplicador de alcance entregado** | 4,3× ficheros · 5,3× pruebas · 3,6× páginas web · 27 ADR (referencia: 0) |

**Veredicto:** el proyecto **supera** el pliego en alcance, profundidad de pruebas, documentación e infraestructura, y **se queda corto en 4 puntos concretos**: royalty configurable por `ROYALTY_ADMIN` (RF-08), validación en Besu real (RNF-22/T5.1), *pinning* IPFS redundante con Pinata (Decisión 13) y las partes de Fase 2 no abordadas (RF-13 subastas; identidad/registro de viajeros de RF-20, excluida por diseño).

---

## 2. Metodología

1. **Clonado** del repositorio de referencia (`git clone --depth 1`) y lectura de sus 11 documentos normativos.
2. **Extracción del pliego**: 18 RF de MVP, 4 RF de Fase 2, 22 RNF, 24 decisiones de arquitectura, 5 fases y 18 Trabajos (`T0.1`…`T5.1`), más las exigencias de infraestructura (§7), seguridad (§8) y legal (§10).
3. **Inventario del proyecto**: rutas web, rutas API, componentes, contratos, herramientas MCP, worker, paquetes compartidos, infraestructura y suites de prueba.
4. **Puntuación**: `✅ = 1`, `⚠️ parcial = 0,5`, `❌ = 0`. Se excluyen los requisitos de negocio/plazo (RNF-08, RNF-09). Ponderación por área (suma 100 %).
5. **Verificación ejecutada en esta sesión**: `web` 112 ficheros / **1.045 pruebas** · `shared` 61 / **634** · `worker` 17 / **183** · `mcp` 6 / **82** · `monitor` 5 / **42** = **1.986 pruebas TS en verde**. Contratos Solidity: **14 suites `.t.sol` versionadas** (+3 de la línea vNext aún sin commitear; Forge no disponible en este entorno, se ejecutan en CI).

> **Limitación declarada:** no hay `forge`/Anvil/Besu locales en este entorno, por lo que las suites de contrato y la aceptación on-chain no se re-ejecutaron aquí; se evalúan por código, por CI y por la evidencia documentada en `RepoTecnico/`.

---

## 3. Comparación estructural

| Dimensión | Referencia (`b1d7466`) | Proyecto (`d9681c5`) | Ratio |
|---|---|---|---|
| Ficheros versionados | 306 | **1.309** | 4,3× |
| Páginas web (`page.tsx`) | 14 | **50** | 3,6× |
| Rutas API (`route.ts`) | 6 | **93** | 15,5× |
| Componentes web | 57 | **148** | 2,6× |
| Ficheros `packages/shared` | 37 | **134** | 3,6× |
| Pruebas TS (`.test.ts(x)`) | 37 | **195** | 5,3× |
| Suites de contrato (`.t.sol`) | 11 | **14** | 1,27× |
| Docs normativos (`docs/*.md`) | 11 | **109** | 10× |
| Docs de ingeniería (`RepoTecnico/*.md`) | 0 | **125** | — |
| ADR | 0 | **27** | — |
| Manuales | 0 | **53 md** (+ PDF generados, no versionados) | — |
| Idiomas de la UI | 1 (ES) | **3 (ES/EN/RU)** | 3× |
| Jobs CI | 8 (GitLab) | **6 (GitHub) + 8 (GitLab)** | 1,75× |

---

## 4. Matriz de requisitos funcionales

### 4.1 MVP (Hitos 1–4)

| RF | Requisito (pliego) | Estado | Evidencia en el proyecto |
|---|---|---|---|
| RF-01 | NFT ERC-721 (habitación × fecha), OpenZeppelin | ✅ | `packages/contracts/src/HotelNights.sol` (ERC721URIStorage + OZ) |
| RF-02 | Catálogo público de noches | ✅ | `apps/web/src/app/{page,catalogo}`, `components/catalog`, `NightCard.tsx` |
| RF-03 | Compra con ETH nativo, anti-reentrancy | ✅ | `buy()` `nonReentrant whenNotPaused`; `HotelNights.buy.t.sol` |
| RF-04 | MetaMask + alta de red custom | ✅ | `components/wallet/{useOnboarding,WalletBar,switchChainError}`, `config/chain.ts` |
| RF-05 | Back-office de minteo con validación | ✅ | `app/admin/mint`, `AdminMint.tsx` |
| RF-06 | Autenticación + control de acceso por roles | ✅ | `lib/{session,nonce-store}.ts`, `app/api/auth/*` (SIWE/MFA), `AccessControl` |
| RF-07 | Reventa solo vía contrato | ✅ | `list/unlist/buyResale`; `HotelNights.resale.t.sol` |
| RF-08 | Royalty ERC-2981 en secundaria, sin evasión | ✅ | `royaltyInfo`, `_update` bloquea `transferFrom`/precio 0; `HotelNights.royalty.t.sol` |
| RF-08 | Royalty **configurable por `ROYALTY_ADMIN`** (0–2000 bps) | ❌ | **D-06**: royalty **inmutable** por tipo (5 % simple/doble, 10 % suite). No existe rol ni setter (`AdminRoyalty.tsx` es informativo) |
| RF-09 | Email por venta (worker idempotente + catch-up) | ✅ | `apps/worker/src/{sale-notifier,email-consumer,queued-mailer,checkpoint-store}.ts`, `rebind.ts`, `/health` |
| RF-10 | Dashboard admin con métricas mínimas | ✅ | `app/admin/dashboard`, `components/dashboard/{DashboardMetrics,MonthlySalesChart,RoomTypeChart,TopResoldTable}` |
| RF-12 | Asistente IA: MCP read-only + preparación de tx, LLM acotado, sin firma | ✅ **supera** | `apps/mcp/src/tools/tools.ts` (**6 herramientas**: `listAvailableNights`, `checkAvailability`, `getOwnedNights`, `searchHotelManuals`, `buildPurchaseTx`, `prepareStayTx`), `lib/assistant/*` (prompt, guardrails, rate-limit, PII, presupuesto, métricas), `app/{asistente,api/assistant}` |
| RF-14 | Filtros y buscador (fecha, precio, tipo) | ✅ | `CatalogClient.tsx`, `lib/catalog-search.ts` |
| RF-15 | Histórico público de ventas | ✅ | `app/historico`, `worker/aggregate-processor.ts` |
| RF-17 | Expiración lógica + burn en lote | ✅ | `burnExpired`, `isExpired`, `worker/burn-scheduler.ts`, `app/admin/caducadas` |
| RF-18a | Maestro 50 habitaciones / 3 tipos | ✅ | `packages/shared/src/domain/room-master.ts` |
| RF-18b | Minteo por `MINTER` validado (habitación, fecha, precio) | ✅ | `mint()` + errores `RoomNotInMaster/InvalidPrice/PastDate/InvalidDate`; `HotelNights.mint.t.sol` |
| RF-19 | Unicidad on-chain con tokenId determinístico | ✅ | `packages/shared/src/domain/token-id.ts`, revert `DuplicateNight` |
| RF-21 | Faucet de pruebas con límite por wallet/ventana | ✅ | `packages/contracts/src/Faucet.sol` (cooldown), `components/wallet/{FaucetButton,useFaucet}.tsx` |

**Núcleo RF MVP: 17,5 / 18 = 97,2 %.**

### 4.2 Fase 2 (fuera del piloto)

| RF | Requisito | Estado | Evidencia |
|---|---|---|---|
| RF-11 | Soporte WalletConnect además de MetaMask | ✅ | `apps/web/src/lib/wallet-connectors.ts` (+ `@walletconnect/ethereum-provider`); activable con `projectId` |
| RF-13 | Subastas para habitaciones premium | ❌ | Diferido por decisión (D-11); documentado como fase posterior en `docs/SRS.md` |
| RF-16 | Notificaciones push al móvil | ✅ | `apps/web/public/sw.js`, `components/push/useWebPush.ts`, VAPID |
| RF-20 | Check-in/canje + identidad off-chain (registro de viajeros) | ⚠️ | Canje/resguardo QR-JWS y check-in on-chain: `app/checkin`, `reception`, ADR-05. **Identidad/registro de viajeros no implementado** (excluido a propósito: sin PII) |

**Fase 2: 3 / 5 = 60 %** (recordatorio: el pliego la sitúa expresamente fuera del MVP).

---

## 5. Matriz de requisitos no funcionales

| RNF | Requisito | Estado | Evidencia |
|---|---|---|---|
| RNF-01 | Responsive / mobile-first, táctil ≥44 px | ✅ | Tailwind + proyecto Playwright `mobile`; `e2e/home.spec.ts` |
| RNF-02 | Rendimiento: listado < 1 s, caché, paginación | ✅ | RSC + TanStack, `load-more`, `NightCard` |
| RNF-03 | Gas despreciable (baseFee 0, min-gas 1000 wei) | ✅ | `packages/shared/src/constants.ts`, `docs/SPIKE-BESU.md` |
| RNF-04 | Seguridad transversal | ✅ | RNF-13/14/15 cubiertos |
| RNF-05 | Minimización de datos: sin PII on-chain | ✅ | `lib/assistant/pii-sanitizer.ts`, `checkin_contingency_logs` sin PII, `docs/COMPLIANCE.md` |
| RNF-06 | i18n (ES ahora; EN/RU después) | ✅ **supera** | Tres catálogos completos: `apps/web/messages/{es,en,ru}.json` |
| RNF-07 | Escalabilidad tráfico europeo | ✅ **supera** | Cloud Run multi-instancia, `scripts/load-tests/*` (k6 + runner propio) |
| RNF-08 | Plazo (Hito 1 < 2026-06-30) | n/a | Requisito de negocio; el proyecto está desplegado y operativo |
| RNF-09 | Coste cerrado solo desarrollo | n/a | Requisito comercial |
| RNF-10 | Royalty forzado, sin vías de evasión | ✅ | `_update` + `_unlockTransfer`; `HotelNights.invariants.t.sol` |
| RNF-11 | Métricas de rendimiento verificables (LCP<2,5 s) | ✅ | `apps/web/scripts/measure-perf.mjs`, job `perf-nightly`, `docs/PERFORMANCE-REPORT.md` |
| RNF-12 | Gestión de errores y resiliencia | ✅ | `DegradedState.tsx`, `ContractPausedBanner.tsx`, retries + checkpoints del worker |
| RNF-13 | Claves y control de acceso | ✅ | `AccessControl` + `Ownable2Step` + `packages/shared/src/{env,env-guardian.test}` + Secret Manager |
| RNF-14 | Seguridad de contratos verificable | ✅ | OZ, CEI + `nonReentrant`, **slither como gate** en CI (`.github/workflows/ci.yml`, `.gitlab-ci.yml`) |
| RNF-15 | Pausa de emergencia + withdraw a TREASURY | ✅ | `pause/unpause/withdraw/setTreasury`; `HotelNights.admin.t.sol` |
| RNF-16 | Estrategia de pruebas | ✅ **supera** | 1.986 pruebas TS verificadas + **14 suites Forge** + Playwright E2E + invariantes |
| RNF-17 | Observabilidad: logging + health-checks + alertas | ✅ | `/health` en worker/mcp/web, `apps/monitor` (sondeo + alertas), `infra/gcp/deploy-monitor.sh` |
| RNF-18 | Compatibilidad y flujo móvil web3 | ✅ | Playwright mobile + inyectada/Coinbase/WalletConnect; `e2e/asistente-global.spec.ts` |
| RNF-19 | Usabilidad y onboarding web3 | ✅ | `WalletBar`, `TxModal`, `canSignPurchase.ts`, confirmación explícita en el chat |
| RNF-20 | Accesibilidad WCAG 2.1/2.2 AA | ✅ | `e2e/a11y.spec.ts` (axe-core), `docs/ACCESIBILIDAD-WCAG.md`, guardián `lib/a11y/color-usage.test.ts` |
| RNF-21 | Mantenibilidad: runbook por componente | ✅ **supera** | `docs/RUNBOOK.md` + `docs/Manuales/**` (53 md) + `docs/pdf` (74) |
| RNF-22 | Validación en **Besu real** (bloques, RPC, gas) | ⚠️ | Existe `packages/contracts/scripts/measure-besu.mjs`, ADR-17 «espejo Besu» y `docs/SPIKE-BESU.md`, pero **producción corre Anvil `chainId 31337`** (global de GCP); no hay evidencia de aceptación TC-ACC en Besu 81234 |

**RNF aplicables (20, excluidos RNF-08 plazo y RNF-09 coste): 19,5 / 20 = 97,5 %.**

---

## 6. Trabajos del plan de construcción (Fases 0–5)

| Trabajo | Alcance | Estado | Evidencia |
|---|---|---|---|
| T0.1 | Monorepo pnpm+turbo, `shared`, imágenes IPFS | ✅⚠️ | Monorepo completo; IPFS: CID v1 + script `pin-images.ts`, **Pinata pendiente de credenciales** |
| T0.2 | Contrato + 6 roles + bootstrap + CI | ✅ | `HotelNights.sol`, `HotelNightsBootstrap.sol`, `Deploy.s.sol`, CI con humo a Anvil 81234 |
| T0.3 | Secretos + fixtures + rebind | ✅ | `shared/src/env` (fail-fast), `fixtures/`, `worker/rebind.ts`, `scripts/db`, `inject:data` |
| T1.1 | Mint + admin + faucet | ✅ | `mint()`, `app/admin/mint`, `Faucet.sol` + `/health`/`lowBalance` |
| T1.2 | Catálogo + filtros | ✅ | `catalogo`, `CatalogClient`, estados `empty`/`degraded`/`img-fallback` |
| T1.3 | Compra primaria + onboarding | ✅ | `buy()`, `components/buy/*`, `WalletBar`, `TxModal` |
| T1.4 | Worker de aviso de venta | ✅ | `sale-notifier`, `email-consumer`, `checkpoint-store`, `/health`+lag |
| T2.1 | Listar/cancelar reventa | ✅ | `list/unlist`, `app/mis-noches`, `resale/*` |
| T2.2 | Compra de reventa + royalty + claim | ✅ | `buyResale`, `claim`, pull payments, `HotelNights.resale.t.sol` |
| T2.3 | Caducidad y burn | ✅ | `burnExpired`, `burn-scheduler` (+ disparo manual en panel) |
| T2.4 | Royalty config + pausa + withdraw + setTreasury | ✅⚠️ | Pausa/withdraw/setTreasury ✅; **royalty config. ❌** (D-06) |
| T3.1 | Histórico público | ✅ | `app/historico` + agregados del worker |
| T3.2 | Dashboard admin | ✅ | `app/admin/dashboard` + métricas con unidad/periodo |
| T3.3 | Roles/ownership + observabilidad | ✅ | `AccessControl`+`Ownable2Step`, `apps/monitor`, alertas |
| T3.4 | A11y, rendimiento, i18n-ready | ✅ **supera** | axe en CI, presupuesto de rendimiento, **3 idiomas** |
| T4.1 | MCP server del contrato | ✅ **supera** | 6 herramientas (incl. `prepareStayTx` de la revisión 2026-10-13), `/health` |
| T4.2 | Orquestación LLM + guardrails | ✅ **supera** | `runAssistant`, prompt acotado, `prompt-leak-filter`, `rate-limit`, `token-budget`, `metrics` |
| T4.3 | Chat UI + estados | ✅ | `AssistantChat`, `PurchaseHandoff`, `StayHandoff`, `MessageText`, `NightHighlights`, estado 08e |
| T5.1 | Deploy + aceptación en **Besu** | ⚠️ | Despliegue coordinado real en **GCP Cloud Run + Cloud SQL + Redis** (`infra/gcp/70-deploy-apps.sh`), MetaMask, runbook y mediciones. **No en Besu 81234** |

**Trabajos: 17,25 / 18 ≈ 95,8 %.**

---

## 7. Áreas técnicas e infraestructura

### 7.1 Contrato inteligente
`HotelNights.sol` (ERC-721 + ERC-2981 + AccessControl + Pausable + ReentrancyGuard + Ownable2Step + ERC721URIStorage), `Faucet.sol`, `HotelOperations.sol` (**extra**: EIP-712 + nonces + roles de mantenimiento, vNext F2), `IHotelNights.sol`, librerías `DateLib`/`RoomMaster`. **14 suites** `.t.sol` versionadas —17 en el árbol, 3 de vNext sin commitear— (mint, buy, resale, royalty, burn, roles, ownership, admin, invariantes, check-in, rooms, deploy, faucet, operaciones). Slither como gate de CI.

### 7.2 Web y back-office
50 páginas y 93 rutas API: catálogo, reventa, mis-noches, histórico, check-in QR, recepción, housekeeping, mantenimiento, reseñas, actividades, experiencias, planes, servicios, ayuda (con manuales), y back-office (`admin/{mint,dashboard,caducadas,fondos,pausa,roles,royalty,sistemas,usuarios,contenido,resenas,habitacion,housekeeping,mantenimiento,seguridad}`). **Supera** el pliego del Hito 3.

### 7.3 Asistente IA
MCP por HTTP con **6 herramientas** (ninguna de firma), orquestación server-side con Vertex/Gemini, guardrails (dominio, *prompt injection*, anti-fuga), presupuesto mensual, *rate limiting*, enmascarado de PII, índice de conocimiento RAG y —desde esta revisión— **reserva en rango de fechas** (`prepareStayTx` + `preparedPurchases[]` + panel `StayHandoff`), desplegado y verificado en producción.

### 7.4 Worker y datos
Listener de eventos con checkpoint, idempotencia, rebind; agregados; outbox de anclaje + relayer (vNext F3); planificadores de burn, ventana de acuñado, preventivos y retención; PostgreSQL 18 (esquema vNext, 60 tablas, gate de CI con servicio `postgres:18`) y Redis (colas).

### 7.5 Infraestructura y DevOps
| Elemento | Estado | Evidencia |
|---|---|---|
| CI GitHub Actions (build · schema · e2e · slither · perf nightly) | ✅ | `.github/workflows/ci.yml` |
| CI GitLab (8 jobs + etapas verify/e2e/nightly) | ✅ | `.gitlab-ci.yml` |
| CI con humo a Anvil 81234 + verificación de roles | ✅ | job `build` |
| Imagen única Docker por componente + Cloud Build | ✅ | `Dockerfile`, `infra/docker/cloudbuild.yaml`, `infra/gcp/f8-build-images.sh` |
| Artifact Registry + Cloud Run (web/worker/mcp) | ✅ | despliegue v55 verificado |
| Cloud SQL (PostgreSQL 18) + Redis en VPC | ✅ | `infra/gcp/{40-cloud-sql,60-cloud-run}.sh` |
| Secret Manager + IAM/WIF sin claves JSON | ✅ | `infra/gcp/{20-iam-and-wif,50-secrets}.sh`, `shared/src/env` |
| Monitor (worker pool) + alertas | ✅ | `apps/monitor`, `infra/gcp/deploy-monitor.sh` |
| Copias y recuperación ante desastres | ✅ | `docs/DISASTER-RECOVERY.md`, `scripts/backup`, `test:dr` |
| **Besu 81234 (red de producción del pliego)** | ⚠️ | Espejo documentado (ADR-17) y `measure-besu.mjs`; producción usa Anvil 31337 |
| **Pinning IPFS redundante (≥2 pinners)** | ⚠️ | CID v1 + `pin-images.ts`; **Pinata sin credenciales** (`shared/src/domain/ipfs.ts`) |

---

## 8. Desviaciones y hallazgos

| # | Hallazgo | Impacto | Severidad |
|---|---|---|---|
| 1 | **RF-08: royalty no configurable.** Contrato con constantes 5 %/10 % por tipo; `ROYALTY_ADMIN` eliminado (D-06). `docs/REQUISITOS.md` sigue describiendo el requisito configurable → **inconsistencia documento↔código** | No se puede ajustar el porcentaje sin redeploy; desviación explícita del pliego | Media |
| 2 | **RNF-22 / T5.1: aceptación en Besu no evidenciada.** Producción en Anvil global 31337 | No se cumple literalmente el cierre «Besu 81234»; sí hay red real + despliegue de producción | Media |
| 3 | **Decisión 13: pinning IPFS redundante incompleto** (Pinata pendiente) | Riesgo de persistencia de imagen/metadata | Media |
| 4 | **RF-13 (subastas) no implementado** | Explícitamente fuera del MVP | Baja (permitida) |
| 5 | **RF-20 (identidad/registro de viajeros) no implementado** | Decisión de diseño (sin PII); el canje sí está | Baja (consciente) |
| 6 | **RF-11 WalletConnect desactivado por defecto** (requiere `projectId`) | Funcionalidad latente | Baja |
| 7 | El requisito RF-20 del pliego se reutiliza en el SRS del proyecto para el asistente (numeración solapada) | Confusión de trazabilidad | Baja |

---

## 9. Superación de alcance (lo entregado que el pliego no pedía)

- **Operación hotelera vNext**: `HotelOperations.sol` (EIP-712, firmas de operadores), recepción, housekeeping, mantenimiento (incidencias, preventivos, áreas, suministros), operadores de terminal con PIN, auditoría append-only, outbox de anclaje + relayer, PMS, tarifas, pases, *fiat on-ramp*, reseñas, contenido, actividades/experiencias/planes/servicios.
- **Asistente**: 6 herramientas MCP (frente a 5 del pliego), RAG sobre manuales, presupuesto y métricas de coste, *rate limiting*, saneador de PII, y **reserva por rango de fechas** (2026-10-13).
- **Infraestructura de producción real**: GCP Cloud Run + Cloud SQL + Redis + Artifact Registry + monitor + DR, frente a un despliegue de laboratorio.
- **Trilingüe** (ES/EN/RU), **27 ADR**, **53 manuales** técnicos y de usuario en Markdown (+ PDF generados localmente, no versionados), **125 documentos de ingeniería** en `RepoTecnico/`, y **guarda-nes automáticos** (arquitectura, documentación, secretos, accesibilidad, identidad visual).
- **Volumetría**: 4,3× ficheros, 15,5× rutas API, 5,3× pruebas.

---

## 10. Cálculo del porcentaje

| Área | Peso | Puntuación | Aportación |
|---|---:|---:|---:|
| A. Contrato / on-chain | 20 % | 96,2 % | 19,23 |
| B. Web pública y UX | 15 % | 100 % | 15,00 |
| C. Back-office / admin | 10 % | 100 % | 10,00 |
| D. Worker, histórico y observabilidad | 12 % | 100 % | 12,00 |
| E. MCP + IA | 13 % | 100 % | 13,00 |
| F. Faucet / devnet | 3 % | 100 % | 3,00 |
| G. Fase 2 (fuera del MVP) | 5 % | 60 % | 3,00 |
| H. Infraestructura y DevOps | 12 % | 83,3 % | 10,00 |
| I. Documentación y trazabilidad | 10 % | 100 % | 10,00 |
| **Total** | **100 %** | — | **95,23 %** |

- **Cumplimiento global: ≈ 95 %.**
- **Núcleo MVP (áreas A–F): 72,23 / 73 = ≈ 99 %.**
- **Superación:** en 6 de 9 áreas el proyecto iguala o supera el pliego, con multiplicadores de alcance de 1,27× (suites de contrato) a 15,5× (rutas API) según la dimensión.

---

## 11. Recomendaciones

1. **Alinear RF-08**: decidir entre (a) implementar `setRoyaltyBps` + `ROYALTY_ADMIN` (0–2000 bps, def. 1000) o (b) actualizar `docs/REQUISITOS.md` para reflejar D-06 (royalty inmutable por tipo). Hoy documento y código se contradicen.
2. **Cerrar RNF-22/T5.1**: ejecutar la aceptación (`TC-ACC-*`) contra **Besu 81234** con `measure-besu.mjs` y registrar la evidencia en `RepoTecnico/evidencias/`.
3. **Completar la Decisión 13**: provisionar Pinata (`PINATA_JWT`) y verificar/repinar los CIDs de las 3 imágenes + metadata.
4. **Revertir la inconsistencia de numeración RF-20** entre el pliego y el SRS del proyecto.
5. Mantener el resto como está: el MVP está cubierto al ~99 % y desplegado en producción.

---

## Anexo — Fuentes

- Referencia: `gitlab.codecrypto.academy/misbia/eth-ejercicios/hotel-room-mcp-trazable.git` @ `b1d7466`, docs `REQUISITOS.md` / `PLAN-CONSTRUCCION.md` / `MATRIZ-TRAZABILIDAD.md` / `CASOS-DE-USO.md` / `PLAN-DE-PRUEBAS.md` / `BRIEF-CLIENTE-INICIAL.md`.
- Proyecto: `Hotel-DSH-GCP-v3` @ `d9681c5`; suites ejecutadas el 2026-10-13 (web 1.045 · shared 634 · worker 183 · mcp 82 · monitor 42); despliegue v55 verificado (revisiones `hotel-mcp-web-00107-xoh` y `hotel-mcp-mcp-00017-728`).
