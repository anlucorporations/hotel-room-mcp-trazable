// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/// @notice Reintenta `buyResale` al recibir el NFT (CU-07 reentrancy).
contract ReentrantResaleBuyer is IERC721Receiver {
    HotelNights private immutable NFT;
    uint256 private tokenId;
    uint256 private price;

    constructor(HotelNights nft_) {
        NFT = nft_;
    }

    function attack(uint256 tokenId_, uint256 price_) external {
        tokenId = tokenId_;
        price = price_;
        NFT.buyResale{value: price_}(tokenId_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        NFT.buyResale{value: price}(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/// @notice Receptor de royalty que rechaza ETH (CU-07: no debe bloquear la reventa con pull).
contract RejectingReceiver {
    receive() external payable {
        revert("rechazo ETH");
    }
}

/// @notice CU-06/07 — Listar/cancelar reventa y comprar reventa con royalty (pull).
contract HotelNightsResaleTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant ROYALTY_BPS = 1000; // 10 %
    uint256 internal constant ROOM = 102;
    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant RESALE = 1 ether;
    uint256 internal constant TOKEN_ID = 10_220_260_615;
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01
    uint256 internal constant AFTER_TS = 1_781_913_600; // 2026-06-20
    string internal constant URI = "ipfs://x";

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury, ROYALTY_BPS);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.prank(minter);
        nft.mint(ROOM, DATE, PRICE, URI);
        // `seller` compra la primaria y queda como propietario.
        vm.deal(seller, PRICE);
        vm.prank(seller);
        nft.buy{value: PRICE}(TOKEN_ID);
    }

    function _list(uint256 price) internal {
        vm.prank(seller);
        nft.list(TOKEN_ID, price);
    }

    // ── CU-06: listar / cancelar ──────────────────────────────────────────────
    function test_ListAndUnlist() public {
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Listed(TOKEN_ID, seller, RESALE);
        _list(RESALE);

        IHotelNights.Listing memory l = nft.listingOf(TOKEN_ID);
        assertTrue(l.active);
        assertEq(l.price, RESALE);

        vm.expectEmit(true, false, false, false, address(nft));
        emit IHotelNights.Unlisted(TOKEN_ID);
        vm.prank(seller);
        nft.unlist(TOKEN_ID);
        assertFalse(nft.listingOf(TOKEN_ID).active);
    }

    function test_ListNotOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(IHotelNights.NotOwner.selector);
        nft.list(TOKEN_ID, RESALE);
    }

    function test_ListZeroPriceReverts() public {
        vm.prank(seller);
        vm.expectRevert(IHotelNights.InvalidPrice.selector);
        nft.list(TOKEN_ID, 0);
    }

    function test_ListExpiredReverts() public {
        vm.warp(AFTER_TS);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightExpired.selector, TOKEN_ID));
        nft.list(TOKEN_ID, RESALE);
    }

    function test_UnlistNotListedReverts() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NotListed.selector, TOKEN_ID));
        nft.unlist(TOKEN_ID);
    }

    // ── CU-07: comprar reventa ────────────────────────────────────────────────
    function test_BuyResaleSplitsRoyaltyViaPull() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);

        vm.expectEmit(true, true, true, true, address(nft));
        emit IHotelNights.Sale(TOKEN_ID, seller, buyer, RESALE, IHotelNights.SaleType.SECONDARY);
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.RoyaltyPaid(TOKEN_ID, treasury, 0.1 ether);

        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID);

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        assertTrue(nft.soldOnce(TOKEN_ID));
        assertFalse(nft.listingOf(TOKEN_ID).active);
        // Pull: acreditado, no enviado.
        assertEq(nft.pendingWithdrawals(seller), 0.9 ether);
        assertEq(nft.pendingWithdrawals(treasury), 0.1 ether);
        assertEq(address(nft).balance, RESALE);

        // claim del vendedor.
        uint256 before = seller.balance;
        vm.prank(seller);
        nft.claim();
        assertEq(seller.balance, before + 0.9 ether);
        assertEq(nft.pendingWithdrawals(seller), 0);
    }

    function test_RoyaltyNonDivisibleKeepsExactSum() public {
        _list(333); // wei
        vm.deal(buyer, 333);
        vm.prank(buyer);
        nft.buyResale{value: 333}(TOKEN_ID);

        uint256 royalty = nft.pendingWithdrawals(treasury);
        uint256 proceeds = nft.pendingWithdrawals(seller);
        assertEq(royalty, 33); // 333 * 1000 / 10000 truncado
        assertEq(proceeds, 300);
        assertEq(royalty + proceeds, 333); // sin wei atrapados
    }

    function test_BuyResaleIncorrectPaymentReverts() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.IncorrectPayment.selector, RESALE, 0.5 ether)
        );
        nft.buyResale{value: 0.5 ether}(TOKEN_ID);
    }

    function test_BuyResaleNotListedReverts() public {
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NotListed.selector, TOKEN_ID));
        nft.buyResale{value: RESALE}(TOKEN_ID);
    }

    function test_BuyResaleExpiredReverts() public {
        _list(RESALE);
        vm.warp(AFTER_TS);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightExpired.selector, TOKEN_ID));
        nft.buyResale{value: RESALE}(TOKEN_ID);
    }

    function test_BuyResaleReentrancyReverts() public {
        _list(RESALE);
        ReentrantResaleBuyer attacker = new ReentrantResaleBuyer(nft);
        vm.deal(address(attacker), RESALE * 3);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attack(TOKEN_ID, RESALE);
        // No se materializó: sigue siendo del vendedor y listada.
        assertEq(nft.ownerOf(TOKEN_ID), seller);
    }

    function test_ClaimNoFundsReverts() public {
        vm.prank(stranger);
        vm.expectRevert(IHotelNights.NoFunds.selector);
        nft.claim();
    }

    function test_DirectTransferStillBlockedAfterResale() public {
        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID);

        vm.prank(buyer);
        vm.expectRevert(IHotelNights.DirectTransferDisabled.selector);
        nft.transferFrom(buyer, stranger, TOKEN_ID);
    }

    function test_RejectingRoyaltyReceiverDoesNotBlockResale() public {
        // El receptor de royalty rechaza ETH; con pull, la reventa NO se bloquea (ADR-15).
        RejectingReceiver rejecter = new RejectingReceiver();
        nft.setTreasury(address(rejecter)); // address(this) es DEFAULT_ADMIN

        _list(RESALE);
        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        nft.buyResale{value: RESALE}(TOKEN_ID); // no revierte

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        assertEq(nft.pendingWithdrawals(address(rejecter)), 0.1 ether); // acreditado (aunque no pueda cobrar)
    }
}
