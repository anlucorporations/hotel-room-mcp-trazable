# Aceptación de la Fase 4 — Pruebas (2026-10-20)

**Alcance:** cierre de la Fase 4 del proceso @asistenteProyecto sobre el estado actual del repositorio
(release web `v81` + suites F1–F10), con el informe consolidado
[`informe_pruebas_fase4.md`](./informe_pruebas_fase4.md) como evidencia principal.

## Criterio de la fase

> «100 % de pruebas pasando, sin errores funcionales» (skill `asistente-proyecto`, Fase 4).

## Resultado

**CUMPLE.** 2.465 pruebas de código + 126 E2E, **0 fallos** en la pasada registrada.

| Gate | Resultado | Evidencia |
|---|---|---|
| Contratos (Foundry) | 202/202 · 20 suites · invariantes 256 runs, 0 contraejemplos | `forge test` (informe §1) |
| `@hotel/shared` | 758/758 (76 ficheros) | informe §1; incluye el guardián documental A12 |
| `@hotel/web` | 1188/1188 (134 ficheros) | informe §1 |
| `@hotel/worker` | 189/189 | informe §1 |
| `@hotel/mcp` | 86/86 | informe §1 |
| `@hotel/monitor` | 42/42 | informe §1 |
| E2E Playwright | 126/126 (chromium + mobile), incluido A5 y a11y de 34 rutas | informe §3; `wallet-publicacion.spec.ts` |
| `typecheck` | 6/6 paquetes | informe §2 |
| `lint` | 0 errores | informe §2 |
| Guardián de arquitectura | verde (tablas schema/migrator/base_datos) | `architecture-guardian.test.ts` |
| Guardián documental (A12) | 5/5 + prueba de mutación | `documentation-sync-guardian.test.ts` |

## Hallazgos corregidos durante la fase

1. **A5 automatizado**: E2E con cartera EIP-6963 real en escritorio y móvil (era manual).
2. **A12 cerrado**: guardián `base_datos.sql ↔ diccionario ↔ diagrama ER` y documentación puesta al día.
3. **Deriva E2E**: `home.spec` (H1 y `/admin/mint` obsoletos), `observabilidad.spec` (selector ambiguo en
   móvil) y `a11y.spec` (ruta retirada + timeout del escaneo).

## No ejecutado en el entorno local (delegado a CI)

Job de esquema con PostgreSQL 18, `slither`, *perf nightly* y los E2E que requieren PostgreSQL real
(mantenimiento/ama de llaves con firma EIP-712). Están declarados en el informe §5.

## Pendiente ajeno a la Fase 4

**A9** (drill a instancia aislada) sigue pendiente del permiso IAM `cloudsql.backups.restore`; su guía
está en [`F9-a9-drill-restauracion-iam.md`](./F9-a9-drill-restauracion-iam.md). No bloquea la Fase 4
(es criterio de aceptación de la Fase 3).

## Conclusión

La Fase 4 se declara **cerrada** el **2026-10-20**. Se avanza a la **Fase 5 — Manuales**.
