// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {HotelNights} from "../src/HotelNights.sol";

/**
 * @title DeployTest
 * @notice Verifica el despliegue del contrato canónico `HotelNights` (D-02): registro escrito
 *         en el formato que consume `sync-deployment.ts`, roles operativos concedidos, el EOA
 *         desplegador revocado como administrador y el faucet opcional.
 *
 * @dev Las pruebas llaman a `deployWithConfig()` con una configuración explícita en lugar de
 *      usar `run()` con `vm.setEnv`: en este arnés `setEnv` no se restaura entre funciones de
 *      prueba y los resultados dependen del orden de ejecución. El camino que lee el entorno
 *      queda cubierto de extremo a extremo por `scripts/smoke-deploy.sh` contra Anvil.
 *      El script escribe un fichero compartido, así que la suite corre en serie
 *      (`threads = 1` en `foundry.toml`).
 */
contract DeployTest is Test {
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ADMIN = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant TREASURY = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    uint256 internal constant DEFAULT_FLOOR = 1e16; // 0.01 ether

    Deploy internal script;
    address internal deployer;

    function setUp() public {
        script = new Deploy();
        deployer = vm.addr(DEPLOYER_PK);
        vm.deal(deployer, 1_000 ether);
        // Las pruebas escriben su registro en un subdirectorio: no tocan el real.
        vm.createDir("./deployments/test", true);
    }

    /**
     * @dev Directorio de salida PROPIO de cada prueba.
     *
     * Motivo: todas las pruebas de esta suite compartían `./deployments/test/latest.json`, y Foundry
     * ejecuta las funciones de prueba en paralelo. Cuando una escribía el registro (con o sin
     * `faucet`) entre el despliegue y la lectura de otra, la lectura veía el fichero de la otra y
     * `test_DeployFaucetWhenEnabled` fallaba con «faucet no registrado». Reproducido solo bajo
     * `pnpm test` (turbo), donde la carga hace más probable el entrelazado; con directorio propio,
     * cada prueba es independiente del orden y del paralelismo.
     */
    function _testOutputDir(string memory name) internal returns (string memory) {
        string memory dir = string.concat("./deployments/test/", name);
        vm.createDir(dir, true);
        return dir;
    }

    /// @dev Configuración base: todos los roles en el admin, sin faucet, suelo del contrato.
    function _baseConfig(string memory outputDir) internal pure returns (Deploy.Config memory cfg) {
        cfg.admin = ADMIN;
        cfg.treasury = TREASURY;
        cfg.minter = ADMIN;
        cfg.reception = ADMIN;
        cfg.pauser = ADMIN;
        cfg.burner = ADMIN;
        cfg.treasurer = ADMIN;
        cfg.minListingPrice = DEFAULT_FLOOR;
        cfg.deployFaucet = false;
        cfg.faucetAmount = 30 ether;
        cfg.faucetCooldown = 86_400;
        cfg.faucetLowThreshold = 150 ether;
        cfg.faucetFund = 0;
        cfg.outputDir = outputDir;
    }

    function _deploy(Deploy.Config memory cfg)
        internal
        returns (Deploy.Deployment memory d, string memory json)
    {
        d = script.deployWithConfig(cfg, DEPLOYER_PK);
        json = vm.readFile(string.concat(cfg.outputDir, "/latest.json"));
    }

    function test_DeployDefaultConfiguration() public {
        (Deploy.Deployment memory d, string memory json) =
            _deploy(_baseConfig(_testOutputDir("default")));
        HotelNights nft = HotelNights(d.hotelNights);

        // (1) Registro en el formato crudo que `sync-deployment.ts` completa con el `abiHash`.
        assertTrue(vm.keyExistsJson(json, ".address"), "address no escrito en latest.json");
        assertTrue(vm.keyExistsJson(json, ".chainId"), "chainId no escrito");
        assertTrue(vm.keyExistsJson(json, ".deploymentBlock"), "deploymentBlock no escrito");
        assertTrue(d.hotelNights != address(0), "direccion vacia");
        assertEq(vm.parseJsonAddress(json, ".address"), d.hotelNights, "address no coincide");
        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid, "chainId incorrecto");
        assertEq(nft.treasury(), TREASURY, "treasury incorrecto");

        // (2) Los seis roles recaen en el admin con la configuración por defecto.
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), ADMIN), "sin DEFAULT_ADMIN");
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), ADMIN), "sin MINTER_ROLE");
        assertTrue(nft.hasRole(nft.RECEPTION_ROLE(), ADMIN), "sin RECEPTION_ROLE");
        assertTrue(nft.hasRole(nft.PAUSER_ROLE(), ADMIN), "sin PAUSER_ROLE");
        assertTrue(nft.hasRole(nft.BURNER_ROLE(), ADMIN), "sin BURNER_ROLE");
        assertTrue(nft.hasRole(nft.TREASURER_ROLE(), ADMIN), "sin TREASURER_ROLE");

        // (3) El EOA desplegador no conserva la gobernanza (ADR-06).
        assertFalse(
            nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), deployer),
            "el EOA desplegador conserva DEFAULT_ADMIN_ROLE"
        );

        // (4) Suelo del contrato y sin faucet cuando no se solicita.
        assertEq(nft.minListingPrice(), DEFAULT_FLOOR, "suelo por defecto alterado");
        assertFalse(vm.keyExistsJson(json, ".faucet"), "faucet registrado sin solicitarlo");
    }

    function test_DeployGrantsRolesToDifferentOperators() public {
        Deploy.Config memory cfg = _baseConfig(_testOutputDir("roles"));
        address minter = makeAddr("minter");
        address reception = makeAddr("reception");
        address pauser = makeAddr("pauser");
        address burner = makeAddr("burner");
        address treasurer = makeAddr("treasurer");
        cfg.minter = minter;
        cfg.reception = reception;
        cfg.pauser = pauser;
        cfg.burner = burner;
        cfg.treasurer = treasurer;

        (Deploy.Deployment memory d,) = _deploy(cfg);
        HotelNights nft = HotelNights(d.hotelNights);

        assertTrue(nft.hasRole(nft.MINTER_ROLE(), minter), "MINTER no asignado");
        assertTrue(nft.hasRole(nft.RECEPTION_ROLE(), reception), "RECEPTION no asignado");
        assertTrue(nft.hasRole(nft.PAUSER_ROLE(), pauser), "PAUSER no asignado");
        assertTrue(nft.hasRole(nft.BURNER_ROLE(), burner), "BURNER no asignado");
        assertTrue(nft.hasRole(nft.TREASURER_ROLE(), treasurer), "TREASURER no asignado");
        // La segregación no concede roles operativos al admin por accidente.
        assertFalse(nft.hasRole(nft.MINTER_ROLE(), ADMIN), "MINTER concedido al admin sin pedirlo");
    }

    function test_DeployAppliesOverriddenFloor() public {
        Deploy.Config memory cfg = _baseConfig(_testOutputDir("floor"));
        cfg.minListingPrice = 2e16; // 0.02 ether

        (Deploy.Deployment memory d,) = _deploy(cfg);

        assertEq(HotelNights(d.hotelNights).minListingPrice(), 2e16, "suelo no aplicado");
    }

    function test_DeployFaucetWhenEnabled() public {
        Deploy.Config memory cfg = _baseConfig(_testOutputDir("faucet"));
        cfg.deployFaucet = true;
        cfg.faucetFund = 1 ether;

        (Deploy.Deployment memory d, string memory json) = _deploy(cfg);

        assertTrue(vm.keyExistsJson(json, ".faucet"), "faucet no registrado");
        assertTrue(d.faucet != address(0), "direccion de faucet vacia");
        assertEq(vm.parseJsonAddress(json, ".faucet"), d.faucet, "faucet no coincide");
        // El faucet queda financiado con el importe indicado.
        assertEq(d.faucet.balance, 1 ether, "faucet sin financiar");
    }

    function test_DeployKeepsDeployerAsAdminWhenItIsTheAdmin() public {
        Deploy.Config memory cfg = _baseConfig(_testOutputDir("deployer-admin"));
        cfg.admin = deployer; // handover innecesario: el admin ES el desplegador

        (Deploy.Deployment memory d,) = _deploy(cfg);

        assertTrue(
            HotelNights(d.hotelNights)
                .hasRole(HotelNights(d.hotelNights).DEFAULT_ADMIN_ROLE(), deployer),
            "el desplegador perdio el admin siendo el mismo el admin configurado"
        );
    }
}
