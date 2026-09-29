# CU-35 · Apuntar los extras del huésped (minibar, desayuno…) — Manual técnico

> Bloque 8 · Operación hotelera v2 · Actor: Recepcionista · Requisitos: RF-35

## 1. Ficha y trazabilidad

- **Objetivo.** Que recepción apunte los consumos y extras de una estancia (minibar, desayuno,
  late check-out…) como cargos adicionales, para poder revisarlos y cancelarlos al cerrar la cuenta.
- **Actor primario.** Recepcionista (`RECEPTION_ROLE`)
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:218`).
- **Requisito que cubre.** RF-35 (`RepoTecnico/incremento_v2/casos_uso_incremento.md:219`).
- **Precondición.** La noche está localizada y existe en el índice (estado `SOLD` o `CHECKED_IN`)
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:218`).
- **Disparador.** Recepción rellena **Concepto** e **Importe (EUR)** y pulsa **Añadir cargo**
  (`apps/web/src/components/reception/CheckoutPanel.tsx:242`).
- **Postcondición.** Existe una fila en `additional_charges` en estado `PENDING`
  (`packages/shared/src/db/repositories/reception.repository.ts:203`), visible en la sección de
  check-out de esa estancia.
- **Dónde vive.**
  - UI: `apps/web/src/components/reception/CheckoutPanel.tsx:233` (formulario), dentro de la
    pestaña **Check-out** (`apps/web/src/components/reception/ReceptionDashboard.tsx:140`).
  - Endpoint: `apps/web/src/app/api/reception/charges/route.ts:43` (alta) y `:17` (listado).
  - Persistencia: `packages/shared/src/db/repositories/reception.repository.ts:188`.
  - Tabla: `additional_charges` (`packages/shared/src/db/migrator.ts:185`).
  - Contrato: **no interviene**; los cargos son estado operativo del hotel y viven off-chain
    (`packages/shared/src/db/migrator.ts:179`).

## 2. Recorrido técnico

### 2.1 Camino principal

1. Recepción abre la pestaña **Check-out** y elige la estancia en el desplegable
   (`apps/web/src/components/reception/CheckoutPanel.tsx:151`). Al fijar el `tokenId`, el panel
   carga los cargos existentes (`:72`, `:75`).
2. `loadCharges` llama a `GET /api/reception/charges?tokenId=…`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:65`).
3. El endpoint exige `RECEPTION_ROLE` (`apps/web/src/app/api/reception/charges/route.ts:18`),
   comprueba que llega `tokenId` (`:21`) y pide la lista al repositorio (`:30`).
4. `listCharges` consulta `additional_charges` filtrando por `token_id` y ordena por fecha
   descendente (`packages/shared/src/db/repositories/reception.repository.ts:212`, `:213`).
5. La UI pinta cada cargo con su concepto, importe y moneda
   (`apps/web/src/components/reception/CheckoutPanel.tsx:222`) y una casilla solo para los
   `PENDING` (`:206`); los cancelados salen etiquetados y sin casilla (`:225`).
6. Recepción rellena **Concepto** (`:236`) e **Importe (EUR)** (`:240`) y envía el formulario
   (`:78`).
7. `addCharge` convierte euros a céntimos con `Math.round(parseFloat(...) * 100)`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:81`) y valida en cliente que haya concepto
   y que el importe sea mayor que cero (`:82`); si no, muestra `chargeInvalid`
   (`:83`).
8. Hace `POST /api/reception/charges` con `{ tokenId, concept, amountCents }`
   (`apps/web/src/components/reception/CheckoutPanel.tsx:88`).
9. El endpoint valida que `tokenId` y `concept` sean texto (`charges/route.ts:55`) y que
   `amountCents` sea un **entero** (`:61`); después llama a `repo.createCharge(...)` con
   `createdBy` de la sesión (`:68`, `:73`).
10. `createCharge` recorta el concepto (`reception.repository.ts:189`), valida longitud e importe
    (`:190`, `:193`), comprueba que la noche existe (`:197`) e inserta la fila con moneda `EUR` por
    defecto (`:202`, `:206`).
11. El endpoint responde **201** con `{ charge }` (`apps/web/src/app/api/reception/charges/route.ts:75`).
12. La UI limpia el formulario y recarga la lista para que el cargo nuevo aparezca
    (`apps/web/src/components/reception/CheckoutPanel.tsx:97`, `:99`).
13. Al cerrar la estancia (CU-34), los cargos marcados pasan a `CANCELLED`
    (`apps/web/src/app/api/reception/checkout/route.ts:81`;
    `packages/shared/src/db/repositories/reception.repository.ts:309`).

### 2.2 Validaciones

