# Diseño técnico y ADRs — Hotel Marina del Sol

> Deriva de [`REQUISITOS.md`](./REQUISITOS.md) (v2) y [`CASOS-DE-USO.md`](./CASOS-DE-USO.md) (v2).
> **Versión 2** — incorpora los hallazgos del spike de Besu
> ([`SPIKE-BESU.md`](./SPIKE-BESU.md)) y las correcciones de la auditoría
> ([`REVISION-DISENO-TECNICO.md`](./REVISION-DISENO-TECNICO.md)).
> **Fecha:** 2026-06-04

> **Estado de la red (2026-06-04):** la Besu de Codecrypto (chainId 81234) está
> **operativa** (~2 s/bloque) y el **gate del spike se cerró con éxito** (tx EIP-1559
> minada, PUSH0/Cancún OK; ver `SPIKE-BESU.md`). El desarrollo se hace en **Anvil**; la
> **aceptación final** (`TC-ACC-*`, RNF-22 Z) se ejecuta en Besu. Riesgo a vigilar: la red
> estuvo ~9,5 días caída por falta de quórum → monitorizar uptime (RNF-17).

---

## 1. Stack por componente

| Componente | Tecnología | Notas |
|------------|-----------|-------|
| Smart contract | **Solidity 0.8.24 + Foundry**, `evmVersion = cancun` | OZ v5; unit + fuzz + invariant |
| Librerías | **OpenZeppelin v5**: ERC721, ERC2981, AccessControl, Pausable, ReentrancyGuard, Ownable2Step | Auditadas (RNF-14) |
| Frontend | **Next.js 14+ (App Router) + TypeScript** | Tienda + back-office + chat |
| Web3 | **viem + wagmi** | Conector MetaMask; red custom Besu (§9) |
| Caché lectura | **TanStack Query** (cliente) + **caché server-side** (Route Handler) + **agregados del worker** | Mitiga RPC directo (ADR-09) |
| Estilos / i18n | **Tailwind** (mobile-first) · **next-intl** (solo ES) | RNF-01 / RNF-06 |
| Mini-worker | **Node + TypeScript**, `viem`, `nodemailer`, `pino`, **SQLite** (`better-sqlite3`) | Singleton + volumen persistente (RNF-12) |
| MCP server | **Node + TypeScript + `@modelcontextprotocol/sdk`** | Read-only + `buildPurchaseTx`; sin claves |
| LLM | **Claude (API)**, orquestado **server-side** | Prompt acotado (RF-12) |
| Almacenamiento NFT | **IPFS** (Pinata o Kubo — pendiente §16) + imágenes servidas por **host/CDN** | Metadata por token (ADR-12) |
| Monorepo | **pnpm + Turborepo**, `packages/shared` fuente única | ABI/tipos/constantes |
| CI/CD | **GitHub Actions** | forge test, lint, build, Playwright, axe-core |
| E2E | **Playwright + MCP wallet** (lógica) + **prueba con MetaMask real** sobre Besu staging | skill `mcp-wallet-e2e` |

---

## 2. Estructura del monorepo modular

```
hotel-room/
├── apps/
│   ├── web/              # Next.js: tienda + back-office + chat
│   ├── worker/           # eventos Sale → email + agregados (RF-09, CU-09/11)
│   └── mcp/              # MCP server del contrato (RF-12)
├── packages/
│   ├── contracts/        # Foundry: Solidity + tests (+ faucet de dev/test)
│   ├── shared/           # ABI, tipos, constantes (§13), deployments/<chainId>.json
│   └── config/           # tsconfig, eslint, tailwind preset
├── docs/
├── pnpm-workspace.yaml · turbo.json · package.json
```

`packages/shared` es la **única fuente** de ABI, tipos, constantes (§13) y direcciones de
despliegue (`deployments/<chainId>.json`). El **faucet** (dev/test) vive en
`packages/contracts` (script/contrato para Anvil/CI), **no** se despliega en producción.

---

## 3. Decisiones de arquitectura (ADRs)

ADR-01..04 formalizan decisiones de `REQUISITOS.md`; ADR-05+ son de esta fase.

**ADR-01 — Anvil (dev) → Besu privada (prod).** chainId **81234**, QBFT, Cancún (spike). *Consecuencia:* finalidad inmediata; gas mínimo no nulo (§9).

**ADR-02 — Foundry, `evmVersion = cancun`.** El spike confirmó Cancún ⇒ PUSH0 y EIP-1153. *Consecuencia:* habilita el guard de royalty con transient storage (ADR-07).

