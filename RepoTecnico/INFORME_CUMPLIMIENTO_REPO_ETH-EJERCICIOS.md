# Informe de cumplimiento — proyecto vs. repositorio de referencia

> **Repositorio de referencia (pliego/solución base):** `https://gitlab.codecrypto.academy/misbia/eth-ejercicios/hotel-room-mcp-trazable.git` @ `b1d7466` (rama `main`, 2026-06-11)
> **Proyecto evaluado:** `Hotel-DSH-GCP-v3` @ `6215314` (rama `main` = `Hotel-DSH-GCP-v3`), desplegado en producción con **`web:v95` · `worker:v92` · `mcp:v78`**
> **Red de despliegue:** **Besu de Codecrypto, `chainId 81234`** (`https://besu.alumnos.codecrypto.academy`) · contrato `HotelNights 0x8b1B…0253` (bloque 5 848 830) + `NightAuction 0x42E5…5b8a`
> **Fecha de la revisión:** **2026-10-31** (v2 del informe; sustituye a la del 2026-10-13)
> **Alcance:** áreas técnicas (contrato, web, back-office, worker, MCP/IA) e infraestructura (CI/CD, cloud, observabilidad, secretos, DR)

---

## 0. Qué cambia respecto a la v1 (2026-10-13)

La v1 evaluó el proyecto en `d9681c5`, con `web:v55`, producción sobre el Anvil global (`31337`) y con cuatro brechas abiertas: royalty configurable (RF-08), subastas (RF-13), aceptación en Besu real (RNF-22/T5.1) y *pinning* IPFS. Desde entonces:

| Cambio | Impacto en el cumplimiento |
|---|---|
| **C1 · royalty configurable** (`setRoyaltyBps` + `ROYALTY_ADMIN_ROLE`, 0–2000 bps) | **RF-08 cerrado** ✅ |
| **C2 · subastas primarias** (`NightAuction` + `/subastas` + panel `admin/subastas`, ADR-28, CU-48/49) | **RF-13 cerrado** ✅ (subasta del hotel; la subasta secundaria del huésped no está en el pliego) |
| **Migración definitiva a Besu 81234** (contrato v2 `0x8b1B…0253`, limpiezas del 2026-10-22) | **RNF-22 / T5.1 cerrados** ✅; ya no se evalúa un despliegue de laboratorio |
| Publicación con **minteo on-chain** (D-85), **un solo indexador** de eventos (ADR-34 · D-87) | Worker/indexado consolidado; menos deuda estructural |
| **Identidad visual v3 «Cal & Sal» + «Posidonia»** (2026-10-23) | Supera el pliego en UX; nueva ficha `/habitaciones/[room]` |
| **Correcciones del asistente** (fallback determinista, compras múltiples en un turno, solo-el-hotel subasta) y **pool E2E real** (2026-10-24) | RF-12 más robusto y verificado en producción |
| **Correo saliente con Mailtrap** + límite de ritmo; `worker /health` deja de estar degradado | Pipeline de email operativo (sandbox de pruebas) |
| Crecimiento de pruebas y documentación | 2 527 pruebas en total, 35 ADR, 131 manuales, 102 PDF |

**Pruebas ejecutadas para esta revisión (2026-10-31):** contratos Foundry **20 suites / 202 pruebas ✅** · TypeScript **2 325 pruebas ✅** (web 1 212 · shared 776 · worker 209 · mcp 86 · monitor 42). `typecheck` y `lint` del monorepo en verde (0 errores; solo warnings).

> **Limitación declarada:** el CI canónico **no arranca** (ver §7.5): GitHub Actions falla en 2–3 s sin ejecutar ningún paso y GitLab no se pudo verificar desde este entorno. Por eso las cifras anteriores se han ejecutado **localmente** y no se atribuyen al CI.

---

## 1. Resumen ejecutivo

