# Extras y cargos durante la estancia

> El huésped consume el extra (minibar, desayuno, late check-out…) y recepción lo apunta en la ficha de su estancia; el huésped no toca ninguna pantalla.

## Qué hace el sistema

Este caso de uso no tiene pantalla de huésped. En `apps/web/src` solo los componentes de recepción llaman a la API de cargos (`apps/web/src/components/reception/CheckoutPanel.tsx:69`, `:92`), y ninguna ruta de la web del huésped lee `additional_charges`. El huésped consume el extra y, si acaso, entrega su resguardo en la entrada; el apunte lo hace el personal de recepción.

El apunte de cargos es estado operativo del hotel, **fuera de la cadena**. El propio repositorio lo dice: el contrato canónico solo conoce el check-in (`markCheckedIn`), no la salida ni los cargos (`packages/shared/src/db/repositories/reception.repository.ts:15`, `:16`). Todo vive en PostgreSQL, en la tabla `additional_charges` (`RepoTecnico/base_datos.sql:237`). Por tanto **no hay firma de cartera ni transacción**: para apuntar un cargo basta una sesión de recepción válida (`apps/web/src/app/api/reception/charges/route.ts:18`, `:44`).

La pantalla real es el **puesto de recepción**, en `/recepcion` (`apps/web/src/app/recepcion/page.tsx:19`, `:22`). La pestaña **Check-out** solo ofrece estancias con la entrada ya registrada: el panel filtra las reservas del día por `status === "CHECKED_IN"` (`apps/web/src/components/reception/ReceptionDashboard.tsx:157`). Esas reservas llegan de `GET /api/reception/overview?date=…`, que devuelve las noches de la fecha en estado `SOLD`, `CHECKED_IN` o `CHECKED_OUT` (`apps/web/src/app/api/reception/overview/route.ts:48`, `:50`, `:51`).

Al elegir una estancia, el componente **recarga sola** su lista de cargos (`apps/web/src/components/reception/CheckoutPanel.tsx:76`, `:79`). Si no hay identificador seleccionado, deja la lista vacía sin llamar a la API (`apps/web/src/components/reception/CheckoutPanel.tsx:65`, `:68`).

La lectura de cargos pasa por `GET /api/reception/charges?tokenId=…`. Exige el rol `RECEPTION_ROLE` (`apps/web/src/app/api/reception/charges/route.ts:18`); sin `tokenId` responde **400** con «Falta el tokenId de la estancia.» (`apps/web/src/app/api/reception/charges/route.ts:21`, `:24`). Si va bien, delega en `listCharges`, que ordena por `created_at DESC`, es decir, del más reciente al más antiguo (`packages/shared/src/db/repositories/reception.repository.ts:212`, `:214`).

El alta pasa por `POST /api/reception/charges` (`apps/web/src/app/api/reception/charges/route.ts:43`). El cuerpo es `{ tokenId, concept, amountCents, currency? }` (documentado en `apps/web/src/app/api/reception/charges/route.ts:40`, `:41`). Las validaciones se reparten en tres capas:

1. En el cliente, el importe escrito en euros se convierte a céntimos redondeando al céntimo: `Math.round(Number.parseFloat(amountEur.replace(",", ".")) * 100)` (`apps/web/src/components/reception/CheckoutPanel.tsx:85`).
2. En el cliente también se comprueba que haya estancia, que el concepto no sea solo espacios y que los céntimos sean un número finito mayor que cero; si falla cualquiera de las tres, se muestra un único aviso y **no se envía nada** (`apps/web/src/components/reception/CheckoutPanel.tsx:86`, `:87`, `:88`).
3. En la API, `tokenId` y `concept` deben ser cadenas (`apps/web/src/app/api/reception/charges/route.ts:55`, `:57`) y `amountCents` un entero (`apps/web/src/app/api/reception/charges/route.ts:61`, `:63`).

