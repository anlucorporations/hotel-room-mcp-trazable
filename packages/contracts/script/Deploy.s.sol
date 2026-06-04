// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelNights} from "../src/HotelNights.sol";
import {HotelNightsBootstrap} from "../src/HotelNightsBootstrap.sol";

/**
 * @title Deploy
 * @notice Despliega `HotelNights` y ejecuta el bootstrap de roles (ADR-06):
 *         deploy con EOA → concede los 6 roles al admin definitivo → transfiere la
 *         propiedad (2 pasos) y revoca el EOA desplegador.
 *
 * Variables de entorno requeridas (inyectadas por el secret manager / CI, T0.3):
 *   - DEPLOYER_PRIVATE_KEY : clave del EOA que despliega
 *   - ADMIN_ADDRESS        : admin definitivo (Safe en producción) que recibe los roles
 *   - TREASURY_ADDRESS     : dirección receptora de ingresos/royalties
 *   - ROYALTY_BPS          : (opcional) royalty inicial en bps; por defecto 1000 (10 %)
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasuryAddr = vm.envAddress("TREASURY_ADDRESS");
        uint96 royaltyBps = uint96(vm.envOr("ROYALTY_BPS", uint256(1000)));

        vm.startBroadcast(deployerPk);

        HotelNights nft = new HotelNights(treasuryAddr, royaltyBps);
        HotelNightsBootstrap.grantRolesTo(nft, admin);

        // Si el admin definitivo es distinto del EOA: iniciar la transferencia de propiedad
        // (Ownable2Step) y revocar el DEFAULT_ADMIN del EOA. IMPORTANTE: el despliegue NO
        // queda completo hasta que el admin/Safe llame `acceptOwnership()` (2.º paso); hasta
        // entonces `owner()` sigue siendo el EOA, aunque ya sin DEFAULT_ADMIN_ROLE (sin poder
        // sobre la lógica de negocio, que se gobierna por roles). Ver runbook (RNF-21).
        if (admin != deployer) {
            nft.transferOwnership(admin);
            nft.renounceRole(nft.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();

        _writeDeployment(address(nft));

        console2.log("HotelNights desplegado en:", address(nft));
        console2.log("Admin (6 roles):", admin);
        console2.log("Treasury:", treasuryAddr);
        console2.log("EOA desplegador revocado:", admin != deployer);
    }

    function _writeDeployment(address nft) internal {
        // `block.number` aquí es el de la simulación (puede ser 0): es un placeholder. La
        // fuente fiable del bloque de creación es el recibo del broadcast, que recupera
        // `scripts/sync-deployment.ts` al sincronizar a `packages/shared` (paso obligatorio).
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "address", nft);
        string memory json = vm.serializeUint(key, "deploymentBlock", block.number);
        vm.writeJson(json, "./deployments/latest.json");
    }
}
