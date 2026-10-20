# Manual técnico — Suite Ama de llaves, inspecciones y suministros

> **Tema:** F6 (suite Ama de llaves) y F8 (suministros + SLA de validación).
> **Fuentes:** `apps/web/src/app/ama-de-llaves/**`, `apps/web/src/app/api/housekeeping/**`,
> `apps/web/src/components/housekeeping/**`, `packages/shared/src/domain/supplies.ts`,
> `packages/shared/src/domain/validation-sla.ts`, `apps/web/src/app/api/admin/housekeeping/supplies`.

## 1. Roles y rutas

| Rol | Acceso | Wallet |
|---|---|---|
| `HEAD_KEEPER` (jefa) | `/ama-de-llaves/**` (turnos, asignaciones, inspecciones, daños, suministros) | solo para firmar (inspección opcional) |
| `HOUSEKEEPER` (camarera) | terminal `/terminal/**` y su turno | no |
| `DEFAULT_ADMIN_ROLE` | todas las suites | sí |

Rutas principales: `/ama-de-llaves`, `/turnos`, `/asignaciones`, `/inspecciones`, `/danos`,
`/suministros`; API `/api/housekeeping/*` (turnos, asignaciones, inspecciones, reportes y dashboard).

## 2. Ciclo operativo

1. **Turnos y asignaciones**: `housekeeping_shifts` + `housekeeping_assignments`
   (`PENDING → IN_PROGRESS → DONE`); una inspección rechazada devuelve la asignación a `PENDING`.
2. **Notificación de limpieza**: el check-out/mantenimiento resuelto crea la necesidad de limpieza
   (`housekeeping_room_logs`) y la camarera la ve en su terminal (CU-V-19/28/29).
3. **Inspección**: `housekeeping_inspections` (`CHECKOUT`/`DAILY_SERVICE`, `APPROVED`/`REJECTED`);
   firma EIP-712 **opcional** (D-C23) y **no libera la venta** (D-C15). El rechazo devuelve la limpieza.
4. **Estados canónicos**: `rooms.publication_status` ≠ `AVAILABLE`; `rooms.operational_status` incluye
   `IN_INSPECTION`; no se acuñan valores nuevos (vocabulario del diccionario §3.14).

## 3. Suministros y SLA (F8)

| Pieza | Comportamiento |
|---|---|
| Alerta de umbral | `supply_alerts` se abre cuando `stock_qty <= threshold_qty`; se cierra al reponer |
| Recordatorio diario | `supply-reminder-scheduler` del worker concilia y recuerda mientras siga abierta |
| Umbral por artículo | configurable desde administración (`/api/admin/housekeeping/supplies`) |
| Validación de tareas | `sla-scheduler` vence a las 24 h → `PENDING_VERIFICATION_EXPIRED` y escala al Administrador |
| Cola del jefe | `/mantenimiento/validaciones` con `sla-countdown` y `pending-verification` |

**Reglas:** una tarea vencida **no bloquea** la habitación pero **no cuenta como completada** hasta
validarse (RNF-M-21). El recordatorio es persistente y se cierra automáticamente al superar el umbral
(D-C33).

## 4. Pruebas y evidencias

- Dominio: `domain/supplies.test.ts`, `domain/validation-sla.test.ts`; planificadores del worker.
- Guardián F8 y paridad i18n; E2E de puerta de sesión `apps/web/e2e/ama-de-llaves.spec.ts`.
- Evidencia: `f8-suministros-sla-2026-10-19.json`, `f6-ama-de-llaves-2026-10-19.json`.
