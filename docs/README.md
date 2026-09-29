# Documentación del Hotel Marina del Sol

Esta carpeta reúne los documentos del proyecto **Hotel Marina del Sol: plataforma de noches
tokenizadas**. En esta plataforma cada noche de cada habitación se vende como una ficha digital
única (un *token*, explicado más abajo) y el comprador puede revenderla a otra persona.

## Qué es esto, en una frase

Una tienda propia del hotel donde se compran noches pagando con una cartera de cripto (*wallet*:
el programa del móvil que guarda tu dinero digital), sin pasar por intermediarios, y donde esas
noches se pueden revender con un porcentaje para el hotel.

## Por dónde empezar

- **Si eres el dueño del hotel (Carlos)** → `docs/manual-cliente.md`.
- **Si trabajas en recepción** → `docs/manual-recepcion.md`.
- **Si quieres comprar o revender una noche** → `docs/manual-comprador.md`.
- **Si vas a dibujar las ilustraciones de los manuales** → `docs/imagenes/README.md`.
- **Si quieres el detalle de un caso de uso concreto** → [`Manuales/05-casos-de-uso/README.md`](Manuales/05-casos-de-uso/README.md)
  (32 manuales, cada uno con su infografía) o la sección **Ayuda** de la propia web (`/ayuda`).

Los tres manuales generales están escritos en lenguaje llano, sin jerga, y describen lo que el sistema
hace **hoy**. Si algo no está terminado, lo dicen con claridad. Los **32 manuales por caso de uso**
siguen el mismo criterio y están ordenados según la **iniciación del sistema** (primero los permisos,
luego el inventario, después los clientes y al final la operación y el gobierno).

Los **manuales técnicos** (instalación, operación, incidentes y mantenimiento) viven en
[`../RepoTecnico/Manuales/`](../RepoTecnico/Manuales/README.md): son para quien levanta y mantiene el
sistema, no para el hotel ni para el comprador.

## Quiero… → lee esto

| Quiero… | Lee esto |
|---|---|
| Entender cómo funciona la compra y la reventa y qué se firma | [`manual-comprador.md`](manual-comprador.md) |
| Saber cómo se compra paso a paso y qué mirar antes de firmar | [`manual-comprador.md`](manual-comprador.md) §4 |
| Entrar en el panel del dueño y publicar noches | [`manual-cliente.md`](manual-cliente.md) §2 y §3 |
| Entender las cifras y las gráficas del panel | [`manual-cliente.md`](manual-cliente.md) §4 |
| Cobrar el dinero de las reventas | [`manual-cliente.md`](manual-cliente.md) §5 y [`manual-comprador.md`](manual-comprador.md) §6 |
| Parar todo si algo va mal | [`manual-cliente.md`](manual-cliente.md) §6 |
| Hacer un check-in en el mostrador | [`manual-recepcion.md`](manual-recepcion.md) §3 |
| Entender un mensaje de error de recepción | [`manual-recepcion.md`](manual-recepcion.md) §4 |
| Hacer el check-in si el cliente no tiene el QR | [`manual-recepcion.md`](manual-recepcion.md) §5 |
| Entender un caso de uso concreto, paso a paso y con infografía | [`Manuales/05-casos-de-uso/README.md`](Manuales/05-casos-de-uso/README.md) · sección **Ayuda** de la web (`/ayuda`) |
| Ver el orden en que se pone en marcha el sistema (32 CU en 9 bloques) | [`Manuales/05-casos-de-uso/README.md`](Manuales/05-casos-de-uso/README.md) · [`imagenes/doc-mapa-iniciacion-sistema.svg`](imagenes/doc-mapa-iniciacion-sistema.svg) |
| Saber qué límites tiene hoy el sistema y qué decide el dueño | [`manual-cliente.md`](manual-cliente.md) §8 · [`PRD.md`](PRD.md) §10 |
| Ver qué se pidió al principio y con qué palabras | [`BRIEF-CLIENTE-INICIAL.md`](BRIEF-CLIENTE-INICIAL.md) |
| Ver qué es el producto y qué **no** es | [`PRD.md`](PRD.md) |
| Ver los requisitos, las pantallas y los límites conocidos | [`SRS.md`](SRS.md) §7, §9 y §11 |
| Ver cómo se construyó y en qué orden | [`PLAN-CONSTRUCCION.md`](PLAN-CONSTRUCCION.md) |
| Ver las historias de usuario y los sprints | [`BACKLOG-SPRINTS.md`](BACKLOG-SPRINTS.md) |
| Saber **por qué** una pieza técnica es como es | [`adr/README.md`](adr/README.md) |
| Ver qué está verificado hoy, con su medición | [`../RepoTecnico/estado_proyecto.md`](../RepoTecnico/estado_proyecto.md) |
| Ver cómo trata la web los datos personales | [`COMPLIANCE.md`](COMPLIANCE.md) · [`PMS-INTEGRATION.md`](PMS-INTEGRATION.md) |
| Ver qué accesibilidad cumple la web | [`ACCESIBILIDAD-WCAG.md`](ACCESIBILIDAD-WCAG.md) |
| Ver cómo funciona el pago con tarjeta | [`FIAT-ONRAMP.md`](FIAT-ONRAMP.md) (hoy **no** operativo) |
| Ver las ilustraciones que faltan por dibujar | [`imagenes/README.md`](imagenes/README.md) |
| Poblar el entorno con datos de prueba (cuentas, roles, noches, ventas) | [`inyeccion-datos.md`](inyeccion-datos.md) |

## Aviso importante antes de leer

Todo lo que describen estos manuales funciona hoy en una **red de pruebas privada**: sirve para
demostrar y validar el sistema, **no** para vender al público todavía. Eso es una decisión
pendiente del dueño del hotel. Los detalles honestos están en
[`RESPUESTA-CLIENTE-BORRADOR.md`](RESPUESTA-CLIENTE-BORRADOR.md).