El repositorio de referencia **no es un pliego externo distinto**: es un *snapshot* del mismo proyecto. Sus documentos normativos siguen siendo la base de comparación; a fecha de hoy `REQUISITOS.md`, `CASOS-DE-USO.md` y `BRIEF-CLIENTE-INICIAL.md` son **byte a byte idénticos** a los de la referencia, mientras que `PLAN-CONSTRUCCION.md`, `MATRIZ-TRAZABILIDAD.md` y `PLAN-DE-PRUEBAS.md` han **evolucionado** en el proyecto para reflejar la entrega real (la referencia se quedó congelada en `b1d7466`).

| Métrica | Resultado |
|---|---|
| **Cumplimiento del núcleo MVP del pliego** (RF-01…RF-21 MVP + RNF + Fases 0–4) | **≈ 100 %** |
| **Cumplimiento global** (incluye Fase 2 y cierre Besu) | **≈ 96,1 %** |
| **Áreas por encima del pliego** (superación neta) | **8 de 9** (infraestructura queda condicionada por CI/DR/pinning) |
| **Requisitos del MVP no cubiertos** | **0** de 19 RF y **0** de 20 RNF aplicables |
| **Requisitos de Fase 2 no cubiertos** | 0 completos + **1 parcial** (RF-20: identidad/registro de viajeros, excluida por diseño) |
| **Multiplicador de alcance entregado** | **6,5× ficheros · 7,5× pruebas · 5,4× páginas · 19,8× rutas API · 35 ADR (referencia: 0)** |

**Veredicto:** el proyecto **cumple y supera** el pliego en el núcleo del MVP (100 % en las áreas A–F) y en alcance, profundidad de pruebas, documentación, identidad e infraestructura. Las brechas que quedan **no bloquean el MVP** y son de operación o de decisiones ya tomadas: **CI canónico sin ejecutar**, **drill de restauración A9 pendiente de IAM**, ***pinning* IPFS redundante pendiente de credenciales**, **entrega real de correo (dominio verificado)**, **registro de viajeros (excluido)** y **APK/legal (fuera del alcance del piloto)**.

---

## 2. Metodología

1. **Comparación contra la referencia** clonada de nuevo en `b1d7466` (sigue siendo el último commit de `main` en `gitlab.codecrypto.academy/misbia/eth-ejercicios/...`).
2. **Extracción del pliego**: 21 RF (RF-01…RF-21) y 22 RNF (RNF-01…RNF-22), 5 fases y 18 trabajos (`T0.1`…`T5.1`), más exigencias de infraestructura, seguridad y legal.
3. **Inventario actual del proyecto**: rutas web y API, componentes, contratos, herramientas MCP, worker, paquetes compartidos, infraestructura, manuales y evidencias.
4. **Puntuación**: `✅ = 1`, `⚠️ parcial = 0,5`, `❌ = 0`; se excluyen los requisitos de negocio/plazo (RNF-08, RNF-09) y se pondera por área (suma 100 %).
5. **Verificación ejecutada en esta revisión** (no en CI):
   - `forge test` → **20 suites, 202/202 pruebas**.
   - Vitest → **web 1212 · shared 776 · worker 209 · mcp 86 · monitor 42 = 2 325/2 325**.
   - `pnpm typecheck` (web/shared/worker) y `pnpm lint` (6/6 paquetes) → **verde**.
6. **Comprobación en producción**: `/health/ready` de web (`READY`), `/health` de worker (`ok`, `lag 0`, `emailDegraded false`) y `/health` de mcp (`ok`), contra el contrato desplegado en Besu 81234.

---

## 3. Comparación estructural

