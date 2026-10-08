# Salir del hotel y cerrar la cuenta

> El huésped entrega la habitación; recepción verifica cómo quedó, cancela los cargos que no se cobran y deja su noche cerrada, sin que él firme nada.

## Qué hace el sistema

La salida **no tiene pantalla de huésped**. Quien la ejecuta es el puesto de recepción, en `/recepcion` (`apps/web/src/app/recepcion/page.tsx:14`, `:19`). Solo los componentes de recepción llaman a la API del check-out (`apps/web/src/components/reception/CheckoutPanel.tsx:69`, `:122`), y la única lectura de las tablas de la salida en toda la web es la ficha de habitación del propio panel (`apps/web/src/app/api/reception/rooms/[roomNumber]/route.ts:201`, `:202`). El huésped, por tanto, solo entrega la habitación; el resguardo QR que sí usa se gasta en la entrada (CU-33), no aquí.

La pestaña **Check-out** solo ofrece estancias con la entrada ya registrada: el panel filtra las reservas del día por `status === "CHECKED_IN"` (`apps/web/src/components/reception/ReceptionDashboard.tsx:157`). Esas reservas vienen de `GET /api/reception/overview?date=…`, que devuelve las noches de la fecha en estado `SOLD`, `CHECKED_IN` o `CHECKED_OUT` (`apps/web/src/app/api/reception/overview/route.ts:48`, `:50`, `:51`). Al elegir una estancia, el componente recarga solo su lista de cargos y limpia la selección y el recibo anterior (`apps/web/src/components/reception/CheckoutPanel.tsx:76`, `:77`, `:79`).

La confirmación llama a `POST /api/reception/checkout` con el cuerpo `{ tokenId, roomCondition, notes, incidents, cancelChargeIds }` (`apps/web/src/components/reception/CheckoutPanel.tsx:122`, `:125`–`:131`). La ruta exige sesión con rol `RECEPTION_ROLE` (`apps/web/src/app/api/reception/checkout/route.ts:39`) y valida el cuerpo en tres pasos: el identificador de la estancia no puede faltar (`:51`), la condición de la habitación tiene que estar en el vocabulario cerrado (`:57`) y cada incidencia tiene que traer un tipo admitido (`:71`). El operador que firma el cierre queda grabado: `processedBy: auth.session.username` (`:91`).

La escritura la hace `createCheckout`, dentro de una transacción (`packages/shared/src/db/repositories/reception.repository.ts:254`, `:259`):

1. Bloquea la fila de la noche con `FOR UPDATE` para que dos puestos no cierren a la vez (`:261`–`:265`). Si el `tokenId` no está en el índice `nfts`, el error es `TOKEN_NO_ENCONTRADO` (`:266`).
2. Si ya existe una fila en `stay_checkouts` para ese `token_id`, devuelve la existente con `created = false` y **no toca nada más** (`:270`–`:277`). La unicidad de la tabla es lo que da la idempotencia (`RepoTecnico/base_datos.sql:255`).
3. Solo cierra una noche en `CHECKED_IN` (`:279`–`:284`).
4. Inserta la salida en `stay_checkouts` con la habitación, la fecha de la noche, la condición y las notas (`:286`–`:299`), y una fila por incidencia en `checkout_incidents` (`:302`–`:307`).
5. Cancela los cargos marcados: el `UPDATE` solo afecta a las filas de esa estancia que sigan en `PENDING`, deja `cancelled_by` y `cancelled_at`, y usa el motivo por defecto «Cancelado en el check-out» si no había otro (`:309`–`:317`). Cuenta cuántas quedaron canceladas y lo guarda en `charges_cancelled` (`:319`–`:322`).
6. Marca la noche como `CHECKED_OUT` en `nfts` (`:323`).
7. Pasa la habitación a `PENDING_CLEANING` —indispuesta para limpieza y cambio de lencería— y deja traza del cambio en `housekeeping_room_logs` con el valor anterior real (`:330`–`:348`).

