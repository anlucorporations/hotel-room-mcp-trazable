// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelNights} from "../src/HotelNights.sol";
import {Faucet} from "../src/Faucet.sol";

/**
 * @title Deploy
 * @notice Despliegue del contrato **canónico** `HotelNights` (decisión D-02) con bootstrap de
 *         roles (ADR-06) y faucet opcional de pruebas (ADR-13 / D-11).
 *
 * @dev La pareja `HotelNFT` + `HotelMarketplace` es legacy y ya NO se despliega: ningún
 *      consumidor del monorepo la usa.
 *
 *      La configuración se separa de la lógica a propósito: `run()` la lee del entorno y
 *      delega en `deployWithConfig()`, que recibe una estructura explícita. Así las pruebas
 *      verifican el despliegue de forma determinista, sin depender de `vm.setEnv` (que en este
 *      arnés no se restaura entre funciones de prueba y da resultados según el orden).
 *
 * Variables de entorno que lee `run()`:
 *   DEPLOYER_PRIVATE_KEY  (obligatoria)
 *   ADMIN_ADDRESS         por defecto: deployer
 *   TREASURY_ADDRESS      por defecto: deployer (en producción: la tesorería del hotel)
 *   MINTER_ADDRESS / RECEPTION_ADDRESS / PAUSER_ADDRESS / BURNER_ADDRESS / TREASURER_ADDRESS
 *                         por defecto: el admin (es el operador del hotel)
 *   MIN_LISTING_PRICE     por defecto: 0.01 ether (el valor del propio contrato)
 *   DEPLOY_FAUCET         "true" para desplegar el faucet (nunca en producción)
 *   FAUCET_AMOUNT_WEI / FAUCET_COOLDOWN_SECONDS / FAUCET_LOW_THRESHOLD_WEI / FAUCET_FUND_WEI
 */
