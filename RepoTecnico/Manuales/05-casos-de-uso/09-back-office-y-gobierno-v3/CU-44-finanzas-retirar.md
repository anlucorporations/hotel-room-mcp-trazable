# CU-44 · Ver las finanzas del hotel y retirar el dinero — Manual técnico

> Bloque 9 · Back-office y gobierno v3 · Actor: Owner/Treasurer · Requisitos: RF-44

## 1. Ficha y trazabilidad

- **Objetivo.** Ver el resumen financiero del negocio (volúmenes, royalties y contadores de noches)
  y retirar a la tesorería el saldo residual del contrato.
- **Actor primario.** Owner (`DEFAULT_ADMIN_ROLE`), que es quien abre la pantalla. **Secundario
  imprescindible:** la wallet que firma, que debe ostentar `TREASURER_ROLE` para retirar
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:171`).
- **Requisitos que cubre.** RF-44 (`RepoTecnico/incremento_v3/casos_uso_incremento.md:172`).
- **Precondición.** Sesión de back-office con `DEFAULT_ADMIN_ROLE` y wallet con `TREASURER_ROLE`
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:171`).
- **Disparador.** El owner abre Sistemas → Finanzas
  (`apps/web/src/app/admin/sistemas/finanzas/page.tsx:10`).
- **Postcondición.** Con la retirada minada, el contrato transfiere el residual a la tesorería y la
  pantalla relee balance y pendiente (`apps/web/src/components/admin/AdminFunds.tsx:71`–`:76`).
- **Dónde vive.**
  - Página: `apps/web/src/app/admin/sistemas/finanzas/page.tsx:10`.
  - Agregados: `apps/web/src/components/admin/system/SystemFinances.tsx:25`.
  - Retirada: `apps/web/src/components/admin/AdminFunds.tsx:31`.
  - API de agregados: `apps/web/src/app/api/admin/metrics/route.ts:27`.
  - Worker: `apps/web/src/lib/worker-api.ts:29`, `apps/worker/src/http-server.ts:74`.
  - Contrato: `packages/contracts/src/HotelNights.sol:324` (`withdraw`), `:439`
    (`totalPending`).
  - Motor de agregados: `apps/worker/src/aggregate-processor.ts:71`.

## 2. Recorrido técnico

### 2.1 Camino principal

1. El owner entra en `/admin/sistemas/finanzas`. El layout de la sección exige `DEFAULT_ADMIN_ROLE`
   en servidor antes de renderizar (`apps/web/src/app/admin/sistemas/layout.tsx:17`, `:20`).
2. La página monta el resumen y la tarjeta de fondos
   (`apps/web/src/app/admin/sistemas/finanzas/page.tsx:18`–`:19`).
3. `SystemFinances` pide `GET /api/admin/metrics` con `apiFetch`
   (`apps/web/src/components/admin/system/SystemFinances.tsx:34`) y guarda el JSON en `metrics`
   (`:37`).
4. La API comprueba la sesión con `requireRole(request)` —cualquier rol de gestión vale—
   (`apps/web/src/app/api/admin/metrics/route.ts:28`) y lee los agregados del worker con
   `fetchAggregates()` (`:33`).
5. `fetchAggregates` llama a `GET /aggregates` del worker, con `cache: "no-store"` y timeout
   (`apps/web/src/lib/worker-api.ts:12`, `:18`, `:30`).
6. La pantalla pinta primario, reventa, royalties, vendidas, minteadas y quemadas
   (`apps/web/src/components/admin/system/SystemFinances.tsx:71`–`:76`), formateando los importes de
   wei a ETH con `formatEther` (`:48`). El botón «Actualizar» repite la carga (`:56`).
7. `AdminFunds` lee el balance bruto del contrato con `useBalance`
   (`apps/web/src/components/admin/AdminFunds.tsx:34`) y el pendiente reservado con
   `totalPending()` (`:40`–`:44`).
8. Calcula el residual retirable como `bruto − pendiente`, nunca por debajo de cero
   (`apps/web/src/components/admin/AdminFunds.tsx:61`–`:66`), y muestra bruto, retirable y tesorería
   destino (`:93`, `:103`, `:113`).
9. Si el residual es cero, el botón «Retirar» queda deshabilitado para no provocar el revert
   (`apps/web/src/components/admin/AdminFunds.tsx:67`, `:135`).
10. Al pulsar «Retirar» se abre el `TxModal` en fase de revisión con el importe a retirar
    (`apps/web/src/components/admin/AdminFunds.tsx:136`, `:154`); solo al confirmar se firma
    `withdraw()` sin argumentos (`:85`–`:86`).
11. `useAdminWrite` envía la transacción y deriva el estado firmar → minar → confirmar/revertir
    (`apps/web/src/components/admin/useAdminWrite.ts:33`–`:48`).
12. Al confirmarse, se releen balance y pendiente
    (`apps/web/src/components/admin/AdminFunds.tsx:71`–`:76`).

### 2.2 Validaciones

