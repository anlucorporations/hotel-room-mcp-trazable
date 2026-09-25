# 02 · Contrato de variables de entorno

> **Plantilla normativa**: [`.env.example`](../../../.env.example). Copiar a `.env` (ignorado por Git).
> Cada componente valida con **zod** al arrancar y **falla en cerrado**: si falta una variable marcada
> `[OBLIGATORIA]`, el proceso **no arranca**.
> **Regla**: nunca añadas un valor por defecto en el código para un secreto. `requireSecret()` lanza
> `MissingSecretError` en el primer uso (CWE-798).

## 1. Cómo generar secretos

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `JWT_SECRET`, `SESSION_SECRET`, `TICKET_SIGNING_SECRET`, `MCP_SHARED_SECRET`: cadena aleatoria de
  ≥ 32 caracteres (el hex de 32 bytes da 64).
- `AES_SECRET_KEY` y `CHECKIN_SECRET_KEY`: **hexadecimal de 32 bytes = 64 caracteres** (clave
  AES-256-GCM). Un valor más corto o no hexadecimal **rompe el descifrado**, no el arranque.
- Las claves de Anvil de `.env.example` (cuentas 0-3) son **públicas de prueba**: en cualquier red real
  van a un gestor de secretos. Está prohibido usarlas en producción.

## 2. Cadena y contrato

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `CHAIN_ID` | **Sí** | `81234` | Arranque rechazado si no vale la red canónica |
| `RPC_URL` | **Sí** | `http://127.0.0.1:8545` | Worker, MCP y la web (servidor) no pueden leer la cadena |
| `CONTRACT_ADDRESS` | **Sí** | `0x5fbdb2315678afecb367f032d93f642f64180aa3` | El worker y el MCP no saben qué contrato indexar/consultar |
| `HOTEL_NFT_ADDRESS`, `HOTEL_MARKETPLACE_ADDRESS` | No — **retiradas** | — | Generación **legacy**: fuera del runtime (ADR-02) |
| `RPC_FALLBACK_URL` | No — **retirada** | — | No hay *failover* multi-RPC (ADR-26) |

## 3. Despliegue y wallets

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Sí, para desplegar | `0xac0974…ff80` (cuenta 0 de Anvil) | `forge script` no arranca: `vm.envUint` revienta |
| `MINTER_RELAYER_PRIVATE_KEY` | Sí para el alta de inventario desde back-office | `0x59c6995e…690d` (cuenta 1) | El minteo on-chain no puede firmarse |
| `BURNER_BOT_PRIVATE_KEY` | Sí para la quema | `0x5de4111a…365a` (cuenta 2) | Sin `BURNER_ROLE` operativo la quema no se firma |
| `RECEPTION_WALLET_PRIVATE_KEY` | Sí para el check-in | `0x7c852118…07a6` (cuenta 3) | El check-in falla en cerrado (503 `ANCLAJE_NO_CONFIGURADO`) |
| `GNOSIS_SAFE_ADDRESS` | No (alcance D-11, pendiente B-7) | vacío | No hay multisig: la gobernanza queda en el EOA admin |
| `ADMIN_ADDRESS`, `TREASURY_ADDRESS`, `MINTER_ADDRESS`, `RECEPTION_ADDRESS`, `PAUSER_ADDRESS`, `BURNER_ADDRESS`, `TREASURER_ADDRESS`, `MIN_LISTING_PRICE` | Solo las lee `Deploy.s.sol` | `ADMIN_ADDRESS` = cuenta 1 | Sin ellas los roles recaen por defecto en el **desplegador** |
| `DEPLOY_FAUCET` | No (`false` por defecto) | `true` solo en local | El faucet no se despliega (ADR-13) |
| `FAUCET_AMOUNT_WEI`, `FAUCET_COOLDOWN_SECONDS`, `FAUCET_LOW_THRESHOLD_WEI`, `FAUCET_FUND_WEI` | No | `30 ether` / `86400` / `150 ether` / `100 ether` | Se usan los valores por defecto del contrato |

## 4. Base de datos y Redis

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `DATABASE_URL` | **Sí, sin valor por defecto en el código** | `postgresql://hotel_admin:hotel_secret_2026@127.0.0.1:5432/hotel_nft_dev` | `requireSecret("DATABASE_URL")` aborta el arranque |
| `DATABASE_POOL_MIN` | No | `2` | Se usa el valor por defecto |
| `DATABASE_POOL_MAX` | No (el SRS fija **20**) | `20` | Con 200 peticiones SSR simultáneas el pool se agota: **deuda medida** (31 % de *timeouts*) |
| `REDIS_URL` | **Sí, sin valor por defecto** | `redis://127.0.0.1:6379/0` | La blocklist de JWT y el *rate limiter* no pueden escribir: el arranque falla en cerrado |

## 5. Seguridad y autenticación (ADR-04)

