// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {HotelNFT} from "../src/HotelNFT.sol";
import {HotelMarketplace} from "../src/HotelMarketplace.sol";

/**
 * @title AmoyLifecycleTest
 * @notice Validación integral del ciclo de vida completo on-chain para Polygon Amoy (US-24).
 * Valida: Minteo masivo -> Listado primario -> Compra primaria -> Resguardo criptográfico
 *         -> Check-in on-chain (markCheckedIn) -> Bloqueo de transferencia post check-in
 *         -> Reventa secundaria con Pull-over-Push (withdraw).
 */
contract AmoyLifecycleTest is Test {
    HotelNFT public nft;
    HotelMarketplace public marketplace;

    address public admin = address(0xAD);
    address public minter = address(0xAA);
    address public treasury = address(0x77);
    address public reception = address(0x88);
    address public guest1 = address(0xB1);
    address public guest2 = address(0xB2);

    uint256 public futureDate;
    uint256 public constant PRICE = 0.1 ether;
    uint256 public constant RESALE_PRICE = 0.15 ether;

    function setUp() public {
        vm.warp(1772496000); // 1 de marzo de 2026
        futureDate = block.timestamp + 15 days;

        vm.deal(admin, 10 ether);
        vm.deal(guest1, 10 ether);
        vm.deal(guest2, 10 ether);

        vm.startPrank(admin);
        nft = new HotelNFT(admin, treasury);
        marketplace = new HotelMarketplace(admin, address(nft), 0.001 ether);

        // Configuración de direcciones cruzadas y roles
        nft.setMarketplaceContract(address(marketplace));
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.RECEPTION_ROLE(), reception);
        vm.stopPrank();
    }

    function _mintToken(address to, uint256 roomNumber) internal returns (uint256) {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = roomNumber;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = HotelNFT.RoomType.SIMPLE;
        uint256[] memory prices = new uint256[](1);
        prices[0] = PRICE;

        vm.prank(minter);
        nft.mintBatch(to, roomNumbers, timestamps, types, prices);

        return nft.computeTokenId(roomNumber, futureDate);
    }

    function test_FullLifecyclePolygonAmoy() public {
        // 1. Minteo primario a nombre del contrato HotelNFT
        uint256 tokenId = _mintToken(address(nft), 101);

        assertEq(nft.ownerOf(tokenId), address(nft), "Contrato HotelNFT debe ser el dueno inicial del token");

        // 2. Listado primario en marketplace por el admin
        vm.startPrank(admin);
        marketplace.listForSale(tokenId, PRICE);
        vm.stopPrank();

        (address seller, uint256 listingPrice, bool active) = marketplace.listings(tokenId);
        assertTrue(active, "El token debe estar listado");
        assertEq(seller, address(nft), "El vendedor debe ser el contrato HotelNFT");
        assertEq(listingPrice, PRICE, "El precio de listado debe ser 0.1 ether");

        // 3. Compra primaria anónima con POL en msg.value
        vm.prank(guest1);
        marketplace.buy{value: PRICE}(tokenId);

        assertEq(nft.ownerOf(tokenId), guest1, "Guest1 debe ser el nuevo propietario");
        (,,,, bool isCheckedInBefore) = nft.rooms(tokenId);
        assertFalse(isCheckedInBefore, "El token no debe estar checked in inicialmente");

        // 4. Recepción ejecuta check-in on-chain (markCheckedIn)
        vm.prank(reception);
        nft.markCheckedIn(tokenId);
        (,,,, bool isCheckedInAfter) = nft.rooms(tokenId);
        assertTrue(isCheckedInAfter, "El token debe estar marcado como CHECKED_IN on-chain");

        // 5. Verificación de bloqueo: transferencias y reventas bloqueadas tras check-in
        vm.prank(guest1);
        vm.expectRevert(bytes("HotelNFT: Cannot transfer checked-in room"));
        nft.transferFrom(guest1, guest2, tokenId);

        vm.startPrank(guest1);
        nft.approve(address(marketplace), tokenId);
        vm.expectRevert(bytes("Marketplace: Room already checked in"));
        marketplace.listForSale(tokenId, RESALE_PRICE);
        vm.stopPrank();
    }

    function test_SecondaryMarketplacePullOverPushLifecycle() public {
        uint256 token2 = _mintToken(address(nft), 102);

        // Listado y compra inicial
        vm.startPrank(admin);
        marketplace.listForSale(token2, PRICE);
        vm.stopPrank();

        vm.prank(guest1);
        marketplace.buy{value: PRICE}(token2);

        // Guest1 pone en reventa secundaria
        vm.startPrank(guest1);
        nft.approve(address(marketplace), token2);
        marketplace.listForSale(token2, RESALE_PRICE);
        vm.stopPrank();

        // Guest2 compra en el mercado secundario
        vm.prank(guest2);
        marketplace.buy{value: RESALE_PRICE}(token2);

        assertEq(nft.ownerOf(token2), guest2, "Guest2 debe ser el propietario post-reventa");

        // Verificación de Pull-over-Push: fondos retenidos en pendingWithdrawals
        uint256 expectedRoyalty = (RESALE_PRICE * 500) / 10000; // 5% = 0.0075 ether
        uint256 expectedSellerShare = RESALE_PRICE - expectedRoyalty; // 0.1425 ether
        uint256 expectedTreasuryTotal = PRICE + expectedRoyalty; // 0.1 ether primario + 0.0075 ether royalty = 0.1075 ether

        assertEq(marketplace.pendingWithdrawals(guest1), expectedSellerShare, "Saldo de venta secundaria pendiente");
        assertEq(marketplace.pendingWithdrawals(treasury), expectedTreasuryTotal, "Venta primaria + royalty en tesoreria");

        // Guest1 retira sus fondos vía withdraw()
        uint256 balanceBefore = guest1.balance;
        vm.prank(guest1);
        marketplace.withdraw();
        uint256 balanceAfter = guest1.balance;

        assertEq(balanceAfter - balanceBefore, expectedSellerShare, "Guest1 debe recibir su saldo exacto");
        assertEq(marketplace.pendingWithdrawals(guest1), 0, "El saldo pendiente debe quedar en 0");
    }
}
