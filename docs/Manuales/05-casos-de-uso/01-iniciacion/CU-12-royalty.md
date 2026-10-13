# CU-12 · Decidir cuánto se queda el hotel en cada reventa

> En una frase: el hotel se queda un pellizco en cada reventa; aquí puedes consultarlo **y** ajustarlo por tipo de habitación.

![Infografía del CU-12: el porcentaje que el hotel se queda según el tipo de habitación](imagenes/doc-cu-12-royalty.svg)

## 1. Para qué sirve

Cuando alguien compra una noche y luego la revende, el hotel se queda una parte del precio. Esa parte se llama *royalty* (la comisión del hotel en la reventa).

El porcentaje se fija **por tipo de habitación** y, desde el incremento **C1** (2026-10-13, ADR-27), quien tenga el rol `ROYALTY_ADMIN` **puede cambiarlo** dentro del margen permitido: entre el 0 % y el 20 %. Los valores de partida son el 5 % para simple y doble, y el 10 % para suite.

Cada cambio queda firmado en la cartera y anotado en el registro del contrato, así que no es una cifra que baile sin dejar rastro: hay una traza de quién lo cambió y a qué valor.

Si el contrato desplegado todavía es de la versión anterior (**D-06**), el porcentaje es fijo y el panel lo avisa: te enseña los valores vigentes pero no ofrece el formulario. La posibilidad de cambiarlo llega con el despliegue de C1.

## 2. Quién puede hacerlo

Consultar el porcentaje puede hacerlo cualquiera: el dato es público.

Cambiarlo requiere el rol de **administrador de royalty** (`ROYALTY_ADMIN`). En este piloto lo ejerce el propietario (la misma cuenta que gobierna el resto de roles).

No hace falta ser el propietario para *leer*; sí para *escribir*. Y aunque el panel te muestre el formulario, quien manda es el contrato: si tu cuenta no tiene el rol, la operación se rechaza.

## 3. Antes de empezar

- Ten una sesión abierta en el panel del hotel.
- Para cambiar el porcentaje, conecta la cartera que tiene el rol `ROYALTY_ADMIN`.
- Piensa qué tipo de habitación quieres tocar: simple, doble o suite. El cambio se aplica **a ese tipo**, no a una noche concreta.
- Ten a mano la cifra en *basis points*: 100 bps = 1 %. Por ejemplo, 1500 bps = 15 %.

## 4. Paso a paso

1. Abre el panel del hotel y entra en la sección **Royalty** (la dirección es `/admin/royalty`).
2. Lee la tabla de tipos. Tiene tres filas con su porcentaje vigente: **Simple** (101–115), **Doble** (116–130) y **Suite** (201–220).
3. Si solo querías consultar, ya está: esa tabla sale del contrato y se actualiza sola.
4. Para cambiarlo, elige el **tipo de habitación** en el desplegable.
5. Escribe el **royalty en basis points** (de 0 a 2000). El panel te avisa si el valor no vale.
6. Pulsa **Revisar y firmar**. Verás un resumen con el tipo y el porcentaje nuevos.
7. Confirma y firma en tu cartera. Cuando la red lo acepte, la tabla se actualiza con el nuevo valor.

Si tu cuenta no tiene el rol, el panel te lo dice y deja el botón apagado: no se firma nada.

## 5. Qué ves cuando sale bien

- La tabla con los tres tipos y su porcentaje vigente (5 %, 5 % y 10 % de partida).
- Un formulario para cambiar el porcentaje, si tu cuenta puede hacerlo.
- El resumen antes de firmar, con el tipo y el porcentaje que vas a fijar.
- La tabla ya actualizada después de firmar.
- Un registro on-chain del cambio, con la cuenta que lo hizo y el valor nuevo.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| El panel avisa de que el contrato aún no permite editar | El contrato desplegado es la versión anterior (D-06) | Espera al despliegue de C1; mientras, los valores vigentes se consultan igual |
| El botón de firmar está apagado y dice que falta el rol | Tu cuenta no tiene `ROYALTY_ADMIN` | Entra con la cuenta que sí lo tiene |
| «Introduce un número entero entre 0 y 2000 bps» | El valor no es válido | Corrige la cifra: 100 bps = 1 % |
| La transacción se rechaza al firmar | El contrato ha rechazado la operación (falta el rol o el valor) | Revisa el rol y el rango, y vuelve a intentarlo |
| Una noche concreta devuelve 0 % | Esa habitación no está dada de alta | Revisa el alta de la habitación |
| El importe de la reventa no sale redondo | El reparto redondea hacia abajo | Usa un precio que reparta bien si te importa el céntimo |
| Cambié el porcentaje y las reventas ya publicadas no cambian | El listado ya creado conserva su precio; el royalty se calcula al comprar | El cambio aplica a las reventas que se cierren después |

## 7. Un ejemplo de verdad

El Hotel Marina del Sol tiene una suite, la 201. Al dar de alta esa noche, el sistema le pone el 10 % de royalty.

Llega la temporada alta y el dueño quiere que el hotel se quede algo más en las reventas de suite. Entra en **Royalty**, elige «suite», escribe 1500 bps (15 %) y firma con su cartera. La tabla pasa a mostrar 15 %.

Un cliente compra la noche por 200 € y más adelante la revende por los mismos 200 €. En esa reventa el hotel se queda 30 € y el vendedor recibe 170 €. El dinero del hotel queda apuntado y se retira más tarde.

Las suites que ya estaban revendidas no se tocan: el porcentaje se aplica a la reventa en el momento de comprarla.

## 8. Preguntas frecuentes

### ¿Puedo subir el royalty a un 15 %?

Sí, si tu cuenta tiene el rol `ROYALTY_ADMIN`. Fija el tipo de habitación, escribe 1500 bps y firma. El tope es el 20 % (2000 bps). Si el contrato desplegado aún es la versión anterior (D-06), el panel te avisa y no ofrece el formulario.

### ¿Dónde se decide entonces el porcentaje?

Con la versión C1, en el contrato, por tipo de habitación: simple, doble y suite. Los valores de partida son 5 %, 5 % y 10 %. En la versión anterior (D-06) el porcentaje quedaba fijado al dar de alta la noche.

### ¿Quién cobra esa comisión?

El hotel, a través de su cuenta de tesorería. Esa cuenta se cambia en otra operación y no toca el porcentaje.

### ¿Por qué no hay un formulario en esta pantalla?

Puede haber dos motivos: que tu cuenta no tenga el rol `ROYALTY_ADMIN` (el panel lo dice y deja el botón apagado) o que el contrato desplegado todavía sea la versión D-06, en la que el royalty era fijo.

### ¿El porcentaje es el mismo para todos los hoteles?

No: cada hotel despliega su propio contrato y decide sus porcentajes. Dentro de un mismo hotel, todas las noches de un tipo comparten el porcentaje vigente de ese tipo.

### ¿Y si quiero una excepción para una habitación concreta?

Hoy no existe: la unidad de configuración es el **tipo de habitación**, no la habitación ni la noche concreta.
