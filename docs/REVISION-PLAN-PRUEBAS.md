# Informe de revisión — Plan de pruebas y matriz de trazabilidad

> **Auditoría multi-agente** · 15 agentes: 7 revisores especializados + 7 críticos adversariales + 1 sintetizador.
> **Hallazgos confirmados:** 54 tras verificación adversarial — 11 altas · 30 medias · 13 bajas (consolidado).
> **Auditados:** `docs/PLAN-DE-PRUEBAS.md`, `docs/MATRIZ-TRAZABILIDAD.md` · **Referencias:** `REQUISITOS.md`, `CASOS-DE-USO.md`, `DISENO-TECNICO.md` · **Fecha:** 2026-06-04

## 1. Veredicto general

El PLAN y la MATRIZ tienen una estructura sólida (pirámide de niveles, oráculos por defecto, cadena REQ→CU→escenario→TC) y cubren bien el camino feliz y los reverts principales del contrato, pero **no están listos para guiar la implementación test-first del Hito 1 sin correcciones previas**. Hay tres clases de defecto bloqueantes: (a) **TCs referenciados pero no materializados** en §4 (TC-NF-020/030/040/050, TC-WK-030, TC-ACC-010/011/012), que rompen la regla declarada "ningún caso sin oráculo" y vacían los gates de PR/salida de §7/§8; (b) **oráculos no falsables** en los puntos de mayor riesgo (reentrancy de buy/buyResale/withdraw, y la ausencia total de TC de reentrancy en `claim()`, el vector pull más expuesto de ADR-15); y (c) **incoherencias factuales entre documentos de la misma fecha** (PLAN/MATRIZ tratan Besu como sin quórum mientras DISENO v2 la declara operativa, y RNF-22 deja X/Y/Z sin fijar pese a que CASOS delega esa decisión al plan). La afirmación de §6 "0 huérfanos / todos los escenarios con TC" no se sostiene: faltan TC para empty-states (04b/09a), NotListed (06d/07b), NotExpired (13c), mint en pausa, setTreasury, estados de tx (CU-17) y rechazo de firma. Para el Hito 1 concreto, además, RF-09 está mal asignado a Hito 3 contradiciendo su adelanto explícito en REQUISITOS §6.

## 2. Resumen por severidad

| Severidad | Nº de hallazgos (deduplicados) |
|-----------|-------------------------------|
| Alta | 11 |
| Media | 30 |
| Baja | 13 |
| **Total** | **54** |

## 3. Hallazgos críticos (severidad alta)

1. **PLAN/MATRIZ tratan Besu como caída/sin quórum, contradiciendo el DISENO v2 de la misma fecha**
   - Ubicación: PLAN §1 (l.16-18), §2 (l.28), §6 (l.236-241), §7 (l.248-249); MATRIZ §3 T-900 (l.66), §5 (l.117-118); vs DISENO v2 encabezado, §10, §16.
   - Problema: PLAN (2026-06-04) declara la aceptación on-chain "bloqueada mientras la red esté sin quórum"; DISENO de la misma fecha declara la red operativa (~2 s/bloque) y el gate del spike cerrado. Contradicción factual entre documentos hermanos.
   - Recomendación: sincronizar PLAN §1/§2/§6/§7 y MATRIZ §3/§5; cambiar estado de TC-ACC-001/002 y RNF-22 a "ejecutable en Besu staging (red operativa)"; reprogramar T-900 sin la condición "cuando haya quórum"; conservar solo la nota de riesgo de uptime (RNF-17, DISENO §16).

2. **Precondición real del gate TC-ACC-* es wallet financiada + flujo MetaMask, no "quórum"**
   - Ubicación: PLAN §1/§7/§8; DISENO cabecera, §9, §16.2 (TC-ACC-002 pendiente de validar UI MetaMask).
   - Problema: el único pendiente real es validar el flujo desde la UI de MetaMask y disponer de wallet con saldo; el gate no tiene disparador accionable.
   - Recomendación: redefinir la precondición de TC-ACC-* a "wallet de pruebas financiada en Besu (81234) + flujo MetaMask validado (TC-ACC-002)" y añadirla como criterio de entrada del gate de aceptación final.

3. **RNF-22 (X/Y/Z) sin fijar pese a que CASOS delega la decisión al plan; TC-ACC-010/011/012 sin fila ni oráculo en §4**
   - Ubicación: PLAN §5 (l.222), §7; CASOS §9 RNF-22 ("X/Y/Z a fijar en el plan de pruebas"); DISENO §13 (~33 s idle) y §9 (~2 s/bloque, ~194 ms P50, 24 h).
   - Problema: el gate de aceptación no es declarable pase/fallo sin umbrales numéricos; DISENO arrastra "~33 s idle" obsoleto que choca con "~2 s/bloque en producción".
   - Recomendación: fijar X = tiempo de bloque P50/P95 ≤ valor concreto (p.ej. ≤ 3-5 s sobre ≥100 bloques con tx reales, **no** 33 s idle), Y = RPC P95 ≤ valor concreto sobre ≥N muestras, Z = 24 h con 0 eventos Sale perdidos y ≥1 reconexión forzada; crear TC-ACC-010 (bloque), TC-ACC-011 (latencia), TC-ACC-012 (estabilidad eventos/gas) con oráculo en §4; corregir el "~33 s idle" de DISENO §13.

