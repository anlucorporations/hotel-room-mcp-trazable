# Índice de imágenes de la plataforma

Esta carpeta reúne **cuatro familias** de imágenes, y el nombre de cada una dice a cuál pertenece y
dónde se ve (catálogo completo, con el mapa de las 50 habitaciones:
[`RepoTecnico/catalogo_imagenes.md`](../../RepoTecnico/catalogo_imagenes.md)):

| Familia | Patrón | Se sirve en |
|---|---|---|
| **Habitación** | `<nº>-<Simple\|Doble\|Suite>-<AAAA-MM-DD>-<1..5>.jpg` | `GET /api/rooms/images/<fichero>` |
| **Contenido público** (hero, galería, planes) | `hotel-<hero\|services\|experience\|activities\|contact\|other>-<AAAA-MM-DD>-<1..20>.jpg` | `GET /api/content/images/<fichero>` |
| **Ilustraciones de manual** | `doc-<pantalla>-<elemento>.svg` (o `.png` en la portada) | `GET /manual/imagenes/<fichero>` |
| **Avatares de marca** (asistente IA) | `avatar_hotel_<ancho>x<alto>.webp` | `apps/web/public/images/<fichero>` (estático) |

Las dos primeras se **suben desde el back-office** (el sistema construye el nombre) y son **JPG ≤ 2 MB**.
Las de manual se guardan aquí a mano con el prefijo `doc-` y se regeneran con
`pnpm --filter @hotel/web run manuals`.
Los avatares son piezas de **marca**: se guardan aquí y se **copian** a `apps/web/public/images/`
para que la web los sirva; el tamaño va en el nombre porque el asistente elige el fichero según dónde
se pinte (RF-62 del incremento v4).

## Avatares de marca (asistente IA)

| Fichero | Medidas | Dónde se usa |
|---|---|---|
| `avatar_hotel_40x40.webp` | 40×40 px | Avatar de la **cabecera en móvil** (abre la conversación) y encabezado del panel del asistente. |
| `avatar_hotel_80x80.webp` | 80×80 px | **Lanzador flotante** del asistente en escritorio (esquina inferior derecha). |

Ambos son **decorativos** en la interfaz (`alt=""` + `aria-hidden`): el nombre accesible lo aporta el
botón que los envuelve. Se copian a `apps/web/public/images/` con el mismo nombre, y el guardián
`apps/web/src/lib/images-naming.test.ts` comprueba que la familia y los dos tamaños existen.


## Fotografías de habitación

Material actual: **una portada por tipo**, servida en `GET /api/rooms/images/<fichero>`. El nombre es
canónico (`<nº>-<Simple|Doble|Suite>-<AAAA-MM-DD>-<n>.jpg`) y lo vuelve a generar el sistema al subir
desde `/admin/habitacion`.

### Portadas de origen (históricas)

Una por tipo. `scripts/planta.ts` (**@planta**) las copia para materializar la portada de cada
habitación de su tipo, así que **no se borran**:

| Fichero | Tipo |
|---|---|
| `101-Simple-2026-09-28-1.jpg` | Simple (origen) |
| `116-Doble-2026-09-28-1.jpg` | Doble (origen) |
| `201-Suite-2026-09-28-1.jpg` | Suite (origen) |

### Planta vigente (2026-10-05) — 40 habitaciones

Redistribución aprobada por el responsable: plantas **1, 2, 3 y 4**; en cada planta `x01`–`x03`
**dobles**, `x04`–`x05` **suites** y `x06`–`x10` **simples**. Cada habitación tiene su portada:

**Dobles (12)**