- **Owner en la pantalla.** `AdminPanel` exige `DEFAULT_ADMIN_ROLE`
  (`apps/web/src/components/admin/AdminPanel.tsx:24`) y el layout lo comprueba antes
  (`apps/web/src/app/admin/sistemas/layout.tsx:20`).
- **Cualquier rol de gestión para los agregados.** `requireRole(request)` sin rol explícito admite
  gestión (`apps/web/src/lib/guard.ts:167`); el comentario de la ruta lo declara a propósito
  (`apps/web/src/app/api/admin/metrics/route.ts:24`).
- **Nada de ceros falsos.** Si el worker no responde, la API devuelve 503 `DATA_UNAVAILABLE`
  (`apps/web/src/app/api/admin/metrics/route.ts:37`) y la pantalla muestra el error
  (`apps/web/src/components/admin/system/SystemFinances.tsx:63`).
- **Residual positivo.** El botón se deshabilita si el retirable es 0 y se avisa con
  `fundsNoneWithdrawable` (`apps/web/src/components/admin/AdminFunds.tsx:128`, `:135`).
- **Confirmación explícita.** La retirada transfiere ETH y es irreversible: pasa por la fase
  `review` del `TxModal` (`apps/web/src/components/admin/AdminFunds.tsx:78`;
  `apps/web/messages/es.json:617`).

### 2.3 Efectos on-chain / persistencia

- `withdraw()` solo lleva `onlyRole(TREASURER_ROLE)` y `nonReentrant`: **no** lleva
  `whenNotPaused`, así que se permite en pausa como vía de remediación
  (`packages/contracts/src/HotelNights.sol:324`; `apps/web/src/components/admin/AdminFunds.tsx:24`).
- El importe retirado es `address(this).balance - _totalPending`: los pagos pendientes de reventas
  quedan reservados a sus dueños (pull payments, ADR-15)
  (`packages/contracts/src/HotelNights.sol:326`). Si el resultado es 0, revierte `NoFunds` (`:327`).
- La transferencia se hace con `call{value: amount}` a `treasury`; si falla, revierte
  `EthTransferFailed` (`packages/contracts/src/HotelNights.sol:329`–`:330`), y al salir bien emite
  `Withdrawn(treasury, amount)` (`:331`).
- `totalPending()` devuelve `_totalPending`, la suma de los pagos pendientes (`:439`).
- **No hay escritura en PostgreSQL en este CU:** los agregados los calcula el worker
  (`apps/worker/src/aggregate-processor.ts:71`) y la retirada es puramente on-chain.

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Firma / ruta | Rol exigido | Referencia |
|---|---|---|---|
| Agregados financieros | `GET /api/admin/metrics` | cualquier rol de gestión | `apps/web/src/app/api/admin/metrics/route.ts:27` |
| Exportación CSV | `GET /api/admin/metrics?format=csv` | igual | `apps/web/src/app/api/admin/metrics/route.ts:45` |
| Agregados del worker | `GET /aggregates` | ninguno (interno) | `apps/web/src/lib/worker-api.ts:29` |
| Balance bruto | `eth_getBalance` vía `useBalance` | lectura | `apps/web/src/components/admin/AdminFunds.tsx:34` |
| Pendiente reservado | `totalPending()` | lectura | `packages/contracts/src/HotelNights.sol:439` |
| Tesorería destino | `treasury()` | lectura | `apps/web/src/components/admin/AdminFunds.tsx:35` |
| Retirar | `withdraw()` | `TREASURER_ROLE` | `packages/contracts/src/HotelNights.sol:324` |

### 4.2 Eventos y errores canónicos

- **Evento:** `Withdrawn(address indexed treasury, uint256 amount)`
  (`packages/contracts/src/IHotelNights.sol:39`).
- **Errores del contrato:** `NoFunds` (`packages/contracts/src/IHotelNights.sol:89`) y
  `EthTransferFailed` (`:91`).
- **Error de la API:** `DATA_UNAVAILABLE` con 503 si el worker o su base de datos no responden
  (`apps/web/src/app/api/admin/metrics/route.ts:38`).
- **Errores de la UI:** clave `admin.txError.noFunds` («No hay saldo retirable. El balance bruto
  puede estar reservado para pagos pendientes de reventas.»)
  (`apps/web/messages/es.json:598`), mapeada en
  `apps/web/src/components/admin/adminTxError.ts:51`.
- **Campos de la respuesta de métricas:** `primaryVolumeWei`, `secondaryVolumeWei`, `royaltiesWei`,
  `soldCount`, `mintedCount`, `burnedCount`, `occupancyRatioPercent` y `updatedAt`
  (`apps/web/src/components/admin/system/SystemFinances.tsx:9`–`:18`;
  `apps/web/src/app/api/admin/metrics/route.ts:56`).

### 4.3 Estructuras de datos y almacenamiento

- **En el contrato:** `_pending` por cuenta y `_totalPending` protegen los fondos de usuarios en
  `withdraw` (`packages/contracts/src/HotelNights.sol:107`–`:108`); `treasury` es el receptor
  (`:86`).