| Dimensión | Referencia (`b1d7466`) | Proyecto (`6215314`) | Ratio |
|---|---|---|---|
| Ficheros versionados | 306 | **2 002** | **6,5×** |
| Páginas web (`page.tsx`) | 14 | **75** | **5,4×** |
| Rutas API (`route.ts`) | 6 | **119** | **19,8×** |
| Componentes web | 57 | **193** | **3,4×** |
| Ficheros `packages/shared` | 31 | **172** | **5,5×** |
| Ficheros de prueba (`.test.ts(x)`) | 33 | **247** | **7,5×** |
| Suites de contrato (`.t.sol`) | 11 | **20** | **1,8×** |
| Pruebas ejecutadas (TS + Forge) | no medida (33 ficheros de prueba) | **2 527** | — |
| Docs normativos (`docs/*.md`) | 10 | **126** | **12,6×** |
| Docs de ingeniería (`RepoTecnico/*.md`) | 0 | **165** | — |
| ADR | 0 | **35** | — |
| Manuales | 0 | **131 md** (70 técnicos + 61 literales) + **44 PDF** públicos | — |
| Idiomas de la UI | 1 (ES) | **3 (ES/EN/RU)** | 3× |
| Jobs CI | 4 (GitHub) + 4 (GitLab) | **5 (GitHub) + 13 (GitLab, 10 ejecutables)** | 2,25× |

---

## 4. Matriz de requisitos funcionales

### 4.1 MVP (Hitos 1–4)

| RF | Requisito (pliego) | Estado | Evidencia en el proyecto |
|---|---|---|---|
| RF-01 | NFT ERC-721 (habitación × fecha), OpenZeppelin | ✅ | `packages/contracts/src/HotelNights.sol` (ERC721URIStorage + OZ) |
| RF-02 | Catálogo público de noches | ✅ | `app/{page,catalogo}`, `components/catalog`, `NightCard.tsx` |
| RF-03 | Compra con ETH nativo, anti-reentrancy | ✅ | `buy()` `nonReentrant whenNotPaused`; `HotelNights.buy.t.sol` |
| RF-04 | MetaMask + alta de red custom | ✅ | `components/wallet/*`, `config/chain.ts`; E2E con wallet inyectada |
| RF-05 | Back-office de minteo con validación | ✅ | `app/admin/mint`, `AdminMint.tsx`; publicación con minteo D-85 |
| RF-06 | Autenticación + control de acceso por roles | ✅ | SIWE/contraseña+TOTP, guardas por rol, `AccessControl` |
| RF-07 | Reventa solo vía contrato | ✅ | `list/unlist/buyResale`; `HotelNights.resale.t.sol` |
| RF-08a | Royalty ERC-2981 en secundaria, sin evasión | ✅ | `royaltyInfo`, `_update` bloquea `transferFrom`/precio 0 |
| RF-08b | **Royalty configurable por `ROYALTY_ADMIN`** (0–2000 bps) | ✅ **(cerrado en C1)** | `ROYALTY_ADMIN_ROLE`, `setRoyaltyBps`, validación de rango; tests de royalty |
| RF-09 | Email por venta (worker idempotente + catch-up) | ✅ | cola única + worker; **Mailtrap sandbox operativo** (2026-10-30), throttle 1/11 s |
| RF-10 | Dashboard admin con métricas mínimas | ✅ | `app/admin/dashboard`, gráficas y rankings |
| RF-12 | Asistente IA: MCP read-only + preparación de tx, LLM acotado, sin firma | ✅ **supera** | 6 herramientas MCP, orquestador con guardrails, PII, presupuesto, rate-limit; pool E2E real (2026-10-24) |
| RF-14 | Filtros y buscador (fecha, precio, tipo) | ✅ | `CatalogClient.tsx`, `lib/catalog-search.ts` |
| RF-15 | Histórico público de ventas | ✅ | `app/historico` + agregados del worker |
| RF-17 | Expiración lógica + burn en lote | ✅ | `burnExpired`, `burn-scheduler`, `app/admin/caducadas` |
| RF-18a | Maestro 50 habitaciones / 3 tipos | ✅ | `domain/room-master.ts` |
| RF-18b | Minteo por `MINTER` validado | ✅ | `mint()` + errores de dominio; `HotelNights.mint.t.sol` |
| RF-19 | Unicidad on-chain con tokenId determinístico | ✅ | `domain/token-id.ts`, revert `DuplicateNight` |
| RF-21 | Faucet de pruebas con límite por wallet/ventana | ✅ | `Faucet.sol`, `components/wallet/{FaucetButton,useFaucet}` |

**Núcleo RF MVP: 19 / 19 = 100 %.**

