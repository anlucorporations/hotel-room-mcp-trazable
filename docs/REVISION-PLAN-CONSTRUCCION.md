# Informe de revisión — Plan de construcción y matriz

> **Auditoría multi-agente** · 15 agentes: 7 revisores especializados + 7 críticos adversariales + 1 sintetizador.
> **Hallazgos confirmados:** 40 tras verificación adversarial — 5 altas · 22 medias · 13 bajas (consolidado).
> **Auditados:** `docs/PLAN-CONSTRUCCION.md`, `docs/MATRIZ-TRAZABILIDAD.md` · **Referencias:** REQUISITOS, CASOS-DE-USO, DISENO-TECNICO, PLAN-DE-PRUEBAS, DISENO-UX, SPIKE-BESU · **Fecha:** 2026-06-04

## 1. Veredicto general
El plan **NO está listo para arrancar la construcción sin correcciones previas**: hay 5 hallazgos de severidad alta que tocan cobertura del MVP (gestión de secretos ausente, /health de MCP y faucet sin Trabajo) y consistencia del método (desbalance de carga F1≈68h vs F4≈19h, DoD de Trabajo sin verificar onboarding web3 CU-17, DoD de T2.4 sin escenarios positivos de remediación en pausa). La matriz **no está perfecta**: arrastra una numeración de tareas divergente del plan (T-NNN vs T<fase>.<trabajo>) sin tabla de equivalencia, declara RF-06 cerrado en Hito 1 cuando el plan ejecuta la mitad de sus TC en FASE 3, y tiene TC-CT-094/095 solo en prosa. Hay vertientes del MVP exigidas por DISENO-TECNICO §12/§14 y REQUISITOS §10 (secret manager, bootstrap/revocación del EOA ADR-06, rebind de checkpoint en redeploy, seed del catálogo 50x90) que ningún Trabajo materializa, y una contradicción de especificación no reconciliada sobre el rol que guarda `withdraw()` (TREASURER vs DEFAULT_ADMIN_ROLE). La verticalidad declarada por el DoD Fase (E2E Playwright + demo) es insatisfacible tal como está escrita para F0, F2 y F5, que no tienen TC-E2E. En conjunto: base sólida y trazabilidad casi completa, pero con vacíos de cobertura y desalineaciones plan↔matriz que deben cerrarse antes de la primera fase.

## 2. Resumen por severidad

| Severidad | Nº de hallazgos |
|-----------|-----------------|
| Alta | 5 |
| Media | 22 |
| Baja | 13 |
| **Total** | **40** |

## 3. Hallazgos críticos (severidad alta)

1. **Endpoints /health de MCP y faucet (RNF-17) sin Trabajo asignado, pero el monitor de T3.3 los sondea.**
   - Ubicación: PLAN T4.1 (MCP), T1.1 tarea (g) (faucet), T3.3 (monitor /health).
   - Problema: RNF-17 (CASOS §9, DISENO §12) exige /health en worker, MCP y faucet. Solo T1.4 entrega /health del worker (TC-WK-030). T4.1 lista 4 tools + buildPurchaseTx sin /health; T1.1(g) faucet sin /health. T3.3 entrega monitor /health (TC-NF-020) que sondearía endpoints que nadie construye; PLAN-DE-PRUEBAS §5 ya anota "TC-NF-020 (+ /health faucet)".
   - Recomendación: Añadir `GET /health` (200 {status} / 503 + COMPONENT_DOWN) a entregables de T4.1 (MCP) y T1.1/faucet (con FAUCET_LOW_THRESHOLD, TC-CT-102). Enlazar el monitor de T3.3 a los tres endpoints citando TC-NF-020 y TC-WK-030/031.

2. **No hay ningún Trabajo/tarea de gestión de secretos (SMTP, ANTHROPIC_API_KEY, clave de deploy, PINATA_JWT).**
   - Ubicación: PLAN §1 (ausente); DISENO §12 "Matriz de secretos"; REQUISITOS §10 / RNF-13.
   - Problema: §12 define almacén=secret manager por entorno, inyección por env y rotación; REQUISITOS §10 lo marca obligatorio ("nunca en el repositorio"). RNF-13 en la matriz solo se traza a TC on-chain de AccessControl. T1.4 (email) y T4.2 (LLM) asumen SMTP/ANTHROPIC disponibles; worker y MCP no arrancan en CI/staging sin esto.
   - Recomendación: Añadir en FASE 0 (o tarea transversal) "Gestión de secretos por entorno": secret manager, `.env.example`, inyección en GitHub Actions y runtime de web/worker/mcp/api-route, rotación y verificación "cero secretos en repo". Trazar a RNF-13 con oráculo verificable antes de T1.4 y T4.2.