- `101-Doble-2026-10-05-1.jpg`
- `102-Doble-2026-10-05-1.jpg`
- `103-Doble-2026-10-05-1.jpg`
- `201-Doble-2026-10-05-1.jpg`
- `202-Doble-2026-10-05-1.jpg`
- `203-Doble-2026-10-05-1.jpg`
- `301-Doble-2026-10-05-1.jpg`
- `302-Doble-2026-10-05-1.jpg`
- `303-Doble-2026-10-05-1.jpg`
- `401-Doble-2026-10-05-1.jpg`
- `402-Doble-2026-10-05-1.jpg`
- `403-Doble-2026-10-05-1.jpg`

**Suites (8)**

- `104-Suite-2026-10-05-1.jpg`
- `105-Suite-2026-10-05-1.jpg`
- `204-Suite-2026-10-05-1.jpg`
- `205-Suite-2026-10-05-1.jpg`
- `304-Suite-2026-10-05-1.jpg`
- `305-Suite-2026-10-05-1.jpg`
- `404-Suite-2026-10-05-1.jpg`
- `405-Suite-2026-10-05-1.jpg`

**Simples (20)**

- `106-Simple-2026-10-05-1.jpg`
- `107-Simple-2026-10-05-1.jpg`
- `108-Simple-2026-10-05-1.jpg`
- `109-Simple-2026-10-05-1.jpg`
- `110-Simple-2026-10-05-1.jpg`
- `206-Simple-2026-10-05-1.jpg`
- `207-Simple-2026-10-05-1.jpg`
- `208-Simple-2026-10-05-1.jpg`
- `209-Simple-2026-10-05-1.jpg`
- `210-Simple-2026-10-05-1.jpg`
- `306-Simple-2026-10-05-1.jpg`
- `307-Simple-2026-10-05-1.jpg`
- `308-Simple-2026-10-05-1.jpg`
- `309-Simple-2026-10-05-1.jpg`
- `310-Simple-2026-10-05-1.jpg`
- `406-Simple-2026-10-05-1.jpg`
- `407-Simple-2026-10-05-1.jpg`
- `408-Simple-2026-10-05-1.jpg`
- `409-Simple-2026-10-05-1.jpg`
- `410-Simple-2026-10-05-1.jpg`

## Ilustraciones para los manuales

Cada imagen corresponde a un momento concreto de un manual. Las descripciones están escritas para que **las pueda dibujar
alguien que no conoce el sistema**: dicen qué tiene que verse, no cómo está hecho por dentro.

**Cómo usar esta página**

1. Elige la imagen de la tabla.
2. Dibújala con el nombre de fichero propuesto y guárdala en esta misma carpeta (`docs/imagenes/`).
3. En los manuales solo hay que cambiar la línea de texto por la imagen:
   `![descripción](imagenes/nombre-del-fichero.png)`.

**Paleta de la marca «Brisa Marina»** (para que todo combine; fuente de verdad:
`packages/config/tailwind/preset.cjs` y [`RepoTecnico/Manual_Identidad_Visual.md`](../../RepoTecnico/Manual_Identidad_Visual.md)
v2.0.0): porcelana fría de fondo (`mist #F4F9FC`), blanco (`shell`), **azur** (`azure #0F6C9C`) para
acciones y títulos, **coral** (`coral #C4522C`) para avisos, **helecho** (`fern #276E4C`) para
«correcto» y **ámbar** (`amber #B98324`) para la etiqueta de suite. El registro oscuro es **marino**
(`navy #0E2A3F` con detalle `pearl #C3D4E0`). Nada de colores fuera de estos: el guardián
`brand-pieces.test.ts` deriva los HEX del preset real y pone la suite roja si una pieza usa otro.

## Imágenes necesarias

