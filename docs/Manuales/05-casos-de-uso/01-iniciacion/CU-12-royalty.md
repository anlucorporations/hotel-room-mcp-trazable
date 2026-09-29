# CU-12 · Decidir cuánto se queda el hotel en cada reventa

> En una frase: el hotel se queda un pellizco fijo en cada reventa, y aquí puedes consultar de cuánto es.

![Infografía del CU-12: el porcentaje que el hotel se queda según el tipo de habitación](imagenes/doc-cu-12-royalty.svg)

## 1. Para qué sirve

Cuando alguien compra una noche y luego la revende, el hotel se queda una parte del precio. Esa parte se llama *royalty* (la comisión del hotel en la reventa).

Aquí conviene ser claro desde el principio: ese porcentaje **no se puede cambiar**. No hay ningún botón para subirlo ni bajarlo.

El porcentaje se decide al dar de alta la noche y depende del tipo de habitación. Después se queda fijo para siempre.

Este caso de uso sirve para **consultarlo**. Es una pantalla informativa: te dice cuánto cobra el hotel en cada tipo de habitación.

Que no haya botón es una decisión a propósito. Así nadie puede cambiar las reglas de una reventa después de haberla anunciado.

Piensa en ello como el precio de una etiqueta ya impresa. Se decide al principio y se queda tal cual. Si cambiara a mitad de camino, el que revende no sabría con qué cuenta.

## 2. Quién puede hacerlo

La pantalla está pensada para el propietario (el rol de super-admin, `DEFAULT_ADMIN_ROLE`).

En el catálogo antiguo este caso de uso hablaba de un rol de royalty. Ese rol **no existe** hoy: no está en el contrato y no se puede asignar.

Cualquiera puede preguntar el porcentaje de una noche concreta al contrato. El panel del hotel, en cambio, pide sesión de super-admin.

Y nadie puede modificarlo. Ni el propietario. No hay función que lo permita.

## 3. Antes de empezar

- Ten una sesión abierta en el panel con el rol de super-admin.
- Ten claro que es una pantalla de solo lectura: no vas a firmar nada.
- Si lo que quieres es cambiar quién cobra, eso es otra operación distinta y no toca el porcentaje.
- Si buscas un formulario para escribir un número nuevo, no lo vas a encontrar. Es normal.

## 4. Paso a paso

1. Abre el panel del hotel y entra en la sección **Royalty** (la dirección es `/admin/royalty`).
2. Lee el primer aviso: dice que el porcentaje se fija al crear la noche y que no se puede modificar.
3. Mira la tabla de tipos. Tiene tres filas: **Simple** (habitaciones 101–130) al **5 %**, **Doble** (101–130) al **5 %** y **Suite** (201–220) al **10 %**.
4. Lee la nota del final: el contrato es la fuente única del dato. El panel solo lo enseña.
5. Si quieres comprobar una noche concreta, ese cálculo lo hace el contrato cuando alguien revende.
6. Cierra la pantalla cuando termines. No hay nada que guardar.

## 5. Qué ves cuando sale bien

- El aviso de que el royalty es inmutable, bien visible arriba.
- La tabla con los tres tipos y su porcentaje: 5 %, 5 % y 10 %.
- La nota que dice que el dato sale del contrato y no de este panel.
- Ningún botón de guardar, ningún formulario y ninguna transacción que firmar.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| No hay ningún botón para cambiar el porcentaje | El royalty es inmutable por diseño | No hay nada que arreglar: es así |
| No encuentras un rol de royalty | Ese rol no existe hoy | Usa una cuenta de super-admin |
| El panel te avisa de que falta el rol | Tu sesión no es de super-admin | Entra con la cuenta del propietario |
| Una noche concreta devuelve 0 % | Esa habitación no está dada de alta | Revisa el alta de la habitación |
| El importe de la reventa no sale redondo | El reparto redondea hacia abajo | Usa un precio que reparta bien si te importa el céntimo |
| Crees que el porcentaje ha cambiado solo | No cambia nunca | Comprueba que miras el tipo de habitación correcto |

## 7. Un ejemplo de verdad

El Hotel Marina del Sol tiene una suite, la 201. Al dar de alta esa noche, el sistema le pone el 10 % de royalty.

Un cliente compra la noche por 200 €. Más adelante la revende por los mismos 200 €.

En esa reventa, el hotel se queda 20 € y el vendedor recibe 180 €. El dinero del hotel no se manda al instante: queda apuntado y se retira más tarde.

Un mes después, el dueño entra en la sección **Royalty** para comprobar la cifra. Ve la fila de la suite con su 10 % y se queda tranquilo.

Intenta buscar un botón para subirlo al 15 % en temporada alta. No lo encuentra, y es correcto: el porcentaje se decidió el día que se creó la noche.

## 8. Preguntas frecuentes

### ¿Puedo subir el royalty a un 15 %?

No. El porcentaje se fija al dar de alta la noche y ya no se cambia. No existe ninguna opción para tocarlo.

### ¿Dónde se decide entonces el porcentaje?

Al crear cada noche, según el tipo de habitación: 5 % para simple y doble, y 10 % para suite.

### ¿Quién cobra esa comisión?

El hotel, a través de su cuenta de tesorería. Esa cuenta sí se puede cambiar sin tocar el porcentaje.

### ¿Por qué no hay un formulario en esta pantalla?

Porque no hay nada que configurar. La pantalla solo enseña lo que el contrato tiene fijado. Cualquier cambio aquí sería un espejismo.

### ¿El porcentaje es el mismo para todos los hoteles?

En este sistema el porcentaje sale del código del contrato, no de una casilla que se rellene a gusto. Por eso todas las noches del mismo tipo se comportan igual.

### ¿Y si quiero una excepción para una habitación concreta?

Hoy no existe. No hay ninguna opción por noche ni por habitación dentro de este caso de uso.
