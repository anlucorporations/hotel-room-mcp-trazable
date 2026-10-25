# Contraste WCAG 2.1 — Propuesta B «Posidonia»

> **Generado** por `scripts/design/proposals-v3.mjs` (misma matemática que
> `apps/web/src/lib/a11y/contrast.ts`: luminancia relativa + ratio sin redondear).
> **Fecha**: 2026-10 · **Pares aprobados**: 44 ·
> **Fallos**: 0 · **Pares prohibidos documentados**: 4.
> Si un par no alcanza su mínimo, el generador **falla y no publica** la propuesta.

## Pares aprobados (texto sobre fondo)

| Texto | Fondo | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
| `ink` #0C2226 | `mist` #F2F8F7 | **15,36:1** | 4.5:1 | AAA ✅ | Texto principal sobre lienzo de bruma |
| `ink` #0C2226 | `shell` #FFFFFF | **16,50:1** | 4.5:1 | AAA ✅ | Texto principal sobre tarjeta |
| `ink` #0C2226 | `mist-2` #E3EFEE | **14,03:1** | 4.5:1 | AAA ✅ | Texto principal sobre banda |
| `ink-soft` #44605F | `mist` #F2F8F7 | **6,34:1** | 4.5:1 | AA ✅ | Texto secundario sobre lienzo |
| `ink-soft` #44605F | `shell` #FFFFFF | **6,81:1** | 4.5:1 | AA ✅ | Texto secundario sobre tarjeta |
| `ink-soft` #44605F | `mist-2` #E3EFEE | **5,79:1** | 4.5:1 | AA ✅ | Texto secundario sobre banda |
| `azure` #0B6A5A | `shell` #FFFFFF | **6,51:1** | 4.5:1 | AA ✅ | Enlace / acción sobre tarjeta |
| `azure` #0B6A5A | `mist` #F2F8F7 | **6,06:1** | 4.5:1 | AA ✅ | Enlace sobre el lienzo |
| `agua` #0C7A87 | `shell` #FFFFFF | **5,06:1** | 4.5:1 | AA ✅ | Apoyo interactivo sobre tarjeta |
| `agua` #0C7A87 | `mist` #F2F8F7 | **4,71:1** | 4.5:1 | AA ✅ | Apoyo interactivo sobre el lienzo |
| `shell` #FFFFFF | `azure` #0B6A5A | **6,51:1** | 4.5:1 | AA ✅ | Texto blanco sobre acción primaria |
| `shell` #FFFFFF | `azure-deep` #074B40 | **10,05:1** | 4.5:1 | AAA ✅ | Texto blanco sobre acción en hover |
| `shell` #FFFFFF | `agua` #0C7A87 | **5,06:1** | 4.5:1 | AA ✅ | Texto blanco sobre apoyo interactivo |
| `shell` #FFFFFF | `coral` #B44D33 | **5,19:1** | 4.5:1 | AA ✅ | Texto blanco sobre relleno de atención |
| `coral-text` #963C24 | `shell` #FFFFFF | **7,07:1** | 4.5:1 | AAA ✅ | Atención como texto sobre tarjeta |
| `coral-text` #963C24 | `mist` #F2F8F7 | **6,58:1** | 4.5:1 | AA ✅ | Atención como texto sobre lienzo |
| `shell` #FFFFFF | `navy` #052528 | **16,13:1** | 4.5:1 | AAA ✅ | Texto blanco sobre superficie oscura |
| `mist` #F2F8F7 | `navy` #052528 | **15,02:1** | 4.5:1 | AAA ✅ | Texto bruma sobre superficie oscura |
| `pearl` #BFD8D4 | `navy` #052528 | **10,75:1** | 4.5:1 | AAA ✅ | Detalle premium sobre el abismo |
| `shell` #FFFFFF | `navy-soft` #0A3A3D | **12,46:1** | 4.5:1 | AAA ✅ | Texto blanco sobre oscuro secundario |
| `pearl` #BFD8D4 | `navy-soft` #0A3A3D | **8,30:1** | 4.5:1 | AAA ✅ | Detalle premium sobre oscuro secundario |
| `shell` #FFFFFF | `fern` #2F7A58 | **5,19:1** | 4.5:1 | AA ✅ | Texto blanco sobre «disponible» |
| `ink` #0C2226 | `amber` #C9A66B | **7,19:1** | 4.5:1 | AAA ✅ | Etiqueta premium (tinta sobre arena) |
| `ink` #0C2226 | `line` #D5E5E1 | **12,67:1** | 4.5:1 | AAA ✅ | Texto sobre separador (chips) |
| `line-strong` #5C7B76 | `shell` #FFFFFF | **4,62:1** | 3:1 | AA ✅ | Frontera de control sobre tarjeta |
| `line-strong` #5C7B76 | `mist` #F2F8F7 | **4,30:1** | 3:1 | AA ✅ | Frontera de control sobre lienzo |
| `line-strong` #5C7B76 | `mist-2` #E3EFEE | **3,92:1** | 3:1 | AA ✅ | Frontera de control sobre banda |
| `success` #196A45 | `mist` #F2F8F7 | **6,13:1** | 4.5:1 | AA ✅ | Confirmación como texto |
| `success` #196A45 | `success-bg` #DFF0E7 | **5,57:1** | 4.5:1 | AA ✅ | Confirmación sobre su banda |
| `warning` #855A0C | `mist` #F2F8F7 | **5,64:1** | 4.5:1 | AA ✅ | Aviso como texto |
| `warning` #855A0C | `warning-bg` #F9EFD4 | **5,29:1** | 4.5:1 | AA ✅ | Aviso sobre su banda |
| `error` #A3291E | `mist` #F2F8F7 | **6,76:1** | 4.5:1 | AA ✅ | Error como texto |
| `error` #A3291E | `error-bg` #F8E3DF | **5,89:1** | 4.5:1 | AA ✅ | Error sobre su banda |
| `info` #0C6673 | `mist` #F2F8F7 | **6,18:1** | 4.5:1 | AA ✅ | Información como texto |
| `info` #0C6673 | `info-bg` #DEEEF1 | **5,56:1** | 4.5:1 | AA ✅ | Información sobre su banda |
| `shell` #FFFFFF | `success` #196A45 | **6,59:1** | 4.5:1 | AA ✅ | Texto blanco sobre confirmación |
| `shell` #FFFFFF | `error` #A3291E | **7,26:1** | 4.5:1 | AAA ✅ | Texto blanco sobre error |
| `mist` #F2F8F7 | `navy` #052528 | **15,02:1** | 4.5:1 | AAA ✅ | Texto del sidebar oscuro (AdminLTE dark skin) |
| `pearl` #BFD8D4 | `navy` #052528 | **10,75:1** | 4.5:1 | AAA ✅ | Etiquetas de sección del sidebar |
| `shell` #FFFFFF | `azure` #0B6A5A | **6,51:1** | 4.5:1 | AA ✅ | Entrada activa del sidebar (pastilla posidonia) |
| `mist` #F2F8F7 | `navy-soft` #0A3A3D | **11,60:1** | 4.5:1 | AAA ✅ | Hover del sidebar |
| `ink` #0C2226 | `shell` #FFFFFF | **16,50:1** | 4.5:1 | AAA ✅ | Contenido del panel sobre tarjeta blanca |
| `ink-soft` #44605F | `shell` #FFFFFF | **6,81:1** | 4.5:1 | AA ✅ | Migaja y metadatos del panel |

