# Certificación y Directrices de Accesibilidad Web (WCAG 2.1 Nivel AA)
## Hotel Marina del Sol: Plataforma NFT de Reservas

> **Versión**: 1.1.0 (verificación sobre la paleta real · M7)  
> **Fecha**: 2026-09-23  
> **Alcance**: Fase 2 (Post-MVP)  
> **Estándar**: W3C Web Content Accessibility Guidelines (WCAG) 2.1 AA  

---

## 0. Corrección de la certificación anterior (H-21)

La versión 1.0.0 de este documento certificaba el contraste de colores **que no existen en el
proyecto**: `Slate-900 #0F172A` y `Emerald-700 #047857` pertenecen a la paleta por defecto de
Tailwind, mientras que la paleta de la marca es la del preset compartido
(`packages/config/tailwind/preset.cjs`: `sand`, `ink`, `sea`, `terracotta`, `olive`, `gold`…). Los
tests hacían lo mismo: medían esos colores inventados y comprobaban objetos literales escritos
dentro del propio test, así que no certificaban nada del producto.

Desde M7 (D-11) los tests **no pueden** volver a medir un color que no exista:

1. La paleta que se mide (`apps/web/src/lib/a11y/palette.ts`) se compara con el preset real
   cargándolo tal cual (`preset.cjs`); si divergen, la suite falla.
2. Se leen los `className` de `apps/web/src/**`: ningún color fuera de la paleta pasa el guardián, y
   cada par texto/fondo que aparece **en el mismo elemento** se mide con composición alfa
   (`bg-sea/10`) sobre las superficies declaradas.
3. Los tres tonos que sí estaban fuera de paleta en el código (`emerald-*`/`red-*` en la pantalla de
   recepción y en el enlace de salto) están sustituidos por tokens de marca.

Ratio real de las combinaciones en uso (calculado con la fórmula de luminancia relativa de la W3C):

| Combinación | Ratio | Uso |
|---|---|---|
| `ink` sobre `shell` / `sand` / `sand-2` | 15.95 / 14.81 / 13.35 | Texto principal |
| `ink-soft` sobre `shell` / `sand` / `sand-2` | 7.43 / 6.90 / 6.22 | Texto secundario |
| `sea` / `sea-deep` sobre `shell` | 7.89 / 11.12 | Enlaces y títulos de marca |
| `terracotta-text` sobre `shell` / `sand` / `sand-2` | 6.02 / 5.59 / 5.04 | Avisos y etiquetas |
| `shell` sobre `sea` / `sea-deep` / `terracotta-text` / `olive` | 7.89 / 11.12 / 6.02 / 5.73 | Texto sobre acciones y etiquetas |
| `ink` sobre `gold` | 5.38 | Etiqueta «Suite» |
| `sand` / `shell` sobre `ocean` | 13.42 / 14.46 | Registro oscuro editorial (hero, pie, cabecera de administración) |
| `champagne` sobre `ocean` / `ocean-soft` | 6.39 / 4.54 | Detalle premium sobre superficie oscura |
| `success` / `warning` / `error` / `info` sobre `sand` | 5.84 / 5.49 / 6.92 / 7.67 | Estados semánticos como texto |
| `success` / `warning` / `error` / `info` sobre su fondo teñido | 5.32 / 4.91 / 6.04 / 6.72 | Bandas de estado |
| `shell` sobre `success` / `error` | 6.29 / 7.45 | Texto blanco sobre relleno de estado |
| `shell` sobre velo `ocean` al **65 %** | 4.73 | Texto del hero sobre fotografía |

Todas superan el **4.5:1** de texto normal (y el 3:1 de texto grande y componentes, criterio 1.4.11:
las series de las gráficas —`sea` y `terracotta-text`, 7.89 y 6.02 sobre blanco— se distinguen del
fondo de la tarjeta).

