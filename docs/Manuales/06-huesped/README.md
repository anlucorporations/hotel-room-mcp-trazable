# Manuales del huésped — todo lo que puedes solicitar

Estos manuales explican, en lenguaje llano, **cada cosa que un huésped puede pedir o hacer** en la
plataforma del Hotel Marina del Sol. Son la versión literal (para personas) de los manuales técnicos
que están en `RepoTecnico/Manuales/06-huesped/`, con los mismos nombres de fichero.

> **Aviso sobre los datos del hotel.** Aquí solo hay procedimientos del producto, verificados contra el
> código real. La **dirección, los horarios, los precios de los servicios y las normas de la casa** no
> están en el repositorio: donde harían falta aparece `<!-- PENDIENTE DEL CLIENTE: … -->`. Ese contenido
> lo tiene que aportar el hotel en [`docs/manual-huesped.md`](../../manual-huesped.md).

## Antes de llegar

| # | Caso | Manual |
|---|---|---|
| 01 | Entender qué es una noche tokenizada y qué puedes hacer con ella | [01-que-es-una-noche.md](01-que-es-una-noche.md) |
| 02 | Preparar tu cartera y ponerte en la red correcta | [02-preparar-tu-cartera.md](02-preparar-tu-cartera.md) |

## Conseguir tu noche

| # | Caso | Manual |
|---|---|---|
| 03 | Ver qué noches hay disponibles y filtrar | [03-ver-noches-disponibles.md](03-ver-noches-disponibles.md) |
| 04 | Comprar una noche al hotel | [04-comprar-una-noche.md](04-comprar-una-noche.md) |
| 05 | Comprar una noche que otro cliente revende | [05-comprar-en-reventa.md](05-comprar-en-reventa.md) |
| 06 | Ver tus noches y en qué estado están | [06-mis-noches.md](06-mis-noches.md) |
| 07 | Pedirle una noche al asistente | [07-pedir-al-asistente.md](07-pedir-al-asistente.md) |

## Si te sobra la noche

| # | Caso | Manual |
|---|---|---|
| 08 | Poner tu noche en reventa, cambiar el precio o retirarla | [08-poner-tu-noche-en-reventa.md](08-poner-tu-noche-en-reventa.md) |
| 09 | Recibir avisos cuando tu reventa se mueve | [09-avisos-de-tu-reventa.md](09-avisos-de-tu-reventa.md) |

## Durante la estancia

| # | Caso | Manual |
|---|---|---|
| 10 | Dar entrada con tu resguardo QR | [10-entrar-con-tu-qr.md](10-entrar-con-tu-qr.md) |
| 11 | Extras y cargos mientras estás alojado | [11-extras-durante-la-estancia.md](11-extras-durante-la-estancia.md) |
| 12 | Salir del hotel y cerrar la cuenta | [12-salir-y-cerrar-la-cuenta.md](12-salir-y-cerrar-la-cuenta.md) |

## Después

| # | Caso | Manual |
|---|---|---|
| 13 | Dejar una reseña | [13-dejar-una-resena.md](13-dejar-una-resena.md) |
| 14 | Consultar el histórico público de ventas | [14-historico-de-ventas.md](14-historico-de-ventas.md) |
| 15 | Usar el menú de tu cartera y tu cuenta | [15-tu-menu-de-cartera.md](15-tu-menu-de-cartera.md) |
| 16 | Conseguir dinero de prueba (solo en el entorno de pruebas) | [16-dinero-de-prueba.md](16-dinero-de-prueba.md) |

## Cuando algo va mal

| # | Caso | Manual |
|---|---|---|
| 17 | Qué hacer si algo no funciona | [17-si-algo-no-funciona.md](17-si-algo-no-funciona.md) |

---

**Cómo se mantiene esto.** Los manuales técnicos de `RepoTecnico/Manuales/06-huesped/` se escriben
leyendo el código; los literales de aquí derivan de ellos. El asistente de la web responde con estos
contenidos: el índice se regenera con

```bash
corepack pnpm --filter @hotel/mcp run knowledge
```
