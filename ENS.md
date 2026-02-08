# Sponsor Track: ENS (Ethereum Name Service)

Lazarus Protocol integrates ENS to provide a human-readable and secure way for users to manage their cross-chain beneficiaries. By abstracting away complex hexagonal addresses, we reduce friction and minimize the risk of devastating "fat-finger" errors during the asset evacuation setup.

## Technical Deep Dive

### 1. Dual-Chain Transports (Resolution on Mainnet, Execution on Sepolia)
A major technical challenge in decentralized naming is that ENS resolver contracts primarily reside on Ethereum Mainnet. Since Lazarus Protocol's logic is deployed on the **Sepolia Testnet**, standard resolution hooks often fail or return stale data because they attempt to resolve names on the connected testnet.

**Solution**: We implemented a "mainnet-aware" transport layer in our `wagmi` configuration. Even when the user's wallet is connected to Sepolia, our frontend is configured to reach out to Ethereum Mainnet specifically for ENS lookups.

```typescript
// packages/frontend/src/config/wagmi.ts
export const config = getDefaultConfig({
  appName: 'Lazarus Protocol',
  chains: [sepolia, mainnet], // Support both chains
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC), // dedicated transport for ENS
  },
});
```

### 2. Resolution & Validation Pipeline
The `RegistrationForm` employs a multi-stage validation pipeline:
1.  **Input Detection**: The system detects if the input is a valid 42-char hex address or a potential ENS name (containing a dot).
2.  **Normalization**: We use `viem/ens`'s `normalize` function to ensure names are correctly formatted before resolution, preventing injection or malformed query errors.
3.  **Cross-Check Resolution**: We use the `useEnsAddress` hook with the `mainnet` chain ID forced, ensuring high-fidelity resolution.
4.  **Self-Beneficiary Protection**: The system prevents a user from setting their own address (or a resolved ENS that points to them) as the beneficiary, protecting against circular evacuation logic.

```typescript
// packages/frontend/src/components/RegistrationForm.tsx
const { data: ensAddress, isLoading } = useEnsAddress({
  name: normalizedName,
  chainId: mainnet.id, // Explicitly target Mainnet
  query: { enabled: isENSAttempt && !!normalizedName },
});
```

## Benefits to the Protocol
- **Identity Assurance**: Users can verify their beneficiary's identity through their public name, which is more intuitive than an address.
- **Reliable UX**: By forcing mainnet resolution, we ensure the protocol works correctly even in testnet environments where ENS registries are often sparse or non-existent.
- **Security**: Reduces the attack surface of phishing or copy-paste errors that could lead to protocol "leaks" to the wrong beneficiary.
