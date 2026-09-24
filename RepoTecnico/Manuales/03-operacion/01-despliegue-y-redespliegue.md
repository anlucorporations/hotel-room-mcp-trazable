# 03 · Despliegue y redespliegue del contrato

> **Contrato**: **`HotelNights`** (único). La generación legacy `HotelNFT` + `HotelMarketplace` se
> **retiró del árbol** en M9 y `Deploy.s.sol` nunca la desplegó (ADR-02).
> **Red canónica**: Anvil local `http://127.0.0.1:8545`, `chainId 81234` (ADR-01, ADR-17).
> **El contrato es inmutable**: un cambio de reglas **no** se actualiza, se **redespliega** con
> dirección nueva y se resincroniza el registro (ADR-22). No hay *proxy*.

## 1. Antes de desplegar: comprobaciones

1. La cadena responde y es la esperada:

   ```powershell
   cast chain-id --rpc-url http://127.0.0.1:8545
   ```

   Debe imprimir `81234`.

2. El contrato compila:

   ```powershell
   pnpm contracts:build
   ```

3. Las variables del despliegue están puestas. `Deploy.s.sol` lee:

   | Variable | Obligatoria | Por defecto |
   |---|---|---|
   | `DEPLOYER_PRIVATE_KEY` | **Sí** | — |
   | `ADMIN_ADDRESS` | No | el desplegador |
   | `TREASURY_ADDRESS` | No | el desplegador (en producción: la tesorería del hotel) |
   | `MINTER_ADDRESS`, `RECEPTION_ADDRESS`, `PAUSER_ADDRESS`, `BURNER_ADDRESS`, `TREASURER_ADDRESS` | No | el **admin** |
   | `MIN_LISTING_PRICE` | No | `0.01 ether` (valor del propio contrato) |
   | `DEPLOY_FAUCET` | No (`false`) | `false` |
   | `FAUCET_AMOUNT_WEI`, `FAUCET_COOLDOWN_SECONDS`, `FAUCET_LOW_THRESHOLD_WEI`, `FAUCET_FUND_WEI` | No | 30 ether / 86.400 s / 150 ether / 0 |

   Separar los roles en cuentas distintas es lo que hace verificable la **separación de funciones**:
   el E2E de M4 comprueba que el desplegador **ya no** es administrador, y los E2E de M6/M7 exigen
   `BURNER_ROLE` en la cuenta 2 y `PAUSER_ROLE` en la 1.

4. **Para el worker** si vas a redesplegar: indexa el mismo contrato y puede escribir mientras cambia.

## 2. Despliegue canónico, paso a paso

1. Sitúate en el paquete de contratos:

   ```powershell
   cd packages/contracts
   ```

2. Despliega con el script canónico (bootstrap de roles incluido):

   ```powershell
   forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --slow
   ```

   El script, en este orden: despliega `HotelNights(treasury)`; concede `MINTER_ROLE`,
   `RECEPTION_ROLE`, `PAUSER_ROLE`, `BURNER_ROLE` y `TREASURER_ROLE`; ajusta `minListingPrice` si
   difiere del valor del contrato; despliega y financia el `Faucet` **solo** si `DEPLOY_FAUCET=true`;
   y hace el **handover de gobernanza**: concede `DEFAULT_ADMIN_ROLE` al admin definitivo y hace que
   el desplegador **renuncie** a su rol.

3. Vuelve a la raíz y **sincroniza el registro** validado por esquema:

   ```powershell
   cd ../..
   pnpm --filter @hotel/contracts sync
   ```

   `sync-deployment.ts` toma la dirección y el bloque del **recibo del broadcast** real
   (`broadcast/Deploy.s.sol/<chainId>/run-latest.json`; `latest.json` solo se usa si no hubo broadcast),
   añade el `abiHash` del artefacto compilado y escribe
   `packages/shared/deployments/<chainId>.json`.

4. Lee el registro y cópialo al `.env`:

   ```powershell
   Get-Content packages/shared/deployments/81234.json
   ```

   ```json
   {
     "chainId": 81234,
     "address": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
     "deploymentBlock": 7,
     "abiHash": "0x9fa3043a47ca78e57f56259b26050bcd667bda13fce9af18f169244912c65f58",
     "deployedAt": "2026-09-23T00:26:33.689Z",
     "faucet": "0x0165878A594ca255338adfa4d48449f69242Eb8F"
   }
   ```

   ```
   CONTRACT_ADDRESS=0x5fbdb2315678afecb367f032d93f642f64180aa3
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x5fbdb2315678afecb367f032d93f642f64180aa3
   NEXT_PUBLIC_DEPLOYMENT_BLOCK=7
   NEXT_PUBLIC_FAUCET_ADDRESS=0x0165878A594ca255338adfa4d48449f69242Eb8F   # solo si hay faucet
   ```

   `NEXT_PUBLIC_*` se inyecta **en la compilación**: si cambian, reinicia el servidor de desarrollo o
   vuelve a construir la web.

