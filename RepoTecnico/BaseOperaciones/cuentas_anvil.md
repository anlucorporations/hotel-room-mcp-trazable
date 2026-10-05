# Cuentas del entorno · Anvil local (chain-id 81234)

> Generado por `@InyectaDatos` · Paso 3 (consulta con `cast`) · 2026-02-27
> RPC: `http://localhost:8545` · Anvil arrancado con `--chain-id 81234 --block-time 2`
> (Anvil no estaba en marcha; se levantó una instancia limpia — ver §4).

## 1. Cuentas activas en Anvil (consulta real con `cast`)

Anvil expone **10 cuentas deterministas**, cada una con 10.000 ETH. Las relevantes
para el proyecto son las **4 primeras** (cuentas internas / hot-wallets):

| Cuenta | Dirección | Balance | Nonce | Uso en el proyecto |
|---|---|---|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 10.000 ETH | 0 | **Desplegador** (`DEPLOYER_PRIVATE_KEY`) + tesorería destino de `withdrawFunds` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 10.000 ETH | 0 | Hot-wallet MINTER (`MINTER_RELAYER_PRIVATE_KEY`); rol tras redespliegue |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 10.000 ETH | 0 | Hot-wallet BURNER (`BURNER_BOT_PRIVATE_KEY`); `BURNER_ROLE` **concedido el 2026-10-05** en el contrato vigente |
| 3 | `0x90F79bf6EB2c4f870365e785982E1f101e93b906` | 10.000 ETH | 0 | Hot-wallet RECEPTION (`RECEPTION_WALLET_PRIVATE_KEY`); rol tras redespliegue |
| 4–9 | *(resto del pool determinista)* | 10.000 ETH | 0 | **Huéspedes/compradores simulados** (aprobado, Paso 4) |

Comandos usados:

```bash
cast chain-id --rpc-url http://localhost:8545        # → 81234
cast rpc eth_accounts --rpc-url http://localhost:8545
cast balance <cuenta> --ether --rpc-url …            # → 10000 ETH
cast nonce  <cuenta> --rpc-url …                     # → 0
cast code 0x5fbdb2315678afecb367f032d93f642f64180aa3 --rpc-url …  # → 0x (sin código, §4)
```

## 2. Mapa teórico de cuentas internas (según documentación vigente)

Lo que exige la arquitectura (una hot-wallet = un solo rol, [ADR de separación
de funciones](../Manuales/04-mantenimiento/01-seguridad.md)):

| Hot-wallet | Variable de entorno | Rol on-chain | Función interna |
|---|---|---|---|
| Desplegador | `DEPLOYER_PRIVATE_KEY` | — (renuncia tras *handover*) | Despliega `HotelNights`; dirección `treasury()` |
| Minter relayer | `MINTER_RELAYER_PRIVATE_KEY` | `MINTER_ROLE` | Firma el mint on-chain del back-office |
| Burner bot | `BURNER_BOT_PRIVATE_KEY` / `BURNER_WALLET_PRIVATE_KEY` | `BURNER_ROLE` | `burnExpired` programado (12:00 Europe/Madrid) |
| Recepción | `RECEPTION_WALLET_PRIVATE_KEY` | `RECEPTION_ROLE` | Firma `markCheckedIn` (ancla del check-in) |
| *(Opcional)* Gnosis Safe | `GNOSIS_SAFE_ADDRESS` | — | Multisig 2-of-3, pendiente B-7, sin desplegar |

## 3. Verificación de coherencia `.env` ↔ Anvil en marcha ✅

Derivada la dirección pública de cada clave con `cast wallet address`, el `.env`
**coincide exactamente** con las cuentas 0–3 de esta cadena Anvil:

| Variable | Clave (prefijo) | Dirección derivada | Cuenta Anvil |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | `ac0974be…` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | ✅ 0 |
| `MINTER_RELAYER_PRIVATE_KEY` | `59c6995e…` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | ✅ 1 |
| `BURNER_BOT_PRIVATE_KEY` = `BURNER_WALLET_PRIVATE_KEY` | `5de4111a…` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | ✅ 2 |
| `RECEPTION_WALLET_PRIVATE_KEY` | `7c852118…` | `0x90F79bf6EB2c4f870365e785982E1f101e93b906` | ✅ 3 |

> **Corrección documental aplicada.** La documentación previa
> ([01-variables-de-entorno.md:37-39](../Manuales/02-instalacion/01-variables-de-entorno.md))
> mostraba los *prefijos de las claves privadas* (`0x59c6995e…690d`, etc.) como si
> fueran *direcciones*, lo que inducía a error: la dirección real de la cuenta 1 es
> `0x7099…79C8`, no `0x59c6…690d`. El manual ya está corregido. **No hubo que
> tocar `.env`** (decisión A resuelta sin cambios).

## 4. Estado operativo (tras la inyección · 2026-02-27)

- **Contrato desplegado** en la cadena actual: `0x5FbD…0aa3` (bloque 20), roles
  verificados con `cast`: tesorería en cuenta 0; DEFAULT_ADMIN/MINTER/PAUSER/TREASURER
  en cuenta 1; BURNER en cuenta 2; RECEPTION en cuenta 3; **desplegador revocado**.
