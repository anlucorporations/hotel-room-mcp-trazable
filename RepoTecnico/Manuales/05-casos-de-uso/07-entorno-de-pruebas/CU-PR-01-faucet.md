# CU-PR-01 · Conseguir dinero de prueba (solo en pruebas) — Manual técnico

> Bloque 7 · Entorno de pruebas · Actor: Tester/CI · Requisitos: RF-21

## 1. Ficha y trazabilidad

- **Objetivo.** Entregar ETH simbólico a una wallet de pruebas para poder firmar compras, reventas
  y retiradas sin usar dinero real. Es una **utilidad de desarrollo**, no un producto: en producción
  no existe (`docs/CASOS-DE-USO.md:955`, `docs/adr/ADR-13-faucet-de-pruebas.md:6`).
- **Actor primario.** Tester o pipeline de CI que pide fondos desde la web de pruebas o desde un
  script (`docs/CASOS-DE-USO.md:964`). **Actor secundario.** El operador que despliega y financia el
  faucet (`packages/contracts/src/Faucet.sol:40`).
- **Trazabilidad.** RF-21, reclasificado como utilidad de pruebas (`docs/CASOS-DE-USO.md:965`),
  decisión **D-11** y **ADR-13**. Aporta el indicador de saldo bajo que pide RNF-17
  (`packages/contracts/src/Faucet.sol:67`). Los tests previstos son TC-CT-100/101/102
  (`docs/PLAN-DE-PRUEBAS.md:233`).
- **Precondición.** Faucet desplegado (`DEPLOY_FAUCET=true`) y con saldo ≥ `amount`
  (`packages/contracts/script/Deploy.s.sol:87`, `Faucet.sol:52`); en la web, `NEXT_PUBLIC_FAUCET_ADDRESS`
  definida (`apps/web/src/config/chain.ts:29`), wallet conectada y en la red correcta
  (`apps/web/src/components/wallet/FaucetButton.tsx:32`).
- **Disparador.** El tester pulsa «Conseguir ETH de prueba» (`FaucetButton.tsx:64`) o se llama
  `dispense()` desde consola/script (`Faucet.sol:45`).
- **Postcondición.** El saldo de la wallet sube **exactamente** `amount`, se sella
  `lastDispensedAt[wallet]` con el `block.timestamp` y queda registrado el evento
  `FaucetDispensed` (`Faucet.sol:54`, `:55`).
- **Dónde vive.** Contrato `packages/contracts/src/Faucet.sol:13`; despliegue
  `packages/contracts/script/Deploy.s.sol:117`; lógica pura `packages/shared/src/domain/faucet.ts:29`;
  hook `apps/web/src/components/wallet/useFaucet.ts:56`; botón
  `apps/web/src/components/wallet/FaucetButton.tsx:25`; ABI `packages/shared/src/abi/faucet.ts:4`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. **Habilitación por configuración.** La web lee `NEXT_PUBLIC_FAUCET_ADDRESS` y expone
   `faucetAddress`, que es `null` si la variable falta (`apps/web/src/config/chain.ts:29`). Sin
   dirección, el hook devuelve un estado inerte (`useFaucet.ts:57`, `:139`) y el botón no se pinta
   (`FaucetButton.tsx:32`).
2. **Puntos de entrada en la interfaz.** El botón se monta en la barra de wallet
   (`apps/web/src/components/wallet/WalletBar.tsx:86`), en el menú de wallet
   (`apps/web/src/components/wallet/WalletMenu.tsx:219`) y dentro del aviso de saldo insuficiente de
   la compra (`apps/web/src/components/buy/BuyButton.tsx:154`, `:156`).
3. **Lectura del estado on-chain.** El hook consulta `availableAt(address)`
   (`useFaucet.ts:62`), `lowBalance()` (`useFaucet.ts:71`), `amount()`
   (`useFaucet.ts:79`) y el saldo del propio faucet (`useFaucet.ts:87`).
4. **Reloj de cliente.** `Date.now()` se evalúa dentro de un efecto y se refresca cada 30 s para
   evitar desajustes de hidratación (`useFaucet.ts:100`, `:103`).
5. **Estado derivado.** `deriveFaucetAvailability` decide entre `ready`, `cooldown` (con el epoch de
   disponibilidad) o `empty` (`packages/shared/src/domain/faucet.ts:29`, `useFaucet.ts:116`).
   `empty` tiene prioridad sobre `cooldown` (`faucet.ts:33`).
