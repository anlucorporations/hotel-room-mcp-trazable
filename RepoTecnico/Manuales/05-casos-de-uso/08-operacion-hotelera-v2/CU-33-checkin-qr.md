# CU-33 · Dar entrada al cliente escaneando su resguardo — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Recepcionista · Requisitos: RF-33, RF-38

## 1. Ficha y trazabilidad

- **Objetivo.** Que recepción confirme la entrada de un huésped con el resguardo digital que este
  trae (QR/JWS), que la noche quede anclada on-chain y que el panel del día refleje la habitación
  como ocupada al volver.
- **Actor primario.** Recepcionista (`RECEPTION_ROLE`). **Secundario:** el huésped titular, que
  aporta el resguardo (`RepoTecnico/incremento_v2/casos_uso_incremento.md:147`).
- **Requisitos que cubre.** RF-33 y RF-38. El propio documento avisa de que este incremento **no
  reimplementa** el check-in: reutiliza el flujo existente y le añade la integración en el panel del
  día y el refresco posterior (`RepoTecnico/incremento_v2/casos_uso_incremento.md:148`).
- **Precondición.** Reserva en estado `SOLD` y resguardo vigente del titular
  (`casos_uso_incremento.md:147`). El contrato no puede estar en pausa.
- **Disparador.** Recepción pega el resguardo y pulsa el botón de confirmar check-in.
- **Postcondición.** La noche queda `CHECKED_IN` en la base y `markCheckedIn` difundido on-chain;
  el panel muestra el banner verde y, al refrescar, la habitación figura como `OCUPADA`.
- **Dónde vive.**
  - UI: `apps/web/src/components/reception/CheckInPanel.tsx:31` (formulario QR en `:164`) y
    `apps/web/src/components/reception/ReceptionDashboard.tsx:138` (pestaña y refresco).
  - Endpoint: `apps/web/src/app/api/reception/checkin/route.ts:100`.
  - Servicio: `packages/shared/src/reception/service.ts:238`.
  - Contrato: `packages/contracts/src/HotelNights.sol:198`.
  - Derivación de `OCUPADA`: `packages/shared/src/reception/day-board.ts:40`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. Recepción abre la pestaña **Check-in**; el panel monta `CheckInPanel` con el `apiFetch` de la
   sesión y el `onDone` que refresca el día
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:138`).
2. El componente consulta si el contrato está en pausa con `useReadContract` sobre la función
   `paused` del ABI canónico
   (`apps/web/src/components/reception/CheckInPanel.tsx:48`, ABI en
   `packages/shared/src/abi/hotel-nights.ts:547`).
3. El recepcionista pega el resguardo en el área de texto `data-testid="checkin-jws"`
   (`apps/web/src/components/reception/CheckInPanel.tsx:175`). Si el valor trae el fragmento
   `#ticket=`, el componente se queda solo con el JWS (`:62`).
4. `submitQr` hace `POST /api/reception/checkin` con `{ ticketJws }`
   (`apps/web/src/components/reception/CheckInPanel.tsx:63`).
5. El endpoint exige `RECEPTION_ROLE`
   (`apps/web/src/app/api/reception/checkin/route.ts:101`) y rechaza con 400 si falta `ticketJws`
   (`:106`).
6. Construye el servicio de recepción **singleton por proceso** para que dos check-ins simultáneos
   no colisionen en el `nonce` de la hot-wallet
   (`apps/web/src/app/api/reception/checkin/route.ts:56`, `:58`; la wallet se crea desde
   `RECEPTION_WALLET_PRIVATE_KEY` en `:61`).
7. `processTicketCheckIn` verifica el JWS (`packages/shared/src/reception/service.ts:243`), exige
   que el `tokenId` sea numérico (`:254`) y **consume el `jti`** en Redis para que el pase sea de un
   solo uso (`:262`).
8. Adquiere un cerrojo distribuido por noche (`:273`). Si otro puesto lo tiene, libera el `jti` y
   lanza `CHECKIN_EN_PROCESO` (`:275`).
