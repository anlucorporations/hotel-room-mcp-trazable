# Proceso propuesto — Bloque 5: galería, planes y cierre de la entrevista

> **Documento de propuesta (NO ejecutada en código).** Registro de decisiones de la entrevista.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto
> **Continúa a**: bloques 1 (D-1…D-33), 2 (D-34…D-55), 3 (D-56…D-64) y 4 (D-65…D-72).
> **Numeración**: continúa desde **D-73**.
> **Objeto**: dar modelo de datos a la galería y a los planes informativos de la home, y cerrar la
> pregunta aplazada de accesibilidad.

---

## 1. Galería del hotel

**D-73 (decisión del cliente, aplicada).** Se modela con una tabla **`hotel_images`** análoga a
`room_images`: fichero, ruta, **sección de la home** (hero, servicios, experiencia…), posición, texto
alternativo por idioma y portada. La gestiona el **administrador con wallet** desde Administración, con
las mismas reglas que las fotos de habitación (solo JPG, ≤2 MB) y la misma lógica de imágenes locales
(`./docs/imagenes`).

---

## 2. Planes especiales

**D-74 (decisión del cliente, aplicada).** Se modela con una tabla **`hotel_offers`**: título y
descripción multilingües, imagen, **vigencia** (desde/hasta), orden y activo. El administrador los edita
y aparecen en la home. **Sin precios** (D-69).

---

## 3. Accesibilidad de las rutas nuevas

**D-75 (decisión del cliente, aplicada).** El escaneo **axe** se extiende a **todas las rutas nuevas** de
las tres suites y de las dos rutas de personal (`/housekeeping`, `/mantenimiento`), en **escritorio y
móvil**, con el umbral ya vigente (cero violaciones `critical`/`serious`). Cierra la pregunta que quedó
aplazada en el bloque 3 y mantiene RNF-15 sin excepciones.

---

## 4. Resumen del bloque 5

| Tema | Decisión | Idea clave |
|---|---|---|
| Galería del hotel | D-73 | Tabla `hotel_images` gestionada por el admin con wallet |
| Planes especiales | D-74 | Tabla `hotel_offers` editable, sin precios |
| Accesibilidad | D-75 | axe en **todas** las rutas nuevas (escritorio y móvil) |

---

*Documento v2 · @asistenteProyecto · bloque 5 con D-73…D-75.*
