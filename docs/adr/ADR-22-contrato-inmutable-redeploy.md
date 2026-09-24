# ADR-22 · El contrato no se actualiza: un cambio es un redespliegue

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-02, D-12

## Contexto

El sistema evolucionó varias veces (royalty por tipo, check-in, suelo de precio) y en algún momento hubo
que decidir si el contrato sería actualizable.

## Decisión

No hay *proxies* ni actualizabilidad: `HotelNights` es **inmutable**; un cambio de reglas es un
**redespliegue** con dirección nueva y, por tanto, un **registro de despliegue nuevo** que hay que
resincronizar (ADR-09). Reiniciar Anvil conserva la misma dirección determinista porque el nonce vuelve a
cero; **redesplegar sin reiniciar** produce otra dirección.

## Consecuencias

- El estado off-chain (índice, checkpoints, agregados) debe aceptar el cambio de contrato y **rebobinar**
  al bloque de despliegue cuando detecta un checkpoint por delante de la cabeza de la cadena. Caso real:
  `lag: -1532` reportando `ok` con los agregados a cero, ya corregido.
- En local hay que reiniciar Anvil, redesplegar
  (`forge script script/Deploy.s.sol:Deploy --broadcast`) y resincronizar.
- No hay migración de estado on-chain: un redespliegue en producción exigiría un plan explícito, que
  pertenece a la fase pública.

## Dónde se ve

`packages/contracts/src/HotelNights.sol`, `apps/worker/src/rebind.ts`, `apps/worker/src/main.ts`, `RepoTecnico/entornos_globales.md` §5.
