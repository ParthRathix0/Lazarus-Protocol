# Lazarus Protocol: Watchtower Service

The Lazarus Watchtower is a robust, autonomous backend service responsible for monitoring user liveness on the source chain and executing cross-chain evacuations when inactivity thresholds are met.

## How it Works

The Watchtower operates in a continuous loop, performing three primary roles:

### 1. Event Monitoring
The service listens for specific activity events on the `LazarusSource` contract (Sepolia):
- `Registered`: Initializes tracking for a new user.
- `Ping`: Resets the 7-day timer.
- `FundsDeposited` / `FundsWithdrawn`: Also count as activity.

When these events are detected, the Watchtower updates the user's "Last Seen" timestamp in its local database.

### 2. Inactivity Detection
Every few minutes, a background cron job queries the local database for users who haven't been seen for more than **7 days**. For these users, it performs an on-chain verification check using the `checkUserStatus` function on the smart contract.

### 3. Liquidation & Bridging
Once inactivity is confirmed on-chain, the Watchtower:
1. **Fetches a Quote**: Calls the **LI.FI API** to get optimal swap/bridge calldata (typically converting the user's assets to USDC on Arbitrum Sepolia).
2. **Executes Liquidation**: Submits a `liquidate` transaction to the `LazarusSource` contract with the bridge calldata.
3. **Vault Arrival**: The LI.FI protocol executes the bridge, and the funds arrive at the `LazarusVault` on the destination chain.

---

## Technical Stack

- **Runtime**: Node.js (TypeScript)
- **Blockchain Interface**: [Viem](https://viem.sh/)
- **Database**: SQLite (via `better-sqlite3`) for persistent heartbeat tracking.
- **Cross-Chain**: [LI.FI API](https://docs.li.fi/) for bridge/swap routing.

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

2. Configure environment variables (`.env`):
   ```bash
   # Private key for the watchtower wallet (must have ETH for gas)
   WATCHTOWER_PRIVATE_KEY=0x...
   
   # RPC URLs
   SEPOLIA_RPC_URL=https://...
   DESTINATION_RPC_URL=https://... (Arbitrum Sepolia)
   
   # Contract Addresses
   LAZARUS_SOURCE_ADDRESS=0x...
   LAZARUS_VAULT_ADDRESS=0x...
   LIFI_DIAMOND_ADDRESS=0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE
   
   # Supported Tokens (Symbol:Address)
   SUPPORTED_TOKENS=WETH:0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14,USDC:0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
   ```

### Run
```bash
# Start in development mode (with hot-reload)
npm run dev
```

### Build
```bash
# Compile TypeScript to JavaScript
npm run build
```

---

## Testing & Mocking

On testnets like Sepolia, the LI.FI API might not always return valid bridge quotes for all token pairs. The Watchtower supports a specialized mocking mode:

- **MOCK_SWAP**: Set `USE_MOCK_SWAP=true` in `.env` to generate synthetic `liquidate` calldata that passes the contract's beneficiary security check without requiring an external API call.
- **Database**: The `heartbeats.db` is stored in the `data/` directory. You can inspect it using standard SQLite tools to verify tracking logic.
