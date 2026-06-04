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
    error EthTransferFailed();

    // ── Operaciones (FASE 1) ──────────────────────────────────────────────────
    /**
     * @notice Mintea una noche (habitación × fecha) en el inventario del hotel.
     * @param room Habitación del maestro (RF-18a).
     * @param dateYYYYMMDD Fecha de entrada validada off-chain (calendario) y on-chain (rango).
     * @param price Precio de venta primaria en wei (> 0).
     * @param metadataURI `tokenURI` (ipfs://CID) fijado antes/at del mint.
     * @return tokenId Identificador canónico `room·10^8 + AAAAMMDD`.
     */
    function mint(uint256 room, uint256 dateYYYYMMDD, uint256 price, string calldata metadataURI)
        external
        returns (uint256 tokenId);

    /// @notice Compra primaria de una noche `DISPONIBLE` (paga el precio exacto; 100 % a treasury).
    function buy(uint256 tokenId) external payable;

    /// @notice Precio de venta primaria en wei.
    function priceOf(uint256 tokenId) external view returns (uint256);

    /// @notice ¿La noche ya tuvo su venta primaria? (ADR-16).
    function soldOnce(uint256 tokenId) external view returns (bool);

    /// @notice ¿La noche está expirada por umbral UTC? (ADR-08).
    function isExpired(uint256 tokenId) external view returns (bool);

    // ── Getters de configuración ──────────────────────────────────────────────
    /// @notice Royalty actual en basis points (RF-08).
    function royaltyBps() external view returns (uint96);

    /// @notice Tamaño máximo de lote para `burnExpired` (CU-13).
    function burnBatchMax() external view returns (uint256);

    /// @notice Dirección receptora de ingresos y royalties (RNF-15).
    function treasury() external view returns (address);
}