4. **RNF-01/RNF-14/RNF-17/RNF-20 referencian TCs (TC-NF-040/050/020/030, TC-WK-030) inexistentes como fila en §4**
   - Ubicación: PLAN §5 (l.209/216/218/221), MATRIZ §4 RNF (l.97/104/106/109); vs PLAN §4 (solo define TC-NF-001/002/010).
   - Problema: IDs huérfanos "por arriba" (verificación declarada sin oráculo materializado), lo que contradice §6 "todos verificados / 0 huérfanos" y vacía los gates de §7/§8.
   - Recomendación: crear filas en §4 con escenario+oráculo+nivel+estado: TC-NF-040 (breakpoints 320/768/1024, áreas táctiles ≥44px, sin scroll horizontal); TC-NF-050 (slither 0 high, triage de medium); TC-NF-030 (axe-core 0 critical/serious + contraste 4.5:1/3:1); TC-WK-030 (/health 200{status,lastBlock,uptime}; 503+COMPONENT_DOWN tras N fallos); TC-NF-020 (lag=headBlock-lastBlock + alerta).

5. **RNF-17 (observabilidad) sin oráculo materializado (503, COMPONENT_DOWN, alerta, lag)**
   - Ubicación: RNF-17 / CASOS §9 / PLAN §5 / DISENO §12.
   - Problema: EARS precisa (200{status,lastBlock,uptime}; N fallos→503+COMPONENT_DOWN; alerta email; lag) sin ningún escenario/TC.
   - Recomendación: TC-WK-030 (/health 200/503 + COMPONENT_DOWN); TC-NF-020/TC-WK-031 (alerta + métrica lag). Incluir como gate de PR. Mapear a RNF-17, CU-10/CU-11; cubrir también /health del faucet.

6. **CU-07 07b "listado retirado/inexistente" (NotListed) sin TC; NotListed sin revert directo en 06d y 07b**
   - Ubicación: CU-07 07b, CU-06 06d / CASOS §3 NotListed.
   - Problema: error canónico con dos flujos de excepción documentados y sin ningún TC.
   - Recomendación: TC-CT-035 (unlist sin listado activo → revert NotListed) y TC-CT-047 (buyResale sin listado activo → revert NotListed). Reflejar en §6 y en la fila RF-07 de la MATRIZ.

7. **Oráculo de reentrancy solo comprueba el revert, no que el efecto NO se aplicó (TC-CT-024/044/083)**
   - Ubicación: TC-CT-024 (05f), TC-CT-044 (07e), TC-CT-083 (15c).
   - Problema: el único oráculo es el selector `ReentrancyGuardReentrantCall`; un guard que revierte la reentrada pero deja un efecto parcial duplicado pasaría siendo el contrato vulnerable. Oráculo no falsable frente al bug real.
   - Recomendación: aseverar (a) revert con el selector y (b) estado final de UNA sola operación: TC-CT-024 → 1 `Sale(PRIMARY)`, ownerOf cambia una vez, TREASURY +precio una vez; TC-CT-044 → 1 `Sale(SECONDARY)`+1 `RoyaltyPaid`, pendingWithdrawals acreditado una vez; TC-CT-083 → saldo contrato 0 y 1 `Withdrawn`. Conteo de eventos + invariante de saldo.

8. **`claim()` es nonReentrant pero no tiene TC de reentrancy: el vector pull más expuesto queda sin oráculo**
   - Ubicación: DISENO §4/§12 (nonReentrant en buy/buyResale/claim/withdraw), ADR-15; PLAN §5 RNF-14 (solo TC-CT-024/044/083).
   - Problema: `claim()` es el único punto donde vendedor/receptor reciben ETH push; no hay TC ni aparece en RNF-14.
   - Recomendación: TC-CT-048 "Reentrancy en claim()" con beneficiario-contrato que reintente en `receive`; oráculo: revert `ReentrancyGuardReentrantCall` + retiro exactamente una vez (pendingWithdrawals[addr]==0, sin doble pago). Añadir a RNF-14 §5 y a CU-07 §6. Cubre también el "receptor reentrante" del EARS de CU-07 07e.

9. **Oráculo de concurrencia "a-lo-sumo-una" más débil que la propiedad exacta del escenario (TC-CT-023)**
   - Ubicación: TC-CT-023 (CU-05 05d, l.85).
   - Problema: "a lo sumo una" se satisface también con CERO transferencias (no prueba liveness ni el selector del perdedor); el Gherkin exige "exactamente una transfiere y emite Sale Y la otra revierte con NightNotAvailable(token)".
   - Recomendación: reforzar a igualdad exacta: ownerOf(token)==uno de los compradores; exactamente 1 `Sale(PRIMARY)`; la otra tx revierte `NightNotAvailable(token)`. Mantener el invariant "no dos transferencias" como complemento.

