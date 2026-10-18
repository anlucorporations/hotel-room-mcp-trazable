// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployOperations} from "../script/DeployOperations.s.sol";
import {HotelOperations} from "../src/HotelOperations.sol";

/**
 * @title DeployOperationsTest
 * @notice Verifica el bootstrap de `HotelOperations` (F2 · §3 y §9.5): roles de los jefes, respaldo
 *         `OWNER_BACKUP`, handover de gobernanza (el EOA desplegador renuncia) y el registro crudo
 *         que consume `sync-deployment.ts`.
 *
 * @dev Igual que `Deploy.s.t.sol`, se llama a `deployWithConfig()` con una configuración explícita en
 *      vez de `run()` con `vm.setEnv`: `setEnv` no se restaura entre funciones de prueba en este
 *      arnés. El script escribe un fichero compartido, así que cada prueba usa su propio directorio.
 */
contract DeployOperationsTest is Test {
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ADMIN = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant HEAD_MAINTENANCE = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant HEAD_KEEPER = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    address internal constant OWNER_BACKUP = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;

    DeployOperations internal script;
    address internal deployer;

    function setUp() public {
        script = new DeployOperations();
        deployer = vm.addr(DEPLOYER_PK);
        vm.deal(deployer, 1_000 ether);
        vm.createDir("./deployments/test", true);
    }

    function _testOutputDir(string memory name) internal returns (string memory) {
        string memory dir = string.concat("./deployments/test/", name);
        vm.createDir(dir, true);
        return dir;
    }

    function _config(string memory outputDir)
        internal
        view
        returns (DeployOperations.Config memory cfg)
    {
        cfg.admin = ADMIN;
        cfg.headMaintenance = HEAD_MAINTENANCE;
        cfg.headKeeper = HEAD_KEEPER;
        cfg.ownerBackup = OWNER_BACKUP;
        cfg.ownerBackupForRole = keccak256("HEAD_MAINTENANCE_ROLE");
        cfg.outputDir = outputDir;
    }

    function test_DeployBootstrapRolesYRespaldo() public {
        string memory dir = _testOutputDir("bootstrap");
        DeployOperations.Deployment memory d = script.deployWithConfig(_config(dir), DEPLOYER_PK);
        HotelOperations ops = HotelOperations(d.hotelOperations);

        // Roles de los jefes y respaldo de emergencia.
        assertTrue(
            ops.hasRole(ops.HEAD_MAINTENANCE_ROLE(), HEAD_MAINTENANCE), "sin HEAD_MAINTENANCE"
        );
        assertTrue(ops.hasRole(ops.HEAD_KEEPER_ROLE(), HEAD_KEEPER), "sin HEAD_KEEPER");
        assertEq(
            ops.backupForRole(ops.HEAD_MAINTENANCE_ROLE()), OWNER_BACKUP, "respaldo no registrado"
        );

        // Handover: el admin final manda y el EOA desplegador ya no es administrador.
        assertTrue(
            ops.hasRole(ops.DEFAULT_ADMIN_ROLE(), ADMIN), "el admin no tiene DEFAULT_ADMIN_ROLE"
        );
        assertFalse(
            ops.hasRole(ops.DEFAULT_ADMIN_ROLE(), deployer), "el desplegador NO fue revocado"
        );

        // Registro crudo en el formato que completa `sync-deployment.ts`.
        string memory json = vm.readFile(string.concat(dir, "/latest-operations.json"));
        assertTrue(vm.keyExistsJson(json, ".address"), "address no escrito");
        assertTrue(vm.keyExistsJson(json, ".chainId"), "chainId no escrito");
        assertTrue(vm.keyExistsJson(json, ".deploymentBlock"), "deploymentBlock no escrito");
        assertEq(vm.parseJsonAddress(json, ".address"), d.hotelOperations, "address del registro");
    }

    function test_DeployAdminEsElDesplegadorConservaElRol() public {
        string memory dir = _testOutputDir("selfadmin");
        DeployOperations.Config memory cfg = _config(dir);
        cfg.admin = deployer; // sin handover
        DeployOperations.Deployment memory d = script.deployWithConfig(cfg, DEPLOYER_PK);
        HotelOperations ops = HotelOperations(d.hotelOperations);

        assertTrue(ops.hasRole(ops.DEFAULT_ADMIN_ROLE(), deployer), "el desplegador perdio el rol");
    }

    function test_DeployAdminCeroRevierteEnElConstructor() public {
        // El constructor rechaza la dirección nula: un contrato sin administrador sería ingobernable.
        vm.expectRevert(HotelOperations.AdminZeroAddress.selector);
        new HotelOperations(address(0));
    }
}
