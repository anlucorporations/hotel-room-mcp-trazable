# Casos de uso y criterios de aceptación — WEB (implementación F1–F10)

> **Tipo:** análisis funcional de consolidación · **Fase:** 2 (artefacto de casos de uso) sobre la web **ya implementada**.
> **Versión:** 1.0.0 · **Fecha:** 2026-10-20 · **Autor:** @asistenteProyecto (analista funcional senior).
> **Estado:** propuesta para aprobación del responsable. No modifica código, contratos ni BD.
>
> **Alcance:** **un caso de uso por objetivo de actor** para toda la superficie web en producción
> (pública, compra/reventa/subasta, recepción, back-office, suites de personal y operación), con
> criterios **Gherkin** y restricciones **EARS** 100 % testeables y trazables a RF/RNF.
>
> **Relación con la documentación previa (no duplica, consolida):**
> - `docs/CASOS-DE-USO.md` — formato y detalle de **CU-01…CU-17** (MVP contrato/compra).
> - `docs/SRS.md` §9 — catálogo canónico **CU-30…CU-50** y **CU-PR-01/02**.
> - `RepoTecnico/propuesta_vNext/casos_uso.md` — **CU-V-01…CU-V-45** (mantenimiento, ama de llaves,
>   terminal, recepción vNext, gobernanza y soporte).
> - Este documento: **(a)** define los **CU-W** que no tenían caso de uso formal en la web (home y
>   secciones, contenido, actividades, reseñas, portal de daños, plataforma/operación); **(b)** fija el
>   **estado de implementación y la evidencia** de los CU heredados en §5; **(c)** cierra la matriz
>   RF/RNF → CU.
>
> **Fuentes:** `RepoTecnico/requerimientos.md`, `docs/REQUISITOS.md`, `docs/SRS.md` §9,
> `RepoTecnico/propuesta_vNext/requerimientos.md` (RF-M/K/S, RNF-M), `docs/MATRIZ-TRAZABILIDAD.md`,
> `RepoTecnico/estado_proyecto.md` §44–§53 y `RepoTecnico/aceptacion_fase3.md`.

---

## 1. Convenciones

| Convención | Regla aplicada |
|---|---|
| **Gherkin** (`Dado / Cuando / Entonces / Y / Pero`) | `Dado` = estado verificable; `Cuando` = **una** acción o evento; `Entonces` = resultado **observable** (código HTTP, fila/campo de BD, evento on-chain, `data-testid`, mensaje de error, métrica con percentil). |
| **EARS** (restricciones del sistema) | Ubicuo «El sistema deberá…»; Evento «Cuando \<evento\>, el sistema deberá…»; Estado «Mientras \<estado\>, el sistema deberá…»; Condición «Si \<condición\>, entonces…»; Opcional «De acuerdo con \<característica\>, el sistema deberá…». |
| **Un CU por objetivo de actor** | Objetivos con disparador o postcondición distintos no se fusionan. |
| **Testabilidad** | Todo `Entonces` cita un oráculo de §4 (ruta/API, `data-testid`, tabla, evento, métrica) y tiene prueba asociada o prevista. Sin oráculos subjetivos. |
| **Trazabilidad** | Cada CU declara RF/RNF y decisiones (`D-…`, `D-C…`, `ADR-…`) que cubre; la cobertura se cierra en §6. |
| **Idioma** | UI ES/EN/RU (RNF-06, RNF-M-17); identificadores de código, tablas, eventos y roles en inglés. |
| **Roles** | Los nombres de rol son los del contrato/BD: `DEFAULT_ADMIN_ROLE` (owner), `RECEPTION_ROLE`, `HEAD_MAINTENANCE`, `MAINTENANCE_TECH`, `MAINTENANCE` (técnico heredado), `HEAD_KEEPER`, `HOUSEKEEPER`, `HOUSEKEEPING` (heredado), `MINTER_ROLE`, `PAUSER_ROLE`, `BURNER_ROLE`, `TREASURER_ROLE`, `ROYALTY_ADMIN_ROLE`, `AUCTION_ADMIN_ROLE`. |

---

## 2. Actores y canales

| Actor | Rol / identidad | Canal principal | Suites / rutas |
|---|---|---|---|
| **Visitante** | Sin sesión ni wallet | Web pública | `/`, secciones, `/catalogo`, `/historico`, `/subastas`, `/ayuda`, `/resenas` |
| **Huésped / Comprador** | Wallet + sesión de huésped (pase JWS) | Web pública y `/mis-noches` | compra, reventa, subasta, resguardo, check-in, cargos, reseñas |
| **Portador de noches** | Wallet propietaria de `nft` | `/mis-noches`, `/reventa`, `/checkin` | reventa, cobro, resguardo, QR |
| **Recepcionista** | `RECEPTION_ROLE` (password + TOTP) | Back-office de recepción | `/recepcion`, `/recepcion/*` |
| **Administrador / Owner** | `DEFAULT_ADMIN_ROLE` | Back-office | `/admin/**` (todas las suites) |
| **Jefe de Mantenimiento** | `HEAD_MAINTENANCE` | Suite de mantenimiento | `/mantenimiento/**` |
| **Técnico de mantenimiento** | `MAINTENANCE_TECH` (sin wallet) | Terminal fijo con PIN / suite | `/terminal/**`, `/mantenimiento/**` (solo lo asignado) |
| **Jefa de Ama de llaves** | `HEAD_KEEPER` | Suite Ama de llaves | `/ama-de-llaves/**` |
| **Camarera** | `HOUSEKEEPER` (sin wallet) | Terminal fijo con PIN / suite | `/terminal/**`, `/ama-de-llaves/**` (solo su turno) |
| **Soporte (= Owner)** | `DEFAULT_ADMIN_ROLE` | Back-office → Sistemas | `/admin/sistemas/**`, exportación de auditoría |
| **Sistema (procesos)** | Worker, MCP, monitor, schedulers | Sin UI | colas, anclaje, emails/push, health, MCP read-only |
| **Máquina / IA (MCP)** | `searchHotelManuals`, `buildPurchaseTx`, `prepareStayTx`, `getOperationalActions` | API MCP | read-only, nunca firma (RF-12, DT-AUD-15) |

---

## 3. Inventario de casos de uso web

| CU | Objetivo del actor | Actor | Requisitos | Realización (resumen) |
|---|---|---|---|---|
| CU-W-01 | Explorar la home pública y sus secciones informativas | Visitante | RF-18a, RF-56, RNF-01, RNF-20 | `/`, `PublicShell`, `HomeSections` |
| CU-W-02 | Consultar el catálogo y filtrar noches | Visitante/Comprador | RF-01, RF-02, RF-14, RNF-02 | `/catalogo`, `CatalogClient`, `FilterBar` |
| CU-W-03 | Consultar disponibilidad y retener una noche (reserva) | Comprador | RF-20, RF-30–RF-35 | `/reservar`, `/api/reception/reservations*`, `reservation_nights` |
| CU-W-04 | Onboarding web3 (conectar wallet, red correcta) | Visitante | RF-04, RF-11, RNF-18, RNF-19 | `Providers`, `useOnboarding`, `WalletMenu` |
| CU-W-05 | Comprar una noche en venta primaria | Comprador | RF-03, RF-19, RNF-14, RNF-18 | `BuyButton`, `useBuyNight`, `HotelNights.buy` |
| CU-W-06 | Comprar una noche en reventa con royalty | Comprador | RF-07, RF-08, RNF-10, RNF-14 | `/reventa`, `HotelNights.buyResale`, ERC-2981 |
| CU-W-07 | Poner en reventa, editar precio y retirar | Portador | RF-07, RF-36 | `/mis-noches/mis-reventas`, `list`/`unlist` |
| CU-W-08 | Cobrar lo acreditado por reventas | Portador | RF-15 | `claim()`, saldo pendiente |
| CU-W-09 | Consultar y usar mis noches (resguardo QR + pase) | Portador | RF-20, RF-33, RF-37, ADR-30 | `/mis-noches`, `TicketView`, `passes/jws` |
| CU-W-10 | Hacer check-in / check-out en recepción | Recepcionista | RF-31–RF-35, RF-50 | `/recepcion`, `/api/reception/checkin|checkout` |
| CU-W-11 | Operar el día en recepción (reservas, habitaciones, incidencias, PMS) | Recepcionista | RF-31, RF-32, RF-47–RF-55 | `/recepcion/reservas`, `/recepcion/habitaciones`, `/recepcion/incidencias` |
| CU-W-12 | Consultar y reclamar un cargo por daños (portal huésped) | Huésped | RF-K-08, RF-S-04, RF-64, RNF-M-10 | `/mis-noches/cargos`, `/api/damage-charges*` |
| CU-W-13 | Consultar el histórico público de ventas | Visitante | RF-15, RNF-05 | `/historico`, `/api/sales/history` |
| CU-W-14 | Participar en una subasta (ver, pujar, liquidar) | Comprador | RF-13, ADR-28 | `/subastas`, `NightAuction.bid/settle` |
| CU-W-15 | Escribir y consultar reseñas verificadas | Huésped | RF-61, D-C… | `/resenas`, `/api/reviews` |
| CU-W-16 | Pedir ayuda al asistente IA (hotel y compra) | Visitante/Comprador | RF-12, RF-56–RF-60, RF-65, RNF-22–RNF-27 | `/asistente`, `/api/assistant`, MCP |
| CU-W-17 | Consultar manuales y ayuda | Visitante/Huésped | RF-56, RF-59, RF-65 | `/ayuda`, `/ayuda/{cliente,comprador,recepcion,huesped}` |
| CU-W-18 | Recibir avisos por email y push (alta/baja) | Huésped | RF-09, RF-16, RF-37 | `/api/push/subscribe`, worker, `sw.js` |
| CU-W-19 | Acceder al back-office (password + TOTP), gestionar mi seguridad y salir | Operador | RNF-06, RNF-13, CU-01/CU-46 | `/api/auth/*`, `CredentialForm`, `AdminSecurity` |
| CU-W-20 | Administrar habitaciones, publicar ficha firmada y acuñar la ventana | Owner | RF-05, RF-18a/b, RF-19, D-1…D-26 | `/admin/habitacion`, `/api/admin/rooms*` |
| CU-W-21 | Administrar contenido público y actividades | Owner | RF-18a, RF-62, RF-63, D-66/D-69/D-73/D-74 | `/admin/contenido`, `/admin/actividades` |
| CU-W-22 | Moderar reseñas | Owner | RF-57–RF-60 (v3) | `/admin/resenas`, `/api/admin/reviews` |
| CU-W-23 | Gobernar la plataforma (roles, wallets, flags, operarios, auditoría, backups) | Owner/Soporte | RF-06, RF-41–RF-46, RNF-M-11/15/19 | `/admin/sistemas/**`, `/admin/roles`, `/admin/royalty` |
| CU-W-24 | Supervisar la operación (salud, métricas, cola de anclajes, MCP read-only) | Owner/Sistema | RF-10, RF-45, RNF-17, DT-AUD-15 | `/admin/dashboard`, `/admin/sistemas/operaciones`, `/health/*`, MCP |

