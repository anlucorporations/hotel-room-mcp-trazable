// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/// @notice CU-13 — Caducidad lógica + burn en lote de noches no vendidas del hotel.
contract HotelNightsBurnTest is Test {
    HotelNights internal nft;

    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal burner = makeAddr("burner");
    address internal client = makeAddr("client");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant DATE = 20_260_615;
    uint256 internal constant PRICE = 0.5 ether;
    uint256 internal constant TOKEN_ID = 10_220_260_615;
    uint256 internal constant BASE_TS = 1_780_272_000; // 2026-06-01
    uint256 internal constant AFTER_TS = 1_781_913_600; // 2026-06-20

    function setUp() public {
        vm.warp(BASE_TS);
        nft = new HotelNights(treasury, 1000);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        nft.grantRole(nft.BURNER_ROLE(), burner);
        vm.prank(minter);
        nft.mint(102, DATE, PRICE, "ipfs://x");
    }

    function test_BurnExpiredUnsold() public {
        vm.warp(AFTER_TS); // la noche (2026-06-15) ya expiró y sigue sin vender
        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;

        vm.expectEmit(true, false, false, false, address(nft));
        emit IHotelNights.Burn(TOKEN_ID);
        vm.prank(burner);
        nft.burnExpired(ids);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, TOKEN_ID));
        nft.ownerOf(TOKEN_ID);
    }

    function test_BurnNotExpiredReverts() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;
        vm.prank(burner);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.NotExpired.selector, TOKEN_ID));
        nft.burnExpired(ids);
    }

    function test_BurnAlreadySoldReverts() public {
        vm.deal(client, PRICE);
        vm.prank(client);
        nft.buy{value: PRICE}(TOKEN_ID); // ahora es de un cliente
        vm.warp(AFTER_TS);

        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;
        vm.prank(burner);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.AlreadySold.selector, TOKEN_ID));
        nft.burnExpired(ids);
    }

    function test_BurnBatchTooLargeReverts() public {
        uint256[] memory ids = new uint256[](51); // > BURN_BATCH_MAX (50)
        vm.prank(burner);
        vm.expectRevert(abi.encodeWithSelector(IHotelNights.BatchTooLarge.selector, uint256(51), uint256(50)));
        nft.burnExpired(ids);
    }

    function test_BurnRequiresBurnerRole() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;
        bytes32 burnerRole = nft.BURNER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, burnerRole
            )
        );
        nft.burnExpired(ids);
    }

    function test_BurnBlockedWhenPaused() public {
        nft.grantRole(nft.PAUSER_ROLE(), address(this));
        nft.pause();
        vm.warp(AFTER_TS);

        uint256[] memory ids = new uint256[](1);
        ids[0] = TOKEN_ID;
        vm.prank(burner);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        nft.burnExpired(ids);
    }
}
