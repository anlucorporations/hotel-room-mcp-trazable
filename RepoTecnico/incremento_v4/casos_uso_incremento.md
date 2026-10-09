# Casos de uso · Incremento v4 (Asistente IA en toda la plataforma)

> **Proyecto**: Hotel Marina del Sol (`hotel-room-mcp-trazable-DSH`)
> **Base**: `RepoTecnico/incremento_v4/requerimientos_incremento.md` (RF-61…RF-63, RNF-47…RNF-52).
> **Criterio**: un caso de uso por objetivo de actor; criterios de aceptación **Gherkin** para el
> comportamiento y **EARS** para las restricciones del sistema; todos los criterios son testeables.

Actores: **Visitante** (sin wallet), **Huésped** (navegando la web pública) y **Personal de recepción**
(usa la suite `/recepcion`). El asistente es el mismo en los tres casos.

---

## CU-51 · Consultar al asistente desde cualquier página

- **Actor**: Visitante / Huésped / Personal de recepción.
- **Precondición**: la vista pertenece a la web pública o a la suite de recepción (plantilla
  `PublicShell`) y no es la propia página del asistente.
- **Flujo principal**:
  1. El usuario abre cualquier vista de la plataforma.
  2. El sistema muestra el disparador del asistente según el viewport (flotante en escritorio,
     avatar en la cabecera en móvil).
  3. El usuario activa el disparador.
  4. El sistema despliega el panel con la conversación y el foco en la caja de texto.
  5. El usuario cierra el panel con `Escape` o con el botón de cierre; el foco vuelve al disparador.
- **Flujos alternativos**:
  - **A1 — Está en `/asistente`**: no hay disparador (la página ya es la conversación).
  - **A2 — Cambia de ruta con el panel abierto**: el panel se cierra solo.
- **Trazabilidad**: RF-61, RF-61.1, RF-61.2, RF-61.3, RF-61.4, RF-62, RNF-48.

**Criterios de aceptación (Gherkin)**

```gherkin
Dado un visitante en la home con un viewport de escritorio (>=768 px)
Cuando la página termina de cargar
Entonces ve el icono flotante del asistente en la esquina inferior derecha
Y el icono sigue visible después de hacer scroll

Dado un visitante en la home con un viewport móvil (<768 px)
Cuando la página termina de cargar
Entonces ve el avatar del asistente en la cabecera
Y no ve el icono flotante de escritorio

Dado el panel del asistente cerrado
Cuando el usuario activa el disparador
Entonces se muestra el panel con la conversación y la caja de texto
Y el disparador anuncia aria-expanded="true"

Dado el panel del asistente abierto
Cuando el usuario pulsa Escape
Entonces el panel se oculta
Y el foco vuelve al disparador

Dado un usuario en la página /asistente
Cuando la página termina de cargar
Entonces no hay icono flotante ni avatar de cabecera del asistente

Dado el lanzador flotante en escritorio
Cuando el sistema lo renderiza
Entonces usa el avatar de 80x80 px
Y la cabecera móvil y el encabezado del panel usan el avatar de 40x40 px
```

**Restricciones del sistema (EARS)**

- *El sistema deberá* montar el asistente en la plantilla compartida, de modo que esté disponible en
  todas las vistas públicas y de recepción sin cambios página por página.
- *Si* el proveedor de almacenamiento de la pestaña está bloqueado, *entonces* el sistema mostrará el
  asistente igualmente, sin memoria de conversación y sin errores visibles.

---

## CU-52 · Consultar disponibilidad y ver el resultado en la página

- **Actor**: Huésped.
- **Precondición**: el asistente está disponible y el usuario ha formulado una consulta de
  disponibilidad («¿qué habitaciones sencillas hay?», «¿está libre la 102 el 22 de junio?»).
- **Flujo principal**:
  1. El usuario envía la consulta desde el panel (o desde `/asistente`).
  2. El asistente ejecuta la herramienta de catálogo correspondiente contra el MCP.
  3. El servidor deriva la acción de página a partir de la **entrada real** de esa herramienta.
  4. El cliente navega al catálogo con el filtro en la URL y aparta el panel.
  5. El catálogo muestra la parrilla filtrada y un aviso con el filtro aplicado y el enlace para
     quitarlo.
- **Flujos alternativos**:
  - **A1 — La consulta no es de catálogo** (duda de manuales, compra): no hay acción de página y el
    usuario permanece donde está.
  - **A2 — La herramienta de catálogo falla**: no se deriva acción de página (no se filtra por una
    consulta sin respuesta) y el asistente lo comunica.
  - **A3 — URL manipulada** (`?tipo=triple`, `?desde=mañana`): el filtro inválido se descarta y el
    catálogo se muestra entero.
- **Trazabilidad**: RF-63, RF-63.1, RF-63.2, RF-63.3, RF-63.5, RNF-47, RNF-52, RT-16, RT-18.

**Criterios de aceptación (Gherkin)**

