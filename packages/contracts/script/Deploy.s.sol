// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HotelNFT} from "../src/HotelNFT.sol";
import {HotelMarketplace} from "../src/HotelMarketplace.sol";

/**
 * @title Deploy
 * @notice Script de despliegue coordinado para HotelNFT y HotelMarketplace (US-03, ADR-06).
 *         Despliega ambos contratos, enlaza el marketplace en HotelNFT y configura
 *         los roles segregados (MINTER_ROLE, BURNER_ROLE, RECEPTION_ROLE).
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", deployer);
        uint256 minListingPrice = vm.envOr("MIN_LISTING_PRICE", uint256(0.01 ether));

        address minter = vm.envOr("MINTER_ADDRESS", deployer);
        address burner = vm.envOr("BURNER_ADDRESS", deployer);
        address reception = vm.envOr("RECEPTION_ADDRESS", deployer);

        vm.startBroadcast(deployerPk);

        // 1. Despliegue de HotelNFT (deployer temporal como admin si admin != deployer)
        HotelNFT nft = new HotelNFT(deployer, treasuryAddr);

        // 2. Despliegue de HotelMarketplace
        HotelMarketplace marketplace = new HotelMarketplace(deployer, address(nft), minListingPrice);

        // 3. Enlazar marketplace en HotelNFT
        nft.setMarketplaceContract(address(marketplace));

        // 4. Asignación de roles operativos
        if (minter != address(0)) {
            nft.grantRole(nft.MINTER_ROLE(), minter);
        }
        if (burner != address(0)) {
            nft.grantRole(nft.BURNER_ROLE(), burner);
        }
        if (reception != address(0)) {
            nft.grantRole(nft.RECEPTION_ROLE(), reception);
        }

        // 5. Transferencia de DEFAULT_ADMIN_ROLE al admin definitivo (Gnosis Safe en producción)
        if (admin != deployer) {
            nft.grantRole(nft.DEFAULT_ADMIN_ROLE(), admin);
            marketplace.grantRole(marketplace.DEFAULT_ADMIN_ROLE(), admin);

            nft.renounceRole(nft.DEFAULT_ADMIN_ROLE(), deployer);
            marketplace.renounceRole(marketplace.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();

        _writeDeployment(address(nft), address(marketplace));

        console2.log("=== DESPLIEGUE EXITOSO ===");
        console2.log("HotelNFT desplegado en:", address(nft));
        console2.log("HotelMarketplace desplegado en:", address(marketplace));
        console2.log("Admin definitivo:", admin);
        console2.log("Treasury:", treasuryAddr);
        console2.log("Min Listing Price (wei):", minListingPrice);
    }

    function _writeDeployment(address nft, address marketplace) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "hotelNFT", nft);
        vm.serializeAddress(key, "hotelMarketplace", marketplace);
        string memory json = vm.serializeUint(key, "deploymentBlock", block.number);
        vm.writeJson(json, "./deployments/latest.json");
    }
}