Nada de esto va a la cadena y no hay firma de cartera: el contrato canónico solo conoce el check-in, no la salida ni los cargos (`packages/shared/src/db/repositories/reception.repository.ts:15`, `:16`). La ruta del check-out tampoco mira la pausa del contrato, así que un contrato en pausa no impide cerrar la estancia (a diferencia del check-in). Y **el sistema no cobra**: cancela o mantiene apuntados los cargos, sin pasarela de pago ni cargo a la cartera.

## Recorrido real

Lo que hace el huésped:

1. Recoge sus cosas y entrega la habitación y las llaves. No abre ninguna pantalla ni firma ninguna transacción (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:23`).
2. Si quiere repasar la cuenta, se le enseña el desglose en el mostrador: no existe vista de huésped que lea los cargos (`apps/web/src/components/reception/CheckoutPanel.tsx:69`).
3. Espera a que recepción cierre la estancia. El resguardo QR ya se consumió en la entrada (`RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:1`).

Lo que hace recepción, paso a paso:

1. Entra en `/recepcion`. El encabezado dice «Puesto de recepción» con «Reservas del día, estado de las habitaciones, check-in y check-out.» (`apps/web/src/app/recepcion/page.tsx:19`, `:20`; `apps/web/messages/es.json:923`, `:924`). Arriba se lee «Sesión: {username}» (`apps/web/messages/es.json:925`).
2. Sin sesión aparece «Acceso de recepción» con el formulario de credenciales; si la sesión no trae el rol, el aviso es «Tu cuenta no tiene el rol de recepción. Pide a administración que te habilite.» (`apps/web/src/components/reception/ReceptionDashboard.tsx:82`, `:91`; `apps/web/messages/es.json:926`, `:927`).
3. Mientras carga, «Cargando…»; si falla, «No se pudo cargar el panel. Revisa la conexión e inténtalo de nuevo.» (`apps/web/messages/es.json:959`, `:960`).
4. Pulsa la pestaña `Check-out` del conmutador «Secciones de recepción» (`apps/web/src/components/reception/ReceptionDashboard.tsx:105`, `:106`, `:118`; `apps/web/messages/es.json:961`, `:964`).
5. Se lee el título «Check-out» y el aviso «Verifica la habitación y cancela los cargos que correspondan antes de cerrar la estancia.» (`apps/web/src/components/reception/CheckoutPanel.tsx:152`, `:153`; `apps/web/messages/es.json:1005`, `:1006`).
6. Elige la estancia en el desplegable «Estancia con entrada registrada», con la opción vacía «Selecciona una habitación…» y las opciones «Habitación {room} · {date}» (`apps/web/src/components/reception/CheckoutPanel.tsx:156`, `:163`, `:166`; `apps/web/messages/es.json:1007`, `:1008`, `:1009`). Si no hay ninguna, se lee «No hay ninguna estancia con la entrada registrada para esta fecha.» (`apps/web/src/components/reception/CheckoutPanel.tsx:173`; `apps/web/messages/es.json:1011`). Con una elegida, debajo se confirma con «Estancia de la habitación {room} ({date})» (`apps/web/src/components/reception/CheckoutPanel.tsx:178`; `apps/web/messages/es.json:1010`).
7. Revisa «Cargos adicionales»; si no hay, «Esta estancia no tiene cargos.» (`apps/web/src/components/reception/CheckoutPanel.tsx:201`, `:204`; `apps/web/messages/es.json:1012`, `:1013`). Cada fila enseña el concepto, el importe con dos decimales y la moneda, más la etiqueta `Pendiente` o `Cancelado` (`:228`, `:231`; `apps/web/messages/es.json:1014`, `:1015`). Solo las pendientes llevan casilla, con la etiqueta accesible «Cancelar el cargo {concept}» (`:212`, `:224`; `apps/web/messages/es.json:1016`).
8. Pulsa `Confirmar check-out` (`apps/web/src/components/reception/CheckoutPanel.tsx:254`; `apps/web/messages/es.json:1028`). Se abre la ventana flotante «Confirmar check-out» con el subtítulo «Verifica la habitación y cancela los cargos que correspondan antes de cerrar la estancia.» (`:298`–`:302`). En el pie hay dos botones: `Cancelar` y `Confirmar check-out` (`:306`–`:319`); el cierre es la «×» del encabezado, con la etiqueta accesible «Cerrar» (`:303`; `apps/web/messages/es.json:1769`, `:1770`).
9. En «Verificación de la habitación» marca `Sin incidencias` o `Con incidencia` (`apps/web/src/components/reception/CheckoutPanel.tsx:324`, `:327`, `:331`; `apps/web/messages/es.json:1021`, `:1022`, `:1023`).
10. Con incidencia elige el «Tipo de incidencia» y escribe la «Descripción (opcional)» (`apps/web/src/components/reception/CheckoutPanel.tsx:338`, `:341`, `:348`; `apps/web/messages/es.json:1024`, `:1025`). Los tipos se rotulan «Daños», «Falta de limpieza», «Objeto olvidado», «Minibar consumido», «Avería» y «Otro» (`apps/web/messages/es.json:1032`–`:1037`).
11. Puede añadir «Notas (opcional)» (`apps/web/src/components/reception/CheckoutPanel.tsx:353`, `:355`; `apps/web/messages/es.json:1026`). Antes de pulsar, el contador avisa «Se cancelarán {count} de {pending} cargos pendientes.» (`:358`, `:359`; `apps/web/messages/es.json:1027`).
12. Pulsa `Confirmar check-out` en el pie de la ventana; mientras trabaja, el botón pone «Procesando…» (`apps/web/src/components/reception/CheckoutPanel.tsx:311`, `:318`; `apps/web/messages/es.json:1028`, `:992`).
13. Aparece el recibo verde: «Check-out registrado» si acaba de registrarse, o «Esta estancia ya tenía el check-out registrado» si otro puesto se adelantó; debajo, «{count} cargos cancelados» (`apps/web/src/components/reception/CheckoutPanel.tsx:190`, `:191`, `:193`; `apps/web/messages/es.json:1029`, `:1030`, `:1031`). Ese recibo de pantalla **no** imprime la habitación ni la fecha: esos datos están en el desplegable y en la línea de la estancia. El caso de uso CU-34 dice que el recibo trae habitación y fecha (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:67`); el código real no los pinta.
14. El panel se recarga solo (`apps/web/src/components/reception/CheckoutPanel.tsx:139`; `apps/web/src/components/reception/ReceptionDashboard.tsx:158`, `:99`), y la selección de cargos queda vacía (`apps/web/src/components/reception/CheckoutPanel.tsx:136`).
15. Vuelve a la pestaña `Hoy` del conmutador. La tabla «Reservas del día» imprime el estado crudo de la noche, `CHECKED_OUT` (`apps/web/src/components/reception/DayBoard.tsx:111`). En la rejilla «Estado de las habitaciones» la habitación sale como `Pendiente de limpieza`, porque el estado operativo `PENDING_CLEANING` pesa más que `SALIDA` en el orden de severidad (`packages/shared/src/reception/day-board.ts:50`, `:51`, `:94`–`:106`; `apps/web/messages/es.json:979`, `:1041`).
16. Para devolverla al servicio, recepción pulsa la tarjeta de la habitación (`apps/web/src/components/reception/DayBoard.tsx:133`, `:136`; `apps/web/src/components/reception/ReceptionDashboard.tsx:129`, `:136`) y en la ficha «Habitación {roomNumber}» aparece, solo si el estado es `PENDIENTE_LIMPIEZA`, el botón `Liberar habitación` (`apps/web/src/components/reception/RoomDetailPanel.tsx:127`, `:173`, `:181`; `apps/web/messages/es.json:1042`, `:1047`). El aviso de la ficha es «Habitación indispuesta: completa la limpieza y el cambio de lencería antes de liberarla.» (`apps/web/src/components/reception/RoomDetailPanel.tsx:271`, `:272`; `apps/web/messages/es.json:1075`).
17. Al liberar, la habitación pasa a `CLEAN` y el cambio queda en el histórico (`packages/shared/src/db/repositories/reception.repository.ts:407`–`:417`). Es el caso de uso CU-38.

