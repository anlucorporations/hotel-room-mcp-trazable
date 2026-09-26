# Casos de uso · Incremento v2 (owner · recepción · reventa)

> Metodología: un caso de uso por objetivo de actor. Criterios funcionales en **Gherkin**
> (`Dado/Cuando/Entonces`); restricciones del sistema en **EARS**. Cada criterio es **testeable** y
> cada caso enlaza los RF que cubre (trazabilidad con `requerimientos_incremento.md`).

## Actores

| Actor | Descripción |
|---|---|
| **Owner** | Operador con `DEFAULT_ADMIN_ROLE` (`admin@hotel.es`). Gobierna el hotel. |
| **Recepción** | Operador con `RECEPTION_ROLE`. Atiende el mostrador. |
| **Huésped** | Titular de una noche (NFT). No se autentica: firma con su wallet. |
| **Sistema** | Backend Next.js + PostgreSQL + contrato canónico. |

---

## CU-30 · Acceso total del owner al back-office

- **Actor**: Owner · **Precondición**: sesión iniciada con `DEFAULT_ADMIN_ROLE`.
- **RF**: RF-30, RF-30.1, RF-30.2.

**Flujo principal**
1. El owner inicia sesión (usuario + contraseña + TOTP).
2. El sistema resuelve la sesión y sus roles.
3. El owner entra a cualquier panel del back-office (mint, dashboard, royalty, pausa, fondos, caducadas, roles).

**Flujos alternativos**
- A1. Sesión con `RECEPTION_ROLE`: los paneles de administración aparecen bloqueados y las rutas de administración responden 403.
- A2. Sin sesión: toda ruta de back-office responde 401.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: El owner ve habilitados todos los paneles
  Dado un operador autenticado con DEFAULT_ADMIN_ROLE
  Cuando abre el sidebar del back-office
  Entonces los 7 enlaces de ADMIN_NAV están habilitados
  Y puede abrir /admin/mint, /admin/pausa, /admin/fondos y /admin/caducadas sin ver "role-denied"

Escenario: Recepción no obtiene permisos de administración
  Dado un operador autenticado con RECEPTION_ROLE
  Cuando abre el sidebar del back-office
  Entonces los enlaces de mint, pausa, fondos, caducadas y roles aparecen deshabilitados
  Y /admin/mint muestra el aviso de rol insuficiente

Escenario: El owner no puede saltarse el contrato
  Dado un owner con DEFAULT_ADMIN_ROLE en la web pero sin MINTER_ROLE on-chain
  Cuando intenta publicar una noche
  Entonces la transacción revierte en el contrato
  Y la web muestra el error de la cadena
```

### Restricciones (EARS)

- *Mientras* la sesión tenga `DEFAULT_ADMIN_ROLE`, el sistema deberá habilitar todos los paneles de `ADMIN_NAV`.
- *Si* la sesión no tiene `DEFAULT_ADMIN_ROLE` ni el rol exigido por el panel, entonces el sistema deberá bloquearlo con el aviso de rol insuficiente.
- El sistema deberá mantener la autoridad de roles on-chain como fuente última de verdad.

---

## CU-31 · Panel del día de recepción

- **Actor**: Recepción · **Precondición**: sesión con `RECEPTION_ROLE` o owner.
- **RF**: RF-31, RF-32, RF-38.

**Flujo principal**
1. Recepción abre `/recepcion`.
2. El sistema pide la fecha (por defecto, hoy) y devuelve las reservas del día y el estado de las 50 habitaciones.
3. Recepción cambia la fecha y el panel se recalcula.

**Flujos alternativos**
- A1. Sin sesión: se muestra la pantalla de acceso; no se sirve ningún dato.
- A2. El maestro de habitaciones no responde / no hay datos: se muestran las 50 habitaciones como «libres» y un aviso, sin romper la página.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Reservas del día
  Dado que existen 3 noches con check_in_date = hoy y status SOLD
  Cuando recepción abre el panel del día
  Entonces la tabla de reservas muestra 3 filas con su habitación, tipo, estado y titular
  Y el contador de reservas del día indica 3

Escenario: Estado de las 50 habitaciones
  Dado el maestro de 50 habitaciones
  Cuando recepción abre el panel del día
  Entonces se listan exactamente 50 habitaciones
  Y cada una muestra uno de los estados LIBRE, PENDIENTE, RESERVADA, OCUPADA, SALIDA o BLOQUEADA

Escenario: Sin sesión no hay datos
  Dado un cliente sin cookies de sesión
  Cuando solicita /api/reception/overview
  Entonces recibe 401
  Y no se devuelve ninguna reserva
```

