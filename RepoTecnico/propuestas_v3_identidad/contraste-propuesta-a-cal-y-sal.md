# Contraste WCAG 2.1 — Propuesta A «Cal & Sal»

> **Generado** por `scripts/design/proposals-v3.mjs` (misma matemática que
> `apps/web/src/lib/a11y/contrast.ts`: luminancia relativa + ratio sin redondear).
> **Fecha**: 2026-10 · **Pares aprobados**: 42 ·
> **Fallos**: 0 · **Pares prohibidos documentados**: 4.
> Si un par no alcanza su mínimo, el generador **falla y no publica** la propuesta.

## Pares aprobados (texto sobre fondo)

| Texto | Fondo | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
| `ink` #15222C | `mist` #F8F3E9 | **14,64:1** | 4.5:1 | AAA ✅ | Texto principal sobre lienzo de caliza |
| `ink` #15222C | `shell` #FFFFFF | **16,19:1** | 4.5:1 | AAA ✅ | Texto principal sobre tarjeta |
| `ink` #15222C | `mist-2` #EFE7D6 | **13,16:1** | 4.5:1 | AAA ✅ | Texto principal sobre banda cálida |
| `ink` #15222C | `arena` #E9DDC8 | **12,06:1** | 4.5:1 | AAA ✅ | Texto principal sobre superficie arena |
| `ink-soft` #495764 | `mist` #F8F3E9 | **6,71:1** | 4.5:1 | AA ✅ | Texto secundario sobre lienzo |
| `ink-soft` #495764 | `shell` #FFFFFF | **7,42:1** | 4.5:1 | AAA ✅ | Texto secundario sobre tarjeta |
| `ink-soft` #495764 | `mist-2` #EFE7D6 | **6,03:1** | 4.5:1 | AA ✅ | Texto secundario sobre banda |
| `azure` #0B5C74 | `shell` #FFFFFF | **7,51:1** | 4.5:1 | AAA ✅ | Enlace / acción sobre tarjeta |
| `azure` #0B5C74 | `mist` #F8F3E9 | **6,79:1** | 4.5:1 | AA ✅ | Enlace sobre el lienzo |
| `shell` #FFFFFF | `azure` #0B5C74 | **7,51:1** | 4.5:1 | AAA ✅ | Texto blanco sobre acción primaria |
| `shell` #FFFFFF | `azure-deep` #084659 | **10,34:1** | 4.5:1 | AAA ✅ | Texto blanco sobre acción en hover |
| `shell` #FFFFFF | `coral` #AE4E2A | **5,35:1** | 4.5:1 | AA ✅ | Texto blanco sobre relleno de atención |
| `coral-text` #8F3D1E | `shell` #FFFFFF | **7,36:1** | 4.5:1 | AAA ✅ | Atención como texto sobre tarjeta |
| `coral-text` #8F3D1E | `mist` #F8F3E9 | **6,65:1** | 4.5:1 | AA ✅ | Atención como texto sobre lienzo |
| `shell` #FFFFFF | `navy` #0F2833 | **15,31:1** | 4.5:1 | AAA ✅ | Texto blanco sobre superficie oscura |
| `mist` #F8F3E9 | `navy` #0F2833 | **13,84:1** | 4.5:1 | AAA ✅ | Texto caliza sobre superficie oscura |
| `pearl` #D9E8EC | `navy` #0F2833 | **12,18:1** | 4.5:1 | AAA ✅ | Detalle sal sobre la noche |
| `shell` #FFFFFF | `navy-soft` #1A3B49 | **11,89:1** | 4.5:1 | AAA ✅ | Texto blanco sobre oscuro secundario |
| `pearl` #D9E8EC | `navy-soft` #1A3B49 | **9,46:1** | 4.5:1 | AAA ✅ | Detalle premium sobre oscuro secundario |
| `shell` #FFFFFF | `fern` #56682F | **6,15:1** | 4.5:1 | AA ✅ | Texto blanco sobre «disponible» |
| `shell` #FFFFFF | `amber` #9A6A12 | **4,73:1** | 4.5:1 | AA ✅ | Texto blanco sobre etiqueta premium |
| `ink` #15222C | `line` #E4D9C5 | **11,59:1** | 4.5:1 | AAA ✅ | Texto sobre separador (chips) |
| `line-strong` #8B7A62 | `shell` #FFFFFF | **4,15:1** | 3:1 | AA ✅ | Frontera de control sobre tarjeta |
| `line-strong` #8B7A62 | `mist` #F8F3E9 | **3,75:1** | 3:1 | AA ✅ | Frontera de control sobre lienzo |
| `line-strong` #8B7A62 | `mist-2` #EFE7D6 | **3,38:1** | 3:1 | AA ✅ | Frontera de control sobre banda |
| `success` #1C6E48 | `mist` #F8F3E9 | **5,63:1** | 4.5:1 | AA ✅ | Confirmación como texto |
| `success` #1C6E48 | `success-bg` #E2F0E8 | **5,30:1** | 4.5:1 | AA ✅ | Confirmación sobre su banda |
| `warning` #875A0B | `mist` #F8F3E9 | **5,43:1** | 4.5:1 | AA ✅ | Aviso como texto |
| `warning` #875A0B | `warning-bg` #F9EFD4 | **5,24:1** | 4.5:1 | AA ✅ | Aviso sobre su banda |
| `error` #A62A1F | `mist` #F8F3E9 | **6,39:1** | 4.5:1 | AA ✅ | Error como texto |
| `error` #A62A1F | `error-bg` #F7E3DF | **5,72:1** | 4.5:1 | AA ✅ | Error sobre su banda |
| `info` #1E6273 | `mist` #F8F3E9 | **6,23:1** | 4.5:1 | AA ✅ | Información como texto |
| `info` #1E6273 | `info-bg` #E1EDF1 | **5,77:1** | 4.5:1 | AA ✅ | Información sobre su banda |
| `shell` #FFFFFF | `success` #1C6E48 | **6,23:1** | 4.5:1 | AA ✅ | Texto blanco sobre confirmación |
| `shell` #FFFFFF | `error` #A62A1F | **7,07:1** | 4.5:1 | AAA ✅ | Texto blanco sobre error |
| `ink` #15222C | `mist-2` #EFE7D6 | **13,16:1** | 4.5:1 | AAA ✅ | Texto del sidebar claro (AdminLTE light skin) |
| `ink-soft` #495764 | `mist-2` #EFE7D6 | **6,03:1** | 4.5:1 | AA ✅ | Etiquetas de sección del sidebar |
| `ink` #15222C | `arena` #E9DDC8 | **12,06:1** | 4.5:1 | AAA ✅ | Hover del sidebar (arena con tinta) |
| `shell` #FFFFFF | `azure` #0B5C74 | **7,51:1** | 4.5:1 | AAA ✅ | Entrada activa del sidebar (pastilla azul) |
| `ink` #15222C | `shell` #FFFFFF | **16,19:1** | 4.5:1 | AAA ✅ | Contenido del panel sobre tarjeta blanca |
| `ink-soft` #495764 | `shell` #FFFFFF | **7,42:1** | 4.5:1 | AAA ✅ | Migaja y metadatos del panel |

