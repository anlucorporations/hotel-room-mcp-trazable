# CU-34 · Dar salida y cerrar la cuenta de la habitación — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Recepcionista · Requisitos: RF-34, RF-34.1

## 1. Ficha y trazabilidad

- **Objetivo.** Cerrar la estancia de una noche que ya tenía la entrada registrada: verificar el
  estado de la habitación, anotar las incidencias, cancelar los cargos adicionales marcados y dejar
  la noche como `CHECKED_OUT`.
- **Actor primario.** Recepcionista (`RECEPTION_ROLE`). **Secundario:** el huésped titular, que
  entrega la habitación (`RepoTecnico/incremento_v2/casos_uso_incremento.md:171`).
- **Requisitos que cubre.** RF-34 y RF-34.1
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:172`; `RepoTecnico/incremento_v2/requerimientos_incremento.md:44`).
- **Precondición.** La noche está en estado `CHECKED_IN`
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:171`). Sin check-in previo, el sistema no
  cierra la estancia.
- **Disparador.** Recepción selecciona la estancia en la pestaña **Check-out** y pulsa
  **Confirmar check-out** (`apps/web/src/components/reception/CheckoutPanel.tsx:287`).
- **Postcondición.** Existe **como mucho una** fila en `stay_checkouts` para el `token_id` (la
  unicidad es la que da la idempotencia, `packages/shared/src/db/migrator.ts:205`), los cargos
  marcados quedan `CANCELLED` y `nfts.status` pasa a `CHECKED_OUT`
  (`packages/shared/src/db/repositories/reception.repository.ts:323`).
- **Dónde vive.**
  - UI: `apps/web/src/components/reception/CheckoutPanel.tsx:28`, montado en la pestaña
    `checkout` de `apps/web/src/components/reception/ReceptionDashboard.tsx:140`.
  - Endpoint: `apps/web/src/app/api/reception/checkout/route.ts:38`.
  - Persistencia: `packages/shared/src/db/repositories/reception.repository.ts:254`.
  - Tablas: `stay_checkouts` y `checkout_incidents` (`packages/shared/src/db/migrator.ts:203`, `:218`).
  - Contrato: **no interviene**; el check-out vive off-chain
    (`packages/shared/src/db/repositories/reception.repository.ts:15`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. Recepción entra en `/recepcion` y pulsa la pestaña **Check-out**
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:104`, `:140`).
2. La pestaña solo recibe las reservas `CHECKED_IN`, filtradas en el cliente
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:143`); la lista sale del panel del día
   (`apps/web/src/app/api/reception/overview/route.ts:44`).
3. Recepción elige la estancia en el desplegable `data-testid="checkout-token"`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:151`). Al cambiar el `tokenId` se limpia la
   selección y se recargan los cargos (`:72`, `:75`).
4. `loadCharges` pide `GET /api/reception/charges?tokenId=…`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:65`), que exige `RECEPTION_ROLE`
   (`apps/web/src/app/api/reception/charges/route.ts:18`) y devuelve la lista
   (`:30`).
5. El recepcionista puede añadir cargos desde el mismo panel (flujo de CU-35)
   (`apps/web/src/components/reception/CheckoutPanel.tsx:78`, `:233`).
6. Marca como **Sin incidencias** o **Con incidencia**
   (`apps/web/src/components/reception/CheckoutPanel.tsx:250`). Con incidencia elige tipo y
   descripción (`:261`), con el vocabulario cerrado de
   `packages/shared/src/reception/checkout-vocabulary.ts:10`.
7. Marca con la casilla los cargos `PENDING` que se cancelan
   (`apps/web/src/components/reception/CheckoutPanel.tsx:206`). El contador avisa de cuántos se
   cancelarán (`:283`).
