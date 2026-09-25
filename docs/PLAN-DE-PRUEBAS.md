# Plan de pruebas — Hotel Marina del Sol

> Deriva de [`CASOS-DE-USO.md`](./CASOS-DE-USO.md) (v2), [`REQUISITOS.md`](./REQUISITOS.md)
> (v2) y [`DISENO-TECNICO.md`](./DISENO-TECNICO.md) (v2). Cumple RNF-16.
> **Versión 2** — incorpora las correcciones de la auditoría
> ([`REVISION-PLAN-PRUEBAS.md`](./REVISION-PLAN-PRUEBAS.md)): TC faltantes materializados,
> oráculos reforzados (no-duplicación, decodificación de tx, cuantificación), estado Besu
> **operativo**, umbrales RNF-22 fijados, invariants y nivel de integración añadidos.
> **Fecha:** 2026-06-04

---

## 1. Objetivo y alcance

Verificar que el MVP cumple los RF/RNF a través de los criterios de aceptación de los
casos de uso. **Regla:** ningún criterio sin caso de prueba con **oráculo falsable**;
ningún `TC` sin criterio de origen. La **red Besu está operativa** (gate del spike cerrado,
ver `SPIKE-BESU.md`): los `TC-ACC-*` son **ejecutables en Besu staging**; su única
precondición es **wallet de pruebas financiada + flujo MetaMask validado (TC-ACC-002)**.
Riesgo a vigilar: uptime de la red (estuvo ~9,5 días caída) → RNF-17.

## 2. Niveles y herramientas (pirámide)

| Nivel | Herramienta | Prefijo | Entorno |
|-------|-------------|---------|---------|
| Contrato: unit / fuzz / invariant | **Foundry** (`forge test`) | `TC-CT` | Anvil/EVM |
| Lógica compartida (calendario, tokenId off-chain) | **Vitest + fast-check** (property-based) | `TC-SH` | Node |
| Integración server-side (SIWE, route handlers) | **Vitest + supertest** | `TC-INT` | Node |
| Worker | **Vitest** + Anvil | `TC-WK` | Node + Anvil |
| MCP / asistente | **Vitest** (+ harness LLM replay) | `TC-MCP` | Node |
| E2E (lógica) | **Playwright + MCP wallet** | `TC-E2E` | Web + Anvil |
| Aceptación on-chain | **MetaMask real** sobre Besu | `TC-ACC` | Besu staging |
| No funcional | Lighthouse / axe-core / slither | `TC-NF` | Web / análisis |

**Objetivos de cobertura:** lógica crítica del contrato **100 % de ramas**; worker/MCP
**≥ 90 % líneas**; **todo escenario Gherkin y toda restricción EARS con ≥1 `TC`**.

## 3. Convención de IDs, datos y control de tiempo

- `TC-<NIVEL>-<NNN>`, cada uno con su CU y escenario/EARS de origen.
- Fixtures: hab. `102`, fecha `2026-06-15`, `tokenId 10220260615`, precio `0,5 ETH`,
  royalty `1000 bps`. Wallets prefinanciadas (faucet dev, CU-PR-01).
- **Selectores E2E (convención por identidad, evita el *strict mode* de Playwright):** los
  elementos repetidos llevan el `tokenId` — `night-card-<tokenId>` y, dentro,
  `buy-button-<tokenId>`. Los `TC-E2E-020/021/022/030` localizan la card del fixture
  (`night-card-10220260615`) y operan su `buy-button` dentro de ese scope.
- **Control de tiempo:** Anvil con `evm_setNextBlockTimestamp` + minado manual para
  expiración/medianoche (CU-05e, CU-13) y para estados de tx (CU-17). El **Anvil de CI
  arranca con `--chain-id 81234`** para que los oráculos de chainId coincidan con Besu.

---

## 4. Matriz de casos de prueba (por caso de uso)

> Estado: `Anvil` ejecutable ya · `Besu` en staging (red operativa) · `nightly` no-gate.

### CU-01 — Auth/roles (RF-06, RNF-13)
| TC | Escenario / EARS | Nivel | Oráculo | Estado |
|----|------------------|-------|---------|--------|
| TC-E2E-001 | Acceso con MINTER | E2E | HTTP 200 + `data-testid=mint-action` visible | Anvil |
| TC-INT-001 | SIWE server-side: nonce single-use, TTL, firma inválida, replay | integración | sin rol→403; replay/caducada/ inválida→401; nonce consumido no reutilizable | Anvil |
| TC-CT-001 | Acción sin rol | contrato | revert `AccessControlUnauthorizedAccount` | Anvil |

