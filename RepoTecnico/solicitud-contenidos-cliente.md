# Contenidos que faltan del hotel — solicitud al cliente

**Para**: Hotel Marina del Sol · **De**: equipo del proyecto · **Fecha**: 2026-10-08

El asistente de la web y el manual del huésped ya están **en producción**, pero solo pueden responder
con lo que saben del hotel. Hoy, cuando les falta un dato, **no se lo inventan**: lo dicen y remiten a
recepción. Estas son las preguntas que faltan para que puedan contestar de verdad.

> **Actualización (2026-10-08).** Buena parte de lo que iba a pedirse **ya está escrito**: los
> procedimientos que dependen del sistema (el resguardo QR, la entrada y la salida, los extras, la
> reventa con su comisión) se han redactado a partir del **funcionamiento real** y ya están publicados
> (release v41). Por eso este documento ha adelgazado: **lo que sigue abajo es solo lo que decide el
> hotel**, más las confirmaciones que no se pueden deducir del sistema.

---

## Cómo responder

No hace falta ningún formato especial: basta con contestar este documento por partes, en un correo.

- **Frases cortas** y **un dato por línea**.
- Si algo **cambia según la temporada**, indícalo (por ejemplo: «en verano, hasta las 15:00»).
- Si un dato **no está decidido o preferís no publicarlo**, escribid «no publicar»: se deja fuera y el
  asistente seguirá remitiendo a recepción en ese punto.

---

## Bloque 1 · Datos del hotel (8 apartados)

Estos datos alimentan el manual del huésped (`docs/manual-huesped.md`), que hoy es una plantilla.

### 1. Dónde está el hotel y cómo llegar · **PENDIENTE**
- Dirección exacta (calle, número, código postal, localidad).
- Cómo ponerla en el navegador (si preferís una referencia concreta, por ejemplo el nombre de una
  plaza cercana).
- ¿Hay aparcamiento? ¿Es gratis, de pago o solo para clientes? ¿Cuántas plazas?
- ¿Qué transporte público llega más cerca (autobús, tranvía, tren)?
- ¿A qué distancia está la playa y el aeropuerto?
- ¿El hotel tiene acceso adaptado para sillas de ruedas?

### 2. Entrada y salida · **solo faltan las horas del hotel**
- **Hora de entrada** (check-in).
- **Hora de salida** (check-out).
- ¿Se puede salir más tarde? ¿Cuánto cuesta?
- ¿Dónde se puede dejar el equipaje antes de entrar o después de salir?
- ¿Qué necesita el huésped para registrarse (documento, nombre, firma)?

### 3. Cómo se entra con el código QR · ✅ **RESUELTO** (escrito con el funcionamiento real)
- Confirmar el procedimiento tal y como lo explicamos: el huésped recibe su noche como una entrada
  digital en su móvil y en recepción se lee el código QR para hacer el check-in.
- ¿Qué debe hacer el huésped si el móvil se queda sin batería o el código no se ve en pantalla?

### 4. Servicios e instalaciones · **PENDIENTE**
- ¿Hay desayuno? ¿A qué hora y en qué horario? ¿Está incluido o se paga aparte? ¿Cuánto?
- ¿Hay restaurante o bar? ¿Con qué horarios?
- ¿Hay piscina? ¿En qué temporada abre? ¿Hay normas (gorro, toalla, menores)?
- **Wifi**: nombre de la red y cómo se obtiene la contraseña (¿se da en recepción? ¿está en la
  habitación?).
- ¿Hay aire acondicionado en todas las habitaciones?
- ¿Hay ascensor?
- ¿Se admiten mascotas? ¿Con qué condiciones y coste?
- ¿Hay servicio de habitaciones? ¿En qué horario?
- Cualquier otro servicio **de pago** con su precio.

### 5. Normas de la casa · **PENDIENTE**
- Horario de silencio.
- ¿Dónde no se puede fumar?
- Norma sobre visitas.
- ¿Qué pasa con las llaves o el código de la habitación?
- Política de daños y de objetos olvidados.

### 6. Si algo va mal · **solo falta a quién avisar y el horario de recepción**
- ¿A quién avisa el huésped y cómo (teléfono del mostrador, timbre, número de guardia)?
- **Horario de atención de recepción.**
- ¿Qué hace el huésped fuera de ese horario en caso de urgencia?
- Confirmar el número de emergencias (112) y si queréis añadir alguno más.