3. **T1.3 declara CU-17 pero su aceptación (titulada "(CU-05)") no contiene ningún criterio de onboarding web3.**
   - Ubicación: PLAN T1.3, línea "Aceptación (CU-05)".
   - Problema: T1.3 declara CU-05/17 y lista TC-E2E-060/061/062/063, pero no hay "Aceptación (CU-17)": faltan conexión+alta de red (chainId 81234), no-wallet (17a/TC-E2E-061), wrong-network sin construir tx (17c/TC-E2E-062), estados de tx (RNF-19/TC-E2E-063). El escenario 17b (rechazo de conexión sin error bloqueante) no tiene TC pese a que §6 afirma "Escenarios sin TC: 0".
   - Recomendación: Añadir "Aceptación (CU-17)" cubriendo TC-E2E-060/061/062/063, y crear un TC para 17b (o documentar su exclusión) para sostener §6.

4. **La aceptación de T2.4 omite los escenarios positivos de remediación en pausa (CU-14) y la reanudación, pese a que sus TC los cubren.**
   - Ubicación: PLAN T2.4, línea "Aceptación".
   - Problema: T2.4 lista TC-CT-072 (withdraw permitido en pausa), TC-CT-073 (reanudación → Sale(PRIMARY)), TC-CT-076 (grant/revoke en pausa), TC-CT-083 (reentrancy en withdraw). La aceptación solo enumera caminos de bloqueo. No exige que la pausa NO bloquee la remediación del admin —escenario de seguridad operativa crítico—.
   - Recomendación: Ampliar aceptación: "en pausa, withdraw (TC-CT-072) y grant/revokeRole (TC-CT-076) se ejecutan; tras unpause la compra emite Sale(PRIMARY) (TC-CT-073); reentrancy en withdraw → ReentrancyGuardReentrantCall, saldo 0 y 1 Withdrawn (TC-CT-083)".

5. **Desbalance fuerte de carga entre fases: F1 (~68h) casi triplica F4 (~19h), todas rotuladas "~1 semana", sin capacidad declarada.**
   - Ubicación: PLAN §0 y §1 — FASE 1 vs FASE 3/FASE 4.
   - Problema: F1=68h (T1.1=21, T1.2=18, T1.3=19, T1.4=10), F3=28h, F4=19h. A 40h/semana F1 no cabe en una semana y F3/F4 quedan medio vacías. El plan no declara personas-hora/semana, así que "semana N" no es verificable.
   - Recomendación: Declarar capacidad/semana asumida y rebalancear (partir F1 en dos iteraciones o reasignar a la holgura de F3/F4). Añadir por fase una fila "horas totales estimadas vs capacidad".

## 4. Hallazgos por dimensión

### 4.1 Cobertura

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Alta | T4.1, T1.1(g), T3.3 | /health de MCP y faucet (RNF-17) sin Trabajo; el monitor de T3.3 sondearía endpoints inexistentes | Añadir /health a T4.1 y faucet; enlazar monitor a worker/MCP/faucet (TC-NF-020, TC-WK-030/031) |
| Media | PLAN (ausente); DISENO §12; RNF-13 | Gestión de secretos off-chain no materializada; RNF-13 solo trazado a TC on-chain | Asignar secret manager por entorno a T0.2/T5.1 o tarea transversal; trazar RNF-13 con oráculo |
| Media | T0.2(c), T3.3, T5.1; ADR-06 | Bootstrap de roles en deploy (asignar 6 roles → revocar EOA) sin entregable/aceptación | Añadir bootstrap de roles al script de deploy con aceptación `hasRole`; trazar a ADR-06/RNF-13 |
| Media | T1.2 (FASE 1) | El catálogo puede omitir LISTADA_SECUNDARIO (CU-04) que CU-07 necesita para ser descubrible | Incluir estado LISTADA_SECUNDARIO (badge Reventa, precio) en lectura/render; iteración de T1.2 tras T2.1 |
| Baja | PLAN (ausente); REQUISITOS RNF-21 vs MATRIZ §4/§5 | Discrepancia RNF-21 (runbook): REQUISITOS lo marca MVP, MATRIZ/CASOS lo mandan a Fase 2 | Resolver clasificación: o declarar RNF-21 fuera del MVP coherentemente, o añadir runbook por componente a T5.1/T3.3 |
| Baja | T0.2 (CI) y DoD; TC-NF-050 | TC-NF-050 (slither, RNF-14) no listado en ningún Trabajo; DoD solo exige "sin high", no triage de medium | Referenciar TC-NF-050 en el Trabajo que cierra el contrato (T2.4/T5.1) y exigir triage documentado de medium en DoD |