6. **Habilitación del botón.** `canDispense` exige faucet habilitado, wallet conectada, estado `ready`
   y ninguna transacción en curso (`useFaucet.ts:132`).
7. **Firma.** Al pulsar, `dispense()` llama a `writeContract` con la función `dispense` del ABI
   (`FaucetButton.tsx:64`, `useFaucet.ts:134`, `:136`).
8. **Ejecución on-chain.** El contrato comprueba el cooldown (`Faucet.sol:49`), comprueba que tiene
   saldo (`Faucet.sol:52`), **primero** actualiza `lastDispensedAt` y emite el evento
   (`Faucet.sol:54`, `:55`) y **después** transfiere el ETH (`Faucet.sol:57`).
9. **Retroalimentación en pantalla.** `deriveTxStatus` traduce firma/minado/recibo
   (`useFaucet.ts:107`) y el botón anuncia el resultado por `aria-live="polite"`
   (`FaucetButton.tsx:41`, `:75`).
10. **Despliegue y financiación.** `Deploy.s.sol` lee `DEPLOY_FAUCET`, `FAUCET_AMOUNT_WEI`,
    `FAUCET_COOLDOWN_SECONDS`, `FAUCET_LOW_THRESHOLD_WEI` y `FAUCET_FUND_WEI`
    (`Deploy.s.sol:87`–`:91`), instancia el faucet y lo financia si procede (`Deploy.s.sol:117`–`:123`).
11. **Propagación al front.** La dirección solo se escribe en el JSON si existe
    (`Deploy.s.sol:150`), el esquema la admite como opcional (`deployments/schema.ts:15`) y
    `sync-deployment.ts` la propaga (`packages/contracts/scripts/sync-deployment.ts:86`, `:96`).

### 2.2 Validaciones

- **Cooldown por wallet.** Si `lastDispensedAt[to] != 0` y `block.timestamp < last + cooldown`,
  revierte con `FaucetCooldownActive(to, last + cooldown)` (`Faucet.sol:48`–`:51`).
- **Saldo del faucet.** Si `address(this).balance < amount`, revierte con
  `FaucetInsufficientBalance` (`Faucet.sol:52`).
- **Configuración.** El constructor rechaza `amount == 0` con `InvalidConfig`
  (`Faucet.sol:30`); los valores por defecto de desarrollo son 30 ETH, 86 400 s y 150 ETH
  (`Deploy.s.sol:33`–`:35`), espejo de las constantes `FAUCET_AMOUNT_WEI`,
  `FAUCET_COOLDOWN_SECONDS` y `FAUCET_LOW_THRESHOLD_WEI` (`packages/shared/src/constants.ts:60`,
  `:66`, `:67`).
- **Guardas de interfaz.** El botón desaparece si el faucet no está configurado, no hay wallet o la
  red es incorrecta (`FaucetButton.tsx:32`); además se deshabilita si no puede dispensar
  (`FaucetButton.tsx:65`).
- **Lectura del revert.** `decodeCooldownAvailableAt` recorre la cadena de `cause` de viem y extrae
  el `availableAt` del revert de cooldown (`faucet.ts:70`); el hook lo usa para mostrar «disponible a
  las HH:MM» sin releer (`useFaucet.ts:149`, `FaucetButton.tsx:49`).

### 2.3 Efectos on-chain / persistencia

- **Escritura única.** `lastDispensedAt[account]` (mapping público, `Faucet.sol:18`) queda sellado con
  el timestamp del bloque (`Faucet.sol:54`); se expone por getter y por `availableAt`
  (`Faucet.sol:62`).
- **Transferencia con reverts atómicos.** Si el receptor rechaza el ETH, revierte con
  `EthTransferFailed` y **no** queda marcado el cooldown porque el efecto se deshace
  (`Faucet.sol:58`, prueba `packages/contracts/test/Faucet.t.sol:113`–`:119`).
- **Eventos.** `FaucetDispensed(address indexed to, uint256 amount)` y
  `FaucetFunded(address indexed from, uint256 amount)` (`Faucet.sol:20`, `:21`).
