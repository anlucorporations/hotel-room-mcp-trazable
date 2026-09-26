# Casos de uso · Incremento v3 (menú de wallet + Sistemas)

> Un caso de uso por objetivo de actor. Criterios funcionales en **Gherkin**; restricciones del
> sistema en **EARS**. Cada criterio es testeable y cada caso enlaza sus RF.

## Actores

| Actor | Descripción |
|---|---|
| **Owner** | Operador con `DEFAULT_ADMIN_ROLE` (`admin@hotel.es`). Gobierna el sistema. |
| **Recepción** | Operador con `RECEPTION_ROLE`. |
| **Visitante** | Usuario del sitio público con o sin wallet conectada. |
| **Sistema** | Backend Next.js + PostgreSQL + contrato `HotelNights`. |

---

## CU-40 · Menú desplegable de la billetera/usuario

- **Actor**: Owner, Recepción, Visitante · **Precondición**: página cargada.
- **RF**: RF-40, RF-40.1, RF-40.2, RF-40.3.

**Flujo principal**
1. El usuario pulsa el botón del menú en la cabecera.
2. El sistema despliega el panel con el título (usuario + rol en el back-office; wallet en público) y las entradas disponibles.
3. El usuario elige una entrada o cierra el menú.

**Flujos alternativos**
- A1. Sin sesión de back-office: solo se muestran las opciones de wallet y el acceso al back-office.
- A2. Con sesión de recepción: Usuarios y Roles no aparecen (no es owner).
- A3. Wallet no conectada: el título invita a conectar y el panel ofrece «Conectar».

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Título con usuario y rol en el back-office
  Dado un owner autenticado como "admin@hotel.es" con rol DEFAULT_ADMIN_ROLE
  Cuando abre el menú de la cabecera
  Entonces el título muestra "admin@hotel.es" y su rol
  Y el menú ofrece Seguridad, Usuarios, Roles y Salir

Escenario: Recepción no ve las secciones de owner
  Dado un operador autenticado con RECEPTION_ROLE
  Cuando abre el menú
  Entonces no aparecen las entradas Usuarios ni Roles
  Y sí aparecen Seguridad y Salir

Escenario: Visitante del sitio público
  Dado un visitante sin sesión de back-office
  Cuando abre el menú con la wallet conectada
  Entonces el título muestra la dirección abreviada de la wallet
  Y el menú ofrece cambiar de red, desconectar y el acceso al back-office

Escenario: Navegación por teclado
  Dado el menú cerrado
  Cuando el usuario pulsa Enter sobre el botón y luego Escape
  Entonces el panel se abre con el foco en la primera entrada
  Y al pulsar Escape se cierra y el foco vuelve al botón
```

### Restricciones (EARS)

- El sistema deberá exponer el botón del menú con `aria-expanded` y `aria-controls` coherentes con el estado del panel.
- *Si* el usuario no tiene sesión de back-office, entonces el sistema deberá mostrar solo las acciones de wallet y el acceso al back-office.

---

## CU-41 · Acceder a la sección Sistemas (solo owner)

- **Actor**: Owner · **Precondición**: sesión con `DEFAULT_ADMIN_ROLE`.
- **RF**: RF-41, RF-41.1.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: El owner ve Sistemas
  Dado un owner autenticado
  Cuando abre el back-office
  Entonces el sidebar muestra la sección Sistemas con Contratos, Usuarios, Finanzas y Operaciones

Escenario: Recepción no ve Sistemas
  Dado un operador con RECEPTION_ROLE
  Cuando abre el back-office
  Entonces la sección Sistemas no aparece en el sidebar

Escenario: La API de Sistemas cierra en el servidor
  Dado un cliente sin sesión
  Cuando solicita /api/admin/system/users
  Entonces recibe 401
  Y con sesión de RECEPTION_ROLE recibe 403
```

### Restricciones (EARS)

- *Mientras* la sesión no ostente `DEFAULT_ADMIN_ROLE`, el sistema deberá denegar el acceso a toda ruta y API de Sistemas.
- El sistema deberá mantener el gating de UI como complemento, nunca como sustituto, de la autorización en servidor.

---

## CU-42 · Gestionar usuarios de la plataforma

- **Actor**: Owner · **Precondición**: sesión `DEFAULT_ADMIN_ROLE`.
- **RF**: RF-42, RF-42.1.

**Flujo principal**
1. El owner abre Sistemas → Usuarios.
2. El sistema lista los operadores con rol, estado y bloqueo.
3. El owner crea o rota credenciales de un operador, o lo activa/desactiva.

