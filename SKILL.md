---
name: equipo-manuales
description: >-
  Equipo de agentes para elaborar los MANUALES de cualquier sistema, activado
  por el comando "@manuales": agente TÉCNICO (manuales técnicos .md en árbol
  RepoTecnico/Manuales → temas → secciones → sub-secciones), agente LITERARIO
  (manuales literales .md en docs/ con el mismo árbol, lenguaje sencillo y
  código para generar gráficos), agente CREATIVO (imágenes/infografías en
  docs/imagenes), asistente PDF (versión descargable con el estilo del
  proyecto) e INTEGRADOR (sección de Ayuda en la plataforma: manual navegable
  por temas/secciones/sub-secciones + imágenes + descarga de PDF).
whenToUse: >-
  Se activa cuando el prompt contenga "@manuales" (p. ej. "@manuales del
  proyecto", "@manuales en inglés") o frases equivalentes ("generar los
  manuales", "manual técnico / manual de usuario", "manual de uso del
  sistema", "sección de ayuda", "diccionario de datos", "diagrama relacional",
  "equipo de manuales") en cualquier proyecto.
---

# Equipo de Manuales (5 roles) — comando `@manuales`

Plugin reutilizable que **se ejecuta cuando el prompt contiene `@manuales`**
(además de frases equivalentes). Produce la documentación completa de
CUALQUIER proyecto (manuales técnicos y literales, gráficos, PDF y sección de
Ayuda en la plataforma). Se parametriza por el directorio de trabajo; no
depende de un repositorio concreto.

## 📖 Cómo usarlo en cualquier proyecto

Este skill vive en `~/.dsh/skills/` (nivel usuario): disponible en todos los
proyectos y sesiones. Escribe el prompt con el comando:
- **`@manuales`** — genera los manuales completos del proyecto.
- `@manuales en inglés` / `@manuales solo técnicos` / `@manuales en docs/` —
  con parámetros opcionales (idioma, alcance, carpeta de salida).
- O frases equivalentes: *"genera los manuales del proyecto"*, *"manual
  técnico + manual de usuario con gráficos, PDF y ayuda en la plataforma"*.

## Árbol de salida (convención)

```
<proyecto>/
├── RepoTecnico/
│   └── Manuales/                  ← MANUALES TÉCNICOS (.md, basados en código real)
│       ├── 01-Tecnologia/
│       │   ├── 01-plataforma.md   (## sección, ### sub-sección, #### detalle)
│       │   ├── 02-stack-web3.md
│       │   └── ...
│       ├── 02-Dependencias/
│       ├── 03-Implementacion/
│       ├── 04-Despliegue/
│       ├── 05-Diccionario-de-Datos/
│       ├── 06-Diagrama-Relacional/
│       └── 07-<otro tema necesario según el proyecto>/
└── docs/
    ├── Manuales/                  ← MANUALES LITERALES (.md, mismo árbol que RepoTecnico/Manuales)
    │   └── <mismo árbol de temas/secciones/sub-secciones>
    └── imagenes/                  ← IMÁGENES generadas (*.svg | *.png, infografías)
        ├── arquitectura.*
        ├── flujo-<proceso>.*
        ├── onboarding.*
        └── glosario-visual.*
```

Cada archivo técnico usa la jerarquía `## Tema` → `### Sección` → `#### Sub-sección`
y referencias `ruta:línea` al código real.

## Equipo (roles) y flujo

1. **🔧 TÉCNICO** — Analiza el código REAL del proyecto y genera los MANUALES
   TÉCNICOS en `RepoTecnico/Manuales/<tema>/<seccion>.md` (un archivo .md por
   tema; dentro, secciones y sub-secciones). Temas estándar (añade otros según
   el proyecto):
   - `01-Tecnologia` (plataforma, arquitectura, stack Web3/frontend/backend)
   - `02-Dependencias` (paquetes, librerías, versiones, licencias)
   - `03-Implementacion` (módulos, flujos, contratos/APIs principales)
   - `04-Despliegue` (entornos, scripts, variables de entorno, red)
   - `05-Diccionario-de-Datos` (entidades, campos, tipos, relaciones)
   - `06-Diagrama-Relacional` (descripción textual de tablas y relaciones)
   Base TODO en el código real; marca lo no verificable como "pendiente de
   confirmar"; NO prometas funciones inexistentes.

