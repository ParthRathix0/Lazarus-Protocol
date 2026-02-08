# Sponsor Track: Yellow Network (Nitrolite)

Lazarus Protocol implements a "Gas-Free Heartbeat" system inspired by the session-based, off-chain logic of the **Yellow Network** and **Nitrolite** protocol.

## Integration Overview

A traditional "Dead Man's Switch" requires users to pay gas for ogni heartbeat (ping). This is a poor user experience and often leads to users forgetting to ping because of the friction. 

Lazarus Protocol solves this by using **off-chain session proofs** that are later "settled" on-chain only when necessary.

### Technical Implementation

#### 1. EIP-712 Signing (Off-Chain Actions)
Instead of an on-chain transaction, users sign a "Heartbeat" message using their wallet. This message is compliant with **EIP-712**, providing a human-readable confirmation of the user's liveness.

#### 2. Watchtower Verification (Session-Based Logic)
These signed heartbeats are sent to the **Watchtower**. The Watchtower acts as the "Nitrolite-inspired" session handler. It:
- Verifies the signature off-chain using `viem`'s `verifyTypedData`.
- Stores the latest valid "Last Seen" timestamp in a local SQLite database.
- Prevents replay attacks using a unique nonce for every session heartbeat.

#### 3. On-Chain Settlement (Nitrolite-style Finalization)
The Watchtower only interacts with the smart contract when the "session" (the user's life) is deemed to have ended (no heartbeats for 7 days). This mimics the Nitrolite model where off-chain actions are rapid and gas-free, and the on-chain settlement occurs only at the end of the session.

## Code References

### Off-Chain Signature Verification
Defined in `packages/watchtower/src/yellowSignature.ts`:
```typescript
export const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

export async function verifyYellowSignature(message, signature, expectedSigner) {
  return await verifyTypedData({
    domain: HEARTBEAT_DOMAIN,
    types: HEARTBEAT_TYPES,
    // ...
    signature,
  });
}
```

## Benefits
- **Zero Gas**: Users can "ping" every hour without spending a cent on gas.
- **Web2 Speed**: Heartbeats are instant and don't wait for block confirmations.
- **Efficiency**: Reduces on-chain congestion by only settling "Dead" states when they actually occur.
