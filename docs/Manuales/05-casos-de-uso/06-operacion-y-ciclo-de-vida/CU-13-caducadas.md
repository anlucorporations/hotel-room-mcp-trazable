# CU-13 · Retirar las noches del hotel que ya han caducado

> En una frase: cuando una noche que puso el hotel ya ha pasado de fecha y nadie la compró, la borras para dejar el inventario limpio.

![Infografía del CU-13: escanear las caducadas, revisar el lote y quemarlas](imagenes/doc-cu-13-caducadas.svg)

## 1. Para qué sirve

Cada noche del hotel es una ficha digital (*token*: el papel que demuestra que esa noche existe y es de alguien). El hotel crea fichas para las fechas que quiere vender.

Si una fecha pasa y nadie compró esa noche, la ficha se queda ahí. Ya no vale para nada. Nadie puede comprarla porque su día ya pasó.

Este caso de uso sirve para retirar esas fichas viejas. La operación se llama **quemar** la noche: la ficha se destruye y desaparece del sistema.

Ojo con una regla importante: solo se queman las noches **del hotel**. Las que ya compró un cliente no se tocan nunca, hayan pasado o no.

Quemar no devuelve dinero a nadie. Solo limpia el inventario y evita que el catálogo enseñe noches que ya no sirven.

## 2. Quién puede hacerlo

Solo la cuenta que tiene la llave de **quemador** (`BURNER_ROLE`, el permiso del contrato para destruir fichas caducadas).

En el día a día no lo hace una persona. Lo hace solo el *worker* (el programa que trabaja de fondo sin que nadie mire). Lleva su propia cartera con esa llave.

También puedes hacerlo a mano desde el panel, en la sección **Caducadas**. Ahí el sistema te deja escanear y quemar un lote cuando lo necesites.

Aunque el panel te deje entrar, quien manda es el contrato. Si tu cuenta no tiene la llave, la operación se rechaza.

## 3. Antes de empezar

- Ten abierta una sesión en el panel con una cuenta que tenga la llave de quemador.
- Comprueba que el sistema no esté en pausa. Con la pausa puesta el botón de quemar sale deshabilitado y avisa.
- Ten clara la lista de fechas que quieres limpiar. Si no pones ninguna, el sistema usa las que encuentra al escanear.
- Recuerda el tope: **50 noches por lote**. Si hay más, tendrás que hacer varias tandas.
- No metas en el lote ninguna noche que ya se haya vendido. El contrato la rechaza y cancela todo el lote.
- Que la cartera que firma tenga algo de dinero para pagar la comisión de red de la quema.

## 4. Paso a paso

1. Abre el panel del hotel y entra en la sección **Caducadas** (la dirección es `/admin/caducadas`).
2. Pulsa **Escanear caducadas**. El sistema mira las fichas creadas, descarta las vendidas y pregunta al contrato cuáles ya pasaron de fecha.
3. Espera unos segundos. El escaneo va por páginas y confirma cada noche una a una contra la red.
4. Revisa la lista de candidatas que aparece en pantalla. Fíjate en las fechas.
5. Si quieres quemar unas concretas, escribe sus números (*tokenId*: el número que identifica cada ficha) en el campo de lote manual. Si lo dejas vacío, se quema lo escaneado hasta el tope.
6. Pulsa **Quemar lote**. Verás un resumen con cuántas noches van y la lista de números.
7. Lee el resumen y confirma. Tu cartera te pide la firma.
8. Espera a que la red confirme la operación. El panel te va contando el estado.
9. Cuando termine, repite el escaneo si quedaban más de 50 noches y lanza otra tanda.

## 5. Qué ves cuando sale bien

- El panel marca la operación como completada y avisa de que se confirmó en la red.
- El contrato deja apuntado un evento `Burn` por cada noche quemada.
- Esas noches ya no aparecen en el catálogo ni se pueden comprar ni revender.
- El registro interno de fichas las marca como **BURNED** (quemadas).
- Si la quema la hizo el worker, deja un aviso de tipo `BURN_EXECUTED` en la cola de mensajes.
- En el explorador de la red, la ficha ya no tiene dueño: intentar consultarla da error, que es justo lo que se busca.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| «Esa noche ya tiene dueño» | En el lote se coló una noche vendida | Quita esa noche de la lista y repite: el lote entero se cancela |
| «Esa noche todavía no ha caducado» | La fecha de esa noche aún no ha pasado | Espera al día siguiente o quítala del lote |
| «Lote demasiado grande» | Has pasado de 50 noches | Divide la lista en tandas de 50 |
| «El lote está vacío» | No hay nada que quemar | Pulsa **Escanear caducadas** y revisa que haya fechas pasadas |
| El botón de quemar sale apagado | Falta el rol de quemador o el sistema está en pausa | Revisa tu cuenta y mira la sección **Pausa** |
| El escaneo se queda a medias | La red no respondió para algunas noches | Vuelve a pulsar **Escanear caducadas** |
| «No se pudo comprobar la fecha» | La configuración del escaneo no cuadra | Avisa al responsable técnico: hay un dato mal puesto |
| «Dinero insuficiente para la comisión» | La cartera del worker no tiene saldo | Recarga esa cartera y espera al siguiente ciclo |

## 7. Un ejemplo de verdad

El Hotel Marina del Sol puso a la venta noches de marzo, abril y mayo. Al acabar mayo quedaron seis noches de marzo sin vender.

Nadie las compró, así que ya no valen para nada. La recepcionista entra en **Caducadas** y pulsa **Escanear caducadas**.

El sistema tarda un momento y enseña cuatro candidatas. Las otras dos eran de cliente y no salen en la lista, porque esas nunca se queman.

Escribe los números de las cuatro y pulsa **Quemar lote**. El resumen dice «4 noches». Firma con la cartera y espera.

Al confirmarse, las cuatro desaparecen del catálogo. El inventario queda limpio y la web ya solo enseña fechas que se pueden vender.

## 8. Preguntas frecuentes

### ¿Se quema alguna noche que ya haya comprado un cliente?

Nunca. El sistema solo mira las noches que no se han vendido ni una vez. Las de cliente se quedan como están.

### ¿Qué pasa si intento comprar una noche caducada?

El contrato dice que no y cancela la compra. Lo mismo pasa si intentas ponerla en reventa o comprarla de reventa.

### ¿Cuándo se limpia solo?

El worker lo intenta cada día a las 12:00, hora de Madrid. Deja un cerrojo por día para no repetir el trabajo.

Ojo: el contrato calcula la fecha en horario UTC, no en hora de Madrid. Por eso una noche del día de hoy puede seguir viva unas horas.

### ¿Hay alguna pantalla con el histórico de quemas?

No. Hoy solo queda el rastro de cada evento `Burn` en la red. No hay listado para el operador.
