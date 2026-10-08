# Entornos globales — Propuesta vNext (Mantenimiento + Ama de llaves)

> **Alcance:** variables, rutas y configuración necesarias para la vNext.  
> **Base:** se añaden a las variables existentes del proyecto (`RepoTecnico/entornos_globales.md`).  
> **Fecha:** 2026-10-06.

---

## 1. Variables de entorno nuevas

| Variable | Componente | Descripción | Ejemplo |
|---|---|---|---|
| `HOTEL_OPERATIONS_CONTRACT_ADDRESS` | web / worker / mcp (solo lectura) | Dirección del nuevo contrato `HotelOperations.sol`; el **MCP** la consume en modo **read-only** (sin custodia, sin firma, sin tx, DT-AUD-15) | `0x...` |
| `HOTEL_OPERATIONS_DEPLOYMENT_BLOCK` | worker | Bloque de despliegue de `HotelOperations` (catch-up del outbox) | `123456` |
| `ENABLE_OPERATIONAL_SIGNATURES` | web | Feature flag **solo dev/test**; en producción es fijo | `true` |
| `OPERATIONAL_SIGNATURE_QUEUE` | worker | Nombre de la cola que **despierta** al relayer; el outbox real es la tabla `on_chain_signatures` (DT-AUD-06) | `operational-signatures` |
| `OPERATIONAL_SIGNATURE_RETRY_MS` | worker | Reintento de anclajes on-chain | `30000` |
| `OPERATIONAL_SIGNATURE_MAX_RETRIES` | worker | Máximo de reintentos de anclaje | `8` |
| `OPERATIONAL_SIGNATURE_TTL_HOURS` | worker | TTL en cola de anclaje | `24` |
| `TERMINAL_PIN_MAX_ATTEMPTS` | web | Intentos fallidos antes de bloqueo | `5` |
| `TERMINAL_PIN_ROTATION_DAYS` | web | Días de rotación obligatoria del PIN | `90` |
| `TERMINAL_SESSION_TIMEOUT_MS` | web | Cierre de sesión por inactividad | `300000` |
| `DAMAGE_EVIDENCE_RETENTION_DAYS` | worker | Retención de fotos de daños | `90` |
| `DAMAGE_CHARGE_NOTIFICATION_CHANNEL` | worker | Canal por defecto de notificación de cargos | `EMAIL` |
| `DAMAGE_CLAIM_DEADLINE_HOURS` | worker | Plazo por defecto para reclamar antes del check-out | `24` |
| `MAX_DAMAGE_CHARGE_MULTIPLIER` | web/worker | Tope del cargo por daños como múltiplo de la tarifa de la noche | `3` |
| `DAMAGE_CHARGE_ESCALATION_APPROVER` | web | Rol que aprueba cargos por encima del tope | `DEFAULT_ADMIN_ROLE` |

| `ANCHOR_BACKOFF` | worker | Secuencia de backoff de anclaje (min) | `30,60,120,300,600` |
| `RPC_TIMEOUT_MS` | worker | Timeout de RPC por intento | `5000` |
| `PENDING_ALERT_MIN` | worker | Minutos antes de alertar por firma `PENDING` | `10` |
| `RETRY_ALERT_COUNT` | worker | Reintentos antes de alertar | `5` |
| `DAMAGE_CHARGE_CURRENCY` | web/worker | Moneda por defecto para cargos por daños | `EUR` |
| `DAMAGE_CHARGE_TARGETS_TOKEN` | web/worker | Los cargos por daños se imputan al token/noche vendido | `true` |
| `MAINTENANCE_BLOCK_REQUIRES_SIGNATURE` | web | **Solo dev/test**; en producción siempre `true` (D-C34) | `true` |
| `INSPECTION_REQUIRES_SIGNATURE` | web | La inspección exige firma on-chain (opcional por D-C23) | `false` |
| `DAMAGE_CHARGE_REQUIRES_SIGNATURE` | web | **Solo dev/test**; en producción siempre `false` (D-C27) | `false` |
| `CRITICAL_AREA_CODES` | web/worker | Áreas cuyas tareas preventivas requieren firma on-chain | `POOL_FILTER,WATER_PUMP,ELEVATOR,ELECTRIC_GENERATOR` |

> **Parámetros de dominio del anclaje (DT-AUD-12).** `ANCHOR_BACKOFF`, `RPC_TIMEOUT_MS`, `PENDING_ALERT_MIN` y `RETRY_ALERT_COUNT` son parámetros **no secretos** del worker relayer, con los valores por defecto de `documento_tecnico.md` §4.7. El outbox transaccional vive en PostgreSQL (`on_chain_signatures.next_attempt_at`), de modo que la cola es recuperable tras un restore.

---

## 2. Rutas de la aplicación propuestas

### Suite Mantenimiento (`/mantenimiento`)