### 7. Reventa de la noche · ✅ **RESUELTO** (mecánica y comisión verificadas en el contrato)
- ¿El hotel permite que el huésped revenda su noche? ¿En qué condiciones?
- ¿Hay un plazo límite para revenderla (por ejemplo, hasta X horas antes)?
- ¿El precio lo pone el hotel o el huésped?
- Al venderse, ¿qué ocurre con la reserva y con la entrada del comprador?

### 8. Preguntas frecuentes · **solo las que dependen del hotel**
Las que más se repiten en recepción, en formato **pregunta en negrita** y respuesta debajo. Por
ejemplo: ¿puedo entrar antes de la hora?, ¿hay que dejar fianza?, ¿se puede pagar en efectivo?, ¿hay
sitio para la bicicleta?

---

## Bloque 2 · Confirmaciones de datos que ya están en el sistema

Aquí no hay que redactar nada: solo **confirmar o corregir**.

| # | Dato del sistema | Qué necesitamos |
|---|---|---|
| 1 | **Reparto de tipos de habitación.** El sistema asigna hoy: **101-115 simples, 116-130 dobles y 201-220 suites** | Confirmar que es correcto, o indicar el reparto real |
| 2 | El tipo de una habitación determina qué alternativas se ofrecen cuando la pedida no está libre | Consecuencia de lo anterior |
| 3 | La comisión de reventa (**5 % / 10 %**) está fijada **en el contrato** y es inmutable | Solo vuestro visto bueno |

---

## Bloque 3 · Lo que falta con más detalle en los casos del manual

Estos puntos aparecen dentro de los 17 casos del manual del huésped:

| Caso | Dato que falta |
|---|---|
| 1. Qué es una noche | Reparto real de tipos por habitación *(el del bloque 2)* |
| 10. Entrar con tu QR | Hora oficial de entrada |
| 11. Extras durante la estancia | Catálogo de extras del hotel y sus precios |
| 12. Salir y cerrar la cuenta | Hora oficial de salida · devolución de llaves y forma de cobro en el mostrador |
| 17. Si algo no funciona | Horario de atención de recepción |

**Ya no se piden** (resueltos con el funcionamiento real): cómo se entra con el QR, qué hacer si el
código no se ve, qué pasa al salir y cómo funciona la reventa con su comisión.

---

## Qué pasa cuando lleguen las respuestas

**No hay que cambiar código.** El procedimiento es:

1. Se rellena el texto en `docs/manual-huesped.md` y se añaden los datos en los casos.
2. Se regenera el índice de conocimiento: `corepack pnpm knowledge`.
3. Se reconstruye y publica el MCP (el índice va dentro de la imagen) y, si toca, la web.
4. Se verifica con las mismas preguntas de este documento que el asistente ya responde.

Mientras un apartado siga sin contenido, **no se indexa**: el asistente no lo usa y sigue remitiendo a
recepción, así que **no hay riesgo de que invente** información del hotel. Así se ha hecho ya con los
apartados resueltos: el manual del huésped se rellenó **solo** con lo que depende del sistema, se
regeneró el índice (**188 → 196 fragmentos**) y se publicó en la **release v41**. Lo comprobamos en
producción:

| Pregunta | Antes | Ahora |
|---|---|---|
| «¿Qué se queda el hotel de una reventa?» | «Pregunta en recepción» | «Un 5 % en simples y dobles, y un 10 % en suites» |
| «¿Tengo que firmar algo al salir?» | Sin respuesta | «No: la salida no requiere firma ni cartera. El cobro se hace en el mostrador» |

---

## Cómo responde hoy el asistente (comprobado en producción)

| Pregunta | Respuesta actual |
|---|---|
| «¿A qué hora tengo que dejar la habitación?» | «El sistema no fija ninguna hora de salida. *Manual de recepción §3*» |
| «¿Cuál es la dirección exacta del hotel?» | «…no encontrada en los manuales. Te recomiendo preguntar en recepción» |
| «¿Qué precios tienen los extras?» | «Te recomiendo preguntar directamente en recepción…» |

Se ve el efecto: **no inventa**, pero tampoco puede ayudar. Con estas respuestas podrá.
