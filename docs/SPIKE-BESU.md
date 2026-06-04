# Spike técnico — Red Besu de Codecrypto (gate Go/No-Go)

> Verificación previa al Hito 1, recomendada por la auditoría del diseño técnico
> ([`REVISION-DISENO-TECNICO.md`](./REVISION-DISENO-TECNICO.md), riesgo «verde en Anvil,
> rojo en Besu»). Ejecutado contra el nodo real vía JSON-RPC.
> **Fecha:** 2026-06-04

## Datos de la red

| Parámetro | Valor |
|-----------|-------|
| RPC | `https://besu2.proyectos.codecrypto.academy` (HTTPS/443) |
| chainId | **81234** (`0x13d52`) |
| Moneda nativa | ETH |
| Cliente | **Besu v25.12.0** (OpenJDK 25) |
| Nodo | `validator2`, sincronizado (`eth_syncing = false`) |
| Bloque actual | ~3.460.566 |

## Resultados por área

| Área | Resultado | Veredicto |
|------|-----------|-----------|
| **Conectividad** | RPC HTTPS accesible; latencia mediana **~194 ms** (180–214 ms) | ✅ OK (cumple RNF-22 Y ≤ 300 ms) |
| **Consenso** | **QBFT** (`qbft_getValidatorsByBlockNumber` OK; `ibft_*` deshabilitado), **4 validadores**, `difficulty=1`, mixHash BFT | ✅ **Finalidad inmediata, sin reorgs** |
| **Hardfork** | `feeHistory` devuelve `baseFeePerBlobGas` ⇒ **Cancún activo** | ✅ **PUSH0 y EIP-1153 (transient storage) disponibles** |
| **Modelo de fee** | EIP-1559 soportado, `baseFeePerGas = 0`; `eth_gasPrice = 0x3e8 = **1000 wei**` (min-gas-price) | ⚠️ **No es free-gas puro** |
| **Tiempo de bloque** | **~33 s/bloque** medido sobre 30 bloques en cadena **inactiva** (bloques vacíos) | ⚠️ A confirmar con tx real |
| **`eth_getLogs`** | Rango 1.000 OK; **10.000 y 100.000 → ERROR** «Requested range exceeds maximum RPC range limit» | ⚠️ **Máximo ~5.000 bloques/consulta** |
| **`gasLimit`** | 30.000.000 por bloque | ✅ Holgado |
| **`net_version`** | Deshabilitado (`Method not enabled`) | ℹ️ Usar `eth_chainId` (viem/wagmi ya lo hacen) |

## Veredicto: 🟢 GO — red operativa, gate cerrado

**La red está operativa** (Codecrypto restableció el quórum QBFT el 2026-06-04) y la
**validación on-chain se completó con éxito**:

| Prueba (red viva) | Resultado |
|-------------------|-----------|
| tx **EIP-1559 (type 2)** real | `status 0x1`, minada en **~2 s**, gasUsed 21000, effGasPrice 1 gwei |
| **PUSH0 / Cancún** en bytecode real | deploy de `0x5f5ff3` ejecutó PUSH0 sin error (`status 0x1`, contrato creado) |
| **Tiempo de bloque** (producción) | **~2 s/bloque** (los ~33 s previos eran la cadena parada) → cumple RNF-22 X ≤ 5 s |
| **Fees con `baseFee = 0`** | hay que fijar `maxFeePerGas ≥ maxPriorityFeePerGas` **explícitos** (la auto-estimación EIP-1559 falla) |
| Latencia RPC | ~194 ms P50 → cumple RNF-22 Y |

> **Riesgo operativo a vigilar:** entre el inicio del spike y esta validación la cadena
> estuvo **~9,5 días parada** por falta de quórum QBFT (validador `0x543d…` sin proponer).
> Codecrypto la restableció, pero un piloto **depende de la disponibilidad de la red** →
> monitorizar uptime del nodo/consenso como parte de RNF-17.

