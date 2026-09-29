# CU-12 · Decidir cuánto se queda el hotel en cada reventa — Manual técnico

> Bloque 1 · Iniciación · Actor: ROYALTY_ADMIN · Requisitos: RF-08, RNF-13, Decisión 17

## 1. Ficha y trazabilidad

- **Objetivo declarado en el catálogo.** Configurar el porcentaje que el hotel se queda en cada
  reventa (royalty).
- **Actor primario declarado.** `ROYALTY_ADMIN`. **Actor real hoy:** el propietario
  (`DEFAULT_ADMIN_ROLE`), y solo para **consultar**: no existe rol de royalty ni transacción.
- **Requisitos que cubre.** RF-08 (royalty de reventa) y RNF-13 (autorización por rol); la decisión
  vigente es **D-06** (royalty inmutable por construcción), que sustituye a la Decisión 17 citada en
  `docs/CASOS-DE-USO.md:662`.
- **Precondición.** Sesión válida con `DEFAULT_ADMIN_ROLE` para abrir el panel.
- **Disparador.** El administrador quiere saber cuánto cobra el hotel en una reventa.
- **Postcondición.** El panel muestra los porcentajes vigentes. **No hay postcondición on-chain:**
  este CU no modifica estado.
- **Dónde vive.**
  - UI: `apps/web/src/app/admin/royalty/page.tsx:8` (ruta `/admin/royalty`) y
    `apps/web/src/components/admin/AdminRoyalty.tsx:27`.
  - Contrato: `packages/contracts/src/HotelNights.sol:70` (constantes de bps), `:449`
    (`royaltyInfo`) y `:512` (`_royaltyBpsOf`).
  - Consumo del royalty en la reventa: `packages/contracts/src/HotelNights.sol:253`–`:262`.
  - No hay endpoint de API ni worker implicado: el panel es informativo y no llama a ninguna ruta.

## 2. Recorrido técnico

### 2.1 Camino principal (consulta)

1. El propietario abre `/admin/royalty`. El layout del back-office exige sesión válida antes de
   pintar (`apps/web/src/app/admin/layout.tsx:22`).
2. La página se declara gateada por `DEFAULT_ADMIN_ROLE` (`apps/web/src/app/admin/royalty/page.tsx:14`),
   con el título «Royalty» y la descripción «Consulta el royalty de reventa, fijado por el contrato
   al crear cada noche (D-06)» (`apps/web/messages/es.json:545`).
3. `AdminRoyalty` pinta tres cosas, todas de solo lectura:
   - el aviso de inmutabilidad (`AdminRoyalty.tsx:33`, texto en `es.json:547`);
   - la tabla de los tres tipos con su porcentaje (`AdminRoyalty.tsx:40`);
   - la nota de que `royaltyInfo` es la fuente única (`AdminRoyalty.tsx:53`, `es.json:549`).
4. Los porcentajes están **fijados en el componente** y reflejan las constantes del contrato:
   simple 500 bps, doble 500 bps y suite 1000 bps (`AdminRoyalty.tsx:12`).
5. El porcentaje se decide **al registrar la habitación**, no en este panel: `_royaltyBpsOf` lee el
   tipo guardado de la habitación del `tokenId` (`HotelNights.sol:512`) y devuelve 1000 bps solo si
   el tipo es exactamente `suite` (`:515`); en cualquier otro tipo registrado devuelve 500 bps
   (`:516`). Si la habitación no está registrada, devuelve 0 bps sin revertir (`:514`).
6. Cuando alguien revende, `buyResale` llama a `royaltyInfo` —la misma función que consultan los
   marketplace externos— y reparte: royalty al receptor y el resto al vendedor
   (`HotelNights.sol:253` y `:254`). El receptor es siempre `treasury` (`:455`).
7. Los importes no se envían en el acto: se acreditan como pago pendiente (pull payments, ADR-15) y
   se retiran con `claim()` (`HotelNights.sol:259`, `:260` y `:270`).

### 2.2 Validaciones

- **Autorización de la ruta.** `requiredRole="DEFAULT_ADMIN_ROLE"` en la página
  (`admin/royalty/page.tsx:14`); el guard de API devuelve 403 si una sesión sin ese rol intenta una
  ruta gateada (`apps/web/src/lib/guard.ts:136`). El owner satisface cualquier requisito (`:138`).