| # | Fichero propuesto | Formato | Medidas | Dónde se usa | Qué debe mostrar |
|---|---|---|---|---|---|
| 1 | `doc-portada-hotel.svg` + `doc-portada-hotel.png` | SVG (y PNG a 1600×900) | 1600×900 | Portada de los tres manuales | El hotel visto desde el paseo marítimo con el mar al fondo. Encima, el nombre **«Hotel Marina del Sol»** y debajo, en una sola línea, **«50 habitaciones · Alicante · noches en propiedad»**. Sin logotipos de terceros y sin precios. |
| 2 | `doc-compra-tres-pasos.svg` | SVG | 1400×600 | `manual-comprador.md` §3 | Una fila de tres recuadros numerados, con una flecha entre cada uno. Recuadro 1: una rejilla de tarjetas de habitación con foto, fecha y precio, titulado **«1 · Elegir»**. Recuadro 2: una ventana con cinco líneas (Habitación, Noche, Importe, Token, Contrato) y el título **«2 · Revisar»**. Recuadro 3: un móvil con el aviso de la cartera y el título **«3 · Firmar»**. Bajo los tres, una frase: **«Se firma exactamente lo que se ha revisado»**. |
| 3 | `doc-panel-dueno.svg` | SVG | 1600×1000 | `manual-cliente.md` §4 | Una maqueta del panel del dueño: menú lateral con las palabras **Publicar noche, Métricas, Royalty, Pausa, Fondos, Caducadas, Roles**; arriba, siete cifras en tarjetas (**Vendido, Royalties, Reventa, Noches vendidas, Minteadas, Quemadas, Ocupación**); debajo, tres gráficos: barras por mes, barras por tipo de habitación (simple/doble/suite) y una lista de ranking de las más revendidas. Números de ejemplo redondos y creíbles, nunca datos reales de clientes. |
| 4 | `doc-pantalla-recepcion.svg` | SVG | 1400×900 | `manual-recepcion.md` §2 y §3 | La pantalla de recepción: título **«Validación de Recepción & Check-in»**, dos pestañas (**Escaneo QR / JWS** y **Protocolo de Contingencia (Sin Móvil)**), un lector de mano escaneando un móvil, el botón **Confirmar Check-in Inmediato** y, justo debajo, el cartel verde de éxito con habitación, fecha y el texto **«Anclado on-chain: 0x…»**. |
| 5 | `doc-resguardo-qr-codigo.svg` | SVG | 1200×800 | `manual-comprador.md` §5 y `manual-recepcion.md` §3 | Dos mitades. Izquierda: un móvil con un **código QR** grande y el texto **«Enséñalo en recepción»**. Derecha: una tarjeta de papel con un **código corto tipo `MDS-A1B2C3D4`** y el texto **«Plan B: apúntalo»**. Abajo, en una franja, el aviso **«Cada resguardo sirve una sola vez»**. |
| 6 | `doc-pantalla-reventa.svg` | SVG | 1400×900 | `manual-comprador.md` §6 | La pantalla **Reventa**: una rejilla de tarjetas con la etiqueta **Reventa**, el nombre de la habitación, la fecha, el precio y el botón **Reservar reventa**. Al lado, otra tarjeta con la etiqueta **En reventa** y los botones **Cambiar precio** y **Cancelar reventa**, titulada **«Mis noches»**. |
| 7 | `doc-esquema-compra-reventa.svg` | SVG | 1600×500 | `docs/README.md` y `manual-comprador.md` §1 | Una línea de tiempo de cinco paradas con iconos sencillos y una flecha que las une: **Comprar** (móvil con cartera) → **Resguardo** (QR en un móvil) → **Check-in** (mostrador con lector) → **Reventa** (dos manos intercambiando una tarjeta) → **Cobro** (moneda entrando en una cartera). Debajo de cada parada, una frase de máximo seis palabras. |
| 8 | `doc-esquema-quemado-12h.svg` | SVG | 1400×600 | `manual-cliente.md` §1 | Un reloj marcando las **12:00** en el centro. A la izquierda, tres tarjetas de noche con la etiqueta **«no vendida»** y una flecha hacia el centro. A la derecha, esas tarjetas con un sello **«retirada»** y el texto **«Sin intervención humana»**. Abajo, un cartel destacado: **«Una noche ya vendida a un cliente NUNCA se retira»**. |
| 9 | `doc-acceso-doble-factor.svg` | SVG | 1200×700 | `manual-cliente.md` §2 y `manual-recepcion.md` §1 | Tres cajas en fila con un candado cada una: **1. Usuario y contraseña**, **2. Código de 6 dígitos del móvil**, **3. Cartera conectada**. Debajo, una nota con el texto **«El código de 6 dígitos es solo para el personal del hotel»**. |