### 4.2 Fase 2 (fuera del piloto)

| RF | Requisito | Estado | Evidencia |
|---|---|---|---|
| RF-11 | Soporte WalletConnect además de MetaMask | ✅ | `lib/wallet-connectors.ts`; `projectId` persistido (B-4, 2026-10-22) y verificado en el bundle de producción |
| RF-13 | Subastas para habitaciones premium | ✅ **(cerrado en C2)** | `NightAuction.sol` + `NightAuction.t.sol` (29) + invariantes; `/subastas`, `admin/subastas`, CU-48/49, ADR-28. **Alcance: subasta primaria del hotel**; la subasta secundaria del huésped no está en el pliego y se decidió no implementarla (solo el hotel subasta) |
| RF-16 | Notificaciones push al móvil | ✅ | `public/sw.js`, `components/push/useWebPush.ts`, VAPID |
| RF-20 | Check-in/canje + identidad off-chain (registro de viajeros) | ⚠️ | Canje QR/JWS + check-in on-chain completos (`app/checkin`, recepción, ADR-05). **Identidad/registro de viajeros no implementado** (decisión: sin PII) |

**Fase 2: 3,5 / 4 = 87,5 %** (el pliego la sitúa expresamente fuera del MVP).

---

## 5. Matriz de requisitos no funcionales

| RNF | Requisito | Estado | Evidencia |
|---|---|---|---|
| RNF-01 | Responsive / mobile-first, táctil ≥44 px | ✅ | Tailwind + Playwright `mobile` |
| RNF-02 | Rendimiento: listado < 1 s, caché, paginación | ✅ | RSC + TanStack, load-more; gate de rendimiento (p95 medido) |
| RNF-03 | Gas despreciable (baseFee 0, min-gas 1000 wei) | ✅ | `shared/src/constants.ts`, `docs/SPIKE-BESU.md` |
| RNF-04 | Seguridad transversal | ✅ | RNF-13/14/15 cubiertos + guardianes |
| RNF-05 | Minimización de datos: sin PII on-chain | ✅ | PII-sanitizer, check-in sin PII, `docs/COMPLIANCE.md` |
| RNF-06 | i18n (ES ahora; EN/RU después) | ✅ **supera** | Tres catálogos completos ES/EN/RU |
| RNF-07 | Escalabilidad tráfico europeo | ✅ **supera** | Cloud Run multi-instancia; pruebas de carga |
| RNF-08 | Plazo | n/a | Requisito de negocio; proyecto desplegado y operativo |
| RNF-09 | Coste cerrado solo desarrollo | n/a | Requisito comercial |
| RNF-10 | Royalty forzado, sin vías de evasión | ✅ | `_update` + `_unlockTransfer`; invariantes |
| RNF-11 | Métricas de rendimiento verificables (LCP<2,5 s) | ✅ | `scripts/measure-perf.mjs`, job `perf-nightly`, informe de rendimiento |
| RNF-12 | Gestión de errores y resiliencia | ✅ | estados degradados, retries, checkpoints |
| RNF-13 | Claves y control de acceso | ✅ | `AccessControl` + `Ownable2Step` + Secret Manager + env fail-fast |
| RNF-14 | Seguridad de contratos verificable | ✅ | OZ, CEI + `nonReentrant`, slither como gate configurado |
| RNF-15 | Pausa de emergencia + withdraw a TREASURY | ✅ | `pause/unpause/withdraw/setTreasury` |
| RNF-16 | Estrategia de pruebas | ✅ **supera** | **2 527 pruebas** (2 325 TS + 202 Forge), Playwright E2E, invariantes |
| RNF-17 | Observabilidad: logging + health-checks + alertas | ✅ | `/health` en web/worker/mcp, monitor + alertas |
| RNF-18 | Compatibilidad y flujo móvil web3 | ✅ | Playwright mobile + carteras inyectada/Coinbase/WalletConnect |
| RNF-19 | Usabilidad y onboarding web3 | ✅ | onboarding, `TxModal`, handoff de compra, asistente guiado |
| RNF-20 | Accesibilidad WCAG 2.1/2.2 AA | ✅ | axe-core E2E, guardianes de paleta/contraste, identidad v3 medida |
| RNF-21 | Mantenibilidad: runbook por componente | ✅ **supera** | RUNBOOK + 131 manuales + 102 PDF |
| RNF-22 | Validación en **Besu real** (bloques, RPC, gas) | ✅ **(cerrado)** | Producción sobre **Besu 81234**; contrato v2 y aceptación en Besu documentada (`evidencias/aceptacion-besu-81234-*.json`, `c2-*`) |

