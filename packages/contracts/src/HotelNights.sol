// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from
    "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {IHotelNights} from "./IHotelNights.sol";
import {DateLib} from "./libraries/DateLib.sol";
import {RoomMaster} from "./libraries/RoomMaster.sol";

/**
 * @title HotelNights — noches de hotel como NFTs (Hotel Marina del Sol)
 * @notice Cada NFT es una noche (habitación × fecha). FASE 1: minteo al inventario del hotel
 *         y venta primaria (100 % a tesorería, sin royalty). El mercado secundario con
 *         royalty (pull payments), pausa, withdraw y burn llegan en FASE 2.
 *
 * Seguridad (RNF-14): CEI + `nonReentrant` en `buy`; guard de transferencias con transient
 * storage (EIP-1153, ADR-07) que bloquea `transferFrom` directos (`DirectTransferDisabled`);
 * validación de inputs en `mint`; `Pausable`.
 */
contract HotelNights is
    IHotelNights,
    ERC721URIStorage,
    ERC2981,
    AccessControl,
    Pausable,
    ReentrancyGuard,
    Ownable2Step
{
    using RoomMaster for uint256;

    // ── Roles (ADR-06) ────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ROYALTY_ADMIN_ROLE = keccak256("ROYALTY_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    // ── Límites de configuración ───────────────────────────────────────────────
    uint96 public constant ROYALTY_MAX_BPS = 2000; // 20 % (RF-08)
    uint256 public constant BURN_BATCH_MAX = 50; // CU-13

    /// @dev `tokenId = room · ROOM_MULTIPLIER + AAAAMMDD` (Decisión 3).
    uint256 private constant ROOM_MULTIPLIER = 100_000_000;

    /// @dev Slot de almacenamiento transitorio (EIP-1153) del guard de transferencias.
    ///      Literal = keccak256("hotelnights.transfer.guard.v1") (el assembly exige constante numérica).
    uint256 private constant TRANSFER_GUARD_SLOT =
        0x313242c84e2cbee060723c1ebf1632290121b39b24413eed484819ba30f22f9c;

    // ── Estado ─────────────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    address public override treasury;

    uint96 private _royaltyBps;
    mapping(uint256 tokenId => uint256 priceWei) private _price;
    mapping(uint256 tokenId => bool sold) private _soldOnce;

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

    // ── Minteo (CU-02) ──────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function mint(uint256 room, uint256 dateYYYYMMDD, uint256 price, string calldata metadataURI)
        external
        override
        onlyRole(MINTER_ROLE)
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (!room.isInMaster()) revert RoomNotInMaster(room);
        if (!DateLib.isInRange(dateYYYYMMDD)) revert InvalidDate();
        if (price == 0) revert InvalidPrice();
        if (dateYYYYMMDD < _todayYYYYMMDD()) revert PastDate();

        tokenId = room * ROOM_MULTIPLIER + dateYYYYMMDD;
        if (_ownerOf(tokenId) != address(0)) revert DuplicateNight(tokenId);

        _price[tokenId] = price;
        _mint(treasury, tokenId); // inventario del hotel (ADR-16); `_mint` evita el receiver check
        _setTokenURI(tokenId, metadataURI); // CID fijado: `tokenURI` resoluble desde este bloque

        emit Mint(tokenId, room, dateYYYYMMDD, room.roomType(), price);
    }

    // ── Compra primaria (CU-05) ──────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function buy(uint256 tokenId) external payable override nonReentrant whenNotPaused {
        address seller = _ownerOf(tokenId);
        if (seller == address(0) || _soldOnce[tokenId]) revert NightNotAvailable(tokenId);
        if (_isExpired(tokenId)) revert NightExpired(tokenId);

        uint256 price = _price[tokenId];
        if (msg.value != price) revert IncorrectPayment(price, msg.value);

        // Effects (CEI): marcar vendida antes de cualquier interacción.
        _soldOnce[tokenId] = true;
        emit Sale(tokenId, seller, msg.sender, price, SaleType.PRIMARY);

        // Interaction 1: transferir el NFT (autorizado por el guard transient).
        _unlockTransfer();
        _safeTransfer(seller, msg.sender, tokenId, "");

        // Interaction 2: 100 % del importe a tesorería (la primaria no paga royalty).
        (bool ok,) = payable(treasury).call{value: price}("");
        if (!ok) revert EthTransferFailed();
    }

    // ── Vistas ────────────────────────────────────────────────────────────────
    /// @inheritdoc IHotelNights
    function priceOf(uint256 tokenId) external view override returns (uint256) {
        return _price[tokenId];
    }

    /// @inheritdoc IHotelNights
    function soldOnce(uint256 tokenId) external view override returns (bool) {
        return _soldOnce[tokenId];
    }

    /// @inheritdoc IHotelNights
    function isExpired(uint256 tokenId) external view override returns (bool) {
        return _isExpired(tokenId);
    }

    /// @inheritdoc IHotelNights
    function royaltyBps() public view override returns (uint96) {
        return _royaltyBps;
    }

    /// @inheritdoc IHotelNights
    function burnBatchMax() public pure override returns (uint256) {
        return BURN_BATCH_MAX;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ── Internos ─────────────────────────────────────────────────────────────────
    /**
     * @dev Guard de transferencias (ADR-07). Mint (`from==0`) y burn (`to==0`) se permiten;
     *      una transferencia real exige que `buy`/`buyResale` hayan puesto la marca transient
     *      justo antes (se consume aquí, de modo que cada desbloqueo autoriza un único
     *      movimiento). Al ser transient, se autolimpia al final de la tx incluso si revierte.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (!_isTransferUnlocked()) revert DirectTransferDisabled();
            _consumeTransferUnlock();
        }
        return super._update(to, tokenId, auth);
    }

    function _todayYYYYMMDD() private view returns (uint256) {
        return DateLib.todayYYYYMMDD(block.timestamp);
    }

    function _isExpired(uint256 tokenId) private view returns (bool) {
        return (tokenId % ROOM_MULTIPLIER) < _todayYYYYMMDD();
    }

    function _unlockTransfer() private {
        assembly {
            tstore(TRANSFER_GUARD_SLOT, 1)
        }
    }

    function _consumeTransferUnlock() private {
        assembly {
            tstore(TRANSFER_GUARD_SLOT, 0)
        }
    }

    function _isTransferUnlocked() private view returns (bool unlocked) {
        assembly {
            unlocked := tload(TRANSFER_GUARD_SLOT)
        }
    }
}
