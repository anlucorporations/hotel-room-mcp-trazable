# CU-31 · La pantalla del día en recepción — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Recepcionista · Requisitos: RF-31, RF-32, RF-38

## 1. Ficha y trazabilidad

- **Objetivo.** Que el mostrador vea de un vistazo, para una fecha, qué reservas hay y cómo están
  las 50 habitaciones del hotel, y que pueda cambiar de fecha sin recargar la aplicación a mano.
- **Actor primario.** Recepcionista (`RECEPTION_ROLE`). **Secundario:** el owner
  (`DEFAULT_ADMIN_ROLE`), que entra a todas las pantallas.
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:64`).
- **Requisitos que cubre.** RF-31, RF-32 y RF-38
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:65`).
- **Precondición.** Sesión válida de recepción o de owner. Sin ella no se sirve ningún dato.
- **Disparador.** Abrir `/recepcion` o cambiar la fecha del selector.
- **Postcondición.** Respuesta `{ date, reservations, rooms, stats }` con las reservas del día y
  las 50 celdas de habitación; en pantalla, la tabla, el contador y la rejilla de estados. No hay
  escritura en base ni en cadena.
- **Dónde vive.**
  - Página: `apps/web/src/app/recepcion/page.tsx:14`.
  - Layout y puerta de servidor: `apps/web/src/app/recepcion/layout.tsx:19`.
  - Componente de pantalla: `apps/web/src/components/reception/ReceptionDashboard.tsx:30`.
  - Endpoint: `apps/web/src/app/api/reception/overview/route.ts:23`.
  - Derivación pura de estados: `packages/shared/src/reception/day-board.ts:34`, `:57`.
  - Maestro de habitaciones: `packages/shared/src/domain/room-master.ts:75`, `:83`.
  - Lectura de datos: `packages/shared/src/db/repositories/reception.repository.ts:139`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. Recepción entra en `/recepcion`. El layout de servidor valida la sesión con
   `currentAdminSession("RECEPTION_ROLE")`; si falla, sirve la pantalla de acceso en lugar del
   panel (`apps/web/src/app/recepcion/layout.tsx:19`, `:20`).
2. La página delega en `ReceptionDashboard` y mantiene el encabezado H1
   (`apps/web/src/app/recepcion/page.tsx:14`, `:19`).
3. El componente arranca con la pestaña `today`, la fecha local del puesto y el `overview` vacío
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:35`). La fecha por defecto se calcula
   en `todayIso()` con el huso del navegador (`:17`).
4. Al haber usuario y rol, llama a `loadOverview(date)`
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:63`), que hace
   `GET /api/reception/overview?date=…` con `session.apiFetch` (`:46`).
5. El endpoint exige `RECEPTION_ROLE` (`apps/web/src/app/api/reception/overview/route.ts:24`),
   toma `date` de la query o usa la fecha del servidor (`:27`) y la valida contra
   `/^\d{4}-\d{2}-\d{2}$/` (`:11`, `:28`).
6. Rellena códigos de recuperación de filas antiguas con `ensureRecoveryCodes()`
   (`apps/web/src/app/api/reception/overview/route.ts:37`, implementación idempotente en
   `packages/shared/src/db/repositories/reception.repository.ts:169`).
7. Lee todas las noches de esa fecha con `listNightsByDate(date)`
   (`apps/web/src/app/api/reception/overview/route.ts:39`, SQL en
   `packages/shared/src/db/repositories/reception.repository.ts:139`).
8. Construye el tablero con `buildRoomBoard(ALL_ROOMS, …)`
   (`apps/web/src/app/api/reception/overview/route.ts:40`). La función pura mapea estados:
   `CONFIRMING→PENDIENTE`, `SOLD→RESERVADA`, `CHECKED_IN→OCUPADA`, `CHECKED_OUT→SALIDA`,
   `BURNED→BLOQUEADA` y todo lo demás a `LIBRE`
   (`packages/shared/src/reception/day-board.ts:34`). Una habitación sin noche ese día queda
   `LIBRE` (`:70`).
9. Filtra las reservas visibles a `SOLD`, `CHECKED_IN` y `CHECKED_OUT`
   (`apps/web/src/app/api/reception/overview/route.ts:44`) y calcula `stats` contando el tablero
   (`:49`).
10. `DayBoard` pinta el selector de fecha y el botón de refresco
    (`apps/web/src/components/reception/DayBoard.tsx:44`), las cinco cifras
    (`:72`), la tabla de reservas con habitación, tipo, estado, código y titular (`:91`) y la
    rejilla de habitaciones con su color por estado (`:123`).