**ADR-03 — Next.js App Router.** SSR/SSG para LCP. *Consecuencia:* frontera RSC/cliente explícita (§8).

**ADR-04 — viem + wagmi.** *Consecuencia:* chain config Besu con fees explícitos (§9).

**ADR-05 — Monorepo modular (pnpm + Turborepo).** *Reversible* a multi-repo si hace falta deploy independiente.

**ADR-06 — Roles OZ AccessControl + Ownable2Step.** MINTER, ROYALTY_ADMIN, PAUSER, BURNER, DEFAULT_ADMIN; **TREASURER** dedicado para `withdraw`; TREASURY = dirección receptora. Multisig (Safe) como DEFAULT_ADMIN en producción. *Bootstrap:* deploy con EOA → asignar roles a Safe → revocar EOA.

**ADR-07 — Guard de transferencias con transient storage (EIP-1153).** Para forzar el royalty (RNF-10), `_update` solo permite el cambio de propietario cuando una **marca transient** (`tstore`) la han puesto `buy`/`buyResale` justo antes del movimiento; mint (`from==0`) y burn (`to==0`) se permiten por comprobación de `address(0)`, **no** por la marca. La marca es transient ⇒ se **autolimpia al final de la tx**, eliminando el riesgo de flag «pegado» tras un revert. *Consecuencia:* `transferFrom`/`safeTransferFrom` directos revierten `DirectTransferDisabled`; invariant test: tras cualquier tx (incluida una revertida), un transfer directo posterior revierte.

**ADR-08 — tokenId determinístico + fecha mixta on/off-chain.** `tokenId = room·10^8 + AAAAMMDD`. La **fecha civil en `Europe/Madrid`** y la **validación de calendario** (días/mes, bisiesto) se calculan **off-chain**; el contrato recibe `AAAAMMDD` ya validado y aplica la regla de **expiración on-chain por umbral UTC** (`AAAAMMDD < hoy_utc_derivado`) de forma coherente en mint/compra/reventa/burn. *Consecuencia:* `PastDate`/`NightExpired` deterministas; margen UTC documentado.

**ADR-09 — Lectura RPC directa + tres niveles de caché, sin indexador.** Catálogo: ventana acotada (`CATALOG_WINDOW_DAYS`) leída por RPC + TanStack Query + caché server-side. **Histórico/dashboard (acumulativos): agregados precomputados por el worker** (que ya procesa todos los eventos) y servidos por endpoint; `getLogs` paginado en chunks ≤ `GETLOGS_MAX_RANGE` desde `deploymentBlock`. *Consecuencia:* el indexador sigue en Fase 2; el worker absorbe la agregación.

**ADR-10 — Worker idempotente, singleton, con checkpoint en SQLite.** Escucha `Sale`/`RoyaltyPaid`/`Mint`/`Burn`; `idempotency-key = keccak(txHash, logIndex)`; `CONFIRMATIONS_N = 1` (QBFT finalidad inmediata, spike). **Instancia única** (sin autoscaling) con **volumen persistente** (WAL + backup). *Consecuencia:* no hay reorgs que manejar (CU-10 reorg «no aplica» → test de reconexión/catch-up).

**ADR-11 — Asistente: LLM server-side + MCP read-only, con verificación de tx.** El LLM corre en un **API route server-side** de Next.js; habla con el MCP (transport HTTP). `buildPurchaseTx` devuelve `{to, data, value, chainId}` **sin firmar**. **Doble verificación antes de firmar:** (a) validación server-side independiente del LLM (tokenId existe, estado DISPONIBLE/LISTADA, `value == precio on-chain`); (b) el cliente recomputa `to == contrato`, `value == precio del getter`, `chainId` esperado y muestra la tx **decodificada** para confirmación (RNF-19). *Consecuencia:* nunca se firma una tx no verificada; el MCP no custodia claves.

**ADR-12 — IPFS pinning + imágenes por host/CDN.** Las 3 imágenes (una por tipo) se pinnean una vez (IPFS = almacenamiento canónico) **y se sirven desde el host Next.js/CDN** (`next/image`) para no atar el LCP a un gateway. La metadata por token referencia el CID. *Pendiente:* Pinata vs Kubo (§16).

**ADR-13 — Faucet solo dev/test.** Utilidad en `packages/contracts` para Anvil/CI; no se despliega en producción. *Consecuencia:* la obtención de ETH en producción es Fase 2.

