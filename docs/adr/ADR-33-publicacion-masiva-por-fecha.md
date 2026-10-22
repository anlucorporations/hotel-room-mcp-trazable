# ADR-33 · La publicación masiva del tablero solo afecta a la fecha seleccionada

- **Estado**: vigente · **Fecha**: 2026-10-22 · **Decisión de origen**: **D-86**
- **Complementa**: D-85 / ADR-32 (publicar encola y el worker mintea la primera noche).

## Contexto

El tablero `/admin/habitacion/publicar` permite elegir un día y publicar por lotes las habitaciones
seleccionadas. Hasta ahora el panel **no enviaba la fecha** y el endpoint masivo
(`POST /api/admin/rooms/bulk/publish`) no la aceptaba: publicaba la ficha para **todas las fechas**
(ventana abierta `publishedAt = NOW`, `unpublishedAt = NULL`) y el worker minteaba **la primera noche
(hoy + 1)**, no la noche seleccionada.

Verificado en producción el 2026-10-22 con la fecha `2026-11-10`: el calendario marcaba publicados
2026-10-23, 2026-11-10, 2026-11-11 y 2026-12-01, y la única noche minteada era la del 23-oct.

## Decisión

1. El panel del día envía `date` (`AAAA-MM-DD`) en el cuerpo de la publicación masiva.
2. El endpoint valida la fecha (formato/calendario, no pasada), la guarda como **`target_date`** en
   `room_mint_jobs` y responde `202` con la fecha. Se admite una habitación ya publicada para
   **añadir** esa noche.
3. El worker, si el job trae `target_date`, **mintea exactamente esa noche** y registra la
   publicación con ventana **[fecha 00:00Z, fecha 23:59:59.999Z]**: el calendario y el catálogo solo
   muestran publicado/ofertado ese día. Sin `target_date` se conserva el comportamiento histórico
   (primera noche, ventana abierta), que siguen usando la publicación unitaria y la publicación
   masiva desde la lista de habitaciones (sin día seleccionado).
4. Si la fecha ya pasó, el job falla y **no se publica** (misma política que D-85: no se publica una
   ficha cuya noche no se pudo mintear).

## Consecuencias

- Publicar un día concreto es idempotente por noche: si el token ya existe, no se re-mintea; si hay
  un job activo para **otra** fecha de la misma habitación, el encolado falla con un motivo claro.
- El calendario del tablero refleja la intención real (solo el día elegido queda publicado).
- Siguen siendo posibles varias fechas para una misma habitación (una ventana por fecha).
- La publicación unitaria mantiene el modelo anterior (ficha completa + primera noche) porque no
  tiene día seleccionado; si se quiere acotar también, deberá abrirse su propio ciclo.

## Dónde se ve

`packages/shared/src/db/repositories/room-mint-jobs.repository.ts`,
`packages/shared/src/db/repositories/rooms.repository.ts` (`recordPublication` con ventana),
`apps/worker/src/mint-publish-processor.ts`,
`apps/web/src/app/api/admin/rooms/bulk/publish/route.ts`,
`apps/web/src/components/admin/rooms/BoardDayActions.tsx`,
`RepoTecnico/diccionario_datos.md`, `RepoTecnico/diagrama_er.md`, `RepoTecnico/base_datos.sql`.