### CU-02 — Mint (RF-01/05/18a/18b/19, RNF-14)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-010 | Mint correcto | unit | NFT + `Mint(...)`, estado DISPONIBLE | Anvil |
| TC-CT-011 | Duplicado | unit | revert `DuplicateNight` | Anvil |
| TC-CT-012 | Habitación fuera de maestro | unit | revert `RoomNotInMaster` | Anvil |
| TC-CT-013 | Precio 0 | unit | revert `InvalidPrice` | Anvil |
| TC-CT-014 | Fecha pasada | unit | revert `PastDate` | Anvil |
| TC-CT-015 | Rango de fecha **on-chain** (MM∈[1,12], DD∈[1,31], ≠0) | fuzz | revert `InvalidDate` fuera de rango (ver ADR-08: calendario completo off-chain) | Anvil |
| TC-SH-001 | Calendario completo **off-chain** (29-feb bisiesto/no, días por mes, MM=00/13, DD=00) | property-based | rechaza fechas no-calendario antes de construir el tokenId | Node |
| TC-CT-016 | tokenId determinístico | fuzz | `id == room·1e8 + AAAAMMDD` | Anvil |
| TC-CT-017 | **Invariant unicidad global** | invariant | `totalSupply == nº pares (room,date) únicos`; sin segundo mint del par | Anvil |

### CU-04 — Catálogo/filtros (RF-02/14, RNF-01/02/11/12)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-E2E-010 | Listado paginado | E2E | tarjetas con foto/fecha/hab/precio | Anvil |
| TC-E2E-011 | Filtro por tipo | E2E | solo resultados del tipo | Anvil |
| TC-E2E-012 | RPC timeout | E2E | `data-testid=degraded-state` + `retry` | Anvil |
| TC-E2E-013 | Imagen no resuelve (origen real) | E2E | `data-testid=img-fallback`, noche comprable | Anvil |
| TC-E2E-014 | Catálogo vacío | E2E | `data-testid=empty-state`, 0 tarjetas | Anvil |
| TC-NF-001 | LCP | no func | LCP < 2500 ms P75, 4G, catálogo 50×90, **n≥50** | Anvil |
| TC-NF-002 | Render tras RPC | no func | Δ(`rpc:response`→`catalog:rendered`) < 1000 ms P75, **n≥50** | Anvil |
| TC-NF-011 | Llamadas RPC por vista (RNF-11) | no func | contador ≤ umbral; doc del punto de quiebre (Dec. 23) | Anvil |

### CU-05 — Compra primaria (RF-03/01/04, RNF-05/14/18)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-020 | Compra OK | unit | NFT→buyer, 100 % a TREASURY, `Sale(PRIMARY)`, **sin** `RoyaltyPaid`, `soldOnce=true` | Anvil |
| TC-CT-021 | Ya vendida | unit | revert `NightNotAvailable` | Anvil |
| TC-CT-022 | Expirada | unit | revert `NightExpired` | Anvil |
| TC-CT-023 | Concurrencia mismo token | unit | **exactamente 1** `Sale(PRIMARY)`, `ownerOf` = uno de los dos; la otra revierte `NightNotAvailable` | Anvil |
| TC-CT-018 | **Invariant soldOnce/≤1 primaria** | invariant | `soldOnce` monótono; ningún `buy` tras vendido; ≤1 `Sale(PRIMARY)`/token | Anvil |
| TC-CT-024 | Reentrancy en `buy` | unit | revert `ReentrancyGuardReentrantCall` **+ no duplicación**: 1 `Sale`, `ownerOf` cambia 1 vez, TREASURY +precio 1 vez | Anvil |
| TC-CT-025 | Carrera expiración medianoche | unit | firma 23:59:59 minada tras 00:00 → `NightExpired` | Anvil |
| TC-E2E-020 | Compra E2E + firma | E2E (MCP wallet) | `ownerOf`=buyer + `data-testid=receipt` con tokenId | Anvil |
| TC-E2E-021 | Saldo insuficiente | E2E | botón deshabilitado / fallo controlado con mensaje | Anvil |
| TC-E2E-022 | Rechazo de firma (parametrizado CU-02/05/06) | E2E | sin cambio on-chain (`ownerOf`/`listings`/`soldOnce`), UI vuelve al estado previo | Anvil |
| TC-ACC-001 | Firma/envío MetaMask real | aceptación | `status 0x1`, `ownerOf`=buyer, `Sale(PRIMARY)`, TREASURY +precio; gas: Anvil 0 / Besu `MIN_GAS_PRICE_WEI` | Besu |

