# ADR-13 · Faucet de pruebas solo en red local

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-11

## Contexto

Para demostrar el ciclo completo hacía falta ETH de prueba para las wallets del personal y de los
probadores, pero un faucet desplegado por descuido en una red pública reparte fondos reales.

## Decisión

`Faucet.sol` es una utilidad de demo que se despliega **solo si `DEPLOY_FAUCET=true`**, con un depósito
acotado (`FAUCET_FUND_WEI`). La UI del faucet se oculta si no hay `NEXT_PUBLIC_FAUCET_ADDRESS`. El
despliegue canónico en Anvil lo financia con 100 ETH de prueba.

## Consecuencias

- En el registro de despliegue la entrada `faucet` es **opcional** y nunca debe aparecer fuera de
  desarrollo o pruebas.
- El faucet no forma parte del camino de compra.

## Dónde se ve

`packages/contracts/src/Faucet.sol`, `packages/contracts/script/Deploy.s.sol`, `packages/shared/src/deployments/schema.ts`, `apps/web/src/components/wallet/useFaucet.ts`.