2. **✍️ LITERARIO** — Lee los manuales técnicos de
   `RepoTecnico/Manuales/**` y genera los MANUALES LITERALES en
   `docs/Manuales/**` **respetando el mismo árbol** de temas/secciones/
   sub-secciones. Lenguaje sencillo y amigable para el público general
   (frases cortas, sin jerga sin explicar, pasos numerados, ejemplos reales,
   apartado "Empezar en 5 minutos").
   **Incluye el CÓDIGO PARA GENERAR GRÁFICOS** en cada manual literal: añade
   bloques Mermaid (o la directiva de gráfico) donde aporte valor, con el
   marcador de inserción de imagen:
   `<!-- GENERAR_IMAGEN: <nombre>.svg|png -->` seguido de un bloque
   ```mermaid ... ``` (o instrucción de diseño). El agente CREATIVO usará este
   código para producir las imágenes.

3. **🎨 CREATIVO** — Lee los manuales literales (`docs/Manuales/**`) y toma el
   **código de gráficos** que incluyen (`<!-- GENERAR_IMAGEN: ... -->` +
   mermaid/instrucciones) y genera las imágenes en `docs/imagenes/`
   (`imagenes/*.svg|png`): arquitectura, flujos de usuario, onboarding,
   glosario visual e **infografías**. Si Playwright está disponible, rasteriza
   los SVG a PNG (`page.screenshot`). Usa una paleta coherente con el proyecto
   (léela de sus estilos) y etiquetas en el idioma del manual. Cada imagen
   debe corresponder al marcador del manual donde se insertará.

4. **📄 ASISTENTE PDF** — Toma los MANUALES LITERALES (`docs/Manuales/**`) y los
   convierte a `.pdf` (versión imprimible/descargable) respetando el **estilo
   visual del proyecto** (lee colores/tipografía de sus estilos y aplica un
   layout coherente: portada, TOC, headers/footers). Método preferido:
   Playwright Chromium `page.pdf({format:'A4'})` sobre HTML estilizado; si no
   hay herramienta, genera HTML imprimible + `docs/Manuales/pdf/README.md` con
   el paso de exportación. Salida: `docs/Manuales/pdf/<tema>.pdf` (o un PDF
   por manual literal).

5. **🧩 INTEGRADOR** — Construye la SECCIÓN DE AYUDA en la plataforma:
   manual navegable por **temas → secciones → sub-secciones** con las imágenes
   embebidas y **descarga de PDF**. Adapta al framework del proyecto (Next.js
   App Router → ruta `/help/manual` + datos del manual; React/Vite →
   componente/página equivalente; sin frontend → `help/` estático).
   Copia los PDF a la carpeta pública del frontend (p. ej.
   `web/public/manual/`) para que la descarga funcione. NO rompas rutas ni
   textos existentes (si ya hay `/help`, agrégale el acceso al manual).

## Plantilla del workflow (adaptar)

```js
const PROJECT_ROOT = process.cwd() // o la ruta del proyecto
const PROJECT_NAME = '<nombre>'
const TECH_ROOT = join(PROJECT_ROOT, 'RepoTecnico/Manuales')     // manuales técnicos
const LIT_ROOT = join(PROJECT_ROOT, 'docs/Manuales')             // manuales literales
const IMG_DIR = join(PROJECT_ROOT, 'docs/imagenes')              // imágenes
const PDF_DIR = join(LIT_ROOT, 'pdf')                            // PDF descargables
const LANG = '<es|en>' // idioma (default es)

phase('Manual técnico (TÉCNICO)')
await agent(`
PROYECTO: ${PROJECT_ROOT} (${PROJECT_NAME}), idioma ${LANG}.
Eres el agente TÉCNICO. Analiza el código REAL y genera los MANUALES TÉCNICOS
en ${TECH_ROOT}\\ (crea la carpeta y el árbol). Crea un archivo .md por tema:
01-Tecnologia, 02-Dependencias, 03-Implementacion, 04-Despliegue,
05-Diccionario-de-Datos, 06-Diagrama-Relacional, y otros que el proyecto
requiera. Dentro de cada .md usa ## tema → ### sección → #### sub-sección y
referencias ruta:línea al código. NO prometas funciones inexistentes; marca lo
no verificable como "pendiente de confirmar". Responde el índice generado.`,
{ label: 'Técnico' })

phase('Manual literal (LITERARIO)')
await agent(`
PROYECTO: ${PROJECT_ROOT}, idioma ${LANG}.
Eres el agente LITERARIO. Lee ${TECH_ROOT}\\** y genera los MANUALES LITERALES
en ${LIT_ROOT}\\ RESPETANDO EL MISMO ÁRBOL de temas/secciones/sub-secciones.
Lenguaje sencillo para el público general, pasos numerados, ejemplos y
apartado "Empezar en 5 minutos". Además, en cada manual donde aporte valor,
incluye el CÓDIGO PARA GENERAR GRÁFICOS con el marcador:
<!-- GENERAR_IMAGEN: <nombre>.svg|png --> + bloque \`\`\`mermaid ... \`\`\`
(o instrucción de diseño) para arquitectura, flujos, onboarding, glosario
visual e infografías. Responde el índice generado.`, { label: 'Literario' })