**RNF aplicables (20): 20 / 20 = 100 %.**

---

## 6. Trabajos del plan de construcción (Fases 0–5)

| Trabajo | Alcance | Estado | Evidencia |
|---|---|---|---|
| T0.1 | Monorepo pnpm+turbo, `shared`, imágenes IPFS | ✅⚠️ | Monorepo completo; CID v1 + `pin-images.ts`; **Pinata pendiente de credenciales** |
| T0.2 | Contrato + roles + bootstrap + CI | ✅ | `HotelNights.sol`, bootstrap, `Deploy.s.sol`, CI con humo a Anvil 81234 |
| T0.3 | Secretos + fixtures + rebind | ✅ | env fail-fast, rebind del worker, migraciones |
| T1.1 | Mint + admin + faucet | ✅ | `mint()`, panel, Faucet + salud de saldo |
| T1.2 | Catálogo + filtros | ✅ | catálogo, filtros, estados empty/degraded |
| T1.3 | Compra primaria + onboarding | ✅ | `buy()`, BuyButton, revisión/firma/recibo |
| T1.4 | Worker de aviso de venta | ✅ | cola única + Mailtrap + /health con lag |
| T2.1 | Listar/cancelar reventa | ✅ | `list/unlist`, Mis noches |
| T2.2 | Compra de reventa + royalty + claim | ✅ | `buyResale`, pull payments, tests |
| T2.3 | Caducidad y burn | ✅ | `burnExpired`, planificador y panel |
| T2.4 | Royalty config + pausa + withdraw + setTreasury | ✅ | **royalty configurable** (C1), pausa/withdraw/tesorería |
| T3.1 | Histórico público | ✅ | histórico + agregados |
| T3.2 | Dashboard admin | ✅ | dashboard con métricas y rankings |
| T3.3 | Roles/ownership + observabilidad | ✅ | AccessControl + monitor |
| T3.4 | A11y, rendimiento, i18n-ready | ✅ **supera** | axe, presupuesto de rendimiento, 3 idiomas |
| T4.1 | MCP server del contrato | ✅ **supera** | 6 herramientas, `/health` |
| T4.2 | Orquestación LLM + guardrails | ✅ **supera** | orquestador, prompt acotado, filtros, rate-limit, presupuesto |
| T4.3 | Chat UI + estados | ✅ | panel global, handoffs, highlights, estados degradados |
| T5.1 | Deploy + aceptación en **Besu** | ✅ **(cerrado)** | Cloud Run + Cloud SQL + Redis sobre **Besu 81234**, contrato v2, aceptación documentada |

**Trabajos: 18,5 / 19 ≈ 97,4 %** (el único parcial es el *pinning* redundante de T0.1).

---

## 7. Áreas técnicas e infraestructura

### 7.1 Contrato inteligente
`HotelNights.sol` (ERC-721 + ERC-2981 + AccessControl + Pausable + ReentrancyGuard + Ownable2Step + ERC721URIStorage), `NightAuction.sol` (subasta inglesa con reserva, anti-sniping y pull payments), `Faucet.sol`, `HotelOperations.sol` (EIP-712 + nonces + roles de mantenimiento, vNext), interfaces y librerías. **20 suites Foundry, 202 pruebas, 0 fallos**. El contrato vigente se desplegó en **Besu 81234** y está verificado en el registro `packages/shared/deployments/81234.json`.