### 4.2 Trazabilidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Media | MATRIZ §2/§3 vs PLAN §1 | Numeraciones divergentes (T-NNN vs T<fase>.<trabajo>) sin tabla de equivalencia; ID de commit ambiguo | Fijar numeración canónica (jerárquica del plan) y reescribir MATRIZ §2/§4/§5, o ejecutar sdd-task-generator; verificar con sdd-traceability-check |
| Media | MATRIZ §4 RF-06 vs PLAN T3.3/T1.1 | RF-06 declarado completo en Hito 1 pero el plan ejecuta roles/Ownable2Step (TC-CT-090..093) en FASE 3 | Dividir RF-06: CU-01/SIWE en Hito 1 (T1.1); CU-16 roles/Ownable2Step en FASE 3 (T3.3); marcar Hito "1/3" |
| Media | PLAN T2.4 vs T3.3 | setTreasury (TC-CT-094/095/096, CU-16) probado en T2.4 sin declarar CU-16; ausente de aceptación de T3.3 | Dar un único hogar a setTreasury: añadir CU-16 a T2.4 con aceptación, o mover los TC a T3.3 |
| Baja | MATRIZ §5 prosa vs tablas §4/§5 | TC-CT-094 y TC-CT-095 solo en prosa, sin fila tabular (096 sí está en RNF-13) | Incluir 094/095 en fila RNF-13 (junto a 096) o en fila RF-06/CU-16, asignados a T2.4 |
| Baja | MATRIZ §4 RF-02/RF-14/RNF-01/02/11/12 vs PLAN T1.2 | RF-02/RF-14 etiquetados Hito 3 mientras el plan los construye en FASE 1 (T1.2) sin justificar | Documentar la conciliación hito-de-capacidad vs semana-de-construcción, o actualizar Hito de esos RF a Fase 1 |

### 4.3 Fidelidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Media | T0.2, T2.4 (TC-CT-081), T3.3 | Rol de `withdraw()` no reconciliado: TREASURER (ADR-06/§4/CU-14) vs DEFAULT_ADMIN_ROLE (CU-15/TC-CT-081); el plan nunca nombra TREASURER | Reconciliar antes de codificar el modificador y el oráculo de TC-CT-081; reflejar el rol elegido en T2.4 y, si es TREASURER, añadirlo a T0.2 (esqueleto) y T3.3 |
| Media | T1.2 (FASE 1) | El catálogo puede no contemplar LISTADA_SECUNDARIO → CU-07 no descubrible | (ver 4.1) Ampliar lectura/render a reventas conforme CU-04 y DISENO-UX §5.2 |
| Baja | T1.1 (Aceptación CU-02) | No se eleva a criterio el invariante "CID de metadata fijado ANTES del mint" (tokenURI resoluble desde el bloque del mint) | Añadir a Aceptación de T1.1: tokenURI fijado/resoluble en el mismo bloque del mint (DISENO §5 paso 2), reflejado en tarea (d) |

