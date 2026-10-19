# Aceptación global de la Fase 3 — estado de los criterios A1–A14

**Fecha:** 2026-10-19 · **Alcance:** criterios alcanzables sin los ciclos F5/F8/F9.
**Evidencia detallada:** [`evidencias/aceptacion-fase3-gates-a-2026-10-19.json`](./evidencias/aceptacion-fase3-gates-a-2026-10-19.json).

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| A1 | 10 ciclos cerrados | **CUMPLE** — F1–F10 con gates y despliegue verificado | `f5-…`, `f8-…`, `f9-…` |
| A2 | 51 requisitos y 45 CU-V sin huérfanos | **CUMPLE** — 51/51 y 45/45 | `propuesta_vNext/matriz_trazabilidad.md` |
| A3 | `forge test` completo | **CUMPLE** — 202 pruebas, 20 suites, invariantes 256 runs | salida forge |
| A4 | Workspace verde (typecheck, lint, test, build) | **CUMPLE** | estado_proyecto §48 |
| A5 | E2E con wallet real escritorio/móvil | **BLOQUEADO (manual)** | evidencias F4/F6/F7 |
| A6 | Firma on-chain selectiva correcta | **CUMPLE** | contrato + F4/F6/F7 |
| A7 | Sin PII on-chain + retención 90 días | **CUMPLE** | contrato + dominio daños |
| A8 | p95 tablero <500; listados <800 (20/50/90) | **CUMPLE** — 72,6 ms / 76,5 ms, 0 errores | `evidencias/a8-load-gate.json` |
| A9 | DR RPO 1 h / RTO 4 h + outbox | **CUMPLE** — PITR + restore 2,76 s | `evidencias/a9-dr-rpo-rto.json` |
| A10 | Exportación de auditoría firmada reproducible | **CUMPLE** — export real firmado | `evidencias/a10-audit-export.json` |
| A11 | Runbook §9.5 ejecutado | **CUMPLE** — rollback 10,4 s/11,9 s, contrato inmutable | `evidencias/a11-runbook-rollback.json` |
| A12 | Datos sincronizados | **CUMPLE con matiz** (triple sync SQL; diccionario/ER sin diff automatizado) | migrator.test |
| A13 | Sin secretos + fail-fast | **CUMPLE** | guardianes |
| A14 | MCP solo lectura | **CUMPLE** — 7 herramientas, 7 acciones leídas | guardián MCP |

## Qué falta para cerrar la Fase 3 completa

1. **A5**: E2E Playwright con wallet inyectada en escritorio y móvil (hoy validado manualmente en producción; único criterio no automatizado).
2. **A9**: permiso IAM `cloudsql.backups.restore` para repetir el drill de restauración a una instancia aislada (el drill lógico ya está medido y documentado).
3. **A12**: si se quiere eliminar el matiz, añadir diff automatizado para `diccionario_datos.md` y `diagrama_er.md`.
