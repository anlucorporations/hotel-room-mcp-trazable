// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {HotelNightsBootstrap} from "../src/HotelNightsBootstrap.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

/**
 * @notice DoD T0.2: `hasRole` correcto para los 6 roles tras el bootstrap y EOA revocado.
 * @dev `address(this)` actúa como EOA desplegador (recibe DEFAULT_ADMIN en el constructor).
 */
contract HotelNightsRolesTest is Test {
    HotelNights internal nft;

    address internal admin = makeAddr("admin"); // simula la Safe / admin definitivo
    address internal treasury = makeAddr("treasury");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant ROYALTY_BPS = 1000;

    // Interfaces ERC para `supportsInterface`.
    bytes4 internal constant IID_ERC721 = 0x80ac58cd;
    bytes4 internal constant IID_ERC2981 = 0x2a55205a;

    function setUp() public {
        nft = new HotelNights(treasury, ROYALTY_BPS);
    }

    function test_DeployerStartsAsSoleAdmin() public view {
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(nft.owner(), address(this));
    }

    function test_BootstrapGrantsSixRolesToAdminAndRevokesDeployer() public {
        HotelNightsBootstrap.grantRolesTo(nft, admin);
        nft.renounceRole(nft.DEFAULT_ADMIN_ROLE(), address(this));

        // El admin definitivo tiene los 6 roles.
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), admin), "DEFAULT_ADMIN");
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), admin), "MINTER");
        assertTrue(nft.hasRole(nft.ROYALTY_ADMIN_ROLE(), admin), "ROYALTY_ADMIN");
        assertTrue(nft.hasRole(nft.PAUSER_ROLE(), admin), "PAUSER");
        assertTrue(nft.hasRole(nft.BURNER_ROLE(), admin), "BURNER");
        assertTrue(nft.hasRole(nft.TREASURER_ROLE(), admin), "TREASURER");

        // El EOA desplegador queda sin DEFAULT_ADMIN (bootstrap completado).
        assertFalse(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), address(this)), "EOA revocado");
    }

    function test_RoleIdsMatchKeccakOfName() public view {
        assertEq(nft.MINTER_ROLE(), keccak256("MINTER_ROLE"));
        assertEq(nft.ROYALTY_ADMIN_ROLE(), keccak256("ROYALTY_ADMIN_ROLE"));
        assertEq(nft.PAUSER_ROLE(), keccak256("PAUSER_ROLE"));
        assertEq(nft.BURNER_ROLE(), keccak256("BURNER_ROLE"));
        assertEq(nft.TREASURER_ROLE(), keccak256("TREASURER_ROLE"));
        assertEq(nft.DEFAULT_ADMIN_ROLE(), bytes32(0));
    }

    function test_NonAdminCannotGrantRoles() public {
        // Se resuelven los ids antes de armar prank/expectRevert para que la única llamada
        // observada sea `grantRole`.
        bytes32 minterRole = nft.MINTER_ROLE();
        bytes32 adminRole = nft.DEFAULT_ADMIN_ROLE();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                adminRole
            )
        );
        nft.grantRole(minterRole, stranger);
    }

    function test_TreasuryAndRoyaltyConfigured() public view {
        assertEq(nft.treasury(), treasury);
        assertEq(nft.royaltyBps(), ROYALTY_BPS);

        (address receiver, uint256 amount) = nft.royaltyInfo(1, 10_000);
        assertEq(receiver, treasury);
        assertEq(amount, 1000); // 10 % de 10_000
    }

    function test_SupportsExpectedInterfaces() public view {
        assertTrue(nft.supportsInterface(IID_ERC721), "ERC721");
        assertTrue(nft.supportsInterface(IID_ERC2981), "ERC2981");
        assertTrue(
            nft.supportsInterface(type(IAccessControl).interfaceId),
            "AccessControl"
        );
    }

    function test_ConstructorRejectsZeroTreasury() public {
        vm.expectRevert(IHotelNights.ZeroAddress.selector);
        new HotelNights(address(0), ROYALTY_BPS);
    }

    function test_ConstructorRejectsRoyaltyOutOfRange() public {
        vm.expectRevert(
            abi.encodeWithSelector(IHotelNights.RoyaltyOutOfRange.selector, uint96(2001))
        );
        new HotelNights(treasury, 2001);
    }
}
