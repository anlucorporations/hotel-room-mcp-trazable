// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";

/// @notice CU-16 — Gestión de roles (grant/revoke) y transferencia de ownership (Ownable2Step).
contract HotelNightsOwnershipTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal newOwner = makeAddr("newOwner");
    address internal stranger = makeAddr("stranger");
    address internal operator = makeAddr("operator");

    function setUp() public {
        // address(this) queda como owner (Ownable(msg.sender)) y DEFAULT_ADMIN.
        nft = new HotelNights(treasury, 1000);
    }

    // ── Ownership en dos pasos (TC-CT-090..093) ───────────────────────────────
    function test_TransferOwnershipIsTwoStep() public {
        assertEq(nft.owner(), address(this));

        nft.transferOwnership(newOwner);
        assertEq(nft.owner(), address(this)); // aún no es owner
        assertEq(nft.pendingOwner(), newOwner);

        vm.prank(newOwner);
        nft.acceptOwnership();
        assertEq(nft.owner(), newOwner);
        assertEq(nft.pendingOwner(), address(0));
    }

    function test_AcceptByNonDesignatedReverts() public {
        nft.transferOwnership(newOwner);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        nft.acceptOwnership();
    }

    function test_TransferOwnershipRequiresOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        nft.transferOwnership(stranger);
    }

    // ── Gestión de roles (CU-16) ──────────────────────────────────────────────
    function test_GrantAndRevokeRole() public {
        bytes32 minterRole = nft.MINTER_ROLE();
        nft.grantRole(minterRole, operator);
        assertTrue(nft.hasRole(minterRole, operator));

        nft.revokeRole(minterRole, operator);
        assertFalse(nft.hasRole(minterRole, operator));
    }

    function test_GrantRoleRequiresAdmin() public {
        bytes32 minterRole = nft.MINTER_ROLE();
        bytes32 adminRole = nft.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole
            )
        );
        nft.grantRole(minterRole, stranger);
    }
}
