// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";
import {NightAuction} from "../src/NightAuction.sol";
import {INightAuction, IHotelNightsAuctionView} from "../src/INightAuction.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @title NightAuctionTest
 * @notice C2 · RF-13 — subasta **inglesa** de una noche premium del hotel (decisiones B4/B5/B6).
 *
 * Cubre: ciclo completo (crear → pujar → anti-sniping → liquidar → retirar), devoluciones por
 * *pull payments*, cancelación, pausa y todos los reverts de reglas.
 */
contract NightAuctionTest is Test {
    HotelNights internal nft;
    NightAuction internal auction;

    address internal treasury = makeAddr("treasury");
    address internal hotelAdmin = makeAddr("hotelAdmin");
    address internal minter = makeAddr("minter");
    address internal bidderA = makeAddr("bidderA");
    address internal bidderB = makeAddr("bidderB");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant DATE = 20_260_701;
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01
    uint256 internal constant PRICE = 0.2 ether;
    uint256 internal constant SUITE_ID = 201 * 1e8 + DATE; // 201 ⇒ suite (premium)
    uint256 internal constant SIMPLE_ID = 101 * 1e8 + DATE; // 101 ⇒ simple

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);

        auction = new NightAuction(hotelAdmin, IHotelNightsAuctionView(address(nft)));
        nft.grantRole(nft.AUCTION_ROLE(), address(auction));

        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.prank(minter);
        nft.mint(201, DATE, PRICE, "ipfs://suite");
        vm.prank(minter);
        nft.mint(101, DATE, PRICE, "ipfs://simple");

        vm.deal(bidderA, 100 ether);
        vm.deal(bidderB, 100 ether);
    }

    function _open(uint256 reserve, uint64 inHours, uint64 durationHours) internal returns (uint64) {
        uint64 start = uint64(block.timestamp) + inHours * 1 hours;
        uint64 end = start + durationHours * 1 hours;
        vm.prank(hotelAdmin);
        auction.createAuction(SUITE_ID, reserve, start, end);
        return end;
    }

    // ── Alta ──────────────────────────────────────────────────────────────────
    function test_CreateAuctionRegistersNightOfTheHotel() public {
        uint64 end = _open(0.1 ether, 0, 24);

        INightAuction.Auction memory a = auction.auctionOf(SUITE_ID);
        assertEq(a.tokenId, SUITE_ID);
        assertEq(a.seller, treasury, "el vendedor es el inventario del hotel");
        assertEq(a.reservePrice, 0.1 ether);
        assertEq(a.endTime, end);
        assertEq(uint256(auction.stateOf(SUITE_ID)), uint256(INightAuction.AuctionState.OPEN));
        assertEq(auction.nextMinBid(SUITE_ID), 0.1 ether);
        // El NFT sigue en manos del hotel: no hay escrow ni aprobaciones.
        assertEq(nft.ownerOf(SUITE_ID), treasury);
    }

    function test_CreateAuctionRevertsForNonAdmin() public {
        vm.prank(stranger);
        vm.expectRevert();
        auction.createAuction(SUITE_ID, 0.1 ether, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_CreateAuctionRevertsForNightAlreadySold() public {
        // El hotel compra su propia noche no tiene sentido; simulamos una noche de cliente.
        vm.prank(minter);
        nft.mint(202, DATE, PRICE, "ipfs://suite-202");
        address buyer = makeAddr("buyer");
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        nft.buy{value: PRICE}(202 * 1e8 + DATE);
        assertTrue(nft.soldOnce(202 * 1e8 + DATE));

        vm.prank(hotelAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(INightAuction.NightNotHotelInventory.selector, 202 * 1e8 + DATE)
        );
        auction.createAuction(
            202 * 1e8 + DATE, 0.1 ether, uint64(block.timestamp), uint64(block.timestamp + 1 days)
        );
    }

    function test_CreateAuctionRevertsForExpiredNight() public {
        // La noche caduca cuando pasa su fecha (isExpired mira el reloj de la cadena).
        vm.warp(BASE_TS + 60 days);
        vm.prank(hotelAdmin);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.NightNotSellable.selector, SUITE_ID));
        auction.createAuction(
            SUITE_ID, 0.1 ether, uint64(block.timestamp), uint64(block.timestamp + 1 days)
        );
    }

    function test_CreateAuctionValidatesWindow() public {
        uint64 nowTs = uint64(block.timestamp);

        vm.startPrank(hotelAdmin);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.InvalidStartTime.selector, nowTs - 1));
        auction.createAuction(SUITE_ID, 0, nowTs - 1, nowTs + 1 days);

        vm.expectRevert(
            abi.encodeWithSelector(INightAuction.InvalidDuration.selector, nowTs, nowTs + 30 minutes)
        );
        auction.createAuction(SUITE_ID, 0, nowTs, nowTs + 30 minutes);

        vm.expectRevert(
            abi.encodeWithSelector(
                INightAuction.InvalidDuration.selector, nowTs, nowTs + 15 days
            )
        );
        auction.createAuction(SUITE_ID, 0, nowTs, nowTs + 15 days);
        vm.stopPrank();
    }

    function test_CreateAuctionRevertsIfAlreadyOpen() public {
        _open(0.1 ether, 0, 24);
        vm.prank(hotelAdmin);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.AuctionAlreadyExists.selector, SUITE_ID));
        auction.createAuction(
            SUITE_ID, 0.1 ether, uint64(block.timestamp), uint64(block.timestamp + 24 hours)
        );
    }

    // ── Pujas ─────────────────────────────────────────────────────────────────
    function test_BidBelowReserveReverts() public {
        _open(0.1 ether, 0, 24);
        vm.prank(bidderA);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.BidTooLow.selector, 0.1 ether, 0.09 ether));
        auction.bid{value: 0.09 ether}(SUITE_ID);
    }

    function test_BidRequiresIncrementOverBestBid() public {
        _open(0.1 ether, 0, 24);
        vm.prank(bidderA);
        auction.bid{value: 0.1 ether}(SUITE_ID);

        // 5 % de 0,1 = 0,005 ⇒ mínimo 0,105
        assertEq(auction.nextMinBid(SUITE_ID), 0.105 ether);
        vm.prank(bidderB);
        vm.expectRevert(
            abi.encodeWithSelector(INightAuction.BidTooLow.selector, 0.105 ether, 0.104 ether)
        );
        auction.bid{value: 0.104 ether}(SUITE_ID);

        vm.prank(bidderB);
        auction.bid{value: 0.105 ether}(SUITE_ID);
        assertEq(auction.auctionOf(SUITE_ID).highestBidder, bidderB);
    }

    function test_BidBeforeStartReverts() public {
        uint64 start = uint64(block.timestamp) + 2 hours;
        vm.prank(hotelAdmin);
        auction.createAuction(SUITE_ID, 0.1 ether, start, start + 24 hours);

        vm.prank(bidderA);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.AuctionNotStarted.selector, SUITE_ID, start));
        auction.bid{value: 0.1 ether}(SUITE_ID);
    }

    function test_BidAfterEndReverts() public {
        _open(0.1 ether, 0, 2);
        vm.warp(block.timestamp + 2 hours + 1);
        vm.prank(bidderA);
        vm.expectRevert();
        auction.bid{value: 0.1 ether}(SUITE_ID);
    }

    function test_OutbidBidderKeepsPullRefund() public {
        _open(0.1 ether, 0, 24);
        vm.prank(bidderA);
        auction.bid{value: 0.12 ether}(SUITE_ID);

        vm.prank(bidderB);
        auction.bid{value: 0.2 ether}(SUITE_ID);

        assertEq(auction.pendingWithdrawals(bidderA), 0.12 ether, "puja superada reclamable");
        assertEq(auction.pendingWithdrawals(bidderB), 0, "la mejor puja sigue en custodia");
        assertEq(auction.totalPending(), 0.12 ether);

        uint256 before = bidderA.balance;
        vm.prank(bidderA);
        auction.withdraw();
        assertEq(bidderA.balance, before + 0.12 ether);
        assertEq(auction.pendingWithdrawals(bidderA), 0);
    }

    function test_WithdrawWithoutFundsReverts() public {
        vm.prank(stranger);
        vm.expectRevert(INightAuction.NothingToWithdraw.selector);
        auction.withdraw();
    }

    // ── Anti-sniping ──────────────────────────────────────────────────────────
    function test_AntiSnipeExtendsEndTime() public {
        uint64 end = _open(0.1 ether, 0, 2);

        // Primera puja lejos del cierre: no extiende.
        vm.prank(bidderA);
        auction.bid{value: 0.1 ether}(SUITE_ID);
        assertEq(auction.auctionOf(SUITE_ID).endTime, end, "sin extension al principio");

        // Puja dentro de la ventana final (5 min): el cierre se desplaza a now + ventana.
        vm.warp(end - 2 minutes);
        vm.prank(bidderB);
        auction.bid{value: 0.12 ether}(SUITE_ID);

        uint64 newEnd = auction.auctionOf(SUITE_ID).endTime;
        assertEq(newEnd, uint64(block.timestamp) + auction.ANTI_SNIPE_WINDOW());
        assertGt(newEnd, end, "el cierre se ha extendido");
    }

    // ── Liquidación ───────────────────────────────────────────────────────────
    function test_SettleTransfersNightAndPaysHotel() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.3 ether}(SUITE_ID);

        vm.warp(end + 1);
        auction.settle(SUITE_ID);

        // La noche es del ganador y queda como vendida: puede revender y hacer check-in.
        assertEq(nft.ownerOf(SUITE_ID), bidderA);
        assertTrue(nft.soldOnce(SUITE_ID), "venta primaria marcada on-chain");
        assertEq(uint256(auction.stateOf(SUITE_ID)), uint256(INightAuction.AuctionState.SETTLED));

        // El importe espera al hotel (pull payment) y no se le empuja.
        assertEq(auction.pendingWithdrawals(treasury), 0.3 ether);

        uint256 before = treasury.balance;
        vm.prank(treasury);
        auction.withdraw();
        assertEq(treasury.balance, before + 0.3 ether, "el hotel cobra por pull payment");
    }

    function test_SettleBeforeEndReverts() public {
        _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.1 ether}(SUITE_ID);

        vm.expectRevert();
        auction.settle(SUITE_ID);
    }

    function test_SettleWithoutBidsReverts() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.warp(end + 1);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.NothingToSettle.selector, SUITE_ID));
        auction.settle(SUITE_ID);
    }

    function test_SettleTwiceReverts() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.2 ether}(SUITE_ID);
        vm.warp(end + 1);
        auction.settle(SUITE_ID);

        vm.expectRevert(abi.encodeWithSelector(INightAuction.AuctionClosed.selector, SUITE_ID));
        auction.settle(SUITE_ID);
    }

    /// @dev Nadie puede comprar la noche por la vía primaria normal una vez subastada y vendida.
    function test_BuyAfterAuctionReverts() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.2 ether}(SUITE_ID);
        vm.warp(end + 1);
        auction.settle(SUITE_ID);

        address late = makeAddr("late");
        vm.deal(late, 1 ether);
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotAvailable.selector, SUITE_ID));
        nft.buy{value: PRICE}(SUITE_ID);
    }

    /// @dev El ganador puede revender (necesita `soldOnce`, que es justo lo que arregla el gancho).
    function test_WinnerCanResell() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.2 ether}(SUITE_ID);
        vm.warp(end + 1);
        auction.settle(SUITE_ID);

        vm.prank(bidderA);
        nft.list(SUITE_ID, 0.25 ether);
        assertEq(nft.listingOf(SUITE_ID).price, 0.25 ether, "el ganador puede revender su noche");
    }

    /// @dev Recepción puede anclar el check-in de la noche subastada (también exige `soldOnce`).
    function test_WinnerNightCanCheckIn() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.2 ether}(SUITE_ID);
        vm.warp(end + 1);
        auction.settle(SUITE_ID);

        address reception = makeAddr("reception");
        nft.grantRole(nft.RECEPTION_ROLE(), reception);
        vm.prank(reception);
        nft.markCheckedIn(SUITE_ID);
        assertTrue(nft.isCheckedIn(SUITE_ID));
    }

    // ── Cancelación ───────────────────────────────────────────────────────────
    function test_CancelWithoutBidsReturnsNightToNothing() public {
        _open(0.1 ether, 0, 2);
        vm.prank(hotelAdmin);
        auction.cancel(SUITE_ID);

        assertEq(uint256(auction.stateOf(SUITE_ID)), uint256(INightAuction.AuctionState.CANCELLED));
        assertEq(nft.ownerOf(SUITE_ID), treasury, "la noche nunca salio del hotel");
        assertFalse(nft.soldOnce(SUITE_ID));
    }

    function test_CancelWithBidsRevertsUnlessExpired() public {
        _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.1 ether}(SUITE_ID);

        vm.prank(hotelAdmin);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.NotCancellable.selector, SUITE_ID));
        auction.cancel(SUITE_ID);

        // Si la noche caduca, la subasta ya no puede venderse: se cancela y el pujante reclama.
        vm.warp(BASE_TS + 60 days);
        vm.prank(hotelAdmin);
        auction.cancel(SUITE_ID);
        assertEq(auction.pendingWithdrawals(bidderA), 0.1 ether);
    }

    function test_CancelledAuctionRejectsBids() public {
        _open(0.1 ether, 0, 2);
        vm.prank(hotelAdmin);
        auction.cancel(SUITE_ID);

        vm.prank(bidderA);
        vm.expectRevert(abi.encodeWithSelector(INightAuction.AuctionClosed.selector, SUITE_ID));
        auction.bid{value: 1 ether}(SUITE_ID);
    }

    function test_CanReopenCancelledNight() public {
        _open(0.1 ether, 0, 2);
        vm.prank(hotelAdmin);
        auction.cancel(SUITE_ID);

        uint64 start = uint64(block.timestamp) + 1 hours;
        vm.prank(hotelAdmin);
        auction.createAuction(SUITE_ID, 0.2 ether, start, start + 5 hours);
        assertEq(auction.auctionOf(SUITE_ID).reservePrice, 0.2 ether);
    }

    // ── Pausa ─────────────────────────────────────────────────────────────────
    function test_PauseBlocksCreateBidAndSettleButNotWithdraw() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.1 ether}(SUITE_ID);
        vm.prank(bidderB);
        auction.bid{value: 0.2 ether}(SUITE_ID);
        // bidderA tiene 0,1 pendiente
        assertEq(auction.pendingWithdrawals(bidderA), 0.1 ether);

        vm.prank(hotelAdmin);
        auction.pause();

        vm.prank(hotelAdmin);
        vm.expectRevert();
        auction.createAuction(SIMPLE_ID, 0.1 ether, uint64(block.timestamp), uint64(block.timestamp + 1 days));

        vm.prank(stranger);
        vm.expectRevert();
        auction.bid{value: 1 ether}(SUITE_ID);

        vm.warp(end + 1);
        vm.expectRevert();
        auction.settle(SUITE_ID);

        // Retirar sigue permitido: los fondos son de sus dueños.
        uint256 before = bidderA.balance;
        vm.prank(bidderA);
        auction.withdraw();
        assertEq(bidderA.balance, before + 0.1 ether);

        vm.prank(hotelAdmin);
        auction.unpause();
        auction.settle(SUITE_ID);
        assertEq(nft.ownerOf(SUITE_ID), bidderB);
    }

    // ── Gancho de liquidación en HotelNights ──────────────────────────────────
    function test_SettleAuctionOnNightsIsRoleGated() public {
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                stranger,
                nft.AUCTION_ROLE()
            )
        );
        nft.settleAuction(SUITE_ID, bidderA, 1 ether);
        vm.stopPrank();
    }

    function test_SettleAuctionRejectsZeroWinnerAndZeroPrice() public {
        vm.startPrank(address(auction));
        vm.expectRevert(IHotelNights.InvalidWinner.selector);
        nft.settleAuction(SUITE_ID, address(0), 1 ether);

        vm.expectRevert(IHotelNights.InvalidPrice.selector);
        nft.settleAuction(SUITE_ID, bidderA, 0);
        vm.stopPrank();
    }

    function test_SettleAuctionEmitsPrimarySale() public {
        uint64 end = _open(0.1 ether, 0, 2);
        vm.prank(bidderA);
        auction.bid{value: 0.4 ether}(SUITE_ID);
        vm.warp(end + 1);

        vm.expectEmit(true, true, true, true, address(nft));
        emit IHotelNights.Sale(SUITE_ID, treasury, bidderA, 0.4 ether, IHotelNights.SaleType.PRIMARY);
        auction.settle(SUITE_ID);
    }
}
