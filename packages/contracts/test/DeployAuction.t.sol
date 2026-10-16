// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployAuction} from "../script/DeployAuction.s.sol";
import {HotelNights} from "../src/HotelNights.sol";
import {NightAuction} from "../src/NightAuction.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @title DeployAuctionTest
 * @notice Verifica el despliegue de `NightAuction` (C2 · RF-13): roles del admin de la subasta,
 *         concesión de `AUCTION_ROLE` **al contrato** en `HotelNights`, handover de gobernanza y el
 *         registro crudo que consume `sync-deployment.ts`.
 *
 * @dev Se llama a `deployWithConfig()` con una configuración explícita (no `run()` con `vm.setEnv`,
 *      que no se restaura entre pruebas). Cada prueba usa su propio directorio de salida.
 */
contract DeployAuctionTest is Test {
    uint256 internal constant DEPLOYER_PK =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ADMIN = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    DeployAuction internal script;
    address internal deployer;
    HotelNights internal nft;

    function setUp() public {
        script = new DeployAuction();
        deployer = vm.addr(DEPLOYER_PK);
        vm.deal(deployer, 1_000 ether);
        vm.createDir("./deployments/test", true);

        // Contrato de noches desplegado por el mismo desplegador (tiene DEFAULT_ADMIN_ROLE).
        vm.startPrank(deployer);
        nft = new HotelNights(makeAddr("treasury"));
        RoomRegistrySeed.seed(nft);
        vm.stopPrank();
    }

    function _outputDir(string memory name) internal returns (string memory) {
        string memory dir = string.concat("./deployments/test/", name);
        vm.createDir(dir, true);
        return dir;
    }

    function _config(address admin, string memory outputDir)
        internal
        view
        returns (DeployAuction.Config memory cfg)
    {
        cfg.hotel = address(nft);
        cfg.admin = admin;
        cfg.outputDir = outputDir;
    }

    function test_DeployGrantsAuctionRoleToTheContract() public {
        // El admin definitivo es otra wallet: el desplegador hace el handover y renuncia.
        DeployAuction.Deployment memory d =
            script.deployWithConfig(_config(ADMIN, _outputDir("auction")), DEPLOYER_PK);

        NightAuction auction = NightAuction(d.nightAuction);
        assertEq(address(auction.hotel()), address(nft), "la subasta apunta al contrato de noches");
        assertTrue(
            nft.hasRole(nft.AUCTION_ROLE(), address(auction)),
            "el contrato de subastas recibe AUCTION_ROLE"
        );
        assertFalse(
            nft.hasRole(nft.AUCTION_ROLE(), deployer),
            "AUCTION_ROLE nunca se concede a la wallet del desplegador"
        );
    }

    function test_DeployHandsGovernanceToTheAdmin() public {
        DeployAuction.Deployment memory d =
            script.deployWithConfig(_config(ADMIN, _outputDir("auction-handover")), DEPLOYER_PK);
        NightAuction auction = NightAuction(d.nightAuction);

        assertTrue(auction.hasRole(auction.DEFAULT_ADMIN_ROLE(), ADMIN));
        assertTrue(auction.hasRole(auction.AUCTION_ADMIN_ROLE(), ADMIN));
        assertTrue(auction.hasRole(auction.PAUSER_ROLE(), ADMIN));

        assertFalse(
            auction.hasRole(auction.DEFAULT_ADMIN_ROLE(), deployer),
            "el desplegador renuncia a la gobernanza"
        );
        assertFalse(auction.hasRole(auction.AUCTION_ADMIN_ROLE(), deployer));
    }

    function test_DeployKeepsDeployerWhenItIsTheAdmin() public {
        DeployAuction.Deployment memory d =
            script.deployWithConfig(_config(deployer, _outputDir("auction-self")), DEPLOYER_PK);
        NightAuction auction = NightAuction(d.nightAuction);

        assertTrue(auction.hasRole(auction.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(auction.hasRole(auction.AUCTION_ADMIN_ROLE(), deployer));
    }

    function test_DeployWritesRawRegistry() public {
        string memory dir = _outputDir("auction-registry");
        script.deployWithConfig(_config(ADMIN, dir), DEPLOYER_PK);

        string memory raw =
            vm.readFile(string.concat(dir, "/", vm.toString(block.chainid), "-auction.json"));
        assertTrue(bytes(raw).length > 0, "el registro crudo debe existir");
    }

    /// @dev La subasta desplegada puede usarse de punta a punta contra el contrato real.
    function test_DeployedAuctionWorksEndToEnd() public {
        DeployAuction.Deployment memory d =
            script.deployWithConfig(_config(ADMIN, _outputDir("auction-e2e")), DEPLOYER_PK);
        NightAuction auction = NightAuction(d.nightAuction);

        // OJO: `nft.MINTER_ROLE()` es una llamada externa; si se evalúa dentro del `prank`, se lo
        // consume. Se resuelve antes y se prankea la concesión.
        bytes32 minterRole = nft.MINTER_ROLE();
        vm.startPrank(deployer);
        nft.grantRole(minterRole, deployer);
        nft.mint(201, 20_260_701, 0.2 ether, "ipfs://suite");
        vm.stopPrank();

        uint256 tokenId = 201 * 1e8 + 20_260_701;
        uint64 end = uint64(block.timestamp) + 2 hours;
        vm.prank(ADMIN);
        auction.createAuction(tokenId, 0.1 ether, uint64(block.timestamp), end);

        address bidder = makeAddr("bidder");
        vm.deal(bidder, 1 ether);
        vm.prank(bidder);
        auction.bid{value: 0.3 ether}(tokenId);

        vm.warp(end + 1);
        auction.settle(tokenId);

        assertEq(nft.ownerOf(tokenId), bidder);
        assertTrue(nft.soldOnce(tokenId));
        assertEq(
            auction.pendingWithdrawals(nft.treasury()),
            0.3 ether,
            "el importe espera al hotel por pull payment"
        );
    }
}
