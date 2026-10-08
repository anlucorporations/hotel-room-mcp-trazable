# Mira el histórico de ventas del hotel

> Es para cualquiera que quiera ver qué noches se han vendido y a qué precio.
> No hace falta cartera, ni cuenta, ni iniciar sesión.

## Empezar en 5 minutos

1. Abre la página **Histórico**.
2. Verás las ventas de la más reciente a la más antigua.
3. Si quieres, pulsa **Exportar CSV** para descargar la lista.

## Paso a paso

1. Abre **Histórico** desde el menú de la web. No necesitas conectar nada.
2. La página se prepara de nuevo cada vez que la abres: siempre ves los datos del momento, sin copia guardada.
3. La primera fila de la lista es siempre la venta más reciente.
4. En una pantalla grande verás una tabla con estas columnas: **Habitación**, **Noche**, **Tipo**, **Precio**, **Venta**, **Vendedor**, **Comprador** y **Transacción**.
5. En el móvil, la tabla se convierte en tarjetas una debajo de otra, con cada dato con su etiqueta.
6. La columna **Venta** te dice de dónde sale la noche: **Primaria** (la vendió el hotel) o **Reventa** (la compró antes otro cliente y la revende).
7. Las carteras se ven acortadas, con una forma parecida a `0x1234…abcd`. Si pasas el ratón por encima, ves el identificador completo.
8. El **Precio** está en ETH, la moneda de esta red.
9. La fecha de la noche se ve como día/mes/año.
10. En la columna **Transacción** puede haber un enlace. Si lo hay, abre el detalle de la operación en otra pestaña. Si no lo hay, verás el código como texto con el identificador completo al pasar el ratón.
11. Pulsa **Exportar CSV** para descargar un fichero con todo el histórico. El fichero se llama `sales_history` seguido de una marca de tiempo.
12. El CSV trae 12 columnas: identificador de la noche, habitación, fecha de la noche, tipo, precio en ETH, precio en la unidad más pequeña, tipo de venta, vendedor, comprador, bloque, fecha de la operación y el código de la transacción.
13. El CSV descarga **todo** el histórico, no solo lo que ves en pantalla.
14. La tabla de la pantalla y el CSV leen de la misma fuente, así que no pueden decir cosas distintas.

### Un aviso importante

Todo esto corre hoy en una **red de pruebas**. Sirve para practicar y comprobar que el sistema funciona. Las cifras que ves no valen dinero real.

## Si algo no funciona

- **«No se pudo cargar el histórico. Inténtalo de nuevo.»** La fuente de datos no responde. Pulsa **Reintentar**.
- **«Todavía no se ha registrado ninguna venta.»** No es un error: aún no se ha vendido ninguna noche. Vuelve más tarde.
- **La transacción no es un enlace.** Esta red no tiene explorador configurado. Es normal: el código queda como texto para que lo copies a mano.
- **Una venta no tiene fecha.** Es un dato de una venta antigua que no se pudo recuperar. El sistema no se lo inventa: deja la fecha en blanco.
- **El CSV no se descarga.** La fuente que prepara el fichero no responde en ese momento. Vuelve a intentarlo más tarde.
- **El navegador bloquea la descarga.** Si no ves el fichero, revisa los avisos de tu navegador. El sistema no recibe ninguna respuesta en ese caso.
- **La lista tarda o sale vacía un momento.** Puede ser un corte momentáneo de conexión. Pulsa **Reintentar** o recarga la página.
- **No veo una venta recién hecha.** La lista se prepara en cada visita, así que recarga la página y vuelve a mirar.

## Preguntas rápidas

- **¿Necesito una cartera para ver el histórico?** No. La página es pública: se abre sin cartera y sin cuenta.
- **¿Veo datos personales de otras personas?** No. Solo direcciones de cartera, que son como un seudónimo, y los datos de la noche.
- **¿El precio es en euros?** No. Se muestra en ETH, la moneda de la red, y en esta red de pruebas no vale dinero real.
- **¿Puedo descargar toda la lista?** Sí. El botón **Exportar CSV** descarga el histórico completo.
- **¿Por qué el CSV trae más columnas que la pantalla?** Porque está pensado para quien quiere revisar los datos con detalle, incluido el precio en la unidad más pequeña.
- **¿Por qué una venta antigua no tiene fecha?** Porque ese dato no se pudo recuperar. El sistema lo deja vacío antes que poner una fecha falsa.
- **¿Puedo abrir el detalle de una venta?** Sí, si la red tiene explorador: el enlace abre la operación. Si no, el código queda como texto para copiarlo.
- **¿Qué es eso de «Wei» que sale en el CSV?** Es la unidad más pequeña de ETH. El CSV la incluye para que el dato sea exacto.
