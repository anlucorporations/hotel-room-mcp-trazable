// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Faucet} from "../src/Faucet.sol";

/**
 * @notice RF-21 — verifica que el script `Deploy` despliega y FINANCIA el faucet de pruebas
 *         cuando `DEPLOY_FAUCET=true` (defecto dev/test/aceptación), con los parámetros del
 *         entorno y dejando al EOA desplegador como owner (para `drain`).
 *
 * @dev El script lee la configuración de `vm.env*` y escribe `./deployments/latest.json`. Solo
 *      ejercitamos la rama habilitada porque es la que tiene comportamiento que verificar; la
 *      rama deshabilitada (prod) simplemente no despliega. No comprobamos la NO-serialización
 *      del faucet vía fichero porque la serialización JSON de Foundry es acumulativa dentro de
 *      un mismo proceso de test (artefacto del cheatcode, no del código); en producción cada
 *      `forge script` es un proceso nuevo. La gating por env queda cubierta por la lógica
 *      `vm.envOr("DEPLOY_FAUCET", true)` y el smoke/e2e de despliegue.
 */
contract DeployFaucetTest is Test {
    // Cuenta #0 del mnemónico por defecto de Anvil (solo dev/test).
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ADMIN = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant TREASURY = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function setUp() public {
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        vm.setEnv("ADMIN_ADDRESS", vm.toString(ADMIN));
        vm.setEnv("TREASURY_ADDRESS", vm.toString(TREASURY));
        // El EOA desplegador necesita saldo para financiar el faucet en el broadcast.
        vm.deal(vm.addr(DEPLOYER_PK), 1_000 ether);
    }

    function test_DeployFundsFaucetWhenEnabled() public {
        vm.setEnv("DEPLOY_FAUCET", "true");
        vm.setEnv("FAUCET_AMOUNT", "500000000000000000"); // 0.5 ether
        vm.setEnv("FAUCET_COOLDOWN", "0");
        vm.setEnv("FAUCET_FUNDING", "100000000000000000000"); // 100 ether

        new Deploy().run();

        // La dirección del faucet se recupera del registro que el propio script escribe,
        // igual que en el flujo real (sync-deployment.ts lee `latest.json`).
        string memory json = vm.readFile("./deployments/latest.json");
        assertTrue(vm.keyExistsJson(json, ".faucet"), "faucet no escrito en latest.json");
        address faucetAddr = vm.parseJsonAddress(json, ".faucet");
        assertTrue(faucetAddr != address(0), "direccion de faucet vacia");

        Faucet faucet = Faucet(payable(faucetAddr));
        assertEq(faucetAddr.balance, 100 ether, "faucet sin financiar");
        assertEq(faucet.amount(), 0.5 ether, "amount incorrecto");
        assertEq(faucet.cooldown(), 0, "cooldown incorrecto");
        assertEq(faucet.lowThreshold(), 5 ether, "lowThreshold por defecto = amount*10");
        assertEq(faucet.owner(), vm.addr(DEPLOYER_PK), "owner del faucet != EOA desplegador");
        assertFalse(faucet.lowBalance(), "el faucet no deberia estar bajo de saldo");
    }
}