10. **Invariante de contabilidad de pull payments (ADR-15) ausente; TC-CT-041 solo cubre una reventa**
    - Ubicación: TC-CT-041/045 (CU-07 07f); ADR-15; DISENO §11 promete invariant para "pull/DoS".
    - Problema: falta el invariant stateful acumulado que el diseño promete; solo hay casos dirigidos.
    - Recomendación: invariant stateful con handler buyResale/claim/list/unlist y bps variable: (a) Σ pendingWithdrawals + Σ claims + Σ royaltiesAcreditados == Σ ETH recibido en buyResale; (b) balance contrato == Σ saldos pendientes no reclamados; (c) ningún claim excede lo acreditado. Reforzar TC-CT-045 (receptor que rechaza ETH: saldo permanece acreditado, 0 wei perdidos).

11. **Validación de calendario (InvalidDate) como fuzz de contrato contradice ADR-08 (cálculo off-chain)**
    - Ubicación: TC-CT-015 (CU-02 02e); ADR-08 (DISENO §3); CASOS §3 InvalidDate.
    - Problema: ADR-08 dice que el calendario se valida off-chain y el contrato recibe AAAAMMDD ya validado, pero CASOS §3 lista `InvalidDate()` como revert on-chain y TC-CT-015 lo fuzzea sobre el contrato. Si la lógica está off-chain, el fuzz apunta a la herramienta equivocada y la pirámide §2 no tiene nivel para fuzzear la derivación de fecha en `shared`.
    - Recomendación: resolver primero la contradicción de la spec; si es off-chain, mover la validación a un test property-based en Vitest (fast-check sobre año/mes/día, feb bisiesto/no, MM=00/13, DD=00) en `shared` y dejar TC-CT-015 solo para lo que el contrato sí valida; si es on-chain, corregir ADR-08.

## 4. Hallazgos por dimensión

### Cobertura

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| media | CU-04 04b / empty-state | Estado vacío del catálogo sin TC (oráculo data-testid explícito) | TC-E2E-014: catálogo sin noches → `data-testid=empty-state` + 0 tarjetas. Mapear a 04b |
| baja | CU-09 09a / empty-state | Histórico sin ventas sin TC | TC-E2E-041: histórico sin eventos Sale → `data-testid=empty-state`. Mapear a 09a |
| media | CU-09 09b, CU-11 11b / degradado | Degradado de histórico/dashboard sin TC; el modo de fallo real es el endpoint del worker, no RPC | TC-E2E-042 (histórico, endpoint worker caído→degradado+retry) y TC-E2E-051 (dashboard, agregados no disponibles) |
| media | CU-08 08a | checkAvailability exists=false + alternativas {type} sin TC | TC-MCP-007: noche inexistente→exists=false; listAvailableNights({type})≥1 alternativa en CATALOG_WINDOW_DAYS |
| media | DISENO §6 listAvailableNights | Herramienta MCP read-only sin TC dedicado | TC-MCP-008: listAvailableNights({window,type}) solo DISPONIBLE/LISTADA en ventana y respeta filtro |
| media | CU-06 06d / flujo paso 3 | unlist sin listado activo y re-list con nuevo precio sin TC | TC-CT-035 (NotListed) y TC-CT-036 (re-list re-emite `Listed`, mantiene LISTADA) |
| media | CU-13 13c / NotExpired | burnExpired de token no expirado sin TC | TC-CT-067: lote con token futuro → revert `NotExpired(tokenId)`. Coherente con ADR-16 |
| media | CU-14 EARS / DISENO §4 | mint en pausa sin TC | TC-CT-075: mint() en pausa → revert `EnforcedPause` |
| baja | CU-14 tabla de pausa | grantRole/revokeRole en pausa no verificado | TC-CT-076: en pausa, grant/revokeRole por DEFAULT_ADMIN → éxito + `RoleGranted/RoleRevoked` |
| media | CU-16 / DISENO §4 | setTreasury + `TreasuryUpdated` sin TC | TC-CT-094 (éxito + evento + redirige withdraw/royalty), TC-CT-095 (address(0)→revert), TC-CT-096 (sin rol→revert) |
| baja | CU-05 05a | Saldo insuficiente sin TC | TC-E2E-021: saldo<precio → botón deshabilitado o fallo controlado con mensaje (RNF-12) |
| baja | CU-02 02f / CU-05 05g / CU-06 06e | Rechazo de firma sin TC | TC-E2E-022 (MCP wallet) parametrizado: rechazo→sin cambio on-chain (ownerOf/listings/soldOnce) + UI vuelve al estado previo |
| media | CU-17 / RNF-19 | Estados de tx (pendiente/confirmada/revertida) sin TC | TC-E2E-063 con control de minado: pendiente→confirmada y revertida con mensaje claro |
| baja | CU-10 escenario QBFT / 10c | Finalidad inmediata (CONFIRMATIONS_N=1) sin traza; Gherkin de TC-WK-001 cita "2 confirmaciones" vs constante=1 | TC-WK-005 (email tras CONFIRMATIONS_N leyendo la constante) o referenciar RNF-22; alinear el literal "2" |
| media | CU-10 10b | Fallo SMTP con backoff + EMAIL_DELIVERY_FAILED + alerta sin TC | TC-WK-006 (mock SMTP que falla): backoff + log + alerta sin perder checkpoint |
| baja | CU-PR-01 / RF-21 / RNF-17 | Faucet sin TC de saldo bajo (FAUCET_LOW_THRESHOLD) ni /health | TC-CT-102 (saldo<FAUCET_AMOUNT→no dispensa+alerta); /health del faucet en TC-WK-030. Fijar FAUCET_LOW_THRESHOLD |
| media | CU-07 07e | Reentrada "del receptor" de royalty sin TC | Cubrir el path del receptor en TC de reentrancy de claim() (ver crítico 8) |
| baja | CU-05e vs CU-13 / ADR-08 | Cruce de medianoche solo en compra; reventa/burn solo estáticos | TC de coherencia con mismo timestamp en umbral: buy revierte NightExpired y burnExpired admite el mismo token |

