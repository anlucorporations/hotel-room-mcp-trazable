# CU-32 · Encontrar una reserva con el código de recuperación — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Recepcionista · Requisitos: RF-33, RF-33.1

## 1. Ficha y trazabilidad

- **Objetivo.** Que el mostrador localice la reserva de un huésped cuando este no puede mostrar el
  QR, tecleando un código corto que empieza por `MDS-`, y que compruebe los datos antes de dar la
  entrada.
- **Actor primario.** Recepcionista (`RECEPTION_ROLE`). **Secundario:** el huésped, que aporta el
  código impreso o dictado (`RepoTecnico/incremento_v2/casos_uso_incremento.md:107`).
- **Requisitos que cubre.** RF-33 y RF-33.1
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:108`). Decisión de diseño asociada: **D-32**,
  código de recuperación determinista por token
  (`packages/shared/src/reception/recovery-code.ts:4`).
- **Precondición.** Sesión válida de recepción y un código `MDS-…` en la mano. La reserva debe
  existir en el índice `nfts` (`RepoTecnico/incremento_v2/casos_uso_incremento.md:107`).
- **Disparador.** Recepción envía el formulario de búsqueda del panel de check-in.
- **Postcondición.** El panel muestra habitación, tipo, fecha y estado de la reserva; si el estado
  es `SOLD`, se habilita el botón de confirmar la entrada
  (`apps/web/src/components/reception/CheckInPanel.tsx:216`).
- **Dónde vive.**
  - Endpoint de búsqueda: `apps/web/src/app/api/reception/reservations/lookup/route.ts:18`.
  - Formato y normalización del código: `packages/shared/src/reception/recovery-code.ts:24`, `:46`.
  - Derivación del código: `packages/shared/src/reception/recovery-code.ts:30`.
  - Consulta: `packages/shared/src/db/repositories/reception.repository.ts:152`.
  - UI: `apps/web/src/components/reception/CheckInPanel.tsx:80` (búsqueda) y `:204` (resultado).
  - Confirmación de entrada: `apps/web/src/app/api/reception/checkin/contingency/route.ts:33`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. Recepción abre la pestaña **Check-in** del panel del día, que monta `CheckInPanel`
   (`apps/web/src/components/reception/ReceptionDashboard.tsx:138`).
2. Escribe el código en el campo `data-testid="recovery-code-input"` y envía el formulario
   (`apps/web/src/components/reception/CheckInPanel.tsx:195`, `:188`).
3. El componente llama a `GET /api/reception/reservations/lookup?code=…` con el valor recortado
   (`apps/web/src/components/reception/CheckInPanel.tsx:87`).
4. El endpoint exige `RECEPTION_ROLE` (`apps/web/src/app/api/reception/reservations/lookup/route.ts:19`),
   lee el parámetro `code` (vacío si falta, `:22`) y lo normaliza con `normalizeRecoveryCode`.
5. `normalizeRecoveryCode` recorta, pasa a mayúsculas y quita espacios
   (`packages/shared/src/reception/recovery-code.ts:47`) y valida contra
   `RECOVERY_CODE_PATTERN` (`:24`). Si no casa, devuelve `null` y la API responde 400
   `CODIGO_INVALIDO` **sin tocar la base**
   (`apps/web/src/app/api/reception/reservations/lookup/route.ts:24`).
6. Con un código válido, rellena códigos pendientes con `ensureRecoveryCodes()`
   (`apps/web/src/app/api/reception/reservations/lookup/route.ts:35`) y busca con
   `findByRecoveryCode(code)` (`:36`).
7. La consulta es un `SELECT` por `recovery_code = $1` sobre `nfts`
   (`packages/shared/src/db/repositories/reception.repository.ts:152`), con el índice único
   parcial que garantiza la unicidad
   (`packages/shared/src/db/migrator.ts:41`).
8. Sin coincidencia, responde 404 `RESERVA_NO_ENCONTRADA`
   (`apps/web/src/app/api/reception/reservations/lookup/route.ts:37`). Con coincidencia, 200
   `{ reservation }` (`:43`).
9. La UI guarda la reserva y pinta el bloque `recovery-result` con habitación, tipo, fecha de
   entrada y estado (`apps/web/src/components/reception/CheckInPanel.tsx:204`, `:208`).
10. Recepción compara los datos con el huésped y pulsa **Confirmar**. El botón se activa solo si el
    estado es `SOLD` (`apps/web/src/components/reception/CheckInPanel.tsx:216`).
11. La confirmación va por el protocolo de contingencia con prueba `VOUCHER_CODE`, el propio código
    como prueba y motivo `RESGUARDO_IMPRESO`
    (`apps/web/src/components/reception/CheckInPanel.tsx:105`).
12. El endpoint de contingencia valida la prueba contra el patrón `^MDS-[A-Z0-9]{6,12}$`
    (`packages/shared/src/reception/service.ts:157`), resuelve la noche por habitación y fecha
    (`:371`) y ancla el check-in on-chain (`:396`).

### 2.2 Validaciones

- **Rol.** `RECEPTION_ROLE` o owner; sin sesión, 401
  (`apps/web/src/app/api/reception/reservations/lookup/route.ts:19`, `apps/web/src/lib/guard.ts:211`).
- **Formato del código.** Se valida **antes** de consultar la base: `MDS-` más 6 a 12 caracteres
  alfanuméricos en mayúsculas (`packages/shared/src/reception/recovery-code.ts:24`, `:46`).
- **Normalización.** `mds-ab12cd34` y `  MDS-AB12CD34 ` localizan la misma reserva
  (`packages/shared/src/reception/recovery-code.ts:47`).
- **Unicidad.** Índice único parcial sobre `recovery_code` cuando no es nulo
  (`packages/shared/src/db/migrator.ts:43`).
- **Estado antes de confirmar.** El botón de confirmar exige `status === "SOLD"`; con
  `CHECKED_IN` o `CHECKED_OUT` queda deshabilitado
  (`apps/web/src/components/reception/CheckInPanel.tsx:216`).
- **Tipo de prueba admitido.** La contingencia solo acepta `WALLET_ADDRESS`, `TX_HASH` o
  `VOUCHER_CODE` (`apps/web/src/app/api/reception/checkin/contingency/route.ts:9`, `:57`).

### 2.3 Efectos on-chain / persistencia

- **Búsqueda:** solo lectura de `nfts` (`packages/shared/src/db/repositories/reception.repository.ts:152`).
- **Relleno de códigos:** `ensureRecoveryCodes()` puede hacer `UPDATE` de `recovery_code` en filas
  nulas con estado vendido o en estancia
  (`packages/shared/src/db/repositories/reception.repository.ts:179`). La derivación es
  determinista: `sha256("hotel-recovery:v1:" + tokenId)` en base32 sin caracteres ambiguos
  (`packages/shared/src/reception/recovery-code.ts:30`, `:17`).
- **Confirmación:** sí hay escritura on-chain. El check-in ancla `markCheckedIn(tokenId)` y marca
  la noche en la base
  (`packages/shared/src/reception/service.ts:396`, `:398`), con registro de la contingencia en
  `recordContingencyCheckIn` (`:399`).
- **Sin datos personales.** El código no es un secreto de autenticación y no concede acceso por sí
  solo (`packages/shared/src/reception/recovery-code.ts:7`); la prueba de contingencia rechaza
  documentos de identidad (`packages/shared/src/reception/service.ts:450`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Búsqueda | `GET /api/reception/reservations/lookup?code=MDS-…` | `apps/web/src/app/api/reception/reservations/lookup/route.ts:18` |
| Confirmar entrada | `POST /api/reception/checkin/contingency` | `apps/web/src/app/api/reception/checkin/contingency/route.ts:33` |
| Normalizador | `normalizeRecoveryCode(raw: string): string \| null` | `packages/shared/src/reception/recovery-code.ts:46` |
| Derivador | `recoveryCodeForToken(tokenId: string): string` | `packages/shared/src/reception/recovery-code.ts:30` |
| Consulta | `findByRecoveryCode(code)` | `packages/shared/src/db/repositories/reception.repository.ts:152` |
| Relleno | `ensureRecoveryCodes()` | `packages/shared/src/db/repositories/reception.repository.ts:169` |
| Servicio | `processContingencyCheckIn(params)` | `packages/shared/src/reception/service.ts:363` |

### 4.2 Eventos y errores canónicos

- **HTTP de la búsqueda:** 200, 400 `CODIGO_INVALIDO`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`,
  404 `RESERVA_NO_ENCONTRADA` y 500 `INTERNAL_SERVER_ERROR`
  (`apps/web/src/app/api/reception/reservations/lookup/route.ts:27`, `:39`, `:48`).
