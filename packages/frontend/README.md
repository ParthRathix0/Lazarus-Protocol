# Lazarus Protocol: Frontend

The Lazarus Protocol Frontend is a high-performance Dashboard built with **Next.js 16** (App Router), providing users with a seamless interface to manage their cross-chain asset protection.

## Core Features

### 1. Smart Registration
- **Address & ENS Support**: Users can register beneficiaries using either a direct `0x` address or an ENS name (e.g., `vitalik.eth`).
- **L1 ENS Resolution**: The dashboard performs ENS resolution against Ethereum Mainnet even when the user is connected to the Sepolia testnet, ensuring reliable name resolution.
- **Validation**: Strict client-side validation prevents self-registration and malformed address inputs.

### 2. Status Dashboard
- **Live Monitoring**: Real-time display of protection status (Connected Address, Resolved Beneficiary, and "Safe" status).
- **Polling & Refresh**: Implements a 10-second polling mechanism using `wagmi`'s `refetchInterval` to keep the UI in sync with on-chain status without manual refreshes.
- **Protection Summary**: Breakdown of protected assets and their current balances.

### 3. Heartbeat & Management
- **One-Click Ping**: Easy "Heartbeat" button to reset the 7-day inactivity timer.
- **Deposit/Withdraw**: Integrated asset management for moving tokens in and out of the protected contract.
- **Beneficiary Management**: Allows users to view and update their designated beneficiary directly from the dashboard.

---

## Technical Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Web3**: [Wagmi](https://wagmi.sh/), [Viem](https://viem.sh/), [RainbowKit](https://www.rainbowkit.com/)
- **Styling**: Tailwind CSS
- **State Management**: React Hooks + Wagmi Polling

---

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (`.env.local`):
   ```env
   NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_id
   NEXT_PUBLIC_LAZARUS_SOURCE_ADDRESS=0x8369982044107232355498c7c16f648f159a3098
   NEXT_PUBLIC_WATCHTOWER_URL=http://localhost:3001
   NEXT_PUBLIC_CHAIN_ID=11155111
   ```

### Run
```bash
npm run dev
```

### Build
```bash
npm run build
```

---

## Architecture Notes

### ENS Resolution Logic
The application uses a dedicated Ethereum Mainnet transport configuration specifically for the `useEnsAddress` hook. This bypasses the typical issue where ENS names won't resolve on testnets like Sepolia.

### Contract Interaction
All contract interactions (Read/Write) utilize the full `LazarusProtocol` ABIs located in `src/config/abis.ts`, which are kept in sync with the latest contract deployments.
