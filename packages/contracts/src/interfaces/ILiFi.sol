// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ILiFi Interface
/// @notice Interface for LI.FI Diamond contract swap/bridge operations
interface ILiFi {
    /// @notice Struct for bridge data sent to LI.FI
    struct BridgeData {
        bytes32 transactionId;
        string bridge;
        string integrator;
        address referrer;
        address sendingAssetId;
        address receiver;
        uint256 minAmount;
        uint256 destinationChainId;
        bool hasSourceSwaps;
        bool hasDestinationCall;
    }

    /// @notice Generic swap data for DEX operations
    struct SwapData {
        address callTo;
        address approveTo;
        address sendingAssetId;
        address receivingAssetId;
        uint256 fromAmount;
        uint256 toAmount;
        bytes callData;
        bool requiresDeposit;
    }

    /// @notice Execute a swap and bridge operation
    /// @param _bridgeData Bridge configuration data
    /// @param _swapData Array of swap operations to execute
    function swapAndStartBridgeTokensViaBridge(
        BridgeData calldata _bridgeData,
        SwapData[] calldata _swapData
    ) external payable;
}