### 4.4 Verticalidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Media | T2.2 (CU-07) | No hay E2E de compra de reventa: venta secundaria con royalty firmada en wallet nunca se ejercita end-to-end (TC-E2E-020 es solo PRIMARIA) | Crear TC-E2E-023 (card Reventa → firma → ownerOf=comprador + Sale(SECONDARY) + RoyaltyPaid + pull) y tarea explícita de UI de compra secundaria; distinguir "UI cobrar (claim)" de "UI comprar reventa" |
| Media | FASE 2 (T2.1-T2.4) | DoD de fase exige E2E + demo pero ningún Trabajo de F2 tiene E2E (solo TC-CT) | Definir E2E mínimos de F2 (listar/cancelar reventa, compra secundaria, claim, flujo admin) o declarar Trabajos "habilitadores de contrato" y posponer la demo |
| Media | FASE 0 | El DoD Fase exige demo de flujo + E2E Playwright, que F0 habilitadora no puede cumplir, sin excepción declarada | DoD específico para fases habilitadoras: sustituir por "pipeline CI verde end-to-end (compila, deploy de humo a Anvil --chain-id 81234, suites vacías en verde)" |

### 4.5 Dependencias

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Media | PLAN §1 T3.1/T3.2 (Dep: T2.2); T1.4; §2 ASCII | T3.1/T3.2 no declaran dependencia formal del worker T1.4 (capa de agregados leen agregados precomputados, ADR-09) | Añadir "Dep: T2.2, T1.4 (infra worker)" y dibujar arista T1.4→T3.1/T3.2, o separar "capa de agregados" como entregable dependiente de T1.4 |
| Media | PLAN §2 ASCII vs §1 T1.3 (Dep: T1.1, T1.2) | El diagrama omite la arista T1.2→T1.3 y la contradice etiquetando T1.2 como "∥ T1.4" | Corregir el diagrama (incluir T1.2→T1.3) o eliminar esa dependencia de T1.3; coherencia Dep/etiqueta/grafo |
| Media | PLAN §1 T2.3 (Dep: T1.1) | CU-13d (AlreadySold) requiere `buy()`/soldOnce de T1.3 (ADR-16), pero T2.3 solo declara Dep: T1.1 | Incluir T1.3 en Dep de T2.3; aclarar si TC-CT-070..083 presuponen buy() y ajustar diagrama/CP |
| Media | PLAN §2 ASCII vs §1 T3.3 (Dep: T2.4), T3.4 (Dep: T1.2, T3.1, T3.2) | El diagrama presenta T3.4 como paralelo cuando es sucesor de T3.1/T3.2; omite T2.4→T3.3 y T1.2/T3.1/T3.2→T3.4 | Redibujar el grafo con todas las aristas; marcar T3.4 sucesor de T3.1/T3.2 y T3.3 sucesor de T2.4; verificar ausencia de ciclos |
| Baja | PLAN §2 (CP); T5.1 (Dep: todas) | El camino crítico se afirma sin cálculo por horas; con T5.1 Dep:todas, el CP real es el máximo sobre todas las ramas | Recalcular ponderando horas; documentar cadenas competidoras (IA: T4.1→T4.2→T4.3; operación: T3.1/T3.2→T3.4) y cuál domina |

