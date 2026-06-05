// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title DateLib
 * @notice Conversión de timestamp UTC a fecha civil `AAAAMMDD` (ADR-08). Implementa el
 *         algoritmo de Howard Hinnant `civil_from_days` (válido para ts ≥ 0).
 * @dev La expiración on-chain usa un umbral UTC derivado de `block.timestamp`; el cálculo de
 *      la fecha civil en `Europe/Madrid` y la validación de calendario completa son off-chain
 *      (defensa en profundidad). El margen UTC vs Madrid está documentado en ADR-08.
 */
library DateLib {
    uint256 private constant SECONDS_PER_DAY = 86_400;

    /// @notice Devuelve la fecha civil UTC del timestamp como `AAAA*10^4 + MM*10^2 + DD`.
    function timestampToYYYYMMDD(uint256 timestamp) internal pure returns (uint256) {
        uint256 z = timestamp / SECONDS_PER_DAY + 719_468;
        uint256 era = z / 146_097;
        uint256 doe = z - era * 146_097; // [0, 146096]
        uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
        uint256 year = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
        uint256 mp = (5 * doy + 2) / 153; // [0, 11]
        uint256 day = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
        uint256 month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
        if (month <= 2) year += 1;
        return year * 10_000 + month * 100 + day;
    }

    /// @notice `AAAAMMDD` UTC de hoy.
    function todayYYYYMMDD(uint256 nowTimestamp) internal pure returns (uint256) {
        return timestampToYYYYMMDD(nowTimestamp);
    }

    /// @notice Validación de fecha civil real: AAAAMMDD de 8 dígitos, MM ∈ [1,12] y DD válido
    ///         según los días del mes (incluido el 29-feb solo en años bisiestos).
    /// @dev El tope `< 10^8` garantiza que la fecha cabe en los 8 dígitos bajos del `tokenId`
    ///      (`room*10^8 + fecha`): una fecha de ≥9 dígitos corrompería el split habitación/fecha.
    ///      Además del rango, valida el calendario real (MINOR#2): defensa en profundidad on-chain
    ///      (`baseFee=0`) que rechaza fechas inexistentes como 20260230 o 20260431. La validación
    ///      de zona horaria `Europe/Madrid` sigue siendo off-chain (ADR-08).
    function isInRange(uint256 yyyymmdd) internal pure returns (bool) {
        if (yyyymmdd >= 100_000_000) return false;
        uint256 year = yyyymmdd / 10_000;
        uint256 month = (yyyymmdd / 100) % 100;
        uint256 day = yyyymmdd % 100;
        if (month < 1 || month > 12 || day < 1) return false;
        return day <= _daysInMonth(year, month);
    }

    /// @dev Días del mes `month` (1–12) del año `year`, contemplando el bisiesto en febrero.
    function _daysInMonth(uint256 year, uint256 month) private pure returns (uint256) {
        if (month == 2) {
            return _isLeapYear(year) ? 29 : 28;
        }
        // Abril, junio, septiembre y noviembre tienen 30 días; el resto, 31.
        if (month == 4 || month == 6 || month == 9 || month == 11) {
            return 30;
        }
        return 31;
    }

    /// @dev Regla gregoriana del año bisiesto: divisible por 4, salvo los seculares no divisibles por 400.
    function _isLeapYear(uint256 year) private pure returns (bool) {
        return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    }
}
