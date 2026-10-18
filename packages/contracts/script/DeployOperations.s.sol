// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelOperations} from "../src/HotelOperations.sol";

/**
 * @title DeployOperations
 * @notice Despliegue del contrato auxiliar inmutable `HotelOperations` (F2 · §3 del documento
 *         técnico) con bootstrap de roles y respaldo de emergencia `OWNER_BACKUP` (D-C13, DT-AUD-02).
 *
 * @dev Igual que `Deploy.s.sol`, la configuración se separa de la lógica: `run()` la lee del entorno
 *      y delega en `deployWithConfig()`, que recibe una estructura explícita. Así las pruebas son
 *      deterministas y no dependen de `vm.setEnv`.
 *
 *      El contrato NO usa proxy: gobernar es re-apuntar la dirección del registro, no reescribir
 *      estado. El EOA desplegador renuncia a `DEFAULT_ADMIN_ROLE` cuando el admin final es otro
 *      (en producción, el Safe multisig, ADR-06).
 *
 * Variables de entorno que lee `run()`:
 *   DEPLOYER_PRIVATE_KEY        (obligatoria)
 *   OPERATIONS_ADMIN_ADDRESS    por defecto: deployer (en producción: el Safe multisig)
 *   HEAD_MAINTENANCE_ADDRESS    wallet del Jefe de Mantenimiento (opcional; sin ella, sin rol)
 *   HEAD_KEEPER_ADDRESS         wallet del Ama de llaves (opcional)
 *   OWNER_BACKUP_ADDRESS        wallet de respaldo de emergencia (opcional)
 *   OWNER_BACKUP_FOR_ROLE       "HEAD_MAINTENANCE_ROLE" | "HEAD_KEEPER_ROLE" (obligatoria si hay respaldo)
 */
contract DeployOperations is Script {
    struct Config {
        address admin;
        address headMaintenance;
        address headKeeper;
        address ownerBackup;
        bytes32 ownerBackupForRole;
        /// @dev Directorio de salida del registro crudo. Las pruebas lo apuntan a un subdirectorio
        ///      para no sobrescribir el registro real.
        string outputDir;
    }

    struct Deployment {
        address hotelOperations;
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
        cfg.admin = vm.envOr("OPERATIONS_ADMIN_ADDRESS", deployer);
        cfg.headMaintenance = vm.envOr("HEAD_MAINTENANCE_ADDRESS", address(0));
        cfg.headKeeper = vm.envOr("HEAD_KEEPER_ADDRESS", address(0));
        cfg.ownerBackup = vm.envOr("OWNER_BACKUP_ADDRESS", address(0));

        string memory backupRole = vm.envOr("OWNER_BACKUP_FOR_ROLE", string(""));
        if (bytes(backupRole).length > 0) {
            cfg.ownerBackupForRole = _roleFromName(backupRole);
        }
    }

    /// @notice Despliega con una configuración explícita. Determinista, sin leer el entorno.
    function deployWithConfig(Config memory cfg, uint256 deployerPk)
        public
        returns (Deployment memory d)
    {
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);

        // El constructor concede DEFAULT_ADMIN_ROLE a su argumento, así que el despliegue arranca con
        // el EOA desplegador como admin TEMPORAL: es el único que puede hacer el bootstrap (roles y
        // respaldo) sin la clave del admin final, que en producción es un Safe multisig. Al final se
        // hace el handover y el desplegador renuncia (ADR-06).
        HotelOperations ops = new HotelOperations(deployer);

        // Roles operativos: los ostentan las wallets de los jefes, NUNCA la hot wallet del relayer.
        if (cfg.headMaintenance != address(0)) {
            ops.grantRole(ops.HEAD_MAINTENANCE_ROLE(), cfg.headMaintenance);
        }
        if (cfg.headKeeper != address(0)) {
            ops.grantRole(ops.HEAD_KEEPER_ROLE(), cfg.headKeeper);
        }

        // Respaldo de emergencia (D-C13): se registra ANTES del handover, mientras el desplegador
        // conserva DEFAULT_ADMIN_ROLE.
        if (cfg.ownerBackup != address(0) && cfg.ownerBackupForRole != bytes32(0)) {
            ops.setBackupForRole(cfg.ownerBackupForRole, cfg.ownerBackup);
        }

        // Handover de gobernanza: el EOA desplegador desaparece como administrador.
        if (cfg.admin != deployer) {
            ops.grantRole(ops.DEFAULT_ADMIN_ROLE(), cfg.admin);
            ops.renounceRole(ops.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();

        d.hotelOperations = address(ops);
        _writeDeployment(d, cfg.outputDir);
        return d;
    }

    /**
     * @dev Formato crudo que `scripts/sync-deployment.ts` completa con el `abiHash`. Se escribe en
     *      ficheros `*-operations.json` para no pisar el registro de `HotelNights`.
     */
    function _writeDeployment(Deployment memory d, string memory outputDir) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deploymentBlock", block.number);
        string memory json = vm.serializeAddress(key, "address", d.hotelOperations);
        vm.writeJson(json, string.concat(outputDir, "/latest-operations.json"));
        vm.writeJson(
            json, string.concat(outputDir, "/", vm.toString(block.chainid), "-operations.json")
        );
    }

    /// @dev Traduce el selector de entorno al `bytes32` de `AccessControl`.
    function _roleFromName(string memory name) internal pure returns (bytes32) {
        if (keccak256(bytes(name)) == keccak256(bytes("HEAD_MAINTENANCE_ROLE"))) {
            return keccak256("HEAD_MAINTENANCE_ROLE");
        }
        if (keccak256(bytes(name)) == keccak256(bytes("HEAD_KEEPER_ROLE"))) {
            return keccak256("HEAD_KEEPER_ROLE");
        }
        revert(string.concat("OWNER_BACKUP_FOR_ROLE no reconocido: ", name));
    }

    function _logSummary(Deployment memory d, Config memory cfg) private pure {
        console2.log("=== DESPLIEGUE EXITOSO (HotelOperations) ===");
        console2.log("HotelOperations:", d.hotelOperations);
        console2.log("Admin definitivo:", cfg.admin);
        console2.log("HEAD_MAINTENANCE:", cfg.headMaintenance);
        console2.log("HEAD_KEEPER:", cfg.headKeeper);
        if (cfg.ownerBackup != address(0)) {
            console2.log("OWNER_BACKUP:", cfg.ownerBackup);
        }
    }
}
