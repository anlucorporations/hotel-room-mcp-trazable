// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INightAuction, IHotelNightsAuctionView} from "./INightAuction.sol";

/**
 * @title NightAuction — subasta inglesa de noches premium del hotel (ciclo C2 · RF-13)
 *
 * Alcance aprobado (2026-10-13): decisiones **B4** (solo la venta primaria del hotel; sin royalty),
 * **B5** (inglesa con reserva, incremento mínimo y anti-sniping; *pull payments*) y **B6** (solo
 * on-chain: sin tablas nuevas ni cambios de esquema).
 *
 * Cómo encaja con `HotelNights`:
 *   1. `createAuction` exige que la noche sea **inventario del hotel** (`owner == treasury()`),
 *      futura, no vendida y sin check-in. El NFT **no** se escrowea ni se aprueba a nadie.
 *   2. Las pujas se guardan en este contrato (custodia del importe); la puja superada queda
 *      **pendiente de retirada** por su pujante.
 *   3. `settle` (tras el cierre) llama a `HotelNights.settleAuction`, que completa la venta
 *      primaria (marca `soldOnce`, emite `Sale` y entrega la noche) y acredita el importe al hotel
 *      para que lo retire con `withdraw`.
 *
 * Seguridad: `nonReentrant` en `bid`/`settle`/`cancel`/`withdraw`; efectos antes de interacciones
 * (CEI); `settled`/`cancelled` impiden doble liquidación y doble devolución; invariante
 * `balance >= totalPending` (nunca se paga más de lo recibido).
 */