> **`pnpm deploy:anvil` no funciona hoy**: el script raíz delega en
> `pnpm --filter @hotel/contracts deploy:anvil`, que **no existe** (el nombre real es `deploy:local`).
> Usa el comando `forge script` de arriba o `pnpm --filter @hotel/contracts deploy:local`.

## 3. Verificación on-chain con `cast`

Dirección de trabajo:

```powershell
$C = "0x5fbdb2315678afecb367f032d93f642f64180aa3"
$RPC = "http://127.0.0.1:8545"
```

1. **Hay código desplegado** (no una dirección vacía):

   ```powershell
   cast code $C --rpc-url $RPC
   cast block-number --rpc-url $RPC
   ```

   El contrato debe existir en `deploymentBlock` y **no** en el bloque anterior.

2. **Tesorería y suelo de listado**:

   ```powershell
   cast call $C "treasury()(address)" --rpc-url $RPC
   cast call $C "minListingPrice()(uint256)" --rpc-url $RPC   # 10000000000000000 = 0,01 ETH
   ```

3. **Roles** (comprueba cada uno contra la cuenta que debe tenerlo y, sobre todo, que el
   **desplegador ya no es administrador**):

   ```powershell
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "DEFAULT_ADMIN_ROLE") <ADMIN_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "MINTER_ROLE")        <MINTER_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "RECEPTION_ROLE")     <RECEPTION_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "PAUSER_ROLE")        <PAUSER_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "BURNER_ROLE")        <BURNER_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "TREASURER_ROLE")     <TREASURER_ADDRESS> --rpc-url $RPC
   cast call $C "hasRole(bytes32,address)(bool)" $(cast keccak "DEFAULT_ADMIN_ROLE") <DEPLOYER_ADDRESS> --rpc-url $RPC   # false
   ```

4. **Royalty inmutable por tipo** (EIP-2981). El `tokenId` es `room · 10^8 + AAAAMMDD`:

   ```powershell
   # Noche simple (habitación 102): 5 % de 0,1 ETH = 0,005 ETH
   cast call $C "royaltyInfo(uint256,uint256)(address,uint256)" 10220260615 100000000000000000 --rpc-url $RPC
   # Noche suite (habitación 201): 10 % de 0,1 ETH = 0,01 ETH
   cast call $C "royaltyInfo(uint256,uint256)(address,uint256)" 20120260615 100000000000000000 --rpc-url $RPC
   ```

5. Otras lecturas útiles:

   ```powershell
   cast call $C "burnBatchMax()(uint256)" --rpc-url $RPC
   cast call $C "paused()(bool)" --rpc-url $RPC
   cast call $C "ownerOf(uint256)(address)" <tokenId> --rpc-url $RPC
   cast call $C "isCheckedIn(uint256)(bool)" <tokenId> --rpc-url $RPC
   ```

6. **Faucet opcional** (solo desarrollo): comprueba que está financiado y con la dirección del
   registro.

   ```powershell
   cast balance 0x0165878A594ca255338adfa4d48449f69242Eb8F --rpc-url $RPC
   ```

   Sin `DEPLOY_FAUCET=true` no hay faucet: la interfaz **oculta** su botón si
   `NEXT_PUBLIC_FAUCET_ADDRESS` está vacío (degradación honesta, ADR-13).

## 4. Procedimiento de **redespliegue**

Aplica cuando cambia el contrato (nueva regla, corrección) o cuando has reiniciado Anvil.

1. **Para el worker.** Si no lo haces, indexa mientras cambia el contrato y deja el índice en un
   estado que no corresponde a nada.
2. **Decide si reinicias Anvil**:
   - **Reiniciar Anvil**: borra el estado (noches, ventas, check-ins). La dirección vuelve a ser la
     determinista (`0x5FbD…aa3` con la cuenta 0 en el nonce 0). El `redeploy` **no** se detecta por
     cambio de dirección, así que el worker se apoya en el checkpoint por delante de la cabeza para
     rebobinar.
   - **No reiniciar Anvil**: despliega en el **nonce siguiente**, lo que produce una **dirección
     nueva**; el registro y el `.env` deben cambiar, y la base queda con datos de la dirección vieja.
3. **Despliega** con el script canónico (§2, pasos 1–2). Vuelve a pasar `ADMIN_ADDRESS`,
   `RECEPTION_ADDRESS`, `BURNER_ADDRESS`, etc.: un despliegue nuevo **no hereda** roles.
4. **Sincroniza el registro**:

   ```powershell
   pnpm --filter @hotel/contracts sync
   ```

5. **Actualiza el `.env`** con `CONTRACT_ADDRESS`, `NEXT_PUBLIC_CONTRACT_ADDRESS`,
   `NEXT_PUBLIC_DEPLOYMENT_BLOCK` y `NEXT_PUBLIC_FAUCET_ADDRESS`. Si cambió el ABI, regénéralo y
   reconstruye `shared`:

   ```powershell
   pnpm --filter @hotel/contracts gen:abi
   pnpm --filter @hotel/shared build
   ```

