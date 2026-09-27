// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {HotelNights} from "../src/HotelNights.sol";
import {RoomMaster} from "../src/libraries/RoomMaster.sol";

/**
 * @title RoomRegistrySeed
 * @notice Siembra el **registro dinámico** del contrato con las 50 habitaciones históricas
 *         (D-14: `RoomMaster` como semilla de carga y referencia histórica).
 *
 * @dev El registro arranca **vacío** (D-13) y su autoridad es la base de datos (D-3): en producción
 *      se alimenta desde la API/UI, no desde este helper. Aquí se usa solo para que las pruebas que
 *      dependen del inventario histórico no tengan que registrar 50 habitaciones a mano.
 */
library RoomRegistrySeed {
    function seed(HotelNights nft) internal {
        for (uint256 room = 101; room <= 130; room++) {
            nft.registerRoom(room, RoomMaster.roomType(room));
        }
        for (uint256 room = 201; room <= 220; room++) {
            nft.registerRoom(room, RoomMaster.roomType(room));
        }
    }
}
