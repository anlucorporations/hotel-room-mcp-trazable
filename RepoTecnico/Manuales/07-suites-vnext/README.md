# Manuales técnicos — Suites vNext (F4–F10)

> **A quién sirve:** ingeniería, soporte y responsables de las suites que operan el personal del hotel.
> **Fuentes:** código real de `apps/web/src/app/**` y `packages/shared/**`; evidencias de
> `RepoTecnico/evidencias/` y `estado_proyecto.md`.

| Manual | Contenido |
|---|---|
| [01 · Mantenimiento y terminal](01-mantenimiento-y-terminal.md) | Roles/puertas, incidencias, firma EIP-712, preventivo, áreas comunes, terminal con PIN |
| [02 · Ama de llaves y suministros](02-ama-de-llaves-y-suministros.md) | Turnos, asignaciones, inspecciones, cargos por daños, alertas y SLA de validación |
| [03 · Daños, cargos y reclamaciones](03-danos-cargos-y-reclamaciones.md) | Ciclo del cargo, aviso al huésped, resolución y liquidación en el check-out |
| [04 · Gobernanza, firmas y soporte](04-gobernanza-firmas-y-soporte.md) | Wallets/roles on-chain, flags CONFIG, operarios, cola de anclajes, auditoría y backups |
| [05 · Recepción vNext y publicación](05-recepcion-vnext-y-publicacion.md) | Panel del día, check-in/out, PMS, publicación firmada y acuñación de la ventana |

**Regla:** los tres artefactos de datos (`base_datos.sql`, `diccionario_datos.md`, `diagrama_er.md`) y
estos manuales se actualizan en el mismo cambio; el guardián `documentation-sync-guardian.test.ts`
impide que el modelo se desincronice.
