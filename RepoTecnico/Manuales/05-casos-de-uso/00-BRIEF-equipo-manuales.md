# BRIEF del equipo de manuales — Manuales por caso de uso

> **Léelo entero antes de escribir una sola línea.** Este fichero es el contrato común de los cinco
> roles (TÉCNICO, LITERARIO, CREATIVO, PDF, INTEGRADOR). Si algo de aquí choca con tu criterio,
> gana este brief: la coherencia entre 32 manuales vale más que la preferencia de cada uno.

Proyecto: **Hotel Marina del Sol** — plataforma de noches de hotel tokenizadas (monorepo
`hotel-room-mcp-trazable-DSH`). El sistema ya existe y funciona; los manuales **describen lo que
hay**, no lo que nos gustaría que hubiera.

---

## 0. Reglas de oro

1. **No inventes funciones.** Si no lo puedes ver en el código (`ruta:línea`) o en
   `docs/CASOS-DE-USO.md`, no lo escribas. Lo dudoso se marca `(pendiente de confirmar)`.
2. **Lenguaje coloquial.** El manual literal lo tiene que entender la recepcionista, el dueño del
   hotel y un cliente que nunca ha usado cripto. Frases cortas. Cero jerga sin explicar.
3. **Un caso de uso = un manual.** No mezcles dos CU en un fichero ni partas uno en dos.
4. **Nada de promesas.** El sistema está en **red de pruebas**: no se vende al público todavía.
5. **Español de España**, tuteo neutro, sin anglicismos innecesarios. Los términos técnicos
   inevitables (wallet, token, blockchain) se explican la primera vez entre paréntesis.

---

## 1. Catálogo canónico de los 32 casos de uso

El orden de esta tabla **es** el orden de iniciación del sistema. Respétalo.