11. Al cambiar la fecha, el estado del componente cambia y el efecto vuelve a llamar a
    `loadOverview` (`apps/web/src/components/reception/ReceptionDashboard.tsx:67`).

### 2.2 Validaciones

- **Sesión.** El endpoint exige `RECEPTION_ROLE`; el owner satisface cualquier requisito
  (`apps/web/src/app/api/reception/overview/route.ts:24`, `apps/web/src/lib/guard.ts:138`).
- **Formato de fecha.** Si no casa con `YYYY-MM-DD`, responde 400 `FECHA_INVALIDA` **sin**
  consultar la base (`apps/web/src/app/api/reception/overview/route.ts:28`).
- **Puerta de UI.** El componente exige `session.hasRole("RECEPTION_ROLE")` antes de pintar el
  panel (`apps/web/src/components/reception/ReceptionDashboard.tsx:61`); sin ese rol muestra el
  aviso `reception-role-denied` (`:86`).
- **Sin sesión.** Se pinta el formulario de acceso en vez de leer datos
  (`apps/web/src/components/reception/ReceptionDashboard.tsx:77`).
- **Límite de peticiones.** El middleware de borde aplica 30 peticiones por minuto y por IP a
  `/api/reception**` (`apps/web/src/middleware.ts:25`).
- **Errores de servidor.** Cualquier fallo de la consulta se devuelve como 500
  `INTERNAL_SERVER_ERROR` con el mensaje del error
  (`apps/web/src/app/api/reception/overview/route.ts:64`).

### 2.3 Efectos on-chain / persistencia

- **Ningún efecto on-chain.** Este CU solo lee.
- **Lectura:** tabla `nfts` (`packages/shared/src/db/schema.sql:9`), filtrando por
  `check_in_date = $1` (`packages/shared/src/db/repositories/reception.repository.ts:139`).
- **Escritura indirecta:** `ensureRecoveryCodes()` puede rellenar `recovery_code` en filas nulas
  con estado `SOLD`, `CHECKED_IN` o `CHECKED_OUT`
  (`packages/shared/src/db/repositories/reception.repository.ts:169`). Es idempotente y acotado.
