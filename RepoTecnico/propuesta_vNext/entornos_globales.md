# Entornos globales — Propuesta vNext (Mantenimiento + Ama de llaves)

> **Alcance:** variables, rutas y configuración necesarias para la vNext.  
> **Base:** se añaden a las variables existentes del proyecto (`RepoTecnico/entornos_globales.md`).  
> **Fecha:** 2026-10-06.

---

## 1. Variables de entorno nuevas

| Variable | Componente | Descripción | Ejemplo |
|---|---|---|---|
| `HOTEL_OPERATIONS_CONTRACT_ADDRESS` | web / worker / mcp | Dirección del nuevo contrato `HotelOperations.sol` | `0x...` |
| `HOTEL_OPERATIONS_DEPLOYMENT_BLOCK` | worker | Bloque de despliegue de `HotelOperations` | `123456` |
| `ENABLE_OPERATIONAL_SIGNATURES` | web | Feature flag para firmas on-chain operativas | `true` |
| `OPERATIONAL_SIGNATURE_QUEUE` | worker | Nombre de la cola de anclajes pendientes | `operational-signatures` |
| `OPERATIONAL_SIGNATURE_RETRY_MS` | worker | Reintento de anclajes on-chain | `30000` |
| `DAMAGE_CHARGE_CURRENCY` | web/worker | Moneda por defecto para cargos por daños | `EUR` |
| `DAMAGE_CHARGE_TARGETS_TOKEN` | web/worker | Los cargos por daños se imputan al token/noche vendido | `true` |
| `MAINTENANCE_BLOCK_REQUIRES_SIGNATURE` | web | El bloqueo de habitación exige firma on-chain | `true` |
| `INSPECTION_REQUIRES_SIGNATURE` | web | La inspección exige firma on-chain | `true` |
| `DAMAGE_CHARGE_REQUIRES_SIGNATURE` | web | Los cargos por daños exigen firma on-chain | `true` |
| `CRITICAL_AREA_CODES` | web/worker | Áreas cuyas tareas preventivas requieren firma on-chain | `POOL_FILTER,WATER_PUMP,ELEVATOR,ELECTRIC_GENERATOR` |

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

*Entornos vNext · @asistenteProyecto.*
