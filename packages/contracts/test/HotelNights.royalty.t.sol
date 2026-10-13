// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @title HotelNightsRoyaltyTest
 * @notice RF-08 — Royalty ERC-2981 por TIPO de habitación: valores INICIALES de 500 bps
 *         (5 %) en simple/doble y 1000 bps (10 %) en suite, receptor `treasury`, y desde C1
 *         (2026-10-13) configurables por `ROYALTY_ADMIN_ROLE` dentro de 0–2000 bps.
 *         El reparto de `buyResale` sigue siendo exacto (royalty + proceeds == precio).
 * @dev El tipo se resuelve a partir de la habitación REGISTRADA del `tokenId`, así que las
 *      consultas son deterministas y no dependen del estado del token.
 */
contract HotelNightsRoyaltyTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal royaltyAdmin = makeAddr("royaltyAdmin");

    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01
    uint256 internal constant PRICE = 0.5 ether;

    uint256 internal constant SIMPLE_ID = 101 * 1e8 + DATE; // 101 ⇒ simple
    uint256 internal constant DOBLE_ID = 130 * 1e8 + DATE; // 130 ⇒ doble
    uint256 internal constant SUITE_ID = 201 * 1e8 + DATE; // 201 ⇒ suite

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.ROYALTY_ADMIN_ROLE(), royaltyAdmin);

        vm.startPrank(minter);
        nft.mint(101, DATE, PRICE, "ipfs://simple");
        nft.mint(130, DATE, PRICE, "ipfs://doble");
        nft.mint(201, DATE, PRICE, "ipfs://suite");
        vm.stopPrank();
    }

    // ── Royalty por tipo ──────────────────────────────────────────────────────
    function test_RoyaltySimpleIsFivePercent() public view {
        (address receiver, uint256 amount) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0.05 ether);
    }

    function test_RoyaltyDobleIsFivePercent() public view {
        (address receiver, uint256 amount) = nft.royaltyInfo(DOBLE_ID, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0.05 ether);
    }

    function test_RoyaltySuiteIsTenPercent() public view {
        (address receiver, uint256 amount) = nft.royaltyInfo(SUITE_ID, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0.1 ether);
    }

    /// @notice El receptor es `treasury` en cada consulta (no hay receptor almacenado): al
    ///         cambiar la tesorería, el royalty se redirige sin sincronizar nada.
    function test_RoyaltyReceiverFollowsTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        nft.setTreasury(newTreasury); // address(this) es DEFAULT_ADMIN

        (address receiver, uint256 amount) = nft.royaltyInfo(SUITE_ID, 1 ether);
        assertEq(receiver, newTreasury);
        assertEq(amount, 0.1 ether); // el importe no depende del receptor
    }

    // ── Redondeo (importes no divisibles exactamente) ─────────────────────────
    function test_RoyaltyRoundsDownForNonDivisibleAmounts() public view {
        uint256 price = nft.minListingPrice() + 1; // 0.01 ether + 1 wei

        (, uint256 simpleRoyalty) = nft.royaltyInfo(SIMPLE_ID, price);
        (, uint256 suiteRoyalty) = nft.royaltyInfo(SUITE_ID, price);

        assertEq(simpleRoyalty, (price * 500) / 10_000);
        assertEq(simpleRoyalty, 500_000_000_000_000); // (1e16 + 1) / 20 ⇒ se descarta 1 wei
        assertEq(suiteRoyalty, (price * 1000) / 10_000);
        assertEq(suiteRoyalty, 1_000_000_000_000_000); // (1e16 + 1) / 10 ⇒ se descarta 1 wei

        // Extremos: precio 0 ⇒ royalty 0; precios diminutos ⇒ truncado a 0, sin revertir.
        (, uint256 zeroRoyalty) = nft.royaltyInfo(SUITE_ID, 0);
        assertEq(zeroRoyalty, 0);
        (, uint256 dustRoyalty) = nft.royaltyInfo(SUITE_ID, 9); // 9 * 1000 / 10000 = 0
        assertEq(dustRoyalty, 0);
    }

    /// @notice Un `tokenId` cuya habitación no está en el maestro (p. ej. inexistente) devuelve
    ///         royalty 0 en vez de revertir: `royaltyInfo` es una vista pública de ERC-2981.
    function test_RoyaltyUnknownRoomReturnsZeroWithoutRevert() public view {
        (address receiver, uint256 amount) = nft.royaltyInfo(999 * 1e8 + DATE, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0);
    }

    // ── Valores iniciales e inmutabilidad de partida ──────────────────────────
    /// @notice Los valores INICIALES no dependen del despliegue: dos contratos recién creados
    ///         devuelven lo mismo (5 %/10 %). Solo cambian si un `ROYALTY_ADMIN` lo decide.
    function test_RoyaltyDefaultsAreEqualAcrossDeployments() public {
        HotelNights other = new HotelNights(treasury);
        RoomRegistrySeed.seed(other);

        (, uint256 simpleHere) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        (, uint256 simpleThere) = other.royaltyInfo(SIMPLE_ID, 1 ether);
        (, uint256 suiteHere) = nft.royaltyInfo(SUITE_ID, 1 ether);
        (, uint256 suiteThere) = other.royaltyInfo(SUITE_ID, 1 ether);

        assertEq(simpleHere, 0.05 ether, "5 % simple");
        assertEq(suiteHere, 0.1 ether, "10 % suite");
        assertEq(simpleHere, simpleThere, "el despliegue no altera el royalty");
        assertEq(suiteHere, suiteThere, "el despliegue no altera el royalty");
    }

    /// @notice El royalty no depende del tiempo ni del número de consultas (mismo valor siempre).
    function test_RoyaltyIsStableAcrossBlocks() public {
        (, uint256 before) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        vm.warp(BASE_TS + 365 days);
        (, uint256 later) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        assertEq(before, later);
    }

    // ── Reparto exacto en `buyResale` (suite) ─────────────────────────────────
    /// @notice La reventa de una suite liquida el 10 % con la MISMA función `royaltyInfo`:
    ///         royalty + proceeds == precio, incluso con importes no divisibles.
    function test_BuyResaleSplitsSuiteRoyaltyExactly() public {
        // `seller` compra la primaria de la suite y la lista por encima del suelo.
        vm.deal(seller, PRICE);
        vm.prank(seller);
        nft.buy{value: PRICE}(SUITE_ID);

        uint256 price = nft.minListingPrice() + 1; // no divisible exactamente por 10
        vm.prank(seller);
        nft.list(SUITE_ID, price);

        (address expectedReceiver, uint256 expectedRoyalty) = nft.royaltyInfo(SUITE_ID, price);
        assertEq(expectedReceiver, treasury);
        assertEq(expectedRoyalty, 1_000_000_000_000_000);

        vm.deal(buyer, price);
        vm.prank(buyer);
        nft.buyResale{value: price}(SUITE_ID);

        uint256 royalty = nft.pendingWithdrawals(treasury);
        uint256 proceeds = nft.pendingWithdrawals(seller);
        assertEq(royalty, expectedRoyalty);
        assertEq(royalty + proceeds, price); // reparto exacto: sin wei atrapados
        assertEq(nft.totalPending(), price);
        assertEq(nft.ownerOf(SUITE_ID), buyer);
    }

    // ── C1 (2026-10-13): royalty configurable por ROYALTY_ADMIN (RF-08) ───────

    function test_InitialRoyaltyIsFiveAndTenPercent() public view {
        assertEq(nft.royaltyBpsOf("simple"), 500, "simple 5 %");
        assertEq(nft.royaltyBpsOf("doble"), 500, "doble 5 %");
        assertEq(nft.royaltyBpsOf("suite"), 1000, "suite 10 %");
        assertEq(nft.ROYALTY_BPS_MAX(), 2000, "tope 20 %");
    }

    function test_RoyaltyAdminCanRaiseSuiteToFifteenPercent() public {
        vm.expectEmit(false, false, false, true);
        emit IHotelNights.RoyaltyUpdated("suite", 1500);

        vm.prank(royaltyAdmin);
        nft.setRoyaltyBps("suite", 1500);

        assertEq(nft.royaltyBpsOf("suite"), 1500);
        (, uint256 suiteAmount) = nft.royaltyInfo(SUITE_ID, 1 ether);
        assertEq(suiteAmount, 0.15 ether);
        // Los demás tipos no se ven afectados por el cambio de uno.
        (, uint256 simpleAmount) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        assertEq(simpleAmount, 0.05 ether);
        (, uint256 dobleAmount) = nft.royaltyInfo(DOBLE_ID, 1 ether);
        assertEq(dobleAmount, 0.05 ether);
    }

    /// @notice El 0 es un valor legítimo: desactiva el royalty del tipo y queda auditable por evento.
    function test_RoyaltyAdminCanDisableRoyaltyWithZero() public {
        vm.prank(royaltyAdmin);
        nft.setRoyaltyBps("simple", 0);

        assertEq(nft.royaltyBpsOf("simple"), 0);
        (, uint256 amount) = nft.royaltyInfo(SIMPLE_ID, 1 ether);
        assertEq(amount, 0);
    }

    function test_SetRoyaltyBpsRevertsAboveMax() public {
        vm.prank(royaltyAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.InvalidRoyaltyBps.selector, uint96(2001))
        );
        nft.setRoyaltyBps("suite", 2001);
    }

    function test_SetRoyaltyBpsRevertsForUnknownType() public {
        vm.prank(royaltyAdmin);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.InvalidRoomType.selector, "triple"));
        nft.setRoyaltyBps("triple", 500);
    }

    function test_SetRoyaltyBpsRequiresRoyaltyAdminRole() public {
        vm.startPrank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                buyer,
                nft.ROYALTY_ADMIN_ROLE()
            )
        );
        nft.setRoyaltyBps("suite", 1500);
        vm.stopPrank();
    }

    function test_RoyaltyBpsOfRejectsUnknownType() public {
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.InvalidRoomType.selector, "triple"));
        nft.royaltyBpsOf("triple");
    }

    /// @notice El valor configurado llega al reparto REAL de `buyResale` (no solo a la vista).
    function test_ConfiguredRoyaltyAppliesToResale() public {
        vm.prank(royaltyAdmin);
        nft.setRoyaltyBps("suite", 1500);

        vm.deal(seller, PRICE);
        vm.prank(seller);
        nft.buy{value: PRICE}(SUITE_ID);

        uint256 price = 1 ether;
        vm.prank(seller);
        nft.list(SUITE_ID, price);

        vm.deal(buyer, price);
        vm.prank(buyer);
        nft.buyResale{value: price}(SUITE_ID);

        assertEq(nft.pendingWithdrawals(treasury), 0.15 ether, "royalty 15 %");
        assertEq(nft.pendingWithdrawals(seller), 0.85 ether, "proceeds 85 %");
        assertEq(nft.totalPending(), price, "sin wei atrapados");
    }
}
