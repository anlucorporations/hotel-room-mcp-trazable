# Propuesta visual — Suite pública «Marina Editorial»

> **Encargo**: generar una propuesta visual para la **suite pública** usando la **distribución** de
> la plantilla Wix [WH Vacation Rent (wh-1061)](https://es.wix.com/website-template/view/html/wh-1061).
> **Fecha**: 2026-10-23 · **Autor**: `@visualUiUx` · **Estado**: propuesta para aprobación.
> **Previsualización**: [`previsualizaciones/suite-publica.html`](previsualizaciones/suite-publica.html)

---

## 1. Qué hay aquí

| Documento | Contenido |
|---|---|
| [`01-analisis-referencia-wix.md`](01-analisis-referencia-wix.md) | La referencia medida: distribución, alturas, tipografía, colores y **qué se adopta / adapta / corrige** |
| [`02-propuesta-suite-publica.md`](02-propuesta-suite-publica.md) | La propuesta completa: concepto, arquitectura de páginas, sistema de layout, tipografía, componentes, responsive, accesibilidad, implementación y estimación |
| [`contraste-suite-publica.md`](contraste-suite-publica.md) | 26 pares WCAG 2.1 medidos × **3 identidades** (A, B y Brisa Marina) · **0 fallos** |
| [`previsualizaciones/suite-publica.html`](previsualizaciones/suite-publica.html) | Home, móvil, catálogo, ficha, sistema de layout y contraste — con **selector de identidad** |
| [`capturas/`](capturas) | Capturas reales del HTML con Chromium: home, móvil, catálogo, ficha, sistema y hero en A/B/Brisa |
| [`referencia/`](referencia) | Capturas de la plantilla Wix usadas como referencia (trazabilidad, no son assets del producto) |

### Cómo abrir la previsualización

Abre [`previsualizaciones/suite-publica.html`](previsualizaciones/suite-publica.html) en el navegador.
No necesita servidor: es un fichero local con las fotografías reales del hotel
(`docs/imagenes/`) y las tipografías de Google Fonts.

En la barra superior de la previsualización puedes **conmutar la identidad**:

- **A · Cal & Sal** (recomendada en la propuesta de identidad v3) — activa por defecto.
- **B · Posidonia** (alternativa).
- **Brisa Marina** (sistema vigente en producción).

La distribución es la misma en las tres: cambian solo los valores de token, las tipografías y los
radios/sombras. Así la propuesta de **layout** no queda bloqueada por la decisión de **identidad**.

---

## 2. Qué se propone en una página

**«Marina Editorial»** lleva la distribución de la referencia Wix a la suite pública real:

1. **Cabecera transparente de tres zonas** (marca izquierda · navegación centrada · acciones derecha)
   que se vuelve sólida en páginas internas y compacta al hacer scroll.
2. **Hero a sangre ≈80 vh** con fotografía, velo medido, titular serif centrado y **dos CTAs**.
3. **Caja de reserva flotante** bajo el hero (aportación del producto: la referencia no vende).
4. **Relato asimétrico 5/7** («El hotel» a la izquierda; la historia a la derecha), con CTA de filete.
5. **Tres tarjetas de habitación con imagen 4:5**, texto debajo y precio en serif (el patrón
   «Why choose us» de la referencia, reutilizado para las habitaciones).
6. **Tres ventajas numeradas** (reserva directa · noche en propiedad · pase digital) sin tarjetas.
7. **Banda de reventa** en split, con dos listings verificados.
8. **Banda inmersiva a sangre** (Experiencias) con texto sobre velo.
9. **Tres citas de huéspedes** a tres columnas.
10. **Cierre con CTA + tarjeta de contacto** y **footer editorial de wordmark grande**.
11. **Plantillas de Catálogo y Ficha** con la misma gramática.
12. **Móvil y APK**: misma distribución en 390 px, reserva apilada, barra de acción inferior.

Lo que **no** se toca: rutas, dominio, APIs, lógica de compra/reventa, i18n, estructura de datos y los
tokens de identidad. La propuesta es **presentacional**; el único trabajo de producto es sustituir los
componentes de la suite pública, no reescribir el flujo.

---

## 3. Por qué esta distribución (y no otra)

- **La referencia acierta en lo editorial**: jerarquía serif enorme, fotografía a sangre, mucho aire y
  navegación mínima. Es exactamente el registro que un hotel boutique necesita para que la web parezca
  el sitio de un hotel y no un panel de compra.
- **Su debilidad es la conversión**: no muestra precios, disponibilidad, cuenta ni reserva. Por eso la
  propuesta **mantiene la distribución** pero inserta el motor de reserva como pieza propia
  (`BookingDock`) y añade confianza («Reserva directa · Sin comisiones · Pago verificado en cadena ·
  Pase offline»).
- **Su accesibilidad tiene tres defectos medidos**: botones con texto de 10 px, etiquetas taupe de
  18 px con 3,67:1 y navegación blanca sobre foto con 3,28:1 de media. La propuesta los corrige con
  velo compuesto, cuerpo ≥17 px, CTA de 46 px y foco visible. Ver
  [`01-analisis-referencia-wix.md`](01-analisis-referencia-wix.md) §4.
- **No rompe la marca**: el layout funciona con la identidad vigente y con las dos candidatas; los
  pares de contraste están medidos en las tres.

---

## 4. Verificación

| Comprobación | Resultado |
|---|---|
| Contraste WCAG 2.1 (26 pares del layout × 3 identidades) | **78 mediciones · 0 fallos** (el generador aborta si alguna no cumple) |
| Titular y navegación sobre el velo del hero | A: 5,74:1 · B: 6,09:1 · Brisa: 4,79:1 (AA) |
| Capturas reales | Chromium (Playwright) sobre el HTML, con fuentes cargadas (`document.fonts.ready`) |
| Distribución de la referencia | Medida sobre la plantilla renderizada a 1440 px (alturas reales de sección) |
| Código de producto | **No se ha modificado**: solo se añaden documentos, previsualización, capturas y el generador |
| Cirílico | Las seis familias cargadas (Cormorant, Onest, Spectral, Inter Tight, Playfair, Manrope) publican cirílico; el layout se prueba con textos RU |

**Generador** (fuente única de previsualización y tablas):
[`../../scripts/design/public-suite-v3.mjs`](../../scripts/design/public-suite-v3.mjs).

---

## 5. Siguiente paso

1. **Revisar** la previsualización (especialmente Home, Catálogo y Ficha en móvil).
2. **Elegir identidad** si aún no está decidida (A, B o Brisa); la distribución ya está probada en las
   tres.
3. **Aprobar el layout** y pasar a implementación por fases (ver
   [`02-propuesta-suite-publica.md`](02-propuesta-suite-publica.md) §11):
   header → home → catálogo → ficha → checkout/área de huésped → verificación axe/rendimiento.
4. **Actualizar** `docs/DISENO-UX.md` y `RepoTecnico/Manual_Identidad_Visual.md` cuando la identidad
   elegida se aplique; este documento y la previsualización quedan como fuente del layout.

---

## 6. Changelog

| Fecha | Cambio |
|---|---|
| 2026-10-23 | Primera edición: análisis de la referencia Wix wh-1061, propuesta de distribución editorial para la suite pública, preview home/móvil/catálogo/ficha con 3 identidades conmutables, 78 pares de contraste medidos y plan de implementación. **No aplicada al producto.** |
