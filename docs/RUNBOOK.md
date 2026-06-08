# Runbook de operación — Hotel Marina del Sol (RNF-21)

> Guía operativa por componente: despliegue, arranque, observabilidad, incidencias y rotación de
> secretos. Complementa `DISENO-TECNICO.md` (arquitectura/ADRs) y `PLAN-DE-PRUEBAS.md` (aceptación).
> Audiencia: operador/responsable de release. Todo comando asume la raíz del monorepo salvo nota.

## 0. Mapa de componentes

| Componente | Paquete | Responsabilidad | Estado healthy |
| --- | --- | --- | --- |
| Contrato | `packages/contracts` (`HotelNights`, `Faucet`) | Verdad on-chain: mint/venta/reventa/royalty/roles | Desplegado, `owner()` aceptado, no `paused` |
| Web | `apps/web` (Next.js) | Catálogo, compra, «Mis noches», back-office, asistente | `next start` responde; catálogo renderiza |
| Worker | `apps/worker` (Node+SQLite) | Email de venta idempotente + agregados/histórico desde eventos | `/health` 200, `aggregateLag` bajo |
| MCP | `apps/mcp` | Tools de solo lectura + `buildPurchaseTx` para el asistente | `/health` 200 (sondea RPC) |
| Monitor | `apps/monitor` | Sondea `/health` del worker, alerta down/lag | proceso vivo, sin alertas activas |

La **fuente única** de ABI/direcciones/bloque de despliegue es `packages/shared` (`deployments/<chainId>.json`);
toda app lo consume. Nunca codifiques direcciones a mano fuera de ese registro / de las `NEXT_PUBLIC_*`.

---

## 1. Despliegue del contrato (ADR-06, despliegue en 2 pasos)

### 1.1 Variables requeridas (vía secret manager / CI, nunca en git)
- `DEPLOYER_PRIVATE_KEY` — EOA que despliega (se revoca al final).
- `ADMIN_ADDRESS` — admin definitivo (Safe/multisig en producción) que recibe los 6 roles.
- `TREASURY_ADDRESS` — receptora de ingresos/royalties. **Debe poder recibir ETH** (la primaria hace push a treasury).
- `ROYALTY_BPS` — opcional, por defecto `1000` (10 %).
- Faucet (dev/test, ADR-13): `DEPLOY_FAUCET` (default `true`; **en producción `false`**), `FAUCET_AMOUNT`
  (0.5 ETH), `FAUCET_COOLDOWN` (0), `FAUCET_LOW_THRESHOLD` (`amount*10`), `FAUCET_FUNDING` (100 ETH).

### 1.2 Procedimiento
```bash
cd packages/contracts
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast
# Sincroniza dirección + abiHash + bloque + faucet al registro compartido:
pnpm tsx scripts/sync-deployment.ts   # escribe packages/shared/deployments/<chainId>.json
```

### 1.3 Paso 2 OBLIGATORIO — aceptar la ownership (Ownable2Step)
El deploy **no queda completo** hasta que el admin/Safe llame `acceptOwnership()`. Hasta entonces
`owner()` sigue siendo el EOA (ya **sin** `DEFAULT_ADMIN_ROLE`: no gobierna la lógica de negocio,
que va por roles). Desde el Safe:
```
HotelNights.acceptOwnership()   # owner() pasa a ser ADMIN_ADDRESS → despliegue completo
```
**Verificación post-deploy:**
- `owner()` == `ADMIN_ADDRESS`.
- `hasRole(DEFAULT_ADMIN_ROLE, deployer)` == `false`; los 6 roles en `ADMIN_ADDRESS`.
- `paused()` == `false`; `royaltyInfo` devuelve `TREASURY`/bps esperados.
- `TREASURY_ADDRESS` confirmada como receptora capaz de recibir ETH (ver §5, incidencia treasury hostil).

### 1.4 Separación de poderes (Decisión 20)
Los fondos se retiran con **`TREASURER_ROLE`** (`withdraw()`), distinto de `DEFAULT_ADMIN_ROLE`
(gestión de roles). Asigna `TREASURER_ROLE` a la cuenta/Safe de tesorería, no al admin de roles.