| # | CU | Slug (URL / fichero) | Título llano (H1) | Bloque | Actor | Fuente |
|---|----|----------------------|-------------------|--------|-------|--------|
| 1 | CU-16 | `cu-16-roles` | Dar de alta a quien puede tocar el sistema (roles y propiedad) | `01-iniciacion` | DEFAULT_ADMIN | `docs/CASOS-DE-USO.md:868` |
| 2 | CU-01 | `cu-01-acceso-back-office` | Entrar al panel del hotel con la cartera y el rol correcto | `01-iniciacion` | Operador back-office | `docs/CASOS-DE-USO.md:139` |
| 3 | CU-12 | `cu-12-royalty` | Decidir cuánto se queda el hotel en cada reventa | `01-iniciacion` | ROYALTY_ADMIN | `docs/CASOS-DE-USO.md:659` |
| 4 | CU-02 | `cu-02-mintear-noche` | Poner una noche a la venta (crear la ficha digital) | `02-inventario` | MINTER | `docs/CASOS-DE-USO.md:189` |
| 5 | CU-17 | `cu-17-onboarding-web3` | Conectar la cartera y ponerse en la red correcta | `03-onboarding-y-descubrimiento` | Visitante/Comprador | `docs/CASOS-DE-USO.md:912` |
| 6 | CU-04 | `cu-04-catalogo` | Ver y filtrar las noches disponibles | `03-onboarding-y-descubrimiento` | Visitante | `docs/CASOS-DE-USO.md:256` |
| 7 | CU-09 | `cu-09-historico` | Mirar el histórico público de ventas | `03-onboarding-y-descubrimiento` | Cualquier visitante | `docs/CASOS-DE-USO.md:531` |
| 8 | CU-08 | `cu-08-asistente-ia` | Pedirle una noche al asistente y que prepare la compra | `03-onboarding-y-descubrimiento` | Comprador (chat) | `docs/CASOS-DE-USO.md:478` |
| 9 | CU-05 | `cu-05-compra-primaria` | Comprar una noche al hotel | `04-ventas` | Comprador | `docs/CASOS-DE-USO.md:307` |
| 10 | CU-06 | `cu-06-listar-reventa` | Poner mi noche en reventa (y quitarla) | `04-ventas` | Propietario | `docs/CASOS-DE-USO.md:366` |
| 11 | CU-07 | `cu-07-compra-secundaria` | Comprar una noche que otro cliente revende | `04-ventas` | Comprador secundario | `docs/CASOS-DE-USO.md:416` |
| 12 | CU-10 | `cu-10-aviso-email` | Avisar al hotel por email cada vez que hay una venta | `05-postventa` | Mini-worker (sistema) | `docs/CASOS-DE-USO.md:570` |
| 13 | CU-11 | `cu-11-dashboard` | Ver las métricas del negocio en el panel | `05-postventa` | Admin autenticado | `docs/CASOS-DE-USO.md:621` |
| 14 | CU-13 | `cu-13-caducadas` | Retirar las noches del hotel que ya han caducado | `06-operacion-y-ciclo-de-vida` | BURNER | `docs/CASOS-DE-USO.md:701` |
| 15 | CU-15 | `cu-15-retirar-fondos` | Pasar el dinero recaudado a la cuenta del hotel | `06-operacion-y-ciclo-de-vida` | TREASURER_ROLE | `docs/CASOS-DE-USO.md:825` |
| 16 | CU-14 | `cu-14-pausa` | Parar el sistema en una emergencia y volver a arrancarlo | `06-operacion-y-ciclo-de-vida` | PAUSER | `docs/CASOS-DE-USO.md:759` |
| 17 | CU-PR-01 | `cu-pr-01-faucet` | Conseguir dinero de prueba (solo en pruebas) | `07-entorno-de-pruebas` | Tester/CI | `docs/CASOS-DE-USO.md:962` |
| 18 | CU-30 | `cu-30-acceso-owner` | Que el dueño lo vea y lo pueda todo | `08-operacion-hotelera-v2` | Owner | `RepoTecnico/incremento_v2/casos_uso_incremento.md:18` |
| 19 | CU-31 | `cu-31-panel-dia-recepcion` | La pantalla del día en recepción | `08-operacion-hotelera-v2` | Recepcionista | `RepoTecnico/incremento_v2/casos_uso_incremento.md:62` |
| 20 | CU-32 | `cu-32-buscar-reserva` | Encontrar una reserva con el código de recuperación | `08-operacion-hotelera-v2` | Recepcionista | `RepoTecnico/incremento_v2/casos_uso_incremento.md:105` |
| 21 | CU-33 | `cu-33-checkin-qr` | Dar entrada al cliente escaneando su resguardo | `08-operacion-hotelera-v2` | Recepcionista | `RepoTecnico/incremento_v2/casos_uso_incremento.md:145` |
| 22 | CU-34 | `cu-34-checkout` | Dar salida y cerrar la cuenta de la habitación | `08-operacion-hotelera-v2` | Recepcionista | `RepoTecnico/incremento_v2/casos_uso_incremento.md:169` |
| 23 | CU-35 | `cu-35-cargos-adicionales` | Apuntar los extras del huésped (minibar, desayuno…) | `08-operacion-hotelera-v2` | Recepcionista | `RepoTecnico/incremento_v2/casos_uso_incremento.md:216` |
| 24 | CU-36 | `cu-36-reventa-huesped` | Que el huésped publique, cambie o retire su reventa | `08-operacion-hotelera-v2` | Huésped | `RepoTecnico/incremento_v2/casos_uso_incremento.md:243` |
| 25 | CU-37 | `cu-37-avisos-reventa` | Avisar al huésped cuando su reventa se mueve | `08-operacion-hotelera-v2` | Huésped | `RepoTecnico/incremento_v2/casos_uso_incremento.md:283` |
| 26 | CU-40 | `cu-40-menu-wallet` | El menú de la cartera y del usuario | `09-back-office-y-gobierno-v3` | Cualquier usuario | `RepoTecnico/incremento_v3/casos_uso_incremento.md:17` |
| 27 | CU-41 | `cu-41-seccion-sistemas` | La sección «Sistemas» (solo para el dueño) | `09-back-office-y-gobierno-v3` | Owner | `RepoTecnico/incremento_v3/casos_uso_incremento.md:67` |
| 28 | CU-42 | `cu-42-gestion-usuarios` | Dar de alta, cambiar y quitar usuarios de la plataforma | `09-back-office-y-gobierno-v3` | Owner | `RepoTecnico/incremento_v3/casos_uso_incremento.md:99` |
| 29 | CU-43 | `cu-43-gobernar-contrato` | Gobernar el contrato (pausar, roles, royalty, propiedad) | `09-back-office-y-gobierno-v3` | Owner | `RepoTecnico/incremento_v3/casos_uso_incremento.md:144` |
| 30 | CU-44 | `cu-44-finanzas-retirar` | Ver las finanzas del hotel y retirar el dinero | `09-back-office-y-gobierno-v3` | Owner/Treasurer | `RepoTecnico/incremento_v3/casos_uso_incremento.md:169` |
| 31 | CU-45 | `cu-45-operaciones` | Ver qué está pasando ahora mismo (operaciones) | `09-back-office-y-gobierno-v3` | Owner | `RepoTecnico/incremento_v3/casos_uso_incremento.md:191` |
| 32 | CU-46 | `cu-46-seguridad-operador` | Proteger la cuenta del que manda | `09-back-office-y-gobierno-v3` | Operador | `RepoTecnico/incremento_v3/casos_uso_incremento.md:212` |