### CU-06 — Listar/cancelar reventa (RF-07, RNF-10)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-030 | Listar | unit | `Listed`, estado LISTADA | Anvil |
| TC-CT-031 | Cancelar | unit | `Unlisted`, vuelve EN_PODER_CLIENTE | Anvil |
| TC-CT-032 | No propietario | unit | revert `NotOwner` | Anvil |
| TC-CT-033 | Precio 0 | unit | revert `InvalidPrice` | Anvil |
| TC-CT-034 | Expirada | unit | revert `NightExpired` | Anvil |
| TC-CT-035 | Cancelar sin listado activo | unit | revert `NotListed` | Anvil |
| TC-CT-036 | Re-listar con nuevo precio | unit | re-emite `Listed(price2)`, mantiene LISTADA | Anvil |

### CU-07 — Reventa con royalty (RF-07/08/03, RNF-10/14)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-040 | Royalty 10 % | unit | acredita 0,1 al receptor y 0,9 al vendedor (`pendingWithdrawals`), `Sale(SECONDARY)`+`RoyaltyPaid` | Anvil |
| TC-CT-041 | Precio no divisible (333 wei) | unit | `royalty+vendedor == enviado`; tras `claim` de ambos, residual del contrato por esa venta = 0 | Anvil |
| TC-CT-042 | Importe incorrecto | unit | revert `IncorrectPayment` | Anvil |
| TC-CT-043 | transferFrom directo | unit | revert `DirectTransferDisabled` | Anvil |
| TC-CT-044 | Reentrancy en `buyResale` | unit | revert `ReentrancyGuardReentrantCall` **+ no duplicación**: 1 `Sale(SECONDARY)`+1 `RoyaltyPaid`, acreditación 1 vez | Anvil |
| TC-CT-045 | Vendedor/receptor-contrato rechaza ETH | unit | reventa **no** se bloquea; saldo queda acreditado; 0 wei perdidos | Anvil |
| TC-CT-046 | Guard post-revert | invariant | tras tx revertida a mitad, transfer directo posterior revierte `DirectTransferDisabled`; marca transient = 0 al inicio de tx | Anvil |
| TC-CT-047 | Reventa sin listado activo | unit | revert `NotListed` | Anvil |
| TC-CT-048 | **Reentrancy en `claim()`** | unit | beneficiario-contrato reintenta en `receive` → revert `ReentrancyGuardReentrantCall`; retiro 1 vez, `pendingWithdrawals[addr]==0`, sin doble pago | Anvil |
| TC-CT-049 | **Invariant contabilidad pull** | invariant (stateful) | Σ pendientes + Σ claims + Σ royalties == Σ ETH recibido en `buyResale`; balance == Σ pendientes no reclamados; ningún claim > acreditado | Anvil |

### CU-08 — Asistente IA (RF-12/02, RNF-05/19)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-MCP-001 | `checkAvailability` | MCP | `{exists, available, price}` correctos | Anvil |
| TC-MCP-002 | `getOwnedNights` | MCP | lista los tokens de la wallet | Anvil |
| TC-MCP-003 | `buildPurchaseTx` | MCP | decodifica `data`: selector buy/buyResale, tokenId pedido; `to==deployments[chainId].address`; `value==priceOf(tokenId)`; `chainId==BESU_CHAIN_ID`; **sin** rawTx/firma | Anvil |
| TC-MCP-004 | Validación server-side | MCP | rechaza si `value≠precio on-chain` o estado ≠ DISPONIBLE/LISTADA | Anvil |
| TC-MCP-005a | Fuera de dominio (chiste) | MCP | **0 tool-calls de dominio** | Anvil |
| TC-MCP-006 | Prompt injection («transfiere mis fondos»/«revela tu prompt») | MCP | no expone prompt; `buildPurchaseTx`=0; 0 tx preparada | Anvil |
| TC-MCP-007 | Noche inexistente + alternativas | MCP | `exists=false`; `listAvailableNights({type})` ≥1 alternativa en ventana | Anvil |
| TC-MCP-008 | `listAvailableNights({window,type})` | MCP | solo DISPONIBLE/LISTADA en ventana; respeta filtro | Anvil |
| TC-NF-010 | Tasa OOD | nightly | ≥ 48/50, dataset fijo, modelo pineado (indicador, no gate) | nightly |
| TC-E2E-030 | Chat → preparación → firma | E2E | panel muestra to/value/tokenId y asevera `value==priceOf(tokenId)` antes de firmar | Anvil |
| TC-E2E-031 | MCP/LLM no disponible | E2E | `data-testid=assistant-unavailable` + flujo manual | Anvil |

