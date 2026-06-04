# Informe de revisión — DISENO-TECNICO.md

> **Auditoría multi-agente** · 15 agentes: 7 revisores especializados + 7 críticos adversariales + 1 sintetizador.
> **Hallazgos confirmados:** 57 tras verificación adversarial — 9 altas · 33 medias · 15 bajas (consolidado en síntesis).
> **Documento auditado:** `docs/DISENO-TECNICO.md` · **Referencias:** `docs/REQUISITOS.md`, `docs/CASOS-DE-USO.md` · **Fecha:** 2026-06-04

## 1. Veredicto general

El diseño **requiere correcciones antes de implementar**: es coherente en lo macro (stack, monorepo modular con `packages/shared` como fuente única, ADRs bien estructurados), pero acumula **9 hallazgos de severidad alta** que afectan a la implementabilidad del contrato y a la viabilidad real del stack sobre Besu. Existen huecos bloqueantes para el contrato (mecanismo del guard de `_update` en ADR-07, fuente de verdad de "noche no vendida", determinación de "hoy" en `Europe/Madrid` para `PastDate`/`NightExpired`) y un bloque de incertidumbre técnica de Besu (tipo de tx/fee mode, finalidad IBFT/QBFT vs `CONFIRMATIONS_N`, límites de `getLogs`) que está concentrado al cierre bajo precio cerrado (RNF-09). **No se debe arrancar el Hito 1 sin antes (a) ejecutar un spike de Besu como gate Go/No-Go y (b) cerrar el diseño del contrato** (guard de royalty, inventario, calendario). El resto del MVP (worker, frontend, MCP) es construible una vez resueltos esos puntos, aunque arrastra deuda de completitud media que conviene cerrar en paralelo durante el Hito 1.

## 2. Resumen por severidad

| Severidad | Conteo |
|-----------|--------|
| Alta | 9 |
| Media | 33 |
| Baja | 15 |
| **Total** | **57** |

## 3. Hallazgos críticos (severidad alta)

1. **ADR-07 no especifica cómo `_update` distingue venta interna de `transferFrom` directo**
   - Ubicación: ADR-07; §4; CASOS §4 / 07d (`DirectTransferDisabled`).
   - Problema: en OZ v5 todo movimiento (incluido `buy`/`buyResale`) pasa por el mismo `_update`; sin un guard explícito el override no puede distinguir el origen. La "marca de venta" de §4 es para `burnExpired`, NO para este guard. Riesgo de romper `buy`/`buyResale` o de un flag que quede "pegado" en `true` tras un revert parcial y habilite transfers directos evadiendo royalty (clave de RNF-10).
   - Recomendación: marca puesta a `true` solo dentro de `buy`/`buyResale` justo antes del movimiento, leída por `_update`, preferentemente con **transient storage (EIP-1153, 0.8.24)** para autolimpieza. Permitir mint (`from==0`)/burn (`to==0`) por comprobación de `address(0)`, no por el flag. Añadir invariant test: tras cualquier tx (incluida una revertida a mitad), un `transferFrom` directo posterior debe revertir con `DirectTransferDisabled`.

2. **`buyResale` paga al vendedor por push: vendedor-contrato que revierte al recibir ETH bloquea su NFT (DoS)**
   - Ubicación: §4 ("pagar receptor y vendedor"); CASOS CU-07 paso 2.
   - Problema: `nonReentrant` (07e) no cubre un receptor que revierte ni griefing de gas; un vendedor-contrato sin `receive`/`fallback` pagable congela la reventa de su token. El diseño no define la política ante fallo de pago.
   - Recomendación: adoptar patrón **pull** (acreditar saldos con `claim`/`withdrawPending`) para vendedor y receptor, o como mínimo definir el manejo del retorno del `call`. Tests con vendedor-contrato que (a) rechaza ETH y (b) consume todo el gas.

3. **`PastDate`/expiración en `Europe/Madrid` no verificables on-chain (block.timestamp es UTC)** + **determinación de "hoy" sin resolver**
   - Ubicación: ADR-08; §4 (mint); CASOS CU-02 02d, CU-05e, CU-13.
   - Problema: la fecha civil se calcula off-chain (cubierto), pero `PastDate`/`NightExpired` se listan como reverts on-chain sin definir cómo el contrato determina "hoy" en Madrid con DST; CU-05e exige revert para firma 23:59:59 minada tras medianoche. Además la validación de calendario (días/mes, bisiesto → `InvalidDate`) on-chain no está diseñada.
   - Recomendación: documentar que la comprobación respecto a Madrid es validación off-chain/UX y definir la regla on-chain como umbral derivado de `block.timestamp` (UTC, offset/margen documentado) aplicado de forma coherente a mint/compra/reventa/burn. Dividir responsabilidades contrato vs off-chain para el calendario. Fuzzing sobre bordes de día y DST; conciliar CU-05e.