> **Nota:** no existe `CU-03` (el antiguo faucet se reclasificó como `CU-PR-01`). Por eso son **32**,
> no 33.

---

## 2. Rutas de salida (no te salgas de aquí)

```
RepoTecnico/Manuales/05-casos-de-uso/<NN>-<bloque>/CU-XX-<slug>.md   ← TÉCNICO
docs/Manuales/05-casos-de-uso/<NN>-<bloque>/CU-XX-<slug>.md          ← LITERAL (fuente de la web)
docs/imagenes/doc-<slug>.svg                                         ← CREATIVO (infografía)
RepoTecnico/Manuales/05-casos-de-uso/README.md                       ← índice de bloques
docs/Manuales/05-casos-de-uso/README.md                              ← índice literal
```

- El **nombre de fichero** es `CU-<XX>-<cola-del-slug>.md` (p. ej. `CU-16-roles.md`,
  `CU-PR-01-faucet.md`).
- La **imagen** de cada CU se llama `doc-<slug>.svg` (p. ej. `doc-cu-16-roles.svg`). Ese nombre
  **debe** existir en `docs/imagenes/` o el test guardián falla.
- `docs/imagenes/` **solo** admite ficheros que empiecen por `doc-` (más las fotos de habitación y
  contenido ya existentes). No crees otros nombres.
- En los manuales, las imágenes se referencian **siempre** como `imagenes/<fichero>.svg`, sin
  `../`, aunque el manual esté en una subcarpeta. El generador resuelve por nombre de fichero.

---

## 3. Plantilla del MANUAL TÉCNICO (rol TÉCNICO)

Fuente de verdad: **el código real**. Cada afirmación relevante lleva `ruta:línea`. Usa
`##` → `###` → `####`. Extensión orientativa: 120–220 líneas. No rellenes por rellenar.

```markdown
# CU-XX · <Título llano> — Manual técnico

> Bloque <N> · <nombre del bloque> · Actor: <actor> · Requisitos: <RF/RNF>

## 1. Ficha y trazabilidad
- Objetivo, actor primario y secundarios.
- Requisitos que cubre y decisión(es) de diseño asociadas.
- Precondición, disparador y postcondición.
- Dónde vive: rutas de UI, endpoints, contrato, worker.

## 2. Recorrido técnico
### 2.1 Camino principal
Pasos numerados, cada uno con `ruta:línea` del punto de entrada real.
### 2.2 Validaciones
### 2.3 Efectos on-chain / persistencia

## 4. Contrato, API y datos
### 4.1 Funciones / endpoints
### 4.2 Eventos y errores canónicos
### 4.3 Estructuras de datos y almacenamiento

## 5. Casos límite y errores
Tabla: situación → error/selector → dónde se comprueba (`ruta:línea`).

## 6. Pruebas y evidencia
Tests reales que lo cubren (`ruta:línea`), y qué NO está cubierto.

## 7. Pendiente de confirmar
Lista honesta de huecos. Si no hay, escribe «Nada pendiente».
```

