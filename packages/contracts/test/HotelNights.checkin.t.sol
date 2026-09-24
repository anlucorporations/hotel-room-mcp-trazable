// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/**
 * @title HotelNightsCheckInTest
 * @notice D-05 — Check-in on-chain: `markCheckedIn` (solo RECEPTION_ROLE, una única vez,
 *         token existente, no en pausa) consume la noche de forma irreversible y bloquea su
 *         reventa (`list` y `buyResale`).
 */
contract HotelNightsCheckInTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal reception = makeAddr("reception");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

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
        nft = new HotelNights(treasury); // 2.º arg heredado: SIN efecto (D-06)
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.RECEPTION_ROLE(), reception);
        nft.grantRole(nft.PAUSER_ROLE(), address(this));

        vm.prank(minter);
        nft.mint(ROOM, DATE, PRICE, URI);

        // `seller` compra la primaria: queda EN_PODER_CLIENTE y puede revender.
        vm.deal(seller, PRICE);
        vm.prank(seller);
        nft.buy{value: PRICE}(TOKEN_ID);
    }

    // ── Marcado del check-in ──────────────────────────────────────────────────
    function test_IsCheckedInFalseByDefault() public view {
        assertFalse(nft.isCheckedIn(TOKEN_ID));
    }

    function test_MarkCheckedInSetsFlagAndEmits() public {
        assertFalse(nft.isCheckedIn(TOKEN_ID));

        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.CheckedIn(TOKEN_ID, reception, block.timestamp);
        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);

        assertTrue(nft.isCheckedIn(TOKEN_ID));
        assertEq(nft.ownerOf(TOKEN_ID), seller); // el check-in no mueve la propiedad
        assertTrue(nft.soldOnce(TOKEN_ID));
    }

    function test_MarkCheckedInRequiresReceptionRole() public {
        bytes32 role = nft.RECEPTION_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        nft.markCheckedIn(TOKEN_ID);
        assertFalse(nft.isCheckedIn(TOKEN_ID));
    }

    function test_MarkCheckedInTwiceReverts() public {
        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);

        vm.prank(reception);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.AlreadyCheckedIn.selector, TOKEN_ID));
        nft.markCheckedIn(TOKEN_ID);

        assertTrue(nft.isCheckedIn(TOKEN_ID)); // el intento fallido no altera el estado
    }

    function test_MarkCheckedInNonexistentTokenReverts() public {
        uint256 ghost = 999 * 1e8 + DATE;
        vm.prank(reception);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotAvailable.selector, ghost));
        nft.markCheckedIn(ghost);
    }

    function test_MarkCheckedInBlockedWhenPaused() public {
        nft.pause();
        vm.prank(reception);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        nft.markCheckedIn(TOKEN_ID);
        assertFalse(nft.isCheckedIn(TOKEN_ID));
    }

    function test_MarkCheckedInForExpiredNightStillPossible() public {
        // El check-in es un ancla de consumo, no una operación de mercado: la caducidad de la
        // fecha no la bloquea (recepción puede cerrar el estado de una noche ya pasada).
        vm.warp(AFTER_TS);
        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);
        assertTrue(nft.isCheckedIn(TOKEN_ID));
    }

    // ── El check-in bloquea la reventa ────────────────────────────────────────
    function test_CheckedInNightCannotBeListed() public {
        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotResellable.selector, TOKEN_ID));
        nft.list(TOKEN_ID, RESALE);

        assertFalse(nft.listingOf(TOKEN_ID).active);
    }

    function test_CheckedInListedNightCannotBeBoughtInResale() public {
        // El vendedor lista ANTES del check-in y el listado queda vigente...
        vm.prank(seller);
        nft.list(TOKEN_ID, RESALE);
        assertTrue(nft.listingOf(TOKEN_ID).active);

        // ...pero recepción marca el check-in: la reventa ya no puede consumarse.
        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);

        vm.deal(buyer, RESALE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotResellable.selector, TOKEN_ID));
        nft.buyResale{value: RESALE}(TOKEN_ID);

        // Nada se movió: ni el NFT, ni los fondos pull, ni el listado.
        assertEq(nft.ownerOf(TOKEN_ID), seller);
        assertEq(address(nft).balance, 0);
        assertEq(nft.pendingWithdrawals(seller), 0);
        assertEq(nft.pendingWithdrawals(treasury), 0);
        assertTrue(nft.listingOf(TOKEN_ID).active);
    }

    function test_ReceptionCheckInDoesNotAffectOtherNights() public {
        uint256 otherDate = 20_260_616;
        uint256 otherTokenId = ROOM * 1e8 + otherDate;
        vm.prank(minter);
        nft.mint(ROOM, otherDate, PRICE, URI);

        vm.prank(reception);
        nft.markCheckedIn(TOKEN_ID);

        assertTrue(nft.isCheckedIn(TOKEN_ID));
        assertFalse(nft.isCheckedIn(otherTokenId));
    }

    /**
     * @notice D-05 (endurecido): el check-in acredita el consumo de una noche VENDIDA. Marcar
     *         inventario del hotel revertía el propósito y, al ser irreversible, dejaría la
     *         noche invendible para siempre. Este caso lo cierra el guard `NightNotSold`.
     */
    function test_MarkCheckedInRequiresSoldOnce() public {
        uint256 otherDate = 20_260_618;
        uint256 otherTokenId = ROOM * 1e8 + otherDate;
        vm.prank(minter);
        nft.mint(ROOM, otherDate, PRICE, URI);

        vm.prank(reception);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NightNotSold.selector, otherTokenId));
        nft.markCheckedIn(otherTokenId);

        assertFalse(nft.isCheckedIn(otherTokenId));
        assertEq(nft.ownerOf(otherTokenId), treasury); // sigue siendo inventario del hotel
    }
}