**ADR-14 — i18n next-intl, solo español.** Claves desde el inicio.

**ADR-15 🆕 — Pagos por *pull* en la reventa.** `buyResale` **acredita** saldos a vendedor y receptor de royalty (`pendingWithdrawals[addr]`) en vez de enviar ETH por *push*; cada uno retira con `claim()`. *Consecuencia:* un vendedor/receptor-contrato que rechaza ETH **no puede bloquear** la reventa (evita el DoS); `claim` y `withdraw` con `nonReentrant`.

**ADR-16 🆕 — Inventario por `soldOnce`.** `mapping(uint256 => bool) soldOnce`, marcado `true` en `buy()`. `burnExpired` exige `!soldOnce[tokenId] && expirada`; si `soldOnce` ⇒ revierte `AlreadySold`. El mint asigna el token a la dirección del hotel (`MINTER`/inventario). *Consecuencia:* materializa «solo no vendidas del hotel» (CU-13d) sin tocar la propiedad del cliente.

**ADR-17 🆕 — Configuración de red Besu en `shared`.** chainId, RPC, símbolo, `feeMode` y fees mínimos centralizados (§9, §13).

---

## 4. Diseño del smart contract `HotelNights`

`ERC721` + `ERC2981` + `AccessControl` + `Pausable` + `ReentrancyGuard` + `Ownable2Step`.

**Estado clave**
- `mapping(uint256 => Listing) listings;` con `struct Listing { uint256 price; bool active; }`.
- `mapping(uint256 => bool) soldOnce;` (ADR-16).
- `mapping(address => uint256) pendingWithdrawals;` (ADR-15).
- `address treasury;` con `setTreasury(addr)` (`onlyRole(DEFAULT_ADMIN)`, `addr != address(0)`, emite `TreasuryUpdated`).
- Royalty: **fuente única** vía ERC-2981 (`_setDefaultRoyalty(treasury, bps)`); `buyResale` calcula con `royaltyInfo(tokenId, price)`.

**Funciones (× guarda × CU)**

| Función | Guarda | CU |
|---------|--------|----|
| `mint(room, dateYYYYMMDD, price)` | `MINTER`, `whenNotPaused`, valida maestro/fecha/precio, unicidad | CU-02 |
| `buy(tokenId) payable` | `nonReentrant`, `whenNotPaused`, DISPONIBLE; marca `soldOnce`, paga 100% a `treasury`, marca transient, transfiere | CU-05 |
| `list(tokenId, price)` / `unlist(tokenId)` | `ownerOf == msg.sender`, precio>0, no expirada | CU-06 |
| `buyResale(tokenId) payable` | `nonReentrant`, `whenNotPaused`, listado activo, importe exacto; royalty vía ERC-2981, **acredita** vendedor+receptor (pull) | CU-07 |
| `claim()` | `nonReentrant`; retira `pendingWithdrawals[msg.sender]` | CU-06/07 |
| `burnExpired(tokenId[])` | `BURNER`, `whenNotPaused`=**bloqueado en pausa**, `!soldOnce && expirada`, lote ≤ `BURN_BATCH_MAX` | CU-13 |
| `setRoyaltyBps(bps)` | `ROYALTY_ADMIN`, 0–2000 | CU-12 |
| `pause()`/`unpause()` | `PAUSER` | CU-14 |
| `withdraw()` | `TREASURER`, `nonReentrant`, todo a `treasury` | CU-15 |
| `setTreasury(addr)`, roles, ownership | DEFAULT_ADMIN / Ownable2Step | CU-16 |

- **CEI + `nonReentrant`** en `buy`/`buyResale`/`claim`/`withdraw`.
- **Venta primaria: sin royalty** (100% a `treasury`).
- **Eventos** (CASOS §2 + **`Withdrawn(address treasury, uint256 amount)`** y `TreasuryUpdated`, **a añadir a CASOS §2**).
- **Errores**: CASOS §3.
- **Burn durante pausa:** **bloqueado** (es destructivo e irreversible, no es remediación) — ajustar la tabla de pausa de CU-14.

---

## 5. Pipeline de metadata y maestro de habitaciones

**Maestro habitación → tipo** (RF-18a): `101–115 → simple`, `116–130 → doble`, `201–220 → suite` *(propuesta; confirmar reparto real con el hotel)*. Implementado como tabla/derivación on-chain validada en `mint` (rechaza habitación fuera de rango con `RoomNotInMaster`).