- **Sesión y rol.** `requireRole(request, "RECEPTION_ROLE")` en ambos métodos
  (`apps/web/src/app/api/reception/charges/route.ts:18`, `:44`). Sin sesión 401; con rol
  insuficiente 403. El test de autorización de recepción cubre el 403 en el check-out
  (`apps/web/src/app/api/reception/reception-v2.test.ts:60`), no en las rutas de cargos.
- **`tokenId` presente.** En el GET, si falta, 400 `CARGO_INVALIDO`
  (`apps/web/src/app/api/reception/charges/route.ts:23`).
- **Cuerpo del alta.** `tokenId` y `concept` deben ser texto; si no, 400 `CARGO_INVALIDO`
  (`apps/web/src/app/api/reception/charges/route.ts:55`).
- **Importe entero.** `amountCents` debe ser un número entero; un decimal como `1.5` da 400
  (`apps/web/src/app/api/reception/charges/route.ts:61`;
  `apps/web/src/app/api/reception/reception-v2.test.ts:150`).
- **Concepto e importe en el dominio.** El concepto vacío o de más de 120 caracteres y el importe
  no positivo se rechazan con `CARGO_INVALIDO`
  (`packages/shared/src/db/repositories/reception.repository.ts:190`, `:193`).
- **La noche debe existir.** Si el `token_id` no está en `nfts`, se lanza `TOKEN_NO_ENCONTRADO`
  (`packages/shared/src/db/repositories/reception.repository.ts:198`), que la API traduce a 404
  (`apps/web/src/lib/reception-errors.ts:14`).

### 2.3 Efectos on-chain / persistencia

- **On-chain:** ninguno. Los cargos no tocan el contrato, que solo conoce el check-in
  (`packages/shared/src/db/repositories/reception.repository.ts:15`).
- **PostgreSQL:** `INSERT INTO additional_charges` con `status = 'PENDING'` por defecto
  (`packages/shared/src/db/migrator.ts:191`), `currency` `EUR` (`:190`) y `created_by` con el
  usuario de la sesión (`:192`).
- **Cancelación:** `cancelCharges` y el check-out solo tocan filas en `PENDING`; dejan
  `cancelled_by`, `cancelled_at` y `cancel_reason`
  (`packages/shared/src/db/repositories/reception.repository.ts:231`, `:233`).
- **Sin cobro:** el MVP **no** cobra los cargos; la tabla los registra para la operación del
  mostrador (`packages/shared/src/db/migrator.ts:184`).