- **Sin persistencia off-chain.** Este CU no escribe en base de datos, no pasa por el worker ni
  encola avisos: no hay `apps/worker` ni `apps/mcp` implicados (búsqueda sin resultados para
  `faucet` en `apps/worker/src` y `apps/mcp/src`).
- **Salida de fondos del operador.** `fund()` y `receive()` aceptan ETH y emiten `FaucetFunded`
  (`Faucet.sol:36`, `:40`); `drain(address)` devuelve el sobrante y es `onlyOwner`
  (`Faucet.sol:73`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Ubicación |
|----------|-----------|
| `dispense()` (paga `amount` a `msg.sender`) | `packages/contracts/src/Faucet.sol:45` |
| `availableAt(address)` (vista) | `packages/contracts/src/Faucet.sol:62` |
| `lowBalance()` (vista, RNF-17) | `packages/contracts/src/Faucet.sol:68` |
| `amount()` / `cooldown()` / `lowThreshold()` (inmutables) | `packages/contracts/src/Faucet.sol:14`–`:16` |
| `lastDispensedAt(address)` (mapping público) | `packages/contracts/src/Faucet.sol:18` |
| `fund()` / `receive()` | `packages/contracts/src/Faucet.sol:40`, `:36` |
| `drain(address)` (`onlyOwner`) | `packages/contracts/src/Faucet.sol:73` |
| ABI exportado `faucetAbi` | `packages/shared/src/abi/faucet.ts:4` |
| Hook de UI `useFaucet()` | `apps/web/src/components/wallet/useFaucet.ts:56` |
| Envío de la transacción | `apps/web/src/components/wallet/useFaucet.ts:134` |

**No existe endpoint HTTP ni ruta `api/` para el faucet.** La escritura se firma desde el navegador
con wagmi (`useFaucet.ts:136`); el despliegue y la financiación van por `forge script`
(`Deploy.s.sol:65`).

### 4.2 Eventos y errores canónicos

- `FaucetDispensed(address indexed to, uint256 amount)` — `packages/contracts/src/Faucet.sol:20`.
- `FaucetFunded(address indexed from, uint256 amount)` — `Faucet.sol:21`.
- `FaucetCooldownActive(address account, uint256 availableAt)` — `Faucet.sol:23`.
- `FaucetInsufficientBalance()` — `Faucet.sol:24`.
- `InvalidConfig()` — `Faucet.sol:25`; `EthTransferFailed()` — `Faucet.sol:26`;
  `ZeroAddress()` — `Faucet.sol:27`.

### 4.3 Estructuras de datos y almacenamiento

- Storage on-chain: un `mapping(address => uint256) lastDispensedAt` y tres inmutables
  (`amount`, `cooldown`, `lowThreshold`) — `Faucet.sol:14`–`:18`.
- Tipos de la lógica pura: `FaucetAvailability` (`ready` / `cooldown` / `empty`) y `FaucetSnapshot`
  (`availableAt`, `isLow`, `isEmpty`) — `packages/shared/src/domain/faucet.ts:11`, `:16`.
- Registro de despliegue: clave `faucet` **opcional** en `deployments/<chainId>.json`
  (`packages/shared/src/deployments/schema.ts:15`), presente en desarrollo
  (`packages/contracts/deployments/31337.json:5`).
- Configuración de la web: `NEXT_PUBLIC_FAUCET_ADDRESS` (`.env.example:109`), inyectada en el build
  (`Dockerfile:40`); en la nube de referencia se deja vacía (`infra/docker/cloudbuild.yaml:16`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|-----------|------------------|--------------------|
| Segunda petición antes de 24 h | `FaucetCooldownActive(account, availableAt)` | `Faucet.sol:50` |
| Faucet sin saldo para una dispensación | `FaucetInsufficientBalance()` | `Faucet.sol:52` |
| El receptor rechaza el ETH | `EthTransferFailed()` | `Faucet.sol:58` |
| Configuración con `amount = 0` | `InvalidConfig()` | `Faucet.sol:30` |
| `drain` a la dirección cero | `ZeroAddress()` | `Faucet.sol:74` |
| `drain` sin ser owner | `OwnableUnauthorizedAccount` (OpenZeppelin) | `Faucet.sol:73` |
| Faucet no configurado en la web | Se devuelve estado inerte y el botón no se pinta | `useFaucet.ts:57`, `FaucetButton.tsx:32` |
| Wallet desconectada o en otra red | El botón no se pinta | `FaucetButton.tsx:32` |
| Faucet por debajo de `amount` | Estado `empty` + «Faucet sin fondos» | `faucet.ts:33`, `FaucetButton.tsx:36`, `:46` |
| Cooldown activo en la web | «Vuelve a intentarlo a partir de las {time}» | `FaucetButton.tsx:48` |
| Revert de cooldown con tx ya enviada | Se decodifica `availableAt` y se muestra la hora | `useFaucet.ts:149` |

## 6. Pruebas y evidencia

- **Contrato.** `packages/contracts/test/Faucet.t.sol`: dispensa exacta y evento
  (`:40`), cooldown bloqueado a las 23 h 59 m y permitido a las 24 h (`:52`), saldo insuficiente
  (`:70`), bandera de saldo bajo (`:77`), constructor con `amount = 0` (`:84`), `fund` y `receive`
  (`:90`, `:102`), receptor hostil (`:113`) y `drain` a dirección cero (`:121`).
- **Despliegue.** `packages/contracts/test/Deploy.s.t.sol:148` verifica que el faucet se registra y
  queda financiado solo cuando `deployFaucet = true`; `:109` comprueba que **no** se registra sin
  pedirlo.
- **Lógica pura.** `packages/shared/src/domain/faucet.test.ts:19` (disponibilidad), `:43` (segundos
  restantes), `:53` (formato `mm:ss`/`hh:mm:ss`) y `:68` (`decodeCooldownAvailableAt`).
- **Servidor de salud genérico.** `packages/shared/src/health/health.test.ts:41` usa un provider de
  ejemplo con `component: "faucet"`, pero es una prueba del servidor reutilizable, no del faucet.
- **No cubierto.** No hay test de componente de `FaucetButton.tsx`/`useFaucet.ts` ni E2E que use los
  `data-testid="faucet"`, `"faucet-dispense"` o `"faucet-status"` (`FaucetButton.tsx:60`, `:63`,
  `:73`). TC-CT-102 solo está cubierto en parte por `test_LowBalanceFlag` (bandera, no bloqueo de UI).

## 7. Pendiente de confirmar

- **`/health` del faucet (RNF-17).** El servidor reutilizable admite un provider de faucet
  (`packages/shared/src/health/index.ts:32`, `packages/shared/src/domain/types.ts:21`), pero
  **ningún proceso lo arranca**: solo el worker y el MCP. El único indicador es `lowBalance()`
  (`Faucet.sol:68`), que no se publica por HTTP.
- **Alerta de saldo bajo sin consumidor visible.** `isLow` se lee (`useFaucet.ts:71`) pero
  `FaucetButton` no lo pinta: el texto «sin fondos» salta con `balance < amount`, no con
  `balance < lowThreshold`.
- **Nomenclatura de la fuente.** El Gherkin dice `FAUCET_AMOUNT`/`FAUCET_COOLDOWN`
  (`docs/CASOS-DE-USO.md:970`); el código usa `FAUCET_AMOUNT_WEI`/`FAUCET_COOLDOWN_SECONDS`
  (`packages/shared/src/constants.ts:60`, `:66`).
- **Prefinanciación por script.** `packages/contracts/scripts/seed.ts:6` anuncia prefinanciación de
  wallets por faucet, pero el propio fichero la deja para más adelante (`seed.ts:36`–`:38`): no hay
  script que llame a `dispense()`.
- **Trazabilidad de la env del front.** `sync-deployment.ts:86` propaga la dirección al JSON de
  despliegue, pero no se ha localizado el paso que escribe `NEXT_PUBLIC_FAUCET_ADDRESS` en `.env`
  (figura puesta a mano en `.env:45` y `.deploy-logs/env.deploy:45`).
- **Garantía de «nunca en producción».** Se sostiene por configuración (`DEPLOY_FAUCET` por defecto
  `false` en `Deploy.s.sol:87` y variable vacía en `infra/docker/cloudbuild.yaml:16`), no por un
  guardia en el contrato.
- **Propiedad del faucet.** El owner es el EOA desplegador (`Ownable(msg.sender)`, `Faucet.sol:29`),
  mientras RNF-13 pide multifirma en producción; no hay owner distinto configurable.
