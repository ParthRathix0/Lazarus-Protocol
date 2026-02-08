# Sponsor Track: Yellow Network (Nitrolite)

Lazarus Protocol implements a "Gas-Free Heartbeat" system inspired by the session-based, off-chain logic of the **Yellow Network** and its **Nitrolite** protocol. By decoupling "Liveness Proofs" from "On-Chain Settlements," we provide a seamless user experience that mimics the high-performance throughput of the Yellow Network.

## Technical Implementation

### 1. Off-Chain Sessionhandshake
Instead of frequent on-chain transactions, Lazarus Protocol utilizes EIP-712 signed messages as a "Session Handshake." 
- **The Proof**: A signature that encodes a timestamp, a message ("I am alive"), and a unique nonce.
- **The Frictionless UX**: This allows users to "ping" as often as every minute—or even every 30 seconds for specific high-security setups—without ever touching the blockchain or spending a cent on gas.

### 2. Watchtower as the Session Handler (Nitrolite Role)
In the Yellow Network architecture, off-chain states are managed with high efficiency and settled later. Our **Watchtower** performs the same role for liveness:
- **Verification**: The Watchtower verifies every heartbeat signature using `viem`'s `verifyTypedData` on the backend. This ensures the proof came from the registered vault owner.
- **State Tracking**: Valid heartbeats update a local SQLite state. This state represents the "off-chain truth" of the user's liveness.
- **Handshake Pattern**:
    1.  User signs `Heartbeat` packet.
    2.  User `POST`s packet to Watchtower `/heartbeat`.
    3.  Watchtower validates against `LazarusSource` on-chain registration state.
    4.  Watchtower responds with `200 OK` and persists the state.

### 3. Settlement (Session Finalization)
The protocol only initiates an on-chain transaction—the "Settlement"—when the session is deemed to have expired. This occurs when the gap between the `lastSeen` off-chain state and the current clock exceeds the user's pre-configured `inactivityPeriod`. 

This mimics Nitrolite's efficiency: **High-volume off-chain interactions finalized by a single, critical on-chain event.**

## Code References

### Session Proof Definition
```typescript
// packages/watchtower/src/yellowSignature.ts
export const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};
```

### Signature Verification Workflow
```typescript
// packages/watchtower/src/server.ts
const verificationResult = await verifyYellowSignature(address, message, signature);
if (verificationResult.success) {
    // Session state updated off-chain
    store.recordHeartbeat(address, signature, inactivityPeriod);
}
```

## Benefits
- **Zero Friction**: No wallet confirmations or gas costs for keeping the switch active.
- **Scalability**: The protocol can handle millions of safe-state heartbeats without placing any load on the Ethereum network.
- **Delayed Finality**: On-chain state is only burdened during the rare event of a liquidation, optimizing for "Happy Path" efficiency.
