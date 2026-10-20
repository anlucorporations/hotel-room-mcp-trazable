# Paquete de entrega y traspaso — Hotel Marina del Sol

> **Proyecto:** `hotel-room-mcp-trazable` — plataforma de noches de hotel tokenizadas (web + contratos + worker + MCP).
> **Cliente:** Hotel Marina del Sol · **Entrega:** **2026-10-20** · **Estado:** **PROYECTO CERRADO** (fases 1–5).
> **Release:** web `v81` en producción · **Rama:** `Hotel-DSH-GCP-v3` · **Etiqueta:** `entrega-final-2026-10-20`.
> **Repositorio:** [GitLab `anlucorporations/hotel-room-mcp-trazable`](https://gitlab.com/anlucorporations/hotel-room-mcp-trazable) — `main` en `3fc64a2` (entrega) + notas post-entrega.

---

## 1. Qué se entrega (resumen ejecutivo)

Una plataforma operativa para vender, revender, usar y operar **noches de hotel como NFT**:

- **Web pública** en español/inglés/ruso: home, secciones del hotel, catálogo, compra primaria, reventa
  con royalty, subastas, «Mis noches» con resguardo QR, check-in, reseñas, asistente IA, ayuda/manuales.
- **Back-office y personal**: administración de habitaciones/publicación firmada, contenido, actividades,
  reseñas, recepción vNext, suites de **mantenimiento** y **ama de llaves**, **terminal con PIN**,
  gobernanza (wallets/flags/operarios), auditoría, backups y cola de anclajes.
- **Contratos inmutables** `HotelNights` (ERC-721/2981) y `HotelOperations`, desplegados y verificados en la
  red **Besu** del proyecto (`chainId 81234`), con anclaje selectivo de operaciones.
- **Automatizaciones**: mini-worker (indexación, emails, anclajes, SLA, quema) y **MCP de solo lectura**
  para el asistente; monitorización con health checks.
- **Documentación, pruebas y manuales** completos (ver §3) y **evidencias** de cada ciclo.

## 2. URLs y accesos

| Servicio | URL / identificador |
|---|---|
| Web (Cloud Run) | `https://hotel-mcp-web-d6jlzeq5yq-ew.a.run.app` |
| MCP (Cloud Run) | `https://hotel-mcp-mcp-d6jlzeq5yq-ew.a.run.app` |
| Worker (Cloud Run) | `https://hotel-mcp-worker-d6jlzeq5yq-ew.a.run.app` |
| PostgreSQL | Cloud SQL `hotel-mcp-pg` (PostgreSQL 18, IP privada, base `hotel_nft`) |
| Redis | instancia del proyecto (`10.104.0.3`), colas BullMQ |
| Red | Besu de Codecrypto (`https://besu.alumnos.codecrypto.academy`, `chainId 81234`) |
| Contrato (registro) | `packages/shared/deployments/81234.json` (address, block, abiHash) |
| Panel pgAdmin | `https://hotel-pgadmin-d6jlzeq5yq-ew.a.run.app` |

**Secretos:** no se entregan en documentos ni en el repositorio. Viven en **GCP Secret Manager** y en el
`.env` del entorno de ejecución; el contrato de variables está en `.env.example` y en
[`entornos_globales.md`](./entornos_globales.md). El arranque falla en cerrado si falta un secreto.

## 3. Inventario de documentación

| Artefacto | Dónde |
|---|---|
| Requisitos, SRS, PRD, ADR | `docs/REQUISITOS.md`, `docs/SRS.md`, `docs/PRD.md`, `docs/adr/` |
| Diccionario de datos / ER / SQL | [`diccionario_datos.md`](./diccionario_datos.md), [`diagrama_er.md`](./diagrama_er.md), [`base_datos.sql`](./base_datos.sql) — sincronizados por guardián |
| Casos de uso y auditoría | [`casos_uso_web.md`](./casos_uso_web.md), [`casos_uso_apk.md`](./casos_uso_apk.md), diagramas en [`casos_uso/`](./casos_uso/), [`INFORME_AUDITORIA_CASOS_USO_V1.md`](./INFORME_AUDITORIA_CASOS_USO_V1.md) |
| Aceptación por fase | [`aceptacion_fase3.md`](./aceptacion_fase3.md), [`aceptacion_fase4.md`](./aceptacion_fase4.md), [`aceptacion_fase5.md`](./aceptacion_fase5.md) |
| Pruebas | [`informe_pruebas_fase4.md`](./informe_pruebas_fase4.md) y `docs/PLAN-DE-PRUEBAS.md` |
| Operación | [`docs/RUNBOOK.md`](./docs/RUNBOOK.md), [`despliegue_gcp.md`](./despliegue_gcp.md), [`entornos_globales.md`](./entornos_globales.md) |
| Manuales técnicos | [`Manuales/`](./Manuales/) (incluye las suites vNext en `07-suites-vnext/`) |
| Manuales literales | [`docs/Manuales/`](../docs/Manuales/) y manuales del huésped/cliente/comprador/recepción |
| PDF descargables | `docs/pdf/` y copias públicas en `apps/web/public/manual/` (también desde `/ayuda`) |
| Estado y cierre | [`estado_proyecto.md`](./estado_proyecto.md) §59 (cierre) y §60 (post-entrega) |
| Evidencias | [`evidencias/`](./evidencias/) (un JSON por ciclo, gates A5/A8/A9/A10/A11, cierres F4–F10) |
| Legal/privacidad (APK futura) | [`legal/play-billing-apk-v1.md`](./legal/play-billing-apk-v1.md), [`legal/DPIA-apk-huesped-v1.md`](./legal/DPIA-apk-huesped-v1.md) |

## 4. Cómo operar (arranque rápido)

1. **Salud**: `GET /health/live` y `GET /health/ready` de web, worker y MCP (workers y base deben estar
   `UP`).
2. **Despliegue y rollback**: [`docs/RUNBOOK.md`](../docs/RUNBOOK.md) §9.5 (rollback medido: 10,4 s /
   11,9 s) y §"Despliegue" para el procedimiento canónico.
3. **Backups/DR**: PITR 7 días (RPO 1 h) + dump/restore (RTO medido 2,76 s); drill a instancia aislada
   pendiente de IAM (guía en [`F9-a9-drill-restauracion-iam.md`](./F9-a9-drill-restauracion-iam.md)).
4. **Anclajes**: cola visible en Sistemas → Operaciones; reintentos con backoff automáticos.
5. **Incidentes**: [`Manuales/03-operacion/03-incidentes.md`](./Manuales/03-operacion/03-incidentes.md).
6. **Soporte al usuario**: `/ayuda` en la web (manuales navegables + PDF); manuales de suites para el
   personal.

## 5. Calidad entregada (gates)

| Gate | Resultado |
|---|---|
| Pruebas de código | **2.465** (contratos 202 · shared 758 · web 1188 · worker 189 · mcp 86 · monitor 42) |
| E2E navegador | **126/126** en escritorio y móvil (incluye A5 con wallet inyectada y a11y de 34 rutas) |
| Estáticos | `typecheck` 6/6 · `lint` 0 errores |
| Guardianes | arquitectura, seguridad/fronteras, **sincronización documental** (5/5) y manuales (18/18) |
| Rendimiento | gate A8: p95 tablero **72,6 ms** y listados **76,5 ms** (límites 500/800) |
| Manuales | **44 manuales · 484 secciones**, PDF, imágenes y Ayuda integrada |
| Producción | `v81` desplegada; evidencias por ciclo en `evidencias/` |

## 6. Pendientes post-entrega (no bloquean el cierre)

| # | Pendiente | Responsable | Guía |
|---|---|---|---|
| 1 | **A9** — drill de restauración a instancia aislada (falta permiso IAM `cloudsql.backups.restore`) | Infraestructura/GCP | [`F9-a9-drill-restauracion-iam.md`](./F9-a9-drill-restauracion-iam.md) |
| 2 | **H-02** — dictamen legal de Play/MiCA/consumo antes de publicar una APK | Asesoría legal | [`legal/play-billing-apk-v1.md`](./legal/play-billing-apk-v1.md) |
| 3 | **H-03** — aprobación de la DPIA (wallet como dato personal) | DPO/asesoría | [`legal/DPIA-apk-huesped-v1.md`](./legal/DPIA-apk-huesped-v1.md) |
| 4 | Contenido definitivo del manual del huésped (dirección/datos del hotel, RF-56) | Cliente | `docs/manual-huesped.md` |
| 5 | CI canónico (GitLab falla sin jobs; GitHub no tiene el commit): decidir y reparar | Responsable técnico | [`ci-post-entrega-2026-10-20.md`](./ci-post-entrega-2026-10-20.md) |
| 6 | APK Android del huésped (especificada, no construida) | Producto/desarrollo | [`casos_uso_apk.md`](./casos_uso_apk.md) |

## 7. Checklist de aceptación y firma

- [x] Fases 1–5 completadas y documentadas.
- [x] Gates de pruebas/estáticos en verde y evidencias archivadas.
- [x] Manuales generados y Ayuda integrada.
- [x] Entrega publicada en `origin/main` y etiquetada (`entrega-final-2026-10-20`).
- [ ] Validación funcional del hotel sobre los manuales (responsable del hotel).
- [ ] Cierre de los pendientes post-entrega §6 (según prioridad del cliente).
- [ ] Firma de aceptación del cliente: ____________________ · Fecha: __________

---

*Paquete de entrega generado por @asistenteProyecto · 2026-10-20. Cualquier cambio de alcance
posterior se registra en `estado_proyecto.md` y se versiona con una nueva etiqueta.*