Después, el repositorio vuelve a validar por su cuenta: el concepto, ya recortado, debe medir entre 1 y 120 caracteres (`packages/shared/src/db/repositories/reception.repository.ts:189`, `:190`, `:191`) y el importe debe ser un entero positivo (`packages/shared/src/db/repositories/reception.repository.ts:193`, `:194`). Luego comprueba que la noche exista en el índice `nfts` (`packages/shared/src/db/repositories/reception.repository.ts:197`, `:198`) e inserta la fila con la moneda por defecto `EUR` (`packages/shared/src/db/repositories/reception.repository.ts:203`, `:206`). El autor queda grabado: la API pasa `createdBy: auth.session.username` (`apps/web/src/app/api/reception/charges/route.ts:73`).

El cargo nace en estado **`PENDING`** (pendiente), que es el valor por defecto de la tabla (`RepoTecnico/base_datos.sql:243`). El sistema **no cobra**: no hay ninguna pasarela de pago ni cargo a la cartera. Tampoco hay botón de editar ni de borrar un cargo: la única salida es **cancelarlo** al cerrar la cuenta, con `cancelCharges` (`packages/shared/src/db/repositories/reception.repository.ts:224`), que solo toca las filas que sigan en `PENDING` y es idempotente con las ya canceladas o inexistentes (`packages/shared/src/db/repositories/reception.repository.ts:221`, `:234`). Ese cierre es el caso de uso CU-34.

## Recorrido real

Lo que hace el huésped:

1. Consume el extra. No abre ninguna pantalla ni firma nada. El resguardo de check-in solo hace falta en la entrada, no aquí (`RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:1`).
2. Si en la salida quiere repasar la cuenta, lo hace de viva voz en el mostrador: el desglose se lee en la pantalla de recepción.

Lo que hace recepción, paso a paso:

