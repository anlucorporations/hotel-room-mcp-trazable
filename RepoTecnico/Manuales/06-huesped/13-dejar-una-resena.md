# Dejar una reseña

> El huésped que ya ha dormido una noche puede puntuarla y contar su experiencia; la reseña se firma con su cartera, queda pendiente de revisión y solo se publica cuando el hotel la aprueba.

## Qué hace el sistema

El sistema deja reseñar **solo una noche ya consumida**. La API comprueba que la ficha de la noche esté en estado `CHECKED_OUT` antes de aceptar nada (`apps/web/src/app/api/reviews/route.ts:57`). Los estados posibles de una ficha son `AVAILABLE`, `CONFIRMING`, `SOLD`, `BURNED`, `CHECKED_IN` y `CHECKED_OUT` (`packages/shared/src/db/repositories/nfts.repository.ts:12`), y es el flujo de recepción el que marca `CHECKED_OUT` al cerrar la estancia (`packages/shared/src/db/repositories/reception.repository.ts:323`).

Solo puede reseñar el **titular de la noche**. La autoría se demuestra con una **firma EIP-712** de la cartera propietaria (decisión D-59, `RepoTecnico/proceso_propuesto_bloque3.md:45`). La nota viaja **dentro del mensaje firmado**: si la nota enviada no coincide con la firmada, el servidor la rechaza (`apps/web/src/lib/ticket-ownership.ts:187`, `:191`, `:212`). El mensaje se llama `SubmitReview` y su forma está en `packages/shared/src/domain/ticket-auth.ts:43`.

La reseña **no se publica al enviarla**. Nace con estado `PENDING` (`packages/shared/src/db/repositories/reviews.repository.ts:123`) y espera a que el administrador la apruebe o la rechace con un motivo (decisión D-58, `RepoTecnico/proceso_propuesto_bloque3.md:39`). La moderación es **previa**: la página pública solo lee reseñas `APPROVED` (`packages/shared/src/db/repositories/reviews.repository.ts:75`). El estado y el motivo viven en la tabla `reviews` (`RepoTecnico/base_datos.sql:539`, `:546`, `:551`).

La reseña es **anónima**. Se publica la nota, el comentario y el **tipo** de habitación, nunca el número exacto ni datos del huésped (`packages/shared/src/db/repositories/reviews.repository.ts:9`; `RepoTecnico/base_datos.sql:537`). Hay **una reseña por noche**: el `token_id` es único en la tabla (`RepoTecnico/base_datos.sql:541`).

La lista pública con la nota media está en `/resenas` (`apps/web/src/app/resenas/page.tsx:21`). La portada enseña solo tres reseñas como resumen y enlaza a la página completa (`apps/web/src/components/home/HomeSections.tsx:207`, `:212`).

## Recorrido real

