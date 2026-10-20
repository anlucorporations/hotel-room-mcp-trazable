# Manual técnico — Gobernanza, firmas on-chain y soporte (F9)

> **Tema:** F9 (administración, gobernanza y soporte).
> **Fuentes:** `apps/web/src/app/admin/sistemas/**`, `apps/web/src/app/api/admin/system/**`,
> `packages/contracts/src/HotelOperations.sol`, `packages/shared/src/operations/**`,
> `docs/RUNBOOK.md` §9.5, `RepoTecnico/evidencias/f9-admin-gobernanza-2026-10-19.json`.

## 1. Wallets y roles on-chain

- `operator_wallets` relaciona operador ↔ dirección ↔ rol (`HEAD_MAINTENANCE`, `HEAD_KEEPER`,
  `OWNER_BACKUP`).
- **Alta on-chain primero:** se mina la tx `grantRole` en `HotelOperations` y se comprueba `hasRole`; solo
  después se marca la BD. Si la tx no se mina → **409** y sin cambio.
- **Baja:** se revoca el rol on-chain **antes** de marcar `revoked_at` (RNF-M-15); si el rol sigue activo
  → **409 `ROLE_STILL_ACTIVE`**.
- `OWNER_BACKUP` permite firmar en emergencia (`CU-V-38`) con el rol de respaldo.

## 2. Flags de firma

`GET/PATCH /api/admin/settings/flags`. Desactivar un flag **obligatorio** exige firma `CONFIG`
(`prepare → sign → confirm → apply`); sin firma → **409 `CONFIG_SIGNATURE_REQUIRED`**. Todo cambio queda
en `operator_audit_log` y en `on_chain_signatures` (RNF-M-11).

## 3. Operarios de terminal

Alta con **PIN de un solo uso** (`terminal_operators`), rotación, baja lógica y desbloqueo desde Sistemas
→ Usuarios. `created_by` debe ser un usuario activo con rol autorizado (RNF-M-16); PIN bcrypt ≥ 12 y
bloqueo a los 5 intentos (RNF-M-09).

## 4. Cola de anclajes y auditoría

- `on_chain_signatures` es el outbox: estados `PENDING → SIGNED → MINED | FAILED | REVOKED`, con
  `retry_count`, `next_attempt_at` (backoff 30 s → 1 → 2 → 5 → 10 min) y `tx_hash`.
- La **cola visible** (`/api/admin/system/operations`) devuelve las firmas pendientes incluso con el
  worker degradado (`workerAvailable=false`) — no se oculta la cola (T9.5).
- **Exportación firmada de auditoría** (A10): `/api/admin/system/export` genera un expediente verificable.
- **Backups**: PITR (RPO 1 h) + dump/restore; runbook §9.5 ejecutado (A11: rollback 10,4 s/11,9 s).

## 5. Parámetros, límites y alertas

| Parámetro | Valor | Dónde |
|---|---|---|
| `ANCHOR_BACKOFF` | 30 s → 1 → 2 → 5 → 10 min, máx. 8 reintentos, TTL 24 h | RNF-M-03 |
| Alerta de cola | firma `PENDING` > 10 min o `retry_count` > 5 | RNF-M-13 |
| Retención auditoría | 5 años (`operator_audit_log`, `on_chain_signatures`) | RNF-M-19 |
| Gobernanza | Safe 2-of-3 como `DEFAULT_ADMIN_ROLE` (pendiente designar firmantes) | D-5 / B-7 |

## 6. Pruebas y evidencias

- `apps/web/src/components/admin/f9-cierre.test.ts`, guardián MCP, `guard.test.ts`.
- Evidencia: `f9-admin-gobernanza-2026-10-19.json`, `a10-audit-export.json`, `a11-runbook-rollback.json`,
  `a9-dr-rpo-rto.json` (drill lógico; guía para el drill aislado en `F9-a9-drill-restauracion-iam.md`).
