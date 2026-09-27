// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/// @notice Comprador malicioso que reintenta `buy` al recibir el NFT (CU-05 reentrancy, docs/SRS.md §9).
contract ReentrantBuyer is IERC721Receiver {
    HotelNights private immutable NFT;
    uint256 private tokenId;
    uint256 private price;

    constructor(HotelNights nft_) {
        NFT = nft_;
    }

    function attack(uint256 tokenId_, uint256 price_) external {
        tokenId = tokenId_;
        price = price_;
        NFT.buy{value: price_}(tokenId_);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        NFT.buy{value: price}(tokenId); // reentrada → debe revertir
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/// @notice Tesorería hostil: rechaza ETH en `receive` (MINOR#7: bloquea la primaria).
contract RejectingTreasury {
    receive() external payable {
        revert("tesoreria rechaza ETH");
    }
}

/// @notice CU-05 — Comprar una noche (venta primaria) + guard de transferencias (ADR-07).
contract HotelNightsBuyTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal buyer = makeAddr("buyer");
    uint256 internal constant ROOM = 102;
    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant TOKEN_ID = 10_220_260_615;
    string internal constant URI = "ipfs://QmMetadataSuite";

    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01 UTC
    uint256 internal constant AFTER_TS = 1_781_913_600; // 2026-06-20 UTC

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.prank(minter);
        nft.mint(ROOM, DATE, PRICE, URI);
    }

    function test_BuyPrimarySuccess() public {
        vm.deal(buyer, PRICE);
        uint256 treasuryBefore = treasury.balance;

        vm.expectEmit(true, true, true, true, address(nft));
        emit IHotelNights.Sale(TOKEN_ID, treasury, buyer, PRICE, IHotelNights.SaleType.PRIMARY);

        vm.recordLogs();
        vm.prank(buyer);
        nft.buy{value: PRICE}(TOKEN_ID);

        assertEq(nft.ownerOf(TOKEN_ID), buyer);
        assertTrue(nft.soldOnce(TOKEN_ID));
        assertEq(treasury.balance, treasuryBefore + PRICE); // 100 % a tesorería
        assertEq(address(nft).balance, 0);

        // La primaria no emite RoyaltyPaid.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 royaltyTopic = keccak256("RoyaltyPaid(uint256,address,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != royaltyTopic, "no debe haber RoyaltyPaid");
        }
    }

    function test_BuyAlreadySoldReverts() public {
        vm.deal(buyer, PRICE * 2);
        vm.prank(buyer);
        nft.buy{value: PRICE}(TOKEN_ID);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotAvailable.selector, TOKEN_ID));
        nft.buy{value: PRICE}(TOKEN_ID);
    }

    function test_BuyNonexistentReverts() public {
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotAvailable.selector, uint256(1)));
        nft.buy{value: PRICE}(1);
    }

    function test_BuyExpiredReverts() public {
        vm.warp(AFTER_TS); // la noche (2026-06-15) ya expiró
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightExpired.selector, TOKEN_ID));
        nft.buy{value: PRICE}(TOKEN_ID);
    }

    function test_BuyIncorrectPaymentReverts() public {
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.IncorrectPayment.selector, PRICE, 0.4 ether)
        );
        nft.buy{value: 0.4 ether}(TOKEN_ID);
    }

    function test_BuyReentrancyReverts() public {
        ReentrantBuyer attacker = new ReentrantBuyer(nft);
        vm.deal(address(attacker), PRICE * 3);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attack(TOKEN_ID, PRICE);

        // La compra no se materializó (sigue en el hotel, no vendida).
        assertEq(nft.ownerOf(TOKEN_ID), treasury);
        assertFalse(nft.soldOnce(TOKEN_ID));
    }

    function test_DirectTransferDisabled() public {
        vm.prank(treasury);
        vm.expectRevert(IHotelNights.DirectTransferDisabled.selector);
        nft.transferFrom(treasury, buyer, TOKEN_ID);
    }

    function test_DirectTransferBlockedAfterSuccessfulBuy() public {
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        nft.buy{value: PRICE}(TOKEN_ID);

        // El desbloqueo se consumió: el comprador no puede re-transferir directamente.
        vm.prank(buyer);
        vm.expectRevert(IHotelNights.DirectTransferDisabled.selector);
        nft.transferFrom(buyer, address(0xBEEF), TOKEN_ID);
    }

    function test_BuyEthTransferFailedWhenTreasuryReverts() public {
        // MINOR#7: si la tesorería revierte al recibir ETH, la primaria revierte
        // `EthTransferFailed` y la venta NO se materializa (CEI + revert atómico).
        RejectingTreasury rejecter = new RejectingTreasury();
        HotelNights local = new HotelNights(address(rejecter));
        RoomRegistrySeed.seed(local);
        local.grantRole(local.MINTER_ROLE(), minter);
        vm.prank(minter);
        local.mint(ROOM, DATE, PRICE, URI); // minteada al inventario (rejecter)

        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(IHotelNights.EthTransferFailed.selector);
        local.buy{value: PRICE}(TOKEN_ID);

        // La venta no se materializó: sigue en el inventario y sin marcar como vendida.
        assertEq(local.ownerOf(TOKEN_ID), address(rejecter));
        assertFalse(local.soldOnce(TOKEN_ID));
    }

    function test_GuardNotStuckAfterRevertedBuy() public {
        // Un buy que desbloquea y revierte (reentrancy) no deja el guard pegado (transient).
        ReentrantBuyer attacker = new ReentrantBuyer(nft);
        vm.deal(address(attacker), PRICE * 3);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attack(TOKEN_ID, PRICE);

        vm.prank(treasury);
        vm.expectRevert(IHotelNights.DirectTransferDisabled.selector);
        nft.transferFrom(treasury, buyer, TOKEN_ID);
    }
}
