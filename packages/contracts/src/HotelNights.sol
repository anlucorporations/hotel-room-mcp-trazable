// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IHotelNights} from "./IHotelNights.sol";

/**
 * @title HotelNights — noches de hotel como NFTs (Hotel Marina del Sol)
 * @notice Cada NFT es una noche (habitación × fecha). Soporta venta primaria, mercado
 *         secundario con royalty (ERC-2981), pausa de emergencia, retirada a tesorería y
 *         control de acceso por roles (DISEÑO §4, REQUISITOS §2.2).
 *
 * @dev **FASE 0 (esqueleto):** se establecen la herencia de OpenZeppelin, los 6 roles, la
 *      configuración de royalty/tesorería y la superficie de eventos/errores. La lógica de
 *      negocio (mint/buy/list/buyResale/burn/withdraw/...) se implementa en las fases 1–2.
 */
contract HotelNights is
    IHotelNights,
    ERC721,
    ERC2981,
    AccessControl,
    Pausable,
    ReentrancyGuard,
    Ownable2Step
{
    // ── Roles (ADR-06) ────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ROYALTY_ADMIN_ROLE = keccak256("ROYALTY_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    // ── Límites de configuración ───────────────────────────────────────────────
    /// @notice Royalty máximo permitido: 2000 bps = 20 % (RF-08).
    uint96 public constant ROYALTY_MAX_BPS = 2000;
    /// @notice Tamaño máximo del lote de burn (CU-13).
    uint256 public constant BURN_BATCH_MAX = 50;

    // ── Estado ─────────────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    address public override treasury;

    uint96 private _royaltyBps;

    /**
     * @param treasury_ Dirección receptora de ingresos/royalties (no nula).
     * @param royaltyBps_ Royalty inicial en bps (≤ {ROYALTY_MAX_BPS}).
     * @dev El desplegador recibe `DEFAULT_ADMIN_ROLE` y la propiedad (Ownable) para poder
     *      ejecutar el bootstrap de roles; después debe transferirlos al admin definitivo
     *      (Safe) y revocarse a sí mismo (ver script de despliegue, ADR-06).
     */
    constructor(address treasury_, uint96 royaltyBps_)
        ERC721("Hotel Marina del Sol Nights", "HMSN")
        Ownable(msg.sender)
    {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (royaltyBps_ > ROYALTY_MAX_BPS) revert RoyaltyOutOfRange(royaltyBps_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        treasury = treasury_;
        emit TreasuryUpdated(address(0), treasury_);

        _royaltyBps = royaltyBps_;
        _setDefaultRoyalty(treasury_, royaltyBps_);
    }

    /// @inheritdoc IHotelNights
    function royaltyBps() public view override returns (uint96) {
        return _royaltyBps;
    }

    /// @inheritdoc IHotelNights
    function burnBatchMax() public pure override returns (uint256) {
        return BURN_BATCH_MAX;
    }

    /**
     * @dev Resuelve la colisión de `supportsInterface` entre ERC721, ERC2981 y AccessControl.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