- **Nada de datos personales:** el titular se muestra como dirección de wallet recortada a 8
  caracteres (`apps/web/src/components/reception/DayBoard.tsx:109`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Endpoint del panel | `GET /api/reception/overview?date=YYYY-MM-DD` | `apps/web/src/app/api/reception/overview/route.ts:23` |
| Respuesta 200 | `{ date, reservations, rooms, stats }` | `apps/web/src/app/api/reception/overview/route.ts:51` |
| Derivador de estado | `roomBoardStatus(status: string): RoomBoardStatus` | `packages/shared/src/reception/day-board.ts:34` |
| Tablero | `buildRoomBoard(rooms, nights)` | `packages/shared/src/reception/day-board.ts:57` |
| Maestro | `ALL_ROOMS` y `ROOM_COUNT` | `packages/shared/src/domain/room-master.ts:83`, `:86` |
| Consulta | `listNightsByDate(date)` | `packages/shared/src/db/repositories/reception.repository.ts:139` |
| Selector de fecha | `data-testid="reception-date"` | `apps/web/src/components/reception/DayBoard.tsx:49` |
| Refresco manual | botón `refresh` | `apps/web/src/components/reception/DayBoard.tsx:55` |

### 4.2 Eventos y errores canónicos

- **Errores HTTP:** 400 `FECHA_INVALIDA`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN` y 500
  `INTERNAL_SERVER_ERROR` (`apps/web/src/app/api/reception/overview/route.ts:30`, `:66`).
- **No emite eventos de dominio ni on-chain.**
- **Estados del panel:** `LIBRE`, `PENDIENTE`, `RESERVADA`, `OCUPADA`, `SALIDA` y `BLOQUEADA`
  (`packages/shared/src/reception/day-board.ts:13`).

### 4.3 Estructuras de datos y almacenamiento

- `DayReservation`: `tokenId`, `roomNumber`, `roomType`, `checkInDate`, `status`, `currentOwner`,
  `recoveryCode` y `checkedInAt`
  (`packages/shared/src/db/repositories/reception.repository.ts:25`).
- `RoomBoardCell`: `roomNumber`, `roomType` y `status`
  (`packages/shared/src/reception/day-board.ts:27`).
- `DayStats`: `totalRooms`, `reserved`, `occupied`, `departures`, `free` y `blocked`
  (`apps/web/src/components/reception/types.ts:24`). **La UI pinta cinco** de las seis; `blocked`
  viaja en la respuesta pero no se muestra como tarjeta
  (`apps/web/src/components/reception/DayBoard.tsx:72`).
- El maestro son 50 habitaciones (planta baja y primera)
  (`packages/shared/src/domain/room-master.ts:75`, `:83`).
- Navegación de la suite: barra superior con `Operaciones` y `Reservas`
  (`apps/web/src/components/reception/FrontOfficeShell.tsx:13`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin cookies de sesión en la API | 401 `UNAUTHORIZED` | `apps/web/src/app/api/reception/overview/route.ts:24`, `apps/web/src/lib/guard.ts:211` |
| Sesión sin `RECEPTION_ROLE` | 403 `FORBIDDEN` | `apps/web/src/lib/guard.ts:138` |
| Sin sesión en la página | formulario de acceso | `apps/web/src/components/reception/ReceptionDashboard.tsx:77` |
| Sesión sin rol de recepción | `reception-role-denied` | `apps/web/src/components/reception/ReceptionDashboard.tsx:86` |
| Fecha mal formada (`15-09-2026`) | 400 `FECHA_INVALIDA` | `apps/web/src/app/api/reception/overview/route.ts:28` |
| Día sin reservas | `reservations-empty` | `apps/web/src/components/reception/DayBoard.tsx:86` |
| Fallo de PostgreSQL | 500 + `reception-error` en pantalla | `apps/web/src/app/api/reception/overview/route.ts:64`, `DayBoard.tsx:65` |
| Más de 30 peticiones/minuto por IP | 429 del WAF de borde | `apps/web/src/middleware.ts:25` |
| Dos filas para la misma habitación y fecha | gana el estado de mayor severidad | `packages/shared/src/reception/day-board.ts:83` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/reception/reception-v2.test.ts:69`: la fecha inválida da 400 y el día
  correcto devuelve exactamente 50 habitaciones y las reservas filtradas (`:76`, `:103`).
- `apps/web/src/app/api/reception/reception-v2.test.ts:50`: 401 sin sesión y `RECEPTION_ROLE` como
  rol exigido.
- `packages/shared/src/reception/day-board.test.ts:9`: traducción de cada estado (`:10`), 50
  habitaciones sin ninguna noche (`:20`), ocupación por check-in (`:27`), tipo del maestro (`:41`)
  y severidad ante duplicados (`:46`).
- `packages/shared/src/domain/room-master.test.ts:14`: `ALL_ROOMS` tiene 50 habitaciones, de 101 a
  220.
- `packages/shared/src/db/repositories/reception.repository.test.ts:12`: repositorio de recepción.
- `apps/web/e2e/a11y.spec.ts:47`: auditoría axe de `/recepcion` y `/recepcion/reservas`.
- **No cubierto:** no hay prueba de componente que verifique el cambio de fecha ni que la rejilla
  pinte los seis estados; tampoco hay e2e navegable del panel del día.

## 7. Pendiente de confirmar

- El flujo alternativo A2 dice que, si el maestro de habitaciones no responde, «se muestran las 50
  habitaciones como libres y un aviso»
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:74`). En el código, un fallo de la consulta
  devuelve 500 (`apps/web/src/app/api/reception/overview/route.ts:64`) y la UI pinta
  `reception-error` con la rejilla **vacía**, no 50 libres
  (`apps/web/src/components/reception/DayBoard.tsx:65`, `:94`). El comportamiento real no coincide
  con el criterio.
- El maestro de las 50 habitaciones es una **constante de código**
  (`packages/shared/src/domain/room-master.ts:83`), no una lectura de la tabla `rooms`; el estado
  sí sale de `nfts` (`apps/web/src/app/api/reception/overview/route.ts:40`). Si el hotel diera de
  baja o añadiera habitaciones por base de datos, el panel no lo reflejaría.
- La fecha por defecto la calcula el **navegador** (`todayIso()`), no una zona horaria fija de
  servidor (`apps/web/src/components/reception/ReceptionDashboard.tsx:17`). No se ha confirmado que
  esto respete siempre `Europe/Madrid` en puestos mal configurados.
- `stats.blocked` se calcula y se envía, pero la franja de cifras solo pinta cinco valores
  (`apps/web/src/components/reception/DayBoard.tsx:72`). Se desconoce si es deliberado.
- El CU cita RF-38 (check-in) como requisito de este caso
  (`casos_uso_incremento.md:65`), pero el panel del día es puramente informativo; RF-38 se
  materializa en CU-33.