> **Suites de personal**: sus casos de uso detallados son **CU-V-01…CU-V-45** (documento canónico
> `propuesta_vNext/casos_uso.md`). En §5 se consolida su estado de implementación y su evidencia; no se
> reescriben aquí para no crear dos fuentes de verdad con criterios divergentes.

---

## 4. Casos de uso detallados

### CU-W-01 — Explorar la home pública y sus secciones informativas

- **Actor:** Visitante.
- **Precondición:** ninguna (sin sesión ni wallet).
- **Disparador:** abre `/` o una sección del menú público.
- **Flujo principal:**
  1. El servidor renderiza la home con marca, hero, servicios, estilos, planes, actividades, galería,
     reseñas y contacto.
  2. El visitante navega a una sección (`/habitaciones`, `/servicios`, `/empresa`, `/instalaciones`,
     `/experiencias`, `/actividades`, `/planes`, `/resenas`, `/contacto`).
  3. La cabecera conserva el menú, el selector de idioma y el estado de wallet («Wallet no conectada»).
- **Alternativos:**
  - `A1` La BD no responde: la home sirve la parte de marca y declara el estado degradado honesto.
  - `A2` Imagen remota caída: se usa el respaldo local sin romper el layout (RNF-12).
- **Postcondición:** el visitante ha visto el contenido público; no se ha escrito nada.
- **Criterios de aceptación (Gherkin):**

```gherkin
Dado un visitante sin sesión ni wallet
Cuando abre "/"
Entonces ve un H1 con la propuesta de marca y el menú principal
Y ve el estado de wallet "Wallet no conectada"
Y no se muestra ningún panel de back-office

Dado que la base de datos no responde
Cuando un visitante abre "/"
Entonces la home responde 200 con hero y secciones de marca
Y declara el estado degradado sin inventar datos de catálogo
```

- **Restricciones (EARS):** El sistema deberá renderizar la home sin requerir wallet ni sesión. Si una
  fuente de datos falla, entonces el sistema deberá aislar el fallo por sección y no tumbar la página.
- **Trazabilidad:** RF-18a, RF-56, RNF-01, RNF-12, RNF-20, D-31/D-66…D-71.
- **Oráculos:** H1 de la home, `getByRole("link", {name:/Marina del Sol, inicio/i})`,
  `getByRole("link", {name:/Reservar con wallet/i})`; E2E `home.spec.ts`; axe de `/` en `a11y.spec.ts`.

---

### CU-W-02 — Consultar el catálogo y filtrar noches

- **Actor:** Visitante o Comprador.
- **Precondición:** noche publicada y dentro de la ventana de venta.
- **Disparador:** abre `/catalogo`.
- **Flujo principal:**
  1. La web muestra las tarjetas de noches con foto del **tipo**, fecha, habitación y precio.
  2. El visitante filtra por fecha, precio, tipo y habitación; el filtro queda en la URL.
  3. Abre una noche y ve su ficha (misma foto de tipo, reglas y estado de venta).
- **Alternativos:**
  - `A1` RPC caído: estado degradado explícito; no se ofrecen compras que revertirían.
  - `A2` Sin resultados: empty-state con acción para limpiar filtros.
  - `A3` Noche caducada: no aparece como comprable (RF-17).
- **Postcondición:** vista informada; sin transacciones.
- **Criterios:**

```gherkin
Dado un catálogo con noches publicadas
Cuando el visitante filtra por tipo "suite" y una fecha
Entonces solo se muestran noches de ese tipo y fecha
Y el filtro queda reflejado en la URL
Y el listado renderiza en menos de 1 s (P75, sin contar RPC)

Dado que el RPC no responde
Cuando el visitante abre "/catalogo"
Entonces ve un estado degradado explícito
Y no puede iniciar una compra
```

- **Restricciones (EARS):** Mientras el catálogo no se pueda verificar contra la cadena, el sistema
  deberá mostrar el estado degradado y deshabilitar la compra. El sistema deberá paginar o acotar la
  ventana de consulta para no saturar el RPC.
- **Trazabilidad:** RF-01, RF-02, RF-14, RF-17, RNF-01, RNF-02, RNF-11, RNF-12, Decisión 23.
- **Oráculos:** `data-testid="night-*"`, `[data-testid="degraded-state"]`, `[data-testid="empty-state"]`;
  E2E de catálogo (a11y y filtro por URL); `nights-cover.test.ts`.

---

### CU-W-03 — Consultar disponibilidad y retener una noche (reserva)

- **Actor:** Comprador (también Recepción en mostrador).
- **Precondición:** ventana de reserva válida y habitación no bloqueada por mantenimiento.
- **Disparador:** el visitante elige fechas en `/reservar` o pide una estancia al asistente.
- **Flujo principal:**
  1. La web consulta disponibilidad por rango y muestra las noches libres.
  2. El comprador confirma la retención; se crea `reservations` + `reservation_nights` con
     `active = TRUE` y vencimiento (`hold_expires_at`).
  3. La web muestra el folio/código de recuperación y el importe del anticipo.
- **Alternativos:**
  - `A1` Solape: el índice único parcial `(room_id, night_date) WHERE active` impide sobreventa → 409.
  - `A2` Bloqueo por mantenimiento: la noche no se ofrece y el intento forzado devuelve 409/422.
  - `A3` Hold vencido: la reserva pasa a expirada y la noche vuelve a estar libre.
- **Postcondición:** reserva `PENDING`/`CONFIRMED`; sin NFT emitido (se emite al pagar el 100 %).
- **Criterios:**

```gherkin
Dado un comprador en "/reservar"
Cuando elige dos noches libres y confirma la retención
Entonces se crea una reserva con su folio y dos filas activas en reservation_nights
Y la web muestra el importe y la fecha límite del bloqueo

Dado que otra reserva ya retiene la misma habitación y noche
Cuando se intenta retener de nuevo
Entonces la API responde 409 y no se crea ninguna fila activa duplicada
```

- **Restricciones (EARS):** El sistema deberá garantizar la ausencia de sobreventa a nivel de base de
  datos (índice único parcial). Si la habitación está bloqueada por mantenimiento, entonces el sistema
  deberá rechazar la reserva con un error explícito.
- **Trazabilidad:** RF-20, RF-30–RF-35, D-34…D-43 (bloque 2), D-52.
- **Oráculos:** HTTP 201/409, tablas `reservations`/`reservation_nights`, `hold_expires_at`;
  pruebas del dominio de reservas y E2E de disponibilidad.

---

### CU-W-04 — Onboarding web3 (conectar wallet y red correcta)

- **Actor:** Visitante.
- **Precondición:** navegador con wallet inyectada (EIP-6963) o WalletConnect configurado.
- **Disparador:** pulsa «Conectar» o intenta comprar.
- **Flujo principal:**
  1. La web descubre las carteras disponibles (EIP-6963) y muestra el selector.
  2. El visitante elige una; la wallet pide permiso y devuelve la cuenta.
  3. Si la red no es la del proyecto (`81234`), la web guía el cambio/alta de red.
  4. El menú de cuenta muestra la dirección y el acceso al back-office.
- **Alternativos:**
  - `A1` Sin `window.ethereum` ni carteras anunciadas: `data-testid="no-wallet"` con guía de instalación.
  - `A2` Red incorrecta: `data-testid="wrong-network"` y botón de cambio; no se permite firmar.
  - `A3` Usuario rechaza la conexión: estado «no conectado», sin error bloqueante.
- **Postcondición:** wallet conectada en la red correcta o estado degradado explícito.
- **Criterios:**