phase('Gráficos y PDF (CREATIVO + PDF en paralelo)')
const [creativo, pdf] = await Promise.all([
  agent(`
Eres el agente CREATIVO. Lee los manuales literales ${LIT_ROOT}\\** y toma el
código de gráficos que incluyen (marcadores <!-- GENERAR_IMAGEN: ... --> +
mermaid/instrucciones). Genera las imágenes en ${IMG_DIR}\\ (crea la carpeta)
con nombres que coincidan con los marcadores: arquitectura, flujos,
onboarding, glosario visual e infografías. Prefiere SVG vectorial; si
Playwright está disponible rasteriza a PNG (page.screenshot). Usa la paleta y
tipografía del proyecto (léela de sus estilos). Responde con las rutas
generadas y a qué manual corresponden.`, { label: 'Creativo' }),
  agent(`
Eres el ASISTENTE PDF. Lee los manuales literales ${LIT_DIR} = ${LIT_ROOT}\\**
y conviértelos a PDF descargable en ${PDF_DIR}\\ (crea la carpeta), respetando
el estilo visual del proyecto (colores/tipografía de sus estilos; portada, TOC,
headers/footers). Método preferido: Playwright Chromium page.pdf({format:'A4'})
sobre HTML estilizado; fallback: HTML imprimible + PDF_DIR/README.md con el
paso de exportación. Responde las rutas de los PDF.`, { label: 'PDF' }),
])

phase('Integración en la plataforma (INTEGRADOR)')
const result = await agent(`
Eres el INTEGRADOR. Lee ${LIT_ROOT}\\** y ${IMG_DIR}\\**. Construye la SECCIÓN
DE AYUDA en la plataforma de ${PROJECT_ROOT}: manual navegable por
temas → secciones → sub-secciones, imágenes embebidas y descarga de PDF.
Adapta al framework (Next.js App Router → /help/manual + datos del manual;
React/Vite → componente; sin frontend → help/ estático). Copia los PDF a la
carpeta pública del frontend (p. ej. web/public/manual/). NO rompas rutas ni
textos existentes (verifica antes; si ya hay /help, agrégale el acceso).
Responde rutas creadas/modificadas y URL de acceso.`, { label: 'Integrador' })

return { technical: TECH_ROOT, user: LIT_ROOT, images: IMG_DIR, pdf: PDF_DIR, result }
```

## Calidad de salida

- **Técnicos**: fieles al código real, jerarquía temas/secciones/sub-secciones,
  con `ruta:línea`; sin prometer funciones inexistentes.
- **Literales**: legibles por público general, con "Empezar en 5 minutos" y
  marcadores `<!-- GENERAR_IMAGEN: ... -->` + mermaid para cada gráfico.
- **Imágenes**: SVG (y PNG si es posible) que coinciden con los marcadores del
  manual, coherentes con la marca, con infografías.
- **PDF**: imprimibles/descargables, con el estilo del proyecto; si hay
  fallback HTML, `pdf/README.md` documenta la exportación.
- **Ayuda en plataforma**: navegable por temas/secciones/sub-secciones, con
  imágenes y descarga de PDF; integrada sin romper lo existente.
- Si el proyecto no tiene frontend, el integrador genera la ayuda estática y lo
  indica claramente.