### Oráculos

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| alta | TC-CT-024/044/083 | Solo verifica revert, no la no-duplicación del efecto | Ver crítico 7 |
| alta | TC-CT-023 (05d) | "a-lo-sumo-una" más débil que "exactamente una + NotAvailable" | Ver crítico 9 |
| baja | TC-CT-041 (07f) | No asevera importes acreditados ni residual tras claim | Aseverar pendingWithdrawals[vendedor]+pendingWithdrawals[receptor]==msg.value y residual 0 tras claim() de ambos |
| media | TC-CT-046 (07e/RNF-10) | "transfer revierte" no fija el selector DirectTransferDisabled | Fijar selector `DirectTransferDisabled()`; diseñar el caso para que sin autolimpieza el transfer tendría éxito; añadir control donde la marca SÍ está activa |
| baja | TC-CT-050 (CU-12) | No asevera `RoyaltyUpdated` ni royaltyBps()==valor | Reforzar: en bordes con éxito (0/1999/2000), aseverar `RoyaltyUpdated(old,new)` + royaltyBps()==valor |
| media | TC-CT-050/072/073 | Oráculos "éxito/OK" sin efecto ni evento | TC-CT-073→ownerOf==buyer + `Sale(PRIMARY)`; TC-CT-072 reforzable con saldo contrato 0 + TREASURY + `Withdrawn` (opcional) |
| media | TC-MCP-003 | "correcto"/"sin firma" vago (ADR-11) | Decodificar data: selector==buy/buyResale, tokenId solicitado; to==deployments[chainId].address; value==priceOf(tokenId); chainId==BESU_CHAIN_ID; sin rawTransaction/v-r-s y sin signer |
| media | TC-MCP-005 / TC-NF-010 | Conflaciona chiste inocuo con petición de transferencia maliciosa | Desdoblar: (a) 0 tool-calls de dominio (chiste); (b) buildPurchaseTx==0 y 0 tx preparada para "transfiere mis fondos". TC-NF-010: dataset N=50 fijo + modelo pineado |
| media | TC-WK-004 | "sin pérdida ni duplicado" no cuantificable | N eventos Sale durante desconexión → exactamente N emails (idempotency-key=keccak(txHash,logIndex)); checkpoint avanza; segunda pasada 0 emails |
| media | TC-ACC-001 | "tx minada" no asevera efecto ni condición RNF-03 | receipt.status==0x1; ownerOf==buyer + `Sale(PRIMARY)`; TREASURY +precio; gas según entorno (Anvil gasPrice=0; Besu MIN_GAS_PRICE_WEI=1000) |
| media | TC-NF-002 | Omite marcas de medida y tamaño muestra de EARS CU-04 | Δ entre `rpc:response` y `catalog:rendered`; ≥50 iteraciones catálogo 50×90; P75<RENDER_TARGET_MS; replicar n≥50 en TC-NF-001 (LCP, 4G) |
| media | TC-E2E-020/001/030 | Términos subjetivos sin marcador observable | TC-E2E-020→ownerOf + data-testid recibo con tokenId; TC-E2E-001→data-testid minteo habilitado tras HTTP 200; TC-E2E-030→panel muestra to/value/tokenId y asevera value==priceOf(tokenId) (ADR-11) antes de firmar |

