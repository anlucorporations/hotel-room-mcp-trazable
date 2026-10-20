# Manual técnico — Recepción vNext, publicación de habitaciones y acuñado

> **Tema:** F1/F8/F10 (publicación de ficha firmada, ventana de acuñación y recepción vNext).
> **Fuentes:** `apps/web/src/app/recepcion/**`, `apps/web/src/app/api/reception/**`,
> `apps/web/src/app/admin/habitacion/**`, `apps/web/src/components/admin/rooms/**`,
> `apps/web/src/app/api/admin/rooms/**`, `RepoTecnico/estado_proyecto.md` §47/§50.

## 1. Recepción vNext (F10)

| Ruta | Contenido |
|---|---|
| `/recepcion` | Panel del día: reservas y estado de las 50 habitaciones |
| `/recepcion/reservas` | Reservas y búsqueda por código de recuperación |
| `/recepcion/habitaciones` | Ficha de habitación según su estado |
| `/recepcion/danos` | Cargos por daños y reclamaciones |
| `/recepcion/incidencias` | Reporte de incidencias (sin firma, D-C37) |

APIs: `/api/reception/checkin`, `/checkout`, `/charges`, `/incidents`,
`/rooms/{roomNumber}/publication`, `/pms-sync` y `/checkin/contingency`.
**Publicar/despublicar venta manualmente** (D-C9): `PAUSED ↔ PUBLISHED` con guard `RECEPTION_ROLE`.
**PMS**: la conciliación es tolerante a fallo; si el PMS cae, la operación manual sigue y se declara el
estado degradado en la UI. La redirección **D-C40** lleva `/housekeeping` → `308 /ama-de-llaves`.

## 2. Publicación de habitación (F1 · D-1…D-28)

1. La ficha se edita en `/admin/habitacion` (datos, servicios, espacios, galería JPG ≤ 2 MB).
2. `GET /api/admin/rooms/{id}/publish` calcula la **huella** del contenido y si cumple mínimos
   (descripción ES + al menos una imagen).
3. El owner confirma con **TOTP** y firma el mensaje de publicación con la wallet
   (EIP-191, huella + hora UTC + dominio, ADR-30). El servidor verifica firma y frescura (±5 min).
4. Se registra `room_publications` (`PUBLISHED`, firma, `tx_hash`) y el anclaje es **best-effort**:
   si falla, la publicación queda `PENDING_ANCHOR` visible y se reintenta.
5. **Acuñado de la ventana** (`GET /api/admin/rooms/{id}/mint-window` + `writeContract mint`): idempotente
   y reanudable; omite las noches ya acuñadas (`ownerOf`).

## 3. Estados y reglas

- `rooms.publication_status` ∈ `DRAFT`, `PUBLISHED`, `PAUSED`, `MAINTENANCE`, `OUT_OF_SERVICE`.
- `rooms.operational_status` ∈ `CLEAN`, `DIRTY`, `OCCUPIED`, `PENDING_CLEANING`, `IN_INSPECTION`.
- **Archivar nunca borra** (D-8); una ficha archivada no se publica.
- La ventana de venta es configurable (`mint_window_days`, por defecto 90).
- Sin PII de viajeros en la ficha (ADR-20/RNF-30).

## 4. Pruebas y evidencias

- Publicación/firma: `apps/web/src/app/api/admin/rooms/**/*.test.ts`; E2E A5
  (`apps/web/e2e/wallet-publicacion.spec.ts`) cubre preparar→firmar→confirmar→aplicar en escritorio y móvil.
- E2E de redirección: `e2e/redireccion.spec.ts`; puertas: `e2e/danos.spec.ts`.
- Evidencia: `f4-mantenimiento-firma-…`, `f7-f10-cierre-fase3-…`, `fase4-e2e-a5-wallet-2026-10-20.json`.
