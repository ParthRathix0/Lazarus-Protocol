# Sponsor Track: ENS (Ethereum Name Service)

Lazarus Protocol integrates ENS to provide a human-readable and secure way for users to manage their cross-chain beneficiaries.

## Integration Overview

Instead of requiring users to copy-paste error-prone `0x` addresses, our dashboard allows them to enter human-readable names like `pete.eth`.

### Key Technical Achievements

#### 1. Cross-Network ENS Resolution
ENS resolution typically defaults to the network the user is currently connected to. Since Lazarus Protocol operates on the **Sepolia Testnet**, standard resolution often fails or returns no data. 
- **Solution**: We implemented a custom `wagmi` transport configuration that forces the ENS hooks to query **Ethereum Mainnet** even when the primary application state is on Sepolia. This ensures that a user's real ENS identity is always resolvable.

#### 2. Robust Address Validation
We combined ENS resolution with strict address validation. The application distinguishes between:
- **ENS Names**: Triggers an asynchronous lookup using the `useEnsAddress` hook.
- **Direct Addresses**: Validates the 42-character hex format immediately.
- **Combined States**: Ensures the "Register" button only enables when a valid resolution OR a valid direct address is provided.

## Code References

### Multi-Chain Wagmi Configuration
In `packages/frontend/src/config/wagmi.ts`, we define separate transports for Sepolia and Mainnet:
```typescript
export const config = getDefaultConfig({
  appName: 'Lazarus Protocol',
  chains: [sepolia, mainnet],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC),
  },
});
```

### Resolution Logic
In `RegistrationForm.tsx`, we use the hook with the mainnet chain ID explicitly:
```typescript
const { data: resolvedAddress, isError, isLoading } = useEnsAddress({
  name: debouncedValue.includes('.') ? debouncedValue : undefined,
  chainId: 1, // Force Mainnet for resolution
});
```

## Benefits
- **UX**: Significant reduction in "fat-finger" errors during registration.
- **Security**: Verification that the beneficiary address matches a known on-chain identity.
- **Standardization**: Leverages the industry standard for decentralized naming.
