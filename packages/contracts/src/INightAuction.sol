// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title INightAuction — subasta **inglesa** de noches del hotel (C2 · RF-13)
 *
 * Decisiones de origen:
 *   - **B4**: solo la **venta primaria del hotel**. La noche subastada es inventario del hotel
 *     (`owner == HotelNights.treasury()`), no vendida y futura; la reventa por subasta queda fuera.
 *   - **B5**: inglesa con **precio de reserva**, **incremento mínimo** y **anti-sniping**; el
 *     pago va por **pull payments** (`withdraw`) tanto para el hotel como para las devoluciones de
 *     las pujas superadas; nunca `push` a direcciones que puedan revertir.
 *   - **B6**: **solo on-chain**; la UI lee del contrato y no hay cambios de esquema.
 *
 * El NFT **no** se escrowea: el hotel conserva la noche y la entrega al ganador en la liquidación,
 * que se completa dentro de `HotelNights.settleAuction` (rol `AUCTION_ROLE`) para que la noche
 * quede marcada como vendida (`soldOnce`) y el ganador pueda revender y hacer check-in.
 */
interface INightAuction {
    /// @notice Estado de la subasta de una noche.
    enum AuctionState {
        NONE,
        OPEN,
        SETTLED,
        CANCELLED
    }

    /// @notice Subasta de una noche (una por `tokenId`).
    struct Auction {
        uint256 tokenId;
        address seller; // inventario del hotel (`treasury`) en el momento de crear
        uint256 reservePrice; // primera puja mínima (0 = sin reserva)
        uint64 startTime;
        uint64 endTime; // puede extenderse por anti-sniping
        address highestBidder;
        uint256 highestBid;
        bool settled;
        bool cancelled;
    }

    event AuctionCreated(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 reservePrice,
        uint64 startTime,
        uint64 endTime
    );
    /// @param newEndTime cierre vigente tras la posible extensión anti-sniping.
    event BidPlaced(
        uint256 indexed tokenId, address indexed bidder, uint256 amount, uint64 newEndTime
    );
    event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed tokenId, address indexed seller, uint256 refunded);
    event Withdrawn(address indexed account, uint256 amount);

    error AuctionAlreadyExists(uint256 tokenId);
    error AuctionNotFound(uint256 tokenId);
    error AuctionNotStarted(uint256 tokenId, uint64 startTime);
    error AuctionEnded(uint256 tokenId, uint64 endTime);
    error AuctionNotEnded(uint256 tokenId, uint64 endTime);
    error AuctionClosed(uint256 tokenId);
    error InvalidStartTime(uint64 startTime);
    error InvalidDuration(uint64 startTime, uint64 endTime);
    error BidTooLow(uint256 required, uint256 sent);
    error NothingToSettle(uint256 tokenId);
    error NotCancellable(uint256 tokenId);
    error NightNotHotelInventory(uint256 tokenId);
    error NightNotSellable(uint256 tokenId);
    error NothingToWithdraw();
    error ZeroAddress();
    error EthTransferFailed();

    /// @notice Abre la subasta de una noche del inventario del hotel.
    function createAuction(
        uint256 tokenId,
        uint256 reservePrice,
        uint64 startTime,
        uint64 endTime
    ) external;

    /// @notice Puja por la noche. Exige al menos `nextMinBid(tokenId)`.
    function bid(uint256 tokenId) external payable;

    /// @notice Liquida la subasta cerrada: entrega la noche al ganador y acredita el importe.
    function settle(uint256 tokenId) external;

    /// @notice Cancela una subasta sin pujas (o cuya noche ya caducó) y devuelve las pujas.
    function cancel(uint256 tokenId) external;

    /// @notice Retira los fondos pendientes del llamante (pull payments).
    function withdraw() external;

    function auctionOf(uint256 tokenId) external view returns (Auction memory);

    function stateOf(uint256 tokenId) external view returns (AuctionState);

    /// @notice Importe mínimo de la siguiente puja (reserva o mejor puja + incremento).
    function nextMinBid(uint256 tokenId) external view returns (uint256);

    function pendingWithdrawals(address account) external view returns (uint256);

    function totalPending() external view returns (uint256);
}

/**
 * @title IHotelNightsAuctionView — lo que la subasta necesita del contrato de noches
 *
 * Se declara aparte y **mínima** a propósito: la subasta solo consulta el inventario y delega la
 * venta primaria en `settleAuction`. Así `IHotelNights` no tiene que declarar la superficie ERC-721.
 */
interface IHotelNightsAuctionView {
    function treasury() external view returns (address);

    function ownerOf(uint256 tokenId) external view returns (address);

    function soldOnce(uint256 tokenId) external view returns (bool);

    function isCheckedIn(uint256 tokenId) external view returns (bool);

    function isExpired(uint256 tokenId) external view returns (bool);

    function settleAuction(uint256 tokenId, address winner, uint256 priceWei) external;
}