### 7.2 Web y back-office
**75 páginas y 119 rutas API**: catálogo, reventa, subastas, mis-noches, histórico, check-in QR, recepción, housekeeping, mantenimiento, reseñas, actividades, experiencias, planes, servicios, ayuda, ficha pública `/habitaciones/[room]` y back-office completo (mint, dashboard, caducadas, fondos, pausa, roles, royalty, sistemas, usuarios, contenido, reseñas, habitación, housekeeping, mantenimiento, seguridad, subastas). Identidad v3 aplicada: «Cal & Sal» en la suite pública y «Posidonia» en la administración, con tipografías autohospedadas ES/EN/RU.

### 7.3 Asistente IA
MCP por HTTP con **6 herramientas** (ninguna de firma), orquestación server-side con Vertex/Gemini, guardrails (dominio, *prompt injection*, anti-fuga), presupuesto y métricas de coste, *rate limiting*, enmascarado de PII, RAG sobre manuales, reserva por rango y **preparación de varias compras en un turno**. El pool E2E del 2026-10-24 (5 cuentas × 9 preguntas, 45 capturas) verificó el apoyo real y permitió corregir: fallback determinista con datos reales, guía de check-in, precios en ETH, ventana de fechas y «solo el hotel subasta».

### 7.4 Worker y datos
Listener único de eventos con checkpoint e idempotencia (ADR-34), agregados e histórico, outbox de anclaje + relayer, planificadores de burn/ventana/preventivos/retención, cola única de correo con **Mailtrap** y límite de ritmo (1/11 s). PostgreSQL 18 (esquema con **61 tablas**, guardianes documentales y plan de reset sincronizados) y Redis (colas). El worker está **`ok`**, con `lag 0` y `emailDegraded: false`.

### 7.5 Infraestructura y DevOps

| Elemento | Estado | Evidencia |
|---|---|---|
| CI GitHub Actions (build · schema · e2e · slither · perf) | ❌ **no ejecuta** | El workflow existe, pero los runs fallan en **2–3 s sin ejecutar ningún paso** (no es el código: localmente lint/typecheck/pruebas están verdes). Requiere permisos/facturación/runners del repositorio |
| CI GitLab (10 jobs ejecutables + 3 templates) | ⚠️ | `.gitlab-ci.yml` presente y completo; **no verificable desde este entorno** (sin token) |
| Humo a Anvil 81234 + verificación de roles | ✅ (código) | Job de CI + scripts `smoke`; ejecutable en local |
| Imagen única Docker por componente + Cloud Build | ✅ | `Dockerfile`, `cloudbuild.yaml`; imágenes `web:v95`, `worker:v92`, `mcp:v78` |
| Cloud Run (web/worker/mcp/health/pgadmin) | ✅ | web `READY`, worker `ok`, mcp `ok` |
| Cloud SQL (PostgreSQL 18) + Redis en VPC | ✅ | dependencias `UP` en `/health/ready` |
| Secret Manager + IAM/WIF sin claves JSON | ✅ | secretos y Service Account de Cloud Run |
| Monitor + alertas | ✅ | servicio `hotel-mcp-health` + `apps/monitor` |
| Copias y recuperación ante desastres | ⚠️ | backups/PITR y runbook listos; **drill A9 pendiente del permiso IAM `cloudsql.backups.restore`** |
| Red de producción **Besu 81234** | ✅ | contrato v2 + aceptación documentada |
| *Pinning* IPFS redundante (≥2 pinners) | ⚠️ | CID v1 + `pin-images.ts`; **Pinata sin credenciales** (`PINATA_JWT`) |

---

## 8. Desviaciones y hallazgos (estado a 2026-10-31)