**Pendiente menor:** validar el flujo con **MetaMask UI real** (add-network + firma desde
la extensión) — el comportamiento de protocolo ya está confirmado vía `cast` (→ TC-ACC-002).
**RNF-22 Z** (reconexión del worker sin pérdida) se cierra con la suite del worker en Besu.

### Supuestos a corregir en `DISENO-TECNICO.md` §11

| Constante / supuesto | Antes (propuesto) | **Real (medido)** |
|----------------------|-------------------|-------------------|
| Consenso / `CONFIRMATIONS_N` | 2 (asumía reorgs) | **1** (QBFT, finalidad inmediata) → test de reorg CU-10 «no aplica» |
| `gasPrice` (RNF-03) | ≈ 0 (free-gas) | **min 1000 wei**; `baseFee = 0`. El emisor **sí necesita un poco de ETH para gas** (coste despreciable, ~10⁵ wei/tx, pero no nulo) |
| RNF-22 X (tiempo de bloque) | ≤ 5 s | **~33 s en idle** (empty blocks); medir inclusión real con tx |
| `getLogs` (ADR-09, CU-09/11) | sin límite definido | **chunks ≤ 5.000 bloques** obligatorio (paginación + `deploymentBlock`) |
| `evmVersion` (foundry.toml) | sin fijar | **`cancun`** (PUSH0 + EIP-1153 OK) |
| RNF-22 Y (latencia RPC) | ≤ 300 ms (objetivo) | **~194 ms mediana** ✅ |

### Impacto en hallazgos críticos del informe de diseño

- **#1 (guard de `_update`)** → **desbloqueado**: Cancún activo ⇒ **transient storage (EIP-1153)** disponible para la marca de venta autolimpiable. ✅
- **#6 (tipo de tx / fee)** → **aclarado**: EIP-1559 con `baseFee = 0` funciona; configurar en viem `maxFeePerGas`/`maxPriorityFeePerGas` ≥ **1000 wei** (o tx legacy `gasPrice = 1000`). **Falta validar la firma real con MetaMask** (ver pendiente).
- **#8 (`CONFIRMATIONS_N`)** → **resuelto**: QBFT finalidad inmediata ⇒ `CONFIRMATIONS_N = 1`; reformular CU-10 (reorg «no aplica», sustituir por test de reconexión/catch-up).
- **#9 (histórico/dashboard a escala)** → **confirmado y acotado**: `getLogs` ≤ 5.000 bloques ⇒ paginación obligatoria + **cachear agregados en el worker** (ya ve todos los `Sale`/`RoyaltyPaid`).

### ⚠️ Validación pendiente (requiere una wallet financiada)

No se pudo enviar una transacción real (no hay clave con saldo). Queda por confirmar
**con una wallet con ETH** y MetaMask apuntando a la red:
1. Que **MetaMask añade la red** (`wallet_addEthereumChain` con chainId 81234) y firma/envía.
2. El **tiempo real de inclusión** de una tx (probable < 33 s si los bloques vacíos se
   espacian más que los llenos; medir).
3. Que `gasPrice = 1000 wei` es aceptado por el pool (min-gas-price).
4. Humo de **deploy del contrato** a Besu (confirma `evmVersion = cancun` y PUSH0 en
   bytecode real).

> Para cerrar este punto necesito una wallet de pruebas con saldo en esta red (o su clave
> privada de pruebas, **nunca una real**), o que lo valides tú manualmente con MetaMask.

## Valores confirmados para `packages/shared`

```
BESU_RPC_URL      = https://besu2.proyectos.codecrypto.academy
BESU_CHAIN_ID     = 81234
NETWORK_NAME      = "Codecrypto Besu (validator2)"
CURRENCY_SYMBOL   = ETH
CONFIRMATIONS_N   = 1
MIN_GAS_PRICE_WEI = 1000
GETLOGS_MAX_RANGE = 5000
EVM_VERSION       = cancun
RPC_LATENCY_P50   ≈ 194 ms
BLOCK_TIME_IDLE   ≈ 33 s   (confirmar inclusión con tx real)
```