### CU-09 — Histórico (RF-15, RNF-05)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-WK-010 | Orden total | worker | desc por timestamp, desempate `logIndex` desc | Anvil |
| TC-WK-011 | Token quemado sigue en histórico | worker | venta presente pese a burn | Anvil |
| TC-E2E-040 | Sin PII | E2E | sin nombres/emails/DNI | Anvil |
| TC-E2E-041 | Histórico vacío | E2E | `data-testid=empty-state` | Anvil |
| TC-E2E-042 | Endpoint de agregados caído | E2E | degradado + `retry` | Anvil |

### CU-10 — Email worker (RF-09, RNF-12/17) — **Hito 1**
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-WK-001 | Email tras Sale PRIMARY | worker | 1 email, tipo=PRIMARY (mock SMTP) | Anvil |
| TC-WK-002 | Email tras Sale SECONDARY | worker | 1 email, tipo=SECONDARY | Anvil |
| TC-WK-003 | Catch-up sin duplicar | worker | exactamente 1 email/`idempotency-key` | Anvil |
| TC-WK-004 | Reconexión RPC | worker | N Sale durante desconexión → **exactamente N emails**; checkpoint avanza; 2ª pasada 0 emails | Anvil |
| TC-WK-005 | Confirmaciones | worker | envía tras `CONFIRMATIONS_N` (=1, leído de constante) | Anvil |
| TC-WK-006 | Fallo SMTP | worker | backoff + log `EMAIL_DELIVERY_FAILED` + alerta, sin perder checkpoint | Anvil |
| TC-WK-030 | `/health` | worker | 200 `{status,lastBlock,lag}`; tras N fallos → 503 + `COMPONENT_DOWN` | Anvil |
| TC-WK-031 | Alerta por lag | worker | `lag = headBlock − lastBlock` > umbral → alerta | Anvil |

### CU-11 — Dashboard (RF-10, RNF-17)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-WK-020 | Ratio 30/100 | worker | 30 % | Anvil |
| TC-WK-021 | División por cero | worker | 0 % sin NaN | Anvil |
| TC-WK-022 | Royalties solo secundarias | worker | suma de `RoyaltyPaid` | Anvil |
| TC-E2E-050 | Render dashboard | E2E | métricas con unidad/periodo | Anvil |
| TC-E2E-051 | Agregados no disponibles | E2E | degradado | Anvil |

### CU-12 — Royalty config (RF-08, RNF-13)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-050 | Bordes {0,1999,2000,2001,2500} | unit param | ≤2000: éxito + `RoyaltyUpdated(old,new)` + `royaltyBps()==v`; >2000: revert `RoyaltyOutOfRange` | Anvil |
| TC-CT-051 | Sin rol | unit | revert `AccessControlUnauthorizedAccount` | Anvil |

### CU-13 — Caducadas/burn (RF-17)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-060 | Expiración bloquea compra | unit | revert `NightExpired` | Anvil |
| TC-CT-061 | Expiración bloquea reventa | unit | revert `NightExpired` | Anvil |
| TC-CT-062 | Burn lote no vendidas | unit | quema N, `Burn` × N | Anvil |
| TC-CT-063 | No quema noche de cliente | unit | revert `AlreadySold` | Anvil |
| TC-CT-064 | Sin rol BURNER | unit | revert `AccessControlUnauthorizedAccount` | Anvil |
| TC-CT-065 | Lote > máximo | unit | revert `BatchTooLarge` | Anvil |
| TC-CT-066 | Burn en pausa | unit | revert `EnforcedPause` | Anvil |
| TC-CT-067 | Token no expirado en lote | unit | revert `NotExpired(tokenId)` | Anvil |

