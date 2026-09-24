# Respuesta a Carlos Martínez (Hotel Marina del Sol)

> **Versión**: 3.0.0 · **Fecha**: 2026-09-23 · **Decisión de origen**: D-17 (hallazgo H-07 de la auditoría V5)
> **Estado**: **listo para enviar en cuanto el responsable complete los campos marcados** `[ASÍ]`.
> Los campos que quedan son **decisiones del responsable**, no trabajo pendiente de redacción:
> tarifa, importes y fechas.
> **Decisión tomada en la revisión de M9**: la carta presenta la **red privada como el entregable** y
> **Polygon como un bloque presupuestado aparte** que Carlos debe aprobar expresamente. Ya no se le pide
> que elija entre dos caminos equivalentes: se le entrega lo que hay funcionando y se le ofrece,
> con precio, el salto a la red pública.
>
> **Cambios respecto al borrador anterior**: el trabajo de terminación (M0–M9) **ya está hecho y
> verificado**, así que el punto 1 deja de ser «lo que queda por hacer» y pasa a ser «lo que queda por
> presupuestar». El punto 4 enumera lo que necesitamos de Carlos **con su consecuencia** si no llega, y
> el punto 7 pasa a ser «qué incluye lo entregado y qué costaría Polygon».


---

**De**: [tu nombre], [agencia]
**Para**: Carlos Martínez \<carlos@hotelmarinadelsol.es\>
**Asunto**: Tu web de NFTs — respuestas a tus cuatro preguntas y una decisión importante

---

Hola Carlos,

Perdona la tardanza. Antes de darte números hemos revisado a fondo lo construido, y esa revisión ha
cambiado dos cosas que prefiero contarte de frente: **no vamos a llegar a junio** y **la red en la que
funciona hoy el sistema todavía no es Polygon**. Te explico todo con calma y con tus cuatro preguntas
contestadas.

## 1. ¿Cuánto cuesta?

Para poner un precio hay que acordar antes el alcance, porque en la revisión aparecieron cosas a medio
hacer que había que terminar. **Ese trabajo de terminación ya está hecho y probado**: hoy el sistema
funciona de punta a punta sobre una red de pruebas (se puede dar de alta una noche, venderla, revenderla
con tu porcentaje, validar el check-in en recepción, quemar lo que no se vende y verlo todo en tu panel).
Lo que queda por presupuestar es el bloque de la fase pública.

Esfuerzo del proyecto, por bloques, en días de trabajo `[SUPUESTO]`:

| Bloque | Qué incluye | Días `[SUPUESTO]` | Estado |
|---|---|---|---|
| Base de datos y entorno | Una sola base de datos y un entorno que se puede levantar desde cero | 4–6 | **Hecho** |
| Contrato de las noches | Royalties por tipo de habitación, impedir reventas a precio simbólico, bloqueo tras el check-in y despliegue | 6–8 | **Hecho** |
| Acceso y seguridad | Entrada con doble factor obligatorio para ti y para recepción, y cierre de los accesos que estaban abiertos | 6–8 | **Hecho** |
| Compra y reventa | Separar la compra de una noche nueva de la compra de una reventa, y garantizar que lo que el cliente firma es lo que aprueba | 4–6 | **Hecho** |
| Quemado, avisos y correos | Que el quemado de las 12:00 funcione solo, avisos al móvil y envío de correos fiable | 5–7 | **Hecho** |
| Vigilancia del sistema | Avisos automáticos si la red se queda muda o se acaba el saldo para operar | 3–4 | **Hecho** |
| Dashboard | Las gráficas que pediste: ventas por mes, por tipo de habitación y ranking de las más revendidas | 3–4 | **Hecho** |
| Accesibilidad | Que la web cumpla el estándar de accesibilidad que prometimos | 2–3 | **Hecho** |
| Documentación | Dejar toda la documentación cuadrada con lo que hace el sistema | 4–5 | **Hecho** |
| Pruebas y verificación | Ciclo completo probado de verdad, prueba de carga y automatización | 4–6 | **Hecho** |
| **Subtotal terminado** | | **41–57** | |
| Fase pública, si eliges la opción B | Despliegue en Polygon, verificación pública del contrato, presupuesto de gas medido y acompañamiento del dictamen legal | `[DÍAS]` | **Pendiente de tu decisión (punto 7)** |
| **Total** | | **`[DÍAS]`** `[SUPUESTO]` | |

