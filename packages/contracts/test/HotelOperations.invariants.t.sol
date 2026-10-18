// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Vm} from "forge-std/Vm.sol";

import {HotelOperations} from "../src/HotelOperations.sol";

/**
 * @title HotelOperationsHandler
 * @notice Handler de fuzzing de invariantes para `HotelOperations`. Ejecuta secuencias aleatorias
 *         de relay con firmas EIP-712 VÁLIDAS de un conjunto fijo de firmantes con rol (jefes,
 *         ama de llaves y admin), enviadas por relayers sin rol. A veces reutiliza un nonce ya
 *         consumido del mismo firmante para ejercitar el anti-replay (el revert se absorbe porque
 *         `fail_on_revert = false`).
 * @dev Registra los eventos `OperationalAction` REALMENTE emitidos (topic `signer`) junto al
 *      relayer que envió la tx y el nonce, para que las invariantes del test los comprueben.
 */
contract HotelOperationsHandler is Test {
    HotelOperations public immutable OPS;

    bytes32 internal constant OPERATIONAL_ACTION_SIG =
        keccak256("OperationalAction(bytes32,bytes32,bytes32,address,uint256)");

    uint256[] internal maintenancePks;
    uint256 internal keeperPk;
    uint256 internal adminPk;
    address[] internal relayers;

    /// @dev Firmantes observados en el evento (topic indexado `signer`), por emisión.
    address[] public emittedSigners;
    /// @dev Relayer (`msg.sender`) de cada emisión.
    address[] public emittedRelayers;
    /// @dev Nonce firmado en cada emisión.
    bytes32[] public emittedNonces;

    uint256 internal callCounter;

    constructor(
        HotelOperations ops_,
        uint256[3] memory maintenancePks_,
        uint256 keeperPk_,
        uint256 adminPk_
    ) {
        OPS = ops_;
        for (uint256 i; i < 3; i++) {
            maintenancePks.push(maintenancePks_[i]);
        }
        keeperPk = keeperPk_;
        adminPk = adminPk_;

        for (uint256 i; i < 3; i++) {
            relayers.push(makeAddr(string(abi.encodePacked("invariant-relayer-", vm.toString(i)))));
        }
    }

    function maintenancePksLength() external view returns (uint256) {
        return maintenancePks.length;
    }

    function relayersLength() external view returns (uint256) {
        return relayers.length;
    }

    /// @notice Relay genérico: elige acción, firmante con rol, relayer y argumentos aleatorios.
    function relay(uint256 actionSeed, uint256 signerSeed, uint256 relayerSeed, bytes32 argSeed)
        external
    {
        uint256 action = actionSeed % 5;

        uint256 pk;
        bytes32 actionType;
        if (action == 0 || action == 1 || action == 2) {
            pk = maintenancePks[signerSeed % maintenancePks.length];
            actionType = action == 0
                ? OPS.ACTION_ROOM_BLOCK()
                : (action == 1 ? OPS.ACTION_ROOM_UNBLOCK() : OPS.ACTION_PREVENTIVE_TASK());
        } else if (action == 3) {
            pk = keeperPk;
            actionType = OPS.ACTION_INSPECTION();
        } else {
            pk = adminPk;
            actionType = OPS.ACTION_CONFIG();
        }

        address signer = vm.addr(pk);
        address relayer = relayers[relayerSeed % relayers.length];

        bytes32 nonce = keccak256(abi.encodePacked("nonce", callCounter));
        callCounter++;
        // Reutiliza (a veces) un nonce ya emitido por el MISMO firmante -> replay -> revert.
        if (uint256(argSeed) % 8 == 0 && emittedNonces.length > 0) {
            uint256 idx = uint256(argSeed) % emittedNonces.length;
            if (emittedSigners[idx] == signer) {
                nonce = emittedNonces[idx];
            }
        }

        bytes32 entityId = keccak256(abi.encodePacked("entity", argSeed));
        bytes32 payloadHash = keccak256(abi.encodePacked("payload", argSeed));
        uint256 deadline = block.timestamp + 1 days;

        bytes32 digest =
            OPS.hashOperationalAction(actionType, entityId, payloadHash, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.recordLogs();
        vm.prank(relayer);
        _dispatch(action, entityId, payloadHash, nonce, deadline, signature);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(OPS) && logs[i].topics[0] == OPERATIONAL_ACTION_SIG) {
                emittedSigners.push(address(uint160(uint256(logs[i].topics[3]))));
                emittedRelayers.push(relayer);
                emittedNonces.push(nonce);
            }
        }
    }

    function _dispatch(
        uint256 action,
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes memory signature
    ) internal {
        if (action == 0) {
            OPS.roomBlocked(entityId, payloadHash, nonce, deadline, signature);
        } else if (action == 1) {
            OPS.roomUnblocked(entityId, payloadHash, nonce, deadline, signature);
        } else if (action == 2) {
            OPS.preventiveTaskVerified(entityId, payloadHash, nonce, deadline, signature);
        } else if (action == 3) {
            OPS.inspectionCertified(entityId, payloadHash, nonce, deadline, signature);
        } else {
            OPS.configChanged(entityId, payloadHash, nonce, deadline, signature);
        }
    }

    function emittedLength() external view returns (uint256) {
        return emittedSigners.length;
    }
}