| Ruta | Descripción | Rol |
|---|---|---|
| `/mantenimiento` | Dashboard de incidencias y tareas | `HEAD_MAINTENANCE`, `MAINTENANCE_TECH` (lectura limitada) |
| `/mantenimiento/incidencias` | Listado de incidencias | `HEAD_MAINTENANCE`, `MAINTENANCE_TECH` |
| `/mantenimiento/incidencias/[id]` | Detalle y resolución de incidencia | `HEAD_MAINTENANCE`, `MAINTENANCE_TECH` |
| `/mantenimiento/preventivo` | Planes y tareas preventivas | `HEAD_MAINTENANCE` |
| `/mantenimiento/areas-comunes` | Áreas comunes y tareas rutinarias | `HEAD_MAINTENANCE`, `MAINTENANCE_TECH` |
| `/mantenimiento/informes` | Informes por habitación, área y periodo | `HEAD_MAINTENANCE` |

### Recepción (existente + vNext)

| Ruta | Descripción | Rol |
|---|---|---|
| `/recepcion` | Operación diaria de recepción | `RECEPTION_ROLE` |
| `/mantenimiento/incidencias` | Lectura/creación de tickets de mantenimiento | `RECEPTION_ROLE` (crear) |
| `/admin/habitacion` | Activar/desactivar la venta tras inspección o mantenimiento | `RECEPTION_ROLE` + Owner |

> **Redirección** (D-C40): `/housekeeping` → `/ama-de-llaves` para no romper enlaces ni marcadores existentes.

### Suite Ama de llaves (`/ama-de-llaves`)

| Ruta | Descripción | Rol |
|---|---|---|
| `/ama-de-llaves` | Tablero de turnos y habitaciones | `HEAD_KEEPER`, `HOUSEKEEPER` |
| `/ama-de-llaves/turnos` | Gestión de turnos y asignaciones | `HEAD_KEEPER` |
| `/ama-de-llaves/asignaciones` | Asignaciones del día | `HEAD_KEEPER`, `HOUSEKEEPER` |
| `/ama-de-llaves/inspecciones` | Inspecciones post-limpieza | `HEAD_KEEPER` |
| `/ama-de-llaves/danos` | Cargos por daños | `HEAD_KEEPER` |
| `/ama-de-llaves/suministros` | Inventario de consumibles | `HEAD_KEEPER`, `HOUSEKEEPER` |

---

## 3. Comandos útiles propuestos

```bash
# Validar esquema vNext contra una base local
psql -h localhost -U hotel_admin -d hotel_nft_dev -f RepoTecnico/propuesta_vNext/base_datos.sql

# Ejecutar tests del contrato HotelOperations (futuro)
pnpm --filter @hotel/contracts test:operations

# Desplegar HotelOperations en Anvil (futuro)
pnpm --filter @hotel/contracts deploy:operations --network anvil
```

---

## 4. Dependencias añadidas (futuro)

| Paquete | Uso |
|---|---|
| `@hotel/contracts/HotelOperations.sol` | Contrato auxiliar de operaciones |
| `@hotel/shared/src/operations` | Tipos, helpers y firmas de operaciones |

---

## 5. Decisiones aplicadas al entorno (D1–D12, resueltas el 2026-10-06)

| # | Decisión | Efecto en el entorno |
|---|---|---|
| D1 | Canal de notificación = **email** | `DAMAGE_CHARGE_NOTIFICATION_CHANNEL=EMAIL`, `DAMAGE_CLAIM_DEADLINE_HOURS=24` |
| D2 | Inspección sin firma on-chain | `INSPECTION_REQUIRES_SIGNATURE=false` |
| D3 | Retirada de roles heredados | Migración que desactiva usuarios `HOUSEKEEPING`/`MAINTENANCE`; alta manual de los nuevos roles |
| D4 | Wallet autocustodiada por el jefe | Sin variables de custodia en servidor; solo `HOTEL_OPERATIONS_CONTRACT_ADDRESS` |
| D5 | Safe multisig 2-de-3 | El `DEFAULT_ADMIN_ROLE` es una dirección Safe, no una EOA |
| D6 | Tope de cargo 3× tarifa | `MAX_DAMAGE_CHARGE_MULTIPLIER=3`, `DAMAGE_CHARGE_ESCALATION_APPROVER=DEFAULT_ADMIN_ROLE` |
| D7 | Orden FK corregido | `operator_audit_log` se crea antes de `housekeeping_damage_charges` |
| D8 | Guardián de arquitectura | `architecture-guardian.test.ts` ampliado a `base_datos.sql` |
| D9 | Redirecciones | `/admin/mantenimiento` → `/mantenimiento`; `/admin/housekeeping` → `/ama-de-llaves` |
| D10 | Solo Anvil | Aceptación en Anvil 81234; sin Besu en esta entrega |
| D11 | CI con `psql` | PostgreSQL **16** (versión del CI); job que aplica `base_datos.sql` en base limpia |
| D12 | Sin WalletConnect/PMS/SIWE | Conexión por **MetaMask**; sin integración PMS; autenticación contraseña + TOTP + wallet |

---

*Entornos vNext · @asistenteProyecto.*
