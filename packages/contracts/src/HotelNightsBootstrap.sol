// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {HotelNights} from "./HotelNights.sol";

/**
 * @title HotelNightsBootstrap
 * @notice Asignación de roles del bootstrap (ADR-06), factorizada para ser reutilizada por
 *         el script de despliegue y por los tests (DRY/SRP).
 * @dev El llamante (`msg.sender`) debe poseer `DEFAULT_ADMIN_ROLE` en el contrato.
 */
library HotelNightsBootstrap {
    /// @notice Concede los 6 roles del contrato a `account`.
    function grantRolesTo(HotelNights nft, address account) internal {
        nft.grantRole(nft.DEFAULT_ADMIN_ROLE(), account);
        nft.grantRole(nft.MINTER_ROLE(), account);
        nft.grantRole(nft.RECEPTION_ROLE(), account);
        nft.grantRole(nft.PAUSER_ROLE(), account);
        nft.grantRole(nft.BURNER_ROLE(), account);
        nft.grantRole(nft.TREASURER_ROLE(), account);
    }
}