4. **Fuente de verdad on-chain para distinguir noche no vendida de `EN_PODER_CLIENTE` no especificada**
   - Ubicación: §4 ("marca de venta", `burnExpired`); CASOS §3 (`AlreadySold`), CU-13d.
   - Problema: no se define la estructura que materializa la marca (`mapping soldOnce`, enum, dirección de inventario, `ownerOf`==hotel) ni a quién se mintea inicialmente; sin ella no es implementable la guarda "solo no vendidas" de `burnExpired` ni `AlreadySold`.
   - Recomendación: especificar `mapping(uint256=>bool) soldOnce` marcado en `buy()` con `burnExpired` exigiendo `!soldOnce[tokenId]`, **o** dirección `HOTEL_INVENTORY` con `ownerOf==HOTEL_INVENTORY`. Documentar destino del mint (`from==0`) y su compatibilidad con `_update`. Invariante + test para `AlreadySold`.

5. **Orquestación del asistente (LLM↔MCP↔construcción/firma) y validación en cliente de la tx sin diseñar**
   - Ubicación: ADR-11, §5, §7 (`/chat`); CASOS CU-08 paso 4 / 08e; RNF-19.
   - Problema: no se especifica dónde corre el LLM (API route server-side vs cliente), el transport MCP (stdio/HTTP/SSE), cómo fluye `buildPurchaseTx` a wagmi/viem, ni cómo se valida en cliente que `{to,data,value,chainId}` corresponde a la compra confirmada. Hito 4 (RF-12) sin diseño ejecutable; riesgo de firmar tx no verificada.
   - Recomendación: LLM en API route server-side; definir transport MCP; handoff con verificación (recomputar `to`=contrato, `value`=precio del getter, `chainId` esperado) antes de wagmi; confirmación UI explícita (RNF-19, tx decodificada); manejo de 08e (`assistant-unavailable`).

6. **Tipo de tx (EIP-1559 vs legacy) y `gasPrice=0` en Besu free-gas no especificados**
   - Ubicación: ADR-01/04, §11; RNF-03; CASOS §9.
   - Problema: viem construye EIP-1559 por defecto; una Besu PoA/IBFT free-gas puede no exponer `baseFeePerGas`/`feeHistory` o requerir tx legacy con `gasPrice=0`, y MetaMask puede fallar al estimar/firmar. Si MetaMask no firma, **ninguna compra funciona en Besu**.
   - Recomendación: definir en `packages/shared` el chain config viem para Besu (`feeValuesType` explícito, fees forzados a 0 o legacy `gasPrice=0`); añadir `TX_TYPE`/`feeMode` a §11; validar contra Besu real (no solo Anvil) que MetaMask añade la red, estima, firma y envía. Adelantar como spike.

7. **Worker validado solo contra Anvil: divergencias de Besu en WS/finalidad/`getLogs` sin verificar**
   - Ubicación: ADR-10, §6, §8, §9, §11; CASOS CU-10.
   - Problema: toda la suite del worker corre contra Anvil; Besu IBFT/QBFT difiere en finalidad, estabilidad de `eth_subscribe` sobre WS y límites de `getLogs`. El fallback a polling de viem puede perder/duplicar logs. RNF-22 Z queda "(validar)" al cierre.
   - Recomendación: entorno de staging con Besu real; ejecutar la suite del worker allí antes del cierre; validar `eth_subscribe`/WS, reconexión con re-sync desde checkpoint, `getLogs` acotado; recalibrar `CONFIRMATIONS_N` para finalidad IBFT.

8. **`CONFIRMATIONS_N=2` asume reorgs probabilísticos sin verificar el consenso de Besu (IBFT/QBFT)**
   - Ubicación: ADR-10, §11; CASOS CU-10 10c y escenario "Reorg antes de confirmar".
   - Problema: Besu privada usa IBFT 2.0/QBFT (finalidad inmediata): un bloque firmado por supermayoría no se reorganiza. Esperar 2 confirmaciones añade latencia a RF-09 sin aportar seguridad, y el test de reorg sería irreproducible (criterio no verificable).
   - Recomendación: confirmar el consenso; si la finalidad es inmediata, documentar `CONFIRMATIONS_N`=1 (o 0 esperando finality) y reformular 10c/"Reorg" como "no aplica" o sustituirlo por un test de reconexión/catch-up. Si hay forks transitorios (cambios de validadores), justificar el valor 2 con profundidad observada.

