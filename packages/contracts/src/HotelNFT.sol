// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {RoomMaster} from "./libraries/RoomMaster.sol";

/**
 * @title HotelNFT
 * @notice Token ERC-721 representativo de una noche de habitación en el Hotel Marina del Sol.
 *         Implementa EIP-2981 con royalties variables (5% simples/dobles, 10% suite),
 *         Pausable para control de emergencias, AccessControl granular (4 roles),
 *         ERC721Holder para retención de inventario primario y
 *         anclaje on-chain `markCheckedIn` para prevención irreversible de doble gasto.
 */
contract HotelNFT is ERC721, ERC2981, AccessControl, Pausable, ERC721Holder {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant RECEPTION_ROLE = keccak256("RECEPTION_ROLE");

    uint256 public constant MAX_BATCH_MINT = 50;

    enum RoomType {
        SIMPLE,
        DOBLE,
        SUITE
    }

    struct RoomInfo {
        uint256 roomNumber;
        uint256 checkInTimestamp;
        RoomType roomType;
        uint256 basePriceWei;
        bool isCheckedIn;
    }

    mapping(uint256 => RoomInfo) public rooms;
    address public marketplaceContract;
    address public treasury;

    event NFTMinted(
        uint256 indexed tokenId,
        uint256 roomNumber,
        uint256 checkInTimestamp,
        RoomType roomType,
        uint256 basePriceWei
    );
    event NFTBurned(uint256 indexed tokenId, uint256 roomNumber, uint256 checkInTimestamp);
    event BatchBurned(uint256[] tokenIds);
    event NFTCheckedInOnChain(uint256 indexed tokenId, uint256 timestamp);
    event MarketplaceContractUpdated(address indexed oldAddress, address indexed newAddress);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(
        address _admin,
        address _treasury
    ) ERC721("Hotel Marina del Sol Room Night", "HROOM") {
        require(_admin != address(0), "HotelNFT: Zero admin address");
        require(_treasury != address(0), "HotelNFT: Zero treasury address");

        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /// @notice Actualiza la dirección del contrato marketplace autorizado para transferencias
    function setMarketplaceContract(address _marketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_marketplace != address(0), "HotelNFT: Zero marketplace address");
        emit MarketplaceContractUpdated(marketplaceContract, _marketplace);
        marketplaceContract = _marketplace;
    }

    /// @notice Actualiza la dirección receptora de fondos y royalties del hotel
    function setTreasury(address _newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newTreasury != address(0), "HotelNFT: Zero treasury address");
        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Genera el identificador único canónico del token: keccak256(roomNumber, checkInTimestamp)
     */
    function computeTokenId(
        uint256 roomNumber,
        uint256 checkInTimestamp
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(roomNumber, checkInTimestamp)));
    }

    /**
     * @notice Acuñación masiva desatendida de noches (hasta 50 tokens por transacción)
     */
    function mintBatch(
        address to,
        uint256[] calldata roomNumbers,
        uint256[] calldata checkInTimestamps,
        RoomType[] calldata roomTypes,
        uint256[] calldata pricesWei
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        uint256 count = roomNumbers.length;
        require(count > 0, "HotelNFT: Empty batch");
        require(count <= MAX_BATCH_MINT, "HotelNFT: Exceeds max batch size");
        require(
            count == checkInTimestamps.length &&
                count == roomTypes.length &&
                count == pricesWei.length,
            "HotelNFT: Array lengths mismatch"
        );
        require(to != address(0), "HotelNFT: Mint to zero address");

        for (uint256 i = 0; i < count; i++) {
            _mintSingle(
                to,
                roomNumbers[i],
                checkInTimestamps[i],
                roomTypes[i],
                pricesWei[i]
            );
        }
    }

    function _mintSingle(
        address to,
        uint256 roomNumber,
        uint256 checkInTimestamp,
        RoomType rType,
        uint256 priceWei
    ) internal {
        require(RoomMaster.isInMaster(roomNumber), "HotelNFT: Room not in master");
        require(checkInTimestamp > block.timestamp, "HotelNFT: Check-in date in the past");
        require(priceWei > 0, "HotelNFT: Price must be greater than zero");

        uint256 tokenId = computeTokenId(roomNumber, checkInTimestamp);
        require(rooms[tokenId].roomNumber == 0, "HotelNFT: Token already minted");

        rooms[tokenId] = RoomInfo({
            roomNumber: roomNumber,
            checkInTimestamp: checkInTimestamp,
            roomType: rType,
            basePriceWei: priceWei,
            isCheckedIn: false
        });

        _safeMint(to, tokenId);

        emit NFTMinted(tokenId, roomNumber, checkInTimestamp, rType, priceWei);
    }

    /**
     * @notice Marcado de check-in on-chain ejecutado por recepción.
     *         Bloquea de forma irreversible cualquier transferencia posterior.
     */
    function markCheckedIn(uint256 tokenId) external onlyRole(RECEPTION_ROLE) whenNotPaused {
        require(_ownerOf(tokenId) != address(0), "HotelNFT: Nonexistent token");
        RoomInfo storage room = rooms[tokenId];
        require(!room.isCheckedIn, "HotelNFT: Already checked in");

        room.isCheckedIn = true;

        emit NFTCheckedInOnChain(tokenId, block.timestamp);
    }

    /**
     * @notice Quema individual de habitación expirada no vendida
     */
    function burn(uint256 tokenId) external onlyRole(BURNER_ROLE) whenNotPaused {
        _burnToken(tokenId);
    }

    /**
     * @notice Quema masiva desatendida de habitaciones expiradas no vendidas
     */
    function burnBatch(uint256[] calldata tokenIds) external onlyRole(BURNER_ROLE) whenNotPaused {
        uint256 count = tokenIds.length;
        require(count > 0, "HotelNFT: Empty batch");

        for (uint256 i = 0; i < count; i++) {
            _burnToken(tokenIds[i]);
        }

        emit BatchBurned(tokenIds);
    }

    function _burnToken(uint256 tokenId) internal {
        require(_ownerOf(tokenId) != address(0), "HotelNFT: Nonexistent token");
        RoomInfo memory room = rooms[tokenId];
        require(block.timestamp >= room.checkInTimestamp, "HotelNFT: Cannot burn before check-in");

        emit NFTBurned(tokenId, room.roomNumber, room.checkInTimestamp);
        delete rooms[tokenId];
        _burn(tokenId);
    }

    /**
     * @notice Cálculo dinámico de royalties EIP-2981: 5% (simples/dobles) y 10% (suite)
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) public view override returns (address receiver, uint256 royaltyAmount) {
        receiver = treasury;
        RoomType rType = rooms[tokenId].roomType;
        if (rType == RoomType.SUITE) {
            royaltyAmount = (salePrice * 1000) / 10000; // 10%
        } else {
            royaltyAmount = (salePrice * 500) / 10000; // 5%
        }
    }

    /**
     * @dev Autoriza implícitamente al marketplace oficial sobre los tokens retenidos por el contrato HotelNFT (venta primaria).
     */
    function _isAuthorized(
        address owner,
        address spender,
        uint256 tokenId
    ) internal view override returns (bool) {
        if (owner == address(this) && spender == marketplaceContract && marketplaceContract != address(0)) {
            return true;
        }
        return super._isAuthorized(owner, spender, tokenId);
    }

    /**
     * @dev Hook de transferencia OpenZeppelin v5.
     *      - Permite acuñación (from == address(0)) y quema (to == address(0))
     *      - Bloquea transferencias si el contrato está pausado
     *      - Bloquea transferencias de habitaciones ya ocupadas (isCheckedIn)
     *      - Exige que las transferencias secundarias pasen por el Marketplace autorizado
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            require(!paused(), "HotelNFT: Contract paused");
            require(!rooms[tokenId].isCheckedIn, "HotelNFT: Cannot transfer checked-in room");
            require(
                msg.sender == marketplaceContract,
                "HotelNFT: Transfers restricted to Marketplace"
            );
        }

        return super._update(to, tokenId, auth);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC2981, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
