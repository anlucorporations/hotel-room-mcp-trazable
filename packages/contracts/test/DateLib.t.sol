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
        assertFalse(DateLib.isInRange(100_000_101)); // ≥9 dígitos: no cabe en el tokenId
        assertFalse(DateLib.isInRange(999_991_231));
    }

    // ── MINOR#2: validación de calendario real (días por mes + bisiesto) ──────────
    function test_CalendarRejectsImpossibleDays() public pure {
        assertFalse(DateLib.isInRange(20_260_230)); // 30-feb no existe
        assertFalse(DateLib.isInRange(20_260_431)); // 31-abr no existe
        assertFalse(DateLib.isInRange(20_260_631)); // 31-jun no existe
        assertFalse(DateLib.isInRange(20_260_931)); // 31-sep no existe
        assertFalse(DateLib.isInRange(20_261_131)); // 31-nov no existe
    }

    function test_CalendarLeapDayLogic() public pure {
        // 2026 no es bisiesto → 29-feb inválido; 28-feb válido.
        assertFalse(DateLib.isInRange(20_260_229));
        assertTrue(DateLib.isInRange(20_260_228));
        // 2024 sí es bisiesto → 29-feb válido.
        assertTrue(DateLib.isInRange(20_240_229));
        // 1900 secular no divisible por 400 → NO bisiesto.
        assertFalse(DateLib.isInRange(19_000_229));
        // 2000 secular divisible por 400 → SÍ bisiesto.
        assertTrue(DateLib.isInRange(20_000_229));
    }

    function test_CalendarAcceptsMonthMaxDays() public pure {
        assertTrue(DateLib.isInRange(20_260_131)); // 31-ene
        assertTrue(DateLib.isInRange(20_260_430)); // 30-abr
        assertTrue(DateLib.isInRange(20_261_231)); // 31-dic
    }
}
