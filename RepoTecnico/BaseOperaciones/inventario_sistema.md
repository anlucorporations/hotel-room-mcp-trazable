# Inventario del sistema — suites, cuentas Anvil y credenciales (versión saneada)

> **Versión para el repositorio, SIN secretos.** La sección 1 (suites) y la 2 (cuentas Anvil) son
> completas; en la 3 se indica **dónde** vive cada credencial, no su valor. El inventario completo
> (con claves y contraseñas en claro) está en `~/.config/hotel-mcp/INVENTARIO-SISTEMA.md`, con
> permisos `600` y **fuera del repositorio**: el proyecto se empuja a tres remotos.

> **FICHERO SENSIBLE.** Contiene **claves privadas y contraseñas en claro**. Vive en
> `~/.config/hotel-mcp/` (permisos `600`) **fuera del repositorio**, a propósito: el repo se empuja a
> tres remotos (gitlab.com, github y codecrypto) y esto nunca debe entrar en git.
>
> Cadena: **Anvil de simulación** (chain-id **31337**), no una red pública. Las claves de Anvil son las
> **deterministas** del entorno de desarrollo (públicas y conocidas): no protegen valor real.
>
> Generado el 2026-10-05 a partir de la cadena viva, del fichero de
> inyección y del `.env`. Si rotas credenciales, **regenera este fichero**.

---

## 1. Estructura de las suites del sistema

Monorepo **pnpm + turbo** (`pnpm test` → `turbo run test`). Cada paquete tiene su runner y sus umbrales
de cobertura; los contratos usan Foundry y el navegador, Playwright.

| Paquete | Runner | Config | Ficheros | Pruebas | Umbrales (st/fn/br/lines) |
|---|---|---|---|---|---|
| `packages/shared` | Vitest | `vitest.config.ts` | 47 | **457** | 78 / 74 / 79 / 78 |
| `apps/web` | Vitest | `vitest.config.ts` | 81 | **697** | 23 / 52 / 73 / 23 |
| `apps/worker` | Vitest | `vitest.config.ts` | 15 | **132** | 79 / 84 / 87 / 79 |
| `apps/mcp` | Vitest | — | 4 | **38** | — |
| `apps/monitor` | Vitest | — | 5 | **34** | — |
| `packages/contracts` | Foundry (`forge test`) | `foundry.toml` | 73 | **141** funciones `test*`/`invariant*` | — |

**Total ejecutable aquí (Vitest): 1 358 pruebas.** Las de contrato **no se ejecutan en este entorno**
(`forge` no está instalado): el recuento es estático sobre `packages/contracts/test`.

### Qué cubre cada suite

- **`packages/shared`** — dominio y datos: `domain/` (token-id, agregados, roles, ventana de catálogo),
  `db/repositories/` (con `pool` simulado), `auth/` (sesiones, MFA, cifrado), `burner/` (servicio de
  quema), `db/reset-plan.test.ts` (clasificación y orden de borrado leyendo `base_datos.sql`) y
  guardianes de invariantes.
- **`apps/web`** — rutas de API (con repositorios simulados), librerías de cliente
  (`lib/`), componentes con rol y saneado, **guardianes**: `images-naming.test.ts`
  (nombres canónicos de imagen), `i18n-keys.test.ts` / `i18n-parity.test.ts` (claves pedidas por el
  código y paridad es/en/ru, incluido el menú lateral), `legacy-target-guardian.test.ts`,
  `nights-sold-guardian.test.ts` (no ofrecer lo que la cadena ya vendió), `burn-candidates.test.ts`
  (no ofrecer noches ya quemadas).
- **`apps/worker`** — indexador y planificadores: `chain-source`, `aggregate-processor/store`,
  `checkpoint-store`, `burn-scheduler`, `mint-window-scheduler`, `preventive-scheduler`,
  `retention-scheduler`, `sale-processor`, `email-consumer`, `health`, `http-server`, `rebind`.
- **`apps/mcp`** — servidor MCP: herramientas, autenticación compartida y saneado de entradas.
- **`apps/monitor`** — monitor de salud (Cloud Run v2): sondeos y alertas.
- **`packages/contracts`** — unitarias y de invariantes de `HotelNights` (roles, pausa, compra
  primaria/reventa, royalty ERC-2981, check-in, quema, caducidad, tesorería, `DateLib`, maestro de
  habitaciones).

### Suites fuera de Vitest

| Suite | Comando | Alcance |
|---|---|---|
| **E2E de navegador (Playwright, chromium)** | `pnpm --filter @hotel/web test:e2e` | `apps/web/e2e/`: `home.spec.ts`, `a11y.spec.ts` (axe), `asistente.spec.ts`, `observabilidad.spec.ts` |
| **E2E de contrato (tsx)** | `pnpm test:e2e:m4|m5|m6|m7|f8` | Ciclos completos sobre Anvil: compra/reventa, check-in, automatizaciones, panel, ventana de acuñado |
| **Carga** | `pnpm test:load` (node) · `pnpm test:load:k6` (k6) | `scripts/load-tests/` |
| **Recuperación ante desastres** | `pnpm test:dr` | `scripts/backup/restore-verify.ts` |
| **Contratos (humo)** | `pnpm --filter @hotel/contracts smoke` | Despliegue + `verify-accounts` |