9. **Histórico (CU-09) y dashboard (CU-11) acumulativos NO caben en la ventana de 90 días: límites de `eth_getLogs` sin plan** + **riesgo Besu (X/Y/Z, fee, `getLogs`) concentrado al cierre**
   - Ubicación: ADR-09, §11 (`CATALOG_WINDOW_DAYS`=90), §12, §13.1; CASOS CU-09/CU-11; RNF-11, RNF-22, Decisión 23.
   - Problema: Decisión 23 acota el catálogo, pero histórico/dashboard son acumulados desde deploy (~18.250 mints a 50×365 + sus `Sale`/secundarias) que NO se acotan a 90 días; la lectura directa por RPC exige paginación que viem/Besu limitan. El punto de quiebre de RNF-11 está atado al catálogo, no a CU-09/CU-11. Todas las incógnitas de mayor impacto (tiempo de bloque, latencia P95, suscripciones, finalidad, fee, `getLogs`) están "(validar)" en el cierre.
   - Recomendación: separar viabilidad de catálogo (acotado, OK) de histórico/dashboard (no acotables): definir punto de quiebre cuantitativo para CU-09/CU-11 y plan de paginación por rango resiliente; **cachear agregados en el worker** (ya ve todos los `Sale`/`RoyaltyPaid`) y servirlos por endpoint; reevaluar adelanto del indexador. Ejecutar un **spike de Besu bloqueante al inicio** como gate Go/No-Go (paraguas de los hallazgos 6, 7, 8 y del fee/contrato).

## 4. Hallazgos por dimensión

### Consistencia

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Media | §4 (`buyResale`), ADR-07; CU-07/CU-12 | Doble fuente de verdad del royalty: `royaltyBps()` propio vs estado ERC-2981; `royaltyInfo()` puede divergir del cobro real | Fuente única: `buyResale` calcula desde `royaltyInfo()` o `setRoyaltyBps` llama a `_setDefaultRoyalty`; test `royaltyInfo(tokenId,price).amount == royalty transferido` |
| Media | §4 (`list/unlist/buyResale`); CASOS §4, CU-06/07 | Falta `struct Listing{seller,price,active}`, dónde reside el precio de reventa y reglas de invalidación/orden de guardas en `buyResale` | Especificar struct por token, invalidación (en `buyResale`, cambio de dueño, expiración), orden de guardas (expiración → listado → importe) y getters |
| Baja | §4 (withdraw); CASOS §2, CU-15 | Evento de retirada (`Withdrawn`) usado por CU-15 pero ausente de la tabla de eventos canónicos §2 | Añadir `Withdrawn(treasury, amount)` a CASOS §2 y referenciar en §4 (mismo punto que el hallazgo de §4/§12) |
| Baja | ADR-13, §8, §11; CU-PR-01 | Faucet: clasificación on-chain vs off-chain y ubicación de símbolos/umbral no definidas (`FaucetDispensed`, `FaucetCooldownActive` sugieren contrato) | Aclarar si es contrato Foundry o utilidad off-chain; ubicar símbolos fuera del shared de prod; fijar `FAUCET_LOW_THRESHOLD` |

### Seguridad del contrato

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | ADR-07; §4; CASOS §4/07d | Guard de `_update` sin mecanismo (ver §3.1) | Marca transient (EIP-1153) puesta en `buy`/`buyResale`; invariant test |
| Alta | §4; CU-07 | DoS por vendedor-contrato que revierte al recibir ETH (ver §3.2) | Patrón pull para vendedor/receptor |
| Media | ADR-06, §4 (`withdraw`); CU-15/16; RNF-13 | `withdraw` bajo `DEFAULT_ADMIN` concentra roles y fondos; sin procedimiento de bootstrap/revocación del admin de deploy | Rol `TREASURER` dedicado o `withdraw` solo a TREASURY validada; documentar bootstrap deploy→Safe→revocación EOA; timelock para cambios sensibles |
| Baja | CU-14 vs CU-13; §4 (`burnExpired`) | `burnExpired` permitido durante pausa pese a ser destructivo e irreversible: aumenta blast radius | Bloquear `burnExpired` durante pausa (no es remediación); si se mantiene, doble verificación no-vendida+expirada por token |

