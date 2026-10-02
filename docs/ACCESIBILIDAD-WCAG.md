# Certificación y Directrices de Accesibilidad Web (WCAG 2.1 Nivel AA)
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 2.0.0 (rediseño «Brisa Marina» · verificación sobre la paleta real)  
> **Fecha**: 2026-10  
> **Alcance**: Fase 2 (Post-MVP)  
> **Estándar**: W3C Web Content Accessibility Guidelines (WCAG) 2.1 AA  
> **Fuente de verdad de color**: `packages/config/tailwind/preset.cjs` + `apps/web/src/lib/a11y/palette.ts`

---

## 0. Verificación sobre la paleta real (H-21, cerrado) y rediseño 2026-10

La versión 1.0.0 de este documento certificaba el contraste de colores **que no existen en el
proyecto**: `Slate-900 #0F172A` y `Emerald-700 #047857` pertenecen a la paleta por defecto de
Tailwind. Desde M7 (D-11) los tests **no pueden** volver a medir un color que no exista:

1. La paleta que se mide (`apps/web/src/lib/a11y/palette.ts`) se compara con el preset real
   cargándolo tal cual (`preset.cjs`); si divergen, la suite falla.
2. Se leen los `className` de `apps/web/src/**`: ningún color fuera de la paleta pasa el guardián, y
   cada par texto/fondo que aparece **en el mismo elemento** se mide con composición alfa
   (`bg-fern/10`) sobre las superficies declaradas.
3. Los tonos que sí estaban fuera de paleta en el código (`emerald-*`/`red-*` en la pantalla de
   recepción y en el enlace de salto) están sustituidos por tokens de marca.

**Rediseño «Brisa Marina» (2026-10)**: el sistema «Mediterráneo editorial» (arena/teal/terracota)
se sustituye por un registro **luminoso y aéreo** —porcelana fría `mist`, azur vívido `azure`,
marino profundo `navy`, coral de atención `coral`— con tipografías nuevas (Playfair Display +
Manrope, ambas con cirílico nativo). La migración se hizo token a token en **142 ficheros** (código,
guardianes, ilustraciones de `docs/imagenes`, maqueta y documentación) y la verificación se repitió
**desde cero**: la tabla de abajo son los ratios de la paleta vigente.

Ratio real de las combinaciones en uso (calculado con la fórmula de luminancia relativa de la W3C):

| Combinación | Ratio | Uso |
|---|---|---|
| `ink` sobre `shell` / `mist` / `mist-2` | 16.74 / 15.79 / 14.48 | Texto principal |
| `ink-soft` sobre `shell` / `mist` / `mist-2` | 7.60 / 7.16 / 6.57 | Texto secundario |
| `azure` / `azure-deep` sobre `shell` | 5.76 / 8.79 | Enlaces y títulos de marca |
| `coral-text` sobre `shell` / `mist` | 6.25 / 5.89 | Avisos y etiquetas |
| `shell` sobre `azure` / `azure-deep` / `coral` / `coral-text` / `fern` | 5.76 / 8.79 / 4.57 / 6.25 / 6.14 | Texto sobre acciones y etiquetas |
| `ink` sobre `amber` | 5.05 | Etiqueta premium «Suite» |
| `mist` / `shell` sobre `navy` | 13.93 / 14.77 | Registro oscuro (hero, pie, **sidebar AdminLTE**) |
| `shell` sobre `navy-soft` | 10.67 | Hover dentro del sidebar |
| `pearl` sobre `navy` / `navy-soft` | 9.72 / 7.02 | Detalle premium sobre superficie oscura |
| `success` / `warning` / `error` / `info` sobre `mist` | 5.01 / 5.32 / 6.16 / 6.35 | Estados semánticos como texto |
| `success` / `warning` / `error` / `info` sobre su fondo teñido | 4.59 / 4.98 / 5.41 / 5.72 | Bandas de estado |
| `shell` sobre `success` / `error` | 5.32 / 6.54 | Texto blanco sobre relleno de estado |
| `shell` sobre velo `navy` al **65 %** | 4.79 | Texto del hero sobre fotografía |