- **Errores del servicio de check-in:** `RESERVA_NO_ENCONTRADA`, `PRUEBA_POSESION_INVALIDA`,
  `PRUEBA_POSESION_CON_PII`, `MOTIVO_INVALIDO`, `CHECKIN_EN_PROCESO`, `YA_CONSUMIDA`,
  `CONTRATO_EN_PAUSA` y `ANCLAJE_FALLIDO`
  (`packages/shared/src/reception/service.ts:10`).
- **Mapeo a HTTP:** el endpoint de check-in traduce por código, no por texto
  (`apps/web/src/app/api/reception/checkin/route.ts:28`).
- **Evento on-chain al confirmar:** `CheckedIn(uint256 indexed tokenId, address indexed by, uint256 timestamp)`
  (`packages/contracts/src/IHotelNights.sol:42`).

### 4.3 Estructuras de datos y almacenamiento

- `DayReservation`: `tokenId`, `roomNumber`, `roomType`, `checkInDate`, `status`, `currentOwner`,
  `recoveryCode` y `checkedInAt`
  (`packages/shared/src/db/repositories/reception.repository.ts:25`).
- Columna `nfts.recovery_code VARCHAR(16) NULL` con índice único parcial
  (`packages/shared/src/db/migrator.ts:41`, `:43`).