1. Entra en `/recepcion`. El encabezado dice «Puesto de recepción» con la línea «Reservas del día, estado de las habitaciones, check-in y check-out.» (`apps/web/src/app/recepcion/page.tsx:19`, `:20`; `apps/web/messages/es.json:923`, `:924`). Arriba se lee «Sesión: {username}» (`apps/web/messages/es.json:925`).
2. Si no hay sesión, en lugar del panel aparece «Acceso de recepción» con el formulario de credenciales; si la sesión no tiene el rol, el aviso es «Tu cuenta no tiene el rol de recepción. Pide a administración que te habilite.» (`apps/web/src/components/reception/ReceptionDashboard.tsx:82`, `:91`; `apps/web/messages/es.json:926`, `:927`).
3. Mientras carga el panel, el texto es «Cargando…»; si falla, «No se pudo cargar el panel. Revisa la conexión e inténtalo de nuevo.» (`apps/web/messages/es.json:959`, `:960`).
4. Pulsa la pestaña `Check-out` del conmutador «Secciones de recepción» (`apps/web/src/components/reception/ReceptionDashboard.tsx:105`, `:106`, `:118`; `apps/web/messages/es.json:961`, `:964`).
5. En la sección se lee el título «Check-out» y el aviso «Verifica la habitación y cancela los cargos que correspondan antes de cerrar la estancia.» (`apps/web/src/components/reception/CheckoutPanel.tsx:152`, `:153`; `apps/web/messages/es.json:1005`, `:1006`).
6. Elige la estancia en el desplegable rotulado «Estancia con entrada registrada», con la opción vacía «Selecciona una habitación…» (`apps/web/src/components/reception/CheckoutPanel.tsx:156`, `:163`; `apps/web/messages/es.json:1007`, `:1008`). Cada opción se escribe «Habitación {room} · {date}» (`apps/web/src/components/reception/CheckoutPanel.tsx:166`; `apps/web/messages/es.json:1009`).
7. Si no hay ninguna estancia con la entrada hecha, se lee «No hay ninguna estancia con la entrada registrada para esta fecha.» (`apps/web/src/components/reception/CheckoutPanel.tsx:173`; `apps/web/messages/es.json:1011`). Con una estancia elegida, debajo se confirma con «Estancia de la habitación {room} ({date})» (`apps/web/src/components/reception/CheckoutPanel.tsx:178`; `apps/web/messages/es.json:1010`).
8. Al cambiar de estancia, la lista de cargos se recarga sola y se limpia la selección anterior (`apps/web/src/components/reception/CheckoutPanel.tsx:76`, `:77`).
9. La sección «Cargos adicionales» muestra la lista; si está vacía, «Esta estancia no tiene cargos.» (`apps/web/src/components/reception/CheckoutPanel.tsx:201`, `:204`; `apps/web/messages/es.json:1012`, `:1013`).
10. Cada fila enseña el concepto, el importe con dos decimales y la moneda, más la etiqueta `Pendiente` o `Cancelado` (`apps/web/src/components/reception/CheckoutPanel.tsx:228`, `:231`; `apps/web/messages/es.json:1014`, `:1015`). Solo las filas pendientes llevan casilla, con la etiqueta accesible «Cancelar el cargo {concept}» (`apps/web/src/components/reception/CheckoutPanel.tsx:212`, `:224`; `apps/web/messages/es.json:1016`).
11. Pulsa el botón `Añadir cargo` (`apps/web/src/components/reception/CheckoutPanel.tsx:246`; `apps/web/messages/es.json:1019`). Se abre una ventana flotante con el título «Añadir cargo» y el subtítulo «Cargos adicionales»; el pie trae `Cancelar` y `Añadir cargo`, y el cierre es la «×» con la etiqueta accesible `Cerrar` (`apps/web/src/components/reception/CheckoutPanel.tsx:264`, `:265`, `:266`, `:271`, `:280`; `apps/web/src/components/ui/ModalShell.tsx:104`; `apps/web/messages/es.json:1769`, `:1770`).
12. Rellena «Concepto» e «Importe (EUR)» (`apps/web/src/components/reception/CheckoutPanel.tsx:288`, `:292`; `apps/web/messages/es.json:1017`, `:1018`) y confirma con `Añadir cargo`; mientras trabaja, el botón pone «Procesando…» (`apps/web/src/components/reception/CheckoutPanel.tsx:280`; `apps/web/messages/es.json:992`).
13. Si falta concepto o el importe no es mayor que cero, aparece el aviso «Indica un concepto y un importe mayor que cero.» y no se envía nada (`apps/web/src/components/reception/CheckoutPanel.tsx:87`; `apps/web/messages/es.json:1020`).
14. Si sale bien, el formulario se vacía, la ventana se cierra y la lista se recarga; como el orden es del más reciente al más antiguo, el cargo nuevo queda arriba (`apps/web/src/components/reception/CheckoutPanel.tsx:101`, `:102`, `:103`, `:104`; `packages/shared/src/db/repositories/reception.repository.ts:214`).
15. Al cerrar la cuenta, recepción marca las casillas de los cargos que no se cobran; el contador avisa «Se cancelarán {count} de {pending} cargos pendientes.» (`apps/web/src/components/reception/CheckoutPanel.tsx:359`; `apps/web/messages/es.json:1027`) y pulsa `Confirmar check-out` (`apps/web/src/components/reception/CheckoutPanel.tsx:318`; `apps/web/messages/es.json:1028`).
16. El recibo verde dice «Check-out registrado» o, si otro puesto ya lo cerró, «Esta estancia ya tenía el check-out registrado», con la línea «{count} cargos cancelados» (`apps/web/src/components/reception/CheckoutPanel.tsx:191`, `:193`; `apps/web/messages/es.json:1029`, `:1030`, `:1031`).

## Piezas de código implicadas

**Pantalla de recepción que apunta los extras**

- Página y encabezado: `apps/web/src/app/recepcion/page.tsx:14`, `:19`, `:20`, `:22`.
- Panel, pestañas y filtro de estancias en la entrada: `apps/web/src/components/reception/ReceptionDashboard.tsx:15`, `:63`, `:82`, `:91`, `:105`, `:106`, `:112`, `:118`, `:154`, `:157`.
- Formulario de cargos y lista: `apps/web/src/components/reception/CheckoutPanel.tsx:29`, `:38`, `:41`, `:44`, `:45`, `:46`, `:52`, `:53`, `:63`, `:65`, `:69`, `:71`, `:76`, `:79`, `:82`, `:85`, `:86`, `:87`, `:92`, `:95`, `:101`, `:104`, `:147`, `:152`, `:153`, `:156`, `:163`, `:166`, `:173`, `:178`, `:183`, `:198`, `:201`, `:204`, `:209`, `:212`, `:224`, `:228`, `:231`, `:240`, `:246`, `:248`, `:261`, `:264`, `:265`, `:280`, `:285`, `:288`, `:292`.
- Cierre de la cuenta y cancelación de cargos desde la misma pantalla: `apps/web/src/components/reception/CheckoutPanel.tsx:112`, `:122`, `:130`, `:135`, `:147`, `:191`, `:193`, `:298`, `:318`, `:359`.
- Tipos del panel: `apps/web/src/components/reception/types.ts:41`, `:43`, `:57`.