## Piezas de código implicadas

**Huésped (lo único que le toca)**

- No existe pantalla ni ruta de huésped para la salida. La única lectura de `stay_checkouts` y `checkout_incidents` en `apps/web/src` es la ficha de recepción: `apps/web/src/app/api/reception/rooms/[roomNumber]/route.ts:201`, `:202`.
- Resguardo que sí usa el huésped, en la entrada: `RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:1`.
- Extras que consume durante la estancia: `RepoTecnico/Manuales/06-huesped/11-extras-durante-la-estancia.md:1`.

**Pantalla de recepción que cierra la cuenta**

- Página y encabezado: `apps/web/src/app/recepcion/page.tsx:14`, `:19`, `:20`, `:22`.
- Panel, pestañas y filtro de estancias: `apps/web/src/components/reception/ReceptionDashboard.tsx:15`, `:63`, `:82`, `:91`, `:99`, `:105`, `:106`, `:112`, `:118`, `:129`, `:136`, `:154`, `:157`, `:158`.
- Formulario de check-out: `apps/web/src/components/reception/CheckoutPanel.tsx:29`, `:38`, `:41`, `:44`, `:46`, `:52`, `:56`, `:61`, `:63`, `:69`, `:76`, `:79`, `:112`, `:118`, `:122`, `:125`, `:135`, `:139`, `:147`, `:152`, `:156`, `:163`, `:166`, `:173`, `:178`, `:190`, `:191`, `:193`, `:201`, `:204`, `:209`, `:212`, `:224`, `:228`, `:231`, `:246`, `:254`, `:261`, `:298`, `:324`, `:327`, `:331`, `:336`, `:341`, `:348`, `:353`, `:359`.
- Tablero del día: `apps/web/src/components/reception/DayBoard.tsx:8`, `:13`, `:18`, `:50`, `:58`, `:68`, `:111`, `:127`, `:136`, `:140`.
- Ficha de habitación y liberación: `apps/web/src/components/reception/RoomDetailPanel.tsx:9`, `:110`, `:113`, `:127`, `:173`, `:181`, `:271`.

