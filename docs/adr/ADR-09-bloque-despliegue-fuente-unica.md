# ADR-09 · El bloque de despliegue es la fuente única del escaneo

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-02, D-12

## Contexto

Cada componente (worker, web, MCP) elegía por su cuenta desde qué bloque empezar a leer `getLogs`, con
un respaldo en modo fail-open cuando no lo encontraba. El resultado era indexación incompleta o
lecturas desde el bloque 0.

## Decisión

El registro `packages/shared/deployments/<chainId>.json` (dirección, bloque y `abiHash`, validado contra
`deployments/schema.ts`) es la **fuente única**. `NEXT_PUBLIC_DEPLOYMENT_BLOCK` se rellena al desplegar
y todos los lectores parten de ahí.

El MCP reescanea desde el bloque de despliegue paginando. La web degrada a lectura RPC cuando no hay
índice disponible.

## Consecuencias

- Cualquier redespliegue exige resincronizar el registro (`pnpm --filter @hotel/contracts sync`) y
  actualizar `.env`.
- Reiniciar Anvil conserva la dirección determinista, pero cambia el bloque.
- El worker rebobina el checkpoint al bloque de despliegue si detecta que va por delante de la cabeza:
  caso real medido, `lag: -1523` reportando `ok`.

## Dónde se ve

`packages/shared/src/deployments/schema.ts`, `packages/contracts/scripts/sync-deployment.ts`, `apps/web/src/config/chain.ts`, `apps/worker/src/rebind.ts`, `apps/mcp/src/chain/viem-chain-reader.ts`.