Traducido a precio, con nuestra tarifa de `[TARIFA]` €/día, el trabajo terminado queda en
**`[IMPORTE]` €** `[SUPUESTO]`, y la fase pública se presupuesta aparte cuando decidas el punto 7.

## 2. ¿Cuándo lo tenéis?

**Junio no es alcanzable.** El calendario arrancaba en septiembre y, con el alcance que aprobaste
(subastas no, pero sí chat con IA, avisos al móvil, pases de Apple y Google, panel completo y
accesibilidad), no llegamos a la temporada. Preferimos decírtelo ahora y no en mayo.

Lo que sí podemos comprometer:

| Hito | Contenido | Fecha `[FECHA]` |
|---|---|---|
| H1 ✅ | Se crea inventario, se vende una noche y se revende, con el dinero y los royalties cuadrando | **Terminado y probado** |
| H2 ✅ | Recepción con doble factor y resguardo que no se puede usar dos veces | **Terminado y probado** |
| H3 ✅ | Quemado automático, avisos al móvil, dashboard con gráficas y accesibilidad | **Terminado y probado** |
| H4 ✅ | Verificación completa (ciclo real, carga y recuperación) y documentación de entrega | **Terminado; cierre documental en curso** |
| H5 | Demostración contigo y tu equipo sobre la red de pruebas | `[FECHA]` |
| H6 | Fase pública (solo si eliges la opción B) | `[FECHA]` |

Si necesitas estar vendiendo en temporada alta y eliges la opción B, la vía realista es **abrir con el
sistema actual en la red de pruebas para enseñarlo y validarlo**, y saltar a Polygon con el bloque H6
presupuestado aparte.

## 3. ¿Cuánto sale al mes de mantenimiento?

Desglose de costes recurrentes `[SUPUESTO]`:

| Concepto | Coste estimado | Nota |
|---|---|---|
| Servidor (hosting) | 15–40 €/mes | Una máquina pequeña basta para tu volumen |
| Base de datos | 0–25 €/mes | Puede vivir en el mismo servidor |
| Redis (colas y bloqueos) | 0–15 €/mes | Puede vivir en el mismo servidor |
| Conexión a la red blockchain | 0–50 €/mes | Empieza gratis; se paga al crecer el tráfico |
| Envío de correos | 0–20 €/mes | Con el volumen de un hotel, casi siempre gratis |
| Dominio | ~1 €/mes | 12 € al año |
| Apple Developer (pases Wallet) | ~8 €/mes | 99 € al año, obligatorio para los pases de Apple |
| Google Wallet | 0 € | Gratuito |
| Gas de la red | Variable | **Lo paga el comprador** en cada compra y reventa; tú pagas el alta y el quemado |
| **Total** | **`[IMPORTE]` €/mes** `[SUPUESTO]` | Sin contar el gas del alta, que mediremos al definir la red |

Sobre el gas, que es lo que preguntabas: en Polygon cada operación cuesta céntimos y el diseño hace que
**el comprador pague la suya**. Tu coste es dar de alta las noches y quemar las que no se venden. Antes
de firmar nada te daremos ese número **medido** (no estimado) sobre tu volumen real, con el precio de gas
del momento: es el único coste del sistema que no se puede cerrar hoy sin saber la red y el número de
habitaciones que vas a poner en venta.

## 4. ¿Qué más necesitáis de mí?

