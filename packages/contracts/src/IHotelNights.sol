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

    // ── Mercado secundario (FASE 2) ───────────────────────────────────────────
    struct Listing {
        uint256 price;
        bool active;
    }

    /// @notice Lista una noche propia para reventa (CU-06).
    function list(uint256 tokenId, uint256 price) external;

    /// @notice Cancela un listado de reventa propio (CU-06).
    function unlist(uint256 tokenId) external;

    /// @notice Compra una noche listada; reparte royalty (pull) y transfiere el NFT (CU-07).
    function buyResale(uint256 tokenId) external payable;

    /// @notice Retira los saldos acreditados por reventas (pull payments, ADR-15).
    function claim() external;

    /// @notice Listado de reventa de una noche.
    function listingOf(uint256 tokenId) external view returns (Listing memory);

    /// @notice Saldo pendiente de retirar de una cuenta (reventas).
    function pendingWithdrawals(address account) external view returns (uint256);

    // ── Administración (FASE 2) ───────────────────────────────────────────────
    /// @notice Ajusta el royalty en bps (0–2000), ROYALTY_ADMIN (CU-12).
    function setRoyaltyBps(uint96 bps) external;

    /// @notice Pausa de emergencia: bloquea compra/reventa/mint/burn (PAUSER, CU-14).
    function pause() external;

    /// @notice Reanuda el sistema (PAUSER, CU-14).
    function unpause() external;

    /// @notice Quema en lote noches expiradas no vendidas del hotel (BURNER, CU-13).
    function burnExpired(uint256[] calldata tokenIds) external;

    /// @notice Retira a tesorería el saldo residual del contrato (TREASURER, CU-15).
    function withdraw() external;

    /// @notice Actualiza la dirección de tesorería/receptor de royalties (DEFAULT_ADMIN, CU-16).
    function setTreasury(address newTreasury) external;

    // ── Getters de configuración ──────────────────────────────────────────────
    /// @notice Royalty actual en basis points (RF-08).
    function royaltyBps() external view returns (uint96);

    /// @notice Tamaño máximo de lote para `burnExpired` (CU-13).
    function burnBatchMax() external view returns (uint256);

    /// @notice Dirección receptora de ingresos y royalties (RNF-15).
    function treasury() external view returns (address);
}
