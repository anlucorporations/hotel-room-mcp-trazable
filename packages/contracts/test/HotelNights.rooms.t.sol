// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";
import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/// @notice D-3/D-10/D-13/D-14/D-18 — registro dinámico de habitaciones y anclaje de la huella.
contract HotelNightsRoomsTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant CONTENT_HASH = keccak256("ficha-habitacion-101");

    function setUp() public {
        nft = new HotelNights(treasury);
    }

    function test_RegistryStartsEmpty() public view {
        // D-13: el registro on-chain arranca VACÍO; la autoridad es la base de datos (D-3).
        assertFalse(nft.isRoomRegistered(101));
        assertEq(nft.roomTypeOf(101), "");
    }

    function test_RegisterRoomEmitsAndRegisters() public {
        vm.expectEmit(true, false, false, true, address(nft));
        emit IHotelNights.RoomRegistered(101, "simple");

        nft.registerRoom(101, "simple");

        assertTrue(nft.isRoomRegistered(101));
        assertEq(nft.roomTypeOf(101), "simple");
    }

    function test_RegisterRoomOutsideHistoricalRangeWorks() public {
        // D-7: el registro admite habitaciones fuera de los rangos históricos.
        nft.registerRoom(999, "suite");
        assertTrue(nft.isRoomRegistered(999));
        assertEq(nft.roomTypeOf(999), "suite");
    }

    function test_RegisterRoomDuplicateReverts() public {
        nft.registerRoom(101, "simple");
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.RoomAlreadyRegistered.selector, uint256(101)));
        nft.registerRoom(101, "doble");
    }

    function test_RegisterRoomInvalidTypeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.InvalidRoomType.selector, "triple"));
        nft.registerRoom(101, "triple");
    }

    function test_RegisterRoomZeroReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.InvalidRoom.selector, uint256(0)));
        nft.registerRoom(0, "simple");
    }

    function test_RegisterRoomRequiresAdmin() public {
        bytes32 adminRole = nft.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        nft.registerRoom(101, "simple");
    }

    function test_UpdateRoomTypeChangesRoyalty() public {
        nft.registerRoom(101, "simple");
        uint256 tokenId = 101 * 100_000_000 + 20_260_615;
        (, uint256 before) = nft.royaltyInfo(tokenId, 1 ether);
        assertEq(before, 0.05 ether, "simple: 5 %");

        nft.updateRoomType(101, "suite");
        (, uint256 afterType) = nft.royaltyInfo(tokenId, 1 ether);
        assertEq(afterType, 0.1 ether, "suite: 10 %");
    }

    function test_UpdateRoomTypeUnregisteredReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.RoomNotRegistered.selector, uint256(101)));
        nft.updateRoomType(101, "suite");
    }

    function test_PublishRoomStoresHashAndEmits() public {
        nft.registerRoom(101, "simple");

        vm.expectEmit(true, false, false, true, address(nft));
        emit IHotelNights.RoomPublished(101, CONTENT_HASH, block.timestamp);

        nft.publishRoom(101, CONTENT_HASH);
        assertEq(nft.publicationHashOf(101), CONTENT_HASH);
    }

    function test_PublishRoomRejectsZeroHash() public {
        nft.registerRoom(101, "simple");
        vm.expectRevert(IHotelNights.InvalidContentHash.selector);
        nft.publishRoom(101, bytes32(0));
    }

    function test_PublishRoomUnregisteredReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.RoomNotRegistered.selector, uint256(101)));
        nft.publishRoom(101, CONTENT_HASH);
    }

    function test_PublishRoomRequiresAdmin() public {
        nft.registerRoom(101, "simple");
        bytes32 adminRole = nft.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        nft.publishRoom(101, CONTENT_HASH);
    }

    function test_SeedRegistersHistoricalInventory() public {
        // D-14: la semilla carga las 50 habitaciones históricas con su tipo.
        RoomRegistrySeed.seed(nft);
        assertTrue(nft.isRoomRegistered(101));
        assertEq(nft.roomTypeOf(102), "simple");
        assertEq(nft.roomTypeOf(120), "doble");
        assertEq(nft.roomTypeOf(205), "suite");
    }
}