**Rutas de API**

- `GET /api/reception/charges` y `POST /api/reception/charges`: `apps/web/src/app/api/reception/charges/route.ts:17`, `:18`, `:21`, `:24`, `:30`, `:31`, `:43`, `:44`, `:55`, `:57`, `:61`, `:63`, `:68`, `:73`, `:75`, `:77`.
- `POST /api/reception/checkout` (cancela los cargos marcados): `apps/web/src/app/api/reception/checkout/route.ts:38`, `:39`, `:51`, `:57`, `:61`, `:71`, `:73`, `:81`, `:85`, `:91`, `:94`.
- `GET /api/reception/overview` (de dónde salen las estancias del desplegable): `apps/web/src/app/api/reception/overview/route.ts:23`, `:48`, `:50`, `:51`.
- Traducción de errores de dominio a HTTP: `apps/web/src/lib/reception-errors.ts:11`, `:20`, `:21`, `:25`.

**Dominio y persistencia**

- Servicio de datos de cargos y check-out: `packages/shared/src/db/repositories/reception.repository.ts:36`, `:38`, `:71`, `:105`, `:121`, `:188`, `:189`, `:193`, `:197`, `:199`, `:203`, `:212`, `:214`, `:224`, `:230`, `:234`, `:254`, `:266`, `:270`, `:279`, `:282`, `:309`, `:313`, `:317`, `:323`, `:338`.
- Códigos de error estables: `packages/shared/src/reception/errors.ts:7`, `:15`.
- Vocabulario cerrado del check-out (incidencias y estado de la habitación): `packages/shared/src/reception/checkout-vocabulary.ts:10`, `:21`.
- Estado del tablero tras la salida: `packages/shared/src/reception/day-board.ts:48`, `:49`.
- Esquema de `additional_charges`: `RepoTecnico/base_datos.sql:237`, `:239`, `:240`, `:241`, `:242`, `:243`, `:244`, `:245`, `:248`, `:920`.

**Textos**

- Bloque del check-out y de los cargos: `apps/web/messages/es.json:1004`–`:1037`.
- Pestañas y avisos del panel: `apps/web/messages/es.json:923`–`:964`.
- Etiquetas comunes de la ventana flotante: `apps/web/messages/es.json:1769`, `:1770`.

## Datos y estados

