// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DateLib} from "../src/libraries/DateLib.sol";

contract DateLibTest is Test {
    function test_Epoch() public pure {
        assertEq(DateLib.timestampToYYYYMMDD(0), 19_700_101);
    }

    function test_KnownDates() public pure {
        assertEq(DateLib.timestampToYYYYMMDD(1_780_272_000), 20_260_601);
        assertEq(DateLib.timestampToYYYYMMDD(1_781_913_600), 20_260_620);
        assertEq(DateLib.timestampToYYYYMMDD(1_735_689_600), 20_250_101);
        assertEq(DateLib.timestampToYYYYMMDD(1_798_675_200), 20_261_231);
    }

    function test_LeapDay() public pure {
        assertEq(DateLib.timestampToYYYYMMDD(1_709_164_800), 20_240_229);
    }

    function test_IntraDayTruncatesToDay() public pure {
        // 2026-06-01 23:59:59 sigue siendo 2026-06-01
        assertEq(DateLib.timestampToYYYYMMDD(1_780_272_000 + 86_399), 20_260_601);
    }

    function test_RangeValidation() public pure {
        assertTrue(DateLib.isInRange(20_260_615));
        assertFalse(DateLib.isInRange(20_261_301)); // mes 13
        assertFalse(DateLib.isInRange(20_260_632)); // día 32
        assertFalse(DateLib.isInRange(20_260_600)); // día 0
    }
}
