// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IHotelNights
 * @notice Superficie canónica del contrato de noches-NFT: eventos, errores y getters de
 *         configuración (docs/SRS.md §9, ADR-02). Fuente única que consumen el
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

    // ── Eventos canónicos (docs/SRS.md §9) ─────────────────────────────────────────
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
    event Withdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    /// @notice D-05: check-in on-chain ejecutado por RECEPTION (consume la noche).
    event CheckedIn(uint256 indexed tokenId, address indexed by, uint256 timestamp);
    /// @notice D-06: nuevo suelo de precio de reventa.
    event MinListingPriceUpdated(uint256 newPrice);
    /// @notice D-10: habitación añadida al registro dinámico del contrato.
    event RoomRegistered(uint256 indexed room, string roomType);
    /// @notice D-10: tipo de una habitación registrada actualizado.
    event RoomTypeUpdated(uint256 indexed room, string roomType);
    /// @notice D-18: huella de la ficha de una habitación anclada on-chain.
    event RoomPublished(uint256 indexed room, bytes32 contentHash, uint256 timestamp);

    // ── Errores canónicos (docs/SRS.md §9) ─────────────────────────────────────────
    error DuplicateNight(uint256 tokenId);
    /// @notice D-10: la habitación no está en el registro dinámico del contrato.
    error RoomNotRegistered(uint256 room);
    /// @notice D-10: número de habitación inválido (cero).
    error InvalidRoom(uint256 room);
    /// @notice D-10: la habitación ya estaba registrada.
    error RoomAlreadyRegistered(uint256 room);
    /// @notice D-10: el tipo debe ser "simple", "doble" o "suite".
    error InvalidRoomType(string roomType);
    /// @notice D-18: la huella de publicación no puede ser cero.
    error InvalidContentHash();
    error InvalidPrice();
    error InvalidDate();
    error PastDate();
    error NightExpired(uint256 tokenId);
    error NightNotAvailable(uint256 tokenId);
    error NotOwner();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error NotListed(uint256 tokenId);
    /// @dev Solo una noche EN_PODER_CLIENTE (ya vendida en primaria) puede listarse en
    ///      reventa. Listar inventario DISPONIBLE del hotel rompería la máquina de estados
    ///      (docs/SRS.md §9) y distorsionaría las métricas PRIMARY vs SECONDARY (CU-09/CU-11).
    ///      D-05: también se usa cuando la noche ya fue consumida por check-in (deja de ser
    ///      revendible, tanto al listar como al comprar una reventa vigente).
    error NightNotResellable(uint256 tokenId);
    error DirectTransferDisabled();
    /// @dev D-05: la noche ya tiene check-in marcado (ancla irreversible).
    error AlreadyCheckedIn(uint256 tokenId);
    /// @dev D-05: la noche no tuvo venta primaria; el check-in acredita el consumo de una noche
    ///      vendida, no bloquea inventario del hotel (el marcado es irreversible).
    error NightNotSold(uint256 tokenId);
    /// @dev D-06: el precio de listado queda por debajo del suelo de reventa.
    error PriceBelowMinimum(uint256 price, uint256 minimum);
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

    /// @notice D-05: marca irreversiblemente la noche como consumida (check-in en recepción).
    /// @dev Exige `RECEPTION_ROLE`, token existente y no marcado previamente; bloquea además
    ///      `list`/`buyResale` de esa noche.
    function markCheckedIn(uint256 tokenId) external;

    /// @notice D-05: ¿la noche ya fue consumida por check-in on-chain?
    function isCheckedIn(uint256 tokenId) external view returns (bool);

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

    /// @notice Suma de todos los saldos pull pendientes (Σ `pendingWithdrawals`); fondos de
    ///         usuarios reservados que `withdraw` nunca toca. Invariante: `address(this).balance
    ///         >= totalPending()`.
    function totalPending() external view returns (uint256);

    // ── Administración (FASE 2) ───────────────────────────────────────────────
    /// @notice D-06: ajusta el suelo de precio de reventa (DEFAULT_ADMIN).
    function setMinListingPrice(uint256 newPrice) external;

    /// @notice Pausa de emergencia: bloquea compra/reventa/mint/burn/check-in (PAUSER, CU-14).
    function pause() external;

    /// @notice Reanuda el sistema (PAUSER, CU-14).
    function unpause() external;

    /// @notice Quema en lote noches expiradas no vendidas del hotel (BURNER, CU-13).
    function burnExpired(uint256[] calldata tokenIds) external;

    /// @notice Retira a tesorería el saldo residual del contrato (TREASURER, CU-15).
    function withdraw() external;

    /// @notice Actualiza la dirección de tesorería/receptor de royalties (DEFAULT_ADMIN, CU-16).
    function setTreasury(address newTreasury) external;

    // ── Registro dinámico de habitaciones (D-3, D-10, D-14) ─────────────────────
    /// @notice Añade una habitación al registro del contrato (DEFAULT_ADMIN, D-10).
    /// @dev El registro **arranca vacío** (D-13): la autoridad del maestro es la base de datos
    ///      (D-3) y el despliegue siembra desde ahí. `roomType` es "simple", "doble" o "suite".
    function registerRoom(uint256 room, string calldata roomType) external;

    /// @notice Cambia el tipo de una habitación registrada (DEFAULT_ADMIN, D-10).
    function updateRoomType(uint256 room, string calldata roomType) external;

    /// @notice Ancla la huella de la ficha de una habitación (DEFAULT_ADMIN, D-18).
    /// @dev La huella (`keccak256` del contenido) queda registrada y se emite con la marca de
    ///      tiempo del bloque: es el anclaje on-chain verificable de la publicación (D-2/D-18).
    function publishRoom(uint256 room, bytes32 contentHash) external;

    /// @notice ¿La habitación pertenece al registro dinámico del contrato? (D-10).
    function isRoomRegistered(uint256 room) external view returns (bool);

    /// @notice Tipo de una habitación registrada; cadena vacía si no está (D-10).
    function roomTypeOf(uint256 room) external view returns (string memory);

    /// @notice Huella de la última publicación anclada de una habitación; cero si no hay (D-18).
    function publicationHashOf(uint256 room) external view returns (bytes32);

    // ── Getters de configuración ──────────────────────────────────────────────
    /// @notice D-06: royalty ERC-2981 inmutable, derivado del TIPO de la habitación del
    ///         `tokenId` (500 bps = 5 % simple/doble 101–130; 1000 bps = 10 % suite 201–220)
    ///         y con `treasury` como receptor. No existe setter ni rol que lo altere.
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);

    /// @notice D-06: suelo vigente de precio para listar en reventa.
    function minListingPrice() external view returns (uint256);

    /// @notice Tamaño máximo de lote para `burnExpired` (CU-13).
    function burnBatchMax() external view returns (uint256);

    /// @notice Dirección receptora de ingresos y royalties (RNF-15).
    function treasury() external view returns (address);
}
