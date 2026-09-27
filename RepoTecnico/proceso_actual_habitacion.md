# Proceso actual: «crear» una habitación y publicarla

> **Documento explicativo (solo lectura).** No modifica nada del proyecto.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto
> **Fuente**: código real (`apps/web`, `packages/shared`, `packages/contracts`, `apps/worker`).

---

## 0. La idea clave (en lenguaje común)

En el sistema actual **no existe una pantalla para crear una habitación**. La habitación no es algo que
se dé de alta desde la web: las **50 habitaciones del hotel ya vienen escritas a mano en el programa**
(el contrato y el paquete compartido). Tampoco se pueden subir fotos ni rellenar características
(capacidad, camas, metros, servicios...).

Lo que el administrador realmente hace en `/admin/mint` es **publicar una noche**: elige una habitación
que ya existe, una fecha y un precio, y eso crea un *token* vendible. Sus características no se escriben:
se **deducen del número de habitación**, y su imagen no se elige: **depende solo del tipo**.

Dicho de otro modo:

| Lo que pide `reestructuraHotel.md` | Lo que hace el sistema hoy |
|---|---|
| «Crear una habitación con sus características e imágenes» | No existe. Habitaciones fijas en código; características por rango numérico; 3 imágenes fijas por tipo |
| «Publicar una habitación» | Publicar una **noche** (habitación + fecha), que aparece en el catálogo |

---

## 1. Diagrama general del proceso actual

```mermaid
flowchart TD
    subgraph PRE["A. PREPARACIÓN (una sola vez, lo hace un programador)"]
        direction TB
        A1["Se escriben a mano las 50 habitaciones:<br/>101-130 (baja) y 201-220 (primera)<br/>en RoomMaster.sol y room-master.ts"]
        A2["Se suben 3 fotos, una por TIPO<br/>(simple, doble, suite)"]
        A3["Un script calcula el CID de cada foto<br/>(pnpm pin:images) y se pegan<br/>a mano en ipfs.ts (IMAGE_CIDS)"]
        A1 --> A4["El TIPO se deduce del número:<br/>101-115 = simple · 116-130 = doble · 201-220 = suite"]
        A2 --> A3 --> A5["La WEB muestra la foto del TIPO,<br/>no una foto propia de la habitación"]
    end

    subgraph OPE["B. PUBLICAR UNA NOCHE (operación diaria en /admin/mint)"]
        direction TB
        B1["El admin entra con<br/>usuario + contraseña + TOTP"]
        B2["Rellena: nº de habitación,<br/>fecha y precio (ETH).<br/>Opcional: lote de fechas seguidas (máx. 50)"]
        B3["El sistema valida:<br/>¿la habitación existe? ¿la fecha es real?"]
        B4["Se abre el modal TOTP<br/>y el admin teclea el código de 6 dígitos"]
        B5["La web pre-registra la fila en PostgreSQL<br/>(estado AVAILABLE, PERO sin anclar)"]
        B6["La wallet del admin firma y envía<br/>la transacción mint a HotelNights"]
        B7["La cadena confirma y emite el evento Mint"]
        B8["El worker ve el evento y actualiza la fila:<br/>ahora SÍ está anclada (hash real)"]
        B9["El catálogo solo muestra filas ancladas<br/>=> la noche YA está publicada"]
        B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7 --> B8 --> B9
    end

    PRE --> OPE
    B9 --> V["El comprador la ve en /<br/>con la foto de su tipo"]

    B5 -. "si NO se firma la transacción,<br/>la fila se queda sin anclar y<br/>NUNCA aparece en el catálogo" .-> X["Noche invisible"]
    B6 -. "si la transacción falla o se rechaza" .-> Y["Se queda pre-registrada<br/>pero invisible"]
```

---

## 2. De dónde sale cada característica (y de dónde NO)

```mermaid
flowchart LR
    R["Nº de habitación<br/>(101 ... 220)"] --> T{"¿En qué rango cae?"}
    T -->|101-115| S["simple"]
    T -->|116-130| D["doble"]
    T -->|201-220| U["suite"]
    R --> Metro["Metadatos del token:<br/>Habitación = nº<br/>Fecha = la elegida<br/>Tipo = el deducido"]
    S --> Img["Imagen simple.svg"]
    D --> Img2["Imagen doble.svg"]
    U --> Img3["Imagen suite.svg"]

    F["Formulario de admin"] --> P["Precio (ETH)"]
    F --> FE["Fecha de entrada"]
    F --> RN["Nº de habitación"]

    NA["NO existen en el sistema:<br/>capacidad · camas · metros ·<br/>planta · descripción · servicios ·<br/>fotos propias de la habitación"]
```