### 4.6 DoD

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Alta | T1.3 "Aceptación (CU-05)" | Sin "Aceptación (CU-17)" para onboarding web3 pese a declarar CU-17 y listar TC-E2E-060..063 | (ver crítico 3) Añadir Aceptación (CU-17) y TC para 17b |
| Alta | T2.4 "Aceptación" | Omite remediación en pausa (CU-14) y reanudación pese a TC-CT-072/073/076/083 | (ver crítico 4) Ampliar la aceptación |
| Media | DoD Fase (L40) vs F0/F2/F5 | "E2E Playwright + MCP wallet" incondicional, insatisfacible para F0, F2 y F5 (sin TC-E2E) | Diferenciar DoD por tipo de fase: deploy de humo (F0), TC-ACC (F5); para F2 definir un E2E de reventa o declarar el diferimiento |
| Media | DoD Tarea/Trabajo (L24-36) | Sin umbral de cobertura verificable pese a PLAN-DE-PRUEBAS §2 (100% ramas contrato; ≥90% líneas worker/MCP) | Añadir item de cobertura al DoD Trabajo y exigir que los invariants (TC-CT-017/018/046/049) corran sin contraejemplo en su Trabajo de origen |
| Media | T3.3 "Aceptación (CU-16)" | Declara monitor /health + alertas pero no exige el oráculo de TC-NF-020 (RNF-17) | Añadir criterio: "monitor sondea /health cada N s; ante 503/COMPONENT_DOWN o lag>umbral → alerta (TC-NF-020)"; aclarar no duplicar /health del worker (TC-WK-030/031) |
| Media | T2.4 vs T3.3 (setTreasury) | setTreasury (CU-16) huérfano de su CU y probado en un Trabajo cuya aceptación no lo menciona | (ver 4.2) Único hogar para setTreasury con su criterio de aceptación |
| Baja | T1.1 (CU-02) y T2.1 (CU-06) | TC-E2E-022 (rechazo de firma, parametrizado CU-02/05/06) solo en T1.3; T1.1 y T2.1 cierran sin exigir 02f/06e | Referenciar TC-E2E-022 (parte CU-02 en T1.1, parte CU-06 en T2.1) con criterio "rechazo de firma → sin cambio on-chain" |
| Baja | T1.2 "Aceptación (CU-04)" | No exige catálogo vacío (04b) pese a listar TC-E2E-014 | Añadir "sin resultados → empty-state con 0 tarjetas (TC-E2E-014)" |
| Baja | T2.2 "Aceptación (CU-07)" | No menciona NotListed (07b) aunque el rango incluye TC-CT-047 | Añadir "reventa de listado inexistente/retirado → revert NotListed (TC-CT-047)" |
| Media | DoD Fase L40 vs F0/F2/F5 | (duplicado consolidado con la fila de arriba: E2E incondicional insatisfacible) | Ver fila "DoD Fase (L40)" |
| Baja | T3.2 "Aceptación (CU-11)" | No exige presentar cada métrica con unidad (ETH) y periodo (CU-11 paso 2) que TC-E2E-050 verifica | Añadir "cada métrica se muestra con unidad (ETH) y periodo (TC-E2E-050)" |
| Baja | DoD Fase (L41) y T3.4 | "RNF según aplique" sin tabla Fase→RNF/TC; cierre de accesibilidad del catálogo indeterminado (axe TC-NF-030 llega en T3.4) | Sustituir por tabla Fase→RNF/TC (F1: TC-NF-001/002/040; F4: TC-NF-010); declarar o adelantar TC-NF-030 sobre vistas entregadas |
| Baja | T4.2 "Aceptación" | "OOD≥48/50" presentado como gate pese a ser indicador no-gate nightly (TC-NF-010, §8) | Separar DoD verificable-en-cierre (TC-MCP-005a/006 deterministas) del indicador OOD; marcar OOD como métrica nightly, no condición de Done |

