# ADR-05 · Check-in anclado on-chain y resguardo de un solo uso

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-05, D-18

## Contexto

El check-in era una marca en base de datos. El servicio se instanciaba sin clientes y devolvía éxito
con `onChainTxDispatched: false`, así que nunca ocurría nada en la cadena y el mismo resguardo servía
indefinidamente.

## Decisión

`markCheckedIn(tokenId)` en `HotelNights` con `RECEPTION_ROLE` es **obligatorio** para dar el check-in.
`markCheckedIn` exige **venta primaria previa** (error `NightNotSold`, D-18) y bloquea `list` y
`buyResale` en noches consumidas.

El servicio **simula antes de difundir** (`simulateContract`), porque una transacción firmada se difunde
aunque vaya a revertir. El resguardo es un JWS con `jti` de un solo uso que se consume en Redis
(`SET NX EX`): un segundo escaneo devuelve 409 `TICKET_YA_USADO`. Un **cerrojo distribuido por noche**
(`RedisCheckInLock`, TTL 15 s) cierra la carrera de dos puestos con dos pases distintos de la misma
noche → 409 `CHECKIN_EN_PROCESO`.

El canje comprueba la titularidad contra `ownerOf` **on-chain**, no contra el índice.

## Consecuencias

- La ruta responde tras difundir, con SLA < 500 ms; medido ~41 ms en servidor.
- El recibo y el evento `CheckedIn` los consolida el worker de forma asíncrona.
- **Deuda declarada**: el anclaje no guarda el hash de la transacción en la base.
- El TTL del cerrojo deja una ventana residual si un anclaje se colgara más de 15 s; la cadena consume
  la noche una sola vez igualmente.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `packages/shared/src/reception/service.ts`, `apps/web/src/app/api/reception/checkin/route.ts`, `apps/web/src/lib/ticket-ownership.ts`, `apps/web/src/lib/reception-guardian.test.ts`.