## Ilustraciones de los manuales del huésped

Generadas para los 17 casos de `docs/Manuales/06-huesped/`. Cada manual lleva su marcador
`<!-- GENERAR_IMAGEN: … -->` con el bloque Mermaid del que sale la imagen, y la referencia
`![…](imagenes/…)` que la inserta.

| # | Fichero | Formato | Medidas | Dónde se usa | Qué debe mostrar |
|---|---|---|---|---|---|
| 10 | `doc-huesped-estados-de-una-noche.svg` | SVG | 800×620 | `docs/Manuales/06-huesped/01-que-es-una-noche.md` | Diagrama de estados de una noche: el hotel publica → **Disponible**; la compras → **Tuya**; la pones a la venta → **En reventa**; la retiras → vuelve a **Tuya**; si pasa la fecha → **Expirada**; y de expirada el hotel la **Retira**. |
| 11 | `doc-huesped-flujo-compra.svg` | SVG | 800×560 | `04-comprar-una-noche.md` | Cuatro pasos encadenados: **Eliges la noche → Revisas el precio → Firmas en tu cartera → La noche es tuya**. |
| 12 | `doc-huesped-flujo-asistente.svg` | SVG | 800×700 | `07-pedir-al-asistente.md` | Cinco pasos: **Pides una noche al asistente → Comprueba disponibilidad y precio → Te prepara la reserva → Revisas y firmas → Aparece en Mis noches**. |
| 13 | `doc-huesped-flujo-reventa.svg` | SVG | 800×400 | `08-poner-tu-noche-en-reventa.md` | Tres pasos en horizontal: **Pones tu noche en reventa → Otro cliente la compra → Recibes el aviso**. |
| 14 | `doc-huesped-flujo-checkin.svg` | SVG | 800×700 | `10-entrar-con-tu-qr.md` | Cinco pasos: **Abres Mis noches → Pides tu resguardo QR → Firmas en tu cartera → Lo enseñas en recepción → Recepción registra tu entrada**. |
| 15 | `doc-huesped-flujo-checkout.svg` | SVG | 800×700 | `12-salir-y-cerrar-la-cuenta.md` | Cinco pasos: **Recoges tus cosas → Entregas habitación y llaves → Recepción revisa cómo quedó → Cancela los cargos que no se cobran → Cuenta cerrada y habitación pendiente de limpieza**. |
| 16 | `doc-huesped-infografia-casos.svg` | SVG | 1000×730 | `17-si-algo-no-funciona.md` y el índice `docs/Manuales/06-huesped/README.md` | Infografía con los **17 casos agrupados por momento**: Antes de llegar (01–02) · Conseguir tu noche (03–07) · Si te sobra la noche (08–09) · Durante la estancia (10–12) · Después (13–16) · Cuando algo va mal (17). |

> Estas siete piezas **no** se rasterizan a PNG: en este entorno el navegador de Playwright no
> arranca por falta de `libnspr4`/`libnss3`, y el guardián solo exige SVG para las ilustraciones de
> manual.

## Bloques Mermaid listos para pegar

Los dos diagramas siguientes se pueden pegar tal cual en cualquier visor de Mermaid (por ejemplo
GitHub, que los dibuja solo). Sirven como versión corregible de las imágenes 7 y 8.

### Diagrama 1 · Compra → resguardo → check-in → reventa → cobro