## Velos compuestos

| Texto | Fondo compuesto | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
| `shell` #FFFFFF | velo al 70 % sobre shell → #506669 | **6,09:1** | 4.5:1 | AA ✅ | Titular del hero sobre velo de abismo al 70 % |

## Pares prohibidos (comprobación negativa)

| Texto | Fondo | Ratio | — | Veredicto | Motivo |
|---|---|---|---|---|---|
| `ink` #0C2226 | `navy` #052528 | **1,02:1** | — | ❌ prohibido | Se pierde la jerarquía del registro oscuro |
| `pearl` #BFD8D4 | `shell` #FFFFFF | **1,50:1** | — | ❌ prohibido | Solo existe sobre oscuro |
| `amber` #C9A66B | `shell` #FFFFFF | **2,30:1** | — | ❌ prohibido | Es una superficie: se usa con tinta encima |
| `line` #D5E5E1 | `mist` #F2F8F7 | **1,21:1** | — | ❌ prohibido | Incumple WCAG 1.4.11 (mínimo 3:1) |

## Notas de medición

- **Fronteras de control** (`line-strong`): el mínimo aplicable es **3:1** (WCAG 1.4.11), no 4,5:1.
- **Texto deshabilitado**: exento por WCAG 2.1 · 1.4.3 (componentes inactivos).
- **Velos**: se compone el color al alfa declarado sobre `shell`; la fotografía real se mide en la
  previsualización con el mismo compuesto (el generador usa el valor del velo, no una estimación).
- El detalle premium `pearl` solo se declara sobre superficies oscuras; `amber` es una
  **superficie** (no un texto) en ambas propuestas.