6. **Verifica con `cast`** lo del §3, especialmente que el desplegador ya no es administrador.
7. **Arranca el worker** y comprueba la salud:

   ```powershell
   pnpm --filter @hotel/worker dev
   curl.exe http://127.0.0.1:8787/health
   ```

   Si el checkpoint persistido va **por delante** de la cabeza, el worker **rebobina** al
   `deploymentBlock`, lo registra con un aviso y reporta `lag` negativo mientras la situación dure
   (el `lag` negativo **degrada** la salud: antes reportaba `ok` y el fallo era silencioso).
   Comprueba después que `/aggregates` cuadra con la cadena.

8. **Re-mintea el inventario** que deba existir. Si reiniciaste Anvil, el estado on-chain anterior
   **ya no existe**: las noches hay que volver a crearlas desde el back-office (`/admin/mint`, con
   re-confirmación de TOTP).
9. **Reaprovisiona/rota operadores** si el entorno se comparte, y avisa a recepción de que las
   sesiones anteriores pueden haber quedado invalidadas.

## 5. Después de un viaje en el tiempo de la cadena

El E2E de M6 **viaja en el tiempo** de la cadena (~+40 días, y en la práctica deja el reloj adelantado
unos dos meses) para caducar una noche. Los guiones calculan sus fechas con el **reloj de la cadena**,
así que son re-ejecutables; para volver al presente:

1. Reinicia Anvil.
2. Redespliega con el script canónico.
3. Ejecuta `pnpm --filter @hotel/contracts sync`.
4. Actualiza el `.env` con la dirección y el bloque nuevos.
5. Arranca el worker y comprueba `/health` y `/aggregates`.

> El viaje en el tiempo es la razón por la que las noches inyectadas pueden aparecer con fechas de
> dentro de dos meses: el guion de inyección respeta el reloj de la cadena, que es el que decide la
> caducidad en el contrato.

## 5.1 Reinicio COMPLETO de la plataforma (cadena limpia + datos)

Procedimiento **verificado** para dejar el entorno prístino: cadena nueva, contrato redesplegado,
índice off-chain limpio y datos de prueba inyectados. **Se pierde el histórico de la cadena anterior**,
porque el contrato es inmutable y reiniciar Anvil borra su estado.

```powershell
# 1. Parar la plataforma
pwsh scripts/dev/deploy-local.ps1 -Stop

# 2. Limpiar el indice off-chain (CONSERVA los operadores de admin_users)
pnpm --filter @hotel/shared reset:index -- --apply

# 3. Cadena limpia (mata el Anvil actual y arranca otro)
anvil --chain-id 81234 --block-time 2

# 4. Redesplegar + resincronizar el registro
pnpm deploy:anvil            # o: cd packages/contracts; forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --slow
pnpm --filter @hotel/contracts sync

# 5. Actualizar NEXT_PUBLIC_DEPLOYMENT_BLOCK en el .env con el bloque del registro
#    (la direccion NO cambia: es determinista, 0x5FbD...aa3)

# 6. Construir y arrancar (worker, MCP, monitor, web + sumidero SMTP)
pwsh scripts/dev/deploy-local.ps1

# 7. Inyectar los datos de la plataforma
pnpm inject:data
pnpm verify:accounts         # topologia de cuentas
```

**Por qué hay que limpiar el índice a mano**: al reiniciar Anvil el contrato vuelve a la **misma
dirección determinista**, así que el worker no ve un redespliegue por dirección. Su rebobinado
automático (`isCheckpointAheadOfChain`) **sí** salta, pero se apoya en que la cadena nueva supere el
bloque viejo para reindexar: si se inyectan datos en los primeros bloques, las ventas anteriores
seguirían en el histórico y el panel mezclaría **dos cadenas**. `reset:index` evita eso de raíz y no
toca `admin_users` ni `mfa_recovery_codes`, de modo que los autenticadores ya configurados siguen
valiendo.

## 6. Registro de despliegue: qué se versiona y qué no

| Fichero | Contenido | ¿Versionado? |
|---|---|---|
| `packages/contracts/deployments/latest.json` y `<chainId>.json` | Registro **crudo** que escribe Foundry | No (y las pruebas escriben en `deployments/test/` para no pisarlo) |
| `packages/shared/deployments/<chainId>.json` | Registro **canónico**: `address`, `deploymentBlock`, `abiHash`, `deployedAt`, `faucet` | **Sí**, validado por `deployments/schema.ts` |
| `broadcast/Deploy.s.sol/<chainId>/run-latest.json` | Recibo real del broadcast (fuente de la dirección y el bloque) | Artefacto de Foundry |

---

*Volver a [Operación](README.md) · Siguiente: [E2E y verificación](02-e2e-y-verificacion.md)*