- **En el worker:** los agregados viven en PostgreSQL (`worker_sale_history`) y se calculan sobre
  eventos de dominio (`apps/worker/src/aggregate-processor.ts:64`–`:71`).
- **En el cliente:** `Metrics` declara solo lo que pinta la tarjeta
  (`apps/web/src/components/admin/system/SystemFinances.tsx:9`).
- **Ojo con el nombre:** lo que la tarjeta muestra como «Retirable ahora» es un cálculo del navegador
  (bruto menos pendiente), no una vista del contrato.

## 5. Casos límite y errores

| Situación | Error / selector | Dónde se comprueba |
|---|---|---|
| Sesión que no es owner | acceso denegado en servidor | `apps/web/src/app/admin/sistemas/layout.tsx:20` |
| Worker caído al pedir agregados | 503 `DATA_UNAVAILABLE` y aviso en pantalla | `apps/web/src/app/api/admin/metrics/route.ts:37`; `apps/web/src/components/admin/system/SystemFinances.tsx:63` |
| Residual retirable igual a cero | botón deshabilitado y aviso | `apps/web/src/components/admin/AdminFunds.tsx:128`, `:135` |
| Todo el balance está reservado a reventas | `withdraw()` revierte `NoFunds` | `packages/contracts/src/HotelNights.sol:327` |
| Wallet sin `TREASURER_ROLE` | revierte `AccessControlUnauthorizedAccount` | `packages/contracts/src/HotelNights.sol:324` |
| La tesorería rechaza el ETH | revierte `EthTransferFailed` | `packages/contracts/src/HotelNights.sol:330` |
| Contrato en pausa | aviso informativo; retirar sigue permitido | `apps/web/src/components/admin/AdminFunds.tsx:122`–`:127` |
| Saldo `undefined` en la lectura | muestra «no se pudo leer», no un cero | `apps/web/src/components/admin/AdminFunds.tsx:98` |
| Sesión caducada durante la pantalla | bloque `session-expired-block` | `apps/web/src/components/admin/AdminPanel.tsx:42` |

## 6. Pruebas y evidencia

- `apps/web/src/app/api/admin/admin.test.ts:229`: bloque de pruebas de `GET /api/admin/metrics` con
  la fuente única del worker; `:277`: devuelve métricas y agregados en JSON; `:295`: exporta KPIs,
  serie, desglose y ranking en CSV; `:314`: si el worker no responde, responde 503 en vez de
  inventar ceros.
- `apps/web/src/app/api/admin/admin.test.ts:71` y `:78`: 401 sin sesión y 403 con un rol que no es de
  back-office.
- `apps/web/src/components/admin/adminTxError.test.ts:13`: `NoFunds` se mapea a su clave.
- **No cubierto:** no hay prueba de componente para `SystemFinances` ni `AdminFunds` (cálculo del
  residual, deshabilitado del botón, `TxModal`, refresco tras confirmar), ni prueba end-to-end que
  firme `withdraw()` y compruebe que el balance baja y `Withdrawn` se emite.

## 7. Pendiente de confirmar

- El Gherkin de retirada pide que «el balance se actualice»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:186`). El código relee balance y pendiente al
  confirmar (`apps/web/src/components/admin/AdminFunds.tsx:71`), pero la lectura de `totalPending`
  está envuelta en un `useReadContract` y **no se comprueba en ninguna prueba** que la cifra
  mostrada baje tras la retirada.
- El criterio del resumen nombra «balance bruto, pendiente de reventas y residual retirable»
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:180`). `SystemFinances` **no muestra ninguno de
  los tres**: solo los agregados del worker
  (`apps/web/src/components/admin/system/SystemFinances.tsx:71`–`:76`). Bruto, retirable y tesorería
  los pinta `AdminFunds`, que es otro componente de la misma página
  (`apps/web/src/app/admin/sistemas/finanzas/page.tsx:19`). Queda confirmar si el criterio se
  satisface con la página completa o si espera las tres cifras juntas.
- Las claves de i18n `fieldPrimaryVolume`, `fieldSecondaryVolume` y `fieldRoyalties` existen en el
  namespace `system` (`apps/web/messages/es.json:1093`–`:1095`), pero la tarjeta usa las de
  `admin` (`apps/web/src/components/admin/system/SystemFinances.tsx:71`). No se ha confirmado si hay
  claves duplicadas sin uso.
- No está confirmado quién ostenta `TREASURER_ROLE` en el despliegue de pruebas, ni si el owner de
  la plataforma coincide con esa wallet; el CU dice «Owner/Treasurer» pero la pantalla solo exige ser
  owner de la aplicación.
- El aviso de «contrato en pausa, retirar sigue permitido»
  (`apps/web/src/components/admin/AdminFunds.tsx:122`) no aparece en el Gherkin de este CU
  (`RepoTecnico/incremento_v3/casos_uso_incremento.md:176`–`:187`): es una decisión de diseño
  heredada de CU-15 y queda pendiente de confirmar si debe documentarse aquí.