contract Deploy is Script {
    /// @dev Valores por defecto del faucet para desarrollo (equivalentes a `constants.ts`).
    uint256 internal constant DEFAULT_FAUCET_AMOUNT = 30 ether;
    uint256 internal constant DEFAULT_FAUCET_COOLDOWN = 86_400; // 24 h
    uint256 internal constant DEFAULT_FAUCET_LOW_THRESHOLD = 150 ether; // 5 × amount
    uint256 internal constant DEFAULT_MIN_LISTING_PRICE = 0.01 ether;

    struct Config {
        address admin;
        address treasury;
        address minter;
        address reception;
        address pauser;
        address burner;
        address treasurer;
        uint256 minListingPrice;
        bool deployFaucet;
        uint256 faucetAmount;
        uint256 faucetCooldown;
        uint256 faucetLowThreshold;
        uint256 faucetFund;
        /// @dev Directorio de salida del registro crudo. Las pruebas lo apuntan a un
        ///      subdirectorio para NO sobrescribir el registro real: sin esto, cada
        ///      `forge test` reescribia `deployments/latest.json` y `deployments/31337.json`
        ///      con la direccion efimera del contrato de prueba.
        string outputDir;
    }

    struct Deployment {
        address hotelNights;
        address faucet;
    }

    /// @notice Punto de entrada de `forge script`: lee el entorno y despliega.
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Config memory cfg = configFromEnv(vm.addr(deployerPk));
        cfg.outputDir = "./deployments";
        Deployment memory d = deployWithConfig(cfg, deployerPk);
        _logSummary(d, cfg);
    }

    /// @notice Traduce el entorno a una configuración explícita.
    function configFromEnv(address deployer) public view returns (Config memory cfg) {
        cfg.admin = vm.envOr("ADMIN_ADDRESS", deployer);
        cfg.treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        // Los roles operativos recaen por defecto en el admin: es el operador del hotel.
        // La segregación real (hot-wallets distintas) se configura por entorno.
        cfg.minter = vm.envOr("MINTER_ADDRESS", cfg.admin);
        cfg.reception = vm.envOr("RECEPTION_ADDRESS", cfg.admin);
        cfg.pauser = vm.envOr("PAUSER_ADDRESS", cfg.admin);
        cfg.burner = vm.envOr("BURNER_ADDRESS", cfg.admin);
        cfg.treasurer = vm.envOr("TREASURER_ADDRESS", cfg.admin);

        cfg.minListingPrice = vm.envOr("MIN_LISTING_PRICE", DEFAULT_MIN_LISTING_PRICE);
        cfg.deployFaucet = vm.envOr("DEPLOY_FAUCET", false);
        cfg.faucetAmount = vm.envOr("FAUCET_AMOUNT_WEI", DEFAULT_FAUCET_AMOUNT);
        cfg.faucetCooldown = vm.envOr("FAUCET_COOLDOWN_SECONDS", DEFAULT_FAUCET_COOLDOWN);
        cfg.faucetLowThreshold = vm.envOr("FAUCET_LOW_THRESHOLD_WEI", DEFAULT_FAUCET_LOW_THRESHOLD);
        cfg.faucetFund = vm.envOr("FAUCET_FUND_WEI", uint256(0));
    }

    /// @notice Despliega con una configuración explícita. Determinista, sin leer el entorno.
    function deployWithConfig(Config memory cfg, uint256 deployerPk)
        public
        returns (Deployment memory d)
    {
        vm.startBroadcast(deployerPk);

        // 1. Contrato canónico. El 2.º argumento (bps de royalty) no tiene efecto desde D-06:
        //    el royalty se deriva del tipo de habitación y es inmutable.
        HotelNights nft = new HotelNights(cfg.treasury);

        // 2. Roles operativos
        if (cfg.minter != address(0)) nft.grantRole(nft.MINTER_ROLE(), cfg.minter);
        if (cfg.reception != address(0)) nft.grantRole(nft.RECEPTION_ROLE(), cfg.reception);
        if (cfg.pauser != address(0)) nft.grantRole(nft.PAUSER_ROLE(), cfg.pauser);
        if (cfg.burner != address(0)) nft.grantRole(nft.BURNER_ROLE(), cfg.burner);
        if (cfg.treasurer != address(0)) nft.grantRole(nft.TREASURER_ROLE(), cfg.treasurer);

        // 3. Suelo anti-evasión de royalty (D-06), solo si difiere del valor del contrato
        if (cfg.minListingPrice != nft.minListingPrice()) {
            nft.setMinListingPrice(cfg.minListingPrice);
        }

        // 4. Faucet de pruebas (RF-21): nunca en producción.
        if (cfg.deployFaucet) {
            Faucet faucet = new Faucet(cfg.faucetAmount, cfg.faucetCooldown, cfg.faucetLowThreshold);
            d.faucet = address(faucet);
            if (cfg.faucetFund > 0) {
                faucet.fund{value: cfg.faucetFund}();
            }
        }

        // 5. Handover de gobernanza: el EOA desplegador desaparece como administrador.
        address deployer = vm.addr(deployerPk);
        if (cfg.admin != deployer) {
            nft.grantRole(nft.DEFAULT_ADMIN_ROLE(), cfg.admin);
            nft.renounceRole(nft.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();

        d.hotelNights = address(nft);
        _writeDeployment(d, cfg.outputDir);
        return d;
    }

    /**
     * @dev Formato crudo que `scripts/sync-deployment.ts` completa con el `abiHash`.
     *      La clave `faucet` solo se escribe si hay faucet: escribir la dirección cero haría
     *      que el esquema de validación la aceptase como faucet legítimo.
     */
    function _writeDeployment(Deployment memory d, string memory outputDir) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deploymentBlock", block.number);
        string memory json = vm.serializeAddress(key, "address", d.hotelNights);
        if (d.faucet != address(0)) {
            json = vm.serializeAddress(key, "faucet", d.faucet);
        }
        vm.writeJson(json, string.concat(outputDir, "/latest.json"));
        vm.writeJson(json, string.concat(outputDir, "/", vm.toString(block.chainid), ".json"));
    }

    function _logSummary(Deployment memory d, Config memory cfg) private pure {
        console2.log("=== DESPLIEGUE EXITOSO (HotelNights) ===");
        console2.log("HotelNights:", d.hotelNights);
        console2.log("Treasury:", cfg.treasury);
        console2.log("Admin definitivo:", cfg.admin);
        console2.log("MINTER:", cfg.minter);
        console2.log("RECEPTION:", cfg.reception);
        console2.log("Min listing price (wei):", cfg.minListingPrice);
        if (d.faucet != address(0)) {
            console2.log("Faucet (solo pruebas):", d.faucet);
        }
    }
}