| # | Hallazgo | Impacto | Severidad |
|---|---|---|---|
| 1 | **CI canónico sin ejecutar**: GitHub Actions falla antes de los pasos; GitLab sin verificar | No hay gate automático que respalde los «verdes»; la verificación es local | **Media-alta** |
| 2 | **A9 — drill de restauración a instancia aislada** pendiente del permiso IAM | La estrategia DR está documentada y probada parcialmente; falta el simulacro completo | Media |
| 3 | **Decisión 13 — pinning IPFS redundante** incompleto (Pinata) | Riesgo de persistencia de imagen/metadata | Media |
| 4 | **RF-20 — identidad/registro de viajeros** no implementado | Decisión consciente (sin PII); el canje/check-in sí está | Baja (permitida) |
| 5 | **Correo real**: el worker usa el **sandbox** de Mailtrap (captura); para entrega a buzones externos falta verificar el dominio del hotel y pasar a `GCP_SMTP_MODE=live` | Los avisos no llegan a un buzón real todavía | Media |
| 6 | **Subasta secundaria del huésped**: no implementada (decisión: **solo el hotel subasta**) | No incumple el pliego; el requisito 3.2 del encargo del pool queda rectificado | Baja (decisión) |
| 7 | **APK Android + legal** (H-02 dictamen, H-03 DPIA) | Fuera del alcance del piloto web; bloquea publicar APK | Baja para el pliego |
| 8 | **Dependencia externa del LLM** (Vertex/Gemini) | El asistente depende de un proveedor de IA; hay fallback y presupuesto | Baja |
| 9 | Documentación de numeración RF-20 (viajeros vs. asistente en el PRD/SRS del proyecto) | Confusión de trazabilidad, ya documentada | Baja |
| 10 | Cobertura E2E del pool solo en escritorio (no repetida en móvil) | Evidencia de calidad incompleta en ese punto | Baja |

> **Hallazgos de sincronización documental, corregidos en esta revisión:** `diccionario_datos.md` y `diagrama_er.md` declaraban 60 tablas cuando el esquema tenía 61 (faltaba contabilizar `room_mint_jobs`, D-85), y el plan de reset no clasificaba esa tabla. Se corrigió en el commit `6215314`; shared pasa de **773/776** a **776/776**.

---

## 9. Superación de alcance (lo entregado que el pliego no pedía)

- **Operación hotelera vNext**: `HotelOperations.sol` (EIP-712, firmas de operadores), recepción vNext, housekeeping, mantenimiento (incidencias, preventivos, áreas, suministros), operadores de terminal con PIN, auditoría append-only, outbox de anclaje + relayer, PMS, tarifas, pases, *fiat on-ramp*, reseñas, contenido, actividades/experiencias/planes/servicios.
- **Subastas primarias** (`NightAuction`): subasta inglesa con reserva, incremento mínimo, anti-sniping y devolución por pull payment, integrada en web y back-office.
- **Asistente**: 6 herramientas MCP, RAG sobre manuales, presupuesto/métricas de coste, *rate limiting*, saneador de PII, reserva por rango, preparación de compras múltiples y correcciones verificadas con un **pool E2E real** de 5 cuentas y 45 capturas.
- **Identidad visual v3** «Cal & Sal» (pública) + «Posidonia» (administración), con tipografías autohospedadas, ficha pública de habitación y verificación de contraste.
- **Infraestructura de producción real**: GCP Cloud Run + Cloud SQL + Redis + Artifact Registry + monitor + DR, sobre **Besu 81234**.
- **Volumetría**: **35 ADR**, **131 manuales** (70 técnicos + 61 literales) y **44 PDF** públicos versionados, **126 documentos `docs/`**, **165 documentos `RepoTecnico/`**, **247 ficheros de prueba**.
- **Guarda-nes automáticos**: arquitectura, sincronización documental, secretos, accesibilidad, identidad visual, precios y noches vendidas.

---

## 10. Cálculo del porcentaje

| Área | Peso | Puntuación | Aportación |
|---|---:|---:|---:|
| A. Contrato / on-chain | 20 % | 100 % | 20,00 |
| B. Web pública y UX | 15 % | 100 % | 15,00 |
| C. Back-office / admin | 10 % | 100 % | 10,00 |
| D. Worker, histórico y observabilidad | 12 % | 100 % | 12,00 |
| E. MCP + IA | 13 % | 100 % | 13,00 |
| F. Faucet / devnet | 3 % | 100 % | 3,00 |
| G. Fase 2 (fuera del MVP) | 5 % | 87,5 % | 4,38 |
| H. Infraestructura y DevOps | 12 % | 72,7 % (8/11) | 8,73 |
| I. Documentación y trazabilidad | 10 % | 100 % | 10,00 |
| **Total** | **100 %** | — | **≈ 96,1 %** |