**Dónde buscar el código** (grep/read, no adivines):
- Contratos: `packages/contracts/src/*.sol` (`HotelNights.sol`, `Faucet.sol`, `HotelNightsBootstrap.sol`).
- Front: `apps/web/src/app/**` (rutas) y `apps/web/src/app/api/**` (endpoints).
- Worker/avisos: `apps/worker/src/**` (`mailer.ts`, `main.ts`, `retention-scheduler.ts`).
- MCP/asistente IA: `apps/mcp/src/tools/tools.ts`, `apps/mcp/src/chain/**`, `apps/web/src/app/asistente`.
- Autenticación: `apps/web/src/app/api/auth/**`, `apps/web/src/app/admin/**`.

Si un CU del incremento v2/v3 no tiene implementación visible en el código, **dilo** en «Pendiente
de confirmar» y describe el flujo según `casos_uso_incremento.md`. No lo maquilles.

---

## 4. Plantilla del MANUAL LITERAL (rol LITERARIO)

Este fichero es la **fuente de la web** (`/ayuda`). Debe cumplir la plantilla al pie de la letra o
los tests guardianes fallan. Extensión orientativa: 100–180 líneas.

**Estructura obligatoria:**

```markdown
# CU-XX · <Título llano>

> En una frase: <el objetivo del caso de uso contado como se lo contarías a un amigo>.

![Infografía del CU-XX: <descripción breve>](imagenes/doc-<slug>.svg)

## 1. Para qué sirve

<2–4 párrafos cortos>

## 2. Quién puede hacerlo

<Lista o párrafo. Explica el rol en palabras llanas.>

## 3. Antes de empezar

<Lista de comprobaciones previas, en lenguaje llano.>

## 4. Paso a paso

1. <Acción concreta: qué botón, qué pantalla, qué se ve.>
2. ...
3. ...

## 5. Qué ves cuando sale bien

<Lista de señales visibles: mensajes, pantallas, correos, cifras.>

## 6. Si algo va mal

| Lo que ves | Qué significa | Qué hacer |
|-----------|---------------|-----------|
| ... | ... | ... |

## 7. Un ejemplo de verdad

<Un caso narrado con nombres inventados, números redondos y sin datos personales reales.>

## 8. Preguntas frecuentes

### ¿<pregunta>?

<respuesta breve>
```

**Reglas de estilo (obligatorias):**

- **Frases cortas.** Si una frase pasa de 20 palabras, PÁRTELA.
- **Voz activa y tú.** «Pulsa **Comprar**», no «el botón de compra debe ser pulsado».
- **Nada de jerga sin traducir.** La primera vez: *wallet (la cartera digital del móvil)*,
  *token (la ficha digital de una noche)*, *blockchain (el libro de cuentas público)*.
- **Cero markdown raro.** Solo `**negrita**`, `*cursiva*`, `` `código` ``, listas simples,
  tablas, enlaces e imágenes. Nada de HTML, ni notas al pie, ni bloques anidados.
- **Listas limpias.** Un solo nivel de anidamiento como máximo; el conversor de la web es propio.
- **Sin promesas comerciales.** Nada de «podrás ganar dinero»; sí «el hotel se queda un 10 %».
- **Coherencia numérica**: **el manual técnico del CU manda**. El código vigente fija el royalty
  **al dar de alta la noche, por tipo de habitación (5 % simple y doble, 10 % suite) y ya no se
  cambia**; la caducidad se calcula en **UTC**; el lote de retirada es de **50 noches**. Si el
  manual técnico contradice estas cifras o cualquier afirmación del SRS, **gana el manual técnico**
  (es la realidad verificada en código). Si el CU no usa un dato, no lo menciones.

**Ejemplo de cómo SÍ y cómo NO:**

| ❌ No | ✅ Sí |
|-------|-------|
| «El operador procederá a la validación del tokenId derivado.» | «El sistema comprueba que esa noche no esté ya a la venta.» |
| «Se invoca `checkAvailability` del MCP.» | «El asistente pregunta al sistema si esa noche está libre.» |
| «Revertirá con `DuplicateNight` por colisión de unicidad.» | «Saldrá un aviso: esa noche ya existe. No se puede poner dos veces.» |

**Diagramas Mermaid:** donde aporten claridad, añade un bloque ```mermaid``` (flujo de pasos,
estados). La web no los dibuja todavía, así que **además** deja el marcador de imagen del apartado
siguiente cuando el diagrama merezca infografía.

---

## 5. Infografías (rol CREATIVO)