1. El huésped entra en `/mis-noches` con su cartera conectada en la red correcta (`apps/web/src/app/mis-noches/page.tsx:9`; `apps/web/src/components/my-nights/MyNights.tsx:39`).
2. Pulsa la pestaña **Pasadas** (`apps/web/src/components/my-nights/MyNights.tsx:126`, `:130`). El filtro considera pasada toda noche anterior a hoy en UTC (`apps/web/src/components/my-nights/MyNights.tsx:55`).
3. En esa pestaña, cada tarjeta ofrece el formulario de reseña: se le pasa `reviewable={tab === "past"}` (`apps/web/src/components/my-nights/MyNights.tsx:168`) y la tarjeta solo lo pinta si `reviewable` es cierto (`apps/web/src/components/my-nights/MyNightCard.tsx:209`).
4. Pulsa el botón **Dejar reseña** (`apps/web/src/components/my-nights/ReviewForm.tsx:26`; texto en `apps/web/messages/es.json:1535`).
5. Elige la **nota** en un desplegable con 5, 4, 3, 2 y 1 estrellas, de más a menos (`apps/web/src/components/my-nights/ReviewForm.tsx:49`, `:54`).
6. Escribe el **comentario**. El campo admite hasta 1000 caracteres (`apps/web/src/components/my-nights/ReviewForm.tsx:63`, `:68`; el mismo tope en `apps/web/src/app/api/reviews/route.ts:12`).
7. Pulsa **Enviar reseña**. El botón se queda en «Enviando…» mientras dura la operación (`apps/web/src/components/my-nights/ReviewForm.tsx:83`; `apps/web/messages/es.json:1541`).
8. La cartera pide la firma. El sistema pide antes un `nonce` de un solo uso, calcula una caducidad de 5 minutos y firma el mensaje `SubmitReview` con el token, la nota, el nonce y la caducidad (`apps/web/src/components/my-nights/useReviewSubmission.ts:25`, `:48`, `:53`, `:54`).
9. Con la firma, el navegador envía `POST /api/reviews` con la dirección, la firma, el nonce y la caducidad en cabeceras (`apps/web/src/components/my-nights/useReviewSubmission.ts:66`, `:69`).
10. El servidor comprueba que la noche existe, que está consumida y que no tiene ya una reseña (`apps/web/src/app/api/reviews/route.ts:53`, `:57`, `:64`), verifica la firma y la titularidad (`apps/web/src/app/api/reviews/route.ts:71`), y guarda la reseña como `PENDING` (`apps/web/src/app/api/reviews/route.ts:75`).
11. El formulario desaparece y se muestra el aviso **«Gracias. Tu reseña queda pendiente de revisión.»** (`apps/web/src/components/my-nights/ReviewForm.tsx:20`; `apps/web/messages/es.json:1542`).
12. El administrador entra en `/admin/resenas` (solo el dueño) y ve las reseñas pendientes (`apps/web/src/app/admin/resenas/page.tsx:7`; `apps/web/src/app/api/admin/reviews/route.ts:18`).
13. Puede **Aprobar** o **Rechazar**, con un motivo opcional, y el sistema pasa la reseña a `APPROVED` o `REJECTED` (`apps/web/src/components/admin/reviews/ReviewsModeration.tsx:78`, `:82`; `apps/web/src/app/api/admin/reviews/[id]/route.ts:33`, `:40`).
14. Si se aprueba, la reseña aparece ya en `/resenas` (`apps/web/src/lib/public-content.ts:163`, `:166`) y, si entra entre las tres primeras, también en la portada (`apps/web/src/components/home/HomeSections.tsx:207`).

## Piezas de código implicadas

- Tarjeta de la noche que ofrece la reseña: `apps/web/src/components/my-nights/MyNightCard.tsx:24`, `:28`, `:209`.
- Pestañas Próximas/Pasadas y cuándo se ofrece reseñar: `apps/web/src/components/my-nights/MyNights.tsx:14`, `:55`, `:130`, `:168`.
- Formulario de reseña (nota, comentario, estados): `apps/web/src/components/my-nights/ReviewForm.tsx:13`, `:20`, `:26`, `:49`, `:63`, `:68`, `:78`.
- Envío y firma EIP-712: `apps/web/src/components/my-nights/useReviewSubmission.ts:25`, `:41`, `:43`, `:48`, `:54`, `:66`, `:87`.
- Tipos del mensaje firmado: `packages/shared/src/domain/ticket-auth.ts:43`.
- Guardián de titularidad de la reseña: `apps/web/src/lib/ticket-ownership.ts:187`, `:191`, `:198`, `:212`.
- API de alta de reseña: `apps/web/src/app/api/reviews/route.ts:12`, `:28`, `:39`, `:53`, `:57`, `:64`, `:71`, `:75`, `:82`.
- Repositorio de reseñas: `packages/shared/src/db/repositories/reviews.repository.ts:71`, `:84`, `:95`, `:107`, `:119`, `:136`, `:146`.
- Moderación de reseñas: `apps/web/src/app/admin/resenas/page.tsx:7`; `apps/web/src/components/admin/reviews/ReviewsModeration.tsx:29`, `:78`, `:142`; `apps/web/src/app/api/admin/reviews/route.ts:18`; `apps/web/src/app/api/admin/reviews/[id]/route.ts:20`, `:40`.
- Página pública de reseñas: `apps/web/src/app/resenas/page.tsx:8`, `:21`, `:33`, `:46`.
- Lectura pública (listado y media): `apps/web/src/lib/public-content.ts:147`, `:160`, `:163`, `:171`.
- Tarjeta de testimonio: `apps/web/src/components/home/TestimonialCard.tsx:12`, `:18`, `:25`, `:27`; estrellas accesibles en `apps/web/src/components/home/Stars.tsx:14`.
- Resumen en la portada (tres reseñas): `apps/web/src/components/home/HomeSections.tsx:195`, `:207`, `:212`.
- Tabla y estados en la base de datos: `RepoTecnico/base_datos.sql:539`, `:541`, `:546`, `:551`, `:555`.
- Textos exactos del formulario y de la moderación: `apps/web/messages/es.json:1518`, `:1535`, `:1542`.