### 4.7 Completitud

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|----------------|
| Alta | PLAN §0/§1 — F1 vs F3/F4 | Desbalance F1≈68h vs F4≈19h sin capacidad/semana declarada | (ver crítico 5) Declarar personas-hora/semana y rebalancear; fila "horas vs capacidad" por fase |
| Alta | PLAN §1 (ausente); DISENO §12; REQUISITOS §10 | Sin Trabajo de gestión de secretos (SMTP/ANTHROPIC/deploy/PINATA_JWT) | (ver crítico 2) Tarea de secret manager en FASE 0 / transversal |
| Media | PLAN §0 vs T1.1/T1.2/T1.3 | La suma de tareas excede "Trabajo ≈1-2 días" (T1.1=21h, T1.2=18h, T1.3=19h) y T1.1 mezcla contrato+IPFS+SIWE+UI+faucet | Partir T1.1 (contrato vs back-office) o ampliar/documentar la definición de Trabajo; cada Trabajo ≤16h |
| Media | PLAN T5.1 vs DISENO §10/§16.4 | Despliegue/coordinación de web, worker y MCP para FASE 5 no planificado (solo deploy del contrato) | Coordinar provisión worker/web/MCP en Besu, variables por entorno y orden de arranque/health; declarar responsabilidad ops y dependencia bloqueante |
| Media | PLAN §1 (ausente) vs DISENO §14 / ADR-22 | Falta tarea de rebind del checkpoint del worker y re-cálculo de agregados en redeploy del contrato inmutable | Añadir tarea (FASE 0 / T1.4/T3.1): deployments/<chainId>.json {address, deploymentBlock, abiHash} + script de rebind; test "address cambia → reprocesa sin duplicar emails" |
| Media | PLAN §1 (ausente) vs PLAN-DE-PRUEBAS §3/§4 | Sin seed del catálogo 50x90 ni fixtures para perf, E2E de catálogo/histórico/dashboard y demos del DoD | Añadir tarea(s) de seed/fixtures (mint 50x90, prefinanciación por faucet, ventas/listados) en FASE 0 o inicio de T1.2/T3.1/T3.2 |
| Media | PLAN T5.1 vs PLAN-DE-PRUEBAS §1/§7, SPIKE-BESU | FASE 5 (8h) subdimensionada; no declara precondición bloqueante "wallet de pruebas financiada" ni buffer por inestabilidad de Besu | Declarar precondición (responsable Codecrypto), separar "suite del worker en Besu (RNF-22 Z)" y añadir buffer; reestimar a rango realista |
| Media | PLAN T3.2/T4.1/T4.2 vs T1.x | Desbalance de granularidad: los Trabajos de mayor incertidumbre (LLM/MCP F4, dashboard T3.2) menos descompuestos y peor estimados | Descomponer T3.2/T4.1/T4.2/T4.3 al grano de F1 (p.ej. T4.2: prompt-engineering, validación server-side TC-MCP-004, guardrails TC-MCP-005a/006, transporte HTTP, test-first); reestimar |
| Media | PLAN T1.1(d) vs REQUISITOS Decisión 13/§7, DISENO §16.3 | El pipeline IPFS (3h) no incluye redundancia de pinning ni subida única de las 3 imágenes; no resuelve Pinata vs Kubo | Separar: (1) decisión Pinata/Kubo + subida única de imágenes a shared (FASE 0); (2) pipeline metadata con CID fijado antes del mint (T1.1); (3) redundancia/verificación de CIDs (operación) |
| Baja | PLAN §2 vs §3 | §3 no soporta la paralelización anunciada: solo rama lineal, sin worktrees, integración de ramas paralelas ni conflictos en shared | Detallar en §3 la operativa: contrato en único responsable/worktree, orden de integración, política de rebase, resolución de conflictos en packages/shared |
| Baja | PLAN §3 paso 8 vs §0 / PLAN-DE-PRUEBAS §8 | Ambigüedad "Merge a main (o PR) cuando la Fase cierra su E2E": no fija si cada Trabajo abre PR con PR-gate ni quién mergea | Fijar: 1 Trabajo = 1 PR contra rama de fase con PR-gate obligatorio; rama de fase → main al cerrar DoD Fase; indicar responsable de merge |

## 5. Cobertura: qué falta por incluir
Componentes/requisitos del MVP no cubiertos por ningún Trabajo (o de forma ambigua), con el Trabajo donde añadirlos:

- **RNF-17 — /health de MCP**: ausente en T4.1 → añadir a entregables/tests de **T4.1** (200/503 + COMPONENT_DOWN).
- **RNF-17 — /health de faucet**: ausente en T1.1(g) → añadir a **T1.1/faucet** con FAUCET_LOW_THRESHOLD (TC-CT-102).
- **RNF-17 — monitor end-to-end**: enlazar el monitor de **T3.3** a worker+MCP+faucet (TC-NF-020).
- **RNF-13 (off-chain) — gestión de secretos**: ausente → nueva tarea en **FASE 0 / transversal** (secret manager, .env.example, inyección CI/runtime, rotación). Hoy RNF-13 solo se traza a TC on-chain.
- **ADR-06 — bootstrap de roles + revocación del EOA**: implícito → añadir a **T0.2(c)/T5.1** con aceptación `hasRole` para los 6 roles y revocación verificada.
- **CU-04/CU-07 — estado LISTADA_SECUNDARIO en catálogo**: no contemplado en **T1.2** → ampliar lectura/render + iteración tras T2.1; sin esto CU-07 no es descubrible.
- **CU-16 — setTreasury (TC-CT-094/095/096)**: probado en T2.4 sin CU declarado → asignar hogar único en **T2.4** (con CU-16) o **T3.3**.
- **RNF-14 — TC-NF-050 (slither + triage de medium)**: no en lista de Tests de ningún Trabajo → referenciar en **T2.4/T5.1**.
- **CU-17 — onboarding web3 (escenario 17b)**: sin TC en PLAN-DE-PRUEBAS → crear TC o documentar exclusión en **T1.3**.
- **DISENO §14 — rebind de checkpoint en redeploy**: ausente → tarea en **FASE 0 / T1.4 / T3.1**.
- **PLAN-DE-PRUEBAS §3 — seed/fixtures (catálogo 50x90, wallets prefinanciadas, ventas/listados)**: ausente → tarea en **FASE 0** o inicio de **T1.2/T3.1/T3.2**.
- **DISENO §10/§16.4 — despliegue coordinado web/worker/MCP en Besu**: solo contrato en T5.1 → coordinar en **FASE 5**.
- **Decisión 13 / §16.3 — pinning redundante + Pinata vs Kubo**: no resuelto → decidir en **FASE 0** antes de T1.1(d).
- **RNF-21 — runbook de operación por componente**: discrepancia MVP vs Fase 2 → resolver clasificación o añadir a **T5.1/T3.3**.

