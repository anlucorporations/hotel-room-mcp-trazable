// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelNights} from "../src/HotelNights.sol";
import {NightAuction} from "../src/NightAuction.sol";
import {IHotelNightsAuctionView} from "../src/INightAuction.sol";

/**
 * @title DeployAuction
 * @notice Despliegue del contrato de subastas `NightAuction` (ciclo **C2** · RF-13) y concesión del
 *         rol `AUCTION_ROLE` en el contrato de noches al contrato desplegado.
 *
 * @dev Igual que `Deploy.s.sol`/`DeployOperations.s.sol`, la configuración se separa de la lógica:
 *      `run()` la lee del entorno y delega en `deployWithConfig()`, de modo que las pruebas son
 *      deterministas y no dependen de `vm.setEnv`.
 *
 *      `NightAuction` no es un proxy: su constructor concede `DEFAULT_ADMIN_ROLE`,
 *      `AUCTION_ADMIN_ROLE` y `PAUSER_ROLE` al admin indicado. Si el admin definitivo no es la
 *      cuenta desplegadora, el desplegador hace el *handover* y renuncia a `DEFAULT_ADMIN_ROLE`.
 *
 *      El rol `AUCTION_ROLE` del contrato de noches se concede **al contrato de subastas** (nunca a
 *      una wallet): es lo que le permite completar la venta primaria con `settleAuction`.
 *
 * Variables de entorno que lee `run()`:
 *   DEPLOYER_PRIVATE_KEY     (obligatoria) cuenta con fondos y con `DEFAULT_ADMIN_ROLE` en HotelNights
 *   CONTRACT_ADDRESS         (obligatoria) dirección de `HotelNights` ya desplegado
 *   AUCTION_ADMIN_ADDRESS    por defecto: deployer (en producción: el Safe multisig, ADR-06)
 */
contract DeployAuction is Script {
    struct Config {
        address hotel;
        address admin;
        /// @dev Directorio de salida del registro crudo (`*-auction.json`). Las pruebas lo apuntan a
        ///      un subdirectorio para no sobrescribir el registro real.
        string outputDir;
    }

    struct Deployment {
        address nightAuction;
    }

    /// @notice Punto de entrada de `forge script`: lee el entorno, despliega y hace el bootstrap.
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Config memory cfg;
        cfg.hotel = vm.envAddress("CONTRACT_ADDRESS");
        cfg.admin = vm.envOr("AUCTION_ADMIN_ADDRESS", vm.addr(deployerPk));
        cfg.outputDir = "./deployments";

        Deployment memory d = deployWithConfig(cfg, deployerPk);
        _logSummary(d, cfg);
    }

    /// @notice Despliega con una configuración explícita. Determinista, sin leer el entorno.
    function deployWithConfig(Config memory cfg, uint256 deployerPk)
        public
        returns (Deployment memory d)
    {
        require(cfg.hotel != address(0), "CONTRACT_ADDRESS vacio");
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);

        // El constructor concede los roles de la subasta a `deployer` (admin temporal) para que el
        // bootstrap sea posible sin la clave del admin final.
        NightAuction auction = new NightAuction(deployer, IHotelNightsAuctionView(cfg.hotel));

        // El contrato de subastas necesita AUCTION_ROLE en HotelNights para cerrar la venta
        // primaria. Lo concede quien administra el contrato de noches (el desplegador).
        HotelNights nights = HotelNights(cfg.hotel);
        if (!nights.hasRole(nights.AUCTION_ROLE(), address(auction))) {
            nights.grantRole(nights.AUCTION_ROLE(), address(auction));
        }

        // Handover de gobernanza de la subasta: el EOA desplegador desaparece como administrador.
        if (cfg.admin != deployer) {
            auction.grantRole(auction.DEFAULT_ADMIN_ROLE(), cfg.admin);
            auction.grantRole(auction.AUCTION_ADMIN_ROLE(), cfg.admin);
            auction.grantRole(auction.PAUSER_ROLE(), cfg.admin);
            auction.renounceRole(auction.DEFAULT_ADMIN_ROLE(), deployer);
            auction.renounceRole(auction.AUCTION_ADMIN_ROLE(), deployer);
            auction.renounceRole(auction.PAUSER_ROLE(), deployer);
        }

        vm.stopBroadcast();

        d.nightAuction = address(auction);
        _writeDeployment(d, cfg);
        return d;
    }

    /**
     * @dev Formato crudo que `scripts/sync-deployment.ts` completa con el `abiHash`. Se escribe en
     *      ficheros `*-auction.json` para no pisar el registro de `HotelNights` ni el de
     *      `HotelOperations`.
     */
    function _writeDeployment(Deployment memory d, Config memory cfg) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deploymentBlock", block.number);
        vm.serializeAddress(key, "hotel", cfg.hotel);
        vm.serializeAddress(key, "admin", cfg.admin);
        string memory json = vm.serializeAddress(key, "address", d.nightAuction);
        vm.writeJson(json, string.concat(cfg.outputDir, "/latest-auction.json"));
        vm.writeJson(
            json, string.concat(cfg.outputDir, "/", vm.toString(block.chainid), "-auction.json")
        );
    }

    function _logSummary(Deployment memory d, Config memory cfg) private pure {
        console2.log("=== DESPLIEGUE EXITOSO (NightAuction - C2) ===");
        console2.log("NightAuction:", d.nightAuction);
        console2.log("HotelNights:", cfg.hotel);
        console2.log("Admin de la subasta:", cfg.admin);
        console2.log("AUCTION_ROLE concedido al contrato de subastas");
    }
}
