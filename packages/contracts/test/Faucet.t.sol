// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Faucet} from "../src/Faucet.sol";

/// @notice Solicitante hostil: pide al faucet pero rechaza ETH en `receive` (MINOR#9).
contract RejectingDispenseTarget {
    Faucet private immutable FAUCET;

    constructor(Faucet faucet_) {
        FAUCET = faucet_;
    }

    function request() external {
        FAUCET.dispense();
    }

    receive() external payable {
        revert("rechazo dispense");
    }
}

/// @notice CU-PR-01 (docs/SRS.md §9) — Faucet de pruebas (dispensación + cooldown + saldo bajo).
contract FaucetTest is Test {
    Faucet internal faucet;

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant COOLDOWN = 86_400; // 24 h
    uint256 internal constant LOW_THRESHOLD = 5 ether;

    address internal user = makeAddr("user");

    function setUp() public {
        faucet = new Faucet(AMOUNT, COOLDOWN, LOW_THRESHOLD);
        vm.deal(address(faucet), 10 ether);
        vm.warp(1_780_272_000);
    }

    function test_DispenseIncreasesBalanceByExactAmount() public {
        uint256 before = user.balance;

        vm.expectEmit(true, false, false, true, address(faucet));
        emit Faucet.FaucetDispensed(user, AMOUNT);

        vm.prank(user);
        faucet.dispense();

        assertEq(user.balance, before + AMOUNT);
    }

    function test_CooldownBlocksWithinWindowAndAllowsAfter() public {
        vm.prank(user);
        faucet.dispense();

        // 23 h 59 m → bloqueado
        vm.warp(block.timestamp + COOLDOWN - 60);
        uint256 avail = faucet.availableAt(user);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Faucet.FaucetCooldownActive.selector, user, avail));
        faucet.dispense();

        // exactamente 24 h desde la 1.ª → permitido
        vm.warp(faucet.availableAt(user));
        vm.prank(user);
        faucet.dispense();
        assertEq(user.balance, AMOUNT * 2);
    }

    function test_InsufficientBalanceReverts() public {
        Faucet empty = new Faucet(AMOUNT, COOLDOWN, LOW_THRESHOLD);
        vm.prank(user);
        vm.expectRevert(Faucet.FaucetInsufficientBalance.selector);
        empty.dispense();
    }

    function test_LowBalanceFlag() public {
        assertFalse(faucet.lowBalance()); // 10 ETH ≥ 5 ETH
        vm.prank(faucet.owner());
        faucet.drain(payable(address(0xBEEF)));
        assertTrue(faucet.lowBalance()); // 0 < 5 ETH
    }

    function test_ConstructorRejectsZeroAmount() public {
        vm.expectRevert(Faucet.InvalidConfig.selector);
        new Faucet(0, COOLDOWN, LOW_THRESHOLD);
    }

    // ── MINOR#9: financiación, dispense hostil y validación de destino en drain ──
    function test_FundEmitsFaucetFunded() public {
        address funder = makeAddr("funder");
        vm.deal(funder, 3 ether);

        vm.expectEmit(true, false, false, true, address(faucet));
        emit Faucet.FaucetFunded(funder, 3 ether);
        vm.prank(funder);
        faucet.fund{value: 3 ether}();

        assertEq(address(faucet).balance, 13 ether);
    }

    function test_ReceiveEmitsFaucetFunded() public {
        address funder = makeAddr("funder2");
        vm.deal(funder, 1 ether);

        vm.expectEmit(true, false, false, true, address(faucet));
        emit Faucet.FaucetFunded(funder, 1 ether);
        vm.prank(funder);
        (bool ok,) = address(faucet).call{value: 1 ether}("");
        assertTrue(ok);
    }

    function test_DispenseToRevertingReceiverReverts() public {
        RejectingDispenseTarget target = new RejectingDispenseTarget(faucet);
        vm.expectRevert(Faucet.EthTransferFailed.selector);
        target.request();
        // No se marcó el cooldown (CEI revertido): puede reintentar tras arreglar el receptor.
        assertEq(faucet.lastDispensedAt(address(target)), 0);
    }

    function test_DrainRejectsZeroAddress() public {
        vm.prank(faucet.owner());
        vm.expectRevert(Faucet.ZeroAddress.selector);
        faucet.drain(payable(address(0)));
    }
}