```gherkin
Dado un navegador sin cartera instalada
Cuando el visitante pulsa "Conectar"
Entonces ve "No tienes ninguna cartera" con enlace de instalación
Y no se habilita ninguna firma

Dado un visitante con wallet conectada en otra red
Cuando abre una vista de compra
Entonces ve "Red incorrecta" y el botón para cambiar a la red del proyecto
Y la compra permanece deshabilitada hasta cambiar
```

- **Restricciones (EARS):** El sistema deberá descartar carteras/red distinta de la configurada antes de
  habilitar cualquier firma. El sistema no deberá solicitar la clave privada en ningún momento.
- **Trazabilidad:** RF-04, RF-11, RNF-18, RNF-19, ADR-29, ADR-30.
- **Oráculos:** `[data-testid="no-wallet"]`, `[data-testid="wrong-network"]`,
  `[data-testid="wallet-connected"]`; `wallet-connectors.test.ts`; E2E A5
  (`wallet-publicacion.spec.ts`) y specs de onboarding.

---

### CU-W-05 — Comprar una noche en venta primaria

- **Actor:** Comprador.
- **Precondición:** CU-W-04 cumplido; saldo ≥ precio + gas mínimo; noche `PUBLISHED` y disponible.
- **Disparador:** pulsa «Reservar»/«Comprar» en una noche.
- **Flujo principal:**
  1. La web muestra el resumen de la compra (habitación, fecha, precio, comisión).
  2. El comprador confirma; la wallet firma la transacción `buy`.
  3. La web muestra el estado de la transacción (pendiente → confirmada) y refresca la propiedad.
  4. El NFT aparece en `/mis-noches`.
- **Alternativos:**
  - `A1` Contrato en pausa: compra deshabilitada antes de firmar (`Paused`) y mensaje de pausa.
  - `A2` Revert: mensaje claro con el motivo (p. ej. `NotListed`, `Sold`), sin perder el estado.
  - `A3` Error de red: reintento con UI de error y opción de reintentar.
  - `A4` Aprobación pendiente del asistente: la web exige confirmación explícita antes de firmar.
- **Postcondición:** `nfts.current_owner` = comprador; evento `Sale(PRIMARY)`; email al admin en cola.
- **Criterios:**

```gherkin
Dado un comprador con wallet conectada y una noche disponible
Cuando confirma la compra y firma la transacción
Entonces la transacción confirma y la noche aparece en "Mis noches"
Y el estado de la transacción pasa de pendiente a confirmada con su hash
Y el evento Sale(PRIMARY) queda registrado

Dado el contrato en pausa
Cuando el comprador abre una noche
Entonces la compra está deshabilitada y se muestra el aviso de pausa
Y no se solicita ninguna firma
```

- **Restricciones (EARS):** El sistema no deberá firmar por el usuario; toda escritura on-chain deberá
  pasar por la wallet del comprador. Si la transacción revierte, entonces el sistema deberá mostrar el
  motivo canónico del revert.
- **Trazabilidad:** RF-03, RF-19, RNF-05, RNF-14, RNF-18, ADR-11, CU-05.
- **Oráculos:** evento `Sale`, `nfts.current_owner`, estado de tx en UI, `/mis-noches`; `forge test`
  (`buy`), `useBuyNight`, E2E de compra.

---

### CU-W-06 — Comprar una noche en reventa con royalty

- **Actor:** Comprador secundario.
- **Precondición:** noche listada en reventa (`listings`/`listForResale`) y precio > 0.
- **Disparador:** pulsa «Comprar reventa» en `/reventa` o en la ficha de la noche.
- **Flujo principal:**
  1. La web muestra precio total, royalty para el hotel y vendedor.
  2. El comprador firma `buyResale`; el contrato paga al vendedor y el royalty al hotel (ERC-2981).
  3. La web confirma y actualiza «Mis noches» y el histórico.
- **Alternativos:**
  - `A1` Listado retirado: la compra se rechaza con mensaje (`NotListed`).
  - `A2` Puja superada/cancelada en subasta: el importe queda reclamable (no pierde fondos).
  - `A3` Reventa del propio token: el contrato impide comprar tu propia noche.
- **Postcondición:** transferencia on-chain, evento `Sale(SECONDARY)` + `RoyaltyPaid`.
- **Criterios:**

```gherkin
Dado un comprador y una noche listada en reventa a precio P
Cuando firma la compra de reventa
Entonces el vendedor recibe P menos el royalty y el hotel recibe el royalty
Y se emite RoyaltyPaid con el importe exacto
Y la noche aparece en "Mis noches" del comprador
```

- **Restricciones (EARS):** De acuerdo con RF-08, el sistema deberá aplicar el royalty en toda venta
  secundaria y el contrato deberá bloquear transferencias directas y a coste 0.
- **Trazabilidad:** RF-07, RF-08, RNF-10, RNF-14, CU-07, ERC-2981, ADR-27.
- **Oráculos:** eventos `Sale(SECONDARY)`/`RoyaltyPaid`, balances de vendedor/hotel; `forge test`;
  E2E de reventa.

---

### CU-W-07 — Poner en reventa, editar precio y retirar

- **Actor:** Portador de la noche.
- **Precondición:** es propietario del NFT y la noche no ha caducado ni está usada.
- **Disparador:** abre `/mis-noches/mis-reventas` y pulsa «Poner en venta».
- **Flujo principal:**
  1. La web valida propiedad y fecha.
  2. El portador fija precio (> 0) y firma `list`; el listado aparece en `/reventa`.
  3. Puede editar el precio (relist) o retirarlo (`unlist`).
- **Alternativos:**
  - `A1` Precio 0 o negativo: rechazo antes de firmar.
  - `A2` Noche caducada: no se permite listar.
  - `A3` Error de firma: estado sin cambios y mensaje claro.
- **Criterios:**

```gherkin
Dado un portador con una noche vigente
Cuando la pone en venta con precio mayor que 0 y firma
Entonces se emite Listed y la noche aparece en "/reventa"
Y su estado en "Mis reventas" es "publicada"

Dado un listado activo
Cuando el portador lo retira
Entonces se emite Unlisted y la noche deja de mostrarse en "/reventa"
```

- **Trazabilidad:** RF-07, RF-36, RNF-10, CU-06/CU-36.
- **Oráculos:** eventos `Listed`/`Unlisted`, `/reventa`, `/mis-noches/mis-reventas`; tests de listado.

---

### CU-W-08 — Cobrar lo acreditado por reventas

- **Actor:** Portador.
- **Precondición:** saldo pendiente > 0 por ventas secundarias.
- **Disparador:** pulsa «Cobrar» en «Mis reventas»/cartera.
- **Flujo principal:**
  1. La web muestra el saldo pendiente (pull payment).
  2. El portador firma `claim`; el contrato transfiere el saldo a su wallet.
  3. El saldo pendiente pasa a 0 y se refleja el cobro.
- **Alternativos:**
  - `A1` Sin saldo: el botón no está disponible.
  - `A2` Revert por reentrancy: protegido (`nonReentrant`) y la UI muestra el error.
- **Criterios:**

```gherkin
Dado un vendedor con saldo pendiente por reventas
Cuando firma la reclamación
Entonces recibe el importe exacto en su wallet
Y el saldo pendiente queda en 0
```

- **Trazabilidad:** RF-15, ADR-15, CU-07.
- **Oráculos:** saldo on-chain antes/después, `claim()`; `forge test` de retirada.

---

### CU-W-09 — Consultar y usar mis noches (resguardo QR + pase)

- **Actor:** Portador.
- **Precondición:** wallet conectada con al menos un NFT-noche; para el pase, estancia vigente.
- **Disparador:** abre `/mis-noches`.
- **Flujo principal:**
  1. La web lista las noches propias con su estado (disponible, reservada, usada, caducada).
  2. El portador abre el resguardo: QR + datos de la estancia y comprobante firmado (JWS).
  3. Puede descargar el pase y presentarlo en recepción para el check-in.
- **Alternativos:**
  - `A1` Token caducado: se muestra como caducado y no genera QR de check-in.
  - `A2` Resguardo ya usado: el QR se invalida (sin doble uso).
  - `A3` RPC caído: se muestran los datos cacheados con aviso, sin QR falso.
- **Postcondición:** resguardo emitido/consumido de forma idempotente.
- **Criterios:**

```gherkin
Dado un portador con una noche vigente
Cuando abre su resguardo en "Mis noches"
Entonces ve un QR y el resumen de la estancia
Y el pase firmado incluye el tokenId y la vigencia

Dado un resguardo ya utilizado
Cuando se intenta reutilizar
Entonces la validación devuelve "usado" y no se permite un segundo check-in
```

- **Restricciones (EARS):** El sistema deberá emitir el resguardo sin PII on-chain. Si el QR no se puede
  validar, entonces el sistema deberá rechazarlo y ofrecer el check-in de contingencia.
- **Trazabilidad:** RF-20, RF-33, RF-37, ADR-05, ADR-30, CU-08/CU-37.
- **Oráculos:** `TicketView`, `data-testid` del QR, `passes/jws.ts`, `/api/wallet/pass/[tokenId]`,
  `/api/qr/[tokenId]`; `passes` tests y E2E de check-in.

---

### CU-W-10 — Hacer check-in / check-out en recepción