### Viabilidad del stack

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | ADR-01/04, §11; RNF-03 | Tipo de tx/fee mode Besu free-gas (ver §3.6) | Chain config viem + `TX_TYPE`/`feeMode`; validar con MetaMask real |
| Alta | ADR-10, §6/8/9; CU-10 | Worker solo validado en Anvil (ver §3.7) | Staging Besu real antes del cierre |
| Alta | ADR-09, §11; CU-09/11; RNF-11 | Histórico/dashboard no acotables + límites `getLogs` (ver §3.9) | Punto de quiebre cuantitativo + agregados cacheados en worker |
| Alta | §11, §13.1; RNF-22/09 | Riesgo Besu concentrado al cierre (ver §3.9) | Spike Besu bloqueante como gate Go/No-Go |
| Media | ADR-03, §7, §1 | Frontera RSC/cliente para SSR/SSG con datos on-chain y wallet sin definir; riesgo para LCP (RNF-11) | Prerenderizar shell/skeletons; catálogo inicial en RSC/Route Handler con `publicClient` viem hidratando TanStack Query; `/mis-noches` y dashboard como CSR fuera del LCP de catálogo; revalidación/TTL |
| Media | §11, §7; CU-17 | `BESU_CHAIN_ID`, `BESU_RPC_URL`, `CURRENCY_SYMBOL` no fijados como constantes compartidas | Añadir a §11/shared `BESU_CHAIN_ID` (alineado con genesis, sin colisión), `BESU_RPC_URL` (server-side), `NETWORK_NAME`, `CURRENCY_SYMBOL` |
| Media | ADR-02, §1/8/9; RNF-22 | `evmVersion`/PUSH0 no alineado con genesis Besu; contrato no validado en Besu hasta el cierre | Fijar `evmVersion` en `foundry.toml` según hardfork del genesis (PUSH0/Shanghai o bajar a paris); humo de deploy a Besu staging tras cada cambio |
| Media | §1, ADR-09 | TanStack Query presentado como mitigación de carga RPC es solo caché por cliente | Caché server-side compartida (Route Handler/Next Data Cache o agregados en worker); dimensionar capacidad RPC del nodo Besu |
| Media | ADR-12, §7, §13.2; CU-04 | Resolución `tokenURI`/IPFS por gateway en runtime: latencia y elección gateway sin resolver, riesgo LCP | Servir las 3 imágenes desde host Next.js (next/image+CDN), IPFS como almacenamiento canónico; fijar gateway con timeout, precachear los 3 CID; decidir Pinata vs Kubo antes del Hito 1 |
| Media | ADR-11, §5; RF-12/RNF-09/19 | Orquestación LLM↔MCP↔firma: ubicación, latencia, coste y verificación de `buildPurchaseTx` no definidos | Orquestación en backend; presupuesto/timeout con fallback; techo de coste/rate-limit Anthropic; UI con tx decodificada |
| Media | §5, §11; CU-08 | Tasa OOD 0,95 (N=50) como criterio da falsa seguridad; falta validación server-side de `buildPurchaseTx` | Degradar OOD a indicador; validación server-side independiente del LLM (tokenId existe, DISPONIBLE/LISTADA, `value==precio on-chain`) |
| Media | §1, ADR-10, §6/8/13 | Worker SQLite: invariante single-instance y persistencia de fichero/checkpoint no declarados | Declarar singleton (sin autoscaling); volumen persistente con WAL+backup; test de reinicio sin pérdida de volumen |
| Media | §1, §9, mcp-wallet-e2e; RNF-16/22 | E2E con MCP wallet no cubre MetaMask real sobre Besu free-gas | Mantener MCP wallet para lógica + prueba de aceptación con MetaMask real contra Besu staging (add-network, firma primaria/secundaria, guard wrong-network) |
| Media | §8, §13.3; RNF-21 | Restricciones de red/runtime del hosting condicionan decisiones ya tomadas (WS persistente, RPC privado, API Anthropic) | Fijar restricciones como requisitos: worker en runtime persistente con WS+volumen (no serverless); host del RPC en red con acceso al nodo; BFF si Next.js va serverless |

