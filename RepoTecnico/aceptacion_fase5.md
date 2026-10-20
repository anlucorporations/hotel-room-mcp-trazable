# Aceptación de la Fase 5 — Manuales (2026-10-20)

**Alcance:** completar la documentación de manuales de la release actual (F1–F10) siguiendo el proceso
`@manuales`: manuales **técnicos** (`RepoTecnico/Manuales/`), manuales **literales**
(`docs/Manuales/`), **imágenes**, **PDF descargables** y **sección de Ayuda** en la web.

## Resultado

**CUMPLE — aprobada por el responsable (2026-10-20).**

| Criterio | Resultado |
|---|---|
| Manuales técnicos | 5 nuevos en [`RepoTecnico/Manuales/07-suites-vnext/`](./Manuales/07-suites-vnext/README.md) (mantenimiento y terminal, ama de llaves y suministros, daños y reclamaciones, gobernanza y firmas, recepción vNext y publicación) + índice actualizado |
| Manuales literales | 7 nuevos en [`docs/Manuales/07-suites-vnext/`](../docs/Manuales/07-suites-vnext/README.md) con «Empezar en 5 minutos», pasos numerados, mermaid, infografía y «si algo falla» |
| Imágenes | 5 infografías en `docs/imagenes/manuales/` (suite de mantenimiento, ama de llaves, ciclo de daños, gobernanza/firmas y terminal con PIN) + 2 portadas nuevas para CU-38/CU-39 |
| PDF y HTML imprimible | **44 PDF + 44 HTML** en [`docs/pdf/`](../docs/pdf/README.md); copias públicas en `apps/web/public/manual/` |
| Sección de Ayuda | nueva agrupación **«Manuales de las suites (personal)»** en `/ayuda` (ES/EN/RU); navegación, infografías y descarga de PDF por manual |
| Pipeline | `pnpm build:manuals` regenera todo de forma idempotente: **44 manuales · 484 secciones** |
| Deriva corregida | se registraron en el pipeline los manuales **CU-38** y **CU-39** (existían en `docs/` pero no estaban en `CU_ORDER`: el generador fallaba) |

## Gates ejecutados

| Gate | Resultado |
|---|---|
| `pnpm build:manuals` | ✅ 44 manuales · 484 secciones · PDF con Chromium |
| `vitest run src/lib/help` | **18/18** (guardián de manuales 8/8 + guardián del huésped 10/10) |
| `pnpm --filter @hotel/web typecheck` | verde |
| `pnpm --filter @hotel/web lint` | 0 errores (avisos preexistentes) |
| `next build` | verde (Ayuda compilada con el nuevo grupo) |

## Qué cubre cada manual nuevo

1. **Mantenimiento y terminal** — roles y puertas de sesión, incidencias, bloqueo/desbloqueo firmado,
   preventivo, áreas comunes, validación de cierres, terminal con PIN y política de sesión.
2. **Ama de llaves y suministros** — turnos/asignaciones, tablero, inspecciones (firma opcional), rechazo,
   alertas de umbral, recordatorio diario y SLA de 24 h.
3. **Daños, cargos y reclamaciones** — alta con evidencia y tope 3×, aviso al huésped, reclamación,
   resolución y liquidación en el check-out; retención de evidencias y auditoría.
4. **Gobernanza, firmas y soporte** — wallets/roles on-chain, flags con firma `CONFIG`, operarios de
   terminal, cola de anclajes, export firmado, backups/PITR y runbook de rollback.
5. **Recepción vNext y publicación** — panel del día, check-in por QR/JWS, check-out, incidencias,
   publicar/despublicar, PMS y publicación firmada + acuñación de la ventana.
6. **Terminal con PIN** (literal) y **guía para el personal** de cada suite (literales 01–07).

## Fuera de alcance (declarado)

- **Manuales de la APK**: la app Android aún no existe (especificada en `casos_uso_apk.md`); sus manuales
  se generarán cuando haya build.
- Manual del huésped: ya existía (17 guías + índice) y se mantiene; no requería cambios por esta release.
- Manuales de dependencias/diccionario/diagrama: el diccionario y el ER viven en `RepoTecnico/` con su
  guardián (`documentation-sync-guardian.test.ts`); los técnicos nuevos enlazan a ellos.

## Cierre

La Fase 5 se declara **terminada** el **2026-10-20** con la aprobación del responsable. Quedan como
**tareas post-entrega** (no bloquean el cierre): la validación del contenido del manual del huésped por
parte del cliente (RF-56), los manuales de la APK cuando exista build y el `push` de esta entrega.
