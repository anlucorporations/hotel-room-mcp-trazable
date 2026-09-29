# CU-04 · Ver y filtrar las noches disponibles

> En una frase: abres el catálogo del hotel y ves qué noches quedan libres, con su precio, para elegir la que más te encaje.

![Infografía del CU-04: abrir el catálogo, filtrar las noches y elegir una](imagenes/doc-cu-04-catalogo.svg)

## 1. Para qué sirve

El catálogo es el escaparate del hotel. Muestra las noches que están a la venta. Cada noche es una habitación con una fecha concreta.

No hace falta cuenta ni cartera para mirar. La página es pública. Puedes entrar, comparar y salir cuando quieras.

Cada tarjeta te da lo justo para decidir: una imagen, la habitación, el tipo, la fecha, el estado y el precio.

El catálogo solo enseña las noches cercanas. En concreto, desde hoy hasta 90 días después. Las fechas se cuentan en UTC, la hora del meridiano de Greenwich.

Los filtros te ayudan a no perderte. Puedes acotar por tipo de habitación, por mes, por precio y por fechas. También puedes buscar por número de habitación.

## 2. Quién puede hacerlo

Cualquiera. Es una página pública. No pide sesión, ni correo, ni cartera.

Compradores y curiosos ven exactamente lo mismo. La diferencia llega al pulsar **Reservar**, que sí pide cartera (CU-17).

## 3. Antes de empezar

- Ten claro qué mes o qué fechas te interesan.
- Decide cuánto quieres gastar como máximo. Los precios se muestran en ETH.
- Si buscas una habitación concreta, apunta su número.
- Ten en cuenta el límite de 90 días: más allá no aparece nada.
- Si vas a comprar, conecta antes la cartera y ponte en la red correcta.

## 4. Paso a paso

1. Abre `/catalogo` en el navegador.
2. Espera un momento. La página lee el inventario cada vez que entras, no guarda copia vieja.
3. Mira la parrilla de tarjetas. Cada una es una noche libre.
4. Lee la tarjeta: imagen, habitación, tipo, fecha y precio en ETH.
5. Fíjate en las etiquetas. Las suites llevan una marca dorada.
6. Usa la barra de filtros para acotar. Elige el tipo de habitación si te da igual cuál.
7. Elige el mes en la lista. Solo verás las noches de ese mes.
8. Mueve el precio máximo si quieres gastar menos.
9. Rellena las fechas de entrada y salida si buscas un hueco concreto.
10. Escribe el número de habitación en el buscador si vas a por una en especial.
11. Pulsa **Cargar más** para ver las siguientes 12 noches.
12. Cuando encuentres la tuya, pulsa **Reservar** y sigue con la compra.

Los filtros trabajan sobre lo que ya tienes delante. No vuelven a preguntar al servidor, así que responden al instante.

## 5. Qué ves cuando sale bien

- Una parrilla de tarjetas con las noches disponibles.
- Cada tarjeta con su precio en ETH bien visible.
- Las suites marcadas con su etiqueta dorada.
- Al mover un filtro, la lista de tarjetas cambia al momento.
- Al filtrar, la lista vuelve a la primera página sola.
- El botón **Cargar más** añade 12 noches y deja el foco en la primera nueva.
- Si no hay ninguna noche en el rango, ves un aviso claro y un botón para quitar filtros.
- Si el contrato del hotel está en pausa, ves un aviso arriba y las tarjetas sin botón de compra.

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| Aviso de que el catálogo no está disponible | Ni la base de datos ni la red responden | Pulsa **Reintentar** y espera unos segundos |
| «No hay noches disponibles» | De verdad no queda inventario en ese momento | Prueba otro día o vuelve más tarde |
| No hay resultados con tus filtros | Los filtros son demasiado estrechos | Pulsa **Quitar filtros** y empieza de nuevo |
| Un filtro de fechas no hace nada | Solo rellenaste una de las dos fechas | Rellena las dos o bórralas |
| La imagen de una noche no carga | Falta la foto de ese tipo de habitación | No pasa nada; la compra sigue disponible |
| Un aviso de que el sistema está en pausa | El hotel ha parado las operaciones | Espera a que se reactive; no es un fallo tuyo |
| Ves una etiqueta de reventa | Esa noche la vende otro cliente | Míralo en la sección de reventas |
| La lista tarda en aparecer | La red va lenta o hay mucho inventario | Espera; si sigue igual, pulsa reintentar |

## 7. Un ejemplo de verdad

Andrés quiere una noche en el hotel para el puente de junio. No tiene cartera todavía, pero eso le da igual: solo quiere mirar.

Abre el catálogo y ve 30 tarjetas. La primera es la habitación 102, doble, para el 15 de junio, a 0,04 ETH.

Le parece bien de precio, pero prefiere una suite. En el filtro de tipo elige **suite**. La lista se acorta a 8 noches. Después pone un precio máximo bajo y quedan 3.

La habitación 205, para el 20 de junio, le encaja. Pulsa **Cargar más** para asegurarse de que no hay nada mejor y luego vuelve a subir. Se queda con la 205.

Pulsa **Reservar**. Como no tiene cartera, la web le pide conectarla. Eso ya es otro manual.

## 8. Preguntas frecuentes

### ¿Hace falta pagar o registrarse para ver el catálogo?

No. Mirar es gratis y libre. Solo necesitas cartera cuando pulsas reservar.

### ¿Por qué solo veo 90 días?

Porque el hotel abre su calendario por tramos. Más allá de ese horizonte aún no hay noches a la venta.

### ¿El precio que veo es el final?

Es el precio de esa noche en ETH. Antes de firmar, la web y tu cartera te lo vuelven a enseñar. Nada se firma sin que lo veas.

### ¿Qué significa la etiqueta de reventa?

Que esa noche no la vende el hotel, sino otro cliente. Las reventas tienen su propia sección y su propio manual.