**Las únicas características que existen** son: número, tipo (deducido), fecha y precio. Todo lo demás
(galería, comodidades, aforo, descripción propia) **no está modelado**.

---

## 3. El proceso de «imágenes», en detalle (es manual y está fuera de la web)

```mermaid
flowchart TD
    I1["Existen 3 ficheros en el repositorio:<br/>public/images/simple.svg, doble.svg, suite.svg"]
    I2["Se ejecuta a mano:<br/>pnpm --filter @hotel/contracts pin:images ..."]
    I3["El script calcula el CID de cada imagen<br/>y, si hay PINATA_JWT, la sube a Pinata"]
    I4["El programador COPIA esos CIDs<br/>al código fuente (ipfs.ts → IMAGE_CIDS)"]
    I5["La metadata del token guarda:<br/>image = ipfs://CID"]
    I6["La web NO usa esa metadata:<br/>pinta /images/{tipo}.svg directamente"]
    I1 --> I2 --> I3 --> I4 --> I5
    I4 --> I6
    N["No hay pantalla de subida<br/>de imágenes en el back-office"]
```

En resumen: **cambiar una foto exige tocar el repositorio, ejecutar un script y editar código**. Un
administrador del hotel no puede hacerlo solo.

---

## 4. Vista de actores y responsabilidades (quién hace qué)

```mermaid
flowchart TB
    DEV["Programador"] -->|"define habitaciones y pega CIDs"| CODIGO["Código + Contrato"]
    ADM["Administrador / Owner"] -->|"publica noches"| WEB["Web /admin/mint"]
    WALLET["Wallet del admin"] -->|"firma mint"| CHAIN["HotelNights (cadena)"]
    CHAIN -->|"evento Mint"| WORKER["Worker"]
    WORKER -->|"ancla y consolida"| DB["PostgreSQL"]
    DB -->|"catálogo"| PUB["Web pública /"]
    LIMP["Personal de limpieza"] -.->|"NO interviene hoy"| X1["—"]
    RECEP["Recepción"] -.->|"solo check-in/out"| X2["—"]
```

**Nadie del hotel (limpieza, mantenimiento, recepción) participa en la creación o publicación**; es un
proceso técnico de programador + admin con wallet.

---

## 5. Paso a paso narrado (versión corta)

**Antes (solo una vez, por un programador):**
1. Se escriben las 50 habitaciones y sus rangos de tipo en `RoomMaster.sol` y `room-master.ts`.
2. Se eligen 3 fotos (una por tipo), se calculan sus CIDs con un script y se pegan en `ipfs.ts`.

**Cada vez que se publica una noche (el admin, en `/admin/mint`):**
3. Entra con usuario + contraseña + TOTP.
4. Elige nº de habitación, fecha y precio (o un lote de fechas seguidas, hasta 50).
5. El sistema comprueba que la habitación esté en el maestro y que la fecha sea real; el tipo lo deduce solo.
6. Reconfirma el TOTP en un modal.
7. La web **pre-registra** la noche en PostgreSQL (estado «disponible», pero **sin anclar**).
8. La wallet del admin firma y envía la transacción `mint(...)` al contrato.
9. La cadena confirma y emite el evento `Mint`.
10. El **worker** ve el evento, escribe el *hash real* y marca la fila como **anclada**.
11. Como el catálogo solo enseña filas ancladas, **la noche aparece publicada** en `/` con la foto de su tipo.

**Publicación secundaria (reventa):** el dueño de una noche la pone en venta desde `/mis-noches`
(`list`), y aparece en `/reventa`. Es un flujo distinto del de alta.

---

## 6. Diferencias con lo que pide la reestructuración (lo que habría que construir)

| Necesidad del nuevo modelo | Situación actual | Qué falta |
|---|---|---|
| Ente «Habitación» con ficha | Deducida de un número | Tabla `rooms`, formulario y ficha |
| Características propias (capacidad, camas, servicios...) | No existen | Modelo de atributos |
| Galería de imágenes por habitación | 1 imagen por tipo | Subida, almacenamiento y galería |
| Estado operativo (Limpia/Sucia/Mantenimiento/Ocupada) | No existe | Entidad de estado + housekeeping |
| Publicar/despublicar una habitación | Se publica por noche | Concepto de oferta/publicación |
| Que el personal gestione habitaciones | Solo programador + admin con wallet | Pantallas sin wallet |

> Nota de fricción detectada: la pantalla `/admin/mint` exige rol **MINTER** para mostrarse, pero la API
> `POST /api/admin/mint` exige **DEFAULT_ADMIN**. Un operador con solo MINTER vería el formulario y
> recibiría un 403 al enviarlo.

---

*Documento explicativo v1 · @asistenteProyecto.*