```gherkin
Dado un huésped que pregunta por "todas las habitaciones sencillas"
Cuando el asistente responde habiendo consultado listAvailableNights con type="simple"
Entonces el navegador queda en /catalogo?tipo=simple
Y el catálogo muestra el aviso "Resultados de tu consulta al asistente: Simple"

Dado un huésped que pregunta por una noche concreta (habitación 7, 2026-06-22)
Cuando el asistente responde habiendo consultado checkAvailability
Entonces el navegador queda en /catalogo?desde=2026-06-22&hasta=2026-06-22&buscar=7

Dado un huésped que pregunta por los servicios del hotel
Cuando el asistente responde habiendo consultado solo searchHotelManuals
Entonces el navegador permanece en la página en la que estaba

Dado que la herramienta de catálogo devuelve error
Cuando el asistente termina el turno
Entonces la respuesta no incluye ninguna acción de página
Y el usuario no es llevado al catálogo con un filtro sin resolver

Dado el catálogo abierto con el filtro ?tipo=suite&desde=2026-06-01&hasta=2026-06-30
Cuando el usuario pulsa "Quitar filtros"
Entonces el navegador queda en /catalogo
Y el aviso del asistente desaparece

Dado el catálogo abierto con ?tipo=triple
Cuando la página se renderiza
Entonces el filtro de tipo se ignora y se muestran todas las noches
```

**Restricciones del sistema (EARS)**

- *El sistema deberá* derivar la acción de página de la entrada de las herramientas ejecutadas con
  éxito, y **nunca** del texto generado por el modelo.
- *El sistema deberá* mantener la respuesta de `/api/assistant` compatible: `pageAction` es un campo
  **aditivo** y vale `null` cuando no procede.
- *Mientras* el catálogo no pueda leerse de la cadena, el sistema *seguirá* mostrando el aviso del
  filtro aplicado y el estado degradado, para no ocultar qué se pidió.

---

## CU-53 · Continuar la conversación después de que el asistente navegue

- **Actor**: Huésped.
- **Precondición**: existe una conversación previa y el asistente acaba de llevar al usuario a otra
  página.
- **Flujo principal**:
  1. El asistente navega al catálogo filtrado y cierra el panel.
  2. El usuario vuelve a abrir el asistente.
  3. El sistema restaura la conversación anterior (pregunta y respuesta).
  4. El usuario continúa el hilo sin repetir el contexto.
- **Flujos alternativos**:
  - **A1 — Almacenamiento no disponible o contenido corrupto**: la conversación arranca vacía; el
    asistente funciona con normalidad.
- **Trazabilidad**: RF-63.4, RT-19.

**Criterios de aceptación (Gherkin)**

```gherkin
Dado un huésped que envió "¿qué habitaciones sencillas hay?" y recibió respuesta
Cuando el asistente navega al catálogo y el huésped reabre el panel
Entonces ve su pregunta y la respuesta anterior en el hilo

Dado un almacenamiento de pestaña con contenido corrupto
Cuando el asistente se monta
Entonces la conversación arranca vacía
Y no se muestra ningún error al usuario
```

**Restricciones del sistema (EARS)**

- *El sistema deberá* conservar como máximo los últimos 20 mensajes y recortar cada mensaje a 4000
  caracteres, para no exceder el presupuesto de tokens del endpoint.
- *Si* la escritura en el almacenamiento falla, *entonces* el sistema continuará la conversación en
  pantalla sin interrumpirla.

---

## CU-54 · Acceder al asistente desde el móvil

- **Actor**: Huésped en un teléfono.
- **Precondición**: viewport `<768 px`; la vista usa la plantilla pública.
- **Flujo principal**:
  1. El usuario abre cualquier página pública.
  2. El avatar del asistente aparece en la cabecera, junto al menú de wallet.
  3. El usuario lo activa.
  4. El panel se despliega como hoja inferior, con la conversación y la caja de texto.
- **Flujos alternativos**:
  - **A1 — Menú móvil abierto**: el panel del asistente y el menú de navegación no se solapan de forma
    que impida usar el asistente (el disparador sigue siendo alcanzable).
- **Trazabilidad**: RF-61.2, RF-61.3, RF-62, RNF-48.

**Criterios de aceptación (Gherkin)**

```gherkin
Dado un huésped en un móvil (Pixel 5) en la home
Cuando la página termina de cargar
Entonces el avatar del asistente (40x40 px) es visible en la cabecera
Y su área táctil es de al menos 44x44 px

Dado el avatar del asistente en la cabecera móvil
Cuando el huésped lo activa
Entonces el panel se despliega ocupando el ancho de la pantalla en la parte inferior
Y contiene la caja de texto y el botón de envío
```

**Restricciones del sistema (EARS)**

- *El sistema deberá* exponer el disparador móvil con nombre accesible («Abrir el asistente» /
  «Cerrar el asistente») y estado `aria-expanded`.
