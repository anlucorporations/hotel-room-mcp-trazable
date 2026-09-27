// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/// @notice Tesorería reentrante: al recibir ETH reintenta withdraw (CU-15 reentrancy, docs/SRS.md §9).
contract ReentrantTreasury {
    HotelNights private immutable NFT;

    constructor(HotelNights nft_) {
        NFT = nft_;
    }

    function trigger() external {
        NFT.withdraw();
    }

    receive() external payable {
        NFT.withdraw();
    }
}

/// @notice CU-12/14/15/16 — royalty inmutable (D-06), pausa, withdraw, setTreasury.
contract HotelNightsAdminTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant TOKEN_ID = 10_220_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant BASE_TS = 1_780_272_000;

    function setUp() public {
        vm.warp(BASE_TS);
        // El 2.º argumento (bps) es heredado y NO tiene efecto (D-06).
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
        // address(this) es DEFAULT_ADMIN: se concede el resto de roles a sí mismo.
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.PAUSER_ROLE(), address(this));
        nft.grantRole(nft.TREASURER_ROLE(), address(this));
        vm.prank(minter);
        nft.mint(102, 20_260_615, PRICE, "ipfs://x");
    }

    // ── CU-12: royalty inmutable por construcción (D-06) ──────────────────────
    /// @notice No queda superficie de gobernanza del royalty: ni setter, ni getter de bps,
    ///         ni rol que lo administre. Cualquier llamada a esas firmas revierte (no existe
    ///         la función, así que no hay `fallback` que la atienda).
    function test_RoyaltyHasNoGovernanceSurface() public {
        (bool setterOk,) =
            address(nft).call(abi.encodeWithSignature("setRoyaltyBps(uint96)", uint96(1000)));
        assertFalse(setterOk, "setRoyaltyBps no debe existir");

        (bool getterOk,) = address(nft).staticcall(abi.encodeWithSignature("royaltyBps()"));
        assertFalse(getterOk, "royaltyBps no debe existir");

        (bool roleOk,) = address(nft).staticcall(abi.encodeWithSignature("ROYALTY_ADMIN_ROLE()"));
        assertFalse(roleOk, "ROYALTY_ADMIN_ROLE no debe existir");

        // Y el royalty sigue siendo el derivado del tipo (hab. 102 = simple ⇒ 5 %).
        (address receiver, uint256 amount) = nft.royaltyInfo(TOKEN_ID, 1 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 0.05 ether);
    }

    // ── CU-14: pausa ──────────────────────────────────────────────────────────
    function test_PauseBlocksBuyThenUnpauseRestores() public {
        nft.pause();
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        nft.buy{value: PRICE}(TOKEN_ID);

        nft.unpause();
        vm.prank(buyer);
        nft.buy{value: PRICE}(TOKEN_ID); // tras unpause, compra OK
        assertEq(nft.ownerOf(TOKEN_ID), buyer);
    }

    function test_PauseBlocksMint() public {
        nft.pause();
        vm.prank(minter);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        nft.mint(103, 20_260_615, PRICE, "ipfs://y");
    }

    function test_PauseAllowsWithdrawAndRoleManagement() public {
        nft.pause();
        vm.deal(address(nft), 1 ether); // residual
        nft.withdraw(); // permitido en pausa (remediación)
        assertEq(treasury.balance, 1 ether);
        nft.grantRole(nft.MINTER_ROLE(), stranger); // gestión de roles permitida en pausa
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), stranger));
    }

    function test_PauseRequiresRole() public {
        bytes32 role = nft.PAUSER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        nft.pause();
    }

    // ── CU-15: withdraw ───────────────────────────────────────────────────────
    function test_WithdrawResidualToTreasury() public {
        vm.deal(address(nft), 5 ether);
        vm.expectEmit(true, false, false, true, address(nft));
        emit IHotelNights.Withdrawn(treasury, 5 ether);
        nft.withdraw();
        assertEq(treasury.balance, 5 ether);
        assertEq(address(nft).balance, 0);
    }

    function test_WithdrawNoFundsReverts() public {
        vm.expectRevert(IHotelNights.NoFunds.selector);
        nft.withdraw();
    }

    function test_WithdrawRequiresRole() public {
        bytes32 role = nft.TREASURER_ROLE();
        vm.deal(address(nft), 1 ether);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        nft.withdraw();
    }

    function test_WithdrawProtectsPullFunds() public {
        // El comprador revende: deja fondos pull en el contrato que withdraw NO debe tocar.
        vm.deal(buyer, PRICE);
        vm.prank(buyer);
        nft.buy{value: PRICE}(TOKEN_ID);
        vm.prank(buyer);
        nft.list(TOKEN_ID, 1 ether);
        address buyer2 = makeAddr("buyer2");
        vm.deal(buyer2, 1 ether);
        vm.prank(buyer2);
        nft.buyResale{value: 1 ether}(TOKEN_ID); // 1 ETH pull en el contrato

        vm.deal(address(nft), address(nft).balance + 2 ether); // +2 ETH residual
        uint256 treasuryBefore = treasury.balance;
        nft.withdraw();
        assertEq(treasury.balance - treasuryBefore, 2 ether); // solo el residual
        assertEq(address(nft).balance, 1 ether); // los fondos pull permanecen
    }

    function test_WithdrawReentrancyIsBlocked() public {
        ReentrantTreasury reentrant = new ReentrantTreasury(nft);
        nft.setTreasury(address(reentrant));
        nft.grantRole(nft.TREASURER_ROLE(), address(reentrant));
        vm.deal(address(nft), 1 ether);

        // La reentrada se previene: el `nonReentrant` revierte la llamada anidada, lo que hace
        // fallar el `.call` de pago y aflora `EthTransferFailed`. Lo crítico: no hay doble retiro.
        vm.expectRevert(IHotelNights.EthTransferFailed.selector);
        reentrant.trigger();
        assertEq(address(nft).balance, 1 ether); // nada se transfirió (sin drenaje)
    }

    // ── CU-16: setTreasury ────────────────────────────────────────────────────
    function test_SetTreasuryUpdatesReceiver() public {
        address newTreasury = makeAddr("newTreasury");
        vm.expectEmit(true, true, false, false, address(nft));
        emit IHotelNights.TreasuryUpdated(treasury, newTreasury);
        nft.setTreasury(newTreasury);
        assertEq(nft.treasury(), newTreasury);
        (address receiver,) = nft.royaltyInfo(TOKEN_ID, 10_000);
        assertEq(receiver, newTreasury);
    }

    function test_SetTreasuryZeroReverts() public {
        vm.expectRevert(IHotelNights.ZeroAddress.selector);
        nft.setTreasury(address(0));
    }

    function test_SetTreasuryRequiresAdmin() public {
        bytes32 role = nft.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        nft.setTreasury(stranger);
    }
}
