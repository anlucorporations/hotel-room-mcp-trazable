// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {HotelNFT} from "../src/HotelNFT.sol";

contract HotelNFTTest is Test {
    HotelNFT public nft;

    address public admin = address(0x1111);
    address public treasury = address(0x2222);
    address public minter = address(0x3333);
    address public burner = address(0x4444);
    address public reception = address(0x5555);
    address public marketplace = address(0x6666);
    address public user1 = address(0x7777);
    address public user2 = address(0x8888);

    uint256 public futureDate;

    function setUp() public {
        vm.warp(1772496000); // 1 de marzo de 2026
        futureDate = block.timestamp + 10 days;

        nft = new HotelNFT(admin, treasury);

        vm.startPrank(admin);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.BURNER_ROLE(), burner);
        nft.grantRole(nft.RECEPTION_ROLE(), reception);
        nft.setMarketplaceContract(marketplace);
        vm.stopPrank();
    }

    function test_ConstructorConfiguration() public view {
        assertEq(nft.name(), "Hotel Marina del Sol Room Night");
        assertEq(nft.symbol(), "HROOM");
        assertEq(nft.treasury(), treasury);
        assertEq(nft.marketplaceContract(), marketplace);
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), minter));
        assertTrue(nft.hasRole(nft.BURNER_ROLE(), burner));
        assertTrue(nft.hasRole(nft.RECEPTION_ROLE(), reception));
    }

    function test_ConstructorRevertsOnZeroAddresses() public {
        vm.expectRevert("HotelNFT: Zero admin address");
        new HotelNFT(address(0), treasury);

        vm.expectRevert("HotelNFT: Zero treasury address");
        new HotelNFT(admin, address(0));
    }

    function test_MintBatchSuccess() public {
        uint256[] memory roomNumbers = new uint256[](3);
        roomNumbers[0] = 101; // Simple
        roomNumbers[1] = 116; // Doble
        roomNumbers[2] = 201; // Suite

        uint256[] memory timestamps = new uint256[](3);
        timestamps[0] = futureDate;
        timestamps[1] = futureDate;
        timestamps[2] = futureDate;

        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](3);
        types[0] = HotelNFT.RoomType.SIMPLE;
        types[1] = HotelNFT.RoomType.DOBLE;
        types[2] = HotelNFT.RoomType.SUITE;

        uint256[] memory prices = new uint256[](3);
        prices[0] = 0.05 ether;
        prices[1] = 0.08 ether;
        prices[2] = 0.15 ether;

        vm.prank(minter);
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        uint256 tokenSimple = nft.computeTokenId(101, futureDate);
        uint256 tokenDoble = nft.computeTokenId(116, futureDate);
        uint256 tokenSuite = nft.computeTokenId(201, futureDate);

        assertEq(nft.ownerOf(tokenSimple), marketplace);
        assertEq(nft.ownerOf(tokenDoble), marketplace);
        assertEq(nft.ownerOf(tokenSuite), marketplace);

        // Verificación de struct RoomInfo
        (uint256 rNum, uint256 cTime, HotelNFT.RoomType rType, uint256 bPrice, bool isCheck) = nft.rooms(tokenSuite);
        assertEq(rNum, 201);
        assertEq(cTime, futureDate);
        assertTrue(rType == HotelNFT.RoomType.SUITE);
        assertEq(bPrice, 0.15 ether);
        assertFalse(isCheck);
    }

    function test_MintBatchRevertsUnauthorized() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 101;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(user1);
        vm.expectRevert();
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);
    }

    function test_MintBatchValidationReverts() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 999; // Fuera del maestro
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(minter);
        vm.expectRevert("HotelNFT: Room not in master");
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        // Fecha en el pasado
        roomNumbers[0] = 101;
        timestamps[0] = block.timestamp - 1;
        vm.prank(minter);
        vm.expectRevert("HotelNFT: Check-in date in the past");
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        // Precio cero
        timestamps[0] = futureDate;
        prices[0] = 0;
        vm.prank(minter);
        vm.expectRevert("HotelNFT: Price must be greater than zero");
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);
    }

    function test_RoyaltyCalculation() public {
        uint256[] memory roomNumbers = new uint256[](2);
        roomNumbers[0] = 101; // Simple
        roomNumbers[1] = 201; // Suite
        uint256[] memory timestamps = new uint256[](2);
        timestamps[0] = futureDate;
        timestamps[1] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](2);
        types[0] = HotelNFT.RoomType.SIMPLE;
        types[1] = HotelNFT.RoomType.SUITE;
        uint256[] memory prices = new uint256[](2);
        prices[0] = 1 ether;
        prices[1] = 1 ether;

        vm.prank(minter);
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        uint256 tokenSimple = nft.computeTokenId(101, futureDate);
        uint256 tokenSuite = nft.computeTokenId(201, futureDate);

        (address rec1, uint256 amount1) = nft.royaltyInfo(tokenSimple, 1 ether);
        assertEq(rec1, treasury);
        assertEq(amount1, 0.05 ether); // 5%

        (address rec2, uint256 amount2) = nft.royaltyInfo(tokenSuite, 1 ether);
        assertEq(rec2, treasury);
        assertEq(amount2, 0.10 ether); // 10%
    }

    function test_MarkCheckedInBlocksTransfers() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 101;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(minter);
        nft.mintBatch(user1, roomNumbers, timestamps, types, prices);

        uint256 tokenId = nft.computeTokenId(101, futureDate);

        // Transferencia permitida a través del marketplace con approval
        vm.prank(user1);
        nft.approve(marketplace, tokenId);

        vm.prank(marketplace);
        nft.safeTransferFrom(user1, user2, tokenId);
        assertEq(nft.ownerOf(tokenId), user2);

        // Recepción realiza check-in presencial
        vm.prank(reception);
        nft.markCheckedIn(tokenId);

        // Intento de transferencia posterior a través del marketplace REVIERTE (prevención doble gasto)
        vm.prank(user2);
        nft.approve(marketplace, tokenId);

        vm.prank(marketplace);
        vm.expectRevert("HotelNFT: Cannot transfer checked-in room");
        nft.safeTransferFrom(user2, user1, tokenId);

        // Intento de re-marcar check-in revierte
        vm.prank(reception);
        vm.expectRevert("HotelNFT: Already checked in");
        nft.markCheckedIn(tokenId);
    }

    function test_DirectTransferBlockedOutsideMarketplace() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 101;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(minter);
        nft.mintBatch(user1, roomNumbers, timestamps, types, prices);

        uint256 tokenId = nft.computeTokenId(101, futureDate);

        // Transferencia directa de usuario a usuario sin pasar por marketplace REVIERTE
        vm.prank(user1);
        vm.expectRevert("HotelNFT: Transfers restricted to Marketplace");
        nft.safeTransferFrom(user1, user2, tokenId);
    }

    function test_BurnAfterExpiry() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 101;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(minter);
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        uint256 tokenId = nft.computeTokenId(101, futureDate);

        // Intento de quema antes de la fecha revierte
        vm.prank(burner);
        vm.expectRevert("HotelNFT: Cannot burn before check-in");
        nft.burn(tokenId);

        // Avanzar el tiempo más allá del check-in
        vm.warp(futureDate + 1);

        vm.prank(burner);
        nft.burn(tokenId);

        vm.expectRevert();
        nft.ownerOf(tokenId);
    }

    function test_PausableControls() public {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = 101;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = 0.05 ether;

        vm.prank(admin);
        nft.pause();

        vm.prank(minter);
        vm.expectRevert();
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);

        vm.prank(admin);
        nft.unpause();

        vm.prank(minter);
        nft.mintBatch(marketplace, roomNumbers, timestamps, types, prices);
    }
}
