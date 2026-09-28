# Catálogo de imágenes — nombres canónicos por uso y posición

> **Qué es**: la lista completa de nombres que debe tener **cada imagen** de la plataforma, según
> dónde se usa y en qué posición aparece. Es la fuente de verdad para nombrar ficheros nuevos.
> **Código que lo hace cumplir**: `apps/web/src/lib/room-images.ts` (habitaciones),
> `apps/web/src/lib/hotel-images.ts` (contenido público) y el guardián
> `apps/web/src/lib/images-naming.test.ts` (toda la carpeta).
> **Carpeta**: `docs/imagenes/` (D-5: las fotos viven en el servidor, no en `public/`).
> **Fecha**: 2026-09-28 · **Versión**: 1.0.0.

---

## 1. Las tres familias (y por qué no se mezclan)

| Familia | Patrón canónico | Quién la sirve | Ejemplo |
|---|---|---|---|
| **Habitación** | `<nº>-<Simple\|Doble\|Suite>-<AAAA-MM-DD>-<1..5>.jpg` | `GET /api/rooms/images/<fichero>` | `101-Simple-2026-09-28-1.jpg` |
| **Contenido público** (galería, hero, planes…) | `hotel-<hero\|services\|experience\|activities\|contact\|other>-<AAAA-MM-DD>-<1..20>.jpg` | `GET /api/content/images/<fichero>` | `hotel-hero-2026-09-28-1.jpg` |
| **Documentación** (ilustraciones de los manuales) | `doc-<pantalla>-<elemento>.svg` (o `.png` para la portada) | `GET /manual/imagenes/<fichero>` | `doc-pantalla-recepcion.svg` |

**Reglas de la casa**

1. Solo **`.jpg`** para las dos familias que sube el negocio (D-20: JPG y ≤ 2 MB). El `.svg`/`.png`
   queda reservado a las ilustraciones de manuales, que no se suben desde el back-office.
2. La **fecha del nombre** es la de subida y la asigna el sistema; el **índice** es la **posición**:
   `1` es la **portada** de la habitación o de la sección.
3. El nombre es la única puerta: sin barra, sin `..`, sin espacios ni acentos (los validadores
   rechazan cualquier otra cosa).
4. El prefijo dice la **familia**; el resto, **dónde se ve** (`<seccion>` para contenido,
   `<nº>` para habitación, `<pantalla>` para manual).

---

## 2. Inventario real de `docs/imagenes/` (2026-09-28)

### 2.1 Ilustraciones de manuales → prefijo `doc-` (renombradas en esta ronda)

| Nombre anterior | **Nombre canónico** | Uso y posición en la plataforma | Medidas |
|---|---|---|---|
| `portada-hotel.svg` / `.png` | **`doc-portada-hotel.svg`** / `.png` | Portada del **preamble** de los 3 manuales (`/manual/imagenes/…`) | 1600×900 |
| `compra-tres-pasos.svg` | **`doc-compra-tres-pasos.svg`** | `manual-comprador.md` §3 · fila de 3 pasos | 1400×600 |
| `panel-dueno.svg` | **`doc-panel-dueno.svg`** | `manual-cliente.md` §4 · maqueta del panel | 1600×1000 |
| `pantalla-recepcion.svg` | **`doc-pantalla-recepcion.svg`** | `manual-recepcion.md` §2 y §3 · pantalla de check-in | 1400×900 |
| `pantalla-reventa.svg` | **`doc-pantalla-reventa.svg`** | `manual-comprador.md` §6 · pantalla de reventa | 1400×900 |
| `resguardo-qr-codigo.svg` | **`doc-resguardo-qr-codigo.svg`** | `manual-comprador.md` §5 · resguardo QR + código corto | 1200×800 |
| `esquema-compra-reventa.svg` | **`doc-esquema-compra-reventa.svg`** | `manual-comprador.md` §1 · línea de tiempo | 1600×500 |
| `esquema-quemado-12h.svg` | **`doc-esquema-quemado-12h.svg`** | `manual-cliente.md` §1 · quema diaria | 1400×600 |
| `acceso-doble-factor.svg` | **`doc-acceso-doble-factor.svg`** | `manual-cliente.md` §2 y `manual-recepcion.md` §1 · doble factor | 1200×700 |

### 2.2 Fotos de habitación (material de partida) → nombre canónico por habitación