- **Actor:** Recepcionista.
- **Precondición:** sesión con `RECEPTION_ROLE`; pase QR/JWS válido (o búsqueda por código de reserva).
- **Disparador:** el huésped llega a recepción con su pase.
- **Flujo principal:**
  1. El recepcionista escanea el QR o busca la reserva por código de recuperación.
  2. La API valida firma, vigencia y no-doble-uso y registra el check-in.
  3. En el check-out, verifica la habitación, registra `stay_checkouts` y liquida cargos
     (incluidos los daños aceptados).
- **Alternativos:**
  - `A1` QR inválido/expirado: se ofrece check-in de contingencia con auditoría (`contingency`).
  - `A2` Reserva no encontrada: búsqueda por código con mensaje explícito.
  - `A3` Inspección con incidencia: se abre incidencia y el cargo asociado.
- **Criterios:**

```gherkin
Dado un recepcionista con sesión en "/recepcion"
Cuando escanea un pase válido
Entonces el check-in queda registrado y el pase no se puede reutilizar
Y la estancia figura como activa en el panel del día

Dado un check-out con daños aceptados
Cuando el recepcionista confirma la salida
Entonces se cancela el cargo pendiente y se registran los aceptados en el folio
Y la habitación pasa a "pendiente de limpieza"
```

- **Restricciones (EARS):** El sistema deberá verificar la firma del pase en servidor, nunca en cliente.
  Mientras no haya sesión válida, el sistema no deberá servir el panel de recepción.
- **Trazabilidad:** RF-31–RF-35, RF-50, ADR-05, D-05, CU-33/CU-34/CU-38.
- **Oráculos:** HTTP del check-in, `stay_checkouts`, `housekeeping_room_logs`, estados de
  `rooms.operational_status`; E2E de puertas de sesión; `f7-f10` evidencias.

---

### CU-W-11 — Operar el día en recepción (reservas, habitaciones, incidencias, PMS)

- **Actor:** Recepcionista.
- **Precondición:** sesión `RECEPTION_ROLE`.
- **Disparador:** abre `/recepcion/reservas`, `/recepcion/habitaciones` o `/recepcion/incidencias`.
- **Flujo principal:**
  1. Ve las reservas del día y el estado de las 50 habitaciones (publicación + operativo).
  2. Abre la ficha de una habitación y actúa según su estado (ficha, check-in/out, incidencias).
  3. Reporta una incidencia de mantenimiento (sin firma) y publica/despublica la venta manualmente.
  4. Sincroniza con el PMS cuando aplica; si falla, la web declara el estado degradado.
- **Alternativos:**
  - `A1` PMS caído: la conciliación queda pendiente y visible; no bloquea la operación.
  - `A2` Habitación en mantenimiento: no se publica; la acción queda auditada.
  - `A3` Conflicto de estado: bloqueo optimista con aviso de recarga.
- **Criterios:**

```gherkin
Dado un recepcionista con sesión
Cuando abre el tablero del día
Entonces ve las reservas y las 50 habitaciones con sus dos estados
Y los datos ocultos al rol no se envían en el HTML

Dado que el PMS no responde
Cuando el recepcionista intenta conciliar
Entonces la web declara el fallo y mantiene la operación manual disponible
```

- **Trazabilidad:** RF-31, RF-32, RF-47–RF-55, D-31/D-32, CU-31/CU-32/CU-39.
- **Oráculos:** `/api/reception/*`, `/recepcion/danos`, `data-testid` del tablero, guardas de sesión
  (`e2e/danos.spec.ts`, `e2e/mantenimiento.spec.ts`).

---

### CU-W-12 — Consultar y reclamar un cargo por daños (portal huésped)

- **Actor:** Huésped.
- **Precondición:** cargo por daños asociado a su noche/folio, con notificación enviada.
- **Disparador:** abre el enlace del aviso o `/mis-noches/cargos`.
- **Flujo principal:**
  1. La web muestra el cargo (descripción, importe, plazo) sin exponer datos internos.
  2. El huésped acepta (`ACKNOWLEDGED`) o reclama con notas (`DISPUTED`).
  3. La reclamación queda resuelta por el hotel (`RESOLVED_ACCEPTED`/`RESOLVED_REJECTED`) y el
     check-out liquida o cancela el cargo.
- **Alternativos:**
  - `A1` Plazo vencido: el cargo pasa a `EXPIRED` y la reclamación se rechaza.
  - `A2` Enlace inválido: página honesta sin datos.
  - `A3` Resolución aceptada sin pago: el cargo se liquida en el check-out (`PAID`) con aviso.
- **Criterios:**

```gherkin
Dado un huésped con un cargo pendiente y su enlace
Cuando abre el portal del cargo
Entonces ve la descripción, el importe y el plazo de reclamación
Y no ve paneles internos ni datos de otros huéspedes

Dado un huésped que reclama dentro de plazo
Cuando envía su reclamación
Entonces el estado pasa a DISPUTED y se registra la fecha
Y el hotel puede resolverla con RESOLVED_ACCEPTED o RESOLVED_REJECTED
```

- **Restricciones (EARS):** El sistema deberá notificar con datos mínimos y no incluir PII completa en
  el enlace. Si la reclamación está fuera de plazo, entonces el sistema deberá rechazarla.
- **Trazabilidad:** RF-K-08, RF-S-04, RF-64, RNF-M-10, D-C14, CU-V-33/CU-V-41/CU-V-42.
- **Oráculos:** tabla `damage_charge_guest_notifications` y sus estados, `/mis-noches/cargos`,
  `e2e/danos.spec.ts`; evidencia F7/F10.

---

### CU-W-13 — Consultar el histórico público de ventas

- **Actor:** Visitante.
- **Precondición:** ninguna.
- **Disparador:** abre `/historico`.
- **Flujo principal:**
  1. La web muestra las ventas primarias y secundarias indexadas del worker (sin PII).
  2. Permite paginar y ver el detalle de una venta (precio, tipo, fecha).
- **Alternativos:**
  - `A1` Worker caído: estado degradado explícito sin datos inventados.
  - `A2` Sin ventas: empty-state.
- **Criterios:**

```gherkin
Dado un visitante
Cuando abre "/historico"
Entonces ve las ventas indexadas con precio, tipo y fecha
Y no aparece ningún dato personal del comprador

Dado que el worker no responde
Cuando se abre "/historico"
Entonces se muestra el estado degradado y no una tabla vacía engañosa
```

- **Trazabilidad:** RF-15, RNF-05, ADR-25, CU-09.
- **Oráculos:** `/historico`, `[data-testid="degraded-state"]`, `/api/sales/history`;
  `e2e/observabilidad.spec.ts`.

---

### CU-W-14 — Participar en una subasta (ver, pujar, liquidar)

- **Actor:** Comprador.
- **Precondición:** subasta abierta para una noche del hotel; saldo para pujar.
- **Disparador:** abre `/subastas` y elige una subasta.
- **Flujo principal:**
  1. La web muestra puja mínima, cuenta atrás y estado de la subasta.
  2. El comprador firma `bid`; si supera la mejor puja, su importe queda como mejor postura.
  3. Al cerrar, alguien liquida (`settle`) y la noche pasa al ganador; los no ganadores retiran.
- **Alternativos:**
  - `A1` Puja por debajo del mínimo: revert con mensaje.
  - `A2` Anti-sniping: una puja en los últimos 5 min extiende la subasta.
  - `A3` Puja superada: el importe queda reclamable (`withdraw`), sin pérdida.
- **Criterios:**

```gherkin
Dado un comprador y una subasta abierta
Cuando puja por encima de la puja mínima y firma
Entonces su postura queda registrada como la mejor
Y la cuenta atrás refleja la hora de cierre vigente

Dado un comprador con una puja superada
Cuando retira sus fondos
Entonces recibe exactamente su puja y no la del ganador
```

- **Trazabilidad:** RF-13, ADR-28, CU-48/CU-49.
- **Oráculos:** `NightAuction` (`bid`/`settle`/`withdraw`), `/subastas`, `AuctionCreated`/`BidPlaced`;
  `forge test` de subasta.

---

### CU-W-15 — Escribir y consultar reseñas verificadas

- **Actor:** Huésped con noche consumida.
- **Precondición:** noche usada/estancia finalizada; una reseña por token.
- **Disparador:** desde «Mis noches» o `/resenas`.
- **Flujo principal:**
  1. La web solo habilita la reseña si la noche está consumida.
  2. El huésped puntúa (1–5) y comenta; se guarda anónima y verificada (`status = PENDING`).
  3. El hotel modera; las aprobadas aparecen en `/resenas` con la media.
- **Alternativos:**
  - `A1` Noche no consumida: la acción no está disponible.
  - `A2` Reseña duplicada: el `UNIQUE(token_id)` la rechaza.
  - `A3` Rechazada: no se publica y el huésped ve el estado.
- **Criterios:**

```gherkin
Dado un huésped con una noche consumida
Cuando envía una reseña de 5 estrellas
Entonces se guarda como PENDING sin publicar el número de habitación
Y no puede enviar una segunda reseña para la misma noche

Dado un moderador con sesión
Cuando aprueba una reseña
Entonces la reseña aparece en "/resenas" y actualiza la media
```

- **Trazabilidad:** RF-61, D-C… reseñas F6, RNF-05.
- **Oráculos:** tabla `reviews` (`status`, `UNIQUE(token_id)`), `/api/reviews`, `/admin/resenas`;
  tests de moderación y E2E de reseñas.

---

### CU-W-16 — Pedir ayuda al asistente IA (hotel y compra)

