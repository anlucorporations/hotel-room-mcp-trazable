# 02 · Instalación desde cero (Windows)

> **Entorno de referencia**: Windows, sin Docker (no está instalado en la máquina del equipo; el
> `docker-compose.yml` del repositorio está **desalineado** —declara PostgreSQL 16 frente al 18 real—
> y se conserva solo como referencia).
> **Resultado esperado**: `/health/ready` responde **200** con `postgres`, `redis` y `polygonRPC` en `UP`.
> **Fuentes**: [`../../entornos_globales.md`](../../entornos_globales.md), [`.env.example`](../../../.env.example),
> [`docs/PLAN-CONSTRUCCION.md`](../../../docs/PLAN-CONSTRUCCION.md) §4 (hito M0).

## 0. Requisitos previos

| Requisito | Versión mínima | Comprobación |
|---|---|---|
| Node | **≥ 24** | `node --version` |
| pnpm | **10** (`pnpm@10.32.1` fijado en `package.json`) | `pnpm --version` |
| PostgreSQL | **18** | `psql --version` |
| Redis-compatible | **≥ 5** (probado con Memurai 4.1.2 / `redis_version 7.2.5`) | ver §4 |
| Foundry | `forge`, `anvil`, `cast` (probado con v1.7.2) | `forge --version` |
| Git | cualquiera reciente | `git --version` |

Puertos que deben quedar libres: **8545** (Anvil), **5432** (PostgreSQL), **6379** (Redis), **3000**
(web), **8787** (worker), **8788** (MCP).

## 1. Clonar el repositorio

1. Clona el remoto de trabajo:

   ```powershell
   git clone https://gitlab.codecrypto.academy/anlucorporations/hotel-room-mcp-trazable.git
   cd hotel-room-mcp-trazable
   ```

2. Comprueba que estás en la rama de trabajo (`main`):

   ```powershell
   git status
   ```

3. Aplica la regla del proceso: **no hagas `push` sin orden explícita del responsable**. El token que
   estuvo embebido en la URL del remoto `gitlab-public` se retiró del repositorio; su revocación en
   GitLab sigue pendiente del responsable (bloqueante **B-0**).

## 2. Instalar dependencias

1. Instala todo el workspace (pnpm workspaces + turbo):

   ```powershell
   pnpm install
   ```

2. Instala los binarios de Foundry si no están:

   ```powershell
   forge --version; anvil --version; cast --version
   ```

## 3. PostgreSQL 18: rol, base y extensión

1. Entra como superusuario y crea el rol de la aplicación:

   ```powershell
   psql -U postgres -c "CREATE ROLE hotel_admin LOGIN PASSWORD '<clave>';"
   ```

2. Crea la base con ese rol como propietario:

   ```powershell
   psql -U postgres -c "CREATE DATABASE hotel_nft_dev OWNER hotel_admin;"
   ```

3. Crea la extensión **como superusuario** (la necesita el esquema para `gen_random_uuid()`):

   ```powershell
   psql -U postgres -d hotel_nft_dev -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
   ```

4. Comprueba la conexión **con el DSN exacto de la aplicación**:

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "\dt"
   ```

   La base arranca vacía: las tablas las crea el worker al arrancar (§7).

> El rol de la aplicación **no tiene `CREATEDB`**: la verificación de recuperación restaura en un
> esquema de la misma base (declarado en [`../../evidencias/dr-verify.json`](../../evidencias/dr-verify.json)).

## 4. Redis-compatible en Windows

1. En esta máquina el servidor es **Memurai Developer** (compatible con Redis 7.x), extraído del MSI
   oficial con `msiexec /a` porque el instalador falla en su comprobación de puerto. Arranca con el
   guion del repositorio (ASCII puro, a propósito):

   ```powershell
   pwsh scripts/dev/start-redis.ps1
   ```

2. Comprueba que responde y qué versión sirve:

   ```powershell
   & "$env:USERPROFILE\memurai\Memurai\memurai-cli.exe" ping
   & "$env:USERPROFILE\memurai\Memurai\memurai-cli.exe" info server
   ```

3. Para detenerlo:

   ```powershell
   pwsh scripts/dev/start-redis.ps1 -Stop
   ```

**No instales el paquete `Redis.Redis` de winget**: es la versión **3.0.504** y BullMQ 6 exige mínimo
**5.0.0** (recomendado 6.2.0). Sin un Redis ≥ 5 la cola única y la blocklist de JWT **no arrancan**.

## 5. Anvil: la red canónica

1. Arranca la cadena local en la red canónica (bloque cada 2 s):

   ```powershell
   anvil --chain-id 81234 --block-time 2
   ```

2. Verifica en otra terminal:

   ```powershell
   cast chain-id --rpc-url http://127.0.0.1:8545
   cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545
   ```

   Debe devolver `81234` y 10.000 ETH en la cuenta 0. **Reiniciar Anvil borra el estado**; la
   dirección del contrato vuelve a ser la determinista, pero el contenido **no**.

## 6. Crear el `.env`

1. Copia la plantilla (copia de bytes, no reescribas el fichero):

   ```powershell
   Copy-Item .env.example .env
   ```

2. Genera los secretos obligatorios. Para cada uno de `JWT_SECRET`, `SESSION_SECRET`,
   `TICKET_SIGNING_SECRET` y `MCP_SHARED_SECRET`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Y para `AES_SECRET_KEY` y `CHECKIN_SECRET_KEY` (hexadecimal de **32 bytes = 64 caracteres**), el
   mismo comando sirve; pega el resultado en la variable correspondiente.

3. Rellena, como mínimo, las variables marcadas `[OBLIGATORIA]`:
   `CHAIN_ID=81234`, `RPC_URL=http://127.0.0.1:8545`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
   `AES_SECRET_KEY`, `CHECKIN_SECRET_KEY`, `TICKET_SIGNING_SECRET`, `SESSION_SECRET`, y
   `CONTRACT_ADDRESS` / `NEXT_PUBLIC_CONTRACT_ADDRESS` (se rellenan al desplegar, §8).