- **Faucet** desplegado y financiado con 100 ETH: `0x0165…Eb8F`.
- **Huéspedes 4–9** financiados con 20 ETH de gas cada uno.
- Redis 7.0.15 operativo en `:6379` (sin root: `.deb` extraído en `/tmp/redis7`,
  lanzador `/tmp/redis7/start-redis.sh`).
- PostgreSQL 16 operativo en `:5432` (mismo método: `/tmp/pg16`; cluster
  `/tmp/pgdata`; rol `hotel_admin` + BD `hotel_nft_dev` creados según B-1).
- ⚠️ **Estos servicios no sobreviven a un apagón del entorno**: tras reinicio hay
  que volver a levantar anvil/redis/postgres y redesplegar (`pnpm deploy:local`
  con las variables de roles del despliegue + `pnpm sync`).

## 5. Cuentas NO internas (fuera del alcance de este documento)

- Operadores del hotel (`admin@hotel.es`, `recepcion@hotel.es`): sesiones de BD
  con contraseña + TOTP, sin wallet. Ver
  [casos_uso_incremento.md](../incremento_v3/casos_uso_incremento.md).
- Huéspedes: wallets externas cualesquiera (compra anónima).
- Anvil expone 10 cuentas: las 4–9 sobrantes son candidatas a simular
  huéspedes/compradores en la inyección (Paso 5).

## 6. Resultado de la inyección (2026-02-27 · Pasos 4–6)

| Operación | Cuenta firmante | Resultado |
|---|---|---|
| Registro de habitaciones (`registerRoom`) | 1 (DEFAULT_ADMIN) | 50/50 ✅ |
| Mint de 6 noches (simple/doble/suite) | 1 (MINTER) | 6 ✅ |
| Ventas primarias | huéspedes 4–9 | 6 ✅ |
| Reventa 0.15 ETH (cuenta 7 → cuenta 4) | 7 lista, 4 compra | 1 ✅ |
| Royalty de reventa (5 % habitación doble) | — | 0.0075 ETH retenidos; vendedor acumula 0.1425 ETH en `pendingWithdrawals` ✅ |
| Check-ins anclados (`markCheckedIn`) | 3 (RECEPTION) | 2 ✅ |
| Quema (`burnExpired`) | 2 (BURNER) | ⏸ omitida: requiere noches caducadas (tiempo de cadena); pendiente en demo |

Adaptación del guion: `packages/contracts/scripts/dev-accounts.ts` (pool por índice
0–9) e `inject-data.ts` (matriz de roles y huéspedes 4–9); manuales `docs/inyeccion-datos.md`
y `RepoTecnico/Manuales/01-arquitectura/01-monorepo.md` alineados. Credenciales de
operadores entregadas fuera del repositorio (`/tmp/operadores-inyeccion-local.txt`).

---

## Quema programada — estado verificado (2026-10-05)

**Antes de este ciclo la quema NO se ejecutaba en el despliegue**: el worker no tenía ninguna
variable de quema, así que `startBurnSchedulerIfConfigured` devolvía `null` y el planificador ni
siquiera arrancaba (solo quedaba un aviso en los logs).

| Pieza | Estado |
|---|---|
| `BURNER_ROLE` | Concedido a la **cuenta 2** (hot-wallet documentada) el 2026-10-05, tx `0x10a4fcff…` (bloque 486). Antes lo tenía el desplegador |
| Clave del quemador | Secreto `hotel-burner-private-key` (Secret Manager) con `secretAccessor` para `hotel-mcp-run@` y `ci-deployer@` |
| Worker | `BURNER_WALLET_PRIVATE_KEY` (secreto) + `BURN_HOUR_LOCAL=12`, `BURN_TIMEZONE=Europe/Madrid`, `BURNER_MIN_BALANCE_NATIVE=1` |
| Cadencia | **Diaria a las 12:00 Europe/Madrid** (hora de salida), con cerrojo `hotel:burn:day:<día>`; `BURN_INTERVAL_MS` solo se usó para verificar y se retiró |
| Evidencia del ciclo | 2026-10-05 19:42:44 · `planificador de quema: ciclo terminado` → `reason: NO_TOKENS` · `[Burner] No hay noches impagas caducadas pendientes de quema.` |
| Operador | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (cuenta 2), saldo 10.000 ETH (umbral 1) |

**Candidatas a quema**: `nfts` con `status = 'AVAILABLE'` y `check_in_date < hoy` (el reloj del ciclo
es el **de la cadena**, que es el que decide la caducidad en el contrato). Las 7 noches caducadas que
existían (2026-09-28 → 2026-10-04) **ya estaban quemadas**; hoy no hay ninguna viva con fecha pasada.

> **Pendiente de gobierno**: el desplegador (cuenta 0) **sigue conservando** `BURNER_ROLE` (y el resto).
> Lo correcto según el diseño es revocárselo y dejar el rol solo en la hot-wallet dedicada; no se hizo
> en este ciclo para no tocar otros flujos (mint, pausa, tesorería) a la vez.