```mermaid
flowchart LR
    A["El cliente elige una noche<br/>en el catálogo o en la reventa"] --> B["Revisa lo que va a pagar:<br/>importe, noche y destino"]
    B --> C["Firma en su cartera<br/>Se firma lo revisado"]
    C --> D["La noche llega a su cartera<br/>como ficha digital única"]
    D --> E["Recibe el resguardo:<br/>QR en pantalla o código MDS-"]
    E --> F{"¿Va a poder ir?"}
    F -- "Sí" --> G["Check-in en recepción<br/>El check-in queda anotado en la cadena<br/>El mismo resguardo no sirve dos veces"]
    G --> H["La noche queda usada:<br/>ya no se puede revender"]
    F -- "No" --> I["Pone la noche en reventa<br/>con un precio por encima del mínimo"]
    I --> J["Otro cliente la compra<br/>y firma su propio pago"]
    J --> K["El hotel se queda su porcentaje:<br/>5 % en simple y doble, 10 % en suite"]
    J --> L["El vendedor cobra su saldo<br/>desde Mis noches"]
```

### Diagrama 2 · Quemado diario de las 12:00

```mermaid
flowchart TD
    S["Todos los días a las 12:00<br/>hora del hotel"] --> T["El sistema busca las noches del hotel<br/>cuya fecha ya ha caducado"]
    T --> U{"¿Se vendió alguna vez?"}
    U -- "Sí, es de un cliente" --> V["No se toca<br/>La noche sigue siendo del cliente"]
    U -- "No, sigue siendo del hotel" --> W["Se retira en lotes<br/>La operación se confirma en la cadena"]
    W --> X["Solo se marca lo que la cadena confirma"]
    X --> Y["El dueño no tiene que hacer nada<br/>y lo ve en Noches quemadas"]
```

## Infografías de los casos de uso

Las **32 infografías** de los manuales por caso de uso (más el mapa de iniciación) se generan con el
brief `RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md`, se referencian desde
`docs/Manuales/05-casos-de-uso/**` y se sirven en `/manual/imagenes/`. Mismo estilo y misma paleta
que las anteriores: banda `navy` con el número de CU, 3–5 pasos numerados en tarjetas y una
franja inferior con **Quién · Qué consigues · Si falla**.