## Datos y estados

- **Nota (`rating`).** Número entero de 1 a 5 (`apps/web/src/app/api/reviews/route.ts:39`; `RepoTecnico/base_datos.sql:544`). En el formulario se elige con estrellas: `★` a `★★★★★` (`apps/web/src/components/my-nights/ReviewForm.tsx:54`).
- **Comentario (`comment`).** Texto opcional, máximo **1000 caracteres** (`apps/web/src/app/api/reviews/route.ts:12`, `:45`). Si va vacío se guarda como `null` (`packages/shared/src/db/repositories/reviews.repository.ts:130`).
- **Estado (`status`).** `PENDING`, `APPROVED` o `REJECTED` (`packages/shared/src/db/repositories/reviews.repository.ts:13`; `RepoTecnico/base_datos.sql:546`). Al crearse es siempre `PENDING` (`packages/shared/src/db/repositories/reviews.repository.ts:123`).
- **Tipo de habitación (`room_type`).** Es lo único que se publica: `simple`, `doble` o `suite` (`apps/web/src/lib/home-view.ts:43`). El número de habitación y el `token_id` no salen nunca al público (`packages/shared/src/db/repositories/reviews.repository.ts:60`, `:68`).
- **Media y número de reseñas.** La media se redondea a 2 decimales y se calcula solo sobre las aprobadas (`packages/shared/src/db/repositories/reviews.repository.ts:86`). Se muestra como «{media} de 5 · {n} reseñas» (`apps/web/messages/es.json:82`).
- **Moderación.** Se guarda quién moderó, cuándo y el motivo, de hasta 200 caracteres (`packages/shared/src/db/repositories/reviews.repository.ts:152`; `RepoTecnico/base_datos.sql:548`, `:551`). Solo se modera una reseña que siga en `PENDING` (`packages/shared/src/db/repositories/reviews.repository.ts:155`; `apps/web/src/app/api/admin/reviews/[id]/route.ts:47`).
- **Etiqueta del huésped.** Cada reseña publicada se cierra con la mención **«Huésped verificado»** (`apps/web/src/components/home/TestimonialCard.tsx:27`; `apps/web/messages/es.json:84`).
- **Orden público.** Las reseñas aprobadas se listan de la más reciente a la más antigua (`packages/shared/src/db/repositories/reviews.repository.ts:76`). La página pide hasta 60 (`apps/web/src/lib/public-content.ts:160`).

## Casos límite y errores

