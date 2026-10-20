# Manual técnico — Suite de Mantenimiento y terminal con PIN

> **Tema:** F4 (suite de mantenimiento) y F5 (terminal de mantenimiento sin wallet).
> **A quién sirve:** ingeniería, soporte y quien opere la suite.
> **Fuentes:** `apps/web/src/app/mantenimiento/**`, `apps/web/src/components/maintenance/**`,
> `apps/web/src/app/api/mantenimiento/**`, `apps/web/src/lib/mantenimiento/**`,
> `packages/shared/src/operations/**`, `RepoTecnico/estado_proyecto.md` §45/§48.

## 1. Roles y puertas de sesión

| Rol | Acceso | Wallet |
|---|---|---|
| `HEAD_MAINTENANCE` (jefe) | `/mantenimiento/**` y todo el back-office como owner | sí, solo para firmar |
| `MAINTENANCE_TECH` (técnico) | terminal `/terminal/**` y lo asignado | no |
| `MAINTENANCE` (heredado) | suite del técnico (D-77) | no |
| `DEFAULT_ADMIN_ROLE` (owner) | todas las suites | sí |

La puerta vive en el **layout RSC** y se repite en cada página y API
(`apps/web/src/lib/mantenimiento/session.ts` → `currentAdminSession([...MAINTENANCE_SUITE_ROLES])`).
Sin sesión se sirve `AdminSignInScreen` y la página devuelve `null` (defensa en profundidad, M7 · H1).

## 2. Flujos y API

| Objetivo | Ruta de API | Tablas |
|---|---|---|
| Tablero del día | `GET /api/mantenimiento/board` | `maintenance_incidents`, `preventive_tasks`, `rooms` |
| Incidencias (alta/listado/detalle) | `/api/mantenimiento/incidents[/{id}]` | `maintenance_incidents`, `maintenance_incident_events` |
| Bloqueo / desbloqueo firmado | `POST /api/mantenimiento/rooms/{id}/block` y `/unblock` | `rooms`, `on_chain_signatures` |
| Preventivo | `/api/mantenimiento/preventivo`, `/tasks[/{id}]` | `preventive_plans`, `preventive_tasks` |
| Áreas comunes | `/api/mantenimiento/areas-comunes` | `maintenance_areas`, `maintenance_area_tasks`, `maintenance_area_logs` |
| Validación de cierres (SLA 24 h) | `/api/mantenimiento/validaciones` | `preventive_tasks.validation_status` |
| Informes | `/api/mantenimiento/informes` | agregados de tareas/incidencias |

### 2.1 Firma selectiva (F4 · `useMaintenanceSignature`)

Toda acción crítica sigue **preparar → firmar → confirmar → aplicar**:

1. `POST /api/mantenimiento/signatures` devuelve `signatureId`, `contentHash` y el `typedData` EIP-712.
2. La wallet firma con `signTypedDataAsync` (`apps/web/src/components/maintenance/useMaintenanceSignature.ts`).
3. `PATCH /api/mantenimiento/signatures/{id}` valida la firma y el firmante recuperado.
4. La ruta de la operación (p. ej. `block`) aplica el cambio off-chain con `signatureId`.

**Obligatoria:** bloqueo/desbloqueo de habitación y preventivo de área crítica (RF-S-02/05). **Opcional:**
inspección (D-C23). **No se firma:** cargo por daños (D-C27, auditoría off-chain).

### 2.2 UI y testids

`SignatureGate` marca ⛓ «Requiere firma» (`data-testid="requires-signature"`); sin wallet el contenedor es
`data-testid="wallet-disconnected"` y el disparador queda `disabled`. El modal
`data-testid="signature-preview"` muestra acción, entidad y datos; confirmar es
`data-testid="signature-confirm"`. La evidencia sin foto muestra `evidence-missing` (D-C12).

## 3. Terminal de mantenimiento con PIN (F5)

**Política** (`apps/web/src/lib/terminal-auth.ts`): PIN de 4–6 dígitos sin repetidos, bcrypt ≥ 12,
bloqueo atómico a los 5 intentos (15 min), caducidad 90 días, inactividad 5 min y tope absoluto 8 h.
La sesión es un JWT corto en cookie HttpOnly **independiente** del back-office.

| Ruta | Uso |
|---|---|
| `/terminal` | Login con `PinPad` y tablero de lo asignado (`TerminalBoard`) |
| `/terminal/reportar` | Reporte de avería (`TerminalReportForm`) |
| `/terminal/cambiar-pin` | Cambio de PIN obligatorio en el primer acceso |
| `POST /api/terminal/auth`, `/auth/change-pin` | Autenticación y rotación |
| `/api/terminal/tasks` | Tareas **solo del técnico** (cierre → `PENDING_VERIFICATION`, bloqueo optimista `updated_at`) |
| `/api/terminal/incidents` | Alta de avería (`OPEN`) |

**Sin modo offline**: si se pierde la red, `OfflineNotice` lo avisa y bloquea la escritura (RNF-M-18).

## 4. Pruebas y evidencias

- Dominio/planificadores: `packages/shared/src/domain/*`, `apps/web/src/components/maintenance/maintenance-suite.test.ts`.
- E2E de puerta de sesión: `apps/web/e2e/mantenimiento.spec.ts` (escritorio y móvil).
- Evidencia de producción: `RepoTecnico/evidencias/f4-mantenimiento-firma-2026-10-19.json` y
  `f5-terminal-pin-2026-10-19.json`.
- Criterio de firma y cola de anclajes: `RepoTecnico/estado_proyecto.md` §45, §48 y §50.