- **Actor:** Visitante/Comprador.
- **Precondición:** servicio LLM/MCP disponible.
- **Disparador:** escribe en `/asistente`.
- **Flujo principal:**
  1. El asistente responde solo del dominio (hotel y compra de noches), usando las herramientas
     read-only del MCP y `searchHotelManuals` para dudas del hotel.
  2. Cuando procede una compra, devuelve los datos de la tx y **espera confirmación explícita**.
  3. La web muestra la tx decodificada antes de firmar.
- **Alternativos:**
  - `A1` LLM/MCP caído: 503 determinista con estado «no disponible» (sin inventar).
  - `A2` Pregunta fuera de dominio: rechazo acotado sin datos de negocio.
  - `A3` Respuesta del índice sin coincidencia: lo declara y no inventa (RF-59).
- **Criterios:**

```gherkin
Dado un visitante en "/asistente"
Cuando pregunta por los horarios del hotel
Entonces la respuesta cita "manual §sección" del índice
Y si no hay coincidencia lo declara en lugar de inventar

Dado un asistente que propone una compra
Cuando el usuario pulsa comprar
Entonces la web muestra la tx decodificada (to/value/tokenId) y exige confirmación antes de firmar
```

- **Restricciones (EARS):** El MCP no deberá tener herramientas de escritura ni acceso a BD. El sistema
  no deberá firmar transacciones desde el servidor.
- **Trazabilidad:** RF-12, RF-56–RF-60, RF-65, RNF-22–RNF-27, ADR-30, DT-AUD-15, CU-16/CU-47.
- **Oráculos:** `/api/assistant` 503 sin backend, `data-testid` del mensaje y handoff, herramientas MCP
  (`verify:mcp-tools`), `prompt-leak-filter` y `e2e/asistente*.spec.ts`.

---

### CU-W-17 — Consultar manuales y ayuda

- **Actor:** Visitante/Huésped/Operador.
- **Precondición:** ninguna.
- **Disparador:** abre `/ayuda` o el manual de su rol.
- **Flujo principal:**
  1. La web indexa los manuales generados (cliente, comprador, recepción, huésped).
  2. El usuario navega por secciones o busca.
  3. Cada página respeta `lang`, jerarquía de títulos y contraste (RNF-20).
- **Alternativos:** `A1` sección inexistente: 404 honesto; `A2` idioma sin traducción: fallback ES.
- **Criterios:**

```gherkin
Dado un visitante
Cuando abre "/ayuda"
Entonces ve el índice de manuales y puede abrir cada guía
Y cada página tiene un H1 único y enlace de salto al contenido
```

- **Trazabilidad:** RF-56, RF-59, RF-65, RNF-20.
- **Oráculos:** `/ayuda/**`, axe de `/ayuda*` en `a11y.spec.ts`, `manuals.generated.ts`.

---

### CU-W-18 — Recibir avisos por email y push (alta/baja)

- **Actor:** Huésped/Portador.
- **Precondición:** permiso de notificaciones o email de contacto.
- **Disparador:** una venta, reventa, cargo o recordatorio.
- **Flujo principal:**
  1. El usuario activa push en la web (`subscribe`) o recibe email por la cola única.
  2. El worker entrega el aviso de forma idempotente y con reintentos.
  3. El usuario puede darse de baja (`unsubscribe`) y deja de recibirlos.
- **Alternativos:** `A1` Sin permiso: no se solicita de nuevo sin acción del usuario; `A2` cola caída:
  el aviso queda persistido y se reintenta; `A3` baja: se borra la suscripción.
- **Criterios:**

```gherkin
Dado un usuario que activa las notificaciones push
Cuando se produce una venta propia
Entonces recibe el aviso con el enlace a la noche
Y el aviso no se duplica si el worker reprocesa el evento

Dado un usuario que se da de baja
Cuando el worker procesa un nuevo evento
Entonces no se le envía ninguna notificación push
```

- **Trazabilidad:** RF-09, RF-16, RF-37, RNF-12, ADR-21/ADR-24.
- **Oráculos:** `push_subscriptions`, `email_notifications` (estados), `/api/push/*`, worker tests.

---

### CU-W-19 — Acceder al back-office (password + TOTP), gestionar mi seguridad y salir

- **Actor:** Operador (owner, recepción, jefes, soporte).
- **Precondición:** usuario provisionado con TOTP.
- **Disparador:** abre `/admin` o una suite protegida.
- **Flujo principal:**
  1. Sin sesión, la web sirve el acceso (no el panel).
  2. El operador introduce usuario + contraseña; si es correcto, introduce TOTP/rescate.
  3. Se emiten cookies HttpOnly (access + refresh) y entra al panel de su rol.
  4. Puede cambiar contraseña, reconfigurar MFA y cerrar sesión (revocación inmediata).
- **Alternativos:**
  - `A1` Credenciales inválidas: error genérico, sin filtrar si el usuario existe.
  - `A2` 5 intentos fallidos: bloqueo temporal (`423`) y rate limit (`429`).
  - `A3` Token expirado: `401`, renovación con refresh; si falla, vuelve al acceso.
  - `A4` Rol insuficiente: `403`/panel de rol denegado (el owner satisface todo).
- **Criterios:**

```gherkin
Dado un operador sin sesión
Cuando abre "/admin/habitacion"
Entonces ve la pantalla de acceso y no el panel
Y el HTML no incluye datos de habitaciones

Dado un operador con contraseña válida
Cuando introduce el TOTP correcto
Entonces recibe cookies HttpOnly y accede a su panel
Y tras "Cerrar sesión" el token queda revocado en Redis
```

- **Restricciones (EARS):** El sistema deberá verificar firma, expiración y blocklist del JWT en servidor.
  Mientras Redis no esté disponible, el sistema deberá fallar en cerrado (no autorizar).
- **Trazabilidad:** RNF-06, RNF-13, ADR-04, CU-01/CU-46, D-04.
- **Oráculos:** `/api/auth/*`, cookies `hotel_access_token`, `admin-sign-in`, `guard.test.ts`,
  `auth-endpoints.test.ts`, E2E de puertas de sesión.

---

### CU-W-20 — Administrar habitaciones, publicar ficha firmada y acuñar la ventana

- **Actor:** Owner.
- **Precondición:** sesión `DEFAULT_ADMIN_ROLE`; wallet conectada para publicar/firmar.
- **Disparador:** abre `/admin/habitacion`.
- **Flujo principal:**
  1. Lista/crea/edita la ficha (datos, servicios, espacios, galería JPG ≤ 2 MB).
  2. Publica con TOTP: el servidor devuelve la huella; la wallet firma (EIP-191, ADR-30) y el anclaje
     es best-effort; la publicación queda `PUBLISHED` y se acuña la ventana de noches.
  3. Puede pausar/reactivar la venta, archivar (nunca borrar) y consultar la ficha.
- **Alternativos:**
  - `A1` Sin wallet: se publica como pendiente de anclaje (`PENDING_ANCHOR`) con aviso.
  - `A2` Ficha incompleta (sin descripción ES o sin imagen): no se permite publicar.
  - `A3` RPC caído: la publicación off-chain sigue y queda pendiente de anclaje.
  - `A4` Acuñado parcial: el botón «Acuñar ventana» reanuda de forma idempotente.
- **Criterios:**

```gherkin
Dado un owner con wallet conectada y una ficha completa
Cuando publica con el TOTP correcto
Entonces la ficha pasa a PUBLISHED
Y se registra una publicación con huella, firma y (si se pudo) tx de anclaje
Y el estado muestra "Habitación publicada"

Dado un owner sin wallet conectada
Cuando publica con TOTP
Entonces la ficha se publica como pendiente de anclaje y queda visible el aviso

Dado un acuñado interrumpido
Cuando se pulsa "Acuñar ventana" de nuevo
Entonces continúa desde la primera noche no acuñada sin duplicar tokens
```

- **Restricciones (EARS):** El sistema no deberá publicar sin descripción ES y al menos una imagen.
  De acuerdo con D-8, archivar nunca deberá borrar la ficha. La firma de publicación deberá cubrir la
  huella, la hora UTC y el dominio (anti-phishing).
- **Trazabilidad:** RF-05, RF-18a/b, RF-19, D-1…D-28, ADR-30, CU-02.
- **Oráculos:** `room-publish-totp`, `room-publish-confirm`, `rooms-notice`, `/api/admin/rooms/*`,
  `room_publications`, `e2e/wallet-publicacion.spec.ts` (A5), tests de publicación/firma.

---

### CU-W-21 — Administrar contenido público y actividades

- **Actor:** Owner.
- **Precondición:** sesión `DEFAULT_ADMIN_ROLE`.
- **Disparador:** abre `/admin/contenido` o `/admin/actividades`.
- **Flujo principal:**
  1. Gestiona galería del hotel (`hotel_images`) y planes informativos (`hotel_offers`).
  2. Gestiona actividades y horarios (`activities`, `activity_schedules`) y sus reservas.
  3. Los cambios se reflejan en la home/secciones públicas.
- **Alternativos:** `A1` Imagen no JPG o > 2 MB: rechazo con mensaje; `A2` oferta sin título ES:
  rechazo; `A3` actividad con plazas llenas: no admite nuevas reservas.
- **Criterios:**

```gherkin
Dado un owner en "/admin/contenido"
Cuando sube una imagen JPG de menos de 2 MB y la marca como portada
Entonces aparece en la sección pública correspondiente
Y no puede haber dos portadas en la misma sección

Dado un owner en "/admin/actividades"
Cuando crea una actividad con aforo 10 y fecha
Entonces la actividad y su horario se publican en "/actividades"
```

