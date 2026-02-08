# Sponsor Track: LI.FI

Lazarus Protocol utilizes **LI.FI** as its core cross-chain execution and liquidity layer. Our entire evacuation mechanism relies on LI.FI's ability to orchestrate complex swaps and bridges in a single transaction, enabling truly autonomous asset recovery.

## Technical Implementation

### 1. Orchestration vs. Execution
The protocol distinguishes between the recruitment of a route (Watchtower) and the commitment of that route (Smart Contract).
- **Watchtower (The Strategist)**: When a user is declared inactive, the Watchtower queries the LI.FI `v1/quote` endpoint. It requests a route from **Sepolia (Source)** to **Arbitrum Sepolia (Destination)**, optimizing for the lowest fees and highest output of the target token (e.g., USDC).
- **LazarusSource (The Executor)**: The Watchtower sends the retrieved `transactionRequest` (calldata) to the `liquidate` function on-chain.

### 2. Diamond Call Delegation
To keep the `LazarusSource` contract lightweight and upgrade-agnostic, we use a delegation pattern to interact with LI.FI. Instead of hardcoding bridge-specific interfaces, we interact with the **LI.FI Diamond Contract**. The `liquidate` function performs security checks on the user's status and then executes the swap data via the Diamond.

```solidity
// packages/contracts/src/LazarusSource.sol
function liquidate(address _user, address _token, bytes calldata _swapData) external {
    if (!canUserBeLiquidated(_user)) revert UserNotDead();
    
    // Transfer user assets to this contract first (if approved)
    IERC20(_token).transferFrom(_user, address(this), amount);
    IERC20(_token).approve(address(lifiDiamond), amount);

    // Delegate the complex swap+bridge logic to LI.FI
    (bool success, ) = lifiDiamond.call(_swapData);
    if (!success) revert BridgeCallFailed();
}
```

### 3. Cross-Chain Hooking
Lazarus Protocol leverages LI.FI's ability to specify a destination receiver. We don't just bridge to the beneficiary's wallet; we bridge to the `LazarusVault` on the destination chain. This allows the funds to be held in a secure, claimable escrow rather than being deposited into a potentially compromised or untracked wallet.

## Route Optimization Logic
The Watchtower uses the following parameters for LI.FI quotes:
- **fromChain**: 11155111 (Sepolia)
- **toChain**: 421614 (Arbitrum Sepolia)
- **fromToken**: WETH/USDC
- **toToken**: USDC (Standardized for the Vault)
- **Slippage**: Configured at 0.5% to ensure high success rates for automated liquidations.

## Why LI.FI is Critical
- **Atomic Operations**: Combining the swap and bridge into a single transaction minimizes the "time-at-risk" during asset evacuation.
- **Liquidity Aggregation**: Ensures that even large asset piles can be liquidated with minimal price impact by tapping into multiple DEXs and Bridges via LI.FI's aggregator.
- **Future Proofing**: As new bridges and L2s emerge, the protocol remains compatible without requiring contract redeployments, thanks to the LI.FI abstraction layer.