## Velos compuestos

| Texto | Fondo compuesto | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
| `shell` #FFFFFF | velo al 70 % sobre shell → #576970 | **5,74:1** | 4.5:1 | AA ✅ | Titular del hero sobre velo de noche al 70 % |

## Pares prohibidos (comprobación negativa)

| Texto | Fondo | Ratio | — | Veredicto | Motivo |
|---|---|---|---|---|---|
| `ink` #15222C | `navy` #0F2833 | **1,06:1** | — | ❌ prohibido | Se pierde la jerarquía del registro oscuro |
| `pearl` #D9E8EC | `shell` #FFFFFF | **1,26:1** | — | ❌ prohibido | El detalle premium solo existe sobre oscuro |
| `ink` #15222C | `amber` #9A6A12 | **3,43:1** | — | ❌ prohibido | El relleno premium reclama texto blanco (4,73:1); la tinta se queda en 3,43:1 |
| `line` #E4D9C5 | `mist` #F8F3E9 | **1,26:1** | — | ❌ prohibido | Incumple WCAG 1.4.11 (mínimo 3:1) |

## Notas de medición

- **Fronteras de control** (`line-strong`): el mínimo aplicable es **3:1** (WCAG 1.4.11), no 4,5:1.
- **Texto deshabilitado**: exento por WCAG 2.1 · 1.4.3 (componentes inactivos).
- **Velos**: se compone el color al alfa declarado sobre `shell`; la fotografía real se mide en la
  previsualización con el mismo compuesto (el generador usa el valor del velo, no una estimación).
- El detalle premium `pearl` solo se declara sobre superficies oscuras; `amber` es una
  **superficie** (no un texto) en ambas propuestas.