contract NightAuction is INightAuction, AccessControl, Pausable, ReentrancyGuard {
    // ── Roles ─────────────────────────────────────────────────────────────────
    /// @notice Crea y cancela subastas (operador del hotel). No puede pujar por diseño operativo.
    bytes32 public constant AUCTION_ADMIN_ROLE = keccak256("AUCTION_ADMIN_ROLE");
    /// @notice Mismo nombre/`keccak` que en `HotelNights`: la misma wallet pausa ambos contratos.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ── Límites (espejo de `packages/shared/src/constants.ts`) ────────────────
    /// @dev Duración mínima y máxima de una subasta.
    uint64 public constant MIN_DURATION = 1 hours;
    uint64 public constant MAX_DURATION = 14 days;
    /// @dev Anti-sniping: una puja en los últimos `ANTI_SNIPE_WINDOW` extiende el cierre.
    uint64 public constant ANTI_SNIPE_WINDOW = 5 minutes;
    /// @dev Incremento mínimo sobre la mejor puja: 5 % con un suelo absoluto.
    uint256 public constant MIN_BID_INCREMENT_BPS = 500;
    uint256 public constant MIN_BID_INCREMENT_WEI = 0.001 ether;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Contrato de noches (inmutable, como el propio contrato de noches).
    IHotelNightsAuctionView public immutable hotel;

    mapping(uint256 tokenId => Auction auction) private _auctions;
    mapping(address account => uint256 amount) private _pending;
    uint256 private _totalPending;

    /**
     * @param admin Wallet del hotel que gobierna la subasta: recibe `DEFAULT_ADMIN_ROLE`,
     *        `AUCTION_ADMIN_ROLE` y `PAUSER_ROLE` (bootstrap, ADR-06).
     * @param hotel_ Contrato `HotelNights` (se le concede `AUCTION_ROLE` en el despliegue).
     */
    constructor(address admin, IHotelNightsAuctionView hotel_) {
        if (admin == address(0) || address(hotel_) == address(0)) revert ZeroAddress();
        hotel = hotel_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUCTION_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ── Operaciones del hotel ─────────────────────────────────────────────────
    /// @inheritdoc INightAuction
    function createAuction(
        uint256 tokenId,
        uint256 reservePrice,
        uint64 startTime,
        uint64 endTime
    ) external override onlyRole(AUCTION_ADMIN_ROLE) whenNotPaused {
        Auction storage previous = _auctions[tokenId];
        if (previous.tokenId != 0 && !previous.settled && !previous.cancelled) {
            revert AuctionAlreadyExists(tokenId);
        }

        uint64 nowTs = uint64(block.timestamp);
        if (startTime < nowTs) revert InvalidStartTime(startTime);
        if (endTime < startTime + MIN_DURATION || endTime > startTime + MAX_DURATION) {
            revert InvalidDuration(startTime, endTime);
        }

        // B4: la subasta es una venta **primaria** del hotel ⇒ la noche debe seguir siendo suya,
        // futura, no vendida y sin consumir.
        address seller = hotel.treasury();
        if (hotel.ownerOf(tokenId) != seller) revert NightNotHotelInventory(tokenId);
        if (hotel.soldOnce(tokenId) || hotel.isCheckedIn(tokenId) || hotel.isExpired(tokenId)) {
            revert NightNotSellable(tokenId);
        }

        _auctions[tokenId] = Auction({
            tokenId: tokenId,
            seller: seller,
            reservePrice: reservePrice,
            startTime: startTime,
            endTime: endTime,
            highestBidder: address(0),
            highestBid: 0,
            settled: false,
            cancelled: false
        });

        emit AuctionCreated(tokenId, seller, reservePrice, startTime, endTime);
    }

    /// @inheritdoc INightAuction
    function cancel(uint256 tokenId) external override onlyRole(AUCTION_ADMIN_ROLE) nonReentrant {
        Auction storage auction = _auctions[tokenId];
        if (auction.tokenId == 0) revert AuctionNotFound(tokenId);
        if (auction.settled || auction.cancelled) revert AuctionClosed(tokenId);

        // Con pujas solo se puede cancelar si la noche ya caducó (la subasta no podrá venderse).
        bool expired = hotel.isExpired(tokenId);
        if (auction.highestBidder != address(0) && !expired) revert NotCancellable(tokenId);

        auction.cancelled = true;
        uint256 refunded = 0;
        if (auction.highestBidder != address(0)) {
            refunded = auction.highestBid;
            _pending[auction.highestBidder] += refunded;
            _totalPending += refunded;
            auction.highestBidder = address(0);
            auction.highestBid = 0;
        }

        emit AuctionCancelled(tokenId, auction.seller, refunded);
    }

    // ── Pujas y liquidación ───────────────────────────────────────────────────
    /// @inheritdoc INightAuction
    function bid(uint256 tokenId) external payable override nonReentrant whenNotPaused {
        Auction storage auction = _auctions[tokenId];
        if (auction.tokenId == 0) revert AuctionNotFound(tokenId);
        if (auction.settled || auction.cancelled) revert AuctionClosed(tokenId);

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < auction.startTime) revert AuctionNotStarted(tokenId, auction.startTime);
        if (nowTs >= auction.endTime) revert AuctionEnded(tokenId, auction.endTime);

        uint256 required = _nextMinBid(auction);
        if (msg.value < required) revert BidTooLow(required, msg.value);

        // La puja superada NO se devuelve aquí (podría revertir y bloquear la puja): queda
        // pendiente de retirada por su dueño (pull payments, B5).
        address previousBidder = auction.highestBidder;
        if (previousBidder != address(0)) {
            _pending[previousBidder] += auction.highestBid;
            _totalPending += auction.highestBid;
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        // Anti-sniping: si la puja entra en la ventana final, el cierre se desplaza.
        if (auction.endTime - nowTs < ANTI_SNIPE_WINDOW) {
            auction.endTime = nowTs + ANTI_SNIPE_WINDOW;
        }

        emit BidPlaced(tokenId, msg.sender, msg.value, auction.endTime);
    }

    /// @inheritdoc INightAuction
    function settle(uint256 tokenId) external override nonReentrant whenNotPaused {
        Auction storage auction = _auctions[tokenId];
        if (auction.tokenId == 0) revert AuctionNotFound(tokenId);
        if (auction.settled || auction.cancelled) revert AuctionClosed(tokenId);
        if (block.timestamp < auction.endTime) revert AuctionNotEnded(tokenId, auction.endTime);
        if (auction.highestBidder == address(0)) revert NothingToSettle(tokenId);

        address winner = auction.highestBidder;
        uint256 amount = auction.highestBid;

        // Effects antes de interacciones (CEI): una sola liquidación y el importe acreditado al
        // hotel para su retirada. Si la venta revierte, la transacción entera revierte.
        auction.settled = true;
        _pending[auction.seller] += amount;
        _totalPending += amount;

        hotel.settleAuction(tokenId, winner, amount);

        emit AuctionSettled(tokenId, winner, amount);
    }

    /// @inheritdoc INightAuction
    function withdraw() external override nonReentrant {
        uint256 amount = _pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        _pending[msg.sender] = 0;
        _totalPending -= amount;

        // Evento antes de la interacción (CEI): el log no puede reordenarse por una reentrada.
        emit Withdrawn(msg.sender, amount);

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    // ── Pausa (comparte el rol con `HotelNights`) ─────────────────────────────
    /// @notice Pausa crear/pujar/liquidar. `withdraw` sigue disponible siempre (los fondos son
    ///         de sus dueños y no dependen del estado del contrato).
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ── Lecturas ──────────────────────────────────────────────────────────────
    /// @inheritdoc INightAuction
    function auctionOf(uint256 tokenId) external view override returns (Auction memory) {
        return _auctions[tokenId];
    }

    /// @inheritdoc INightAuction
    function stateOf(uint256 tokenId) external view override returns (AuctionState) {
        Auction storage auction = _auctions[tokenId];
        if (auction.tokenId == 0) return AuctionState.NONE;
        if (auction.settled) return AuctionState.SETTLED;
        if (auction.cancelled) return AuctionState.CANCELLED;
        return AuctionState.OPEN;
    }

    /// @inheritdoc INightAuction
    function nextMinBid(uint256 tokenId) external view override returns (uint256) {
        Auction storage auction = _auctions[tokenId];
        if (auction.tokenId == 0) revert AuctionNotFound(tokenId);
        if (auction.settled || auction.cancelled) revert AuctionClosed(tokenId);
        return _nextMinBid(auction);
    }

    /// @inheritdoc INightAuction
    function pendingWithdrawals(address account) external view override returns (uint256) {
        return _pending[account];
    }

    /// @inheritdoc INightAuction
    function totalPending() external view override returns (uint256) {
        return _totalPending;
    }

    // ── Interno ───────────────────────────────────────────────────────────────
    /// @dev Primera puja: el precio de reserva. Siguientes: mejor puja + incremento (5 % con suelo).
    function _nextMinBid(Auction storage auction) private view returns (uint256) {
        if (auction.highestBidder == address(0)) return auction.reservePrice;
        uint256 step = (auction.highestBid * MIN_BID_INCREMENT_BPS) / BPS_DENOMINATOR;
        if (step < MIN_BID_INCREMENT_WEI) step = MIN_BID_INCREMENT_WEI;
        return auction.highestBid + step;
    }
}
