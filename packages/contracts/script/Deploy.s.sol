// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelNights} from "../src/HotelNights.sol";
import {HotelNightsBootstrap} from "../src/HotelNightsBootstrap.sol";
import {Faucet} from "../src/Faucet.sol";

/**
 * @title Deploy
 * @notice Despliega `HotelNights` y ejecuta el bootstrap de roles (ADR-06):
 *         deploy con EOA → concede los 6 roles al admin definitivo → transfiere la
 *         propiedad (2 pasos) y revoca el EOA desplegador.
 *
 *         Opcionalmente (RF-21, ADR-13) despliega y financia el `Faucet` de pruebas,
 *         gateado por `DEPLOY_FAUCET` (por defecto sí en dev/test/aceptación). En PRODUCCIÓN
 *         se invoca con `DEPLOY_FAUCET=false`: el faucet NO va a producción. El owner del
 *         faucet queda en el EOA desplegador (dev/test) para poder `drain` el saldo sobrante.
 *
 * Variables de entorno requeridas (inyectadas por el secret manager / CI, T0.3):
 *   - DEPLOYER_PRIVATE_KEY : clave del EOA que despliega
 *   - ADMIN_ADDRESS        : admin definitivo (Safe en producción) que recibe los roles
 *   - TREASURY_ADDRESS     : dirección receptora de ingresos/royalties
 *   - ROYALTY_BPS          : (opcional) royalty inicial en bps; por defecto 1000 (10 %)
 *
 * Variables de entorno opcionales del faucet (solo dev/test):
 *   - DEPLOY_FAUCET        : (opcional) si se despliega el faucet; por defecto true
 *   - FAUCET_AMOUNT        : (opcional) ETH por dispensación; por defecto 0.5 ether
 *   - FAUCET_COOLDOWN      : (opcional) ventana mínima entre dispensas; por defecto 0 (demo)
 *   - FAUCET_LOW_THRESHOLD : (opcional) umbral de saldo bajo; por defecto FAUCET_AMOUNT*10
 *   - FAUCET_FUNDING       : (opcional) ETH con que se financia el faucet; por defecto 100 ether
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasuryAddr = vm.envAddress("TREASURY_ADDRESS");
        uint96 royaltyBps = uint96(vm.envOr("ROYALTY_BPS", uint256(1000)));

        // Faucet (RF-21): opcional y gateado por env (ADR-13). En prod: DEPLOY_FAUCET=false.
        bool deployFaucet = vm.envOr("DEPLOY_FAUCET", true);
        uint256 faucetAmount = vm.envOr("FAUCET_AMOUNT", uint256(0.5 ether));
        uint256 faucetCooldown = vm.envOr("FAUCET_COOLDOWN", uint256(0));
        uint256 faucetLowThreshold = vm.envOr("FAUCET_LOW_THRESHOLD", faucetAmount * 10);
        uint256 faucetFunding = vm.envOr("FAUCET_FUNDING", uint256(100 ether));

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

        // Faucet de pruebas: el `Ownable(msg.sender)` deja al EOA desplegador como owner
        // (para `drain`). Se financia desde el mismo broadcast con `fund{value:...}`.
        address faucetAddr = address(0);
        if (deployFaucet) {
            Faucet faucet = new Faucet(faucetAmount, faucetCooldown, faucetLowThreshold);
            if (faucetFunding > 0) {
                faucet.fund{value: faucetFunding}();
            }
            faucetAddr = address(faucet);
        }

        vm.stopBroadcast();

        _writeDeployment(address(nft), faucetAddr);

        console2.log("HotelNights desplegado en:", address(nft));
        console2.log("Admin (6 roles):", admin);
        console2.log("Treasury:", treasuryAddr);
        console2.log("EOA desplegador revocado:", admin != deployer);
        if (deployFaucet) {
            console2.log("Faucet desplegado en:", faucetAddr);
            console2.log("Faucet financiado (wei):", faucetFunding);
        } else {
            console2.log("Faucet: no desplegado (DEPLOY_FAUCET=false)");
        }
    }

    /**
     * @param nft    Dirección del NFT desplegado.
     * @param faucet Dirección del faucet, o `address(0)` si no se desplegó (no se serializa).
     */
    function _writeDeployment(address nft, address faucet) internal {
        // `block.number` aquí es el de la simulación (puede ser 0): es un placeholder. La
        // fuente fiable del bloque de creación es el recibo del broadcast, que recupera
        // `scripts/sync-deployment.ts` al sincronizar a `packages/shared` (paso obligatorio).
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "address", nft);
        // Solo serializamos `faucet` si existe, para no escribir address(0) en producción.
        if (faucet != address(0)) {
            vm.serializeAddress(key, "faucet", faucet);
        }
        string memory json = vm.serializeUint(key, "deploymentBlock", block.number);
        vm.writeJson(json, "./deployments/latest.json");
    }
}