**Pipeline de metadata (al mintear):**
1. Las **3 imágenes** (simple/doble/suite) se suben **una vez** a IPFS → 3 CID fijos en `shared`.
2. Por cada noche minteada se genera el JSON ERC-721 `{name, image: ipfs://<CID-del-tipo>, attributes:[room, date, roomType]}` y se **fija su CID antes del `mint`** (el `tokenURI` debe resolver desde el primer bloque).
3. `tokenURI(tokenId)` = `ipfs://<CID-metadata>` (o base URI + CID). Actor: back-office (rol MINTER).

---

## 6. MCP server y orquestación del asistente

**Herramientas MCP** (read-only salvo preparación; **sin firma**):

| Herramienta | Entrada | Salida |
|-------------|---------|--------|
| `listAvailableNights` | `{ window?, type? }` | `[{tokenId, room, date, type, price, saleType}]` |
| `checkAvailability` | `{ room, date }` | `{exists, available, tokenId?, price?}` |
| `getOwnedNights` | `{ wallet }` | `[{tokenId, room, date, type}]` |
| `buildPurchaseTx` | `{ tokenId }` | `{to, data, value, chainId}` |

- El filtro `{type}` de `listAvailableNights` da soporte a «alternativas del mismo tipo» (CU-08 08a) → reconcilia el set de herramientas.
- **Orquestación (ADR-11):** LLM en API route server-side → MCP (HTTP) → handoff a wagmi con **verificación cliente + validación server-side**; confirmación UI con tx decodificada; manejo de `assistant-unavailable` (08e).

---

## 7. Mini-worker

- Escucha eventos (`viem`), `CONFIRMATIONS_N = 1`; `idempotency-key = keccak(txHash, logIndex)`; checkpoint de bloque en SQLite (WAL + backup).
- **Agregados (ADR-09):** mantiene contadores para CU-09 (histórico) y CU-11 (dashboard: vendido, royalties, vendidas, minteadas) y los expone por endpoint, evitando recomputar por RPC.
- **Catch-up paginado:** al reiniciar, `getLogs` por chunks ≤ `GETLOGS_MAX_RANGE` desde `deploymentBlock`.
- **Singleton** (sin autoscaling); `GET /health → {status, lastBlock, lag}`.
- Envío email vía `nodemailer`; credenciales en secret manager (§12).

---

## 8. Frontend (Next.js) — frontera RSC/cliente

- **Catálogo (`/`)**: shell + skeleton prerenderizados; primer fetch del catálogo en **RSC/Route Handler** con `publicClient` de viem, hidratando TanStack Query (favorece LCP, RNF-11). Filtros (RF-14) en cliente sobre la ventana.
- **`/historico`, `/admin/dashboard`**: leen los **agregados del worker** (no RPC directo).
- **`/mis-noches`, `/chat`, compra/firma**: **client components** (wagmi), fuera del LCP del catálogo.
- **Imágenes**: servidas por host/CDN (`next/image`); IPFS canónico (ADR-12).
- **Onboarding (CU-17)**: detección `window.ethereum`, alta de red custom (§9), guard wrong-network, estados de tx.
- **Accesibilidad**: WCAG 2.1 AA (`@axe-core/playwright`).

---

## 9. Configuración de red Besu y fees (del spike)

| Parámetro | Valor (medido) |
|-----------|----------------|
| RPC | `https://besu1.proyectos.codecrypto.academy` (y `besu2`) |
| chainId | **81234** |
| Símbolo | ETH |
| Consenso | **QBFT, finalidad inmediata** → `CONFIRMATIONS_N = 1` |
| Hardfork | **Cancún** (PUSH0, EIP-1153) |
| `baseFeePerGas` | **0** |
| min-gas-price | **1000 wei** (el gas **no es gratis**, pero es despreciable) |
| `getLogs` máx | **5000 bloques/consulta** |
| Latencia P50 | ~194 ms |
| Tiempo de bloque | **~2 s/bloque en producción** (validado con tx real); ~33 s eran de la cadena parada |

**Fees (validado en el spike):** con `baseFee = 0`, la **auto-estimación EIP-1559 falla**
(«max priority fee exceeds max fee»). Se confirmó vía `cast` que una tx **EIP-1559 (type 2)
con fees explícitos** (`maxFeePerGas ≥ maxPriorityFeePerGas`) **se mina** (status 0x1,
effGasPrice 1 gwei). El chain config de viem en `shared` debe fijar fees **explícitos**
(EIP-1559 explícito o legacy `gasPrice = MIN_GAS_PRICE_WEI`). Falta solo confirmar el flujo
desde la **UI de MetaMask** (TC-ACC-002).