Cuatro cosas, y te digo también qué pasa si no llegan, para que no haya sorpresas:

| # | Qué necesitamos | Para qué sirve | Si no llega |
|---|---|---|---|
| 1 | **Las tres fotos definitivas** de simple, doble y suite | El catálogo y las fichas de cada noche | Se queda con las imágenes provisionales de relleno: la web funciona, pero no luce como tu hotel |
| 2 | **Dos personas de confianza** que firmen contigo las operaciones sensibles, y **quién guarda las claves** y cómo | Las tres firmas de las que dos bastan (multisig) y la custodia de la wallet del hotel | La gobernanza se queda en una sola dirección de administración: si esa clave se pierde o se filtra, no hay red de seguridad. Es lo que más riesgo tiene hoy |
| 3 | **Datos de tu sistema de gestión hotelera (PMS)**: qué programa usas y si permite conectarse | Automatizar el aviso de que la estancia se ha validado | El registro de viajeros se sigue haciendo a mano en el mostrador, como ahora; **la web no toca esos datos en ningún caso** |
| 4 | **Una persona en recepción** para probar el check-in | Validar el escaneo del resguardo con el personal real antes de abrir | El check-in queda probado por nosotros, no por quien lo va a usar cada día |

Sobre la red: **no necesitamos nada de ti para lo entregado** (funciona en red privada). Solo si quieres
el salto a Polygon (punto 7) hacen falta el presupuesto de gas y el dictamen legal.


## 5. Lo que la revisión destapó (y cómo está hoy)

Para que no te lleves sorpresas, esto es lo que apareció al revisar, y su estado actual:

| Lo que encontramos | Estado hoy |
|---|---|
| **Había dos versiones del sistema a la vez**: una que se desplegaba y otra la que usaba la web | **Corregido**: hay una sola |
| **Los informes de rendimiento y de la red de pruebas no eran reales** (se habían generado con un simulador) | **Retirados y rehechos midiendo el sistema**, incluidos los números que no nos favorecen (ver punto 6) |
| **Había claves y contraseñas de administración dentro del código** | **Eliminadas**: sin las claves correctas el sistema no arranca, y hay un control automático que impide que vuelvan |
| **El resguardo de check-in se podía fabricar para la habitación de otro** | **Cerrado**: hace falta la firma del titular y el check-in queda anotado en la cadena; el mismo resguardo no sirve dos veces |
| **El quemado de las 12:00 y los avisos al móvil no funcionaban** aunque figuraban como terminados | **Funcionan y están probados** con el ciclo completo |
| **La web guardaba datos personales** (direcciones IP, correos) aunque decíamos que no | **Reducido al mínimo** y la web **no recoge datos de viajeros** |

## 6. Lo que decimos de nuestro propio sistema aunque no nos favorezca

Nos parece justo que lo sepas, porque va a estar en la entrega:

- **Aguanta bien 50 compradores a la vez** (medido: ninguna petición fallida y respuesta en 172 ms de
  media-alta). **Con 200 a la vez en un solo servidor no aguanta**: falla un tercio de las peticiones por
  saturación. Se arregla dimensionando la base de datos y poniendo una caché delante, y lo tenemos
  identificado y presupuestable.
- **No todas las partes del programa tienen el mismo nivel de pruebas automáticas**: la parte de datos y
  contratos está muy cubierta; la de pantallas, menos. Está medido y anotado, y no lo vamos a disfrazar.
- **El dictamen legal de criptoactivos y el tema fiscal no están hechos**: son de la fase pública y los
  tiene que firmar un abogado, no nosotros.

## 7. Qué te entregamos y qué costaría Polygon

**Lo que te entregamos** (ya está hecho, probado y documentado): la plataforma completa funcionando en
una **red privada de pruebas**. Es decir, la tienda con sus filtros y sus tres idiomas, la compra y la
reventa con tu porcentaje, el resguardo del cliente, el check-in de recepción con doble factor, el
quemado automático de las noches que no se venden, los avisos al móvil, tu panel con las gráficas y el
histórico de ventas. Todo eso puedes verlo, tocarlo y enseñarlo.