- **Sin datos personales:** el cargo es concepto + importe + autor; el titular es la wallet
  (`packages/shared/src/db/repositories/reception.repository.ts:18`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Referencia |
|---|---|---|
| Listar cargos | `GET /api/reception/charges?tokenId=…` | `apps/web/src/app/api/reception/charges/route.ts:17` |
| Alta de cargo | `POST /api/reception/charges` | `apps/web/src/app/api/reception/charges/route.ts:43` |
| Alta (dominio) | `ReceptionRepository.createCharge(input)` | `packages/shared/src/db/repositories/reception.repository.ts:188` |
| Listado (dominio) | `ReceptionRepository.listCharges(tokenId)` | `packages/shared/src/db/repositories/reception.repository.ts:212` |
| Cancelación | `ReceptionRepository.cancelCharges(tokenId, ids, …)` | `packages/shared/src/db/repositories/reception.repository.ts:224` |
| Cancelación en el cierre | `POST /api/reception/checkout` con `cancelChargeIds` | `apps/web/src/app/api/reception/checkout/route.ts:81` |

No hay función de contrato asociada a este caso de uso.

### 4.2 Eventos y errores canónicos

- **Eventos on-chain:** ninguno.
- **Códigos de dominio** (`packages/shared/src/reception/errors.ts:7`): `CARGO_INVALIDO` y
  `TOKEN_NO_ENCONTRADO`.
- **Traducción a HTTP** (`apps/web/src/lib/reception-errors.ts:11`): `CARGO_INVALIDO` 400,
  `TOKEN_NO_ENCONTRADO` 404.
- **Estados del cargo:** `PENDING`, `CANCELLED` y `PAID`
  (`packages/shared/src/db/repositories/reception.repository.ts:36`); el alta siempre crea
  `PENDING`.

### 4.3 Estructuras de datos y almacenamiento

- `AdditionalCharge` (`packages/shared/src/db/repositories/reception.repository.ts:38`): `id`,
  `tokenId`, `concept`, `amountCents`, `currency`, `status`, `createdBy`, `createdAt`,
  `cancelledBy`, `cancelledAt` y `cancelReason`.
- `CreateChargeInput` (`:71`): `tokenId`, `concept`, `amountCents`, `createdBy` y `currency`
  opcional.
- Tabla `additional_charges` (`packages/shared/src/db/migrator.ts:185`): `amount_cents BIGINT` con
  `CHECK (amount_cents > 0)` (`:189`), `concept VARCHAR(120)` (`:188`), `currency` por defecto
  `EUR` (`:190`) y `status` por defecto `PENDING` (`:191`).
- Índice `idx_charges_token (token_id, status)` (`packages/shared/src/db/migrator.ts:199`).
- `Charge` en el cliente (`apps/web/src/components/reception/types.ts:42`) y su estado
  `ChargeStatus` (`:40`).

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sin sesión / sin rol | 401 / 403 | `apps/web/src/app/api/reception/charges/route.ts:18`, `:44` |
| GET sin `tokenId` | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/charges/route.ts:23` |
| Alta sin `tokenId` o sin `concept` de tipo texto | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/charges/route.ts:55` |
| Importe decimal (`1.5`) | 400 `CARGO_INVALIDO` | `apps/web/src/app/api/reception/charges/route.ts:61` |
| Concepto vacío o solo espacios | 400 `CARGO_INVALIDO` | `packages/shared/src/db/repositories/reception.repository.ts:190` |
| Concepto de más de 120 caracteres | 400 `CARGO_INVALIDO` | `packages/shared/src/db/repositories/reception.repository.ts:190` |
| Importe 0 o negativo | 400 `CARGO_INVALIDO` | `packages/shared/src/db/repositories/reception.repository.ts:193` |
| `tokenId` inexistente | 404 `TOKEN_NO_ENCONTRADO` | `packages/shared/src/db/repositories/reception.repository.ts:198` |
| Formulario incompleto en la UI | `chargeInvalid` | `apps/web/src/components/reception/CheckoutPanel.tsx:83` |
| Error en pantalla | `data-testid="checkout-error"` | `apps/web/src/components/reception/CheckoutPanel.tsx:177` |
| Estancia sin cargos | `data-testid="charges-empty"` | `apps/web/src/components/reception/CheckoutPanel.tsx:197` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/reception/reception-v2.test.ts:145`: el GET sin `tokenId` responde 400.
- `apps/web/src/app/api/reception/reception-v2.test.ts:150`: importe no entero ⇒ 400
  `CARGO_INVALIDO`.
- `apps/web/src/app/api/reception/reception-v2.test.ts:158`: alta correcta ⇒ 201 con el cargo y
  `createdBy` de la sesión (`:178`).
- `packages/shared/src/db/repositories/reception.repository.test.ts:56`: concepto vacío ⇒
  `CARGO_INVALIDO`.
- `packages/shared/src/db/repositories/reception.repository.test.ts:62`: importe no positivo ⇒
  `CARGO_INVALIDO`.
- `packages/shared/src/db/repositories/reception.repository.test.ts:68`: token inexistente ⇒
  `TOKEN_NO_ENCONTRADO`.
- `packages/shared/src/db/repositories/reception.repository.test.ts:75`: inserta el cargo y lo
  mapea.
- `packages/shared/src/db/repositories/reception.repository.test.ts:109`: `cancelCharges` no
  consulta la base si no hay ids.
- `apps/web/e2e/a11y.spec.ts:47`: auditoría de accesibilidad de `/recepcion`.
- **No cubierto:** no hay prueba de componente del formulario de alta ni prueba de la cancelación
  efectiva de cargos dentro del check-out (el test de la API usa un repositorio simulado).

## 7. Pendiente de confirmar

- El documento exige que un concepto vacío devuelva 400 `CARGO_INVALIDO`
  (`RepoTecnico/incremento_v2/casos_uso_incremento.md:230`). La ruta **no** lo comprueba: acepta
  `""` porque es `string` (`apps/web/src/app/api/reception/charges/route.ts:55`) y el 400 sale del
  repositorio al recortar el texto
  (`packages/shared/src/db/repositories/reception.repository.ts:190`). El resultado final es el
  mismo, pero la validación no está en la puerta de entrada.
- El vocabulario del cargo admite `PAID`
  (`packages/shared/src/db/repositories/reception.repository.ts:36`), pero **no existe** endpoint ni
  flujo que cobre o marque un cargo como pagado; el MVP no cobra
  (`packages/shared/src/db/migrator.ts:184`). Queda por confirmar si el cobro entra en un
  incremento posterior.
- La API no limita el número de cargos por estancia ni el importe máximo; solo la base impone
  `amount_cents > 0` (`packages/shared/src/db/migrator.ts:189`).
- No hay endpoint de **edición** ni de **borrado** de un cargo `PENDING`: solo alta, listado y
  cancelación (`apps/web/src/app/api/reception/charges/route.ts:17`, `:43`).
- El listado no pagina (`packages/shared/src/db/repositories/reception.repository.ts:213`); con
  muchas estancias históricas la respuesta crece sin límite.