**Rutas de API**

- `POST /api/reception/checkout`: `apps/web/src/app/api/reception/checkout/route.ts:38`, `:39`, `:51`, `:57`, `:67`, `:71`, `:81`, `:85`, `:91`, `:94`, `:96`.
- `GET` y `POST /api/reception/charges`: `apps/web/src/app/api/reception/charges/route.ts:17`, `:18`, `:30`, `:43`, `:44`.
- `GET /api/reception/overview` (de dónde salen las estancias del desplegable): `apps/web/src/app/api/reception/overview/route.ts:23`, `:27`, `:39`, `:43`, `:48`, `:59`.
- `POST /api/reception/rooms/:roomNumber/release`: `apps/web/src/app/api/reception/rooms/[roomNumber]/release/route.ts:13`, `:23`, `:26`, `:35`, `:36`, `:43`.
- Traducción de errores de dominio a HTTP: `apps/web/src/lib/reception-errors.ts:11`, `:20`, `:25`, `:30`.

**Dominio y persistencia**

- Cierre de la estancia: `packages/shared/src/db/repositories/reception.repository.ts:254`, `:259`, `:261`, `:266`, `:270`, `:279`, `:286`, `:302`, `:309`, `:313`, `:319`, `:323`, `:330`, `:338`, `:341`, `:350`, `:354`, `:357`, `:427`.
- Cargos (alta, lectura y cancelación): `packages/shared/src/db/repositories/reception.repository.ts:188`, `:193`, `:197`, `:212`, `:214`, `:224`, `:230`, `:234`.
- Liberación de la habitación: `packages/shared/src/db/repositories/reception.repository.ts:385`, `:397`, `:401`, `:407`, `:411`.
- Vocabulario cerrado del check-out: `packages/shared/src/reception/checkout-vocabulary.ts:10`, `:18`, `:21`, `:22`.
- Estados del tablero y de la ficha: `packages/shared/src/reception/day-board.ts:13`, `:40`, `:50`, `:69`, `:94`, `:109`, `:138`, `:143`.
- Códigos de error estables: `packages/shared/src/reception/errors.ts:7`, `:15`.
- Estados operativos de la habitación: `apps/web/src/lib/room-fields.ts:35`.
- Esquema: `stay_checkouts` (`RepoTecnico/base_datos.sql:253`, `:255`, `:258`, `:260`), `checkout_incidents` (`:267`, `:271`) y `housekeeping_room_logs` (`:721`).