**Flujos alternativos**
- A1. Alta con rol no permitido: 400.
- A2. Usuario inexistente al desactivar: 404.
- A3. Rotación de credenciales: se muestran contraseña, `otpauth://` y códigos de rescate **una sola vez**.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Listado sin secretos
  Dado un owner autenticado y dos operadores en admin_users
  Cuando consulta /api/admin/system/users
  Entonces recibe 200 con los dos operadores
  Y ninguna respuesta incluye password_hash ni totp_secret_enc

Escenario: Alta de operador
  Dado un owner autenticado
  Cuando crea el operador "recepcion2@hotel.es" con rol RECEPTION_ROLE
  Entonces el sistema responde 201 con contraseña, otpauth y códigos de rescate
  Y el operador queda activo y puede autenticarse

Escenario: Desactivar un operador
  Dado un operador activo "recepcion2@hotel.es"
  Cuando el owner lo desactiva
  Entonces el sistema responde 200 con active=false
  Y ese operador deja de poder autenticarse
```

### Restricciones (EARS)

- El sistema deberá devolver las credenciales en claro **solo** en la respuesta de creación/rotación.
- *Si* el rol solicitado no es `DEFAULT_ADMIN_ROLE` ni `RECEPTION_ROLE`, entonces el sistema deberá responder 400.
- El sistema no deberá permitir que un operador se desactive a sí mismo (evita dejar el sistema sin owner).

---

## CU-43 · Consultar y gobernar el contrato

- **Actor**: Owner · **Precondición**: wallet conectada con los roles on-chain.
- **RF**: RF-43.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Estado del contrato
  Dado un owner autenticado con wallet conectada
  Cuando abre Sistemas → Contratos
  Entonces ve la dirección, el chainId, el bloque de despliegue, la pausa, la tesorería y el suelo de listado

Escenario: Pausar el contrato desde Sistemas
  Dado el contrato sin pausar y una wallet con PAUSER_ROLE
  Cuando el owner confirma "Pausar"
  Entonces se firma pause() y el estado mostrado pasa a "en pausa"
```

### Restricciones (EARS)

- El sistema deberá mantener el contrato como autoridad última: la UI no simula permisos que la cadena vaya a rechazar.

---

## CU-44 · Consultar finanzas y retirar

- **Actor**: Owner · **Precondición**: wallet con `TREASURER_ROLE`.
- **RF**: RF-44.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Resumen financiero
  Dado un owner autenticado
  Cuando abre Sistemas → Finanzas
  Entonces ve el balance bruto, el pendiente de reventas y el residual retirable
  Y ve los agregados de volumen primario, secundario, royalties y ventas

Escenario: Retirada a tesorería
  Dado un residual retirable mayor que cero
  Cuando el owner confirma la retirada
  Entonces se firma withdraw() y el balance se actualiza
```

---

## CU-45 · Consultar operaciones

- **Actor**: Owner · **RF**: RF-45.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Salud del worker
  Dado el worker en marcha
  Cuando el owner abre Sistemas → Operaciones
  Entonces ve status ok, lastBlock, headBlock, lag, aggregateLag y fallos consecutivos

Escenario: Worker caído
  Dado el worker no disponible
  Cuando el owner abre Sistemas → Operaciones
  Entonces la página muestra un estado degradado explícito
  Y no rompe el resto del panel
```

---

## CU-46 · Seguridad del propio operador

- **Actor**: Owner, Recepción · **Precondición**: sesión de back-office.
- **RF**: RF-46.

### Criterios de aceptación (Gherkin)

```gherkin
Escenario: Rotar el MFA propio
  Dado un operador autenticado
  Cuando confirma "Rotar MFA"
  Entonces recibe un otpauth:// y 8 códigos de rescate nuevos, mostrados una sola vez
  Y su semilla anterior deja de ser válida

Escenario: Cambiar la contraseña propia
  Dado un operador autenticado con contraseña actual correcta
  Cuando cambia su contraseña
  Entonces la nueva contraseña es válida para el siguiente login
  Y la anterior deja de serlo

Escenario: Contraseña actual incorrecta
  Dado un operador autenticado
  Cuando intenta cambiar la contraseña con la actual equivocada
  Entonces el sistema responde 401
  Y la contraseña no cambia
```

### Restricciones (EARS)

- El sistema deberá exigir la contraseña actual para cambiarla.
- El sistema deberá aceptar la rotación de MFA de cualquier rol de back-office sobre su **propia** cuenta.

---

## Cobertura

| Caso | RF | Testeable |
|---|---|---|
| CU-40 | RF-40…RF-40.3 | ✅ |
| CU-41 | RF-41, RF-41.1 | ✅ |
| CU-42 | RF-42, RF-42.1 | ✅ |
| CU-43 | RF-43 | ✅ |
| CU-44 | RF-44 | ✅ |
| CU-45 | RF-45 | ✅ |
| CU-46 | RF-46 | ✅ |