## 6. Matriz de trazabilidad: correcciones para dejarla perfecta
Desalineaciones detectadas y cómo unificarlas:

1. **Numeración de tareas (matriz vs plan)**: MATRIZ usa T-NNN (ej. trailer "Task: T-211", T-110..T-115) y PLAN usa T<fase>.<trabajo> (T1.1, T3.3). No hay mapeo 1:1 (T1.1 absorbe T-110..T-115). **Acción**: fijar la jerárquica del plan como canónica, reescribir el ejemplo de MATRIZ §2 y la columna Tarea(s) de §4/§5, o ejecutar sdd-task-generator; si conviven temporalmente, añadir tabla de equivalencia T-NNN→T<fase>.<trabajo> en MATRIZ §3. Verificar con sdd-traceability-check.
2. **RF-06 mal asignado a Hito 1**: la fila incluye TC-CT-090..093 (CU-16, FASE 3 en el plan). **Acción**: dividir RF-06 — CU-01/SIWE + AccessControl (TC-INT-001, TC-CT-001) en Hito 1/T1.1; roles + Ownable2Step (CU-16, TC-CT-090..093) en FASE 3/T3.3. Marcar Hito "1/3" y mover TC al sub-rango de fase.
3. **TC-CT-094 y TC-CT-095 solo en prosa**: §5 dice "setTreasury (TC-CT-094..096) trazados" pero solo 096 está en fila tabular (RNF-13). **Acción**: añadir 094/095 a la fila RNF-13 (junto a 096) o a una fila RF-06/CU-16, asignados a T2.4. Esto sostiene "0 huérfanos" a nivel tabular.
4. **RF-02/RF-14/RNF-01/02/11/12 en Hito 3 vs FASE 1 del plan**: el plan adelanta el catálogo a T1.2. **Acción**: documentar la conciliación (vista de hito de capacidad vs semana de construcción) o actualizar el Hito de esos RF a Fase 1 reasignando T-310 a T1.2.
5. **setTreasury sin CU de origen coherente**: TC-CT-094/095/096 viven en MATRIZ líneas 113-114 bajo CU-16 pero T2.4 no declara CU-16. **Acción**: alinear con la decisión del punto 3 de §7.
6. **RNF-21 clasificación contradictoria**: REQUISITOS=MVP, MATRIZ §4/§5=Fase 2/proceso. **Acción**: unificar clasificación en ambos documentos.

## 7. Plan de acción priorizado
Cambios concretos, ordenados por prioridad:

**Bloqueantes antes de arrancar (alta):**
1. **PLAN §0/§1**: declarar capacidad personas-hora/semana y rebalancear F1 (partir T1.1 y/o repartir a F3/F4); añadir fila "horas vs capacidad" por fase.
2. **PLAN FASE 0**: añadir tarea transversal de gestión de secretos (secret manager, .env.example, inyección CI/runtime, rotación) antes de T1.4 y T4.2; trazar RNF-13 (vertiente off-chain) con oráculo en MATRIZ.
3. **PLAN T4.1 y T1.1(g)**: añadir `GET /health` (200/503 + COMPONENT_DOWN) a MCP y faucet; **T3.3**: enlazar el monitor a los tres endpoints (TC-NF-020, TC-WK-030/031).
4. **PLAN T1.3**: añadir "Aceptación (CU-17)" (TC-E2E-060/061/062/063) y crear TC para 17b o documentar su exclusión.
5. **PLAN T2.4**: ampliar la aceptación con remediación en pausa y reanudación (TC-CT-072/073/076/083).
6. **Specs (reconciliar antes de codificar)**: resolver el rol de `withdraw()` (TREASURER de ADR-06/§4/CU-14 vs DEFAULT_ADMIN_ROLE de CU-15/TC-CT-081); reflejar en T0.2 (esqueleto), T2.4 (modificador) y T3.3.