- **Cumplimiento global: ≈ 96,1 %.**
- **Núcleo MVP (áreas A–F): 73 / 73 = 100 %.**
- **Superación:** en 8 de 9 áreas el proyecto iguala o supera el pliego; la única que queda por debajo es infraestructura, lastrada por el CI que no arranca, el drill A9 y el pinning IPFS.

---

## 11. Recomendaciones (priorizadas)

1. **Reparar el CI canónico** (prioridad 1): diagnosticar por qué GitHub Actions falla en 2–3 s sin pasos (facturación/permisos/runners) y decidir si se mantiene GitHub o se usa GitLab como CI oficial. Hoy los gates (lint, tests, slither, schema, e2e) **no se ejecutan** en remoto; en local todo está verde.
2. **Cerrar A9**: ejecutar el drill de restauración a instancia aislada cuando se conceda `cloudsql.backups.restore` y registrar la evidencia.
3. **Completar la Decisión 13**: provisionar Pinata (`PINATA_JWT`) y verificar/repinar los CIDs de las 3 imágenes + metadata.
4. **Correo real**: verificar el dominio del hotel en Mailtrap y desplegar con `GCP_SMTP_MODE=live` (el token ya está en Secret Manager); hoy el sandbox captura los correos.
5. **RF-20**: decidir formalmente si el registro de viajeros queda fuera de alcance (documentarlo en `docs/REQUISITOS.md`/ADR) o planificarlo con asesoría legal.
6. **APK y legal** (H-02/H-03): fuera del piloto; abordar antes de publicar la app.
7. **Mantener la sincronización documental**: el guardián ya vuelve a verde; incluir el recuento de tablas y el plan de reset en cualquier migración futura.
8. **Móvil**: repetir el pool E2E del asistente en viewport móvil para cerrar la evidencia de RNF-18.

---

## Anexo — Fuentes

- **Referencia:** `gitlab.codecrypto.academy/misbia/eth-ejercicios/hotel-room-mcp-trazable.git` @ `b1d7466` (2026-06-11), docs `REQUISITOS.md`, `PLAN-CONSTRUCCION.md`, `MATRIZ-TRAZABILIDAD.md`, `CASOS-DE-USO.md`, `PLAN-DE-PRUEBAS.md`, `BRIEF-CLIENTE-INICIAL.md`.
  - Idénticos en el proyecto: `REQUISITOS.md`, `CASOS-DE-USO.md`, `BRIEF-CLIENTE-INICIAL.md`.
  - Evolucionados en el proyecto: `PLAN-CONSTRUCCION.md`, `MATRIZ-TRAZABILIDAD.md`, `PLAN-DE-PRUEBAS.md`.
- **Proyecto evaluado:** `Hotel-DSH-GCP-v3` @ `6215314` (rama `main`), desplegado con `web:v95` (`hotel-mcp-web-00103-qvm`), `worker:v92` (`hotel-mcp-worker-00043-rzw`) y `mcp:v78` (`hotel-mcp-mcp-00027-cfv`).
- **Verificación ejecutada el 2026-10-31:** contratos 20 suites / 202 pruebas; web 1 212; shared 776; worker 209; mcp 86; monitor 42; typecheck y lint del monorepo en verde.
- **Evidencias clave:** `RepoTecnico/evidencias/aceptacion-besu-81234-2026-10-13.json`, `c2-subasta-2026-10-17.json`, `reset-publicaciones-contrato-nuevo-v2-2026-10-22.json`, `un-solo-indexador-2026-10-23.json`, `implementacion-2026-10-23-identidad-por-superficie.md`, `smtp-mailtrap-2026-10-30.json`, `e2e-pool-asistente-2026-10-24/INFORME-POOL-E2E-ASISTENTE.md`.