### 1.5 Despliegue y aceptación en Besu (FASE 5, T5.1)
Red de aceptación: **Besu 81234** (`https://besu1.proyectos.codecrypto.academy`, espejo `besu2`).
Particularidades frente a Anvil:
- **Gas:** `baseFeePerGas = 0`, `eth_gasPrice = 1000 wei` (mín. > 0). Despliega con `forge script
  … --broadcast --slow --legacy` (legacy usa el `gasPrice` de la red; coste despreciable).
- **Firma:** Besu **no soporta `eth_sendTransaction`** (sin cuentas desbloqueadas). Toda escritura
  es una tx **firmada en cliente** + `eth_sendRawTransaction` (forge/viem/MetaMask lo hacen ya).
  → El E2E `e2e-wallet-buy.mjs` (headless-wallet que reenvía `eth_sendTransaction`) es **Anvil-only**;
  la compra real en Besu se valida con MetaMask (TC-ACC-001/002) o con una `buy()` firmada (cast/viem).
- **Aceptación medida** (`packages/contracts/scripts/measure-besu.mjs`, RNF-22):
  `TC-ACC-010` bloque P50/P95 = 2 s (≤3/≤6) · `TC-ACC-011` RPC P95 ≈ 44 ms (≤400) ·
  `TC-ACC-012` 0 eventos perdidos.
- **Cuentas:** la red usa la **mnemónica estándar de Anvil/Hardhat** ya financiada (deployer/admin/
  treasury/compradores con saldo). El despliegue funciona con las mismas claves que en local.
- **Procedimiento:** idéntico a §1.2–§1.4 con `RPC_URL` de Besu + `--legacy`; `acceptOwnership()`
  desde el admin; `sync` escribe `deployments/81234.json`. Apps a Besu vía env `NEXT_PUBLIC_NETWORK=besu`
  (web) y `RPC_URL`/`CONTRACT_ADDRESS`/`DEPLOYMENT_BLOCK`/`CHAIN_ID=81234` (worker/mcp).

---

## 2. Despliegue de las apps (por entorno, vía `NEXT_PUBLIC_*` / env)