### Coherencia

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| alta | PLAN §1/§2/§6/§7, MATRIZ §3/§5 vs DISENO v2 | Besu sin quórum vs operativa | Ver crítico 1 |
| media | TC-E2E-060 (CU-17) | Asevera chainId 81234 (Besu) en Estado=Anvil sin documentar el chainId del Anvil de CI | Documentar que Anvil de CI arranca con --chain-id 81234 o parametrizar el oráculo al "chainId esperado del entorno" |
| baja | PLAN §5 RNF-03 vs CASOS §9 | Oráculo PLAN (gas no nulo, 1000 wei) contradice EARS CASOS ("gasPrice=0/saldo no varía") | Corregir CASOS §9 RNF-03/RNF-22 a "gas efectivo con MIN_GAS_PRICE_WEI=1000, baseFee=0"; anotar la desviación en el PLAN entretanto |
| baja | DISENO §7/§12 vs CASOS §9 RNF-17 | Shape /health difiere (lag vs uptime) | Unificar el contrato de /health (status, lastBlock, lag y/o uptime) y reflejar el oráculo de TC-WK-030/TC-NF-020 en §4 |
| media | DISENO §11 (mock IPFS 404) vs ADR-12/§8 (imágenes por CDN) | El 404 del gateway IPFS no ejercita el origen real de la imagen (CDN) | Aclarar qué resuelve por IPFS (metadata) vs CDN (imagen); inyectar 404 en el origen real de img-fallback; TC separado para metadata IPFS |

### Trazabilidad

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| media | MATRIZ §4 RF-02 (l.75) vs CASOS §10/CU-08 vs PLAN §4 CU-08 | RF-02 omite CU-08 en tres documentos | RF-02 \| CU-04, CU-08; añadir TC-MCP-001 como cubriente; alinear encabezado CU-08 en PLAN a "RF-12, RF-02" |
| media | MATRIZ §4 RF-04 (l.77) vs CASOS §10 | RF-04 reducido a CU-17; pierde firma CU-05/CU-07 | Ampliar a "CU-17, CU-05, CU-07" y añadir TC-E2E-020, TC-ACC-001 junto a TC-E2E-060/TC-ACC-002 |
| media | MATRIZ §4 RF-09 (l.82), §3 T-311 vs REQUISITOS §6 | RF-09 en Hito 3 contradice su adelanto a Hito 1 | Reasignar RF-09 y el worker de email a Hito 1 (§3 y fila RF-09), TC-WK-001 como gate de Hito 1; o documentar la excepción |
| media | MATRIZ §4 RF-06/RNF-13 vs PLAN §4 CU-16 | TC-CT-092/093 (Ownable2Step) no trazados; huérfanos reales | Añadir TC-CT-092/093 a RF-06 (y RNF-13); explicitar Ownable2Step en T-110; recalcular métrica de huérfanos |
| media | MATRIZ §4 / PLAN §5 (TC-NF-020/030/040/050, TC-WK-030, TC-ACC-010/011/012) | TCs referenciados sin fila/oráculo en §4 | Ver críticos 3 y 4; definir filas con EARS de origen |
| baja | MATRIZ §4 RNF (l.98) vs REQUISITOS RNF-11 | RNF-11 fusionado con RNF-02; "llamadas RPC por vista" y "punto de quiebre" sin oráculo | Oráculo propio: contador de llamadas RPC por vista ≤ umbral + doc del breakpoint (Decisión 23), trazado a CU-04 |

### Nivel / herramienta

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| alta | TC-CT-015 (02e) / ADR-08 | Fuzz de contrato apunta a lógica off-chain | Ver crítico 11 |
| alta | TC-CT-041/045 (07f) / DISENO §11 | Falta invariant stateful de contabilidad pull | Ver crítico 10 |
| media | TC-CT-011/016 (RF-19) / DISENO §11 | Falta invariant stateful de unicidad global de tokenId | Invariant: totalSupply==pares (room,date) únicos; id==room·1e8+AAAAMMDD; sin segundo mint del mismo par |
| media | TC-CT-023/021 (05d) / ADR-16 | TC-CT-023 mal etiquetado "invariant" (es unit secuencial); falta invariant de monotonía soldOnce | Reclasificar TC-CT-023 a unit; invariant: soldOnce[id] monótono, ningún buy() posterior tras soldOnce, ≤1 `Sale(PRIMARY)` por token |
| media | TC-E2E-003 (01c) / 01b | Replay nonce SIWE y firma caducada solo en E2E; falta integración server-side | Añadir nivel integración Vitest (supertest/route handler): HTTP 401/403 sobre endpoint SIWE (nonce consumido, TTL, firma inválida); dejar camino feliz en E2E |
| baja | TC-CT-046/043 (RNF-10) / ADR-07 | Falta invariant de causalidad de ownerOf y vía approve+operador | Invariant: todo cambio de ownerOf vía buy/buyResale/mint/burn; transfer directo y vía operador siempre `DirectTransferDisabled`; marca transient 0 al inicio de tx |
| baja | TC-CT-014/025/060/061 / ADR-08, DISENO §11 | "fecha/DST" prometido sin fuzz ni test off-chain del margen UTC | Fuzz con vm.warp alrededor del umbral (incl. DST) coherente en mint/buy/list/burn; test off-chain Madrid→AAAAMMDD→umbral UTC fijando el margen de ADR-08 |
| baja | PLAN §5 RNF-03 vs Besu | RNF-03 mapeado solo a Besu (bloqueado) cuando es verificable en Anvil | TC-CT-110/TC-WK-040 (Anvil gasPrice=0): balanceAfter==balanceBefore-value; mantener TC-ACC-001 para gas efectivo en Besu |
| baja | TC-CT-041/050 (07f/CU-12) | Invariante royalty+vendedor==precio en un solo punto (333 wei @ 1000 bps) | Parametrizar/fuzzear bps {0,1,1000,2000} × precios {1,3,333,odd-large}; aclarar con spec el comportamiento de `RoyaltyPaid` cuando amount==0 |
| baja | TC-CT-017 (nuevo) / ADR-08 | Coherencia civil(Madrid)-vs-umbral-UTC sin TC | TC-CT-017: fechas alrededor de CET↔CEST y 31-dic/1-ene con block.timestamp controlado; documentar offset asumido |
| media | PLAN §2/§7/§8 | Objetivos 100% ramas / ≥90% líneas sin herramienta, fail-under ni alcance medible | Especificar forge coverage (lcov + filtro de selectores críticos, branch%<100 falla) y vitest thresholds.lines=90; listar funciones de "lógica crítica" |