Las tres fotos que había (`sencilla_hotel.jpg`, `doble_hotel.jpg`, `suite_hotel.jpg`) **no seguían
ningún patrón** y por eso la aplicación no podía servirlas. Pasan a ser la **portada de una habitación
representativa de cada tipo** (la posición `1`):

| Nombre anterior | **Nombre canónico** | Uso y posición |
|---|---|---|
| `sencilla_hotel.jpg` | **`101-Simple-2026-09-28-1.jpg`** | Portada de la **habitación 101** (tipo simple) · tarjeta horizontal de la home y galería de la ficha |
| `doble_hotel.jpg` | **`116-Doble-2026-09-28-1.jpg`** | Portada de la **habitación 116** (tipo doble) |
| `suite_hotel.jpg` | **`201-Suite-2026-09-28-1.jpg`** | Portada de la **habitación 201** (tipo suite) |

> **Al subirlas desde el back-office** (`/admin/habitacion` → Galería), el sistema **vuelve a nombrar**
> el fichero con la fecha del día y el índice que le toque: el nombre de arriba es el que debe tener
> el fichero **en la carpeta** para que el inventario sea coherente, y es el que la aplicación
> generará al subirlo.

### 2.3 Nada más en la carpeta

- `README.md` — índice de las ilustraciones (se mantiene, con los nombres nuevos).
- **No hay ningún `.jpeg`** ni subcarpetas: `docs/image rooms/` está **vacía** y el código no la lee.

---

## 3. Mapa de las 50 habitaciones (foto → nombre esperado)

Cada habitación admite hasta **5 fotos** (D-20): la `1` es la **portada** que se ve en la tarjeta y en
el catálogo; las `2..5` son la galería de la ficha, en el orden en que se muestran. El tipo lo fija el
**maestro** (D-3: 101–115 simple, 116–130 doble, 201–220 suite).

| Habitación | Tipo | Nombre de la portada | Galería (posiciones 2–5) |
|---|---|---|---|
| 101–115 | Simple | `10X-Simple-<fecha>-1.jpg` | `10X-Simple-<fecha>-2.jpg` … `-5.jpg` |
| 116–130 | Doble | `1XX-Doble-<fecha>-1.jpg` | `1XX-Doble-<fecha>-2.jpg` … `-5.jpg` |
| 201–220 | Suite | `2XX-Suite-<fecha>-1.jpg` | `2XX-Suite-<fecha>-2.jpg` … `-5.jpg` |

Mapa exacto (sustituir `<fecha>` por la fecha de subida):

| Habitación | Tipo | Portada esperada |
|---|---|---|
| 101 · 102 · 103 · 104 · 105 | Simple | `101-Simple-<fecha>-1.jpg` … `105-Simple-<fecha>-1.jpg` |
| 106 · 107 · 108 · 109 · 110 | Simple | `106-Simple-<fecha>-1.jpg` … `110-Simple-<fecha>-1.jpg` |
| 111 · 112 · 113 · 114 · 115 | Simple | `111-Simple-<fecha>-1.jpg` … `115-Simple-<fecha>-1.jpg` |
| 116 · 117 · 118 · 119 · 120 | Doble | `116-Doble-<fecha>-1.jpg` … `120-Doble-<fecha>-1.jpg` |
| 121 · 122 · 123 · 124 · 125 | Doble | `121-Doble-<fecha>-1.jpg` … `125-Doble-<fecha>-1.jpg` |
| 126 · 127 · 128 · 129 · 130 | Doble | `126-Doble-<fecha>-1.jpg` … `130-Doble-<fecha>-1.jpg` |
| 201 · 202 · 203 · 204 · 205 | Suite | `201-Suite-<fecha>-1.jpg` … `205-Suite-<fecha>-1.jpg` |
| 206 · 207 · 208 · 209 · 210 | Suite | `206-Suite-<fecha>-1.jpg` … `210-Suite-<fecha>-1.jpg` |
| 211 · 212 · 213 · 214 · 215 | Suite | `211-Suite-<fecha>-1.jpg` … `215-Suite-<fecha>-1.jpg` |
| 216 · 217 · 218 · 219 · 220 | Suite | `216-Suite-<fecha>-1.jpg` … `220-Suite-<fecha>-1.jpg` |

**Total si se cubre el hotel entero**: 50 portadas + hasta 200 de galería = **250 ficheros** como
máximo. Con las tres fotos actuales se cubre la portada de 101, 116 y 201 (una por tipo).

