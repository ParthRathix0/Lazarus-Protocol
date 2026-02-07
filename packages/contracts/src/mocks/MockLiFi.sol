// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockLiFi
/// @notice Mock contract for testing LI.FI bridge operations
/// @dev Simulates bridge by burning tokens and emitting events
contract MockLiFi {
    /// @notice Emitted when tokens are "bridged" to Arc Network
    event BridgedToArc(
        address indexed token,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        uint256 destinationChainId
    );

    /// @notice Emitted when the bridge operation is executed
    event BridgeExecuted(bytes32 transactionId, uint256 amount);

    /// @notice Simulates a swap and bridge operation
    /// @dev Burns the incoming tokens and emits BridgedToArc event
    /// @param _token The token to bridge
    /// @param _amount The amount to bridge
    /// @param _receiver The receiver address on destination chain
    /// @param _destinationChainId The destination chain ID
    function mockBridge(
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _destinationChainId
    ) external {
        // Pull tokens from sender
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        
        // In a real scenario, tokens would be locked/burned
        // For testing, we just hold them here
        
        emit BridgedToArc(_token, msg.sender, _receiver, _amount, _destinationChainId);
    }

    /// @notice Generic fallback to accept arbitrary calldata (simulates LI.FI Diamond)
    /// @dev Allows LazarusSource to call with arbitrary swap/bridge data
    fallback() external payable {
        // Extract token and amount from calldata for event emission
        // In production, LI.FI Diamond handles complex routing
        emit BridgeExecuted(bytes32(0), msg.value);
    }

    receive() external payable {}

    /// @notice Helper to get contract token balance
    function getBalance(address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }
}