- Alfabeto del código: base32 sin `0/O` ni `1/I`, longitud 8
  (`packages/shared/src/reception/recovery-code.ts:17`, `:18`).
- La prueba de posesión se persiste como vocabulario cerrado
  (`packages/shared/src/reception/service.ts:65`) y la contingencia se registra por token
  (`packages/shared/src/reception/service.ts:399`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Código sin prefijo o demasiado corto (`ABCD`) | 400 `CODIGO_INVALIDO`, sin consultar la base | `apps/web/src/app/api/reception/reservations/lookup/route.ts:24` |
| Código con formato válido pero inexistente | 404 `RESERVA_NO_ENCONTRADA` | `apps/web/src/app/api/reception/reservations/lookup/route.ts:37` |
| Código en minúsculas o con espacios | se normaliza y localiza igual | `packages/shared/src/reception/recovery-code.ts:47` |
| Reserva ya consumida (`CHECKED_IN`) | botón de confirmar deshabilitado | `apps/web/src/components/reception/CheckInPanel.tsx:216` |
| Sin sesión | 401 `UNAUTHORIZED` | `apps/web/src/lib/guard.ts:211` |
| Falta `code` en la query | 400 (`raw` vacío ⇒ `null`) | `apps/web/src/app/api/reception/reservations/lookup/route.ts:22` |
| El mostrador teclea un DNI como prueba | 400 `PRUEBA_POSESION_CON_PII` | `packages/shared/src/reception/service.ts:450` |
| Otro puesto confirma la misma noche a la vez | 409 `CHECKIN_EN_PROCESO` | `packages/shared/src/reception/service.ts:381` |
| Fallo de PostgreSQL | 500 `INTERNAL_SERVER_ERROR` | `apps/web/src/app/api/reception/reservations/lookup/route.ts:45` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/reception/reception-v2.test.ts:110`: código inválido da 400 **sin** llamar
  al repositorio (`:111`), código inexistente da 404 (`:117`) y el código en minúsculas se
  normaliza a `MDS-AB12CD34` (`:124`, `:140`).
- `packages/shared/src/reception/recovery-code.test.ts:13`: determinismo (`:14`), distinción entre
  tokens (`:18`), formato (`:22`), normalización (`:30`) y rechazo de formatos inválidos (`:35`).
- `packages/shared/src/db/repositories/reception.repository.test.ts:25`: `findByRecoveryCode`
  devuelve `null` sin fila (`:26`) y mapea la reserva (`:31`).
- `apps/web/src/app/api/reception/reception.test.ts:229`: el rechazo por PII de la contingencia se
  propaga como 400.
- `apps/web/src/app/api/reception/reception.test.ts:192`: tipo de prueba no admitido ⇒ 400.
- `apps/web/e2e/a11y.spec.ts:47`: auditoría de accesibilidad de `/recepcion`.
- **No cubierto:** no hay prueba que confirme la ruta completa búsqueda → confirmación por código
  con base de datos real, ni de que el botón quede deshabilitado en la UI con estado
  `CHECKED_IN`.

## 7. Pendiente de confirmar

- El criterio del documento dice que, si la reserva ya está consumida, «se muestra el estado
  `CHECKED_IN` y se impide repetir el check-in»
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:117`). El impedimento existe (botón
  deshabilitado, `apps/web/src/components/reception/CheckInPanel.tsx:216`), pero no se ha
  confirmado qué mensaje ve el recepcionista más allá del estado en crudo.
- El documento describe el código como «único y estable por token»
  (`casos_uso_incremento.md:140`). El código real es **derivado** del `tokenId` por hash
  (`packages/shared/src/reception/recovery-code.ts:30`), no generado al azar; la unicidad se apoya
  en el índice parcial (`packages/shared/src/db/migrator.ts:43`). Si dos `tokenId` distintos
  colisionaran, el índice lo rechazaría en el `UPDATE` de relleno, pero no se ha medido ese caso.
- El patrón admite 6–12 caracteres (`packages/shared/src/reception/recovery-code.ts:24`), mientras
  el emisor produce siempre 8 (`:18`). Se desconoce si el rango amplio es para compatibilidad con
  resguardos antiguos.
- La confirmación por código reutiliza el endpoint de contingencia con `VOUCHER_CODE`; no existe un
  endpoint propio de «check-in por código». Se documenta así porque es lo que hace el código
  (`apps/web/src/components/reception/CheckInPanel.tsx:105`).
- No se ha localizado en el repositorio la pantalla que **emite** el código al huésped (el panel
  del día solo lo muestra como columna, `apps/web/src/components/reception/DayBoard.tsx:108`); la
  emisión del resguardo vive en `/api/qr/[tokenId]` (`apps/web/src/app/api/qr/[tokenId]/route.ts`),
  fuera del alcance de este CU.