**Correcciones de matriz y trazabilidad (media):**
7. **MATRIZ**: fijar numeración canónica (jerárquica del plan), reescribir ejemplo §2 y columnas §4/§5, o ejecutar sdd-task-generator; añadir tabla de equivalencia si conviven; verificar con sdd-traceability-check.
8. **MATRIZ**: dividir RF-06 por sub-parte (Hito 1 vs FASE 3) y marcar "1/3"; añadir TC-CT-094/095 a fila tabular (RNF-13 o RF-06/CU-16).
9. **PLAN T2.4/T3.3**: dar hogar único a setTreasury (CU-16 con aceptación), coherente con la matriz.
10. **PLAN §1/§2**: corregir dependencias y diagrama ASCII — añadir T1.4→T3.1/T3.2, T1.2→T1.3, T2.4→T3.3, T1.2/T3.1/T3.2→T3.4; marcar T3.4 sucesor (no paralelo); incluir T1.3 en Dep de T2.3; recalcular el camino crítico por horas (CP = max sobre ramas que entran a T5.1).
11. **PLAN DoD Fase**: diferenciar por tipo de fase (deploy de humo en F0; TC-ACC en F5; E2E de reventa en F2 — definir TC-E2E-023 y E2E mínimos de listar/cancelar/claim/admin); sustituir "RNF según aplique" por tabla Fase→RNF/TC.
12. **PLAN DoD Trabajo**: añadir umbral de cobertura (100% ramas contrato / ≥90% líneas worker-MCP en CI) y exigir invariants sin contraejemplo en su Trabajo de origen; añadir triage documentado de slither "medium" (TC-NF-050).
13. **PLAN T5.1 / FASE 5**: declarar precondición "wallet de pruebas financiada" (ops Codecrypto), separar "suite worker en Besu (RNF-22 Z)", coordinar despliegue web/worker/MCP y orden de arranque, añadir buffer y reestimar.
14. **PLAN FASE 0 / T1.4-T3.1**: añadir tarea de rebind de checkpoint + re-cálculo de agregados en redeploy (DISENO §14); tarea de seed/fixtures (catálogo 50x90, wallets, ventas/listados).
15. **PLAN T0.2(c)/T5.1**: añadir bootstrap de roles (asignar 6 roles → revocar EOA) con aceptación `hasRole` (ADR-06).
16. **PLAN T1.1(d) / FASE 0**: resolver Pinata vs Kubo (§16.3), subida única de las 3 imágenes con CIDs fijos a shared, y redundancia/verificación de pinning (Decisión 13).
17. **PLAN T3.2/T4.1/T4.2/T4.3**: descomponer al grano de F1 y reestimar reconociendo la incertidumbre del Hito 4.

**Detalles de aceptación y proceso (baja):**
18. **PLAN**: añadir criterios omitidos a aceptaciones — T1.1 (CID antes del mint; TC-E2E-022 parte CU-02), T1.2 (empty-state TC-E2E-014), T2.1 (TC-E2E-022 parte CU-06), T2.2 (NotListed TC-CT-047), T3.2 (métrica con unidad/periodo TC-E2E-050), T3.3 (oráculo TC-NF-020), T4.2 (separar OOD nightly del DoD).
19. **PLAN §3**: detallar operativa de paralelización (contrato en único worktree, orden de integración, rebase, conflictos en packages/shared) y fijar "1 Trabajo = 1 PR con PR-gate" eliminando la ambigüedad "main (o PR)".
20. **REQUISITOS + MATRIZ/PLAN**: resolver la clasificación de RNF-21 (MVP vs Fase 2) de forma coherente, añadiendo runbook por componente a T5.1/T3.3 si se mantiene en MVP.