- **Trazabilidad:** RF-18a, RF-62, RF-63, D-66/D-69/D-73/D-74, RNF-05, CU-… (contenido F5/F10).
- **Oráculos:** `hotel_images`, `hotel_offers`, `activity_schedules`, `/admin/contenido`,
  `/admin/actividades`, `/api/admin/content*`, `/api/admin/actividades*`.

---

### CU-W-22 — Moderar reseñas

- **Actor:** Owner.
- **Precondición:** reseñas `PENDING`.
- **Disparador:** abre `/admin/resenas`.
- **Flujo principal:**
  1. Ve la cola de reseñas pendientes con nota y comentario.
  2. Aprueba o rechaza con notas de moderación (`moderation_notes`).
  3. Las aprobadas se publican y actualizan la media; las rechazadas no se muestran.
- **Alternativos:** `A1` Reseña ya moderada: no se puede volver a moderar; `A2` contenido ofensivo:
  rechazo con motivo.
- **Criterios:**

```gherkin
Dado un owner con reseñas pendientes
Cuando aprueba una reseña
Entonces su estado pasa a APPROVED y se publica en "/resenas"
Y la media pública se recalcula

Cuando rechaza una reseña con un motivo
Entonces queda REJECTED con la nota de moderación y no se publica
```

- **Trazabilidad:** RF-57–RF-60 (v3), F6, RNF-05.
- **Oráculos:** `reviews.status`, `moderation_notes`, `/api/admin/reviews`, `/admin/resenas`.

---

### CU-W-23 — Gobernar la plataforma (roles, wallets, flags, operarios, auditoría, backups)

- **Actor:** Owner/Soporte.
- **Precondición:** sesión `DEFAULT_ADMIN_ROLE`; wallet para operaciones on-chain.
- **Disparador:** abre `/admin/sistemas/*`, `/admin/roles`, `/admin/royalty`.
- **Flujo principal:**
  1. **Usuarios/roles del back-office**: lista, crea/rota/activa operadores (CU-42).
  2. **Wallets on-chain**: asigna roles con tx minada + comprobación `hasRole` antes de marcar BD; la
     baja solo cuando el rol ya no está activo (CU-V-35).
  3. **Flags**: cambia flags obligatorios solo con firma `CONFIG` (prepare → sign → confirm → apply).
  4. **Operarios de terminal**: alta con PIN de un solo uso, rotación, baja y desbloqueo.
  5. **Auditoría/backups**: exporta expediente firmado (A10) y ejecuta/verifica restauración (A9).
  6. **Subastas**: abre/cancela subastas de noches premium (CU-48).
- **Alternativos:** `A1` Tx no minada o `hasRole` falso: 409 y sin cambio en BD; `A2` flag obligatorio
  sin firma: 409 `CONFIG_SIGNATURE_REQUIRED`; `A3` sin permiso: 403.
- **Subcasos enumerados (decisión 2026-10-20: el CU-W-23 se mantiene como paraguas):**

| Subcaso | Acción del owner | Oráculo |
|---|---|---|
| 23.1 Usuarios/roles del back-office | listar/crear/rotar/activar operadores | `/api/admin/system/users`, `admin_users`, `operator_audit_log` |
| 23.2 Wallets y roles on-chain | asignar/baja de rol con tx + `hasRole` | `operator_wallets`, tx minada, 409 si no mina |
| 23.3 Flags de firma | prepare → sign `CONFIG` → confirm → apply | `/api/admin/settings/flags`, `on_chain_signatures`, 409 sin firma |
| 23.4 Operarios de terminal | alta con PIN de un uso, rotación, baja, desbloqueo | `terminal_operators`, PIN bcrypt, bloqueo a los 5 intentos |
| 23.5 Auditoría y backups | export firmado (A10), restore drill (A9) | export verificable, evidencia A9/A10 |
| 23.6 Subastas (administración) | abrir/cancelar subasta | `NightAuction.createAuction/cancel`, `/admin/subastas` |
- **Criterios:**

```gherkin
Dado un owner con wallet conectada
Cuando asigna un rol on-chain a una wallet y la tx se mina
Entonces la BD registra la wallet solo después de comprobar hasRole
Y si la tx no se mina la API devuelve 409 y no cambia la BD

Dado un flag de firma obligatorio activo
Cuando el owner intenta desactivarlo sin firma CONFIG
Entonces la API devuelve 409 y el flag no cambia

Dado un owner que exporta la auditoría
Cuando solicita el expediente firmado
Entonces descarga un archivo verificable con su firma
```

- **Restricciones (EARS):** De acuerdo con RNF-M-15, el sistema deberá revocar el rol on-chain antes de
  marcar `revoked_at`. El sistema deberá registrar en `operator_audit_log` todo cambio de configuración.
- **Trazabilidad:** RF-06, RF-41–RF-46, RNF-M-11/15/16/19, CU-41…CU-46, CU-V-35/36/37/40/43/45.
- **Oráculos:** `/api/admin/system/*`, `operator_wallets`, `on_chain_signatures`, `operator_audit_log`,
  export firmado, evidencia F9/A10/A11.

---

### CU-W-24 — Supervisar la operación (salud, métricas, cola de anclajes, MCP read-only)

- **Actor:** Owner/Operador de plataforma.
- **Precondición:** sesión válida (métricas) o acceso a `/health` (sin sesión, solo estado).
- **Disparador:** abre `/admin/dashboard`, `/admin/sistemas/operaciones` o consulta `/health/*`.
- **Flujo principal:**
  1. El dashboard muestra KPIs (vendido, royalties, ocupación comercial) y exporta CSV.
  2. Operaciones muestra salud de worker, cadena y cola de anclajes (firmas pendientes).
  3. `/health/live` y `/health/ready` responden estado de dependencias.
  4. El MCP expone solo lectura para el asistente (sin escrituras).
- **Alternativos:** `A1` Worker caído: la cola se muestra con `workerAvailable=false`, no 503;
  `A2` Redis/PostgreSQL caídos: `ready` 503 con dependencia concreta; `A3` export fallido: error claro.
- **Criterios:**

```gherkin
Dado un owner autenticado
Cuando abre el dashboard
Entonces ve los KPIs con su periodo y puede exportar CSV
Y las cifras coinciden con el histórico indexado

Dado que el worker está degradado
Cuando abre la cola de anclajes
Entonces ve las firmas pendientes con workerAvailable=false
Y la API responde 200 (no oculta la cola)

Cuando consulta "/health/ready" con PostgreSQL caído
Entonces la respuesta es 503 indicando la dependencia down
```

- **Restricciones (EARS):** El MCP deberá ser estrictamente read-only (RF-12/DT-AUD-15). El sistema
  deberá exponer health checks de worker, RPC y base para el monitor.
- **Trazabilidad:** RF-10, RF-45, RNF-17, DT-AUD-15, CU-11/CU-45, CU-V-43.
- **Oráculos:** `/admin/dashboard`, `/api/admin/metrics`, `/api/admin/system/operations`, `/health/*`,
  guardián MCP, `a8-load-gate.json`.

---

## 5. Consolidación del catálogo histórico y vNext

Cada caso de uso ya catalogado se mapea a su realización actual y a su evidencia. Los criterios
detallados de los CU heredados viven en su documento fuente; aquí se fija **el estado de implementación**
para que no haya dos verdades con criterios divergentes.

### 5.1 CU del MVP contrato/compra (`docs/CASOS-DE-USO.md`)

| CU | Caso de uso | Estado en la web | Evidencia / relación |
|---|---|---|---|
| CU-01 | Autenticarse en el back-office | **Sustituido por CU-W-19** (password + TOTP, ya no SIWE) | `/api/auth/*`, ADR-04 |
| CU-02 | Mintear una noche | **Sustituido por CU-W-20** (ventana de acuñación desde `/admin/habitacion`; `/admin/mint` retirado) | `/api/admin/rooms/[id]/mint-window` |
| CU-04 | Explorar y filtrar el catálogo | **CUMPLE** → CU-W-02 | `/catalogo`, E2E |
| CU-05 | Comprar en venta primaria | **CUMPLE** → CU-W-05 | `forge test`, E2E compra |
| CU-06 | Listar/cancelar reventa | **CUMPLE** → CU-W-07 | `list`/`unlist` |
| CU-07 | Comprar reventa con royalty | **CUMPLE** → CU-W-06 | `RoyaltyPaid` |
| CU-08 | Asistente IA para disponibilidad/compra | **CUMPLE** → CU-W-16 | MCP + `validate-tx` |
| CU-09 | Histórico público | **CUMPLE** → CU-W-13 | `/historico` |
| CU-10 | Email al admin por venta | **CUMPLE** → CU-W-18 (worker, idempotente) | `email_notifications` |
| CU-11 | Dashboard de métricas | **CUMPLE** → CU-W-24 | `/admin/dashboard` |
| CU-12 | Configurar royalty | **CUMPLE** → CU-W-23 | `/admin/royalty`, `setRoyaltyBps` |
| CU-13 | Gestionar noches caducadas (burn) | **CUMPLE** → CU-W-23 | `/admin/caducadas`, worker |
| CU-14 | Pausar/reanudar | **CUMPLE** → CU-W-23 | `/admin/pausa` |
| CU-15 | Retirar fondos a tesorería | **CUMPLE** → CU-W-23 | `/admin/fondos` |
| CU-16 | Roles y ownership | **CUMPLE** → CU-W-23 | `/admin/roles`, Sistemas |
| CU-17 | Onboarding web3 | **CUMPLE** → CU-W-04 | `WalletMenu`, E2E |
| CU-PR-01 | Faucet (solo dev/test) | **CUMPLE** (no producción) | `/api/faucet`, `FaucetButton` |
| CU-PR-02 | Despliegue local con roles y registro | **CUMPLE** (operación) | `Deploy.s.sol`, `sync` |