4. Detalle completo, grupo a grupo, en
   [01 · Variables de entorno](01-variables-de-entorno.md).

> **Copiar `.env.example` sin más NO arranca el sistema**: la validación *fail-fast* (zod) rechaza la
> configuración y `requireSecret` lanza `MissingSecretError` (CWE-798). Eso es el comportamiento
> correcto, no un fallo de instalación.

## 7. Migraciones

Las migraciones **se aplican solas al arrancar**: `runMigrations()` es incremental e idempotente y se
ejecuta en cerrado al inicio del worker y de la web. No hay comando de migración aparte.

1. Arranca el worker una primera vez para que cree las 13 tablas:

   ```powershell
   pnpm --filter @hotel/worker dev
   ```

2. Comprueba en otra terminal que el esquema está aplicado:

   ```powershell
   psql "postgresql://hotel_admin:<clave>@127.0.0.1:5432/hotel_nft_dev" -c "\dt"
   ```

   Deben aparecer 13 tablas: `nfts`, `listings`, `sale_events`, `admin_users`, `admin_sessions`,
   `mfa_recovery_codes`, `email_notifications`, `push_subscriptions`, `checkin_contingency_logs`,
   `worker_checkpoints`, `worker_processed_logs`, `worker_aggregate_counters`, `worker_sale_history`.
   Detalle del esquema y del orden de las migraciones: [02 · Base de datos](02-base-de-datos.md).

## 8. Despliegue del contrato y sincronización del registro

1. Sitúate en `packages/contracts` y despliega el contrato canónico **con bootstrap de roles**:

   ```powershell
   cd packages/contracts
   forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --slow
   ```

   El script lee `DEPLOYER_PRIVATE_KEY` y, opcionalmente, `ADMIN_ADDRESS`, `TREASURY_ADDRESS`,
   `MINTER_ADDRESS`, `RECEPTION_ADDRESS`, `PAUSER_ADDRESS`, `BURNER_ADDRESS`, `TREASURER_ADDRESS`,
   `MIN_LISTING_PRICE`, `DEPLOY_FAUCET` y los `FAUCET_*`. El faucet **solo** se despliega si
   `DEPLOY_FAUCET=true` (ADR-13). Al terminar, el EOA desplegador **renuncia** a
   `DEFAULT_ADMIN_ROLE` si el admin es otra cuenta.

2. Vuelve a la raíz y sincroniza el registro validado por esquema:

   ```powershell
   cd ../..
   pnpm --filter @hotel/contracts sync
   ```

   Genera `packages/shared/deployments/<chainId>.json` con `address`, `deploymentBlock` y `abiHash`.

3. Copia en `.env` la dirección y el bloque que acaba de escribir el registro:

   ```
   CONTRACT_ADDRESS=0x…
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x…
   NEXT_PUBLIC_DEPLOYMENT_BLOCK=<deploymentBlock>
   NEXT_PUBLIC_FAUCET_ADDRESS=0x…   # solo si se desplegó el faucet
   ```

   Procedimiento completo, con verificación por `cast`: [03 · Despliegue y redespliegue](../03-operacion/01-despliegue-y-redespliegue.md).

## 9. Aprovisionar operadores

1. Crea (o rota) el operador de administración; el comando imprime el `otpauth://` y los códigos de
   rescate **una sola vez**:

   ```powershell
   pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es
   ```

2. Crea el operador de recepción:

   ```powershell
   pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
   ```

3. Guarda la semilla en tu aplicación TOTP. En la base solo quedan el **hash bcrypt** y la **semilla
   TOTP cifrada con AES-256-GCM**. Si no pasas `--password`, se genera una aleatoria fuerte y se
   imprime.

## 10. Arrancar los servicios y comprobar

Orden recomendado: **infraestructura → worker → web → MCP → monitor**.

```powershell
pnpm --filter @hotel/worker dev      # aplica migraciones; HTTP en 8787
pnpm --filter @hotel/web dev         # 3000
pnpm --filter @hotel/mcp dev         # 8788
pnpm --filter @hotel/monitor dev     # sondeador
```

Comprobación final:

```powershell
curl.exe http://127.0.0.1:3000/health/ready
curl.exe http://127.0.0.1:8787/health
```

- `/health/ready` debe devolver **200** con `{"status":"READY","components":{"postgres":"UP","redis":"UP","polygonRPC":"UP"}}`.
  Si algo está caído, devuelve **503** con `status: "DEGRADED"` y el detalle por componente.
- `/health` del worker debe devolver `{"status":"ok", …, "lag": 0}`. `emailDegraded: true` es esperado
  mientras no haya proveedor SMTP configurado (`SMTP_PASS` vacío).

## 11. Comprobaciones de calidad antes de dar por buena la instalación

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

Referencia de cierre de M8: `typecheck` 6/6, `lint` 6/6 (0 errores), `test` 7/7 tareas con 835 pruebas.
No ejecutes dos suites a la vez en el mismo workspace.

---

*Siguiente: [Variables de entorno](01-variables-de-entorno.md) · [Base de datos](02-base-de-datos.md)*