### Orquestación (CI)

`.github/workflows/ci.yml` y `.gitlab-ci.yml`:

1. **build** — `pnpm install --frozen-lockfile` → `pnpm audit --audit-level=high` → `pnpm build` (turbo:
   shared → apps + forge) → `pnpm typecheck` → `pnpm lint` → `pnpm test` (Vitest + forge) → smoke de
   contratos.
2. **e2e** — build de la web + `playwright install --with-deps chromium` + `test:e2e`.
3. **slither** — análisis estático de los contratos.
4. **perf-nightly** — pruebas de carga programadas.

---

## 2. Cuentas desplegadas en Anvil (descripción detallada)

**Cadena viva**: RPC `https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app` · `eth_chainId` = **31337**
(`0x7a69`) · cliente `anvil/v1.5.1` · contrato **`0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f`**
(`HotelNights`) · bloque de despliegue **314** · `treasury()` = cuenta 0 · `paused()` = false ·
`BURN_BATCH_MAX` = 50.

Las **10 cuentas son las deterministas de Anvil** (semilla `test test … junk`), cada una con 10 000 ETH.
Las claves de abajo se **derivan de esa semilla** (no son un secreto: cualquiera las conoce), pero se
listan porque el entorno las usa como si fueran operativas.

| # | Dirección | Clave privada | Saldo | Roles on-chain (verificados) | Uso |
|---|---|---|---|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | DEFAULT_ADMIN, MINTER, BURNER, TREASURER, RECEPTION, PAUSER · es `treasury()` | Desplegador + **cartera operadora del panel** + tesorería (83 noches de inventario) |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | MINTER | Hot-wallet de acuñación (mint del back-office) |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | BURNER | Hot-wallet de quema (`burnExpired`); 5 noches compradas en la inyección |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `«redactada — ver `.env` del entorno»` | 10 000 ETH | RECEPTION | Hot-wallet de recepción (`markCheckedIn`); 2 noches compradas en la inyección |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |
| 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |
| 7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |
| 8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `«clave derivada de la semilla estándar de Anvil»` | 10 000 ETH | — (huésped) | Huésped simulado |

### Cuáles usa el **sistema** y cuáles son **usuarios**

- **Cuentas del sistema (hot-wallets, 0–3)**:
  - **0** — desplegador, **administrador** (único con `DEFAULT_ADMIN`), tesorería y **cartera con la que
    firma el panel de administración** (evidencia: los 97 `Mint`, 7 `Burn` y 50 `RoomRegistered` de
    esta cadena salieron de la cuenta 0). Conserva todos los roles a propósito: el panel firma con la
    cartera conectada y no hay relayer en la web.
  - **1** — acuñación (`MINTER`), documentada como `MINTER_RELAYER_PRIVATE_KEY`.
  - **2** — quema (`BURNER`); su clave está en el secreto de GCP `hotel-burner-private-key` y es la que
    usa el planificador del worker (12:00 Europe/Madrid).
  - **3** — recepción (`RECEPTION`), para el ancla de check-in.
- **Cuentas de usuario (4–9)**: los **huéspedes/compradores simulados**. No tienen ningún rol y, en los
  datos actuales, ninguna posee noches.
- **Inventario hoy**: cuenta 0 → 83 noches (tesorería); cuenta 2 → 5; cuenta 3 → 2 (compradas en la
  inyección); cuentas 4–9 → 0.

### Gobernanza (estado y pendiente)

Los cambios de rol se firmaron desde la cuenta 0 (que es `DEFAULT_ADMIN`):

| Cambio | Tx | Bloque |
|---|---|---|
| `BURNER_ROLE` → cuenta 2 | `«clave derivada de la semilla estándar de Anvil»` | 486 |
| `MINTER_ROLE` → cuenta 1 | `0xfc912ccd4d…` | 488 |
| `RECEPTION_ROLE` → cuenta 3 | `0xb2ee17ed67…` | 489 |
| `RECEPTION_ROLE` retirado de la cuenta 1 | `0x91de51d96c…` | 490 |

**Pendiente para el mínimo privilegio estricto** (el desplegador sin roles operativos): o el operador
importa las claves de las hot-wallets y conecta la que toca en cada pantalla, o se añade un **relayer
en servidor** que firme las operaciones privilegiadas.

---

## 3. Credenciales de los operadores

### 3.1 Off-chain (usuarios de la plataforma, tabla `admin_users`)

