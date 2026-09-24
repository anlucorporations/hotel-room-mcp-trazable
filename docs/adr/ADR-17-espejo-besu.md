# ADR-17 · La red local es espejo de la Besu de Codecrypto

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-01

## Contexto

El equipo ya disponía de una red Besu de laboratorio (Codecrypto) y el proyecto necesitaba una cadena
local reproducible para desarrollar y verificar sin coste, sin introducir una segunda identidad de red
en la documentación ni en las claves.

## Decisión

La red canónica de desarrollo es **Anvil** con el **mismo `chainId` (81234)** que la Besu de
laboratorio, de modo que configuración, registro de despliegue y claves sirven indistintamente;
`NEXT_PUBLIC_NETWORK=besu` identifica la red privada y vacío significa Anvil.

## Consecuencias

- Una sola identidad de cadena en desarrollo.
- La red privada no es una red pública y **no** sirve para vender al público: eso exige Polygon y su
  dictamen (ADR-01); el guion de E2E que simulaba Amoy se retiró, así que esa red no se puede
  certificar (ADR-23).
- Las claves de Anvil son vectores públicos de prueba; en cualquier red real van a un gestor de secretos.

## Dónde se ve

`packages/shared/src/constants.ts`, `packages/shared/src/network.ts`, `.env.example`, `RepoTecnico/entornos_globales.md` §2.
