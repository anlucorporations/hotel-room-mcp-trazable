// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title HotelOperations
/// @notice Contrato auxiliar inmutable de operaciones hoteleras (D-C39, propuesta vNext §3).
/// @dev No usa proxy ni `delegatecall`. El worker actúa de relayer (`msg.sender`, paga gas) pero
///      NO firma ni necesita rol: cada función recibe una firma EIP-712, el contrato recupera al
///      firmante y exige el rol sobre `recovered_signer`. El evento emite SIEMPRE el firmante
///      recuperado, nunca `msg.sender` (DT-AUD-01). El nonce EIP-712 es de un solo uso por
///      firmante y el `deadline` acota la ventana de replay (DT-AUD-04).
contract HotelOperations is AccessControl, EIP712 {
    /// @notice Rol del Jefe de Mantenimiento: ROOM_BLOCK, ROOM_UNBLOCK, PREVENTIVE_TASK.
    bytes32 public constant HEAD_MAINTENANCE_ROLE = keccak256("HEAD_MAINTENANCE_ROLE");
    /// @notice Rol del Ama de llaves: INSPECTION.
    bytes32 public constant HEAD_KEEPER_ROLE = keccak256("HEAD_KEEPER_ROLE");

    /// @notice Vocabulario de acciones ancladas (espejo de `casos_uso.md` §3).
    bytes32 public constant ACTION_ROOM_BLOCK = keccak256("ROOM_BLOCK");
    bytes32 public constant ACTION_ROOM_UNBLOCK = keccak256("ROOM_UNBLOCK");
    bytes32 public constant ACTION_PREVENTIVE_TASK = keccak256("PREVENTIVE_TASK");
    bytes32 public constant ACTION_INSPECTION = keccak256("INSPECTION");
    /// @dev Reservado: sin evento tipado; solo se emite vía `OperationalAction` (DT-AUD-16).
    bytes32 public constant ACTION_AREA_LOG = keccak256("AREA_LOG");
    bytes32 public constant ACTION_CONFIG = keccak256("CONFIG");

    /// @dev Firma de tipo EIP-712 del mensaje `OperationalAction` (§4.2).
    bytes32 private constant ACTION_TYPEHASH = keccak256(
        "OperationalAction(bytes32 actionType,bytes32 entityId,bytes32 payloadHash,bytes32 nonce,uint256 deadline)"
    );

    /// @notice Respaldo de emergencia del Owner verificado on-chain (DT-AUD-02).
    mapping(bytes32 role => address backup) public backupForRole;
    /// @notice Anti-replay: nonce de un solo uso por firmante recuperado (DT-AUD-04).
    mapping(address signer => mapping(bytes32 nonce => bool consumed)) public consumedNonce;

    /// @notice Evento canónico de anclaje. `signer` es el firmante EIP-712, nunca `msg.sender`.
    event OperationalAction(
        bytes32 indexed actionType,
        bytes32 indexed entityId,
        bytes32 payloadHash,
        address indexed signer,
        uint256 timestamp
    );
    /// @notice Evento administrativo de gobierno de respaldos (no es acción operativa).
    event BackupForRoleUpdated(bytes32 indexed role, address indexed backup);

    /// @dev El administrador no puede ser la dirección nula.
    error AdminZeroAddress();
    /// @dev La firma llegó después de su `deadline`.
    error DeadlineExpired(uint256 deadline, uint256 now);
    /// @dev El par `(signer, nonce)` ya fue consumido: replay rechazado.
    error NonceAlreadyConsumed(address signer, bytes32 nonce);

    /// @param admin Wallet que recibirá `DEFAULT_ADMIN_ROLE` (Safe multisig recomendado, ADR-06).
    constructor(address admin) EIP712("HotelOperations", "1") {
        if (admin == address(0)) revert AdminZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Registra el respaldo de emergencia de un rol (solo `DEFAULT_ADMIN_ROLE`).
    /// @param role Rol respaldado (`HEAD_MAINTENANCE_ROLE` / `HEAD_KEEPER_ROLE`).
    /// @param backup Wallet del Owner que podrá firmar en nombre del rol respaldado.
    function setBackupForRole(bytes32 role, address backup) external onlyRole(DEFAULT_ADMIN_ROLE) {
        backupForRole[role] = backup;
        emit BackupForRoleUpdated(role, backup);
    }

    /// @notice Ancla un bloqueo de habitación firmado por el Jefe de Mantenimiento.
    function roomBlocked(
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _relay(
            ACTION_ROOM_BLOCK,
            HEAD_MAINTENANCE_ROLE,
            entityId,
            payloadHash,
            nonce,
            deadline,
            signature
        );
    }

    /// @notice Ancla un desbloqueo de habitación firmado por el Jefe de Mantenimiento.
    function roomUnblocked(
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _relay(
            ACTION_ROOM_UNBLOCK,
            HEAD_MAINTENANCE_ROLE,
            entityId,
            payloadHash,
            nonce,
            deadline,
            signature
        );
    }

    /// @notice Ancla la verificación de una tarea preventiva (área crítica) firmada por Mantenimiento.
    function preventiveTaskVerified(
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _relay(
            ACTION_PREVENTIVE_TASK,
            HEAD_MAINTENANCE_ROLE,
            entityId,
            payloadHash,
            nonce,
            deadline,
            signature
        );
    }

    /// @notice Ancla una inspección de housekeeping firmada por el Ama de llaves.
    function inspectionCertified(
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _relay(
            ACTION_INSPECTION, HEAD_KEEPER_ROLE, entityId, payloadHash, nonce, deadline, signature
        );
    }

    /// @notice Ancla un cambio de configuración obligatoria firmado por `DEFAULT_ADMIN_ROLE`.
    function configChanged(
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _relay(ACTION_CONFIG, DEFAULT_ADMIN_ROLE, entityId, payloadHash, nonce, deadline, signature);
    }

    /// @notice `domainSeparator` EIP-712 vigente (vista para el motor de firma de `packages/shared`).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Digest EIP-712 que debe firmar la wallet del jefe o del respaldo (§4.2).
    /// @dev Vista auxiliar para pruebas y para el motor EIP-712; no muta estado.
    function hashOperationalAction(
        bytes32 actionType,
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(ACTION_TYPEHASH, actionType, entityId, payloadHash, nonce, deadline)
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Firma de tipo `OperationalAction` usada en el `structHash` EIP-712.
    function actionTypeHash() external pure returns (bytes32) {
        return ACTION_TYPEHASH;
    }

    /// @dev Núcleo compartido por todas las acciones: valida `deadline`, recupera el firmante,
    ///      aplica anti-replay por `(signer, nonce)`, exige rol o respaldo y emite el evento.
    ///      El nonce se marca consumido SOLO tras superar la comprobación de autorización.
    function _relay(
        bytes32 actionType,
        bytes32 requiredRole,
        bytes32 entityId,
        bytes32 payloadHash,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal {
        if (block.timestamp > deadline) {
            revert DeadlineExpired(deadline, block.timestamp);
        }

        bytes32 structHash = keccak256(
            abi.encode(ACTION_TYPEHASH, actionType, entityId, payloadHash, nonce, deadline)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);

        if (consumedNonce[signer][nonce]) revert NonceAlreadyConsumed(signer, nonce);
        if (!(hasRole(requiredRole, signer) || backupForRole[requiredRole] == signer)) {
            revert AccessControlUnauthorizedAccount(signer, requiredRole);
        }

        consumedNonce[signer][nonce] = true;
        emit OperationalAction(actionType, entityId, payloadHash, signer, block.timestamp);
    }
}