El LITERARIO deja en el preámbulo la referencia a su infografía (una por CU). El CREATIVO la dibuja.

- **Fichero:** `docs/imagenes/doc-cu-XX-<cola>.svg` (debe coincidir con lo que referencia el manual).
- **Formato:** SVG vectorial, `viewBox="0 0 1600 900"`, sin recursos externos ni fuentes
  incrustadas. `role="img"`, `<title>` y `<desc>` en español (accesibilidad).
- **Contenido mínimo:** banda superior con `CU-XX · <título llano>`; 3–5 pasos en tarjetas unidas
  por flechas; franja inferior con tres etiquetas: **Quién**, **Qué consigues**, **Si falla**.
- **Texto grande y legible** (≥ 22 px en el viewBox), poco texto por tarjeta.

**Paleta (solo estos colores):**

| Uso | Token | Hex |
|-----|-------|-----|
| Fondo | `sand` | `#FBF6EC` |
| Superficie | `shell` | `#FFFFFF` |
| Superficie 2 | `sand-2` | `#F3EAD8` |
| Borde | `line` | `#E7DCC6` |
| Texto | `ink` | `#1B2327` |
| Texto suave | `ink-soft` | `#4C575C` |
| Acción / título | `sea` | `#0E5A63` |
| Acción oscura | `sea-deep` | `#08424A` |
| Acento cálido | `terracotta` | `#C0542E` |
| Aviso | `warning` + `warning-bg` | `#8A5A12` / `#F7E9C9` |
| Correcto | `success` + `success-bg` | `#2F6B4F` / `#E3EFE7` |
| Error | `error` + `error-bg` | `#9E2B1F` / `#F8E3DE` |
| Detalle premium | `gold` | `#C68A2E` |
| Registro oscuro | `ocean` / `champagne` | `#0F2C3F` / `#C5A880` |

Tipografías: `Fraunces, Georgia, 'Times New Roman', serif` para títulos;
`'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif` para texto.
Puedes leer un SVG ya existente en `docs/imagenes/` (p. ej. `doc-compra-tres-pasos.svg`) para copiar
el estilo. **No toques las imágenes existentes.**

---

## 6. Restricciones de la tubería (lo que rompe los tests)

La web genera `manuals.generated.ts` desde estos `.md` y **dos tests guardianes** lo comprueban
(`apps/web/src/lib/help/manuals-sync.test.ts` e `apps/web/src/lib/images-naming.test.ts`).

1. **Preámbulo = cita + UNA imagen.** Exactamente **un** bloque `>` en todo el preámbulo (antes del
   primer `##`). La imagen de la infografía va justo después.
2. **Todas las secciones son `##` numeradas** (`## 1.`, `## 2.`…) y las subsecciones `###`. El
   generador deriva el ancla del número.
3. **Toda imagen referenciada existe** en `docs/imagenes/` y se referencia como `imagenes/<fichero>`.
4. **Nada de markdown sin convertir** en el HTML final: no dejes `**` sueltos, ni tablas mal
   formadas, ni encabezados dentro de listas.
5. **El índice de `docs/imagenes/README.md` debe mencionar todos los ficheros nuevos** (el test lo
   exige). Lo actualiza el INTEGRADOR, no el CREATIVO.
6. **El H1 es la primera línea** y `docs/pdf/` y `apps/web/public/manual/` se regeneran solos: no
   los edites a mano.

---

## 7. Entrega por rol (resumen)

| Rol | Escribe | No toca |
|-----|---------|---------|
| TÉCNICO | `RepoTecnico/Manuales/05-casos-de-uso/**` | la web, los tests |
| LITERARIO | `docs/Manuales/05-casos-de-uso/**` | `docs/imagenes/`, la web, los tests |
| CREATIVO | `docs/imagenes/doc-cu-*.svg`, `doc-mapa-iniciacion-sistema.svg` | los `.md` |
| PDF | `docs/pdf/**`, `apps/web/public/manual/**` | los `.md` fuente |
| INTEGRADOR | `apps/web/scripts/build-manuals.mjs`, `manuals.generated.ts`, `/ayuda`, tests, READMEs | el contenido de los manuales |

*Brief del equipo de manuales · Hotel Marina del Sol · 32 casos de uso en 9 bloques.*
