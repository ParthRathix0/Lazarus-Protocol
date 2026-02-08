# Sponsor Track: LI.FI

Lazarus Protocol utilizes **LI.FI** as its core cross-chain execution and liquidity layer. Our entire evacuation mechanism relies on LI.FI's ability to orchestrate complex swaps and bridges in a single transaction.

## Integration Overview

The "Dead Man's Switch" initiates an automatic evacuation of funds when a user is inactive. Since the user can't sign this transaction themselves, the Watchtower must execute a pre-defined strategy.

### Use Case: Cross-Chain Asset Evacuation
We use LI.FI to move assets from a vulnerable or "abandoned" wallet on **Sepolia** to a secure **LazarusVault** on **Arbitrum Sepolia**.

### Technical Implementation

#### 1. Dynamic Quote Fetching
The Watchtower service (`liquidator.ts`) uses the LI.FI API to dynamically fetch the best route for converting a user's WETH or USDC on Sepolia into USDC on the destination chain.

#### 2. Calldata Delegation
The `LazarusSource` contract is designed to receive LI.FI calldata and delegate the call to the **LI.FI Diamond**. This allows the contract to perform the bridge without needing to implement complex bridge-specific logic itself.

#### 3. Destination Contract Call
We leverage LI.FI's capability to send funds to a specific address on the destination chain (the `LazarusVault`). This ensures that funds don't just land in the beneficiary's wallet but are held in a secure, claimable vault.

## Code References

### Watchtower Quote Request
In `packages/watchtower/src/lifi.ts`:
```typescript
export async function getEvacuationRoute(params: LiFiQuoteRequest) {
  const LIFI_API_URL = 'https://li.quest/v1/quote';
  // ... building query params ...
  const response = await fetch(`${LIFI_API_URL}?${queryParams}`);
  return await response.json();
}
```

### On-Chain Execution
In `LazarusSource.sol`:
```solidity
function liquidate(address _user, address _token, bytes calldata _swapData) external {
    // ... security checks ...
    (bool success, ) = lifiDiamond.call(_swapData);
    if (!success) revert BridgeCallFailed();
}
```

## Why LI.FI?
- **Abstraction**: We don't need to know which bridge is the most efficient; LI.FI handles the routing.
- **Composability**: Combining a swap (WETH -> USDC) and a bridge (Sepolia -> Arbitrum) into one call is essential for a "one-click" autonomous evacuation.
- **Security**: Allows us to pass complex instructions that land exactly where we want them on the destination chain.