Sistema canónico **único**: contraseña + TOTP obligatorio + JWT de 15 min con rotación de *refresh* y
**blocklist** en Redis. Protege **todas** las rutas `/api/admin/**` y `/api/reception/**`.

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `JWT_SECRET` | **Sí** (≥ 32 caracteres) | hex de 32 bytes | Los tokens no pueden firmarse ni verificarse |
| `AES_SECRET_KEY` | **Sí** (hex de 32 bytes) | hex de 32 bytes | No se puede cifrar/descifrar la semilla TOTP: **nadie entra** |
| `CHECKIN_SECRET_KEY` | **Sí** (hex de 32 bytes) | hex de 32 bytes | Falla el cifrado del secreto de check-in |
| `TICKET_SIGNING_SECRET` | **Sí** (≥ 32 caracteres) | hex de 32 bytes | No se puede emitir el JWS del resguardo |
| `SESSION_SECRET` | **Sí** | hex de 32 bytes | Firma la cookie de sesión (vía secundaria; ya no autoriza el back-office) |
| `SESSION_COOKIE`, `SESSION_TTL_MS` | No | `hotel_admin_session`, `3600000` | Valores por defecto |
| `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION` | No | `900` (15 min), `604800` (7 días) | Valores por defecto |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | No — **pendiente de alinear** | vacío | El código usa **HS256** con `JWT_SECRET`; el SRS describe RS256. Deuda declarada |
| `ADMIN_MFA_SECRET`, `SYSTEM_USERS` | **Retiradas** | — | El minteo re-confirma el TOTP contra la semilla **cifrada del operador autenticado** |

## 6. Web (cliente: se inyectan en la compilación)

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | Sí en la práctica | `81234` | La wallet puede apuntar a otra red |
| `NEXT_PUBLIC_RPC_URL` | Sí | `http://127.0.0.1:8545` | El navegador no lee la cadena |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | **Sí** | misma que `CONTRACT_ADDRESS` | El cliente firma contra una dirección por defecto del código: **no debe ocurrir** |
| `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | **Sí** | `7` | El escaneo de eventos empieza en un bloque equivocado |
| `NEXT_PUBLIC_NETWORK` | No | vacío (Anvil) o `besu` | Etiqueta de red en la interfaz |
| `NEXT_PUBLIC_FAUCET_ADDRESS` | No | `0x0165…Eb8F` | La interfaz del faucet se **oculta** (comportamiento honesto) |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL`, `NEXT_PUBLIC_BLOCK_EXPLORER_NAME` | No | vacío | Anvil no tiene explorador: se degrada declarándolo |
| `NEXT_PUBLIC_MARKETPLACE_ADDRESS` | **Retirada** | — | La compra se unificó en `HotelNights` (ADR-07) |

## 7. Servicios propios

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `WORKER_HOST`, `WORKER_PORT` | No | `127.0.0.1`, `8787` | Valores por defecto del worker |
| `WORKER_BASE_URL` | Sí para la web | `http://127.0.0.1:8787` | La web no puede leer `/aggregates` ni `/history` |
| `MCP_HOST`, `MCP_PORT` | No | `127.0.0.1`, `8788` | Valores por defecto del MCP |
| `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS` | Sí fuera de desarrollo | `127.0.0.1,localhost` · `http://127.0.0.1:3000` | El MCP rechaza peticiones legítimas o queda abierto |
| `MONITOR_TARGETS` | **Sí para el monitor** | `http://127.0.0.1:8787/health,http://127.0.0.1:8788/health` | El monitor no tiene nada que sondear |

## 8. Correo

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | **Sí** | `smtp.sendgrid.net`, `587`, `apikey` | Worker y monitor no arrancan |
| `SMTP_PASS` | No (vacío = sin proveedor) | — | El sistema **arranca**, pero el envío falla y el worker queda con `emailDegraded: true` hasta que la reconciliación lo recupere |
| `SMTP_FROM` | Sí | `"Hotel Marina del Sol <reservas@hotelmarinadelsol.es>"` | Se acepta el formato `Nombre <correo>` vía `env.emailWithDisplay` |
| `OWNER_EMAIL`, `ADMIN_EMAIL` | **Sí** (el worker lee `ADMIN_EMAIL`) | `carlos@hotelmarinadelsol.es` | Los avisos de venta no tienen destinatario |
| `ALERT_EMAIL` | **Sí** (lo lee el monitor) | `devops-alerts@hotelmarinadelsol.es` | Las alertas del monitor no salen |
| `DEVOPS_ALERT_EMAIL` | No | `devops-alerts@hotelmarinadelsol.es` | Destino alternativo de las alertas encoladas por el worker |

## 9. Avisos push (RFC 8291/8292)

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Sí para que el push funcione | par VAPID propio; `"mailto:soporte@hotelmarinadelsol.es"` | El push queda **desactivado y lo registra** (no falla en silencio). Las claves VAPID del repositorio eran inválidas: genera un par nuevo |

## 10. Pases Apple/Google (alcance D-11)

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `APPLE_PASS_TYPE_IDENTIFIER` | No | `pass.es.hotelmarinadelsol.room` | Sin pase de Apple |
| `APPLE_TEAM_IDENTIFIER`, `APPLE_PASS_CERT_BASE64`, `APPLE_PASS_KEY_BASE64` | Sí para emitir el pase | — | Los pases Apple quedan pendientes de credenciales |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `GOOGLE_WALLET_ISSUER_ID` | Sí para el pase de Google | — | Los pases Google quedan pendientes de credenciales |

