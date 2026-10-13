# ADR-27 · Royalty configurable por `ROYALTY_ADMIN` (revierte D-06)

- **Estado**: vigente · **Fecha**: 2026-10-13 · **Decisiones de origen**: RF-08, ciclo C1
- **Sustituye a**: D-06 (royalty inmutable por tipo), en lo relativo a la inmutabilidad
- **Trazabilidad**: `HotelNights.sol` (`ROYALTY_ADMIN_ROLE`, `setRoyaltyBps`, `royaltyBpsOf`),
  `IHotelNights.sol`, `HotelNightsBootstrap.sol`, `Deploy.s.sol`, `packages/shared/src/domain/roles.ts`,
  `packages/shared/src/constants.ts`, `AdminRoyalty.tsx`, `docs/SRS.md` §9 (CU-47)

## Contexto

El pliego (RF-08) pide un royalty ERC-2981 **configurable** por el rol `ROYALTY_ADMIN` en *basis
points*, rango 0–2000 y por defecto 1000. La implementación vigente desde D-06 fijó el royalty **por
construcción** a partir del tipo de habitación (500 bps simple/doble, 1000 bps suite) y **eliminó** el
rol y el setter. El informe de cumplimiento frente al repositorio de referencia
(`RepoTecnico/INFORME_CUMPLIMIENTO_REPO_ETH-EJERCICIOS.md` §8) marcó esa diferencia como la brecha
principal, porque además `REQUISITOS.md` seguía describiendo el requisito configurable: documento y
código se contradecían.

## Decisión

Se recupera la configurabilidad **sin renunciar a la política por tipo**:

1. El royalty vive en `mapping(bytes32 roomTypeHash => uint96 bps) private _royaltyBps`, inicializado
   en el constructor a los valores de D-06 (5 %/5 %/10 %). La migración no cambia el comportamiento
   por defecto.
2. `ROYALTY_ADMIN_ROLE` (`keccak256("ROYALTY_ADMIN_ROLE")`) puede llamar a
   `setRoyaltyBps(string roomType, uint96 bps)`; el rango válido es `0 ≤ bps ≤ ROYALTY_BPS_MAX` (2000
   bps = 20 %). `0` está permitido a propósito (desactivar el royalty es una decisión legítima del
   hotel) y queda auditado con el evento `RoyaltyUpdated(roomType, bps)`.
3. `royaltyBpsOf(string roomType)` expone el valor vigente para la UI y los tests. `royaltyInfo` sigue
   siendo la **fuente única** de ERC-2981 y lee de `_royaltyBps`.
4. El tipo se valida con el vocabulario cerrado (`InvalidRoomType`); el exceso revierte con
   `InvalidRoyaltyBps(bps)`.
5. El **bootstrap** (ADR-06) concede el rol: por defecto al admin (`ROYALTY_ADMIN_ADDRESS` permite
   segregarlo). En el piloto lo ejerce el owner (decisión A3 del responsable).
6. La **venta primaria sigue sin pagar royalty** y el reparto de `buyResale` sigue siendo exacto
   (*pull payments*, sin *wei* atrapados).

## Consecuencias

- **Redeploy obligatorio** (ADR-22, contrato inmutable): el contrato desplegado en Besu 81234 y en
  Anvil 31337 **no** expone aún el setter. El redeploy se ejecuta en una **ventana acordada** (decisión
  A2) con re-siembra; hasta entonces el panel del back-office detecta la versión antigua y **oculta el
  formulario** (no ofrece una transacción que revertiría) mientras muestra los valores vigentes.
- El ABI cambia (`pnpm gen:abi`) y debe desplegarse junto con la web y el MCP; `ALL_ROLE_NAMES` pasa de
  6 a 7 roles, lo que añade una lectura `hasRole` al login SIWE (compatible con el contrato antiguo:
  devuelve `false`, no revierte).
- Los marketplaces siguen viendo ERC-2981; el cambio de porcentaje es efectivo al instante para las
  reventas siguientes.
- Riesgo de gobierno: `ROYALTY_ADMIN` puede subir el royalty hasta el 20 %; el tope duro del contrato
  acota el daño y el evento hace la acción auditable. En producción el rol debería recaer en una
  wallet dedicada o un multisig (no en el owner personal).

## Alternativas descartadas

- **Royalty global único con valor por defecto 1000 bps**: es la lectura literal del pliego, pero rompe
  la política por tipo (D-06) y obliga a migrar expectativas de la UI y de los tests. Descartada por el
  responsable (decisión A1).
- **Royalty por `tokenId`**: máxima granularidad, pero añade almacenamiento y una superficie de gobierno
  desproporcionada para un piloto.
- **Dejar D-06**: mantiene la brecha con RF-08 y la contradicción documental.