### Completitud

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| alta | claim() / DISENO §4/§12 / ADR-15 | Reentrancy de claim() sin TC | Ver crítico 8 |
| alta | RNF-22 / §5 / §7 | X/Y/Z sin fijar; TC-ACC-010/011/012 ausentes de §4 (gate de aceptación) | Ver crítico 3 |
| media | CU-07 07e | Reentrada del receptor de royalty sin ejercitar | Cubrir en TC de reentrancy de claim() o aclarar TC-CT-044; verificar selector + 1 `Sale(SECONDARY)` |
| media | TC-CT-023 (05d) | Oráculo "at most one" más débil que CU-05d | Ver crítico 9 |
| media | ADR-08 margen UTC | Coherencia civil-vs-UTC en expiración sin TC | Ver fila TC-CT-017 en Nivel |

### CI

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| media | PLAN §3 / DISENO §11 | No diferencia forge (vm.warp/vm.roll) del nodo Anvil externo (evm_/anvil_) | Tabla "nivel→mecanismo de tiempo": TC-CT=vm.warp/vm.roll+expectRevert; TC-WK/TC-E2E=evm_setNextBlockTimestamp+evm_mine, automine off |
| media | TC-CT-023 / TC-E2E-020 | "mismo bloque" sin mecanismo de minado por lote | Documentar formulación: (a) invariant forge "1 Sale, 2ª revierte NightNotAvailable" o (b) E2E automine off + evm_mine; fijar oráculo de orden |
| media | PLAN §7 / DISENO §11 / TC-E2E-060 | Sin pin de versión Foundry/Anvil; chainId del Anvil de CI no fijado a 81234 | Añadir a §7: toolchain Foundry pineado (no nightly) y Anvil con --chain-id 81234 --hardfork cancun |
| media | PLAN §2/§8 / DISENO §11 | Contrato del harness de replay LLM sin definir | Definir grabación request→response, versionado e invalidación del fixture al cambiar prompt/herramientas; oráculo sobre tool-calls del cliente MCP (08b/08c); verificación estructural de que el MCP no expone herramienta de firma |
| media | PLAN §4 / §8 / DISENO §9 | Timeouts/espera E2E por entorno no materializados (Anvil instantáneo vs Besu ~2-33 s) | Matriz de timeouts por entorno; anclar a waitForTransactionReceipt(confirmations=CONFIRMATIONS_N) + estado UI RNF-19; parametrizar Playwright por proyecto |
| media | PLAN TC-WK-001..004 / DISENO §7 | Doble SMTP sin fijar; corte/recuperación RPC (TC-WK-004) sin especificar | Fijar mock SMTP (nodemailer stub/jsonTransport o mailpit) + oráculo de conteo==count(Sale); especificar cierre/reapertura WS o --dump-state/--load-state; leer checkpoint SQLite |
| alta | PLAN §2/§6 | "0 huérfanos / todos los escenarios con TC" no se sostiene | Tras añadir los TC, corregir §6 al estado real; hasta entonces enumerar gaps conocidos en vez de declarar 0 huérfanos |

## 5. Gaps de cobertura concretos

