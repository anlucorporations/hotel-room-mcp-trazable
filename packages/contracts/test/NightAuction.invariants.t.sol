// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {NightAuction} from "../src/NightAuction.sol";
import {INightAuction, IHotelNightsAuctionView} from "../src/INightAuction.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @title NightAuctionHandler
 * @notice Handler del fuzzing de invariantes de C2 (RF-13). Ejecuta secuencias aleatorias de
 *         crear/pujar/liquidar/cancelar/retirar y avanza el reloj de la cadena para alcanzar los
 *         cierres. Los reverts esperados se capturan con `try/catch` para no abortar la campaña.
 * @dev Las invariantes se comprueban en el contrato de test (`NightAuctionInvariantsTest`).
 */
contract NightAuctionHandler is Test {
    NightAuction public immutable AUCTION;
    HotelNights public immutable NFT;
    address public immutable TREASURY;
    address public immutable HOTEL_ADMIN;

    address[] public actors;

    uint256[] public tokens;
    uint256 public constant TOKEN_COUNT = 6;

    uint256 public createCount;
    uint256 public bidCount;
    uint256 public settleCount;
    uint256 public cancelCount;
    uint256 public withdrawCount;

    uint256 private constant BASE_DATE = 20_990_101; // 2099-01-01: no caduca en la campaña

    constructor(NightAuction auction_, HotelNights nft_, address hotelAdmin_, address treasury_) {
        AUCTION = auction_;
        NFT = nft_;
        HOTEL_ADMIN = hotelAdmin_;
        TREASURY = treasury_;

        for (uint256 i = 0; i < 3; i++) {
            address actor = makeAddr(string(abi.encodePacked("auctionActor", vm.toString(i))));
            actors.push(actor);
            vm.deal(actor, 1_000 ether);
        }

        // Noches de suite futuras, todas propiedad del hotel.
        for (uint256 i = 0; i < TOKEN_COUNT; i++) {
            uint256 room = 201 + i; // 201..206 ⇒ suite
            uint256 tokenId = room * 1e8 + BASE_DATE;
            vm.prank(HOTEL_ADMIN);
            NFT.mint(room, BASE_DATE, 0.5 ether, "ipfs://suite");
            tokens.push(tokenId);
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function tokensLength() external view returns (uint256) {
        return tokens.length;
    }

    /// @dev Avanza el reloj para que los cierres sean alcanzables.
    function _tick(uint256 seed) private {
        vm.warp(block.timestamp + (seed % 3 hours) + 1 minutes);
    }

    function _tokenAt(uint256 seed) private view returns (uint256) {
        return tokens[seed % tokens.length];
    }

    function create(uint256 seed) external {
        _tick(seed);
        uint256 tokenId = _tokenAt(seed);

        // Solo se puede abrir si no hay subasta viva y la noche sigue siendo inventario del hotel.
        if (NFT.ownerOf(tokenId) != TREASURY || NFT.soldOnce(tokenId)) return;

        INightAuction.AuctionState state = AUCTION.stateOf(tokenId);
        if (state == INightAuction.AuctionState.OPEN) return;

        uint64 start = uint64(block.timestamp);
        uint64 end = start + uint64((seed % 48) + 2) * 1 hours;
        uint256 reserve = (seed % 5) * 0.05 ether;

        vm.prank(HOTEL_ADMIN);
        try AUCTION.createAuction(tokenId, reserve, start, end) {
            createCount++;
        } catch {}
    }

    function bid(uint256 seed, uint256 actorSeed) external {
        _tick(seed);
        uint256 tokenId = _tokenAt(seed);
        if (AUCTION.stateOf(tokenId) != INightAuction.AuctionState.OPEN) return;

        INightAuction.Auction memory a = AUCTION.auctionOf(tokenId);
        if (block.timestamp < a.startTime || block.timestamp >= a.endTime) return;

        uint256 required = AUCTION.nextMinBid(tokenId);
        uint256 value = required + (seed % 0.5 ether);
        address actor = actors[actorSeed % actors.length];
        if (actor.balance < value) vm.deal(actor, value + 1 ether);

        vm.prank(actor);
        try AUCTION.bid{value: value}(tokenId) {
            bidCount++;
        } catch {}
    }

    function settle(uint256 seed) external {
        _tick(seed);
        uint256 tokenId = _tokenAt(seed);
        if (AUCTION.stateOf(tokenId) != INightAuction.AuctionState.OPEN) return;

        INightAuction.Auction memory a = AUCTION.auctionOf(tokenId);
        if (a.highestBidder == address(0)) return;
        if (block.timestamp < a.endTime) {
            vm.warp(a.endTime + 1); // fuerza el cierre para poder liquidar
        }

        try AUCTION.settle(tokenId) {
            settleCount++;
        } catch {}
    }

    function cancel(uint256 seed) external {
        _tick(seed);
        uint256 tokenId = _tokenAt(seed);
        if (AUCTION.stateOf(tokenId) != INightAuction.AuctionState.OPEN) return;

        vm.prank(HOTEL_ADMIN);
        try AUCTION.cancel(tokenId) {
            cancelCount++;
        } catch {}
    }

    function withdraw(uint256 seed, uint256 actorSeed) external {
        _tick(seed);
        address actor = actors[actorSeed % actors.length];
        if (AUCTION.pendingWithdrawals(actor) == 0) return;

        vm.prank(actor);
        try AUCTION.withdraw() {
            withdrawCount++;
        } catch {}
    }
}

/**
 * @title NightAuctionInvariantsTest
 * @notice Invariantes de la subasta (C2 · RF-13):
 *   1. **Nunca se paga más de lo recibido** (`balance >= totalPending`).
 *   2. El pendiente agregado coincide con la suma de los pendientes individuales (contabilidad).
 *   3. Una subasta liquidada ⇒ la noche está **vendida** (`soldOnce`) y ya **no** es del hotel.
 *   4. Mientras la subasta está abierta, la noche sigue siendo del hotel (**sin escrow**).
 *   5. Una subasta cancelada no ha movido la noche ni marcado venta.
 */
contract NightAuctionInvariantsTest is StdInvariant, Test {
    HotelNights internal nft;
    NightAuction internal auction;
    NightAuctionHandler internal handler;

    address internal treasury = makeAddr("treasury");
    address internal hotelAdmin = makeAddr("hotelAdmin");

    function setUp() public {
        vm.warp(2_000_000_000); // 2033: holgado y estable
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
        nft.grantRole(nft.MINTER_ROLE(), hotelAdmin);

        auction = new NightAuction(hotelAdmin, IHotelNightsAuctionView(address(nft)));
        nft.grantRole(nft.AUCTION_ROLE(), address(auction));

        handler = new NightAuctionHandler(auction, nft, hotelAdmin, treasury);
        targetContract(address(handler));
    }

    /// @dev 1 · Solvencia.
    function invariant_Solvency() public view {
        assertGe(address(auction).balance, auction.totalPending(), "el contrato no puede deber mas de lo que tiene");
    }

    /// @dev 2 · Contabilidad: pendiente agregado == suma de pendientes individuales.
    function invariant_PendingAccounting() public view {
        uint256 sum = 0;
        uint256 count = handler.actorsLength();
        for (uint256 i = 0; i < count; i++) {
            sum += auction.pendingWithdrawals(handler.actors(i));
        }
        sum += auction.pendingWithdrawals(treasury);
        assertEq(auction.totalPending(), sum, "totalPending debe ser la suma de los pendientes");
    }

    /// @dev 3-5 · Coherencia subasta ↔ noche.
    function invariant_AuctionNightCoherence() public view {
        uint256 count = handler.tokensLength();
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = handler.tokens(i);
            INightAuction.AuctionState state = auction.stateOf(tokenId);

            if (state == INightAuction.AuctionState.SETTLED) {
                assertTrue(nft.soldOnce(tokenId), "liquidada => vendida");
                assertTrue(nft.ownerOf(tokenId) != treasury, "liquidada => la noche ya no es del hotel");
            } else if (state == INightAuction.AuctionState.OPEN) {
                assertEq(nft.ownerOf(tokenId), treasury, "abierta => sin escrow");
                assertFalse(nft.soldOnce(tokenId), "abierta => sin venta primaria");
            } else if (state == INightAuction.AuctionState.CANCELLED) {
                assertFalse(nft.soldOnce(tokenId), "cancelada => sin venta primaria");
            }
        }
    }
}