**Textos**

- Bloque del check-out: `apps/web/messages/es.json:1005`–`:1037`.
- Panel, pestañas y avisos: `apps/web/messages/es.json:923`–`:986`.
- Ficha de habitación y liberación: `apps/web/messages/es.json:1041`–`:1075`.
- Etiquetas comunes de la ventana flotante: `apps/web/messages/es.json:1769`, `:1770`.

## Datos y estados

- **Estancia en el cliente (`Reservation`):** `tokenId`, `roomNumber`, `roomType`, `checkInDate`, `status`, `currentOwner`, `recoveryCode` y `checkedInAt` (`apps/web/src/components/reception/types.ts:7`). El estado es `SOLD`, `CHECKED_IN` o `CHECKED_OUT` (`:5`).
- **Cargo en el cliente (`Charge`):** `id`, `tokenId`, `concept`, `amountCents`, `currency`, `status`, `createdBy`, `createdAt`, `cancelledBy`, `cancelledAt` y `cancelReason` (`apps/web/src/components/reception/types.ts:43`).
- **Estados del cargo (`ChargeStatus`):** `PENDING`, `CANCELLED` y `PAID` (`apps/web/src/components/reception/types.ts:41`). El check-out solo cancela los `PENDING`; el estado `PAID` existe en el tipo y en la tabla, pero ninguna pantalla lo produce: el sistema no cobra (pendiente de confirmar).
- **Recibo de salida (`CheckoutReceipt`):** `checkout` (con `id`, `tokenId`, `roomNumber`, `roomCondition`, `chargesCancelled`, `processedBy` e `incidents`) y `created`, que distingue el cierre nuevo del ya existente (`apps/web/src/components/reception/types.ts:57`).
- **Salida en el servidor (`StayCheckout`):** añade `checkInDate`, `notes` y `createdAt` (`packages/shared/src/db/repositories/reception.repository.ts:58`). Cada incidencia (`CheckoutIncident`) es `id`, `kind` y `description` (`:52`).
- **Entrada del cierre (`CreateCheckoutInput`):** `tokenId`, `roomCondition`, `notes`, `incidents`, `cancelChargeIds` y `processedBy` (`packages/shared/src/db/repositories/reception.repository.ts:79`).
- **Condición de la habitación (`CheckoutRoomCondition`):** `OK` o `INCIDENCIA` (`packages/shared/src/reception/checkout-vocabulary.ts:21`).
- **Tipos de incidencia (`CheckoutIncidentKind`):** `DANOS`, `FALTA_LIMPIEZA`, `OBJETO_OLVIDADO`, `MINIBAR_CONSUMIDO`, `AVERIA` y `OTRO` (`packages/shared/src/reception/checkout-vocabulary.ts:10`), que la pantalla rotula «Daños», «Falta de limpieza», «Objeto olvidado», «Minibar consumido», «Avería» y «Otro» (`apps/web/messages/es.json:1032`–`:1037`).
- **Estados de la noche alrededor del cierre:** el índice `nfts` conoce `AVAILABLE`, `CONFIRMING`, `SOLD`, `BURNED`, `CHECKED_IN` y `CHECKED_OUT` (`packages/shared/src/db/repositories/reception.repository.ts:23`); el cierre exige `CHECKED_IN` y deja `CHECKED_OUT` (`:279`, `:323`).
- **Estados operativos de la habitación:** `CLEAN`, `DIRTY`, `OCCUPIED` y `PENDING_CLEANING` (`apps/web/src/lib/room-fields.ts:35`). El cierre la deja en `PENDING_CLEANING` y la liberación la pasa a `CLEAN` (`packages/shared/src/db/repositories/reception.repository.ts:338`, `:408`).
- **Estados del tablero (`RoomBoardStatus`):** `LIBRE`, `PENDIENTE`, `RESERVADA`, `OCUPADA`, `SALIDA`, `PENDIENTE_LIMPIEZA` y `BLOQUEADA` (`packages/shared/src/reception/day-board.ts:13`). El orden de severidad va de `LIBRE` a `BLOQUEADA`, con `PENDIENTE_LIMPIEZA` por encima de `SALIDA` (`:94`–`:102`).
- **Estado de la ficha (`RoomDetailState`):** `LIBRE`, `RESERVADA`, `OCUPADA`, `MANTENIMIENTO` y `PENDIENTE_LIMPIEZA` (`packages/shared/src/reception/day-board.ts:109`). Una noche `CHECKED_OUT` o un estado operativo `PENDING_CLEANING` dan `PENDIENTE_LIMPIEZA` (`:143`).
- **Columnas de `stay_checkouts`:** `token_id VARCHAR(66) UNIQUE` (la unicidad da la idempotencia), `room_number`, `check_in_date`, `room_condition VARCHAR(20)`, `notes`, `charges_cancelled INTEGER`, `processed_by VARCHAR(100)` y `created_at` (`RepoTecnico/base_datos.sql:253`–`:263`).
- **Columnas de `checkout_incidents`:** `checkout_id` con borrado en cascada, `kind VARCHAR(40)`, `description VARCHAR(200)` y `created_at` (`RepoTecnico/base_datos.sql:267`–`:273`).
- **Códigos de error y su HTTP:** `CARGO_INVALIDO` 400, `TOKEN_NO_ENCONTRADO` 404, `ESTANCIA_NO_CHECKED_IN` 409, `HABITACION_NO_ENCONTRADA` 404, `RESERVA_NO_ENCONTRADA` 404 y `CODIGO_INVALIDO` 400 (`packages/shared/src/reception/errors.ts:7`; `apps/web/src/lib/reception-errors.ts:11`). Un error no previsto responde 500 con `INTERNAL_SERVER_ERROR` (`apps/web/src/lib/reception-errors.ts:30`).
- **Mensajes literales de la API:**
  - «Falta el tokenId de la estancia.» (`apps/web/src/app/api/reception/checkout/route.ts:53`).
  - «roomCondition debe ser uno de: OK, INCIDENCIA.» (`apps/web/src/app/api/reception/checkout/route.ts:61`).
  - «Tipo de incidencia no admitido.» (`apps/web/src/app/api/reception/checkout/route.ts:73`).
  - «La reserva no existe.» (`packages/shared/src/db/repositories/reception.repository.ts:267`).
  - «Solo puede hacerse el check-out de una estancia con la entrada ya registrada.» (`packages/shared/src/db/repositories/reception.repository.ts:282`).
  - «El número de habitación no es válido.» (`apps/web/src/app/api/reception/rooms/[roomNumber]/release/route.ts:29`).
  - «La habitación está en estado {previousStatus}; no se puede liberar.» (`apps/web/src/app/api/reception/rooms/[roomNumber]/release/route.ts:43`).
  - «La habitación no existe o está archivada.» (`packages/shared/src/db/repositories/reception.repository.ts:398`).