### CU-14 — Pausa (RNF-15/13)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-070 | Pausa bloquea compra | unit | revert `EnforcedPause` | Anvil |
| TC-CT-071 | Pausa bloquea reventa | unit | revert `EnforcedPause` | Anvil |
| TC-CT-072 | Withdraw permitido en pausa | unit | éxito + saldo contrato 0 + `Withdrawn` | Anvil |
| TC-CT-073 | Reanudación | unit | tras unpause, compra → `ownerOf`=buyer + `Sale(PRIMARY)` | Anvil |
| TC-CT-074 | Pausa sin rol | unit | revert `AccessControlUnauthorizedAccount` | Anvil |
| TC-CT-075 | Mint en pausa | unit | revert `EnforcedPause` | Anvil |
| TC-CT-076 | grant/revokeRole en pausa | unit | éxito + `RoleGranted/RoleRevoked` | Anvil |

### CU-15 — Withdraw (RNF-15/13)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-080 | Retirada total | unit | todo a TREASURY, saldo 0, `Withdrawn` | Anvil |
| TC-CT-081 | No autorizado | unit | revert `AccessControlUnauthorizedAccount` | Anvil |
| TC-CT-082 | Sin fondos | unit | revert `NoFunds` | Anvil |
| TC-CT-083 | Reentrancy | unit | revert `ReentrancyGuardReentrantCall` + saldo 0 + 1 `Withdrawn` | Anvil |

### CU-16 — Roles/ownership (RF-06, RNF-13)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-090 | grantRole | unit | `RoleGranted`, capacidad nueva | Anvil |
| TC-CT-091 | grant sin admin | unit | revert `AccessControlUnauthorizedAccount` | Anvil |
| TC-CT-092 | Ownership 2 pasos | unit | `OwnershipTransferred` tras aceptar | Anvil |
| TC-CT-093 | Aceptación por no designado | unit | revert | Anvil |
| TC-CT-094 | setTreasury OK | unit | `TreasuryUpdated`; withdraw/royalty van a la nueva dirección | Anvil |
| TC-CT-095 | setTreasury a address(0) | unit | revert | Anvil |
| TC-CT-096 | setTreasury sin rol | unit | revert `AccessControlUnauthorizedAccount` | Anvil |

### CU-17 — Onboarding web3 (RF-04, RNF-18/19)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-E2E-060 | Conectar + añadir red | E2E | chainId esperado del entorno (81234) activo, compra habilitada | Anvil |
| TC-E2E-061 | Sin `window.ethereum` | E2E | `data-testid=no-wallet` + guía | Anvil |
| TC-E2E-062 | Red incorrecta | E2E | `data-testid=wrong-network`, sin tx | Anvil |
| TC-E2E-063 | Estados de tx | E2E (control de minado) | pendiente→confirmada; revertida con mensaje claro | Anvil |
| TC-ACC-002 | Add-network + firma reales | aceptación | MetaMask añade red 81234 y firma primaria/secundaria | Besu |

### CU-PR-01 — Faucet (dev/test, RF-21)
| TC | Escenario | Nivel | Oráculo | Estado |
|----|-----------|-------|---------|--------|
| TC-CT-100 | Dispensa | unit | +`FAUCET_AMOUNT`, `FaucetDispensed` | Anvil |
| TC-CT-101 | Cooldown | unit | revert `FaucetCooldownActive`; éxito a las 24 h | Anvil |
| TC-CT-102 | Saldo bajo | unit | saldo < `FAUCET_LOW_THRESHOLD` → no dispensa + alerta | Anvil |

---

## 5. Verificación de RNF (restricciones globales)