- **No hay validación de rango de royalty** porque no hay entrada de datos: la antigua regla
  «0–2000 bps» (`docs/CASOS-DE-USO.md:695`) no tiene código que la aplique.
- **Tipo de habitación válido.** El tipo se valida al registrarlo, no aquí: `_checkRoomType`
  (`HotelNights.sol:519` y siguientes) admite solo el vocabulario del maestro.
- **Suelo de reventa.** Existe una protección anti-elusión gobernable: `minListingPrice`
  (`HotelNights.sol:305`), ajustable por `DEFAULT_ADMIN_ROLE` y con cota inferior distinta de cero
  (`:308`). No es el royalty, pero vive en el mismo panel de administración del contrato.

### 2.3 Efectos on-chain / persistencia

- **Ninguno al consultar.** El panel no firma transacciones (`AdminRoyalty.tsx:27`).
- Cuando se revende, los efectos son: `delete _listings[tokenId]`, marca `_soldOnce`,
  acreditación de `_pending` para vendedor y receptor, y los eventos `Sale(..., SECONDARY)` y
  `RoyaltyPaid(tokenId, royaltyReceiver, royaltyAmount)` (`HotelNights.sol:257`–`:262`).
- El royalty no se guarda en ningún sitio: se calcula en cada consulta a partir del tipo de
  habitación, por eso cambiar el receptor (`treasury`) es inmediato y no hay nada que sincronizar
  (`HotelNights.sol:339`) y por eso no hay setter que lo altere (`:31` y `:69`).

## 4. Contrato, API y datos

### 4.1 Funciones / endpoints

| Elemento | Dónde | Nota |
|----------|-------|------|
| `ROYALTY_BPS_STANDARD = 500` | `HotelNights.sol:70` | 5 %: simple y doble |
| `ROYALTY_BPS_SUITE = 1000` | `HotelNights.sol:71` | 10 %: suite |
| `royaltyInfo(tokenId, salePrice)` | `HotelNights.sol:449` | ERC-2981; fuente única; receptor `treasury` |
| `_royaltyBpsOf(tokenId)` | `HotelNights.sol:512` | Deriva el tipo de la habitación del `tokenId` |
| `registerRoom` / `updateRoomType` | `HotelNights.sol:346` y `:361` | Fijan el tipo que determina el royalty |
| `setTreasury(newTreasury)` | `HotelNights.sol:335` | Cambia el receptor; no el porcentaje |
| `setMinListingPrice(newPrice)` | `HotelNights.sol:305` | Suelo anti-elusión, no royalty |
| `buyResale(tokenId)` | `HotelNights.sol:241` | Aplica el royalty en la venta secundaria |
| `royaltyInfo` en la interfaz | `packages/contracts/src/IHotelNights.sol:201` | Declaración pública |
| `royaltyInfo` en el ABI compartido | `packages/shared/src/abi/hotel-nights.ts:728` | Consultable por la web y terceros |
| Constantes espejo para la UI | `packages/shared/src/constants.ts:40` y `:41` | Reflejan el contrato; no lo gobiernan |

- **No existe** `setRoyalty`, `setRoyaltyBps`, `royaltyBps()` ni `ROYALTY_ADMIN_ROLE`: hay pruebas
  que fijan su ausencia (`packages/contracts/test/HotelNights.admin.t.sol:60`,
  `packages/contracts/test/HotelNights.resale.t.sol:297`) y el tipo de rol no se declara en
  `packages/shared/src/domain/roles.ts:15`.
- **No hay endpoints HTTP** propios de este CU.

### 4.2 Eventos y errores canónicos

- `RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount)` —
  declarado en `packages/contracts/src/IHotelNights.sol:35`, emitido en `HotelNights.sol:262`.
- `TreasuryUpdated(oldTreasury, newTreasury)` — al cambiar el receptor (`HotelNights.sol:341`).
- `MinListingPriceUpdated(newPrice)` — al ajustar el suelo (`HotelNights.sol:310`).
- `RoyaltyUpdated` y `RoyaltyOutOfRange` **no existen en el código**: aparecen en
  `docs/CASOS-DE-USO.md:668` y `:671`, pero ningún fichero de `packages/` ni `apps/` los declara.

### 4.3 Estructuras de datos y almacenamiento

- Registro de habitaciones: `_roomRegistered`, `_roomTypeName`, `_publicationHash`
  (`HotelNights.sol:101`–`:103`). El tipo de la habitación es lo único que decide el porcentaje.