> **UX:** con bloques ~33 s en idle, una compra puede tardar en confirmar; mostrar estado
> «pendiente» y no asumir confirmación instantánea (en Anvil es inmediata; ajustar timeouts
> de los E2E por entorno).

---

## 10. Entornos y despliegue

| Entorno | Red | Faucet | IPFS | Estado |
|---------|-----|--------|------|--------|
| Local | Anvil | Sí | Local/mock | OK |
| CI | Anvil efímero | Sí | Mock | OK |
| Staging | **Besu real** | No | Pinning real | **operativa** (~2 s/bloque, gate cerrado) |
| Producción (piloto) | Besu | No | Pinning real | pendiente |

Despliegue del contrato con `forge script`; address + `deploymentBlock` publicados a
`packages/shared/deployments/<chainId>.json` (§14). `web`/`worker`/`mcp` se despliegan por
separado (ver restricciones de hosting, §16).

---

## 11. CI/CD y testing

| Capa | Herramienta | Cubre |
|------|-------------|-------|
| Contrato | Foundry (unit+fuzz+invariant) | unicidad, royalty (incl. precio no divisible), guard `_update` post-revert, pull/DoS, pausa, fecha/DST |
| Worker / MCP | Vitest | idempotencia, catch-up paginado, agregados, guardrails MCP, validación server-side de `buildPurchaseTx` |
| E2E lógica | Playwright + **MCP wallet** | CU-05/07/08/17 contra Anvil |
| E2E aceptación | **MetaMask real** sobre Besu staging | add-network, firma primaria/secundaria, wrong-network (cuando la red vuelva) |
| Accesibilidad | axe-core | RNF-20 |
| Rendimiento | Lighthouse/Performance API | RNF-11 |

- **Job de Anvil en CI:** arranque con chainId/puerto fijo, readiness por RPC, `forge script`, exporta `CONTRACT_ADDRESS`/`RPC_URL`, **block-time determinista** (cheatcodes para CU-05d/05e/10c), teardown.
- **Mocks:** IPFS = gateway local con 404 controlado (CU-04 04c); LLM = harness de replay.
- **LLM estadístico (CU-08):** la tasa OOD es **indicador**, no gate de PR; se mide en **job nightly** con presupuesto y modelo pineado. El gate de PR usa solo escenarios deterministas (08b: 0 tool-calls; 08c: prompt injection).

---

## 12. Observabilidad, seguridad y secretos

- **Observabilidad (RNF-17):** `pino` estructurado; `GET /health` en worker, MCP y faucet (200 / 503+`COMPONENT_DOWN`); **monitor** que sondea `/health` cada N s y alerta por email; métrica de **lag** (`headBlock − lastBlock`) del worker.
- **Seguridad del contrato:** OZ auditado, `nonReentrant` (buy/buyResale/claim/withdraw), CEI, validación de inputs, Pausable, `slither` en CI, **auditoría externa antes de producción real**.
- **Claves (RNF-13):** wallet dedicada, backup offline, **multisig (Safe)** como DEFAULT_ADMIN en producción; bootstrap deploy→Safe→revocar EOA; valorar timelock para cambios sensibles.
- **Matriz de secretos** (almacén = secret manager por entorno, inyección por env, rotación):

| Secreto | Componente | Uso |
|---------|-----------|-----|
| Clave de deploy | CI / ops | `forge script` |
| Claves de roles (Safe) | ops | admin on-chain |
| `SMTP_*` | worker | email de venta |
| `ANTHROPIC_API_KEY` | API route (LLM) | asistente |
| `PINATA_JWT` (si Pinata) | pipeline metadata | pinning |

---

## 13. Constantes y umbrales (valores reales del spike)

Centralizadas en `packages/shared`. **(validar)** = confirmar con la red viva.