- **La noche no está consumida.** Si la ficha no está en `CHECKED_OUT`, la API responde `409` con «Solo puede reseñarse una noche ya consumida (check-out hecho).» (`apps/web/src/app/api/reviews/route.ts:57`, `:59`).
- **Ya hay reseña.** Si esa noche ya tiene una, responde `409` con «Esta noche ya tiene una reseña enviada.» (`apps/web/src/app/api/reviews/route.ts:64`, `:66`). El índice único lo garantiza también en la base (`RepoTecnico/base_datos.sql:541`; `packages/shared/src/db/repositories/reviews.repository.ts:135`).
- **La noche no existe.** Responde `404` con «Esa noche no existe.» (`apps/web/src/app/api/reviews/route.ts:53`, `:55`).
- **Nota o comentario inválidos.** Sin nota entera entre 1 y 5, responde `400` con «Se requieren tokenId y una nota entera entre 1 y 5.» (`apps/web/src/app/api/reviews/route.ts:39`, `:41`). Un comentario de más de 1000 caracteres responde `400` con «El comentario no puede superar 1000 caracteres.» (`apps/web/src/app/api/reviews/route.ts:45`, `:47`).
- **Firma o titularidad.** Si la firma no cuadra con la cartera propietaria, la API responde `401`; si la titularidad no se puede comprobar, `503` (`apps/web/src/app/api/reviews/route.ts:19`, `:71`; `apps/web/src/lib/ticket-ownership.ts:207`). El guardián repite la nota y exige que sea entera entre 1 y 5 (`apps/web/src/lib/ticket-ownership.ts:198`, `:202`).
- **El huésped cancela la firma.** El navegador muestra «Firma cancelada en tu cartera.» (`apps/web/src/components/my-nights/useReviewSubmission.ts:87`).
- **No hay cartera conectada.** El envío se corta con «Conecta tu cartera para enviar la reseña.» (`apps/web/src/components/my-nights/useReviewSubmission.ts:41`, `:43`).
- **Fallo de red al enviar.** Se muestra «No se pudo enviar la reseña.» (`apps/web/src/components/my-nights/useReviewSubmission.ts:80`, `:87`). Si el error viene de la API, se enseña el mensaje que devuelva (`apps/web/src/components/my-nights/useReviewSubmission.ts:78`, `:80`).
- **Fallo del servidor.** Responde `500` con «No se pudo registrar la reseña.» (`apps/web/src/app/api/reviews/route.ts:88`).
- **No hay reseñas aprobadas.** La página pública lo dice en lugar de quedarse en blanco: «Todavía no hay reseñas publicadas.» (`apps/web/src/app/resenas/page.tsx:47`; `apps/web/messages/es.json:81`).
- **La base no responde.** La lectura pública degrada a lista vacía y media nula, sin inventar opiniones (`apps/web/src/lib/public-content.ts:163`, `:174`).
- **Moderación repetida.** Si otra persona ya moderó esa reseña, la API responde `409` y no la cambia (`apps/web/src/app/api/admin/reviews/[id]/route.ts:47`). La consulta solo toca filas `PENDING` (`packages/shared/src/db/repositories/reviews.repository.ts:155`).
- **Estado vacío en la moderación.** Si no hay reseñas en el estado elegido, se muestra «No hay reseñas en este estado.» (`apps/web/src/components/admin/reviews/ReviewsModeration.tsx:126`; `apps/web/messages/es.json:1524`).

## Referencias

- Decisión **D-59** · Solo el titular on-chain de una noche consumida puede reseñar, con firma EIP-712 (`RepoTecnico/proceso_propuesto_bloque3.md:45`).
- Decisión **D-58** · Moderación previa: toda reseña nace `PENDING` y el administrador la aprueba o rechaza con motivo (`RepoTecnico/proceso_propuesto_bloque3.md:39`).
- Decisión **D-27 / D-28** · Reseñas anónimas y verificadas; se publica el tipo de habitación, nunca el número exacto (`RepoTecnico/base_datos.sql:536`; `RepoTecnico/diccionario_datos.md:488`).
- **ADR-05** · Check-in anclado on-chain y resguardo de un solo uso: es el patrón de firma que la reseña reutiliza (`docs/adr/ADR-05-check-in-on-chain.md:1`).
- **ADR-24** · Minimización de PII y textos legales coherentes (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`).
- **SRS** §7, listado de rutas de la suite pública, que incluye `/resenas` (`docs/SRS.md:309`).
- Resumen de la moderación de reseñas tal como se entregó (F6, D-58/D-59) (`RepoTecnico/estado_proyecto.md:1695`).
- No existe un `CU-XX` canónico para la reseña en el catálogo de 32 casos de uso: va descrita por las decisiones D-27, D-28, D-58 y D-59.
