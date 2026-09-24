# ADR-14 · Cotización EUR con respaldo declarado

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: ninguna (requisito RNF-09, sin decisión formal)

## Contexto

El catálogo muestra el precio en cripto y su equivalente en euros. La fuente de cotización es un
servicio externo que puede caer, y un factor fijo silencioso daría un precio falso sin avisar.

## Decisión

El servicio de cotización consulta la fuente configurada (`COINGECKO_API_KEY`, respaldo
`BINANCE_FALLBACK_API_URL`) con caché. Si no hay cotización disponible se usa un valor de respaldo
**declarado y visible** (factor USD→EUR fijo y ~1,7 €/POL), nunca se inventa en silencio.

La conversión es informativa: el precio que se cobra es el que está en la cadena, en la moneda nativa.

## Consecuencias

- El equivalente en euros es una ayuda de decisión, no una obligación contractual.
- El respaldo debe revisarse antes de la fase pública, porque envejece.

## Dónde se ve

`packages/shared/src/rates/exchange-service.ts`, `apps/web/src/lib/assistant/chain-pricing.ts`.
