# CU-01 · Entrar al panel del hotel con la cartera y el rol correcto

> En una frase: entras al panel del hotel con tu usuario y tu código, y solo ves lo que tu rol te deja ver.

![Infografía del CU-01: entrar al panel con usuario, contraseña y código de seis dígitos](imagenes/doc-cu-01-acceso-back-office.svg)

## 1. Para qué sirve

El panel del hotel (el *back-office*) es la trastienda donde trabaja el personal. Desde ahí se publican noches, se consultan métricas y se administra el negocio.

Este caso de uso explica cómo se entra. La puerta tiene tres cerrojos: usuario, contraseña y un código de seis dígitos.

Después, tu rol decide qué ves. Un recepcionista no necesita las mismas pantallas que el dueño.

Hay que aclarar una cosa, porque el nombre del caso de uso despista. Hoy se entra con usuario y contraseña, no con la cartera.

La cartera (*wallet*, la cartera digital con la que firmas) interviene más tarde, cuando pulsas una acción y hay que firmar una transacción.

## 2. Quién puede hacerlo

Cualquier operador que tenga una cuenta activa. Su cuenta debe llevar al menos uno de estos cuatro roles:

- **Super-admin** (`DEFAULT_ADMIN_ROLE`): el dueño. Ve todo.
- **Recepción** (`RECEPTION_ROLE`): da entrada y atiende a los huéspedes.
- **Limpieza** (`HOUSEKEEPING`): tareas de habitaciones, sin cartera.
- **Mantenimiento** (`MAINTENANCE`): tareas técnicas, sin cartera.

Sin ninguno de esos roles no se entra, aunque la contraseña sea correcta.

Ojo: entrar al panel y firmar en la red son dos permisos distintos. Tu cartera necesita además su propio rol para firmar una acción.

## 3. Antes de empezar

- Ten tu usuario y tu contraseña. La contraseña se pide con un mínimo de 12 caracteres al crear la cuenta.
- Ten a mano la aplicación de autenticación del móvil con el código de seis dígitos.
- Guarda tus códigos de rescate en un sitio seguro. Sirven si pierdes el móvil.
- Comprueba que tu cuenta está activa. Si está bloqueada, no habrá forma de entrar.
- Si vas a firmar acciones, conecta la cartera y usa la red correcta. Avisa si has cambiado de cuenta.

## 4. Paso a paso

1. Abre la dirección del panel (`/admin`). El sistema te lleva solo a la pantalla del día a día.
2. Si no hay sesión, verás la pantalla de acceso con el título **Back-office · acceso con contraseña y TOTP**.
3. Escribe tu **Usuario** y tu **Contraseña** en el formulario.
4. Pulsa **Continuar**. El sistema comprueba la contraseña y te pide el segundo paso.
5. Abre tu aplicación de autenticación y copia el código de seis dígitos.
6. Escribe el código en **Código TOTP** y pulsa **Entrar**. Si has perdido el móvil, usa **Usar un código de rescate**.
7. Si todo cuadra, el sistema te deja dentro y abre el panel con tus secciones.
8. Mira la barra lateral. Los apartados que no te tocan salen con un aviso de que te falta el rol.
9. Cuando vayas a firmar una acción, la cartera te pedirá la firma. Ahí manda el rol de la cartera, no el de la sesión.
10. Al terminar, pulsa **Cerrar sesión**. La sesión se anula y las cookies se borran.

## 5. Qué ves cuando sale bien

- Entras directo al **Dashboard** con la sesión abierta.
- El menú te saluda con tu usuario y muestra **Roles** con los que tienes.
- La pantalla de sesión te dice cuántos códigos de rescate te quedan sin usar.
- Los paneles que sí te tocan se abren y funcionan.
- Los que no te tocan muestran el aviso de rol insuficiente, sin darte error raro.
- Si recargas la página, sigues dentro. La sesión dura un rato largo.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| No veo ningún dato, solo la pantalla de acceso | No hay sesión válida | Escribe usuario y contraseña otra vez |
| «No se pudo iniciar sesión» | La contraseña o el usuario no cuadran | Revisa mayúsculas y vuelve a probar |
| Te pide esperar y no te deja | Cinco intentos fallidos en quince minutos | Espera un rato y vuelve a intentarlo |
| Tu cuenta está bloqueada | Se bloqueó por seguridad | Pide al super-admin que la desbloquee |
| «Código MFA incorrecto o expirado» | El código de seis dígitos ya no vale | Espera al siguiente código o usa un rescate |
| Falta el rol necesario para este panel | Tu sesión no incluye ese rol | Entra con un operador que sí lo tenga |
| La cartera no puede firmar | La cartera no tiene el rol en la red | Usa la cartera autorizada para esa acción |
| Aviso de que has cambiado de cuenta | La cartera activa no es la de tu sesión | Vuelve a iniciar sesión con la cuenta correcta |
| Error del servidor al entrar | Falta configuración interna | Avisa al responsable técnico |

## 7. Un ejemplo de verdad

Nuria entra a trabajar en el Hotel Marina del Sol como recepcionista. El super-admin le crea su cuenta y le da el rol de recepción.

El primer día abre el panel, escribe su usuario y su contraseña, y pulsa **Continuar**. El sistema le pide el código de seis dígitos y lo copia de su móvil.

Ya está dentro. Ve el **Dashboard** y las pantallas de recepción. En cambio, la sección de **Roles** le sale con el aviso de que le falta permiso, y hace bien: eso no es cosa suya.

Por la tarde tiene que dar entrada a un huésped. Pulsa la acción, conecta su cartera y firma. Su cartera también lleva el rol de recepción, así que la operación sale adelante.

Al acabar el turno, pulsa **Cerrar sesión** y se va a casa tranquila.

## 8. Preguntas frecuentes

### ¿Necesito una cartera para entrar al panel?

No. Para entrar bastan el usuario, la contraseña y el código de seis dígitos. La cartera hace falta después, solo si vas a firmar algo.

### ¿Qué es el TOTP?

Es el código de seis dígitos que cambia cada poco tiempo en tu aplicación de autenticación. Es el segundo cerrojo de la puerta.

### ¿Por qué no veo una sección que sí ve mi compañero?

Porque tu rol no la incluye. Cada panel pide un rol concreto. Pide el cambio al super-admin si la necesitas.

### ¿Cuánto dura la sesión?

El pase de entrada dura unos quince minutos y se renueva solo por detrás. Mientras trabajas no lo notas. Si te vas y vuelves al día siguiente, tendrás que entrar otra vez.