### 5.2 CU del catálogo SRS §9 (`docs/SRS.md`)

| CU | Caso de uso | Actor | Estado | Relación / evidencia |
|---|---|---|---|---|
| CU-30 | Operar todos los paneles con la cuenta owner | Owner | **CUMPLE** | `admin-roles.ts`, D-30, §E2E gates |
| CU-31 | Ver reservas del día y estado de las 50 habitaciones | Recepción | **CUMPLE** → CU-W-11 | `/recepcion` |
| CU-32 | Localizar reserva por código de recuperación | Recepción | **CUMPLE** → CU-W-11 | `lookup` |
| CU-33 | Check-in por QR/JWS | Recepción | **CUMPLE** → CU-W-10 | `/api/reception/checkin` |
| CU-34 | Check-out con verificación y cancelación de cargos | Recepción | **CUMPLE** → CU-W-10 | `stay_checkouts` |
| CU-35 | Alta de cargos adicionales | Recepción | **CUMPLE** → CU-W-10 | `additional_charges` |
| CU-36 | Publicar/editar/retirar reventa | Portador | **CUMPLE** → CU-W-07 | `/mis-noches/mis-reventas` |
| CU-37 | Avisos in-app/push de reventas | Portador | **CUMPLE** → CU-W-18 | `useWebPush`, `sw.js` |
| CU-38 | Liberar habitación tras limpieza | Recepción | **CUMPLE** | `reception.repository` |
| CU-39 | Ficha detalle de habitación por estado | Recepción | **CUMPLE** → CU-W-11 | `day-board.ts` |
| CU-40 | Menú de cuenta/wallet | Todos | **CUMPLE** | `WalletMenu`, CU-W-04/19 |
| CU-41 | Entrar en Sistemas (owner) | Owner | **CUMPLE** → CU-W-23 | `app/admin/sistemas/*` |
| CU-42 | Gestionar usuarios de plataforma | Owner | **CUMPLE** → CU-W-23 | `/api/admin/system/users` |
| CU-43 | Consultar/gobernar contrato | Owner | **CUMPLE** → CU-W-23 | `SystemContractState` |
| CU-44 | Consultar finanzas y retirar | Owner | **CUMPLE** → CU-W-23 | `SystemFinances` |
| CU-45 | Consultar operaciones (salud worker/cadena) | Owner | **CUMPLE** → CU-W-24 | `/api/admin/system/operations` |
| CU-46 | Seguridad de mi cuenta (MFA/contraseña) | Todos | **CUMPLE** → CU-W-19 | `/api/auth/password`, `mfa/setup` |
| CU-47 | Configurar royalty por tipo | `ROYALTY_ADMIN` | **CUMPLE** → CU-W-23 | `setRoyaltyBps` |
| CU-48 | Subastar noche premium | `AUCTION_ADMIN` | **CUMPLE** → CU-W-14 | `NightAuction.createAuction` |
| CU-49 | Pujar/seguir/liquidar subasta | Comprador | **CUMPLE** → CU-W-14 | `bid`/`settle`/`withdraw` |
| CU-50 | Entender y autorizar lo que se firma | Huésped/Operador | **CUMPLE** | `wallet-messages.ts`, ADR-30 |

### 5.3 CU de las suites de personal (`propuesta_vNext/casos_uso.md`)

> Los criterios Gherkin/EARS completos están en el documento fuente (2.890 líneas, auditado). Aquí se
> consolida el estado de implementación F4–F9 y la evidencia.

| CU-V | Caso de uso (resumen) | Suite / ciclo | Estado |
|---|---|---|---|
| CU-V-01 | Autenticarse en la Suite de Mantenimiento | Mantenimiento · F4 | **CUMPLE** |
| CU-V-02 | Recibir, clasificar y asignar incidencias | Mantenimiento · F4 | **CUMPLE** |
| CU-V-03 | Bloquear habitación (firma obligatoria) | Mantenimiento · F4 | **CUMPLE** |
| CU-V-04 | Resolver y cerrar incidencia | Mantenimiento · F4 | **CUMPLE** |
| CU-V-05 | Desbloquear tras verificación (firma) | Mantenimiento · F4 | **CUMPLE** |
| CU-V-06 | Configurar plan preventivo | Mantenimiento · F4 | **CUMPLE** |
| CU-V-07 | Registrar tarea preventiva (firma en críticas) | Mantenimiento · F4 | **CUMPLE** |
| CU-V-08 | Mantenimiento rutinario de áreas comunes | Mantenimiento · F4 | **CUMPLE** |
| CU-V-09 | Validar tareas de subordinados (SLA 24 h) | Mantenimiento · F4/F8 | **CUMPLE** |
| CU-V-10 | Informes de mantenimiento | Mantenimiento · F4 | **CUMPLE** |
| CU-V-11 | Notificar habitación lista (fusión en CU-V-19) | Sistema · F6 | **CUMPLE (fusionado)** |
| CU-V-12 | Terminal de mantenimiento con PIN | Terminal · F5 | **CUMPLE** |
| CU-V-13 | Ver incidencias/tareas asignadas | Técnico · F4/F5 | **CUMPLE** |
| CU-V-14 | Registrar avance/cierre con evidencia | Técnico · F4/F5 | **CUMPLE** |
| CU-V-15 | Reportar incidencia desde terminal | Técnico · F5 | **CUMPLE** |
| CU-V-16 | Autenticarse en la Suite Ama de llaves | Ama de llaves · F6 | **CUMPLE** |
| CU-V-17 | Crear turnos y asignar habitaciones | Ama de llaves · F6 | **CUMPLE** |
| CU-V-18 | Tablero de estado operativo en tiempo real | Ama de llaves · F6 | **CUMPLE** |
| CU-V-19 | Notificación de habitaciones a limpiar | Ama de llaves · F6 | **CUMPLE** |
| CU-V-20 | Supervisar trabajo de camareras | Ama de llaves · F6 | **CUMPLE** |
| CU-V-21 | Inspeccionar/certificar habitación (firma opcional) | Ama de llaves · F6 | **CUMPLE** |
| CU-V-22 | Rechazar limpieza y devolverla | Ama de llaves · F6 | **CUMPLE** |
| CU-V-23 | Reportar incidencia desde housekeeping | Ama de llaves · F6 | **CUMPLE** |
| CU-V-24 | Registrar cargo por daños (auditoría off-chain) | Ama de llaves · F7 | **CUMPLE** |
| CU-V-25 | Consumibles y suministros con umbral/SLA | Ama de llaves · F8 | **CUMPLE** |
| CU-V-26 | Informes de productividad e inspecciones | Ama de llaves · F9 | **CUMPLE** |
| CU-V-27 | Terminal de housekeeping con PIN | Terminal · F5 | **CUMPLE** |
| CU-V-28 | Ver habitaciones asignadas del turno | Camarera · F5/F6 | **CUMPLE** |
| CU-V-29 | Registrar limpieza y completar tarea | Camarera · F5/F6 | **CUMPLE** |
| CU-V-30 | Registrar consumo de suministros | Camarera · F8 | **CUMPLE** |
| CU-V-31 | Reportar incidencia de mantenimiento | Camarera · F5/F6 | **CUMPLE** |
| CU-V-32 | Activar/desactivar venta manualmente | Recepción · F10 | **CUMPLE** |
| CU-V-33 | Resolver reclamación de cargo por daños | Recepción · F7/F10 | **CUMPLE** |
| CU-V-34 | Confirmar cargo en el check-out | Recepción · F7/F10 | **CUMPLE** |
| CU-V-35 | Gestionar wallets/roles on-chain de jefes | Administración · F9 | **CUMPLE** |
| CU-V-36 | Alta/rotación/baja de operarios de terminal | Administración · F9 | **CUMPLE** |
| CU-V-37 | Gobernar flags de firma on-chain | Administración · F9 | **CUMPLE** |
| CU-V-38 | Firmar en emergencia como `OWNER_BACKUP` | Administración · F9 | **CUMPLE** |
| CU-V-39 | Gestionar tareas vencidas escaladas | Mantenimiento · F8 | **CUMPLE** |
| CU-V-40 | Exportar expediente de evidencias y auditoría | Soporte · F9 | **CUMPLE** (A10) |
| CU-V-41 | Recibir aviso de cargo y reclamar | Huésped · F7/F10 | **CUMPLE** → CU-W-12 |
| CU-V-42 | Derechos de acceso y supresión (GDPR) | Huésped · F7/F10 | **CUMPLE** → CU-W-12/18 |
| CU-V-43 | Supervisar cola de anclajes | Soporte · F9 | **CUMPLE** → CU-W-24 |
| CU-V-44 | Recuperar PIN de operario de terminal | Administración · F9 | **CUMPLE** |
| CU-V-45 | Restaurar y verificar copias de seguridad | Soporte · F9 | **CUMPLE (drill lógico)**; drill aislado: A9 pendiente de IAM |