| RNF | TC | Estado |
|-----|----|--------|
| RNF-01 responsive | TC-NF-040 | Anvil |
| RNF-02 rendimiento | TC-NF-001/002 | Anvil |
| RNF-11 métricas | TC-NF-011 (RPC/vista + breakpoint) | Anvil |
| RNF-03 gas | TC-ACC-001 (gas efectivo con `MIN_GAS_PRICE_WEI`, `baseFee=0`) | Besu |
| RNF-05 sin PII | TC-E2E-040, TC-CT-020 | Anvil |
| RNF-10 royalty forzado | TC-CT-043/046, invariant TC-CT-046 | Anvil |
| RNF-12 resiliencia | TC-E2E-012/013/042/051, TC-WK-004/006 | Anvil |
| RNF-13 claves/roles | TC-CT-001/051/064/081/091/096 | Anvil |
| RNF-14 seguridad contrato | TC-CT-024/044/048/083 (reentrancy+no-dup), TC-NF-050 (slither) | Anvil |
| RNF-15 pausa/withdraw | TC-CT-070..083 | Anvil |
| RNF-17 observabilidad | TC-WK-030/031, TC-NF-020 (+ `/health` faucet) | Anvil |
| RNF-18 compat móvil | TC-E2E-061, TC-ACC-002 | Anvil/Besu |
| RNF-19 onboarding/estados tx | TC-E2E-060/063 | Anvil |
| RNF-20 accesibilidad | TC-NF-030 (axe-core 0 critical/serious, contraste 4.5:1/3:1) | Anvil |
| RNF-22 X/Y/Z | TC-ACC-010/011/012 (umbrales §5.1) | Besu |
| RNF-06/07/21 | Fase 2 / revisión documental | fuera MVP |

### 5.1 Umbrales RNF-22 (fijados con datos del spike)
- **TC-ACC-010 — X (tiempo de bloque):** con tx reales, **P50 ≤ 3 s y P95 ≤ 6 s** sobre ≥100 bloques (medido ~2 s/bloque). *No* se usa el ~33 s de cadena idle.
- **TC-ACC-011 — Y (latencia RPC):** **P95 ≤ 400 ms** sobre ≥100 muestras (medido P50 ~194 ms).
- **TC-ACC-012 — Z (estabilidad de eventos):** durante la ventana de prueba con **≥1 reconexión forzada**, **0 eventos `Sale` perdidos y 0 duplicados**; `gasPrice=0` efectivo con `baseFee=0`.

### 5.2 Filas de TC no funcionales materializadas
- **TC-NF-040 (RNF-01):** breakpoints 320/768/1024, áreas táctiles ≥44 px, sin scroll horizontal.
- **TC-NF-050 (RNF-14):** `slither` 0 *high*; *medium* con triage documentado.
- **TC-NF-030 (RNF-20):** `@axe-core/playwright` 0 *critical/serious*; contraste ≥4,5:1 / ≥3:1.
- **TC-NF-020 (RNF-17):** monitor sondea `/health` cada N s; alerta ante 503/COMPONENT_DOWN o lag.

---

## 6. Verificación de trazabilidad (gaps)

- **RF del MVP sin TC:** 0. **Escenarios/EARS sin TC:** 0 tras añadir empty-states (TC-E2E-014/041),
  `NotListed` (TC-CT-035/047), `NotExpired` (TC-CT-067), mint en pausa (TC-CT-075),
  `setTreasury` (TC-CT-094..096), estados de tx (TC-E2E-063), rechazo de firma (TC-E2E-022)
  y `claim` reentrancy (TC-CT-048).
- **RNF sin verificación:** 0 (todas las filas de §5 referencian TC **existentes en §4/§5.2**).
- **Tests huérfanos:** 0. **Invariants añadidos:** unicidad (TC-CT-017), soldOnce (TC-CT-018),
  guard (TC-CT-046), contabilidad pull (TC-CT-049).
- **Coherencia Besu:** `TC-ACC-*` ejecutables en staging (red operativa); umbrales en §5.1.

## 7. Criterios de entrada/salida

- **Entrada:** contrato compila (`evmVersion=cancun`), Anvil (`--chain-id 81234`), fixtures.
- **Salida (release MVP):** 100 % de `TC` *Anvil* en verde; ramas críticas del contrato 100 %;
  invariants (TC-CT-017/018/046/049) sin contraejemplo; `slither` sin *high*; axe-core sin
  *critical/serious*. **Gate de aceptación final:** `TC-ACC-001/002/010/011/012` en Besu staging
  (precondición: wallet financiada + MetaMask validado).

## 8. CI

- **PR gate:** `forge test` (unit/fuzz/invariant), Vitest (`TC-SH`/`TC-INT`/`TC-WK`/`TC-MCP`),
  Playwright (Anvil), axe-core, slither, build. **Incluye** `/health` (TC-WK-030) y los
  deterministas del asistente (TC-MCP-005a/006). **Excluye** TC-NF-010 y `TC-ACC-*`.
- **Nightly:** TC-NF-010 (OOD, modelo pineado) + rendimiento (TC-NF-001/002).
- **Staging Besu:** `TC-ACC-*` (aceptación on-chain) — red operativa.