### Completitud

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | §4, ADR-07; CASOS §3, CU-13d | Fuente de verdad noche no vendida vs `EN_PODER_CLIENTE` (ver §3.4) | `soldOnce` o `HOTEL_INVENTORY` + destino de mint |
| Alta | ADR-08, §4; CU-02/05e/13 | Determinación de "hoy" y validación de calendario on-chain (ver §3.3) | Dividir responsabilidades contrato/off-chain; regla on-chain por umbral UTC documentado |
| Alta | ADR-11, §5, §7; CU-08/RNF-19 | Orquestación del asistente y verificación de tx en cliente (ver §3.5) | Secuencia server-side + handoff verificado |
| Media | ADR-12, §1; CU-02 | Pipeline de metadata por token (esquema JSON, generación/subida IPFS, `tokenURI` dinámico vs CID por token) sin definir | Sección de pipeline: esquema ERC-721 (room/fecha/roomType), actor (back-office), orden (fijar CID antes del mint), URI dinámico vs CID on-chain; vínculo tipo→imagen (RF-18a) |
| Media | §5, §7; CU-04/07 | Descubrimiento/enumeración de listados `LISTADA_SECUNDARIO` activos sin diseñar | View on-chain `getActiveListings`/`isListed`+precio o reconstrucción desde eventos con conciliación; etiquetar `saleType`/`seller` en catálogo |
| Media | §6, §10, §8; RNF-13 | Gestión de secretos sin almacén concreto; `ANTHROPIC_API_KEY` ausente del inventario | Matriz de secretos (SMTP, ANTHROPIC, deploy, roles, faucet) con almacén, inyección por entorno, responsable y rotación |
| Media | §2, §8; Decisión 22 | Proceso de generación/versionado de ABI y registro de direcciones a `packages/shared` sin definir | Script `forge build`+codegen en CI; `deployments/<chainId>.json` con address+`deploymentBlock`; procedimiento de redeploy e invalidación de caches |
| Media | ADR-09, §6/7; CU-09/11 | Paginación de `getLogs` por rangos y `deploymentBlock` para histórico/dashboard no diseñada | Chunks de bloques configurables (`fromBlock=deploymentBlock`) con backoff; almacenar `deploymentBlock`; fijar lote de catch-up |
| Media | §4; CU-07 | Configuración del receptor ERC-2981 y mutabilidad de TREASURY (ausencia de `setTreasury`) | Fijar receptor (constructor vs setter) y si coincide con TREASURY; setter con rol+evento o justificar inmutabilidad |
| Media | §4 (buy/withdraw); CU-05/15 | TREASURY: falta setter, validación `!= address(0)` y política ante TREASURY-contrato que rechace ETH | Setter con rol/evento/validación; documentar asunción Safe acepta ETH; test cambio de TREASURY y `address(0)` rechazado |
| Media | §4 (valida maestro); CU-02; RF-18a | Maestro habitación→tipo (101-130/201-220 → simple/doble/suite) ausente en los 3 documentos | Rangos + regla de derivación documentada o setter con rol admin; tabla de asignación y vínculo tipo→CID |
| Media | §7; CU-01 | Mecanismo de sesión y almacén de nonce SIWE del back-office no especificado (comportamiento sí, mecanismo no) | Endpoint de nonce (almacén single-use+TTL), verify (EIP-4361+`hasRole`), tipo/caducidad de token (cookie httpOnly/JWT), middleware `/admin/*`→roles |
| Baja | §11; CU-PR-01; RNF-17 | Falta `FAUCET_LOW_THRESHOLD` en la tabla de constantes (alerta de saldo bajo) | Añadir a §11 (artefacto dev/test) ligado a health-check RNF-17 |
| Baja | §6/§10 vs CASOS §9 RNF-17 | Health-check concreto solo para worker; falta contrato para MCP y faucet | Especificar `GET /health` (200/503+`COMPONENT_DOWN`) para MCP y faucet, o tabla consolidada en §10 |
| Baja | §4; CU-07/12 | `royaltyBps==0` y `seller==buyer` en `buyResale` sin documentar | Documentar/testear: bps==0 (sin `RoyaltyPaid`/call innecesario) y `seller==buyer` (permitir o revertir, decidir) |
| Baja | §4 (buy/withdraw); CU-15; RNF-15 | Modelo de fondos ambiguo: con push primario `withdraw` revierte `NoFunds` en operación normal; "política para ETH residual" sin definir | Definir si `withdraw` solo barre residuos forzados o si el contrato custodia ingresos; alinear CU-15 y `NoFunds()`; test de inyección forzada |
| Baja | ADR-07; CU-05/07 | No se especifica si la entrega interna usa variante safe (`onERC721Received`); puede revertir compras de compradores-contrato | Decidir `_safeTransfer` vs `_transfer`; test de comprador-contrato con/sin `onERC721Received`; documentar en runbook |
| Baja | §5/ADR-11 vs CU-08 08a | Flujo 08a (alternativas del mismo tipo) no soportado por las 4 herramientas MCP | Filtro `{type}` en `listAvailableNights` o herramienta `suggestAlternatives`, o documentar que el LLM filtra la salida por type; alinear el conteo cerrado |