9. Lee el índice off-chain (`:283`) y comprueba la **titularidad on-chain** con `ownerOf` (`:293`),
   porque el contrato no comprueba propiedad en `markCheckedIn` (`:290`).
10. Resuelve tres casos: token inexistente ⇒ `TOKEN_QUEMADO` (`:295`), RPC sin respuesta ⇒
    `TITULARIDAD_NO_VERIFICABLE` (`:301`) y titular distinto ⇒ `TITULARIDAD_CAMBIADA` (`:307`).
11. Comprueba con `assertNotConsumed` que la noche no esté consumida ni quemada (`:325`, `:423`).
12. Ancla on-chain con `anchorCheckInOnChain` (`:327`): simula primero
    `markCheckedIn` (`:547`) y difunde después (`:555`). El ancla va **antes** del marcado
    off-chain (`:329`).
13. Marca la noche en la base con `nftsRepo.markCheckedIn` (`:329`) y devuelve
    `{ status: "CHECKED_IN", tokenId, roomNumber, checkInDate, roomType, onChainTxHash, … }`
    (`:331`).
14. El endpoint añade `processedBy` con el usuario de la sesión
    (`apps/web/src/app/api/reception/checkin/route.ts:118`).
15. La UI pinta el banner verde `data-testid="checkin-success-banner"` con habitación y fecha, y el
    enlace al explorador si hay hash
    (`apps/web/src/components/reception/CheckInPanel.tsx:138`, `:141`, `:146`), limpia el campo
    (`:71`) y llama a `onDone()` (`:72`).
16. `onDone` es el `refresh` del panel del día
    (`apps/web/src/components/reception/ReceptionDashboard.tsx:97`, `:138`), que vuelve a pedir
    `/api/reception/overview`. La noche ahora es `CHECKED_IN`, y el derivador la pinta como
    `OCUPADA` (`packages/shared/src/reception/day-board.ts:40`).

### 2.2 Validaciones

- **Pausa del contrato.** Antes de enviar, el botón de check-in queda deshabilitado si
  `paused` es `true` (`apps/web/src/components/reception/CheckInPanel.tsx:179`) y se muestra el
  aviso `reception-paused` (`:131`).
- **Cuerpo obligatorio.** Sin `ticketJws`, 400 `BAD_REQUEST`
  (`apps/web/src/app/api/reception/checkin/route.ts:106`).
- **Uso único del resguardo.** El `jti` se consume en Redis con `SET NX EX` y TTL de 7 días
  (`packages/shared/src/reception/service.ts:104`, `:262`).
- **Un solo check-in por noche.** Cerrojo `hotel:checkin:lock:{tokenId}` con TTL de 15 segundos
  (`packages/shared/src/reception/service.ts:132`, `:273`).
- **Titularidad real.** Se compara `ownerOf` con la wallet del resguardo
  (`packages/shared/src/reception/service.ts:306`). Si el índice va por detrás, se registra
  `INDEX_OUT_OF_SYNC` sin bloquear (`:315`).
- **Estado y compensación.** `CHECKED_IN` ⇒ `YA_CONSUMIDA` y `BURNED` ⇒ `TOKEN_QUEMADO`
  (`packages/shared/src/reception/service.ts:423`); si un paso falla, el `jti` se libera para
  reintentar salvo que la noche ya estuviera consumida (`:346`).

### 2.3 Efectos on-chain / persistencia

- **On-chain (obligatorio).** `markCheckedIn(uint256 tokenId)`, con `onlyRole(RECEPTION_ROLE)` y
  `whenNotPaused` (`packages/contracts/src/HotelNights.sol:198`). Marca `_checkedIn[tokenId]` y
  emite `CheckedIn` (`:208`, `:209`). Es irreversible.
- **Requisitos del contrato:** el token debe existir (`NightNotAvailable`, `:204`), haber tenido
  venta primaria (`NightNotSold`, `:205`) y no estar ya consumido (`AlreadyCheckedIn`, `:206`).
- **Base de datos.** `nfts.status = 'CHECKED_IN'` y `checked_in_at`
  (`packages/shared/src/reception/service.ts:329`).