Todas superan el **4.5:1** de texto normal (y el 3:1 de texto grande y componentes, criterio 1.4.11:
las series de las gráficas —`azure` y `coral-text`, 5.76 y 6.25 sobre blanco— se distinguen del
fondo de la tarjeta).

**Frontera de controles (1.4.11)** — hallazgo H-7, **implementado** y mantenido en el rediseño: el
borde de `input`/`select`/`textarea` es `line-strong #6B8296` (**3,99:1** sobre `shell`, **3,77:1**
sobre `mist`, **3,45:1** sobre `mist-2`) en los **65 usos** de `border-line-strong` repartidos en
**31 ficheros** más las **11 constantes `FIELD`** compartidas. El `line #DBE7EF` da **~1,19:1** y se
conserva **solo** para filetes decorativos (exentos). Lo protege
`apps/web/src/lib/a11y/control-boundary.test.ts`, que **deriva** del contraste medido qué tokens
pueden ser frontera, exige `line-strong` por defecto y se comprobó **en falso**: devolver un solo
control a `border-line` lo pone rojo con el fichero y la clase exactos. Los pares se miden con
`node scripts/design/contrast-audit.mjs` (**50 pares** con veredicto AA/AAA, 0 por debajo de su
mínimo).

**Texto de botones «fantasma»** (observado y evaluado): los elementos `button`/`a` con
`border border-line` como estilo secundario **no se cambian** porque el criterio 1.4.11 se aplica a la
información visual *necesaria para identificar* el componente, y un botón con etiqueta visible se
identifica por su texto; el **foco** (2.4.11) sí cumple con el doble anillo porcelana + azur. Si se
quiere más afordancia, la palanca es aplicar `line-strong` también ahí.

**Combinaciones prohibidas** (medidas y documentadas en el instrumento, no aprobadas):

| Combinación | Ratio | Por qué |
|---|---|---|
| `shell` sobre velo `navy` al 35 % | 2.10 | Ni siquiera vale para texto grande: el velo mínimo es 65 % |
| `pearl` sobre blanco | 1.52 | El detalle premium solo existe sobre `navy`/`navy-soft` |
| `amber` sobre blanco | 3.31 | Detalle decorativo: nunca como texto en claro |
| `line` como frontera de control sobre `mist` | 1.19 | Incumple 1.4.11: para controles se usa `line-strong` |

---

## 1. Compromiso de Accesibilidad e Inclusión

La plataforma de reservas Web3 del Hotel Marina del Sol garantiza el acceso equitativo e independiente para todos los usuarios, incluyendo personas con discapacidad visual, auditiva, motriz o cognitiva.

---

## 2. Pilares de Conformidad Técnica

### 2.1 Perceptible (Principio 1)
- **Contraste de Color (Criterio 1.4.3)**:
  - Texto estándar: ratio mínimo de **4.5:1** (verificado sobre la paleta real: `ink #101F2C` sobre `shell #FFFFFF` alcanza **16.74:1**; `shell` sobre `azure #0F6C9C` alcanza **5.76:1**). Ver la tabla de §0.
  - Texto grande y componentes de interfaz (Criterio 1.4.11): ratio mínimo de **3.0:1**.
- **Texto Alternativo e Iconos (Criterio 1.1.1)**:
  - Todos los iconos decorativos incluyen `aria-hidden="true"` (el guardián falla si aparece un `<svg>` sin ocultar ni nombrar).
  - Iconos interactivos (botones de cerrar modal, filtros, carrito) disponen de etiqueta `aria-label` descriptiva en los 3 idiomas (ES, EN, RU).
- **Gráficas del dashboard (Criterios 1.1.1 y 1.4.1)**: cada gráfica lleva `role="img"` con nombre accesible (resumen con las cifras), leyenda en HTML con el nombre de cada serie —el color no es el único canal— y una **tabla de datos equivalente** en un `<details>` nativo.

