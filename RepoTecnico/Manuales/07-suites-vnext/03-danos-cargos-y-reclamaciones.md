# Manual técnico — Cargos por daños, reclamación del huésped y check-out

> **Tema:** F7/F10 (daños, reclamación y liquidación en el check-out).
> **Fuentes:** `apps/web/src/app/api/damage-charges/**`, `apps/web/src/app/mis-noches/cargos/**`,
> `apps/web/src/app/api/reception/**`, `packages/shared/src/db/migrator.ts` (tablas de daños),
> `RepoTecnico/estado_proyecto.md` §47/§50 y `docs/SRS.md`.

## 1. Modelo

| Tabla | Papel |
|---|---|
| `housekeeping_damage_charges` | Cargo por daños: `charge_id`, `room_id`, `token_id`, `inspection_id`, descripción, evidencia, `approved_by`, `signature_id`, `audit_log_id` |
| `damage_charge_guest_notifications` | Aviso al huésped y ciclo de reclamación con `due_date` |
| `additional_charges` | Cargo adicional del folio al que se vincula |
| `operator_audit_log` | Traza append-only de la acción (D-C31) |

**Estados del aviso:** `PENDING → SENT → ACKNOWLEDGED | DISPUTED | EXPIRED → RESOLVED_ACCEPTED |
RESOLVED_REJECTED`. El cargo **no exige firma on-chain** (D-C27); se audita off-chain.

## 2. Flujo

1. **Alta (Ama de llaves/Recepción):** descripción, evidencia (JPG, EXIF eliminado, retención 90 días) e
   importe. Tope: **3× la tarifa de la noche**; por encima aprueba el Administrador (D-6).
2. **Aviso:** canal según preferencia (email/web/Telegram), con datos mínimos y plazo (RNF-M-10).
3. **Reclamación del huésped:** `/mis-noches/cargos` permite aceptar (`ACKNOWLEDGED`) o reclamar con
   notas (`DISPUTED`) dentro de plazo; fuera de plazo → `EXPIRED`.
4. **Resolución (Recepción):** `RESOLVED_ACCEPTED` o `RESOLVED_REJECTED`; se registra `resolved_by/at`.
5. **Check-out:** el cargo aceptado se **liquida** (`PAID`) y el rechazado se cancela; la habitación pasa
   a `PENDING_CLEANING`. La API está en `/api/reception/checkout` y el panel en `/recepcion/danos`.

## 3. Seguridad y cumplimiento

- Sin PII on-chain; la evidencia se guarda cifrada y con URL firmada temporal.
- El enlace del aviso no expone paneles internos ni datos de otros huéspedes (`e2e/danos.spec.ts`).
- Auditoría encadenada (`prev_hash`/`integrity_hash`) para cada alta/resolución.
- Derechos de acceso/supresión tras resolver la reclamación (RNF-M-10, CU-V-42).

## 4. Pruebas y evidencias

- `apps/web/src/app/api/reception/*.test.ts`, `damage-charges.test.ts`, E2E `danos.spec.ts`.
- Evidencia de producción: `f7-f10-cierre-fase3-2026-10-19.json` (alta 201, `DISPUTED`, resolución,
  check-out con cargo `PAID` y aviso `RESOLVED_ACCEPTED`).
- Correcciones de la ventana: casts en `resolveNotification` y `housekeeping_room_logs` a `VARCHAR(20)`.