### Umbrales / Decisiones

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | §11 (Z); RNF-22 | RNF-22 Z (24 h, 100% Sale) sin perfil de carga ni reconexión forzada: trivialmente superable | Definir nº/frecuencia mínima de `Sale` e inyectar K cortes RPC/WS; criterio "K emitidos, K entregados, 0 duplicados pese a N reconexiones" |
| Media | §11; CU-PR-01, §1 CASOS | `FAUCET_AMOUNT`="3× precio máximo" no computable: no existe `MAX_PRICE` (mint solo valida `precio>0`) | Fijar literal en ETH de pruebas o definir `MAX_PRICE_NIGHT` en shared; documentar antes del Hito 1 |
| Media | §11/§5; CU-08 | `LLM_OOD_REJECT_RATE>=0,95` (N=50) sin regla de aceptación exacta ni control de no-determinismo | Regla determinista (p.ej. >=48/50), dataset congelado balanceado, `temperature=0` o promedio K ejecuciones; separar prompt-injection (08c, bloqueante) del estadístico |
| Baja | §11 (X/Y, `RPC_TIMEOUT_MS`); RNF-22 | RNF-22 X sin estadístico; X/Y no relacionados con `RPC_TIMEOUT_MS=5000` | Especificar estadístico de X (mediana+P95 del intervalo sobre >=100); documentar relación de Y con `RPC_TIMEOUT_MS` y cola P99 |

### Coherencia interna

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Alta | ADR-11/§5 vs CU-08 08a | "Herramienta de alternativas" inexistente en el set cerrado de 4 (contradice la afirmación "solo dispone de estas 4") | Ampliar `listAvailableNights` con `{type}` o añadir `findAlternatives`, actualizando el conteo y los tests de guardrails; o reescribir/eliminar 08a |
| Baja | §2 (líns. 42, 52) vs §11/§12 | Referencias a "§12" para constantes apuntan a "Trazabilidad"; las constantes están en §11 | Corregir a "§11"; para errores/eventos apuntar a CASOS §2/§3; verificar qué centraliza `packages/shared` |
| Baja | §4 (withdraw) vs CASOS §2 | Evento `Withdrawn` usado por CU-15 ausente de eventos canónicos §2 (misma raíz que la fila de Consistencia) | Añadir `Withdrawn(address treasury, uint256 amount)` a CASOS §2 y referenciar en §4 |
| Baja | §2/§10, ADR-13 vs CASOS §9 RNF-17 | Faucet sin ubicación en el monorepo ni cobertura de `/health` | Asignar a `packages/contracts` (script/contrato Anvil/CI); explicitar quién expone `/health` o declarar que no se implementa |
| Baja | §12 (líns. 259-273) | Tabla "Trazabilidad" parcial (omite RF-01/02/03/07/08/09/10/14/15/17/19 y varios RNF) sin criterio de inclusión | Declarar criterio ("solo decisiones nuevas de esta fase") o completar fila por RF/RNF MVP |

### Operabilidad / CI-CD

| Severidad | Ubicación | Problema | Recomendación |
|-----------|-----------|----------|---------------|
| Media | §8/§9 | Ciclo de vida de Anvil en CI sin definir (arranque, readiness, deploy, inyección de dirección, teardown) | Documentar el job: anvil con chainId/puerto fijo, readiness por RPC, `forge script`, exportar `CONTRACT_ADDRESS`/`RPC_URL`, block-time determinista, teardown |
| Media | §5/§11; CU-08 | No-determinismo y gating del oráculo estadístico del LLM sin definir (coste API, flakiness, gate de merge) | Pinear versión del modelo; suite estadística en job nightly/manual con presupuesto; gate de PR solo deterministas (08b/08c); registrar tasa como artefacto |
| Media | §8/§9; CU-04/08 | Mockeo de IPFS y del LLM sin estrategia concreta | IPFS = gateway local/HTTP con 404 controlado para img-fallback (CU-04 04c); LLM = harness replay o nightly real con presupuesto |
| Media | ADR-08/10, §8; Decisión 22 | Redeploy + re-mint no coordina reconexión del worker ni propagación de dirección a los 3 servicios | Runbook de redeploy: bump ABI+dirección en shared, despliegue coordinado, reset/rebind del checkpoint a nueva dirección+bloque, re-apuntar histórico/dashboard |
| Media | §6/§10; RNF-17 | Observabilidad parcial: RNF-17 exige alerta y solo hay `/health`+logs, sin consumidor ni canal | Monitor que sondee `/health` con periodicidad y N concretos; canal de alerta mínimo (email); destino/retención de logs; métrica de lag (`headBlock - lastBlock`) |
| Media | REQUISITOS §11-C/§2.2; §13.3 | Roles operativos definidos pero no asignados a organización/persona (RACI) | Matriz RACI por rol operativo; cerrar hosting (§13.3) antes del Hito 1; nombrar responsable por componente |
| Media | §1/§9; CU-05 05d/05e, CU-10 10c | Escenarios E2E sensibles a tiempo de bloque sin estrategia de control determinista en Anvil | Documentar cheatcodes RPC de Anvil (timestamp, minado manual, reorg); prefinanciación de wallets; aclarar qué se cubre en E2E vs `forge test` |
| Baja | §6/§10; RNF-13 | Inventario de secretos/config por entorno a nivel de aplicación incompleto (`ANTHROPIC_API_KEY`, `PINATA_JWT`, config por servicio) | Inventario por servicio/entorno con origen y validación fail-fast al arranque (claves de firma ya cubiertas por RNF-13) |

