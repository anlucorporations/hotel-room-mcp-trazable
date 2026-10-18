// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {HotelOperations} from "../src/HotelOperations.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title HotelOperationsTest
 * @notice Suite unit + fuzz de `HotelOperations` (propuesta vNext §3.5 y §4.2.1).
 * @dev Modelo de firma DT-AUD-01: el firmante (jefe/respaldo/admin) NUNCA es `msg.sender`; el
 *      relayer (hot wallet del worker) envía la transacción sin ningún rol. Los tests usan
 *      `vm.chainId(81234)` (Besu privada / Anvil dev) y `vm.sign`, coherente con §4.2.
 */
contract HotelOperationsTest is Test {
    event OperationalAction(
        bytes32 indexed actionType,
        bytes32 indexed entityId,
        bytes32 payloadHash,
        address indexed signer,
        uint256 timestamp
    );
    event BackupForRoleUpdated(bytes32 indexed role, address indexed backup);

    uint256 internal constant CHAIN_ID = 81_234;
    bytes32 internal constant OPERATIONAL_ACTION_SIG =
        keccak256("OperationalAction(bytes32,bytes32,bytes32,address,uint256)");
    uint256 internal constant SECP256K1_N_MINUS_1 =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140;

    uint256 internal constant ADMIN_PK = 0xA11CE;
    uint256 internal constant MAINT_PK = 0xB0B;
    uint256 internal constant KEEPER_PK = 0xC0FFEE;
    uint256 internal constant BACKUP_PK = 0xD00D;
    uint256 internal constant STRANGER_PK = 0xE666;

    address internal admin;
    address internal maintenance;
    address internal keeper;
    address internal backup;
    address internal stranger;
    address internal relayer;

    HotelOperations internal ops;

    function setUp() public {
        vm.chainId(CHAIN_ID);
        vm.warp(1_700_000_000);

        admin = vm.addr(ADMIN_PK);
        maintenance = vm.addr(MAINT_PK);
        keeper = vm.addr(KEEPER_PK);
        backup = vm.addr(BACKUP_PK);
        stranger = vm.addr(STRANGER_PK);
        relayer = makeAddr("relayer"); // hot wallet del worker: SIN roles

        ops = new HotelOperations(admin);

        vm.startPrank(admin);
        ops.grantRole(ops.HEAD_MAINTENANCE_ROLE(), maintenance);
        ops.grantRole(ops.HEAD_KEEPER_ROLE(), keeper);
        vm.stopPrank();
    }

    // --- helpers ---------------------------------------------------------------

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _digest(bytes32 actionType, bytes32 entityId, bytes32 payloadHash, bytes32 nonce)
        internal
        view
        returns (bytes32)
    {
        return ops.hashOperationalAction(actionType, entityId, payloadHash, nonce, _deadline());
    }

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    // --- 1. relayer != firmante + evento --------------------------------------

    function test_roomBlocked_firmadoPorMantenimientoEnviadoPorRelayer() public {
        bytes32 entityId = keccak256("room-101");
        bytes32 payloadHash = keccak256("payload-room-101");
        bytes32 nonce = keccak256("nonce-1");
        uint256 deadline = _deadline();

        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, nonce, deadline
        );
        bytes memory signature = _sign(MAINT_PK, digest);

        assertTrue(maintenance != relayer, "firmante y relayer deben diferir");

        vm.expectEmit(true, true, true, true, address(ops));
        emit OperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, maintenance, block.timestamp
        );

        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, signature);

        assertTrue(ops.consumedNonce(maintenance, nonce), "nonce del firmante consumido");
        assertFalse(ops.consumedNonce(relayer, nonce), "el relayer no consume nonce");
    }

    // --- 2. anti-replay --------------------------------------------------------

    function test_reusoDeNonceRevierteNonceAlreadyConsumed() public {
        bytes32 entityId = keccak256("room-102");
        bytes32 payloadHash = keccak256("payload-room-102");
        bytes32 nonce = keccak256("nonce-replay");
        uint256 deadline = _deadline();

        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, nonce, deadline
        );
        bytes memory signature = _sign(MAINT_PK, digest);

        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, signature);

        vm.expectRevert(
            abi.encodeWithSelector(
                HotelOperations.NonceAlreadyConsumed.selector, maintenance, nonce
            )
        );
        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, signature);
    }

    // --- 3. deadline -----------------------------------------------------------

    function test_deadlineVencidoRevierteDeadlineExpired() public {
        bytes32 entityId = keccak256("room-103");
        bytes32 payloadHash = keccak256("payload-room-103");
        bytes32 nonce = keccak256("nonce-expired");
        uint256 deadline = block.timestamp - 1;

        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_ROOM_UNBLOCK(), entityId, payloadHash, nonce, deadline
        );
        bytes memory signature = _sign(MAINT_PK, digest);

        vm.expectRevert(
            abi.encodeWithSelector(
                HotelOperations.DeadlineExpired.selector, deadline, block.timestamp
            )
        );
        vm.prank(relayer);
        ops.roomUnblocked(entityId, payloadHash, nonce, deadline, signature);
    }

    // --- 4. CONFIG sin DEFAULT_ADMIN_ROLE -------------------------------------

    function test_configChanged_sinAdminRevierteAccessControlUnauthorizedAccount() public {
        bytes32 entityId = keccak256("config-1");
        bytes32 payloadHash = keccak256("payload-config-1");
        bytes32 nonce = keccak256("nonce-config-1");
        uint256 deadline = _deadline();

        bytes32 digest =
            ops.hashOperationalAction(ops.ACTION_CONFIG(), entityId, payloadHash, nonce, deadline);
        bytes memory signature = _sign(STRANGER_PK, digest);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                ops.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(relayer);
        ops.configChanged(entityId, payloadHash, nonce, deadline, signature);

        assertFalse(ops.consumedNonce(stranger, nonce), "nonce no se consume si no autoriza");
    }

    // --- 5. CONFIG del admin + OWNER_BACKUP -----------------------------------

    function test_configChanged_delAdminEmiteEvento() public {
        bytes32 entityId = keccak256("config-2");
        bytes32 payloadHash = keccak256("payload-config-2");
        bytes32 nonce = keccak256("nonce-config-2");
        uint256 deadline = _deadline();

        bytes32 digest =
            ops.hashOperationalAction(ops.ACTION_CONFIG(), entityId, payloadHash, nonce, deadline);
        bytes memory signature = _sign(ADMIN_PK, digest);

        vm.expectEmit(true, true, true, true, address(ops));
        emit OperationalAction(ops.ACTION_CONFIG(), entityId, payloadHash, admin, block.timestamp);

        vm.prank(relayer);
        ops.configChanged(entityId, payloadHash, nonce, deadline, signature);

        assertTrue(ops.consumedNonce(admin, nonce));
    }

    function test_ownerBackup_firmaAceptadaParaMantenimiento() public {
        bytes32 maintenanceRole = ops.HEAD_MAINTENANCE_ROLE();
        vm.expectEmit(true, true, true, true, address(ops));
        emit BackupForRoleUpdated(maintenanceRole, backup);
        vm.prank(admin);
        ops.setBackupForRole(maintenanceRole, backup);
        assertEq(ops.backupForRole(maintenanceRole), backup);

        bytes32 entityId = keccak256("room-105");
        bytes32 payloadHash = keccak256("payload-room-105");
        bytes32 nonce = keccak256("nonce-backup");
        uint256 deadline = _deadline();

        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, nonce, deadline
        );
        bytes memory signature = _sign(BACKUP_PK, digest);

        vm.expectEmit(true, true, true, true, address(ops));
        emit OperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, backup, block.timestamp
        );

        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, signature);

        assertTrue(ops.consumedNonce(backup, nonce));
    }

    function test_setBackupForRole_soloAdmin() public {
        bytes32 maintenanceRole = ops.HEAD_MAINTENANCE_ROLE();
        bytes32 adminRole = ops.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole
            )
        );
        vm.prank(stranger);
        ops.setBackupForRole(maintenanceRole, backup);
    }

    // --- 6. firma mal formada --------------------------------------------------

    function test_firmaVaciaRevierteECDSAInvalidSignature() public {
        bytes32 entityId = keccak256("room-106");
        bytes32 payloadHash = keccak256("payload-room-106");
        bytes32 nonce = keccak256("nonce-bad-sig-vacia");
        uint256 deadline = _deadline();

        // OZ v5.1 distingue longitud invalida: `ECDSAInvalidSignatureLength` (subclase de la
        // familia `ECDSAInvalidSignature`); la longitud se propaga.
        vm.expectRevert(
            abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, uint256(0))
        );
        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, "");
    }

    function test_firmaDe64BytesRevierteECDSAInvalidSignature() public {
        bytes32 entityId = keccak256("room-107");
        bytes32 payloadHash = keccak256("payload-room-107");
        bytes32 nonce = keccak256("nonce-bad-sig-64");
        uint256 deadline = _deadline();
        bytes memory bogus = abi.encodePacked(
            keccak256("r-invalido"),
            keccak256("s-invalido") // 64 bytes: longitud inválida
        );

        vm.expectRevert(
            abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, uint256(64))
        );
        vm.prank(relayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, bogus);
    }

    // --- 7. fuzz: el evento siempre lleva el firmante --------------------------

    function testFuzz_cualquierRelayerEmiteElFirmante(
        address fuzzRelayer,
        uint256 pk,
        bytes32 nonce
    ) public {
        pk = bound(pk, 1, SECP256K1_N_MINUS_1);
        address signer = vm.addr(pk);
        vm.assume(fuzzRelayer != address(0));
        vm.assume(fuzzRelayer != signer);

        bytes32 maintenanceRole = ops.HEAD_MAINTENANCE_ROLE();
        vm.prank(admin);
        ops.grantRole(maintenanceRole, signer);

        bytes32 entityId = keccak256("fuzz-room");
        bytes32 payloadHash = keccak256("fuzz-payload");
        uint256 deadline = _deadline();
        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_ROOM_BLOCK(), entityId, payloadHash, nonce, deadline
        );
        bytes memory signature = _sign(pk, digest);

        vm.recordLogs();
        vm.prank(fuzzRelayer);
        ops.roomBlocked(entityId, payloadHash, nonce, deadline, signature);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == OPERATIONAL_ACTION_SIG && logs[i].emitter == address(ops)) {
                found = true;
                address emittedSigner = address(uint160(uint256(logs[i].topics[3])));
                assertEq(emittedSigner, signer, "el evento debe llevar el firmante recuperado");
                assertTrue(emittedSigner != fuzzRelayer, "el firmante nunca es el relayer");
            }
        }
        assertTrue(found, "debe emitirse OperationalAction");
        assertTrue(ops.consumedNonce(signer, nonce));
    }

    // --- 8. vector canonico §4.2.1 ---------------------------------------------

    function test_vectorCanonicoEIP712_domainSeparatorYDigest() public {
        address verifyingContract = 0x0000000000000000000000000000000000000a11;
        deployCodeTo("HotelOperations.sol:HotelOperations", abi.encode(admin), verifyingContract);
        HotelOperations canonical = HotelOperations(verifyingContract);

        assertEq(
            canonical.domainSeparator(),
            0x38a2ca7288022e3bd179e42ff548bdb9d5f78fca2661f228d7b7543f2f8314cc,
            "domainSeparator canonico"
        );

        assertEq(
            canonical.hashOperationalAction(
                canonical.ACTION_ROOM_BLOCK(),
                0x5c41210b06cc3b609178b5590a2e82a14824789eedc3e40e39de005661e08d0e,
                0x5031c2aa46e9edd122f1853ee43724012c7e9956883c1f0c32a71c0abd9f9a39,
                0x9c6230254ac733f54ec47298f0a5ddaf93dc9efe6e05fb726dcb6faf10ddece2,
                1_793_000_000
            ),
            0x1c5f82f7a032d92187886907597d66a56d47fac05bde6573f97037cced95dac1,
            "digest EIP-712 canonico"
        );
    }

    // --- extras de vocabulario / constructor -----------------------------------

    function test_actionTypeHashYVocabulario() public view {
        assertEq(
            ops.actionTypeHash(),
            keccak256(
                "OperationalAction(bytes32 actionType,bytes32 entityId,bytes32 payloadHash,bytes32 nonce,uint256 deadline)"
            )
        );
        assertEq(ops.ACTION_ROOM_BLOCK(), keccak256("ROOM_BLOCK"));
        assertEq(ops.ACTION_ROOM_UNBLOCK(), keccak256("ROOM_UNBLOCK"));
        assertEq(ops.ACTION_PREVENTIVE_TASK(), keccak256("PREVENTIVE_TASK"));
        assertEq(ops.ACTION_INSPECTION(), keccak256("INSPECTION"));
        assertEq(ops.ACTION_AREA_LOG(), keccak256("AREA_LOG"));
        assertEq(ops.ACTION_CONFIG(), keccak256("CONFIG"));
        assertEq(ops.HEAD_MAINTENANCE_ROLE(), keccak256("HEAD_MAINTENANCE_ROLE"));
        assertEq(ops.HEAD_KEEPER_ROLE(), keccak256("HEAD_KEEPER_ROLE"));
    }

    function test_constructor_adminCeroRevierte() public {
        vm.expectRevert(HotelOperations.AdminZeroAddress.selector);
        new HotelOperations(address(0));
    }

    function test_constructor_concedeAdminYDomain() public view {
        assertTrue(ops.hasRole(ops.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(ops.backupForRole(ops.HEAD_MAINTENANCE_ROLE()), address(0));
    }

    function test_inspectionCertified_soloKeeper() public {
        bytes32 entityId = keccak256("inspection-1");
        bytes32 payloadHash = keccak256("payload-inspection-1");
        bytes32 nonce = keccak256("nonce-inspection-1");
        uint256 deadline = _deadline();

        // Mantenimiento no puede firmar INSPECTION (rol equivocado).
        bytes32 digestWrong = ops.hashOperationalAction(
            ops.ACTION_INSPECTION(), entityId, payloadHash, nonce, deadline
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                maintenance,
                ops.HEAD_KEEPER_ROLE()
            )
        );
        vm.prank(relayer);
        ops.inspectionCertified(
            entityId, payloadHash, nonce, deadline, _sign(MAINT_PK, digestWrong)
        );

        // El Ama de llaves sí.
        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_INSPECTION(), entityId, payloadHash, nonce, deadline
        );
        vm.expectEmit(true, true, true, true, address(ops));
        emit OperationalAction(
            ops.ACTION_INSPECTION(), entityId, payloadHash, keeper, block.timestamp
        );
        vm.prank(relayer);
        ops.inspectionCertified(entityId, payloadHash, nonce, deadline, _sign(KEEPER_PK, digest));
    }

    function test_preventiveTaskVerified_firmadoPorMantenimiento() public {
        bytes32 entityId = keccak256("task-1");
        bytes32 payloadHash = keccak256("payload-task-1");
        bytes32 nonce = keccak256("nonce-task-1");
        uint256 deadline = _deadline();
        bytes32 digest = ops.hashOperationalAction(
            ops.ACTION_PREVENTIVE_TASK(), entityId, payloadHash, nonce, deadline
        );

        vm.expectEmit(true, true, true, true, address(ops));
        emit OperationalAction(
            ops.ACTION_PREVENTIVE_TASK(), entityId, payloadHash, maintenance, block.timestamp
        );
        vm.prank(relayer);
        ops.preventiveTaskVerified(entityId, payloadHash, nonce, deadline, _sign(MAINT_PK, digest));
    }
}