| Fichero | Caso de uso representado | Bloque |
|---|---|---|
| `doc-cu-01-acceso-back-office.svg` | CU-01 · Entrar al panel del hotel con la cartera y el rol correcto | Bloque 1 · Iniciación |
| `doc-cu-12-royalty.svg` | CU-12 · Decidir cuánto se queda el hotel en cada reventa | Bloque 1 · Iniciación |
| `doc-cu-16-roles.svg` | CU-16 · Dar de alta a quien puede tocar el sistema (roles y propiedad) | Bloque 1 · Iniciación |
| `doc-cu-02-mintear-noche.svg` | CU-02 · Poner una noche a la venta (crear la ficha digital) | Bloque 2 · Inventario |
| `doc-cu-04-catalogo.svg` | CU-04 · Ver y filtrar las noches disponibles | Bloque 3 · Onboarding |
| `doc-cu-08-asistente-ia.svg` | CU-08 · Pedirle una noche al asistente y que prepare la compra | Bloque 3 · Onboarding |
| `doc-cu-09-historico.svg` | CU-09 · Mirar el histórico público de ventas | Bloque 3 · Onboarding |
| `doc-cu-17-onboarding-web3.svg` | CU-17 · Conectar la cartera y ponerse en la red correcta | Bloque 3 · Onboarding |
| `doc-cu-05-compra-primaria.svg` | CU-05 · Comprar una noche al hotel | Bloque 4 · Ventas |
| `doc-cu-06-listar-reventa.svg` | CU-06 · Poner mi noche en reventa (y quitarla) | Bloque 4 · Ventas |
| `doc-cu-07-compra-secundaria.svg` | CU-07 · Comprar una noche que otro cliente revende | Bloque 4 · Ventas |
| `doc-cu-10-aviso-email.svg` | CU-10 · Avisar al hotel por email cada vez que hay una venta | Bloque 5 · Postventa |
| `doc-cu-11-dashboard.svg` | CU-11 · Ver las métricas del negocio en el panel | Bloque 5 · Postventa |
| `doc-cu-13-caducadas.svg` | CU-13 · Retirar las noches del hotel que ya han caducado | Bloque 6 · Operación |
| `doc-cu-14-pausa.svg` | CU-14 · Parar el sistema en una emergencia y volver a arrancarlo | Bloque 6 · Operación |
| `doc-cu-15-retirar-fondos.svg` | CU-15 · Pasar el dinero recaudado a la cuenta del hotel | Bloque 6 · Operación |
| `doc-cu-pr-01-faucet.svg` | CU-PR-01 · Conseguir dinero de prueba (solo en pruebas) | Bloque 7 · Pruebas |
| `doc-cu-30-acceso-owner.svg` | CU-30 · Que el dueño lo vea y lo pueda todo | Bloque 8 · Hotelera (v2) |
| `doc-cu-31-panel-dia-recepcion.svg` | CU-31 · La pantalla del día en recepción | Bloque 8 · Hotelera (v2) |
| `doc-cu-32-buscar-reserva.svg` | CU-32 · Encontrar una reserva con el código de recuperación | Bloque 8 · Hotelera (v2) |
| `doc-cu-33-checkin-qr.svg` | CU-33 · Dar entrada al cliente escaneando su resguardo | Bloque 8 · Hotelera (v2) |
| `doc-cu-34-checkout.svg` | CU-34 · Dar salida y cerrar la cuenta de la habitación | Bloque 8 · Hotelera (v2) |
| `doc-cu-35-cargos-adicionales.svg` | CU-35 · Apuntar los extras del huésped (minibar, desayuno…) | Bloque 8 · Hotelera (v2) |
| `doc-cu-36-reventa-huesped.svg` | CU-36 · Que el huésped publique, cambie o retire su reventa | Bloque 8 · Hotelera (v2) |
| `doc-cu-37-avisos-reventa.svg` | CU-37 · Avisar al huésped cuando su reventa se mueve | Bloque 8 · Hotelera (v2) |
| `doc-cu-40-menu-wallet.svg` | CU-40 · El menú de la cartera y del usuario | Bloque 9 · Back-office (v3) |
| `doc-cu-41-seccion-sistemas.svg` | CU-41 · La sección «Sistemas» (solo para el dueño) | Bloque 9 · Back-office (v3) |
| `doc-cu-42-gestion-usuarios.svg` | CU-42 · Dar de alta, cambiar y quitar usuarios de la plataforma | Bloque 9 · Back-office (v3) |
| `doc-cu-43-gobernar-contrato.svg` | CU-43 · Gobernar el contrato (pausar, roles, royalty, propiedad) | Bloque 9 · Back-office (v3) |
| `doc-cu-44-finanzas-retirar.svg` | CU-44 · Ver las finanzas del hotel y retirar el dinero | Bloque 9 · Back-office (v3) |
| `doc-cu-45-operaciones.svg` | CU-45 · Ver qué está pasando ahora mismo (operaciones) | Bloque 9 · Back-office (v3) |
| `doc-cu-46-seguridad-operador.svg` | CU-46 · Proteger la cuenta del que manda | Bloque 9 · Back-office (v3) |
| `doc-mapa-iniciacion-sistema.svg` | Mapa de la iniciación del sistema: las 9 fases y sus 32 casos de uso | Portada de los índices |

---

*Índice de imágenes · Hotel Marina del Sol · cualquier imagen nueva, con el mismo estilo y la
misma paleta, evita que los manuales parezcan de proyectos distintos. El cumplimiento de los
nombres lo comprueba `apps/web/src/lib/images-naming.test.ts`.*