## 5. Riesgos técnicos principales

1. **"Verde en Anvil, rojo en Besu".** Contrato, worker y E2E se validan sobre Anvil mientras el medio real es Besu IBFT/QBFT free-gas. Diferencias en tipo de tx/fee (MetaMask no firma), `evmVersion`/PUSH0 (bytecode no despliega si el genesis es pre-Shanghai), `eth_subscribe`/WS, finalidad y `getLogs`. **Mitigación:** spike de Besu bloqueante al inicio + humo de deploy a staging tras cada cambio de contrato + suite del worker en staging; gate Go/No-Go con X/Y/Z/`CONFIRMATIONS_N`/`feeMode` fijados con datos reales.
2. **Evasión del royalty (RNF-10).** El guard de `_update` (ADR-07) no tiene mecanismo; un flag mal reseteado ante revert parcial habilita transfers directos. **Mitigación:** transient storage (EIP-1153) + invariant test post-tx revertida.
3. **DoS del mercado secundario.** Push de pago al vendedor-contrato congela NFTs. **Mitigación:** patrón pull.
4. **Inconsistencia de fecha/medianoche/DST** en mint/compra/reventa/burn por convertir Madrid↔UTC on-chain. **Mitigación:** regla on-chain por umbral UTC documentado + off-chain/UX explícito; fuzzing de bordes.
5. **Escala de histórico/dashboard** acumulativos no acotables a 90 días sobre RPC directo. **Mitigación:** agregados cacheados en el worker + paginación resiliente; reevaluar indexador en MVP.
6. **Hito 4 (asistente IA) sin diseño ejecutable** y riesgo de firmar tx no verificada. **Mitigación:** orquestación server-side + verificación de `buildPurchaseTx` en cliente y validación server-side independiente del LLM.
7. **Worker como SPOF de avisos** (SQLite single-instance, fichero efímero). **Mitigación:** singleton declarado + volumen persistente + alerta sobre `/health`.
8. **Coste/no-determinismo del LLM en CI** (gate flaky). **Mitigación:** nightly con presupuesto, modelo pineado, gate de PR solo deterministas.

## 6. Decisiones/umbrales a cerrar antes de codificar

- **Algoritmo de consenso de la Besu de Codecrypto** → fija `CONFIRMATIONS_N` (1/0 vs 2) y la (ir)reproducibilidad de CU-10 10c.
- **`TX_TYPE`/`feeMode`** (EIP-1559 vs legacy `gasPrice=0`) y chain config viem para Besu.
- **`BESU_CHAIN_ID`, `BESU_RPC_URL`, `NETWORK_NAME`, `CURRENCY_SYMBOL`** (alineados con el genesis, sin colisión con cadenas públicas).
- **`evmVersion`** en `foundry.toml` (soporte PUSH0 según hardfork del genesis).
- **`FAUCET_AMOUNT`** (literal en ETH de pruebas o `MAX_PRICE_NIGHT`) y **`FAUCET_LOW_THRESHOLD`**.
- **RNF-22 X/Y/Z**: estadístico de X, relación Y↔`RPC_TIMEOUT_MS`, perfil de carga + reconexiones forzadas de Z.
- **`LLM_OOD_REJECT_RATE`**: regla de aceptación exacta, dataset congelado, control de no-determinismo; degradar a indicador.
- **Maestro habitación→tipo** (rangos 101-130/201-220 → simple/doble/suite) y vínculo tipo→CID.
- **Pinata vs Kubo** (ADR-12) y estrategia de servir las 3 imágenes (host/CDN vs gateway).
- **Mecanismo del guard `_update`, fuente de verdad de inventario, política de pago en reventa, regla de calendario/medianoche on-chain** (los 4 puntos del contrato que bloquean el Hito 1).
- **Hosting** de web/worker/mcp (§13.3) con sus restricciones de red/runtime (WS persistente, RPC privado, alcance a API Anthropic).