**Lo que la red privada no es**: una red donde puedas **cobrar a tus clientes de verdad**. Es el entorno
correcto para construir y validar, y así te lo estamos entregando.

**Si quieres vender al público**, el camino es Polygon y es un **bloque presupuestado aparte**
`[IMPORTE]` `[SUPUESTO]`, que incluye:

1. El despliegue real del contrato y su verificación pública.
2. El **presupuesto de gas medido** (no estimado) para dar de alta tus noches y quemar las que no se
   vendan, con el precio del momento y tu volumen real.
3. El acompañamiento del **dictamen legal y fiscal** (que firma un abogado, no nosotros).
4. La conexión a la red en producción, con sus copias de seguridad y su vigilancia.

**No hace falta que decidas eso ahora**: lo que te pedimos es que valides lo entregado y que nos digas si
quieres que presupuestemos ese bloque H6 para la próxima temporada. Si dices que sí, te damos el número
cerrado antes de empezar.

## 8. Lo que NO incluye este presupuesto

- Las **subastas** para la suite: segunda fase, como acordamos.
- Los **metadatos en IPFS/Arweave** (descentralizar las fotos y fichas de las noches): segunda fase.
- El **dictamen legal de criptoactivos (MiCA) y el asesoramiento fiscal**: trabajo aparte que hay que
  hacer **antes de vender al público** y lo firma un abogado, no nosotros.
- El **registro de viajeros**: se sigue haciendo donde se hace hoy, en tu mostrador.
- Los **avisos al móvil**: funcionan, pero necesitan que el cliente acepte recibirlos; no son mensajes
  masivos ni campañas de marketing.
- **Polygon y el gas de producción**: es el bloque H6 del punto 7, presupuestado aparte.  

---

Cualquier cosa me llamas y lo vemos en persona. Y si te parece, la semana que viene te enseño lo que hay
funcionando hoy, aunque sea en red de pruebas, para que veas por dónde va.

Un saludo,
**[tu nombre]**
[agencia]

---

## Notas internas (no enviar)

- **Campos que faltan** y son del responsable: `[TARIFA]`, `[IMPORTE]` (trabajo terminado, cuota mensual
  y bloque H6 de Polygon), `[FECHA]` de la demostración y el nombre/agencia. Los rangos de días son
  estimaciones de orden de magnitud derivadas de los bloques de `DECISIONES-AUDITORIA-V5.md` §5:
  contrastarlos con el histórico real antes de enviar.
- **El punto 7 se ha reescrito por decisión del responsable (M9)**: la red privada es **el entregable** y
  Polygon un **bloque presupuestado aparte**. Ya no se le pide a Carlos que elija entre dos caminos
  equivalentes; se le entrega lo que funciona y se le ofrece el salto con precio. El brief pedía Polygon
  explícitamente, así que ese bloque es la respuesta a su petición original: sigue sobre la mesa, ahora
  con su coste separado.
- **El punto 5 ya no es un borrador**: los seis hallazgos están corregidos y verificados (M2–M8). Se
  mantienen en la carta porque explican por qué el plazo cambió.
- **El punto 6 es una decisión de honestidad deliberada**: publicar el límite de 200 usuarios y el hueco
  de cobertura nos expone, pero sostiene el criterio del proyecto («lo que se promete, se mide»). Si el
  responsable prefiere moverlo a una conversación presencial, es una decisión suya, no una omisión.
- **Si Carlos aprueba el bloque H6**: la lista de comprobaciones de `docs/COMPLIANCE.md` §7 pasa a ser el
  plan de trabajo con abogado y asesor, y hay que revisar D-01, D-11 y D-12 (parámetros de cadena y fase
  legal).