**Frontera de controles (1.4.11)** — hallazgo H-7 de la propuesta de imagen visual, **implementado**
(Fase A.2, 2026-09-27): el borde de `input`/`select`/`textarea` pasa a `line-strong #8F7F5F`
(**3,91:1** sobre `shell`, **3,63:1** sobre `sand`, **3,27:1** sobre `sand-2`) en los **89 controles**
con frontera y en las 11 constantes `FIELD` compartidas. El `line #E7DCC6` anterior daba ~1,10:1 y se
conserva **solo** para filetes decorativos (exentos). Lo protege un guardián nuevo —
`apps/web/src/lib/a11y/control-boundary.test.ts`— que **deriva** del contraste medido qué tokens pueden
ser frontera, exige `line-strong` por defecto y se comprobó **en falso**: devolver un solo control a
`border-line` lo pone rojo con el fichero y la clase exactos. Los pares se miden con
`node scripts/design/contrast-audit.mjs` (32 pares con veredicto AA/AAA).

**Texto de botones «fantasma»** (observado y evaluado): 27 elementos `button`/`a` en 24 ficheros usan
`border border-line` como estilo secundario. **No se cambian** porque el criterio 1.4.11 se aplica a la
información visual *necesaria para identificar* el componente, y un botón con etiqueta visible se
identifica por su texto; el **foco** (2.4.11) sí cumple con el doble anillo arena+teal. Si se quiere
más afordancia, la palanca es aplicar `line-strong` también ahí (cambio visible en 27 elementos).

---

## 1. Compromiso de Accesibilidad e Inclusión

La plataforma de reservas Web3 del Hotel Marina del Sol garantiza el acceso equitativo e independiente para todos los usuarios, incluyendo personas con discapacidad visual, auditiva, motriz o cognitiva.

---

## 2. Pilares de Conformidad Técnica

### 2.1 Perceptible (Principio 1)
- **Contraste de Color (Criterio 1.4.3)**:
  - Texto estándar: ratio mínimo de **4.5:1** (verificado sobre la paleta real: `ink #1B2327` sobre `shell #FFFFFF` alcanza **15.95:1**; `shell` sobre `sea #0E5A63` alcanza **7.89:1**). Ver la tabla de §0.
  - Texto grande y componentes de interfaz (Criterio 1.4.11): ratio mínimo de **3.0:1**.
- **Texto Alternativo e Iconos (Criterio 1.1.1)**:
  - Todos los iconos decorativos incluyen `aria-hidden="true"` (el guardián de M7 falla si aparece un `<svg>` sin ocultar ni nombrar).
  - Iconos interactivos (botones de cerrar modal, filtros, carrito) disponen de etiqueta `aria-label` descriptiva en los 3 idiomas (ES, EN, RU).
- **Gráficas del dashboard (Criterios 1.1.1 y 1.4.1)**: cada gráfica lleva `role="img"` con nombre accesible (resumen con las cifras), leyenda en HTML con el nombre de cada serie —el color no es el único canal— y una **tabla de datos equivalente** en un `<details>` nativo.