## 11. Divisas

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `COINGECKO_API_KEY` | No | — | Se usa el respaldo declarado de cotización (ADR-14) |
| `BINANCE_FALLBACK_API_URL` | No | `https://api.binance.com/api/v3/ticker/price` | Respaldo con valor fijo documentado (envejece) |

## 12. Asistente conversacional

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Sí para el asistente | — | **RF-20 no funciona**: dependencia externa de pago no presupuestada |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` | Valor por defecto |
| `MCP_BASE_URL` | Sí para el asistente | `http://127.0.0.1:8788` | La web no alcanza la pasarela MCP |
| `MCP_SHARED_SECRET` | Sí para el asistente | hex de 32 bytes | La web ↔ MCP queda sin secreto compartido |

## 13. Observabilidad

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `LOG_LEVEL` | No | `info` | Valor por defecto |
| `NODE_ENV` | No | `development` | Valor por defecto |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | **Retiradas** | — | Sentry **no** se usa: la observabilidad es logging estructurado JSON (ADR-26) |

## 14. Automatismos (M6)

| Variable | Obligatoria | Ejemplo | Si falta |
|---|---|---|---|
| `BURNER_WALLET_PRIVATE_KEY` | No | cuenta 2 de Anvil | **Vacío = planificador de quema desactivado** |
| `BURNER_MIN_BALANCE_NATIVE` | No | `1` | Sin umbral de aviso de gas |
| `BURN_HOUR_LOCAL` | No | `12` | Hora por defecto: 12:00 de la zona del hotel |
| `BURN_TIMEZONE` | No | `Europe/Madrid` | Zona por defecto de la quema; `UTC` si el hotel factura en UTC |
| `BURN_INTERVAL_MS` | No (**solo dev/demo**) | vacío | Ciclo forzado cada N ms para demos |
| `EMAIL_RECONCILE_INTERVAL_MS` | No | `300000` | Reconciliación cada 5 min |
| `REORG_CONFIRMATIONS` | No | `1` en Anvil, `32` en Polygon | Confirmaciones exigidas antes de consolidar |
| `SILENCE_THRESHOLD_MS` | No | `600000` (10 min) | Umbral de la alerta de silencio |
| `CHAIN_RPC_URL` | Sí para el monitor | `http://127.0.0.1:8545` | El monitor no vigila la viveza de la cadena |
| `GAS_WALLETS` | Sí para el monitor | `quema=0x…,recepcion=0x…` | No se vigila ningún saldo de gas |
| `MIN_GAS_NATIVE` | No | `1` | Umbral por defecto de saldo de gas |
| `STALL_CYCLES` | No | `3` | Ciclos sin bloque nuevo antes de alertar |

## 15. Cómo carga cada componente el `.env`

Next.js **solo lee los `.env` de su propio directorio**, así que en el monorepo hay que cargar
explícitamente el de la raíz:

| Componente | Dónde se carga | Por qué |
|---|---|---|
| `apps/web` | `next.config.mjs`, al evaluar la configuración | Ese módulo se carga en el proceso CLI **antes** de que Next arranque sus *workers*, que heredan `process.env`. La raíz se localiza subiendo hasta `pnpm-workspace.yaml`, para no depender del directorio de lanzamiento |
| `apps/worker`, `apps/mcp`, `apps/monitor` | `process.loadEnvFile` en su `main.ts` | Node no carga `.env` por sí solo; sin esto los tres servicios fallaban al arrancar |
| Scripts de `packages/shared` | `node --env-file=../../.env --import tsx` | `tsx` es necesario porque los imports de `src` van sin extensión y el *type stripping* de Node los rechaza |

En producción (contenedor o CI) lo habitual es que **no exista** el fichero `.env` y las variables
lleguen del entorno: su ausencia no es un error, pero un secreto obligatorio ausente **sí** detiene el
arranque con mensaje explícito.

## 16. Detalles que ahorran una tarde de depuración

- Una variable **opcional dejada vacía** (`VAR=`) equivale a **no definirla**: el esquema usa
  `emptyAsUndefined`. Antes, `BURN_INTERVAL_MS=` rompía el arranque con
  `Number must be greater than 0`. Un valor **mal escrito** sí se rechaza.
- `SMTP_FROM` acepta `Nombre <correo@dominio>` (cabecera SMTP habitual) además del correo desnudo.
- `GAS_WALLETS` es una lista `nombre=dirección` separada por comas; `MONITOR_TARGETS` es una lista
  `nombre=url` separada por comas.
- El **mismo** valor debe ir en `CONTRACT_ADDRESS` y en `NEXT_PUBLIC_CONTRACT_ADDRESS`: la segunda se
  inyecta en la compilación del cliente.

---

*Volver a [Instalación](README.md) · Siguiente: [Base de datos](02-base-de-datos.md)*