| Constante | Valor | Origen |
|-----------|-------|--------|
| `BESU_RPC_URL` | `https://besu1.proyectos.codecrypto.academy` | spike |
| `BESU_CHAIN_ID` | **81234** | spike |
| `NETWORK_NAME` | `Codecrypto Besu` | — |
| `CURRENCY_SYMBOL` | `ETH` | spike |
| `CONFIRMATIONS_N` | **1** | spike (QBFT) |
| `MIN_GAS_PRICE_WEI` | **1000** | spike |
| `FEE_MODE` | `legacy` o `eip1559-explicit` | spike (validar con MetaMask) |
| `EVM_VERSION` | **cancun** | spike |
| `GETLOGS_MAX_RANGE` | **5000** | spike |
| `ROYALTY_DEFAULT_BPS` / min/max | 1000 / 0 / 2000 | Dec. 17 / RF-08 |
| `BURN_BATCH_MAX` | 50 | CU-13 |
| `CATALOG_WINDOW_DAYS` | 90 | Dec. 23 |
| `RPC_TIMEOUT_MS` | 5000 | CU-04 |
| `RENDER_TARGET_MS` / `LCP_TARGET_MS` | 1000 / 2500 (P75) | RNF-02/11 |
| `SESSION_NONCE_TTL` | 300 s | CU-01 |
| `LLM_OOD_REJECT_RATE` | ≥ 48/50 (indicador, nightly) | CU-08 |
| `MAX_PRICE_NIGHT` / `FAUCET_AMOUNT` | a fijar / 3 × `MAX_PRICE_NIGHT` (dev) | RF-21 |
| `FAUCET_LOW_THRESHOLD` | a fijar (dev) | RNF-17 |
| RNF-22 X (bloque) | P50 ≤ 3 s, P95 ≤ 6 s (medido ~2 s/bloque con red activa) | spike/PLAN §5.1 |
| RNF-22 Y (RPC P95) | ≤ 400 ms (medido ~194 ms P50) | spike/PLAN §5.1 |
| RNF-22 Z (estabilidad eventos) | 0 `Sale` perdidos/duplicados con ≥1 reconexión | PLAN §5.1 |

---

## 14. Proceso de ABI y direcciones

- `forge build` + codegen de tipos a `packages/shared` en CI.
- `deployments/<chainId>.json` con `{ address, deploymentBlock, abiHash }`.
- **Redeploy (contrato inmutable, ADR-22 de v1):** bump de ABI+dirección en `shared`,
  despliegue coordinado de web/worker/mcp, **rebind del checkpoint del worker** a la nueva
  dirección+`deploymentBlock`, re-cálculo de agregados.

---

## 15. Trazabilidad (correcciones aplicadas)

| Hallazgo (revisión / spike) | Resuelto en |
|------------------------------|-------------|
| Crítico #1 guard `_update` | ADR-07 (transient EIP-1153, confirmado por spike) |
| Crítico #2 DoS reventa | ADR-15 (pull payments) |
| Crítico #3 fecha on-chain | ADR-08 (off-chain calendario + umbral UTC) |
| Crítico #4 inventario | ADR-16 (`soldOnce`) |
| Crítico #5 orquestación IA | ADR-11, §6 |
| Crítico #6 tipo de tx/fee | §9 (fees explícitos), §13 (`FEE_MODE`) |
| Crítico #7 worker en Besu | §10 staging, §11 (pendiente red) |
| Crítico #8 `CONFIRMATIONS_N` | §9/§13 = **1** (spike) |
| Crítico #9 histórico/dashboard escala | ADR-09 + §7 (agregados worker + paginación) |
| Royalty fuente única / Listing / Withdrawn / setTreasury | §4 |
| Pipeline metadata / maestro hab→tipo | §5 |
| Secretos / observabilidad / RACI | §12 |
| ABI/deployments | §14 |
| Referencias §12→§13, faucet en monorepo | corregido en este doc |

---

## 16. Pendiente (dependencias externas / red viva)

1. ~~Red Besu operativa~~ ✅ **HECHO** (2026-06-04): red activa ~2 s/bloque; tx EIP-1559 y
   PUSH0 validados. Queda **RNF-22 Z** (reconexión del worker) con la suite del worker en Besu,
   y **vigilar uptime** (la red estuvo ~9,5 días caída).
2. **`FEE_MODE`:** EIP-1559 explícito **validado vía `cast`**; falta confirmar el flujo desde
   la **UI de MetaMask** (TC-ACC-002).
3. **Pinata vs Kubo** (ADR-12) — operación.
4. **Hosting** de web/worker/mcp con sus restricciones: worker en **runtime persistente**
   (WS/polling + volumen, **no serverless**), RPC con acceso al nodo, API route con alcance
   a Anthropic. **(Codecrypto / ops)**
5. **RACI** de roles operativos y **reparto real habitación→tipo** con el hotel.
6. **`MAX_PRICE_NIGHT`** (fija `FAUCET_AMOUNT`).
