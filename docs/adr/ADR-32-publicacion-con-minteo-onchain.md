# ADR-32 · Publicación con minteo on-chain obligatorio (unitario y masivo)

- **Estado**: vigente · **Fecha**: 2026-10-21 · **Decisión de origen**: **D-85**
- **Sustituye parcialmente**: el anclaje best-effort desde la wallet del navegador en los flujos de
  publicación del back-office (`RoomsAdmin`).

## Contexto

Hasta esta fecha, publicar una habitación desde el back-office escribía la publicación off-chain y
dejaba el anclaje/registro como **best-effort** desde la wallet del navegador; el minteo de la ventana
solo ocurría en el flujo unitario (D-4). Consecuencias observadas en producción el 2026-10-21:

- Las **49 habitaciones publicadas en masa no quedaron registradas on-chain** (`RoomRegistered` solo
  existía para la 201) y sus publicaciones quedaron `PENDING_ANCHOR`.
- El minteo dependía de que el operador tuviera wallet y `MINTER_ROLE`; la publicación masiva **nunca
  minteaba**.
- La base de datos y la cadena podían divergir sin que el panel lo advirtiera.

El responsable pidió (2026-10-21) que **se minteen los NFT al publicar**, también en la publicación
masiva, y eligió: relayer del servidor, wallet dedicada con roles, **solo la primera noche** por
habitación y **revertir la publicación off-chain si el minteo falla**.

## Decisión

1. **Los endpoints de publicar solo encolan.** `POST /api/admin/rooms/[id]/publish` y
   `POST /api/admin/rooms/bulk/publish` validan (rol, TOTP, descripción ES, foto) y dejan un job en
   `room_mint_jobs`; responden **202 `PENDING_ONCHAIN`** (unitario) o **202 `{queued}`** (masivo).
   El flag `MINT_ON_PUBLISH_ENABLED=true` activa este camino; sin él se conserva el flujo anterior
   (rollback sin desplegar).
2. **El worker relayer ejecuta la cadena de publicación**, en este orden:
   `registerRoom` (si falta) → `publishRoom(contentHash)` → `mint` de la **primera noche** (mañana UTC).
   La hot wallet es **dedicada** y tiene `DEFAULT_ADMIN_ROLE` + `MINTER_ROLE`; su clave vive en el
   secreto `hotel-minter-relayer-private-key` y solo la inyecta el **worker** (la web nunca firma).
3. **La publicación off-chain es la última escritura.** Solo tras confirmar las tres transacciones se
   registra la publicación (`room_publications` con `tx_hash` real), se pone la habitación `PUBLISHED`,
   se indexa la noche en `nfts` con su `txHashMint` y el job pasa a `DONE`. Si algo falla, el job queda
   `FAILED`, la habitación **sigue en DRAFT** y el error se muestra en el listado del back-office.
4. **Idempotencia.** Un único job activo por habitación (índice único parcial); `registerRoom`,
   `publishRoom` y `mint` se comprueban antes de enviarse, de modo que reintentar no duplica nada.
5. **La cola es la tabla** (`room_mint_jobs`), no Redis: el worker la barre cada
   `MINT_ON_PUBLISH_INTERVAL_MS` con `FOR UPDATE SKIP LOCKED` y un cerrojo distribuido por hot wallet
   serializa el envío entre réplicas. Redis caído degrada a instancia única con aviso.

## Consecuencias

- Publicar deja de ser instantáneo: la UI muestra «publicación en curso» y sondea hasta `PUBLISHED` o
  el error (≈2–6 s por habitación en Besu, 2 s/bloque).
- La wallet del navegador ya no es necesaria para publicar; la firma EIP-191 de ADR-30 queda opcional.
- El minteo de la **ventana completa** sigue siendo manual («Acuñar ventana» / «Barrido global»); esta
  decisión solo automatiza la primera noche.
- Si el worker no tiene clave o no está desplegado, las publicaciones quedan `PENDING` y el panel debe
  alertarlo (pendiente: salud dedicada del outbox en `/health`).
- La hot wallet es un punto de custodia nuevo: debe rotarse y monitorizarse su saldo. En este proyecto
  (Besu de pruebas) se creó `0xD439…6Ddf` con 20 ETH y ambos roles.

## Dónde se ve

`packages/shared/src/db/repositories/room-mint-jobs.repository.ts`, `apps/worker/src/mint-publish-relayer.ts`,
`apps/worker/src/mint-publish-processor.ts`, `apps/worker/src/main.ts`, `apps/web/src/lib/mint-on-publish.ts`,
`apps/web/src/app/api/admin/rooms/[id]/publish/route.ts`, `apps/web/src/app/api/admin/rooms/bulk/publish/route.ts`,
`apps/web/src/components/admin/rooms/RoomsAdmin.tsx`, `apps/web/src/components/admin/rooms/BoardDayActions.tsx`.
