// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Faucet — utilidad de ETH para entornos de pruebas (ADR-13, CU-PR-01, docs/SRS.md §9)
 * @notice **NO se despliega en producción.** Dispensa `amount` por wallet con una ventana
 *         mínima `cooldown`. Expone `lowBalance()` para la alerta de saldo bajo (RNF-17).
 * @dev CEI + `nonReentrant` en la dispensación. El operador financia con `fund()`/`receive`.
 */
contract Faucet is Ownable, ReentrancyGuard {
    uint256 public immutable amount;
    uint256 public immutable cooldown;
    uint256 public immutable lowThreshold;

    mapping(address account => uint256 timestamp) public lastDispensedAt;

    event FaucetDispensed(address indexed to, uint256 amount);
    event FaucetFunded(address indexed from, uint256 amount);

    error FaucetCooldownActive(address account, uint256 availableAt);
    error FaucetInsufficientBalance();
    error InvalidConfig();
    error EthTransferFailed();
    error ZeroAddress();

    constructor(uint256 amount_, uint256 cooldown_, uint256 lowThreshold_) Ownable(msg.sender) {
        if (amount_ == 0) revert InvalidConfig();
        amount = amount_;
        cooldown = cooldown_;
        lowThreshold = lowThreshold_;
    }

    receive() external payable {
        emit FaucetFunded(msg.sender, msg.value);
    }

    function fund() external payable {
        emit FaucetFunded(msg.sender, msg.value);
    }

    /// @notice Dispensa `amount` a quien llama, respetando el cooldown por wallet.
    function dispense() external nonReentrant {
        address to = msg.sender;

        uint256 last = lastDispensedAt[to];
        if (last != 0 && block.timestamp < last + cooldown) {
            revert FaucetCooldownActive(to, last + cooldown);
        }
        if (address(this).balance < amount) revert FaucetInsufficientBalance();

        lastDispensedAt[to] = block.timestamp; // effects (CEI)
        emit FaucetDispensed(to, amount);

        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    /// @notice Momento (timestamp) a partir del cual `account` puede volver a dispensar.
    function availableAt(address account) external view returns (uint256) {
        uint256 last = lastDispensedAt[account];
        return last == 0 ? 0 : last + cooldown;
    }

    /// @notice ¿El saldo está por debajo del umbral de alerta? (RNF-17).
    function lowBalance() external view returns (bool) {
        return address(this).balance < lowThreshold;
    }

    /// @notice Retira el saldo sobrante (solo operador, dev/test).
    function drain(address payable to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress(); // MINOR#9: no quemar fondos a la dirección cero
        (bool ok,) = to.call{value: address(this).balance}("");
        if (!ok) revert EthTransferFailed();
    }
}