### Restricciones (EARS)

- *Mientras* no exista una sesión válida de recepción u owner, el sistema deberá impedir la lectura del panel.
- El sistema deberá derivar el estado de cada habitación del índice PostgreSQL (`nfts`) para la fecha consultada.

---

## CU-32 · Búsqueda de reserva por código de recuperación

- **Actor**: Recepción · **Precondición**: sesión válida; el huésped aporta un código `MDS-…`.
- **RF**: RF-33, RF-33.1.

**Flujo principal**
1. Recepción introduce el código de recuperación.
2. El sistema localiza la reserva asociada y muestra habitación, fecha, tipo, estado y titular.
3. Recepción confirma que la reserva es la del huésped antes de continuar al check-in.

**Flujos alternativos**
- A1. El código no existe: mensaje «No se encontró reserva para ese código» (404).
- A2. La reserva ya está consumida: se muestra el estado `CHECKED_IN` y se impide repetir el check-in.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Código válido localiza la reserva
  Dado una noche con status SOLD y recovery_code "MDS-AB12CD34"
  Cuando recepción busca ese código
  Entonces el sistema responde 200 con la habitación, la fecha, el tipo y el estado SOLD

Escenario: Código inexistente
  Dado un código "MDS-ZZZZZZZZ" que no corresponde a ninguna reserva
  Cuando recepción lo busca
  Entonces el sistema responde 404 con "RESERVA_NO_ENCONTRADA"

Escenario: El código se normaliza
  Dado una reserva con recovery_code "MDS-AB12CD34"
  Cuando recepción escribe "mds-ab12cd34" o con espacios alrededor
  Entonces el sistema localiza la misma reserva
```

### Restricciones (EARS)

- El sistema deberá almacenar `recovery_code` de forma única y estable por token.
- *Si* el código aportado no tiene el formato `MDS-[A-Z0-9]{6,12}`, entonces el sistema deberá responder 400 sin consultar la base.

---

## CU-33 · Check-in por QR/JWS

- **Actor**: Recepción · **Precondición**: reserva SOLD y resguardo vigente del titular.
- **RF**: RF-33, RF-38. (Reutiliza el flujo ya existente; este incremento lo integra en el panel.)
- **Nota**: los criterios de aceptación del check-in on-chain ya están cubiertos por CU-05/CU-14 del SRS y sus suites. Aquí solo se añade la **integración en el panel del día** y el refresco posterior.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Check-in confirmado refresca el panel
  Dado una reserva SOLD visible en el panel del día
  Cuando recepción confirma su check-in por QR
  Entonces la pantalla muestra el banner verde con habitación y fecha
  Y al volver al panel del día esa habitación figura como OCUPADA

Escenario: Contrato en pausa
  Dado el contrato canónico en pausa
  Cuando recepción abre el panel de check-in
  Entonces se muestra el aviso de pausa
  Y el botón de confirmar está deshabilitado
```

---

## CU-34 · Check-out con verificación y cancelación de cargos

- **Actor**: Recepción · **Precondición**: noche en estado `CHECKED_IN`.
- **RF**: RF-34, RF-34.1.

**Flujo principal**
1. Recepción abre la sección de check-out y localiza la estancia (habitación o token).
2. El sistema muestra los cargos pendientes de la estancia.
3. Recepción verifica el estado de la habitación, marca incidencias y selecciona los cargos a cancelar.
4. Recepción confirma; el sistema registra el check-out, cancela los cargos marcados y marca la noche como `CHECKED_OUT`.

**Flujos alternativos**
- A1. La noche no está `CHECKED_IN`: 409 `ESTANCIA_NO_CHECKED_IN`.
- A2. Reintento del mismo check-out: 200 con el registro existente (idempotente), sin duplicar.
- A3. Se intenta cancelar un cargo ya cancelado: se ignora y se informa, sin error fatal.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Check-out correcto
  Dado una noche en CHECKED_IN con 2 cargos PENDING
  Cuando recepción confirma el check-out marcando ambos cargos para cancelar
  Entonces el sistema responde 200 con el identificador del check-out
  Y la noche queda en estado CHECKED_OUT
  Y los 2 cargos quedan en estado CANCELLED con cancelled_by = usuario de recepción

Escenario: Check-out idempotente
  Dado un check-out ya registrado para la noche T
  Cuando recepción vuelve a confirmar el check-out de T
  Entonces el sistema responde 200 con el mismo identificador
  Y existe exactamente 1 fila en stay_checkouts para T

Escenario: No se puede hacer check-out de una noche sin entrada
  Dado una noche con status SOLD (sin check-in)
  Cuando recepción intenta el check-out
  Entonces el sistema responde 409 con "ESTANCIA_NO_CHECKED_IN"
  Y no se crea ninguna fila en stay_checkouts