- **Cargo (`Charge` en el cliente):** `id`, `tokenId`, `concept`, `amountCents`, `currency`, `status`, `createdBy`, `createdAt`, `cancelledBy`, `cancelledAt` y `cancelReason` (`apps/web/src/components/reception/types.ts:43`).
- **Cargo (`AdditionalCharge` en el servidor):** los mismos campos, con las fechas como `Date` (`packages/shared/src/db/repositories/reception.repository.ts:38`).
- **Estados del cargo (`ChargeStatus`):** `PENDING`, `CANCELLED` y `PAID` (`apps/web/src/components/reception/types.ts:41`; `packages/shared/src/db/repositories/reception.repository.ts:36`). El alta nace en `PENDING`; la pantalla solo distingue `PENDING` de lo demás y pinta `Pendiente` o `Cancelado` (`apps/web/src/components/reception/CheckoutPanel.tsx:209`, `:231`). El estado `PAID` existe en el tipo y en la tabla, pero **ninguna pantalla lo produce**: hoy el sistema no cobra (pendiente de confirmar).
- **Alta de cargo (`CreateChargeInput`):** `tokenId`, `concept`, `amountCents`, `createdBy` y `currency` opcional (`packages/shared/src/db/repositories/reception.repository.ts:71`).
- **Cierre de la estancia (`CreateCheckoutInput`):** `tokenId`, `roomCondition`, `notes`, `incidents`, `cancelChargeIds` y `processedBy` (`packages/shared/src/db/repositories/reception.repository.ts:79`).
- **Recibo de salida (`CheckoutReceipt`):** `checkout` (con `id`, `tokenId`, `roomNumber`, `roomCondition`, `chargesCancelled`, `processedBy` e `incidents`) y `created` (`apps/web/src/components/reception/types.ts:57`).
- **Columnas de `additional_charges`:** `concept VARCHAR(120)`, `amount_cents BIGINT` con `CHECK (amount_cents > 0)`, `currency VARCHAR(3)` por defecto `EUR`, `status VARCHAR(12)` por defecto `PENDING`, `created_by`, `created_at`, `cancelled_by`, `cancelled_at` y `cancel_reason VARCHAR(200)` (`RepoTecnico/base_datos.sql:240`, `:241`, `:242`, `:243`, `:244`, `:248`). Hay índice por `(token_id, status)` (`RepoTecnico/base_datos.sql:920`).
- **Estados de la habitación y de la noche alrededor del flujo:** tras la salida, la noche pasa a `CHECKED_OUT` (`packages/shared/src/db/repositories/reception.repository.ts:323`) y el tablero la traduce a `SALIDA` (`packages/shared/src/reception/day-board.ts:48`, `:49`); la habitación queda en `PENDING_CLEANING` (`packages/shared/src/db/repositories/reception.repository.ts:338`).
- **Códigos de error y su HTTP:** `CARGO_INVALIDO` 400, `TOKEN_NO_ENCONTRADO` 404, `RESERVA_NO_ENCONTRADA` 404, `ESTANCIA_NO_CHECKED_IN` 409 y `HABITACION_NO_ENCONTRADA` 404 (`packages/shared/src/reception/errors.ts:7`; `apps/web/src/lib/reception-errors.ts:11`). Un error no previsto responde 500 con `INTERNAL_SERVER_ERROR` (`apps/web/src/lib/reception-errors.ts:30`, `:35`).
- **Mensajes literales de la API:**
  - «Falta el tokenId de la estancia.» (`apps/web/src/app/api/reception/charges/route.ts:24` y `apps/web/src/app/api/reception/checkout/route.ts:53`).
  - «tokenId y concept son obligatorios.» (`apps/web/src/app/api/reception/charges/route.ts:57`).
  - «amountCents debe ser un entero en céntimos.» (`apps/web/src/app/api/reception/charges/route.ts:63`).
  - «El concepto es obligatorio (máx. 120 caracteres).» (`packages/shared/src/db/repositories/reception.repository.ts:191`).
  - «El importe debe ser un entero positivo en céntimos.» (`packages/shared/src/db/repositories/reception.repository.ts:194`).
  - «La reserva no existe.» (`packages/shared/src/db/repositories/reception.repository.ts:199`).
  - «Solo puede hacerse el check-out de una estancia con la entrada ya registrada.» (`packages/shared/src/db/repositories/reception.repository.ts:282`).
  - «roomCondition debe ser uno de: OK, INCIDENCIA.» (`apps/web/src/app/api/reception/checkout/route.ts:61`).
  - «Tipo de incidencia no admitido.» (`apps/web/src/app/api/reception/checkout/route.ts:73`).
- **Mensajes literales de la pantalla:**
  - «Indica un concepto y un importe mayor que cero.» (`apps/web/messages/es.json:1020`).
  - «Esta estancia no tiene cargos.» (`apps/web/messages/es.json:1013`).
  - «No hay ninguna estancia con la entrada registrada para esta fecha.» (`apps/web/messages/es.json:1011`).
  - «Se cancelarán {count} de {pending} cargos pendientes.» (`apps/web/messages/es.json:1027`).
  - «{count} cargos cancelados» (`apps/web/messages/es.json:1031`).
  - «Se produjo un error. Inténtalo de nuevo.» (`apps/web/messages/es.json:1004`).
