// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title RoomMaster
 * @notice Maestro de habitaciones on-chain (RF-18a, DISEÑO §5). Fuente única on-chain del
 *         mismo criterio que el paquete shared (room-master.ts): planta baja 101-130,
 *         primera 201-220 (50 habitaciones); tipo por rango.
 */
library RoomMaster {
    /// @notice ¿La habitación pertenece al inventario del hotel?
    function isInMaster(uint256 room) internal pure returns (bool) {
        return (room >= 101 && room <= 130) || (room >= 201 && room <= 220);
    }

    /// @notice Tipo de la habitación como string (para el evento `Mint`). Revierte fuera del maestro.
    function roomType(uint256 room) internal pure returns (string memory) {
        if (room >= 101 && room <= 115) return "simple";
        if (room >= 116 && room <= 130) return "doble";
        if (room >= 201 && room <= 220) return "suite";
        revert("RoomMaster: fuera del maestro");
    }
}