```

### Restricciones (EARS)

- El sistema deberá garantizar a lo sumo un check-out por `token_id`.
- *Si* el usuario no tiene sesión de recepción u owner, entonces el sistema deberá responder 401/403 sin revelar datos de la estancia.
- El sistema deberá registrar `processed_by`, `created_at` y el estado de la habitación en cada check-out.

---

## CU-35 · Alta de cargos adicionales

- **Actor**: Recepción · **Precondición**: noche localizada (SOLD o CHECKED_IN).
- **RF**: RF-35.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Alta de un cargo
  Dado una noche vendida
  Cuando recepción añade un cargo con concepto "Minibar" e importe 12.50 EUR
  Entonces el sistema responde 201 con el cargo en estado PENDING
  Y el cargo aparece en la sección de check-out de esa estancia

Escenario: Concepto obligatorio
  Dado el formulario de alta de cargo
  Cuando recepción envía el concepto vacío
  Entonces el sistema responde 400 con "CARGO_INVALIDO"
```

### Restricciones (EARS)

- *Si* el importe no es un entero positivo en céntimos, entonces el sistema deberá rechazar el cargo con 400.
- El sistema deberá asociar cada cargo a un `token_id` existente.

---

## CU-36 · Huésped: publicar, editar y retirar una reventa

- **Actor**: Huésped (wallet conectada) · **Precondición**: posee la noche y no está consumida.
- **RF**: RF-36, RF-36.1.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Publicar una noche en reventa
  Dado un huésped que posee una noche no consumida
  Cuando publica un precio válido desde «Mis reventas»
  Entonces la transacción list() se firma y confirma
  Y la noche aparece en «Publicadas» con ese precio

Escenario: Editar el precio de una reventa
  Dado un huésped con una noche ya publicada
  Cuando cambia el precio y guarda
  Entonces se firma una nueva transacción list() con el precio nuevo
  Y «Publicadas» muestra el precio nuevo

Escenario: Retirar una reventa
  Dado un huésped con una noche publicada
  Cuando pulsa retirar
  Entonces se firma unlist()
  Y la noche desaparece de «Publicadas»

Escenario: Precio por debajo del suelo
  Dado un precio inferior al mínimo del contrato
  Cuando el huésped intenta publicar
  Entonces la transacción revierte con el error del contrato
  Y la interfaz muestra el mensaje de error traducido
```

### Restricciones (EARS)

- El sistema deberá reutilizar `useListNight` (punto único de verdad de `list`/`unlist`) para todas las acciones.
- El sistema deberá mostrar las reventas a partir del estado on-chain (`listingOf`), no de una copia local.

---

## CU-37 · Huésped: avisos de reventa (in-app + push)

- **Actor**: Huésped · **Precondición**: tiene noches publicadas o vendidas.
- **RF**: RF-37, RF-37.1, RNF-30.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Aviso in-app de venta
  Dado un huésped con una noche publicada que se vende
  Cuando abre «Mis reventas»
  Entonces ve la noche en «Vendidas» con el importe y el comprador
  Y la cabecera muestra un aviso de que hay novedades desde su última visita

Escenario: Push anónimo
  Dado un suscriptor de Web Push con el aviso de reventas activado
  Cuando se registra una venta de su noche
  Entonces el sistema entrega una notificación push
  Y la notificación no contiene nombre, DNI ni email
```

### Restricciones (EARS)

- El sistema deberá emitir los avisos sin recoger ni almacenar datos personales del huésped (RNF-30).
- *Si* el navegador no soporta Web Push o el usuario no ha dado su consentimiento, entonces el sistema deberá limitarse al aviso in-app.

---

## Cobertura

| Caso de uso | RF cubiertos | Testeable |
|---|---|---|
| CU-30 | RF-30, RF-30.1, RF-30.2 | ✅ |
| CU-31 | RF-31, RF-32, RF-38 | ✅ |
| CU-32 | RF-33, RF-33.1 | ✅ |
| CU-33 | RF-33, RF-38 | ✅ |
| CU-34 | RF-34, RF-34.1 | ✅ |
| CU-35 | RF-35 | ✅ |
| CU-36 | RF-36, RF-36.1 | ✅ |
| CU-37 | RF-37, RF-37.1, RNF-30 | ✅ |

**Ningún criterio queda sin posibilidad de test**: los de UI se cubren con pruebas de componente/estado
o E2E Playwright; los de API con vitest y PostgreSQL de pruebas; los on-chain con Foundry/Anvil.
