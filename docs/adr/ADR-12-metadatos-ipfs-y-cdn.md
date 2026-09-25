# ADR-12 · Metadatos en IPFS y entrega por gateway propio

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-11

## Contexto

Las imágenes y las fichas de las noches son parte del NFT y no pueden depender de un servicio de
terceros ni de rutas locales del servidor.

## Decisión

Los metadatos se referencian como `ipfs://<CID>` y la web los sirve a través de un **gateway/CDN
propio** (`next/image`), configurable. El pinning es un paso manual documentado (`pin-images.ts`,
`mint-image-demo.ts`), no automático.

## Consecuencias

- Descentralizar el almacenamiento sigue siendo alcance de segunda fase.
- En desarrollo y en las pruebas se usa SVG de relleno mientras no lleguen las **3 fotos definitivas**
  del cliente: bloqueante B-6.
- Cambiar de gateway no cambia los CIDs.

## Dónde se ve

`packages/shared/src/domain/ipfs.ts`, `packages/contracts/scripts/pin-images.ts`, `packages/contracts/scripts/mint-image-demo.ts`, `apps/web/src/components/NightImage.tsx`.