- **Cola de anclaje.** Los envíos se serializan para resolver el `nonce` pending
  (`packages/shared/src/reception/service.ts:600`).
- **Aviso operativo.** Si el saldo de la hot-wallet baja del umbral (por defecto 5), se encola una
  alerta a devops sin bloquear el check-in (`packages/shared/src/reception/service.ts:610`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Check-in por QR | `POST /api/reception/checkin` | `apps/web/src/app/api/reception/checkin/route.ts:100` |
| Contingencia (sin QR) | `POST /api/reception/checkin/contingency` | `apps/web/src/app/api/reception/checkin/contingency/route.ts:33` |
| Servicio | `processTicketCheckIn(ticketJws)` | `packages/shared/src/reception/service.ts:238` |
| Ancla | `anchorCheckInOnChain(tokenId)` | `packages/shared/src/reception/service.ts:523` |
| Titularidad | `readCurrentOwnerOnChain(tokenId)` | `packages/shared/src/reception/service.ts:490` |
| Contrato | `markCheckedIn(uint256 tokenId)` | `packages/contracts/src/HotelNights.sol:198` |
| ABI `paused` | `functionName: "paused"` | `packages/shared/src/abi/hotel-nights.ts:547` |

### 4.2 Eventos y errores canónicos

- **Evento on-chain:** `CheckedIn(uint256 indexed tokenId, address indexed by, uint256 timestamp)`
  (`packages/contracts/src/IHotelNights.sol:42`).
- **Errores de contrato:** `NightNotAvailable` (`IHotelNights.sol:68`), `AlreadyCheckedIn` (`:80`) y
  `NightNotSold` (`:83`); la pausa revierte con `EnforcedPause`.
- **Códigos de dominio y HTTP** (`apps/web/src/app/api/reception/checkin/route.ts:28`):
  `TICKET_INVALIDO` 400, `PRUEBA_POSESION_INVALIDA` 400, `TICKET_YA_USADO` 409, `YA_CONSUMIDA` 409,
  `CHECKIN_EN_PROCESO` 409, `TITULARIDAD_CAMBIADA` 409, `NOCHE_NO_VENDIDA` 409,
  `TOKEN_NO_ENCONTRADO` 404, `TOKEN_QUEMADO` 410, `TITULARIDAD_NO_VERIFICABLE` 503,
  `CONTRATO_EN_PAUSA` 503, `ANCLAJE_FALLIDO` 502 y `ANCLAJE_NO_CONFIGURADO` 503.
- **Reconciliación.** `AlreadyCheckedIn` marca la base y lanza `YA_CONSUMIDA`
  (`packages/shared/src/reception/service.ts:568`); `NightNotSold` ⇒ `NOCHE_NO_VENDIDA` (`:575`) y
  `EnforcedPause` ⇒ `CONTRATO_EN_PAUSA` (`:584`).

### 4.3 Estructuras de datos y almacenamiento

- `ReceptionCheckInResult` (`packages/shared/src/reception/service.ts:42`): `status`, `tokenId`,
  `roomNumber`, `checkInDate`, `roomType`, `onChainTxHash`, `onChainAnchor` y `executionTimeMs`.
- `TicketPayload` (JWS): incluye `jti`, `tokenId` y `guestWallet`; se verifica en
  `packages/shared/src/passes/jws.ts` y se consume por `jti`
  (`packages/shared/src/reception/service.ts:5`, `:262`).
- Estado del panel: `CHECKED_IN` se traduce a `OCUPADA`
  (`packages/shared/src/reception/day-board.ts:40`). La contingencia sin QR se registra con
  `recordContingencyCheckIn` (`packages/shared/src/reception/service.ts:399`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Falta `ticketJws` | 400 `BAD_REQUEST` | `apps/web/src/app/api/reception/checkin/route.ts:106` |
| Mismo QR escaneado dos veces | 409 `TICKET_YA_USADO` | `packages/shared/src/reception/service.ts:264` |
| Dos puestos a la vez sobre la misma noche | 409 `CHECKIN_EN_PROCESO` | `packages/shared/src/reception/service.ts:276` |
| Resguardo de un propietario anterior | 409 `TITULARIDAD_CAMBIADA` | `packages/shared/src/reception/service.ts:307` |
| RPC caído al leer `ownerOf` | 503 `TITULARIDAD_NO_VERIFICABLE` | `packages/shared/src/reception/service.ts:301` |
| Noche ya consumida o quemada | 409 `YA_CONSUMIDA` / 410 `TOKEN_QUEMADO` | `packages/shared/src/reception/service.ts:424`, `:430` |
| Contrato en pausa | 503 `CONTRATO_EN_PAUSA` + aviso `reception-paused` | `packages/shared/src/reception/service.ts:584`, `CheckInPanel.tsx:131` |
| Sin wallet de recepción configurada | 503 `ANCLAJE_NO_CONFIGURADO` | `packages/shared/src/reception/service.ts:524` |
| Noche sin venta primaria | 409 `NOCHE_NO_VENDIDA` | `packages/shared/src/reception/service.ts:575` |
| Sin sesión / sin rol | 401 / 403 `UNAUTHORIZED` / `FORBIDDEN` | `apps/web/src/app/api/reception/checkin/route.ts:101` |
| Error en pantalla | `checkin-error-banner` | `apps/web/src/components/reception/CheckInPanel.tsx:158` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/reception/reception.test.ts:54`: 401 sin sesión (`:55`), 403 sin
  `RECEPTION_ROLE` (`:67`) y verificación del rol exigido (`:79`).
- `apps/web/src/app/api/reception/reception.test.ts:124`: el check-in correcto devuelve el hash del
  ancla y `onChainAnchor: "BROADCAST"`.
- `apps/web/src/app/api/reception/reception.test.ts:140`: el segundo escaneo del mismo resguardo da
  409 `TICKET_YA_USADO`.
- `apps/web/src/app/api/reception/reception.test.ts:157`: mapeo de códigos a HTTP (410 quemada, 502
  ancla fallida, 503 sin wallet, 409 consumida, 404 no encontrada).
- `apps/web/src/app/api/reception/reception-v2.test.ts:49`: autorización de las rutas de recepción.
- `packages/shared/src/reception/day-board.test.ts:27`: una noche con `CHECKED_IN` marca la
  habitación como ocupada.
- `apps/web/e2e/a11y.spec.ts:47`: auditoría de accesibilidad de `/recepcion`.
- **No cubierto:** no hay prueba del servicio `ReceptionService` con clientes de cadena simulados
  (uso único, cerrojo, titularidad y compensación), ni prueba de componente del panel.

## 7. Pendiente de confirmar

- El documento dice que los criterios del check-in on-chain «ya están cubiertos por CU-05/CU-14 del
  SRS y sus suites» (`RepoTecnico/incremento_v2/casos_uso_incremento.md:149`), pero no se ha
  localizado esa suite: las pruebas vistas mockean `ReceptionService`
  (`apps/web/src/app/api/reception/reception.test.ts:25`).
- El escenario «Contrato en pausa» pide el botón de confirmar deshabilitado
  (`casos_uso_incremento.md:164`). La pausa deshabilita el envío del QR
  (`apps/web/src/components/reception/CheckInPanel.tsx:179`) y la confirmación por código (`:216`),
  pero `paused` es una consulta de wallet que puede fallar o quedar desactualizada.
- El caso habla de «escanear», pero no hay lector de cámara: el recepcionista pega el JWS en un
  área de texto (`apps/web/src/components/reception/CheckInPanel.tsx:170`). El QR lo genera la
  emisión del resguardo (`apps/web/src/app/api/qr/[tokenId]/send-email/route.ts:91`), fuera del CU.
- El refresco del panel tras el check-in depende de `onDone()` → `refresh()` en el cliente
  (`apps/web/src/components/reception/ReceptionDashboard.tsx:138`); sin sondeo, otro puesto no ve
  la habitación ocupada hasta refrescar a mano (`apps/web/src/components/reception/DayBoard.tsx:55`).
- El CU no define flujo principal ni alternativos propios en el documento fuente; el recorrido se ha
  reconstruido desde el código.
