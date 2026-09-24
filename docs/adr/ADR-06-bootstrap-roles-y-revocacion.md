# ADR-06 · Bootstrap de roles en el despliegue y revocación del desplegador

- **Estado**: vigente · **Fecha**: 2026-09-21 · **Decisiones de origen**: D-04, D-11

## Contexto

El despliegue dejaba la gobernanza en el EOA que desplegaba, de modo que la clave de despliegue
conservaba el control permanente del contrato.

## Decisión

`Deploy.s.sol` asigna los roles por bootstrap y **revoca `DEFAULT_ADMIN_ROLE` al desplegador**. El
administrador es la dirección configurada en `ADMIN_ADDRESS`, y el script comprueba con `cast` que el
desplegador ya no es admin.

Los roles del contrato son `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `BURNER_ROLE`, `RECEPTION_ROLE`,
`PAUSER_ROLE` y `TREASURER_ROLE`. La gobernanza definitiva aspira a un multisig 2-of-3 (Gnosis Safe,
`GNOSIS_SAFE_ADDRESS`, alcance D-11), pendiente de que el cliente designe firmantes.

## Consecuencias

- La clave de despliegue deja de ser una llave maestra sobre el contrato.
- En los E2E y en CI hay que declarar explícitamente `ADMIN_ADDRESS`, `BURNER_ROLE` y `PAUSER_ROLE`;
  si no, los guiones fallan aunque el despliegue sea correcto.
- La hot-wallet de quema es dedicada y solo tiene `BURNER_ROLE`; en local es la cuenta 2 de Anvil.
- El multisig es alcance pendiente, no un hecho entregado.

## Dónde se ve

`packages/contracts/script/Deploy.s.sol`, `packages/contracts/src/HotelNightsBootstrap.sol`, `packages/shared/src/domain/roles.ts`, `pnpm --filter @hotel/contracts sync`.