8. `confirmCheckout` hace `POST /api/reception/checkout` con
   `{ tokenId, roomCondition, notes, incidents, cancelChargeIds }`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:117`).
9. El endpoint valida el cuerpo y llama a `repo.createCheckout(...)` con `processedBy` tomado de la
   sesión (`apps/web/src/app/api/reception/checkout/route.ts:85`, `:91`).
10. El repositorio abre transacción (`:259`), bloquea la fila de la noche con `FOR UPDATE`
    (`:261`) y comprueba si ya existe un check-out para ese `token_id` (`:270`).
11. Si no existe, exige `status === 'CHECKED_IN'` (`:279`); si no, lanza `ESTANCIA_NO_CHECKED_IN`
    (`:280`).
12. Inserta la fila en `stay_checkouts` con habitación, fecha, condición, notas y operador
    (`:286`), y una fila por incidencia en `checkout_incidents` (`:302`).
13. Cancela los cargos indicados que sigan `PENDING` (`:309`) y guarda el total en
    `charges_cancelled` (`:319`).
14. Marca `nfts.status = 'CHECKED_OUT'` (`:323`) y, si la habitación existe en el maestro, la pasa a
    `DIRTY` dejando traza en `housekeeping_room_logs` (`:327`, `:336`, `:341`).
15. Confirma la transacción y devuelve `{ checkout, created }`
    (`packages/shared/src/db/repositories/reception.repository.ts:353`; respuesta en
    `apps/web/src/app/api/reception/checkout/route.ts:94`).
16. La UI pinta el recibo verde `data-testid="checkout-success"`, distinguiendo si se acaba de
    registrar o si ya estaba (`apps/web/src/components/reception/CheckoutPanel.tsx:185`), y llama a
    `onDone()` (`:133`), que refresca el panel del día
    (`apps/web/src/components/reception/ReceptionDashboard.tsx:97`). La habitación figura como
    `SALIDA` (`packages/shared/src/reception/day-board.ts:42`).

### 2.2 Validaciones

- **Sesión y rol.** `requireRole(request, "RECEPTION_ROLE")`
  (`apps/web/src/app/api/reception/checkout/route.ts:39`); sin sesión 401 y con rol insuficiente 403
  (`apps/web/src/app/api/reception/reception-v2.test.ts:60`).
- **`tokenId` obligatorio.** Si falta o no es texto, 400 `CARGO_INVALIDO`
  (`apps/web/src/app/api/reception/checkout/route.ts:51`).
- **Condición de habitación.** Solo `OK` o `INCIDENCIA`, contra la lista cerrada
  (`apps/web/src/app/api/reception/checkout/route.ts:57`; vocabulario en
  `packages/shared/src/reception/checkout-vocabulary.ts:21`).
- **Tipo de incidencia.** El `kind` debe estar en el vocabulario cerrado; si no, 400 `CARGO_INVALIDO`
  (`apps/web/src/app/api/reception/checkout/route.ts:71`).
- **Estado de la estancia.** Solo se cierra una noche `CHECKED_IN`
  (`packages/shared/src/db/repositories/reception.repository.ts:279`); el código
  `ESTANCIA_NO_CHECKED_IN` se traduce a 409 (`apps/web/src/lib/reception-errors.ts:15`).
- **Concurrencia.** El `FOR UPDATE` dentro de la transacción evita que dos puestos dupliquen el
  cierre a la vez (`packages/shared/src/db/repositories/reception.repository.ts:261`).

### 2.3 Efectos on-chain / persistencia

- **On-chain:** ninguno. El contrato canónico solo conoce el check-in; la salida vive en PostgreSQL
  (`packages/shared/src/db/repositories/reception.repository.ts:15`).
- **PostgreSQL:** una fila en `stay_checkouts` por noche (`UNIQUE(token_id)`,
  `packages/shared/src/db/migrator.ts:205`), N filas en `checkout_incidents` (`:218`), los cargos
  marcados a `CANCELLED` con `cancelled_by`/`cancelled_at` (`:232`) y `nfts.status = 'CHECKED_OUT'`
  (`reception.repository.ts:323`).
- **Housekeeping:** la habitación pasa a `DIRTY` y entra en el reparto de limpieza
  (`reception.repository.ts:327`; ver `apps/web/src/app/api/housekeeping/rooms/[id]/status/route.ts:20`).
- **Idempotencia:** un segundo check-out no inserta nada; devuelve el registro existente con
  `created: false` (`packages/shared/src/db/repositories/reception.repository.ts:273`, `:276`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Check-out | `POST /api/reception/checkout` | `apps/web/src/app/api/reception/checkout/route.ts:38` |
| Cargos de la estancia | `GET /api/reception/charges?tokenId=…` | `apps/web/src/app/api/reception/charges/route.ts:17` |
| Persistencia | `ReceptionRepository.createCheckout(input)` | `packages/shared/src/db/repositories/reception.repository.ts:254` |
| Lectura del check-out | `ReceptionRepository.findCheckoutByToken(tokenId)` | `packages/shared/src/db/repositories/reception.repository.ts:241` |
| Panel del día | `GET /api/reception/overview?date=…` | `apps/web/src/app/api/reception/overview/route.ts:23` |

No hay función de contrato asociada a este caso de uso.

### 4.2 Eventos y errores canónicos

- **Eventos on-chain:** ninguno.
- **Códigos de dominio** (`packages/shared/src/reception/errors.ts:7`): `TOKEN_NO_ENCONTRADO`,
  `ESTANCIA_NO_CHECKED_IN` y `CARGO_INVALIDO` (este último reutilizado para el cuerpo inválido del
  check-out).
- **Traducción a HTTP** (`apps/web/src/lib/reception-errors.ts:11`): `TOKEN_NO_ENCONTRADO` 404,
  `ESTANCIA_NO_CHECKED_IN` 409 y `CARGO_INVALIDO` 400.
- **Respuesta correcta:** 200 `{ checkout, created }`; el endpoint no distingue 200 de 201
  (`apps/web/src/app/api/reception/checkout/route.ts:94`).

### 4.3 Estructuras de datos y almacenamiento

- `StayCheckout` (`packages/shared/src/db/repositories/reception.repository.ts:58`): `id`, `tokenId`,
  `roomNumber`, `checkInDate`, `roomCondition`, `notes`, `chargesCancelled`, `processedBy`,
  `createdAt` e `incidents`.
- `CreateCheckoutInput` (`:79`): añade `cancelChargeIds` y `processedBy`.
- `CheckoutIncident` (`:52`): `id`, `kind` y `description`.
- Tabla `stay_checkouts` (`packages/shared/src/db/migrator.ts:203`): `room_condition` cerrado a
  `OK`/`INCIDENCIA` (`:208`), `charges_cancelled` (`:210`) y `processed_by` (`:211`).
- Tabla `checkout_incidents` (`packages/shared/src/db/migrator.ts:218`), con borrado en cascada por
  `checkout_id` (`:220`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión / rol insuficiente | 401 / 403 | `apps/web/src/app/api/reception/checkout/route.ts:39`, `:40` |
| Falta `tokenId` | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/checkout/route.ts:51` |
| `roomCondition` no admitida | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/checkout/route.ts:57` |
| `kind` de incidencia no admitido | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/checkout/route.ts:71` |
| Reserva inexistente | 404 `TOKEN_NO_ENCONTRADO` | `packages/shared/src/db/repositories/reception.repository.ts:266` |
| Noche sin check-in (`SOLD`) | 409 `ESTANCIA_NO_CHECKED_IN` | `packages/shared/src/db/repositories/reception.repository.ts:279` |
| Segundo check-out de la misma noche | 200 con el registro existente (`created: false`) | `packages/shared/src/db/repositories/reception.repository.ts:273` |
| Cargo ya cancelado en la lista | Se ignora (solo se tocan `PENDING`) | `packages/shared/src/db/repositories/reception.repository.ts:310` |
| Cargo de otra estancia en `cancelChargeIds` | Se ignora (filtra por `token_id`) | `packages/shared/src/db/repositories/reception.repository.ts:313` |
| Error en pantalla | `data-testid="checkout-error"` | `apps/web/src/components/reception/CheckoutPanel.tsx:177` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/reception/reception-v2.test.ts:60`: el check-out responde 403 con rol
  insuficiente.
- `apps/web/src/app/api/reception/reception-v2.test.ts:185`: condición de habitación no admitida ⇒
  400.
- `apps/web/src/app/api/reception/reception-v2.test.ts:192`: `ESTANCIA_NO_CHECKED_IN` ⇒ 409.
- `apps/web/src/app/api/reception/reception-v2.test.ts:203`: check-out correcto con dos cargos
  cancelados; comprueba `processedBy` y `cancelChargeIds` (`:222`, `:230`).
- `packages/shared/src/db/repositories/reception.repository.test.ts:166`: registra el check-out y
  cancela cargos.
- `packages/shared/src/db/repositories/reception.repository.test.ts:186`: es idempotente y devuelve
  el existente.
- `packages/shared/src/db/repositories/reception.repository.test.ts:227`: rechaza una noche sin
  entrada.
- `packages/shared/src/reception/day-board.test.ts:13`: `CHECKED_OUT` se pinta como `SALIDA`.
- `apps/web/e2e/a11y.spec.ts:47`: auditoría de accesibilidad de `/recepcion`.
- **No cubierto:** no hay prueba de componente de `CheckoutPanel` ni prueba de la transacción real
  contra PostgreSQL (los tests de repositorio simulan el `pool`). Tampoco hay prueba del bloqueo
  `FOR UPDATE` con dos conexiones simultáneas.

## 7. Pendiente de confirmar

- El código de error del cuerpo inválido del check-out es `CARGO_INVALIDO`
  (`apps/web/src/app/api/reception/checkout/route.ts:53`), pensado para cargos. Funciona, pero el
  nombre no describe el caso; no hay un código propio para el check-out.
- El caso A3 del documento («cancelar un cargo ya cancelado: se ignora y se informa, sin error
  fatal», `casos_uso_incremento.md:183`) se cumple a medias: se ignora en la base
  (`reception.repository.ts:310`), pero la API **no** devuelve un aviso de cuántos se ignoraron;
  solo el total cancelado (`:317`).
- El paso 3 del flujo habla de «selecciona los cargos a cancelar», pero no existe acción de **cobro**
  de los cargos no cancelados: el MVP no los cobra
  (`packages/shared/src/db/migrator.ts:184`). El estado `PAID` está en el vocabulario
  (`reception.repository.ts:36`) y nada lo asigna.
- La idempotencia devuelve el check-out existente aunque la petición traiga otros
  `cancelChargeIds`: no se cancelan cargos nuevos en el reintento
  (`packages/shared/src/db/repositories/reception.repository.ts:273`).