### 2.2 Operable (Principio 2)
- **Navegación por Teclado (Criterio 2.1.1)**:
  - Toda la funcionalidad (catálogo, filtros, selector de fechas, checkout con wallet, re-descarga de resguardo) es 100% operable exclusivamente mediante teclado (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`).
  - **Sin trampas de foco (Criterio 2.1.2)**: Los modales atrapan el foco mientras están abiertos y lo devuelven al elemento detonador tras cerrarse con `Esc`.
- **Enlace de Salto Directo (Criterio 2.4.1)**:
  - Enlace "*Saltar al contenido principal*" presente al inicio del DOM, visible únicamente al recibir foco vía teclado (`focus:bg-azure-deep` con texto `shell`, 8.79:1).
- **Foco Visible (Criterio 2.4.7)**:
  - Doble anillo **porcelana + azur** (`outline: 2px solid var(--azure)` + `box-shadow: 0 0 0 4px var(--mist-2)`) obligatorio en todos los controles interactivos, con ≥3:1 contra los colores adyacentes.

### 2.3 Comprensible (Principio 3)
- **Idioma de la Página (Criterio 3.1.1)**:
  - El atributo `<html lang="...">` se sincroniza dinámicamente según la preferencia del usuario (`es`, `en` o `ru`).
  - **Tipografía cirílica**: `Playfair Display` (display) y `Manrope` (UI) se cargan con los subconjuntos `latin` **y** `cyrillic`, así que el locale RU se pinta con las fuentes de marca (ya no hay cascada de respaldo).
- **Prevención de Errores en Transacciones (Criterio 3.3.4)**:
  - El modal de checkout exige confirmación explícita previa a la firma en MetaMask, detallando la fecha de estancia, precio en POL y contravalor en EUR.

### 2.4 Robusto (Principio 4)
- **Compatibilidad con Tecnologías de Asistencia (Criterio 4.1.2)**:
  - Marcado semántico HTML5 (`<main>`, `<nav>`, `<header>`, `<footer>`, `<dialog>`).
  - Actualizaciones de precios y estados asíncronos anunciados a lectores de pantalla mediante regiones activas (`aria-live="polite"`).

---

## 3. Pruebas Automatizadas de Accesibilidad

Ejecute la suite de pruebas de accesibilidad:

```bash
pnpm --filter @hotel/web exec vitest run src/lib/a11y
```

Qué comprueba (M7, D-11; actualizado en el rediseño «Brisa Marina»):

| Bloque | Invariante |
|---|---|
| Paleta | La paleta medida es **idéntica** al preset real de Tailwind; las combinaciones declaradas superan 4.5:1; las series de las gráficas superan 3:1 sobre el fondo de la tarjeta |
| Uso real del color | Ningún `className` usa un color fuera de la paleta; todo par texto/fondo del mismo elemento cumple 4.5:1 (con composición alfa) y el emparejamiento es **por variante** (`hover:` con `hover:`, y lo que no la declara hereda el reposo); ningún color de texto ni de fondo queda sin verificar |
| Estructura | `lang` en el documento, enlace de salto con destino existente, un `h1` por ruta, SVG ocultos o nombrados, gráficas con `role="img"`, leyenda en texto y tabla de datos, tablas con `scope` |
| Matemática | Fórmula de luminancia relativa (blanco sobre negro = 21:1) y umbrales 4.5:1 / 3:1 |
| **Frontera de controles** (`control-boundary.test.ts`) | `line-strong` ≥ 3:1 en los tres lienzos (`mist`, `mist-2`, `shell`); `line` < 3:1 (no puede ser frontera); los controles con borde declaran `line-strong` por defecto y sus bordes de estado también alcanzan 3:1. Verificado en falso: un solo control con `border-line` pone la prueba roja |
| **Tipografía cirílica** (`cyrillic-fonts.test.ts`) | `Playfair Display` **y** `Manrope` se cargan con los subconjuntos `latin` + `cyrillic` y las pilas del preset y de `globals.css` empiezan por la fuente de marca; no se reintroducen respaldos precargados |
| **Tablas de datos** (`table-semantics.test.ts`) | Todo `<table>` del producto tiene nombre accesible (`<caption>`/`aria-label`) y `scope="col"`; las de presentación quedan exentas. Regla **derivada** del código, no una lista fija |
| **Piezas de marca** (`brand-pieces.test.ts`) | Las ilustraciones de `docs/imagenes` usan solo colores de la paleta real (HEX derivados del preset) y llevan `role="img"` + `<title>`; la imagen social se genera en código con tokens y la maqueta declara variables de la paleta |
| **Claves i18n referenciadas** (`i18n-keys.test.ts`) | Toda clave que el código pide (`getTranslations("ns")`/`useTranslations("ns")` + `t("clave")`) existe en ES, **EN y RU**: cierra el caso de una clave ausente en los tres idiomas (que la paridad formal considera correcta) y que la página acaba pintando como literal |

**Estado del escaneo con navegador real (rediseño «Brisa Marina», 2026-10)**: `axe` corre sobre el
navegador real y la suite **pasa 70/70 sin violaciones critical/serious** — **35 rutas** × los
proyectos `chromium` y `Pixel 5`, sobre el build de producción y un servidor real (PostgreSQL 16 y
Redis 7 locales, RPC y worker apagados a propósito para medir también los estados degradados).
Comando: `pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts`.

**Defecto real encontrado por ese escaneo (2026-10, corregido)**: el servidor registraba
`MISSING_MESSAGE: home.travelers.title (en)` en cada petición de `/contacto`. La causa **no** era el
rediseño: la página pedía `home("travelers.title")` / `home("travelers.body")` y
`home("howToArrive.*")` mientras las cuatro claves viven en el namespace **`contact`** (y el mismo
namespace tenía un `system.operationsTitle2` huérfano que el back-office pedía como
`system.operationsTitle`). El huésped veía el literal `home.travelers.title` en pantalla. Se
corrigieron los tres enlaces a su namespace, se renombró la clave huérfana y —lo importante— se
**cerró el hueco de verificación** con un guardián nuevo, `apps/web/src/lib/i18n-keys.test.ts`, que
resuelve estáticamente los enlaces `getTranslations("ns")` / `useTranslations("ns")` de `src/**` y
exige que **toda clave pedida exista en ES, EN y RU**. El guardián de paridad existente no podía
verlo: una clave ausente en los **tres** idiomas es perfectamente «paritaria». Límite declarado de
ese guardián: las claves construidas con plantilla (49 en el producto) no se pueden resolver
estáticamente; el test las acota y las declara.

**Lo que falta (deuda declarada)**: el escenario **con datos**. El spec fuerza `WORKER_BASE_URL` a un
puerto muerto (vistas degradadas) y el dashboard exige sesión, así que las gráficas y las tablas con
cifras reales **todavía no entran** en el análisis. Y `apps/web` no tiene entorno DOM en las pruebas de
unidad (Vitest corre en Node), de modo que los invariantes de color y estructura se comprueban sobre el
código y la paleta, no renderizando componentes: para eso hacen falta `jsdom` + `@testing-library` y
dobles de wagmi.

---

## 4. Cómo reproducir la verificación

```bash
# Instrumento de contraste del sistema visual (50 pares WCAG con veredicto y corrección)
node scripts/design/contrast-audit.mjs

# Invariantes de paleta, uso real del color y estructura (Vitest, entorno Node)
pnpm --filter @hotel/web test src/lib/a11y/a11y.test.ts
pnpm --filter @hotel/web exec vitest run src/lib          # + frontera, cirílico, tablas, marca

# Escaneo en navegador real con axe (Playwright, 8 rutas x chromium/mobile)
pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts
```

Si se cambia un color de la marca, el guardián de la paleta se pone **rojo** hasta que la tabla de §0 se
actualice con el ratio exacto: la certificación no puede volver a medir colores inventados.