Dos operadores, ambos **activos**, dados de alta el 2026-09-25:

#### Operador `admin@hotel.es` — rol `DEFAULT_ADMIN_ROLE` (owner)

| Campo | Valor |
|---|---|
| Usuario | `admin@hotel.es` |
| Contraseña | `«redactado — ver fichero protegido, línea 84»` |
| Semilla TOTP | `«redactado — ver fichero protegido, línea 86»` |
| URI para el authenticator | `«redactado — ver fichero protegido, línea 85»` |
| Códigos de rescate | `«redactado — ver fichero protegido, línea 87»` |
| QR | `~/.config/hotel-mcp/totp-admin.png` |
| Cartera Anvil | #0 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
| Verificado | Sí: login + TOTP correctos (sesión `DEFAULT_ADMIN_ROLE`) |

#### Operador `recepcion@hotel.es` — rol `RECEPTION_ROLE`

| Campo | Valor |
|---|---|
| Usuario | `recepcion@hotel.es` |
| Contraseña | `«redactado — ver fichero protegido, línea 94»` |
| Semilla TOTP | `«redactado — ver fichero protegido, línea 96»` |
| URI para el authenticator | `«redactado — ver fichero protegido, línea 95»` |
| Códigos de rescate | `«redactado — ver fichero protegido, línea 97»` |
| QR | `~/.config/hotel-mcp/totp-recepcion.png` |
| Cartera Anvil | #1 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 |
| Verificado | Sí: login + TOTP correctos (sesión `RECEPTION_ROLE`) |

> Acceso: `POST /api/auth/login` (usuario + contraseña) y `POST /api/auth/mfa/verify` (código TOTP de 6
> dígitos o un código de rescate). La contraseña **no** se guarda en claro en la base: se verifica con
> `scrypt`; el MFA es obligatorio.

### 3.2 On-chain (carteras y claves)

| Cartera | Dirección | Clave privada | Variable | Rol on-chain |
|---|---|---|---|---|
| Desplegador / operador del panel | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `«clave derivada de la semilla estándar de Anvil»` | `DEPLOYER_PRIVATE_KEY` | `DEFAULT_ADMIN`, `MINTER`, `BURNER`, `TREASURER`, `RECEPTION`, `PAUSER` |
| Hot-wallet de acuñación | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `«clave derivada de la semilla estándar de Anvil»` | `MINTER_RELAYER_PRIVATE_KEY` | `MINTER` |
| Hot-wallet de quema | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `«clave derivada de la semilla estándar de Anvil»` | `BURNER_WALLET_PRIVATE_KEY` / `BURNER_BOT_PRIVATE_KEY` | `BURNER` (en GCP: secreto `hotel-burner-private-key`) |
| Hot-wallet de recepción | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `«redactada — ver `.env` del entorno»` | `RECEPTION_WALLET_PRIVATE_KEY` | `RECEPTION` |

**Emparejamiento operador ↔ cartera que documenta la inyección:** `admin@hotel.es` → cuenta **0**;
`recepcion@hotel.es` → cuenta **1**.

> ⚠️ **Aviso de coherencia**: tras la alineación de roles del 2026-10-05, la cuenta **1** tiene
> `MINTER` (no `RECEPTION`). Si el operador de recepción firma `markCheckedIn` con la cuenta 1, la
> transacción **revertirá** (`AccessControlUnauthorizedAccount`). Hoy funciona quien firme con la
> **cuenta 0**. Opciones: (a) que recepción use la cuenta 0; (b) devolver `RECEPTION` también a la
> cuenta 1; (c) que recepción use la cuenta 3.

### 3.3 Otras credenciales de infraestructura (misma carpeta protegida)

| Fichero | Contenido |
|---|---|
| `~/.config/hotel-mcp/db-password` | Contraseña del usuario de Cloud SQL |
| `~/.config/hotel-mcp/redis-password` | Contraseña de Redis |
| `~/.config/hotel-mcp/DESPLIEGUE-GCP.md` | Notas del despliegue |
| GCP Secret Manager (`hotel-mcp`) | `hotel-database-url`, `hotel-redis-url`, `hotel-jwt-secret`, `hotel-session-secret`, `hotel-aes-secret-key`, `hotel-checkin-secret-key`, `hotel-ticket-signing-secret`, `hotel-mcp-shared-secret`, `hotel-burner-private-key`, `hotel-db-password`, `PGADMIN_PASSWORD` |

---

## 4. Cómo comprobar que esto sigue vigente

```bash
# Roles y cuentas on-chain
pnpm --filter @hotel/contracts exec tsx scripts/verifica-anvil.ts   # (si existe en tu rama)
# Operadores inscritos
curl -s -b cookies.txt https://<web>/api/admin/system/users | jq
# Suites
pnpm test                 # Vitest (shared, web, worker, mcp, monitor) + forge
pnpm --filter @hotel/web test:e2e
```
