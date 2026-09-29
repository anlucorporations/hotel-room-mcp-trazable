# CU-16 · Dar de alta a quien puede tocar el sistema (roles y propiedad)

> En una frase: repartes las llaves del sistema a las cuentas correctas y dejas claro quién manda de verdad.

![Infografía del CU-16: conceder y revocar roles, y ceder el control real](imagenes/doc-cu-16-roles.svg)

## 1. Para qué sirve

El sistema vive en un contrato (el programa que guarda las reglas en la red y no se puede cambiar a la ligera). Ese contrato reparte «llaves» o permisos.

Cada llave deja hacer una cosa concreta: poner noches a la venta, dar entrada a clientes, pausar el sistema, quemar noches caducadas o retirar el dinero recaudado.

Este caso de uso sirve para dar esas llaves a la persona adecuada. También sirve para quitárselas cuando ya no le tocan.

Y sirve para el relevo de mando: cuando cambia el responsable, hay que pasarle el control de verdad. Ojo, porque aquí hay una trampa.

El campo «propiedad» del contrato es solo una etiqueta. Cambiarlo no da el mando. El mando lo da el rol de super-admin.

## 2. Quién puede hacerlo

Solo la cuenta que tiene el rol de super-admin (`DEFAULT_ADMIN_ROLE`, la llave más alta del contrato).

Esa cuenta es la que firma las transacciones. Si no la tiene, el contrato rechaza la operación y no hay nada que hacer.

Conviene distinguir dos planos que se parecen mucho:

- **El rol de la aplicación:** deja entrar al panel del hotel. Lo gestiona el alta de usuarios de la plataforma, que es otro caso de uso.
- **El rol del contrato:** deja firmar acciones sobre las noches. Es el que se reparte aquí.

Un operador puede tener el primero y no el segundo. Si va a trabajar de verdad, dale los dos.

## 3. Antes de empezar

- Ten abierta una sesión en el panel con una cuenta que tenga el rol de super-admin.
- Pide a la persona su dirección de cartera completa, la que empieza por `0x`. Cópiala y pégala, no la escribas a mano.
- Comprueba que la cartera con la que vas a firmar es la del super-admin. Si no, la transacción fallará.
- Decide qué llave necesita esa persona y solo esa. Cuantas menos llaves repartas, mejor.
- Ten claro que revocar una llave no se deshace con un botón de «atrás». Se puede volver a conceder, pero el susto ya está dado.

## 4. Paso a paso

1. Abre el panel del hotel y entra en la sección **Roles** (la dirección es `/admin/roles`).
2. Lee la tarjeta **Super-admin real (control on-chain)**. Ahí se explica que el mando lo da el rol, no la propiedad.
3. En **Conceder / revocar rol**, abre el desplegable **Rol** y elige la llave que quieres dar.
4. Escribe la **dirección de la cuenta** de la persona, siempre empezando por `0x`.
5. Pulsa **Conceder**. Aparece el resumen de la operación y tu cartera te pide la firma.
6. Firma en la cartera y espera a que la red confirme. El panel te va contando el estado hasta que termina.
7. Para quitar una llave, elige el rol, escribe la cuenta y pulsa **Revocar**. Aquí el panel te pide confirmar antes de firmar.
8. Para ceder el mando de verdad, baja a **Ceder el control real (DEFAULT_ADMIN)**: concede ese rol al nuevo responsable.
9. Cuando el nuevo super-admin lo tenga confirmado, quita el rol de super-admin a la cuenta antigua con **Revocar**. Así no quedan dos dueños sueltos.
10. Si además quieres mover la etiqueta de propiedad, usa el formulario de transferencia y pide al designado que acepte. Recuerda: es informativo.

## 5. Qué ves cuando sale bien

- La operación pasa a **Operación completada** y el panel avisa de que se confirmó en la red.
- El contrato deja apuntado el movimiento: un evento `RoleGranted` al conceder y un `RoleRevoked` al revocar.
- El formulario se queda limpio y no muestra ningún error.
- En la tarjeta de propiedad, el panel vuelve a leer y enseña el owner actual. Si hay un relevo a medias, enseña también el owner pendiente.
- El designado para la propiedad ve que tiene algo pendiente y puede aceptarlo con **Aceptar ownership**.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| Error de campo con la dirección | La cuenta no tiene forma de dirección válida | Cópiala otra vez desde la cartera y pégala entera |
| La transacción se cancela sola | Tu cuenta no tiene el rol de super-admin | Entra con la cuenta que sí lo tiene |
| Error al aceptar la propiedad | Esa cartera no es la designada | Acepta desde la cartera que se designó |
| Error al iniciar la transferencia | Tu cuenta no es el owner actual | Revisa quién figura como owner |
| Transferiste la propiedad y nada cambia | La propiedad no da control real | Concede el rol de super-admin al nuevo responsable |
| El panel avisa de que falta el rol | Tu sesión no incluye ese rol | Inicia sesión con un operador que lo tenga |
| No encuentras la sección Roles | Tu sesión no tiene el rol necesario | Pide el alta al super-admin |

## 7. Un ejemplo de verdad

Marta lleva la administración del Hotel Marina del Sol. Su cartera es la super-admin del sistema.

Entra en la sección **Roles** y da de alta a Luis, el nuevo encargado de recepción. Elige el rol de recepción, pega la dirección de Luis y firma la operación.

A la semana siguiente, Luis pasa a encargarse también de la pausa de emergencia. Marta le concede esa segunda llave sin quitarle la primera.

En verano, Luis deja la empresa. Marta abre la sección, elige la cuenta de Luis y pulsa **Revocar** por cada llave que tenía. Desde ese momento Luis no puede firmar nada.

Marta aprovecha para pasar el mando a Diego. Le concede el rol de super-admin y, cuando la red lo confirma, revoca el suyo. Ahora manda Diego.

## 8. Preguntas frecuentes

### ¿Transferir la propiedad me convierte en dueño del sistema?

No. Es solo una etiqueta informativa. El mando real lo da el rol de super-admin.

### ¿Puedo dar una llave a una cuenta que no existe?

El formulario solo comprueba que la dirección esté bien escrita. Si nadie controla esa cartera, esa llave se queda sin usar y sin dueño.

### ¿Puedo quitarme a mí mismo la llave de super-admin?

Sí, pero te quedas sin mando. Hazlo solo cuando el nuevo responsable ya tenga la suya confirmada.

### ¿Qué pasa si el sistema está en pausa?

La gestión de roles sigue funcionando. La pausa bloquea compras, reventas y otras acciones, no esta sección.
