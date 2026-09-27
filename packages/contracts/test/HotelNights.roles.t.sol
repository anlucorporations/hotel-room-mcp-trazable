// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {HotelNights} from "../src/HotelNights.sol";
import {HotelNightsBootstrap} from "../src/HotelNightsBootstrap.sol";
import {IHotelNights} from "../src/IHotelNights.sol";

import {RoomRegistrySeed} from "./RoomRegistrySeed.sol";

/**
 * @notice DoD T0.2: `hasRole` correcto para los 6 roles tras el bootstrap y EOA revocado.
 * @dev `address(this)` actúa como EOA desplegador (recibe DEFAULT_ADMIN en el constructor).
 */
contract HotelNightsRolesTest is Test {
    HotelNights internal nft;

    address internal admin = makeAddr("admin"); // simula la Safe / admin definitivo
    address internal treasury = makeAddr("treasury");
    address internal stranger = makeAddr("stranger");

    // Interfaces ERC para `supportsInterface`.
    bytes4 internal constant IID_ERC721 = 0x80ac58cd;
    bytes4 internal constant IID_ERC2981 = 0x2a55205a;

    function setUp() public {
        nft = new HotelNights(treasury);
        RoomRegistrySeed.seed(nft);
    }

    function test_DeployerStartsAsSoleAdmin() public view {
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(nft.owner(), address(this));
    }

    /// @notice DoD T0.2: el bootstrap concede los 6 roles vigentes (D-05 añade RECEPTION y
    ///         D-06 retira ROYALTY_ADMIN) y el EOA desplegador queda revocado.
    function test_BootstrapGrantsSixRolesToAdminAndRevokesDeployer() public {
        HotelNightsBootstrap.grantRolesTo(nft, admin);
        nft.renounceRole(nft.DEFAULT_ADMIN_ROLE(), address(this));

        // El admin definitivo tiene los 6 roles.
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), admin), "DEFAULT_ADMIN");
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), admin), "MINTER");
        assertTrue(nft.hasRole(nft.RECEPTION_ROLE(), admin), "RECEPTION");
        assertTrue(nft.hasRole(nft.PAUSER_ROLE(), admin), "PAUSER");
        assertTrue(nft.hasRole(nft.BURNER_ROLE(), admin), "BURNER");
        assertTrue(nft.hasRole(nft.TREASURER_ROLE(), admin), "TREASURER");

        // El EOA desplegador queda sin DEFAULT_ADMIN (bootstrap completado).
        assertFalse(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), address(this)), "EOA revocado");
    }

    function test_RoleIdsMatchKeccakOfName() public view {
        assertEq(nft.MINTER_ROLE(), keccak256("MINTER_ROLE"));
        assertEq(nft.RECEPTION_ROLE(), keccak256("RECEPTION_ROLE"));
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
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole
            )
        );
        nft.grantRole(minterRole, stranger);
    }

    function test_TreasuryAndRoyaltyConfigured() public view {
        assertEq(nft.treasury(), treasury);

        // D-06: el royalty se deriva del tipo de la habitación del tokenId (sin configuración).
        (address receiver, uint256 amount) = nft.royaltyInfo(101 * 1e8 + 20_260_615, 10_000);
        assertEq(receiver, treasury);
        assertEq(amount, 500); // 5 % simple
    }

    function test_SupportsExpectedInterfaces() public view {
        assertTrue(nft.supportsInterface(IID_ERC721), "ERC721");
        assertTrue(nft.supportsInterface(IID_ERC2981), "ERC2981");
        assertTrue(nft.supportsInterface(type(IAccessControl).interfaceId), "AccessControl");
    }

    function test_ConstructorRejectsZeroTreasury() public {
        vm.expectRevert(IHotelNights.ZeroAddress.selector);
        new HotelNights(address(0));
    }

    /// @notice D-06: el royalty no es gobernable; lo fija el tipo de habitación en el alta.
    ///         El constructor ya solo recibe la tesorería (el compilador garantiza la aridad).
    function test_RoyaltyIsNotGovernable() public view {
        (, uint256 simpleAmount) = nft.royaltyInfo(101 * 1e8 + 20_260_615, 10_000);
        (, uint256 suiteAmount) = nft.royaltyInfo(201 * 1e8 + 20_260_615, 10_000);

        assertEq(simpleAmount, 500, "5 % simple");
        assertEq(suiteAmount, 1000, "10 % suite");
    }
}
