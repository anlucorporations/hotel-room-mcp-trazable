// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {HotelNFT} from "../src/HotelNFT.sol";
import {HotelMarketplace} from "../src/HotelMarketplace.sol";

contract Attacker is ERC721Holder {
    HotelMarketplace public marketplace;
    HotelNFT public nft;

    constructor(address _marketplace, address _nft) {
        marketplace = HotelMarketplace(_marketplace);
        nft = HotelNFT(_nft);
    }

    receive() external payable {
        if (address(marketplace).balance > 0) {
            marketplace.withdraw();
        }
    }

    function approveAndList(uint256 tokenId, uint256 price) external {
        nft.approve(address(marketplace), tokenId);
        marketplace.listForSale(tokenId, price);
    }

    function attack() external {
        marketplace.withdraw();
    }
}

contract HotelMarketplaceTest is Test {
    HotelNFT public nft;
    HotelMarketplace public marketplace;

    address public admin = address(0x1111);
    address public treasury = address(0x2222);
    address public minter = address(0x3333);
    address public burner = address(0x4444);
    address public reception = address(0x5555);
    address public seller1 = address(0x7777);
    address public buyer1 = address(0x8888);
    address public buyer2 = address(0x9999);

    uint256 public futureDate;
    uint256 public initialMinPrice = 0.01 ether;

    function setUp() public {
        vm.warp(1772496000); // 1 de marzo de 2026
        futureDate = block.timestamp + 10 days;

        nft = new HotelNFT(admin, treasury);
        marketplace = new HotelMarketplace(admin, address(nft), initialMinPrice);

        vm.startPrank(admin);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.BURNER_ROLE(), burner);
        nft.grantRole(nft.RECEPTION_ROLE(), reception);
        nft.setMarketplaceContract(address(marketplace));
        vm.stopPrank();

        // Fondear cuentas
        vm.deal(buyer1, 100 ether);
        vm.deal(buyer2, 100 ether);
    }

    function _mintTestToken(address to, uint256 roomNumber, HotelNFT.RoomType rType, uint256 price) internal returns (uint256) {
        uint256[] memory roomNumbers = new uint256[](1);
        roomNumbers[0] = roomNumber;
        uint256[] memory timestamps = new uint256[](1);
        timestamps[0] = futureDate;
        HotelNFT.RoomType[] memory types = new HotelNFT.RoomType[](1);
        types[0] = rType;
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;

        vm.prank(minter);
        nft.mintBatch(to, roomNumbers, timestamps, types, prices);

        return nft.computeTokenId(roomNumber, futureDate);
    }

    function test_InitialConfiguration() public view {
        assertEq(address(marketplace.nftContract()), address(nft));
        assertEq(marketplace.minListingPrice(), initialMinPrice);
        assertTrue(marketplace.hasRole(marketplace.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_SetMinListingPriceOnlyAdmin() public {
        vm.prank(admin);
        marketplace.setMinListingPrice(0.02 ether);
        assertEq(marketplace.minListingPrice(), 0.02 ether);

        vm.prank(seller1);
        vm.expectRevert();
        marketplace.setMinListingPrice(0.005 ether);
    }

    function test_ListForSaleSuccessAndAntiEvasion() public {
        uint256 tokenId = _mintTestToken(seller1, 101, HotelNFT.RoomType.SIMPLE, 0.05 ether);

        vm.startPrank(seller1);
        nft.approve(address(marketplace), tokenId);

        // Intento de listado por debajo del precio mínimo (evasión de royalties a 1 wei) REVIERTE
        vm.expectRevert("Marketplace: Price below minimum floor");
        marketplace.listForSale(tokenId, 1 wei);

        // Listado exitoso con precio legal
        marketplace.listForSale(tokenId, 0.05 ether);
        vm.stopPrank();

        (address s, uint256 p, bool active) = marketplace.listings(tokenId);
        assertEq(s, seller1);
        assertEq(p, 0.05 ether);
        assertTrue(active);
    }

    function test_ListForSaleRevertsIfCheckedIn() public {
        uint256 tokenId = _mintTestToken(seller1, 101, HotelNFT.RoomType.SIMPLE, 0.05 ether);

        vm.prank(seller1);
        nft.approve(address(marketplace), tokenId);

        // Recepción marca check-in
        vm.prank(reception);
        nft.markCheckedIn(tokenId);

        // Intento de listar una habitación ya disfrutada REVIERTE
        vm.prank(seller1);
        vm.expectRevert("Marketplace: Room already checked in");
        marketplace.listForSale(tokenId, 0.05 ether);
    }

    function test_CancelListing() public {
        uint256 tokenId = _mintTestToken(seller1, 101, HotelNFT.RoomType.SIMPLE, 0.05 ether);

        vm.startPrank(seller1);
        nft.approve(address(marketplace), tokenId);
        marketplace.listForSale(tokenId, 0.05 ether);
        vm.stopPrank();

        // Intento de cancelación por un tercero no autorizado REVIERTE
        vm.prank(buyer1);
        vm.expectRevert("Marketplace: Unauthorized");
        marketplace.cancelListing(tokenId);

        // Cancelación exitosa por el vendedor
        vm.prank(seller1);
        marketplace.cancelListing(tokenId);

        (, , bool active) = marketplace.listings(tokenId);
        assertFalse(active);
    }

    function test_PrimaryAndSecondaryBuyWithPullOverPush() public {
        // 1. Venta Primaria: Minteo inicial hacia contrato HotelNFT
        uint256 tokenId = _mintTestToken(address(nft), 201, HotelNFT.RoomType.SUITE, 0.20 ether);

        // Relayer (minter) lista para venta primaria (autorizado automáticamente sin approve)
        vm.prank(minter);
        marketplace.listForSale(tokenId, 0.20 ether);

        // Comprador 1 compra en venta primaria
        vm.prank(buyer1);
        marketplace.buy{value: 0.20 ether}(tokenId);

        assertEq(nft.ownerOf(tokenId), buyer1);

        // En venta primaria, el 100% va a tesorería
        assertEq(marketplace.pendingWithdrawals(treasury), 0.20 ether);

        // 2. Reventa en mercado secundario (Comprador 1 vende a Comprador 2)
        vm.startPrank(buyer1);
        nft.approve(address(marketplace), tokenId);
        marketplace.listForSale(tokenId, 0.30 ether);
        vm.stopPrank();

        vm.prank(buyer2);
        marketplace.buy{value: 0.30 ether}(tokenId);

        assertEq(nft.ownerOf(tokenId), buyer2);

        // Suite tiene 10% royalty
        // Para 0.30 ether: royalty = 0.03 ether (a tesorería), vendedor1 = 0.27 ether
        assertEq(marketplace.pendingWithdrawals(buyer1), 0.27 ether);
        assertEq(marketplace.pendingWithdrawals(treasury), 0.20 ether + 0.03 ether);

        // 3. Retiro de fondos seguro (Pull-over-Push)
        uint256 buyer1PreBal = buyer1.balance;
        vm.prank(buyer1);
        marketplace.withdraw();

        assertEq(buyer1.balance, buyer1PreBal + 0.27 ether);
        assertEq(marketplace.pendingWithdrawals(buyer1), 0);

        // Intento de retiro secundario sin fondos revierte
        vm.prank(buyer1);
        vm.expectRevert("Marketplace: Nothing to withdraw");
        marketplace.withdraw();
    }

    function testFuzz_ResaleSplitSumIntegrity(uint256 salePrice) public {
        // Acotar precio entre el mínimo y un valor razonable (ej. 100 ether)
        vm.assume(salePrice >= initialMinPrice && salePrice <= 100 ether);

        uint256 tokenId = _mintTestToken(seller1, 101, HotelNFT.RoomType.SIMPLE, 0.05 ether);

        vm.startPrank(seller1);
        nft.approve(address(marketplace), tokenId);
        marketplace.listForSale(tokenId, salePrice);
        vm.stopPrank();

        uint256 preTreasury = marketplace.pendingWithdrawals(treasury);
        uint256 preSeller = marketplace.pendingWithdrawals(seller1);

        vm.deal(buyer1, salePrice);
        vm.prank(buyer1);
        marketplace.buy{value: salePrice}(tokenId);

        uint256 royalty = marketplace.pendingWithdrawals(treasury) - preTreasury;
        uint256 sellerNet = marketplace.pendingWithdrawals(seller1) - preSeller;

        // Invariante financiera: ni un solo wei se pierde en la división
        assertEq(royalty + sellerNet, salePrice);
        assertEq(royalty, (salePrice * 500) / 10000); // 5% para habitación simple
    }

    function test_WithdrawReentrancyProtection() public {
        Attacker attacker = new Attacker(address(marketplace), address(nft));
        uint256 tokenId = _mintTestToken(address(attacker), 101, HotelNFT.RoomType.SIMPLE, 0.05 ether);

        attacker.approveAndList(tokenId, 0.05 ether);

        vm.prank(buyer1);
        marketplace.buy{value: 0.05 ether}(tokenId);

        // Atacante intenta exploit de reentrancy en withdraw()
        vm.expectRevert("Marketplace: Withdrawal failed");
        attacker.attack();
    }
}
