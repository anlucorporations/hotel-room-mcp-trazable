# ADR-01 · Red canónica local y contrato único

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-01, D-02, D-20

## Contexto

El proyecto arrastraba dos generaciones de contratos (`HotelNFT` + `HotelMarketplace` y
`HotelNights`) y dos redes declaradas (Polygon Amoy/PoS y una Besu de laboratorio), sin que la
aplicación y el despliegue coincidieran: la web usaba una generación que no se desplegaba.

## Decisión

La red canónica del sistema es **Anvil local** en `http://127.0.0.1:8545` con `--chain-id 81234`,
espejo de la Besu de Codecrypto (ADR-17). El único contrato del runtime es **`HotelNights.sol`**,
desplegado por `packages/contracts/script/Deploy.s.sol` con bootstrap de roles (ADR-06).

El registro de despliegue que consumen worker, MCP y web es
`packages/shared/deployments/<chainId>.json` (dirección, bloque y `abiHash`), validado contra
`deployments/schema.ts` y generado por `scripts/sync-deployment.ts`.

El constructor de `HotelNights` recibe **solo la tesorería**: el segundo argumento de *basis points*
de royalty se eliminó al quedar sin efecto (D-20, ADR-18).

## Consecuencias

- Polygon pasa a ser **fase posterior**, con su coste, su dictamen legal y su presupuesto de gas; no
  es una afirmación de alcance entregado.
- `CHAIN_ID` vale `81234`; los registros crudos por cadena (p. ej. `deployments/31337.json`) no se
  versionan.
- El E2E ya no puede certificar «Amoy»: se retiró el guion que lo simulaba (ADR-23).

## Dónde se ve

`packages/shared/src/constants.ts`, `packages/shared/src/network.ts`, `apps/web/src/config/chain.ts`,
`packages/contracts/script/Deploy.s.sol`, `RepoTecnico/entornos_globales.md` §2.