---

## 4. Mapa del contenido público (home y catálogo)

Se gestiona en `/admin/contenido` (D-73/D-74); cada sección admite hasta **20** imágenes y la `1` es
la portada de la sección.

| Sección (`hotel_images.section`) | Dónde se ve | Nombre esperado |
|---|---|---|
| `HERO` | **Hero** de la portada (`/`), foto a sangre con velo marino | `hotel-hero-<fecha>-1.jpg` |
| `SERVICES` | Banda de **servicios** de la home | `hotel-services-<fecha>-1..n.jpg` |
| `EXPERIENCE` | Galería de **experiencia** (`ExperienceCard`) | `hotel-experience-<fecha>-1..n.jpg` |
| `ACTIVITIES` | Sección de **actividades** | `hotel-activities-<fecha>-1..n.jpg` |
| `CONTACT` | Bloque de **contacto** (junto al mapa) | `hotel-contact-<fecha>-1..n.jpg` |
| `OTHER` | Reserva para piezas sueltas | `hotel-other-<fecha>-1..n.jpg` |

> La **imagen social** (Open Graph/Twitter) **no** es un fichero: se genera en código
> (`app/opengraph-image.tsx`) con los tokens de marca, así que no entra en esta carpeta ni en el
> catálogo de nombres.

---

## 5. Dónde se enlaza cada imagen (qué tocar al añadir o renombrar)

| Punto de enlace | Fichero | Qué guarda |
|---|---|---|
| Ficha de habitación · galería | tabla `room_images.file_name` + `/api/rooms/images/<file>` | El nombre canónico de habitación |
| Ficha de habitación · portada | `room_images.is_cover = TRUE` (una sola por habitación) | Cuál de las 5 es la portada |
| Galería/hero de la home | tabla `hotel_images.file_name` + `/api/content/images/<file>` | El nombre canónico de contenido |
| Manuales | `docs/manual-*.md` → `![alt](imagenes/<file>)` | Nombre `doc-*` |
| Manuales servidos en la web | `apps/web/scripts/build-manuals.mjs` copia `docs/imagenes/` a `apps/web/public/manual/imagenes/` | Copia automática: **no se edita a mano** |
| Ayuda de la plataforma | `apps/web/src/lib/help/manuals.generated.ts` (generado por `pnpm --filter @hotel/web run manuals`) | HTML con `/manual/imagenes/<file>` |
| Índice de la carpeta | `docs/imagenes/README.md` | Nombre y descripción de cada ilustración |
| Maqueta del catálogo | `docs/ux-mockups/catalogo.html` | Fotos de ejemplo (rutas del mockup) |

**Para añadir una imagen de habitación o de contenido no hay que tocar código**: se sube desde el
back-office, el sistema construye el nombre canónico (`buildRoomImageFileName` /
`buildHotelImageFileName`) y guarda la fila. **Para añadir una ilustración de manual**: se guarda con
`doc-<pantalla>-<elemento>.svg` en `docs/imagenes/`, se referencia en el `.md` y se regeneran los
manuales con `pnpm --filter @hotel/web run manuals`.

---

## 6. Lo que falta (y cómo nombrarlo al recibirlo)

| Falta | Estado | Nombre que debe tener |
|---|---|---|
| **Fotos de las 50 habitaciones** | Solo hay 3 (101/116/201) | Según el §3 (`<nº>-<Tipo>-<fecha>-<n>.jpg`) |
| **`.jpeg` de interfaces** | **No existen en el repositorio**: las ilustraciones de interfaz son los 9 `doc-*.svg` | Si se sustituyen por capturas reales: `doc-<pantalla>-<elemento>.png` (o `.svg`), nunca `.jpg` |
| **Galería del hotel** (`hotel_images`) | Vacía en el repo; se sube desde `/admin/contenido` | `hotel-<seccion>-<fecha>-<n>.jpg` (§4) |
| **`docs/image rooms/`** | Carpeta **vacía** y sin uso en el código | Se puede borrar o usar como buzón de entrada; las fotos finales van a `docs/imagenes/` |

**Verificación**: `pnpm --filter @hotel/web exec vitest run src/lib/images-naming.test.ts` comprueba
que **todo fichero** de `docs/imagenes/` cumple uno de los tres patrones y que ninguna referencia de
los manuales apunta a un fichero inexistente.