**Cobertura consolidada:** 24 CU-W + 17 CU del MVP + 21 CU del SRS + 45 CU-V + 2 CU-PR =
**109 objetivos de actor**, con 0 huérfanos respecto de los RF/RNF catalogados (ver §6).

---

## 6. Matriz de trazabilidad requisito → caso(s) de uso

> **Numeración:** las filas `RF-01…RF-23` y `RF-M/K/S` siguen la numeración de `docs/REQUISITOS.md` y
> `docs/SRS.md` (la que usan los CU del catálogo). El `docs/PRD.md` v2.0.0 renumera su propio `RF-01…RF-23`
> (deuda de unificación declarada); los `RF-61…RF-65` aprobados el 2026-10-20 están definidos en el PRD y
> se trazan aquí.

| Requisito | Casos que lo cubren |
|---|---|
| RF-01, RF-02, RF-14 | CU-W-01, CU-W-02, CU-04 |
| RF-18, RF-18a, RF-18b | CU-W-02, CU-W-20, CU-W-21 |
| RF-03, RF-19 | CU-W-05, CU-W-06 |
| RF-04, RF-11 | CU-W-04, CU-50 |
| RF-05, RF-18a/b | CU-W-20 |
| RF-06 | CU-W-19, CU-W-23 |
| RF-07, RF-08 | CU-W-06, CU-W-07, CU-W-23 |
| RF-09, RF-16, RF-37 | CU-W-18 |
| RF-10 | CU-W-24 |
| RF-12 | CU-W-16 |
| RF-13 | CU-W-14 |
| RF-15 | CU-W-08, CU-W-13 |
| RF-17 | CU-W-02, CU-W-23 |
| RF-20, RF-33, RF-34, RF-35 | CU-W-03, CU-W-09, CU-W-10 |
| RF-21 (faucet, solo dev/test) | CU-PR-01 |
| RF-22 (metadatos IPFS/Arweave), RF-23 (MiCA) | Sin CU: fase posterior / PAR |
| RF-30…RF-37 | CU-W-03, CU-W-07, CU-W-11, CU-W-18 |
| RF-38, RF-39, RF-40 | CU-W-19, CU-W-23 (menú de cuenta, Sistemas) |
| RF-41…RF-46 | CU-W-23, CU-W-24 |
| RF-47…RF-55 | CU-W-11 |
| RF-30–RF-46 | CU-W-11, CU-W-19, CU-W-23, CU-W-24 |
| RF-56, RF-57, RF-58, RF-59, RF-60 | CU-W-01, CU-W-16, CU-W-17 |
| RF-61 (reseñas) | CU-W-15, CU-W-22 |
| RF-62 (contenido público) | CU-W-21 |
| RF-63 (actividades) | CU-W-21 |
| RF-64 (portal de cargos) | CU-W-12 |
| RF-65 (asistente con manuales) | CU-W-16, CU-W-17 |
| RF-M-01, RF-M-02, RF-M-03, RF-M-04, RF-M-05, RF-M-06, RF-M-07, RF-M-08, RF-M-09, RF-M-10, RF-M-11, RF-M-12 | CU-V-02…CU-V-10, CU-V-13…CU-V-15, CU-V-19, CU-V-23, CU-V-25, CU-V-31 |
| RF-K-01, RF-K-02, RF-K-03, RF-K-04, RF-K-05, RF-K-06, RF-K-07, RF-K-08, RF-K-09, RF-K-10 | CU-V-16…CU-V-26, CU-V-28…CU-V-30, CU-V-33, CU-V-34, CU-W-12 |
| RF-S-01, RF-S-02, RF-S-03, RF-S-04, RF-S-05, RF-S-06, RF-S-07, RF-S-08 | CU-V-01…CU-V-45 (firma selectiva), CU-W-20, CU-W-23 |
| RNF-01, RNF-02, RNF-11, RNF-12, RNF-20 | CU-W-01, CU-W-02, CU-W-09, CU-W-13, CU-W-24 |
| RNF-05, RNF-13, RNF-14, RNF-18, RNF-19 | CU-W-04, CU-W-05, CU-W-06, CU-W-19, CU-50 |
| RNF-06, RNF-17, RNF-21, RNF-22 | CU-W-19, CU-W-23, CU-W-24 |
| RNF-M-01, RNF-M-02, RNF-M-03, RNF-M-04, RNF-M-05, RNF-M-06, RNF-M-07, RNF-M-08, RNF-M-09, RNF-M-10, RNF-M-11, RNF-M-12, RNF-M-13, RNF-M-14, RNF-M-15, RNF-M-16, RNF-M-17, RNF-M-18, RNF-M-19, RNF-M-20, RNF-M-21 | CU-V-01…CU-V-45; RNF-M-05 en CU-W-11/24; RNF-M-10 en CU-W-12; RNF-M-11/15/19 en CU-W-23; RNF-M-17/18 en CU-V-12/27 |

### 6.1 Cobertura y deuda declarada

- **Suites de personal (RF-M/K/S y RNF-M)**: se cubren vía **CU-V-01…CU-V-45** (documento fuente), cuya
  matriz de trazabilidad está auditada; este documento solo consolida su estado. No hay requisito de
  esas familias sin CU.
- **RF-21 (faucet)**: utilidad **solo de desarrollo/CI**; no es una capacidad de producción (CU-PR-01).
- **RF-22 (metadatos en Arweave) y RF-23 (MiCA/fiscalidad)**: marcados **PAR/fase posterior** en el PRD;
  no generan caso de uso en esta entrega.
- **RF-30…RF-55**: el catálogo SRS §9 los asocia a CU-30…CU-46; **RF-30…RF-55 no están aún declarados en
  el PRD v2.0.0** (deuda declarada en `docs/SRS.md` §10 y en §8 de este documento). Mientras tanto, la
  trazabilidad se apoya en los manuales y en las pruebas de CU-W-11/19/23/24.
- **RF-18** se desdobla en `RF-18a` (catálogo maestro, foto del tipo) y `RF-18b` (minteo bajo demanda).
- **Cobertura final**: 24 CU-W detallados + 17 CU MVP + 21 CU SRS + 45 CU-V + 2 CU-PR; todos los RF/RNF
  del PRD tienen al menos un CU o una justificación de fase posterior.

---

## 7. Criterios de aceptación de la entrega web (globales)

1. **Puertas de sesión**: ninguna ruta de `/admin/**`, `/recepcion/**`, `/mantenimiento/**`,
   `/ama-de-llaves/**` o `/terminal/**` sirve datos sin sesión verificada en servidor (401/redirección
   al acceso); E2E de puertas en `chromium` y `mobile`.
2. **Firma selectiva**: toda acción marcada con ⛓ + «Requiere firma» exige wallet, muestra el preview y
   solo aplica con firma verificada; el servidor recupera el firmante y rechaza firmas inválidas o
   repetidas (nonce único).
3. **Degradación honesta**: sin RPC/worker/LLM, las vistas declaran el estado y no ofrecen acciones que
   revertirían ni inventan datos.
4. **Accesibilidad**: 0 violaciones *critical/serious* de axe-core en las 34 rutas del escaneo; `lang`,
   salto al contenido, un `H1` por ruta, áreas táctiles ≥ 44 px y contraste ≥ 4.5:1.
5. **i18n**: ES/EN/RU con paridad de claves; ningún texto hardcodeado en componentes.
6. **Rendimiento**: p95 del tablero < 500 ms y listados < 800 ms (20 usuarios, 50 habitaciones, ventana
   90 días), medido con el gate A8.
7. **Trazabilidad**: toda acción de operador queda en `operator_audit_log`; toda firma on-chain en
   `on_chain_signatures` con estado verificable.
8. **Seguridad**: sin PII on-chain, secretos fail-fast, cookies HttpOnly, JWT con blocklist; guardián de
   secretos y de fronteras cliente/servidor en verde.
9. **Gates de calidad**: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `forge test`, E2E y guardianes en
   verde (informe `RepoTecnico/informe_pruebas_fase4.md`).
10. **Operación**: `/health/live` y `/health/ready` responden; MCP estrictamente read-only.

---

## 8. Decisiones ratificadas (2026-10-20)

| # | Decisión | Resolución |
|---|---|---|
| W-1 | Modelado de la gobernanza de plataforma | **Ratificado**: CU-W-23 se mantiene como caso **paraguas** y se enumeran sus subcasos 23.1–23.6 (tabla en CU-W-23). |
| W-2 | RF propios para capacidades de la propuesta v3 | **Ratificado**: se incorporan al PRD **RF-61** (reseñas), **RF-62** (contenido público), **RF-63** (actividades), **RF-64** (portal de cargos) y **RF-65** (asistente con manuales), trazados en §4/§6. |
| W-3 | Consolidación de los 45 CU-V | **Ratificado**: consolidación **por referencia** al documento fuente auditado; este documento fija estado y evidencia. |

**Siguiente paso de Fase 2:** diagramas UML de casos de uso y secuencias de los flujos clave
(CU-W-05, CU-W-10, CU-W-20, CU-W-23) y auditoría `@audita` de ambos documentos.

> **Nota de alcance:** este documento describe la **web implementada**; la app Android del huésped se
> especifica en `RepoTecnico/casos_uso_apk.md` (decisiones de producto también ratificadas).