- **Mensajes literales de la pantalla:**
  - «Verifica la habitación y cancela los cargos que correspondan antes de cerrar la estancia.» (`apps/web/messages/es.json:1006`).
  - «Se cancelarán {count} de {pending} cargos pendientes.» (`apps/web/messages/es.json:1027`).
  - «Check-out registrado» / «Esta estancia ya tenía el check-out registrado» / «{count} cargos cancelados» (`apps/web/messages/es.json:1029`, `:1030`, `:1031`).
  - «No se pudo liberar la habitación.» (`apps/web/messages/es.json:1049`).
  - «Se produjo un error. Inténtalo de nuevo.» (`apps/web/messages/es.json:1004`).

## Casos límite y errores

- **Sin sesión o sin rol.** Las rutas exigen `RECEPTION_ROLE` (`apps/web/src/app/api/reception/checkout/route.ts:39`); sin token válido es **401** y con sesión sin el rol, **403** (`apps/web/src/lib/guard.ts:211`). La pantalla lo explica con «Tu cuenta no tiene el rol de recepción. Pide a administración que te habilite.» (`apps/web/messages/es.json:927`).
- **Estancia sin entrada registrada.** Cerrar una noche que está `SOLD` falla con `ESTANCIA_NO_CHECKED_IN` (409) y «Solo puede hacerse el check-out de una estancia con la entrada ya registrada.» (`packages/shared/src/db/repositories/reception.repository.ts:279`, `:282`). En la práctica el desplegable ya solo ofrece estancias `CHECKED_IN` (`apps/web/src/components/reception/ReceptionDashboard.tsx:157`).
- **Falta el identificador.** Sin `tokenId` la API responde 400 `CARGO_INVALIDO` con «Falta el tokenId de la estancia.» (`apps/web/src/app/api/reception/checkout/route.ts:51`, `:53`).
- **Condición no admitida.** Cualquier valor que no sea `OK` o `INCIDENCIA` se rechaza con 400 y «roomCondition debe ser uno de: OK, INCIDENCIA.» (`apps/web/src/app/api/reception/checkout/route.ts:57`, `:61`), porque el vocabulario es cerrado (`packages/shared/src/reception/checkout-vocabulary.ts:21`).
- **Tipo de incidencia inventado.** Si el tipo no está en la lista, la API responde 400 con «Tipo de incidencia no admitido.» (`apps/web/src/app/api/reception/checkout/route.ts:71`, `:73`).
- **Estancia inexistente.** Si el `tokenId` no está en el índice, el error es `TOKEN_NO_ENCONTRADO` (404) con «La reserva no existe.» (`packages/shared/src/db/repositories/reception.repository.ts:266`, `:267`).
- **Otro puesto ya cerró la estancia.** El check-out es idempotente por `token_id`: el segundo intento devuelve el registro existente con `created = false` y la pantalla lo dice con «Esta estancia ya tenía el check-out registrado» (`packages/shared/src/db/repositories/reception.repository.ts:270`, `:273`, `:276`; `apps/web/messages/es.json:1030`). No se duplica la salida.
- **Cargo ya cancelado o que no es de esa estancia.** El `UPDATE` está acotado a `token_id` y a `status = 'PENDING'`, así que los identificadores repetidos, ya cancelados o ajenos se ignoran sin error y no se cuentan (`packages/shared/src/db/repositories/reception.repository.ts:313`, `:317`).
- **La lectura de cargos falla en silencio.** Si el `GET` de cargos no responde bien, el componente no pinta ningún aviso: solo deja de actualizar la lista (`apps/web/src/components/reception/CheckoutPanel.tsx:70`, `:71`).
- **La habitación no se ve como «Salida».** Aunque el caso de uso CU-34 dice que el panel del día la muestra como `Salida` (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:70`), el cierre siempre deja `PENDING_CLEANING`, y esa severidad es mayor que la de `CHECKED_OUT` (`packages/shared/src/reception/day-board.ts:50`, `:51`, `:94`–`:106`). Por eso la rejilla pinta `Pendiente de limpieza`, mientras la tabla de reservas enseña el estado crudo `CHECKED_OUT` (`apps/web/src/components/reception/DayBoard.tsx:111`). `Salida` solo aparecería si la habitación no existiera en la tabla `rooms` (`packages/shared/src/db/repositories/reception.repository.ts:335`).
- **Etiqueta del estado `PENDIENTE_LIMPIEZA`.** `statusKey` compone la clave como `room` + inicial + resto en minúsculas, lo que da `roomPendiente_limpieza` (`apps/web/src/components/reception/DayBoard.tsx:18`, `:140`), pero el catálogo define `roomPendienteLimpieza` (`apps/web/messages/es.json:1041`). El texto de esa celda está pendiente de confirmar en ejecución.
- **No se puede deshacer.** No hay ruta de borrado ni de modificación de un check-out (`apps/web/src/app/api/reception/checkout/route.ts:38`). El CU-34 confirma que la salida queda cerrada y que, si se eligió mal la estancia, hay que avisar a administración antes de tocar nada más (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:108`).
- **Liberar una habitación que no toca.** Si el estado no es `PENDING_CLEANING`, la API responde 400 con «La habitación está en estado {previousStatus}; no se puede liberar.» y el botón ni siquiera aparece (`apps/web/src/app/api/reception/rooms/[roomNumber]/release/route.ts:39`, `:43`; `apps/web/src/components/reception/RoomDetailPanel.tsx:127`). Si la habitación no existe o está archivada, el error es `HABITACION_NO_ENCONTRADA` (404) con «La habitación no existe o está archivada.» (`packages/shared/src/db/repositories/reception.repository.ts:397`, `:398`).
- **Nada se cobra.** El cierre cancela o mantiene cargos, pero no hay pasarela de pago ni cargo a la cartera, y la pantalla no tiene botón de cobro (el CU-34 lo dice en `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:13`).
- **Nada va a la cadena y nada se firma.** El repositorio lo dice expresamente: el contrato solo conoce el check-in (`packages/shared/src/db/repositories/reception.repository.ts:15`, `:16`). El cuerpo de la petición no lleva firma ni cabeceras de cartera (`apps/web/src/app/api/reception/checkout/route.ts:43`–`:49`).
- **Contrato en pausa.** No afecta a la salida: la ruta del check-out no comprueba la pausa, a diferencia del check-in (`apps/web/src/app/api/reception/checkout/route.ts:38`; `RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:133`).
- **Notas e incidencias con datos personales.** La descripción de la incidencia admite texto libre de hasta 200 caracteres (`RepoTecnico/base_datos.sql:271`) y las notas no tienen tope en el esquema (`:259`). El diseño pide minimización de PII, así que no deben escribirse datos del huésped (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`).
- **Error del servidor no previsto.** Se responde 500 con `INTERNAL_SERVER_ERROR` y el texto del error; el panel muestra ese texto o «Se produjo un error. Inténtalo de nuevo.» (`apps/web/src/lib/reception-errors.ts:30`, `:33`; `apps/web/src/components/reception/CheckoutPanel.tsx:134`, `:141`; `apps/web/messages/es.json:1004`).
- **Hora de salida del hotel.** El código no fija ninguna hora de salida. <!-- PENDIENTE DEL CLIENTE: hora oficial de salida del hotel -->
- **Devolución de llaves y cobro en el mostrador.** El código no registra ni llaves ni cobros. <!-- PENDIENTE DEL CLIENTE: procedimiento de devolución de llaves y de cobro en el mostrador -->

## Referencias

- CU-34 · Dar salida y cerrar la cuenta de la habitación (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:1`).
- CU-34 · versión técnica del repositorio (`RepoTecnico/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:1`).
- CU-34 · flujo principal del incremento v2 (`RepoTecnico/incremento_v2/casos_uso_incremento.md:169`).
- CU-35 · Apuntar los extras del huésped (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-35-cargos-adicionales.md:1`).
- CU-33 · Dar entrada al cliente escaneando su resguardo (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-33-checkin-qr.md:1`).
- CU-38 · Liberar una habitación tras la limpieza (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-38-liberar-habitacion.md:1`).
- CU-34 en el catálogo del SRS, fila de la tabla de casos de uso (`docs/SRS.md:370`).
- RF-34 y RF-34.1 (`RepoTecnico/incremento_v2/requerimientos_incremento.md:43`, `:44`), con su trazabilidad a este caso (`RepoTecnico/incremento_v2/requerimientos_incremento.md:80`).
- RF-50 · la habitación pasa a pendiente de limpieza tras el check-out (`RepoTecnico/requerimientos.md:142`).
- ADR-03 · PostgreSQL como única persistencia (`docs/adr/ADR-03-postgresql-unica-persistencia.md:1`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso (`docs/adr/ADR-05-check-in-on-chain.md:1`) — recuerda qué sí va a la cadena; la salida, no.
- ADR-08 · Fechas `AAAAMMDD` en UTC y caducidad por umbral (`docs/adr/ADR-08-fechas-utc-y-calendario.md:1`).
- ADR-24 · Minimización de PII y textos legales coherentes (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`).
- Esquema de `stay_checkouts` y `checkout_incidents` (`RepoTecnico/base_datos.sql:253`, `:267`).
- Manual hermano del grupo: «Dar entrada con tu resguardo QR» (`RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:1`).
- Manual hermano del grupo: «Extras y cargos durante la estancia» (`RepoTecnico/Manuales/06-huesped/11-extras-durante-la-estancia.md:1`).
- Manual hermano del grupo: «Ver tus noches y su estado» (`RepoTecnico/Manuales/06-huesped/06-mis-noches.md:1`).