- `treasury` es el receptor del royalty (`HotelNights.sol:86`).
- `_pending` y `_totalPending` sostienen los pagos pull de vendedor y receptor
  (`HotelNights.sol:107` y `:108`; `_credit` en `:403`).
- La copia informativa para la UI está en `packages/shared/src/constants.ts:39`, que remite a
  `HotelNights._royaltyBpsOf` como fuente del cambio de valores.

## 5. Casos límite y errores

| Situación | Qué pasa | Dónde se comprueba |
|-----------|----------|--------------------|
| Se intenta cambiar el royalty | No hay función que lo haga | `HotelNights.admin.t.sol:60` |
| Se busca un getter `royaltyBps()` | No existe | `HotelNights.admin.t.sol:65` |
| Se busca el rol `ROYALTY_ADMIN_ROLE` | No existe en el contrato | `HotelNights.admin.t.sol:68` |
| `tokenId` de habitación no registrada | `royaltyInfo` devuelve 0 sin revertir | `HotelNights.sol:514` |
| Importe no divisible | Redondeo hacia abajo | `HotelNights.royalty.t.sol:79` |
| Sesión sin `DEFAULT_ADMIN_ROLE` en la ruta | 403 `FORBIDDEN` | `apps/web/src/lib/guard.ts:136` |
| Reventa con listado inexistente | `NotListed(tokenId)` | `HotelNights.sol:243` |
| Reventa de noche ya consumida | `NightNotResellable(tokenId)` | `HotelNights.sol:246` |
| Reventa de noche caducada | `NightExpired(tokenId)` | `HotelNights.sol:247` |
| Pago distinto del precio listado | `IncorrectPayment(expected, sent)` | `HotelNights.sol:248` |

## 6. Pruebas y evidencia

- `packages/contracts/test/HotelNights.royalty.t.sol:49` — simple 5 %; `:55` doble 5 %; `:61` suite
  10 %; `:69` el receptor sigue a `treasury`; `:79` redondeo hacia abajo; `:99` habitación
  desconocida devuelve 0; `:109` royalty fijo entre despliegues; `:125` estable entre bloques;
  `:135` reparto exacto en la reventa de una suite.
- `packages/contracts/test/HotelNights.admin.t.sol:60` — sin superficie de gobierno del royalty.
- `packages/contracts/test/HotelNights.resale.t.sol:293` — el royalty no cambia entre `list` y
  `buyResale` y se emite `RoyaltyPaid` con el 5 % de 1 ether.
- `packages/contracts/test/HotelNights.roles.t.sol:80` — `treasury` y 5 % para la habitación 101.
- `apps/web/src/lib/admin-auth-guardian.test.ts:61` — `/admin/royalty` no lee datos en el servidor.
- **No cubierto:** no hay ningún test que monte `AdminRoyalty.tsx` ni que compruebe que la tabla de
  porcentajes coincide con las constantes del contrato; la coincidencia es manual hoy.

## 7. Pendiente de confirmar

- **El CU-12 tal como está escrito no existe.** `docs/CASOS-DE-USO.md:659` describe un actor
  `ROYALTY_ADMIN` que fija bps (0–2000) y provoca `RoyaltyUpdated`; el código aplica **D-06**:
  royalty inmutable, derivado del tipo de habitación, sin rol y sin setter (`HotelNights.sol:28`).
  Hay que decidir si el manual describe el sistema real (inmutable) o si el CU queda marcado como
  no implementado.
- **Números en conflicto.** El brief dice «royalty por defecto 10 %»; el código fija 5 % para
  simple y doble y 10 % solo para suite (`HotelNights.sol:70`). Confirmar cuál es la cifra canónica
  para los manuales literales.
- **Actor.** No existe `ROYALTY_ADMIN` ni en el contrato ni en `admin_users.role`
  (`packages/shared/src/domain/roles.ts:53`). Confirmar que el actor real es el propietario.
- **Decisión de diseño.** El CU cita «Decisión 17» (`docs/CASOS-DE-USO.md:662`); el código cita
  D-06. Confirmar la numeración vigente para la ficha de trazabilidad.
- **Cabecera del panel.** El panel se titula «Royalty (D-06): panel informativo e inmutable»
  (`admin/royalty/page.tsx:7`). Confirmar si debe seguir llamándose «Configurar el porcentaje».