## 7. Plan de acción priorizado

**Bloqueantes (antes/durante el inicio del Hito 1):**

1. **Spike de Besu Go/No-Go** sobre el nodo real: tipo de tx + firma con MetaMask, `gasPrice=0` efectivo, `eth_subscribe`/WS sobre N horas, límites de `getLogs`, tiempo de bloque/latencia, consenso/finalidad. Cerrar §11 X/Y/Z, `CONFIRMATIONS_N`, `feeMode` con datos reales. (Hallazgos §3.6/3.7/3.8/3.9.)
2. **§4 + ADR-07:** especificar el mecanismo del guard de `_update` (marca transient EIP-1153 en `buy`/`buyResale`; mint/burn por `address(0)`).
3. **§4:** definir la fuente de verdad de inventario (`soldOnce` o `HOTEL_INVENTORY`) y el destino del mint; vincular con `burnExpired`/`AlreadySold`.
4. **§4:** cambiar pago de `buyResale` a patrón pull (o documentar manejo del fallo) y añadir tests de vendedor-contrato.
5. **ADR-08/§4:** definir la regla on-chain de "hoy"/expiración (umbral UTC documentado) y la división de validación de calendario contrato vs off-chain; conciliar CU-05e.
6. **ADR-11/§5 + §7:** diseñar la orquestación del asistente (LLM server-side, transport MCP, handoff verificado de `buildPurchaseTx`, validación server-side de argumentos, confirmación UI RNF-19). Reconciliar 08a con el set de herramientas.

**Importantes (durante Hito 1):**

7. **§11/shared:** añadir `BESU_CHAIN_ID`, `BESU_RPC_URL`, `NETWORK_NAME`, `CURRENCY_SYMBOL`, `TX_TYPE`/`feeMode`, `FAUCET_AMOUNT` (literal), `FAUCET_LOW_THRESHOLD`; `foundry.toml` con `evmVersion` alineado.
8. **§4 + CASOS §2:** añadir evento `Withdrawn`; definir `setTreasury`/receptor ERC-2981, validación `!=address(0)`, modelo de fondos (rol de `withdraw`), `royaltyBps==0`/`seller==buyer`, `struct Listing` y reglas de invalidación/orden de guardas; unificar fuente de verdad del royalty.
9. **Nueva sección de pipeline de metadata** (esquema ERC-721, actor, orden CID-antes-de-mint, URI dinámico vs CID on-chain) y **maestro habitación→tipo** (en los 3 documentos).
10. **Frontend:** documentar frontera RSC/cliente, caché server-side compartida, y servir las 3 imágenes desde host/CDN con IPFS canónico; decidir Pinata vs Kubo.
11. **Worker:** declarar singleton + volumen persistente; paginación de `getLogs` por chunks con `deploymentBlock`; agregados cacheados para CU-09/CU-11.
12. **CI/CD:** definir el job de Anvil (readiness/deploy/inyección/teardown), control determinista de tiempo de bloque (cheatcodes) para 05d/05e/10c, mockeo de IPFS/LLM, gating del estadístico del LLM en nightly.

**Operabilidad / cierre (antes del Hito 3 / entrega):**

13. **§6/§10:** completar cadena de observabilidad (monitor de `/health`, canal de alerta, métrica de lag, contrato `/health` para MCP y faucet), valor concreto de N.
14. **Matriz de secretos/config por servicio** (`ANTHROPIC_API_KEY`, `PINATA_JWT`, RPC/chainId/contract, deploy) con almacén, inyección y rotación.
15. **Proceso ABI/direcciones** (`forge build`+codegen en CI, `deployments/<chainId>.json`, runbook de redeploy con rebind del checkpoint del worker).
16. **Roles operativos (RACI)** y cierre de hosting (§13.3) con sus restricciones de red/runtime; documentar bootstrap/revocación de `DEFAULT_ADMIN` y valorar rol `TREASURER`/timelock.
17. **Correcciones de coherencia:** referencias "§12"→"§11"; criterio de inclusión de la tabla de Trazabilidad §12; ubicación del faucet en el monorepo; reevaluar `burnExpired` durante pausa.