| Escenario / EARS / RNF sin TC (o insuficiente) | TC a añadir |
|---|---|
| CU-04 04b empty-state (catálogo vacío) | **TC-E2E-014** |
| CU-09 09a empty-state (histórico sin ventas) | **TC-E2E-041** |
| CU-09 09b degradado de histórico (endpoint worker) | **TC-E2E-042** |
| CU-11 11b degradado de dashboard (agregados) | **TC-E2E-051** |
| CU-08 08a checkAvailability exists=false + alternativas {type} | **TC-MCP-007** |
| listAvailableNights (herramienta MCP read-only) | **TC-MCP-008** |
| CU-06 06d unlist sin listado activo (NotListed) | **TC-CT-035** |
| CU-06 flujo paso 3 re-list con nuevo precio | **TC-CT-036** |
| CU-07 07b buyResale sin listado activo (NotListed) | **TC-CT-047** |
| CU-13 13c burnExpired de token no expirado (NotExpired) | **TC-CT-067** |
| CU-14 mint en pausa (EnforcedPause) | **TC-CT-075** |
| CU-14 grantRole/revokeRole en pausa | **TC-CT-076** |
| CU-16 setTreasury + TreasuryUpdated (éxito / address(0) / sin rol) | **TC-CT-094/095/096** |
| CU-05 05a saldo insuficiente | **TC-E2E-021** |
| CU-02 02f / CU-05 05g / CU-06 06e rechazo de firma | **TC-E2E-022** |
| CU-17 / RNF-19 estados de tx (pendiente/confirmada/revertida) | **TC-E2E-063** |
| CU-10 10c finalidad QBFT (CONFIRMATIONS_N=1) | **TC-WK-005** |
| CU-10 10b fallo SMTP + backoff + EMAIL_DELIVERY_FAILED + alerta | **TC-WK-006** |
| reentrancy de claim() (vector pull, ADR-15) + receptor 07e | **TC-CT-048** |
| RNF-01 responsive (breakpoints, ≥44px) | **TC-NF-040** (definir fila §4) |
| RNF-14 slither (0 high) | **TC-NF-050** (definir fila §4) |
| RNF-17 /health 200/503 + COMPONENT_DOWN + uptime | **TC-WK-030** (definir fila §4) |
| RNF-17 lag + alerta | **TC-NF-020/TC-WK-031** (definir fila §4) |
| RNF-20 axe-core + contraste | **TC-NF-030** (definir fila §4) |
| RNF-22 X/Y/Z (bloque, RPC P95, estabilidad) | **TC-ACC-010/011/012** (definir fila §4 con umbrales) |
| RNF-03 gas en Anvil (gasPrice=0) | **TC-CT-110/TC-WK-040** |
| Faucet saldo bajo (FAUCET_LOW_THRESHOLD) + /health | **TC-CT-102** + /health en TC-WK-030 |
| ADR-08 coherencia civil/UTC (DST, fin de año) | **TC-CT-017** |
| Invariant unicidad global tokenId (DISENO §11) | invariant en CU-02 |
| Invariant monotonía soldOnce (ADR-16) | invariant en CU-05 |
| Invariant contabilidad pull acumulada (ADR-15) | invariant en CU-07 |
| Replay SIWE / firma caducada server-side (01b/01c) | TC-INT (integración Vitest) |

## 6. Oráculos a reforzar

- **TC-CT-024 (05f):** revert `ReentrancyGuardReentrantCall` **Y** exactamente 1 `Sale(PRIMARY)`, ownerOf cambia una vez, TREASURY +precio una vez.
- **TC-CT-044 (07e):** revert `ReentrancyGuardReentrantCall` **Y** exactamente 1 `Sale(SECONDARY)` + 1 `RoyaltyPaid`, pendingWithdrawals acreditado una sola vez.
- **TC-CT-083 (15c):** revert `ReentrancyGuardReentrantCall` **Y** saldo del contrato a 0 + 1 `Withdrawn`.
- **TC-CT-023 (05d):** de "a-lo-sumo-una transferencia" → "exactamente 1 `Sale(PRIMARY)` al ganador **Y** la otra revierte `NightNotAvailable(tokenId)`".
- **TC-CT-041 (07f):** añadir pendingWithdrawals[vendedor]+pendingWithdrawals[receptor]==msg.value y residual del contrato 0 tras claim() de ambos; parametrizar bps {0,1,1000,2000} × precios {1,3,333,odd}.
- **TC-CT-046 (07e):** fijar selector `DirectTransferDisabled()`; diseñar para que sin autolimpieza el transfer tendría éxito; añadir caso de control con marca activa.
- **TC-CT-050 (CU-12):** royaltyBps()==v **Y** emite `RoyaltyUpdated(old,v)` en bordes con éxito (0/1999/2000).
- **TC-CT-073 (CU-14):** ownerOf(token)==buyer **Y** emite `Sale(PRIMARY)` tras unpause.
- **TC-MCP-003 (CU-08):** decodificar data (selector buy/buyResale + tokenId), to==deployments[chainId].address, value==priceOf(tokenId), chainId==BESU_CHAIN_ID; sin rawTransaction/v-r-s ni signer.
- **TC-MCP-005:** desdoblar en (a) 0 tool-calls de dominio (chiste) y (b) buildPurchaseTx==0 + 0 tx preparada ("transfiere mis fondos").
- **TC-WK-004:** N eventos Sale → exactamente N emails por idempotency-key=keccak(txHash,logIndex); checkpoint avanza; segunda pasada 0 emails.
- **TC-ACC-001:** receipt.status==0x1; ownerOf==buyer + `Sale(PRIMARY)`; TREASURY +precio; gas según entorno (Anvil 0 / Besu MIN_GAS_PRICE_WEI=1000).
- **TC-NF-002 / TC-NF-001:** anclar a `performance.mark('rpc:response')`/`('catalog:rendered')`, ≥50 iteraciones, catálogo 50×90, perfil 4G concreto.
- **TC-E2E-020/001/030:** anclar a marcadores observables (ownerOf + data-testid recibo; data-testid minteo tras HTTP 200; panel con to/value/tokenId + value==priceOf(tokenId) antes de firmar).