| Variable | Componente | Nota |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL` | web | cadena activa |
| `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | web | del registro `deployments/<chainId>.json` |
| `NEXT_PUBLIC_FAUCET_ADDRESS` | web | **solo dev/test**; sin ella, toda la UI de faucet queda oculta |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL`/`_NAME` | web | opcional; sin él, el recibo degrada a hash+copiar |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `MCP_BASE_URL` | web (server) | **solo servidor**; nunca expuesta al cliente |
| `MCP_SHARED_SECRET` | web↔mcp | secreto compartido del gateway |
| `RPC_URL`, `CONTRACT_ADDRESS`, `DEPLOYMENT_BLOCK`, SMTP/secret email | worker | checkpoint en SQLite |
| `MCP_HOST` (default `127.0.0.1`), allowlist anti DNS-rebinding | mcp | no abrir a `0.0.0.0` sin allowlist |

Orden recomendado: contrato → sync deployment → worker (que ya indexa desde el bloque) → mcp → web → monitor.

---

## 3. Faucet (dev/test, RF-21 / CU-PR-01 — NUNCA en producción)
- Se despliega y financia en el mismo broadcast (`Deploy.s.sol`, `DEPLOY_FAUCET=true`).
- Recarga manual: enviar ETH a la dirección del faucet o `faucet.fund{value: x}()`.
- Saldo bajo: `lowBalance()` == `true` cuando `balance < lowThreshold`; la web muestra «sin fondos» y
  el operador debe recargar. Drenar sobrante: `drain(address payable)` (solo owner = EOA desplegador).
- Cooldown por wallet: `availableAt(account)`; el revert `FaucetCooldownActive(account, availableAt)`
  se decodifica en la web a «disponible a las HH:MM».

---

## 4. Observabilidad y alertas

### 4.1 Worker `/health` (RF-10/RNF-17)
- 200 = healthy. Vigila `aggregateLag` (distancia entre el último bloque indexado y la cabeza):
  un lag creciente indica RPC lento/caído o el indexador parado.
- El checkpoint SQLite **solo avanza tras entregar el email** (idempotencia por `txHash:logIndex`):
  un email no entregado **no** salta la venta (se reintenta). No borres el SQLite sin entender el catch-up.

### 4.2 Monitor (TC-NF-020)
- Sondea `/health`, alerta `down`/`lag` con deduplicación. Si alerta: revisa RPC, después el worker.

### 4.3 MCP `/health`
- Sondea el RPC; 503 = RPC inalcanzable → el asistente degrada a «assistant-unavailable» (no inventa datos).

### 4.4 Rendimiento (RNF-11, no bloqueante)
- Job CI **nightly** `perf-nightly` (`measure-perf.mjs`) como indicador informativo (artifact, no gate).
- Lanzable a mano: `workflow_dispatch` (GitHub) / «Run pipeline» sobre el schedule (GitLab).

---

## 5. Incidencias comunes (síntoma → causa → acción)

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| Catálogo vacío / «degradado» | RPC caído o `DEPLOYMENT_BLOCK` mal | Verifica `NEXT_PUBLIC_RPC_URL` y el registro; el front degrada honestamente, no peta |
| `aggregateLag` alto | RPC lento o worker parado | Revisa logs del worker y salud del RPC; el catch-up reanuda solo al volver |
| Compra primaria revierte siempre | `TREASURY` no acepta ETH (receiver hostil) | Cambiar `setTreasury` a una dirección que acepte ETH (defecto #3 de la revisión) |
| `withdraw` revierte `AccessControlUnauthorizedAccount` | La cuenta no tiene `TREASURER_ROLE` | Conceder `TREASURER_ROLE` desde el admin (CU-15/Dec. 20) |
| Back-office no carga paneles | Sin sesión SIWE válida | Login SIWE; el layout RSC gatea en servidor (no es bug) |
| Asistente «no disponible» | RPC/MCP/LLM inalcanzables | Revisa MCP `/health`, `MCP_BASE_URL`, `ANTHROPIC_API_KEY` |
| Cambio de red falla (4902) | La red no está añadida en la wallet | La web pide aprobar añadir la red; si falla, añadir manualmente (CU-17/RF-04) |

### 5.1 Emergencia (CU-14)
- `pause()` (rol `PAUSER_ROLE`) detiene las operaciones mutables; **las lecturas siguen** (catálogo/histórico/claim de pull payments). `unpause()` para reanudar.

---

## 6. Rotación de secretos
- **`ANTHROPIC_API_KEY`**: vive solo server-side (`.env.local`, gitignored). Rótala/revócala desde la
  consola de Anthropic ante cualquier exposición; nunca la pegues en chat, logs ni cliente.
- **`DEPLOYER_PRIVATE_KEY`**: efímera; se revoca el `DEFAULT_ADMIN` del EOA al desplegar. No reutilizar.
- **`MCP_SHARED_SECRET`** / secretos SMTP: rotar vía secret manager; redeploy de los componentes afectados.
- Cookies de sesión SIWE: HMAC server-side, `secure` en producción.

---

## 7. Checklist de release (resumen)
- [ ] `forge test` verde; `slither` sin findings `high` (gate CI, TC-NF-050).
- [ ] Deploy + `sync-deployment` + **`acceptOwnership()`** confirmado (§1.3).
- [ ] `DEPLOY_FAUCET=false` en producción; `NEXT_PUBLIC_FAUCET_ADDRESS` sin definir.
- [ ] `TREASURY` capaz de recibir ETH; `TREASURER_ROLE` asignado a tesorería.
- [ ] Apps desplegadas con env por entorno; worker indexando; monitor activo.
- [ ] `ANTHROPIC_API_KEY` solo server-side y rotada si hubo exposición.
- [x] Aceptación en Besu: `TC-ACC-010/011/012` PASS + compra real firmada (`TC-ACC-001`); `TC-ACC-002`
      (MetaMask real) por el operador. Ver §1.5.