### 2.2 Operable (Principio 2)
- **Navegación por Teclado (Criterio 2.1.1)**:
  - Toda la funcionalidad (catálogo, filtros, selector de fechas, checkout con wallet, re-descarga de resguardo) es 100% operable exclusivamente mediante teclado (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`).
  - **Sin trampas de foco (Criterio 2.1.2)**: Los modales atrapan el foco mientras están abiertos y lo devuelven al elemento detonador tras cerrarse con `Esc`.
- **Enlace de Salto Directo (Criterio 2.4.1)**:
  - Enlace "*Saltar al contenido principal*" presente al inicio del DOM, visible únicamente al recibir foco vía teclado (`focus:bg-sea-deep` con texto `shell`, 11.12:1).
- **Foco Visible (Criterio 2.4.7)**:
  - Anillo de enfoque de alto contraste (`focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2`) obligatorio en todos los controles interactivos.

### 2.3 Comprensible (Principio 3)
- **Idioma de la Página (Criterio 3.1.1)**:
  - El atributo `<html lang="...">` se sincroniza dinámicamente según la preferencia del usuario (`es`, `en` o `ru`).
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

Qué comprueba (M7, D-11; ampliado en la propuesta de imagen visual, Fase A.2):

| Bloque | Invariante |
|---|---|
| Paleta | La paleta medida es **idéntica** al preset real de Tailwind; las combinaciones declaradas superan 4.5:1; las series de las gráficas superan 3:1 sobre el fondo de la tarjeta |
| Uso real del color | Ningún `className` usa un color fuera de la paleta; todo par texto/fondo del mismo elemento cumple 4.5:1 (con composición alfa) y el emparejamiento es **por variante** (`hover:` con `hover:`, y lo que no la declara hereda el reposo); ningún color de texto ni de fondo queda sin verificar |
| Estructura | `lang` en el documento, enlace de salto con destino existente, un `h1` por ruta, SVG ocultos o nombrados, gráficas con `role="img"`, leyenda en texto y tabla de datos, tablas con `scope` |
| Matemática | Fórmula de luminancia relativa (blanco sobre negro = 21:1) y umbrales 4.5:1 / 3:1 |
| **Frontera de controles** (Fase A.2, `control-boundary.test.ts`) | `line-strong` ≥ 3:1 en los tres lienzos; `line` < 3:1 (no puede ser frontera); los **89 controles** con borde declaran `line-strong` por defecto y sus bordes de estado también alcanzan 3:1. Verificado en falso: un solo control con `border-line` pone la prueba roja |
| **Cascada cirílica** (`cyrillic-fonts.test.ts`) | `Playfair Display` + `Inter` se cargan con el subconjunto `cyrillic` y `preload:false`, y las pilas del preset y de `globals.css` los colocan **después** de la fuente de marca |
| **Tablas de datos** (`table-semantics.test.ts`) | Todo `<table>` del producto tiene nombre accesible (`<caption>`/`aria-label`) y `scope="col"`; las de presentación quedan exentas. Regla **derivada** del código, no una lista fija |
| **Piezas de marca** (`brand-pieces.test.ts`) | Las nueve ilustraciones de `docs/imagenes` usan solo colores de la paleta real (HEX derivados del preset) y llevan `role="img"` + `<title>`; la imagen social se genera en código con tokens y la maqueta declara variables de la paleta |

**Estado del escaneo con navegador real (M8, ampliado en M9)**: `axe` **ya corre** sobre el navegador
real. Con `pnpm --filter @hotel/web exec playwright install chromium-headless-shell` quedó resuelto el
binario que faltaba y la suite **pasa 16/16 sin violaciones critical/serious** (8 rutas —`/`, `/reventa`,
`/historico`, `/mis-noches`, `/checkin`, `/admin/dashboard`, `/admin/mint`, `/asistente`— × los
proyectos `chromium` y `mobile`). En M9 se añadieron las dos rutas nuevas del resguardo: `/mis-noches`
es donde el titular lo genera y `/checkin` es la pantalla que se enseña en recepción, que aquí se
escanea en su estado «sin resguardo».

**Lo que falta (deuda declarada)**: el escenario **con datos**. El spec fuerza `WORKER_BASE_URL` a un
puerto muerto (vistas degradadas) y el dashboard exige sesión, así que las gráficas y las tablas con
cifras reales **todavía no entran** en el análisis. Y `apps/web` no tiene entorno DOM en las pruebas de
unidad (Vitest corre en Node), de modo que los invariantes de color y estructura se comprueban sobre el
código y la paleta, no renderizando componentes: para eso hacen falta `jsdom` + `@testing-library` y
dobles de wagmi.

---

## 4. Cómo reproducir la verificación

```bash
# Invariantes de paleta, uso real del color y estructura (Vitest, entorno Node)
pnpm --filter @hotel/web test src/lib/a11y/a11y.test.ts

# Escaneo en navegador real con axe (Playwright, 6 rutas x chromium/mobile)
pnpm --filter @hotel/web exec playwright test e2e/a11y.spec.ts
```

Si se cambia un color de la marca, el guardián de la paleta se pone **rojo** hasta que la tabla de §0 se
actualice con el ratio exacto: la certificación no puede volver a medir colores inventados.

