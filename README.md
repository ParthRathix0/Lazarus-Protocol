# Lazarus Protocol

**A cross-chain dead man's switch for secure asset evacuation.**

## The Problem
In the event of user inactivity, catastrophic events, or loss of access, digital assets often remain stranded in "dead" wallets. Manual transfers are impossible, and current custodial solutions require trusting a third party with full control. Existing on-chain switches are often limited to a single network, leaving assets vulnerable if the source chain becomes congested or inaccessible.

## The Solution: Lazarus Protocol
Lazarus Protocol provides a decentralized, cross-chain insurance policy for your digital assets. It monitors user liveness on an active "Source" chain and, upon detecting prolonged inactivity, automatically evacuates funds to a secure "Vault" on a different "Destination" chain.

### How it Works
1.  **Monitor & Heartbeat**: Users register on the `LazarusSource` contract (Sepolia) and define a beneficiary. Every deposit, withdrawal, or manual "ping" resets a 7-day heartbeat timer.
2.  **Autonomous Detection**: An off-chain **Watchtower** monitors the source contract events. If a user fails to ping for 7 days, they are marked as potentially inactive.
3.  **Cross-Chain Evacuation**: The Watchtower triggers a `liquidate` call. This initiates a cross-chain swap and bridge via **LI.FI**, moving the user's WETH/USDC from Sepolia directly to the `LazarusVault` on **Arbitrum Sepolia**.
4.  **Beneficiary Claim**: The funds are held securely in the vault, where only the designated beneficiary can claim them.

---

## Deployment Addresses

| Contract | Network | Address |
|----------|---------|---------|
| **LazarusSource** | Sepolia (L1) | `0x8369982044107232355498c7c16f648f159a3098` |
| **LazarusVault** | Arbitrum Sepolia (L2) | `0x63510d487ef6a1cfe2a838b925fcbc771cc32e98` |

---

## Technologies Used (Sponsor Tracks)

Lazarus Protocol leverages several cutting-edge protocols to ensure a seamless and secure cross-chain experience:

### 1. LI.FI (Cross-Chain Execution Layer)
We use the **LI.FI API** for our core "Evacuation" logic. When a user is detected as inactive, the Watchtower fetches a swap-and-bridge quote from LI.FI to move assets (e.g., WETH) on Sepolia to USDC on Arbitrum Sepolia in a single atomic transaction.
- **Integration**: Programmatic quote fetching and calldata execution via the `LazarusSource.liquidate` function.

### 2. ENS (Ethereum Name Service)
To improve user experience and security, we integrate **ENS** for beneficiary registration.
- **Integration**: Uses `wagmi` hooks to resolve human-readable names to `0x` addresses. We implemented a specialized multi-chain transport that allows resolution from Ethereum Mainnet even while the app is connected to the Sepolia testnet.

### 3. Yellow Network (Nitrolite Protocol)
Lazarus Protocol implements "Gas-Free Heartbeats" using session-based logic inspired by the **Yellow SDK**.
- **Integration**: Users sign EIP-712 "Heartbeat" messages off-chain. These signatures are collected and verified by the Watchtower to prove liveness without requiring the user to pay gas for every daily check-in. On-chain settlement (liquidation) only occurs if these off-chain session proofs stop arriving.

---

## Technical Architecture

The protocol is divided into three main components:

### 1. Smart Contracts
The core logic governing liveness, deposits, and the secure vault.
- **Source**: `LazarusSource.sol` (Sepolia)
- **Vault**: `LazarusVault.sol` (Arbitrum Sepolia)
- [📖 Contracts Documentation](./packages/contracts/README.md)

### 2. Frontend Dashboard
A modern, responsive Next.js application for users to manage their protection status, heartbeats, and beneficiaries.
- **Tech Stack**: Next.js 16, RainbowKit, Wagmi, Tailwind CSS.
- [📖 Frontend Documentation](./packages/frontend/README.md)

### 3. Watchtower Service
A robust Node.js service that tracks heartbeats off-chain and executes the liquidation logic when needed.
- **Tech Stack**: TypeScript, Viem, SQLite, LI.FI API.
- [📖 Watchtower Documentation](./packages/watchtower/README.md)

---

## Quick Start (Monorepo)

1.  **Install Dependencies**:
    ```bash
    # Root level
    npm install
    ```

2.  **Environment Setup**:
    Follow the `.env.example` in each package directory.

3.  **Development**:
    - Contracts: `cd packages/contracts && forge build`
    - Frontend: `cd packages/frontend && npm run dev`
    - Watchtower: `cd packages/watchtower && npm run dev`

---

## License
[MIT](./LICENSE)