/**
 * @title HotelOperationsInvariantsTest
 * @notice Invariantes de no-replay y no-suplantación de `HotelOperations`.
 */
contract HotelOperationsInvariantsTest is StdInvariant, Test {
    uint256 internal constant CHAIN_ID = 81_234;

    uint256 internal constant ADMIN_PK = 0xA11CE;
    uint256 internal constant MAINT1_PK = 0xB0B;
    uint256 internal constant MAINT2_PK = 0xB0B2;
    uint256 internal constant MAINT3_PK = 0xB0B3;
    uint256 internal constant KEEPER_PK = 0xC0FFEE;

    HotelOperations internal ops;
    HotelOperationsHandler internal handler;

    address internal admin;

    function setUp() public {
        vm.chainId(CHAIN_ID);
        vm.warp(1_700_000_000);

        admin = vm.addr(ADMIN_PK);
        ops = new HotelOperations(admin);

        vm.startPrank(admin);
        ops.grantRole(ops.HEAD_MAINTENANCE_ROLE(), vm.addr(MAINT1_PK));
        ops.grantRole(ops.HEAD_MAINTENANCE_ROLE(), vm.addr(MAINT2_PK));
        ops.grantRole(ops.HEAD_MAINTENANCE_ROLE(), vm.addr(MAINT3_PK));
        ops.grantRole(ops.HEAD_KEEPER_ROLE(), vm.addr(KEEPER_PK));
        vm.stopPrank();

        handler =
            new HotelOperationsHandler(ops, [MAINT1_PK, MAINT2_PK, MAINT3_PK], KEEPER_PK, ADMIN_PK);
        targetContract(address(handler));
    }

    /// @notice Un nonce emitido por un firmante permanece consumido para siempre.
    function invariant_nonceConsumidoPermaneceConsumido() public view {
        uint256 n = handler.emittedLength();
        for (uint256 i; i < n; i++) {
            assertTrue(
                ops.consumedNonce(handler.emittedSigners(i), handler.emittedNonces(i)),
                "nonce emitido debe permanecer consumido"
            );
        }
    }

    /// @notice El evento nunca lleva como `signer` al relayer que envio la transaccion.
    function invariant_signerNuncaEsRelayer() public view {
        uint256 n = handler.emittedLength();
        for (uint256 i; i < n; i++) {
            assertTrue(
                handler.emittedSigners(i) != handler.emittedRelayers(i),
                "el signer del evento nunca es el relayer"
            );
        }
    }

    /// @notice `backupForRole` solo cambia por `setBackupForRole` del admin; el handler no lo toca.
    function invariant_backupForRoleSoloCambiaPorAdmin() public view {
        assertEq(ops.backupForRole(ops.HEAD_MAINTENANCE_ROLE()), address(0));
        assertEq(ops.backupForRole(ops.HEAD_KEEPER_ROLE()), address(0));
        assertEq(ops.backupForRole(ops.DEFAULT_ADMIN_ROLE()), address(0));
    }
}
