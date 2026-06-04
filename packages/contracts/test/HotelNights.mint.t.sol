// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/// @notice CU-02 — Mintear una noche-habitación.
contract HotelNightsMintTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant ROYALTY_BPS = 1000;
    uint256 internal constant ROOM = 102;
    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant TOKEN_ID = 10_220_260_615;
    string internal constant URI = "ipfs://QmMetadataSuite";

    // 2026-06-01 00:00:00 UTC
    uint256 internal constant BASE_TS = 1_780_272_000;

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury, ROYALTY_BPS);
        nft.grantRole(nft.MINTER_ROLE(), minter);
    }

    function _mint() internal returns (uint256) {
        vm.prank(minter);
        return nft.mint(ROOM, DATE, PRICE, URI);
    }

    function test_MintSuccess() public {
        // Hab. 102 ∈ [101,115] ⇒ "simple" según el maestro (DISEÑO §5).
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Mint(TOKEN_ID, ROOM, DATE, "simple", PRICE);

        uint256 tokenId = _mint();

        assertEq(tokenId, TOKEN_ID);
        assertEq(nft.ownerOf(TOKEN_ID), treasury); // inventario del hotel (ADR-16)
        assertEq(nft.tokenURI(TOKEN_ID), URI); // resoluble en el bloque del mint
        assertEq(nft.priceOf(TOKEN_ID), PRICE);
        assertFalse(nft.soldOnce(TOKEN_ID));
    }

    function test_MintDuplicateReverts() public {
        _mint();
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.DuplicateNight.selector, TOKEN_ID));
        nft.mint(ROOM, DATE, PRICE, URI);
    }

    function test_MintRoomNotInMaster() public {
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.RoomNotInMaster.selector, uint256(999)));
        nft.mint(999, DATE, PRICE, URI);
    }

    function test_MintInvalidPrice() public {
        vm.prank(minter);
        vm.expectRevert(IHotelNights.InvalidPrice.selector);
        nft.mint(ROOM, DATE, 0, URI);
    }

    function test_MintPastDate() public {
        vm.prank(minter);
        vm.expectRevert(IHotelNights.PastDate.selector);
        nft.mint(ROOM, 20_260_501, PRICE, URI); // < hoy (2026-06-01)
    }

    function test_MintInvalidDate() public {
        vm.prank(minter);
        vm.expectRevert(IHotelNights.InvalidDate.selector);
        nft.mint(ROOM, 20_261_301, PRICE, URI); // mes 13
    }

    function test_MintRequiresMinterRole() public {
        bytes32 minterRole = nft.MINTER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, minterRole
            )
        );
        nft.mint(ROOM, DATE, PRICE, URI);
    }

    function test_RoomTypeByRange() public {
        vm.startPrank(minter);
        uint256 d = DATE;
        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Mint(101 * 1e8 + d, 101, d, "simple", PRICE);
        nft.mint(101, d, PRICE, URI);

        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Mint(130 * 1e8 + d, 130, d, "doble", PRICE);
        nft.mint(130, d, PRICE, URI);

        vm.expectEmit(true, true, false, true, address(nft));
        emit IHotelNights.Mint(201 * 1e8 + d, 201, d, "suite", PRICE);
        nft.mint(201, d, PRICE, URI);
        vm.stopPrank();
    }
}
