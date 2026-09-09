// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {HotelNFT} from "../src/HotelNFT.sol";
import {HotelMarketplace} from "../src/HotelMarketplace.sol";

contract DeployTest is Test {
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ADMIN = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant TREASURY = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function setUp() public {
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        vm.setEnv("ADMIN_ADDRESS", vm.toString(ADMIN));
        vm.setEnv("TREASURY_ADDRESS", vm.toString(TREASURY));
        vm.setEnv("MIN_LISTING_PRICE", "10000000000000000"); // 0.01 ether
        vm.deal(vm.addr(DEPLOYER_PK), 1_000 ether);
    }

    function test_DeployHotelContracts() public {
        new Deploy().run();

        string memory json = vm.readFile("./deployments/latest.json");
        assertTrue(vm.keyExistsJson(json, ".hotelNFT"), "hotelNFT no escrito en latest.json");
        assertTrue(vm.keyExistsJson(json, ".hotelMarketplace"), "hotelMarketplace no escrito en latest.json");

        address nftAddr = vm.parseJsonAddress(json, ".hotelNFT");
        address marketplaceAddr = vm.parseJsonAddress(json, ".hotelMarketplace");

        assertTrue(nftAddr != address(0), "direccion de hotelNFT vacia");
        assertTrue(marketplaceAddr != address(0), "direccion de hotelMarketplace vacia");

        HotelNFT nft = HotelNFT(nftAddr);
        HotelMarketplace marketplace = HotelMarketplace(marketplaceAddr);

        assertEq(nft.marketplaceContract(), marketplaceAddr);
        assertEq(address(marketplace.nftContract()), nftAddr);
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(marketplace.hasRole(marketplace.DEFAULT_ADMIN_ROLE(), ADMIN));
    }
}