- **Tipos de incidencia al verificar la habitación:** `DANOS`, `FALTA_LIMPIEZA`, `OBJETO_OLVIDADO`, `MINIBAR_CONSUMIDO`, `AVERIA` y `OTRO` (`packages/shared/src/reception/checkout-vocabulary.ts:10`), que la pantalla rotula «Daños», «Falta de limpieza», «Objeto olvidado», «Minibar consumido», «Avería» y «Otro» (`apps/web/src/components/reception/CheckoutPanel.tsx:16`, `:342`; `apps/web/messages/es.json:1032`–`:1037`).
- **Catálogo de extras y precios del hotel.** El código no fija ninguna lista de extras ni tarifas: el concepto es texto libre y el importe lo teclea recepción. Ese catálogo no aparece en el repositorio. <!-- PENDIENTE DEL CLIENTE: catálogo de extras del hotel y sus precios -->
- **Qué NO se guarda:** ni datos personales del huésped ni identidad. El titular es su cartera (pseudónima) y los cargos son concepto, importe y el nombre de usuario del operador (`packages/shared/src/db/repositories/reception.repository.ts:18`, `:19`). Sin PII en el concepto por diseño de minimización (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`), aunque el concepto es texto libre y el código no valida su contenido (pendiente de confirmar).

## Casos límite y errores

- **Falta el concepto o el importe no es válido.** Es el caso más habitual. El cliente usa **un solo** aviso para las dos cosas: «Indica un concepto y un importe mayor que cero.» (`apps/web/src/components/reception/CheckoutPanel.tsx:86`, `:87`). El caso de uso CU-35 describe dos avisos distintos; el código real tiene uno (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-35-cargos-adicionales.md:73`–`:74`).
- **Importe cero o negativo.** Se rechaza en las tres capas: el cliente exige `cents > 0` (`apps/web/src/components/reception/CheckoutPanel.tsx:86`), la API exige un entero (`apps/web/src/app/api/reception/charges/route.ts:61`) y la tabla tiene `CHECK (amount_cents > 0)` (`RepoTecnico/base_datos.sql:241`).
- **Céntimos con redondeo.** El importe se convierte a céntimos con `Math.round`, así que un valor con más de dos decimales se redondea al céntimo más cercano; la coma decimal se acepta y se cambia por punto (`apps/web/src/components/reception/CheckoutPanel.tsx:85`).
- **Concepto demasiado largo.** Si supera los 120 caracteres, el repositorio lo rechaza con «El concepto es obligatorio (máx. 120 caracteres).» (`packages/shared/src/db/repositories/reception.repository.ts:190`, `:191`).
- **Estancia inexistente.** Si el `tokenId` no está en `nfts`, el error es `TOKEN_NO_ENCONTRADO` (404) con «La reserva no existe.» (`packages/shared/src/db/repositories/reception.repository.ts:198`, `:199`).
- **Petición sin `tokenId`.** La lectura responde 400 «Falta el tokenId de la estancia.» (`apps/web/src/app/api/reception/charges/route.ts:21`, `:24`).
- **La lectura de cargos falla en silencio.** Si el `GET` no responde bien, el componente **no** pinta ningún error: solo deja de actualizar la lista (`apps/web/src/components/reception/CheckoutPanel.tsx:70`, `:71`). Es una limitación real del código: el fallo de carga no se anuncia.
- **No se puede editar ni borrar un cargo.** No hay ruta de modificación ni de borrado, y no hay botón. La única corrección es cancelarlo al cerrar la cuenta y apuntar otro (`packages/shared/src/db/repositories/reception.repository.ts:224`; `docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-35-cargos-adicionales.md:100`).
- **Cancelar dos veces.** Cancelar es idempotente: el `UPDATE` solo afecta a las filas en `PENDING`, así que los cargos ya cancelados o los identificadores que no existen se ignoran sin error (`packages/shared/src/db/repositories/reception.repository.ts:230`, `:234`).
- **Cerrar la estancia dos veces.** El check-out es idempotente por `token_id`: el segundo intento devuelve el registro existente con `created = false` y la pantalla lo dice («Esta estancia ya tenía el check-out registrado») (`packages/shared/src/db/repositories/reception.repository.ts:270`, `:273`, `:276`; `apps/web/messages/es.json:1030`).
- **Estancia sin entrada registrada.** Cerrar una noche que está `SOLD` falla con `ESTANCIA_NO_CHECKED_IN` (409) y «Solo puede hacerse el check-out de una estancia con la entrada ya registrada.» (`packages/shared/src/db/repositories/reception.repository.ts:279`, `:282`). En la práctica el desplegable ya solo ofrece estancias `CHECKED_IN` (`apps/web/src/components/reception/ReceptionDashboard.tsx:157`).
- **Sin rol de recepción.** Las tres rutas exigen `RECEPTION_ROLE` (`apps/web/src/app/api/reception/charges/route.ts:18`, `:44`; `apps/web/src/app/api/reception/checkout/route.ts:39`). Sin sesión válida es **401**; con sesión pero sin el rol, **403** (`apps/web/src/lib/guard.ts:211`). La pantalla lo explica con «Tu cuenta no tiene el rol de recepción. Pide a administración que te habilite.» (`apps/web/messages/es.json:927`).
- **Error del servidor no previsto.** Se responde 500 con `INTERNAL_SERVER_ERROR` y el texto del error, y el panel muestra ese texto o «Se produjo un error. Inténtalo de nuevo.» (`apps/web/src/lib/reception-errors.ts:30`, `:33`; `apps/web/src/components/reception/CheckoutPanel.tsx:99`, `:106`; `apps/web/messages/es.json:1004`).
- **La moneda.** La interfaz rotula el campo «Importe (EUR)» (`apps/web/messages/es.json:1018`) y la fila imprime la moneda guardada (`apps/web/src/components/reception/CheckoutPanel.tsx:228`). La API admite una moneda opcional y el repositorio usa `EUR` por defecto (`apps/web/src/app/api/reception/charges/route.ts:72`; `packages/shared/src/db/repositories/reception.repository.ts:206`). No hay selector de moneda en la pantalla.
- **Nada de esto va a la cadena.** El apunte del extra y el cierre de la cuenta viven en PostgreSQL; el contrato solo registra el check-in (`packages/shared/src/db/repositories/reception.repository.ts:15`, `:16`; `docs/adr/ADR-03-postgresql-unica-persistencia.md:1`). No hay firma de cartera en este flujo.
- **El huésped no puede consultar ni añadir cargos.** No existe ninguna ruta ni pantalla de huésped que lea `additional_charges`: la única lectura de la tabla fuera del panel de cargos está en la ficha de habitación de recepción (`apps/web/src/app/api/reception/rooms/[roomNumber]/route.ts:194`). La única pantalla de cargos es la de recepción.
- **Datos personales.** El concepto es texto libre: el diseño pide minimización y el registro de viajeros queda fuera de la plataforma, en el PMS del hotel (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`; `docs/adr/ADR-20-registro-de-viajeros-fuera.md:1`).

## Referencias

- CU-35 · Apuntar los extras del huésped (minibar, desayuno…) (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-35-cargos-adicionales.md:1`).
- CU-35 · versión técnica del repositorio (`RepoTecnico/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-35-cargos-adicionales.md:1`).
- CU-34 · Dar salida y cerrar la cuenta de la habitación (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-34-checkout.md:1`).
- CU-33 · Dar entrada al cliente escaneando su resguardo (`docs/Manuales/05-casos-de-uso/08-operacion-hotelera-v2/CU-33-checkin-qr.md:1`).
- Catálogo de casos de uso del SRS, fila de CU-35 («Dar de alta cargos adicionales de una estancia», `RF-35`, tabla `additional_charges`, `D-34`) (`docs/SRS.md:371`).
- ADR-03 · PostgreSQL como única persistencia (`docs/adr/ADR-03-postgresql-unica-persistencia.md:1`).
- ADR-05 · Check-in anclado on-chain y resguardo de un solo uso (`docs/adr/ADR-05-check-in-on-chain.md:1`) — recuerda qué sí va a la cadena; los cargos y la salida, no.
- ADR-20 · El registro de viajeros queda fuera de la plataforma (`docs/adr/ADR-20-registro-de-viajeros-fuera.md:1`).
- ADR-24 · Minimización de PII y textos legales coherentes (`docs/adr/ADR-24-privacidad-y-minimizacion-pii.md:1`).
- Esquema de la tabla de cargos (`RepoTecnico/base_datos.sql:237`).
- Manual hermano del grupo: «Dar entrada con tu resguardo QR» (`RepoTecnico/Manuales/06-huesped/10-entrar-con-tu-qr.md:1`).
- Manual hermano del grupo: «Ver tus noches y su estado» (`RepoTecnico/Manuales/06-huesped/06-mis-noches.md:1`).