## 7. Plan de acción priorizado

1. **Sincronizar estado de Besu (P0, bloqueante de coherencia):** actualizar PLAN §1/§2 (l.16-18, l.28), §6 (l.236-241), §7 (l.248-249) y MATRIZ §3 T-900 (l.66), §5 (l.117-118) con DISENO v2 (red operativa). Cambiar TC-ACC-001/002 y RNF-22 a "ejecutable en Besu staging"; redefinir la precondición del gate como "wallet financiada en 81234 + flujo MetaMask validado (TC-ACC-002)".
2. **Materializar en PLAN §4 los TCs huérfanos por arriba:** TC-NF-040, TC-NF-050, TC-NF-030, TC-NF-020, TC-WK-030, TC-ACC-010/011/012, cada uno con escenario/EARS de origen, oráculo medible, nivel y estado. Fijar X/Y/Z numéricos de RNF-22 (corrigiendo "~33 s idle" de DISENO §13).
3. **Cerrar gaps de reverts canónicos del contrato (Hito 1/2):** TC-CT-035/047 (NotListed), TC-CT-067 (NotExpired), TC-CT-075 (mint en pausa), TC-CT-076 (roles en pausa), TC-CT-036 (re-list), TC-CT-094/095/096 (setTreasury). Reflejar en §6 y en filas RF-06/RF-07/RF-17 de la MATRIZ.
4. **Reforzar oráculos no falsables (P0 de calidad):** reescribir TC-CT-024/044/083 (efecto + conteo de eventos), TC-CT-023 (exactamente una), y **añadir TC-CT-048 (reentrancy de claim())**; agregar TC-CT-048 a la fila RNF-14 de §5.
5. **Añadir los invariants stateful prometidos en DISENO §11:** contabilidad pull (ADR-15), unicidad global de tokenId (RF-19), monotonía de soldOnce (ADR-16) y causalidad de ownerOf (RNF-10/ADR-07). Reclasificar TC-CT-023 a unit.
6. **Resolver la contradicción InvalidDate on-chain vs off-chain (ADR-08 vs CASOS §3)** y reubicar TC-CT-015 al nivel correcto; añadir test off-chain del margen UTC y TC-CT-017 (coherencia civil/UTC, DST).
7. **Cubrir flujos de UI/asistente pendientes:** TC-E2E-014/041/042/051 (empty/degradado), TC-E2E-021 (saldo), TC-E2E-022 (rechazo de firma), TC-E2E-063 (estados de tx), TC-MCP-007/008, desdoblar TC-MCP-005, reforzar TC-MCP-003.
8. **Corregir trazabilidad en MATRIZ §4:** RF-02 \| CU-04, CU-08; RF-04 \| CU-17, CU-05, CU-07; reasignar RF-09 a Hito 1; añadir TC-CT-092/093 a RF-06; desglosar RNF-11; alinear encabezado de CU-08 en PLAN §4.
9. **Operacionalizar CI (P1):** tabla "nivel→mecanismo de tiempo" en §3; pin de Foundry + Anvil --chain-id 81234 --hardfork cancun en §7; herramienta/fail-under de cobertura (forge coverage branch=100 set crítico, vitest lines=90); contrato del harness de replay LLM; matriz de timeouts E2E por entorno; doble SMTP y mecanismo de corte/recuperación RPC para TC-WK-004; unificar shape de /health; reconciliar mock IPFS vs CDN (ADR-12).
10. **Corregir las afirmaciones de §6 del PLAN y §5 de la MATRIZ** ("0 huérfanos / todos verificados") al estado real una vez aplicados los cambios; entretanto, listar los gaps conocidos en lugar de declarar cobertura total.

Archivos afectados: `/Users/andresleon/Codecrypto/programacion/hotel-room/docs/PLAN-DE-PRUEBAS.md` y `/Users/andresleon/Codecrypto/programacion/hotel-room/docs/MATRIZ-TRAZABILIDAD.md` (con desviaciones de origen a corregir también en `/Users/andresleon/Codecrypto/programacion/hotel-room/docs/CASOS-DE-USO.md` §3/§9 y `/Users/andresleon/Codecrypto/programacion/hotel-room/docs/DISENO-TECNICO.md` §13).