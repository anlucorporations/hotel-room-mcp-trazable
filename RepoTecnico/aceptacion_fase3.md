# Aceptación global de la Fase 3 — estado de los criterios A1–A14

**Fecha:** 2026-10-19 · **Actualizado:** 2026-10-20 (A5 automatizado en la Fase 4) · **Alcance:** criterios alcanzables sin los ciclos F5/F8/F9.
**Evidencia detallada:** [`evidencias/aceptacion-fase3-gates-a-2026-10-19.json`](./evidencias/aceptacion-fase3-gates-a-2026-10-19.json) y [`evidencias/fase4-e2e-a5-wallet-2026-10-20.json`](./evidencias/fase4-e2e-a5-wallet-2026-10-20.json).

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| A1 | 10 ciclos cerrados | **CUMPLE** — F1–F10 con gates y despliegue verificado | `f5-…`, `f8-…`, `f9-…` |
| A2 | 51 requisitos y 45 CU-V sin huérfanos | **CUMPLE** — 51/51 y 45/45 | `propuesta_vNext/matriz_trazabilidad.md` |
| A3 | `forge test` completo | **CUMPLE** — 202 pruebas, 20 suites, invariantes 256 runs | salida forge |
| A4 | Workspace verde (typecheck, lint, test, build) | **CUMPLE** | estado_proyecto §48 |
| A5 | E2E con wallet real escritorio/móvil | **CUMPLE** — Playwright con cartera EIP-6963 inyectada y firma real recuperada, en escritorio y móvil | `fase4-e2e-a5-wallet-2026-10-20.json` |
| A6 | Firma on-chain selectiva correcta | **CUMPLE** | contrato + F4/F6/F7 |
| A7 | Sin PII on-chain + retención 90 días | **CUMPLE** | contrato + dominio daños |
| A8 | p95 tablero <500; listados <800 (20/50/90) | **CUMPLE** — 72,6 ms / 76,5 ms, 0 errores | `evidencias/a8-load-gate.json` |
| A9 | DR RPO 1 h / RTO 4 h + outbox | **CUMPLE (drill lógico)** — PITR + restore 2,76 s; queda el drill a instancia aislada, con guía lista | `evidencias/a9-dr-rpo-rto.json` · [`F9-a9-drill-restauracion-iam.md`](./F9-a9-drill-restauracion-iam.md) |
| A10 | Exportación de auditoría firmada reproducible | **CUMPLE** — export real firmado | `evidencias/a10-audit-export.json` |
| A11 | Runbook §9.5 ejecutado | **CUMPLE** — rollback 10,4 s/11,9 s, contrato inmutable | `evidencias/a11-runbook-rollback.json` |
| A12 | Datos sincronizados | **CUMPLE** — triple sync SQL (schema.sql/migrator/base_datos.sql) + guardián automatizado `diccionario_datos.md` ↔ `diagrama_er.md` ↔ esquema | `documentation-sync-guardian.test.ts` · `fase4-a12-sincronizacion-documental-2026-10-20.json` |
| A13 | Sin secretos + fail-fast | **CUMPLE** | guardianes |
| A14 | MCP solo lectura | **CUMPLE** — 7 herramientas, 7 acciones leídas | guardián MCP |

## Qué falta para cerrar la Fase 3 completa

1. **A9**: permiso IAM `cloudsql.backups.restore` para repetir el drill de restauración a una instancia aislada. Pasos, permisos exactos, comandos, oráculos y plantilla de evidencia: [`F9-a9-drill-restauracion-iam.md`](./F9-a9-drill-restauracion-iam.md).
