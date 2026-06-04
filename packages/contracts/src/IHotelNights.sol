// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IHotelNights
 * @notice Superficie canónica del contrato de noches-NFT: eventos, errores y getters de
 *         configuración (CASOS-DE-USO §2/§3, DISEÑO §4). Fuente única que consumen el
 *         worker, el histórico, el dashboard y el back-office.
 *
 * @dev En FASE 0 se declara la superficie completa para fijar el contrato de integración;
 *      las funciones de negocio (mint/buy/list/...) se incorporan en las fases 1–2.
 */
interface IHotelNights {
    /// @notice Naturaleza de una venta.
    enum SaleType {
        PRIMARY,
        SECONDARY
    }

    // ── Eventos canónicos (CASOS §2) ─────────────────────────────────────────
    event Mint(
        uint256 indexed tokenId,
        uint256 indexed room,
        uint256 dateYYYYMMDD,
        string roomType,
        uint256 price
    );
    event Sale(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        SaleType saleType
    );
    event RoyaltyPaid(uint256 indexed tokenId, address indexed receiver, uint256 amount);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Unlisted(uint256 indexed tokenId);
    event Burn(uint256 indexed tokenId);
    event RoyaltyUpdated(uint96 oldBps, uint96 newBps);
    event Withdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ── Errores canónicos (CASOS §3) ─────────────────────────────────────────
    error DuplicateNight(uint256 tokenId);
    error RoomNotInMaster(uint256 room);
    error InvalidPrice();
    error InvalidDate();
    error PastDate();
    error NightExpired(uint256 tokenId);
    error NightNotAvailable(uint256 tokenId);
    error NotOwner();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error NotListed(uint256 tokenId);
    error DirectTransferDisabled();
    error RoyaltyOutOfRange(uint96 bps);
    error NotExpired(uint256 tokenId);
    error AlreadySold(uint256 tokenId);
    error BatchTooLarge(uint256 size, uint256 max);
    error NoFunds();
    error ZeroAddress();

    // ── Getters de configuración ──────────────────────────────────────────────
    /// @notice Royalty actual en basis points (RF-08).
    function royaltyBps() external view returns (uint96);

    /// @notice Tamaño máximo de lote para `burnExpired` (CU-13).
    function burnBatchMax() external view returns (uint256);

    /// @notice Dirección receptora de ingresos y royalties (RNF-15).
    function treasury() external view returns (address);
}
