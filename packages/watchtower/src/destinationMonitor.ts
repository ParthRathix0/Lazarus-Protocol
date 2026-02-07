import { createPublicClient, http, type Address, type Log } from 'viem';
import { arbitrum } from 'viem/chains';

// LazarusVault ABI (minimal for event monitoring)
const LazarusVaultABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'depositor', type: 'address' },
      { indexed: true, name: 'beneficiary', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Deposited',
    type: 'event',
  },
] as const;

interface DepositedEvent {
  depositor: Address;
  beneficiary: Address;
  amount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

interface PendingBridge {
  userAddress: Address;
  beneficiary: Address;
  sourceTxHash: `0x${string}`;
  timestamp: number;
  tokenSymbol: string;
}

// In-memory store for pending bridges
const pendingBridges: Map<string, PendingBridge> = new Map();

/**
 * Add a pending bridge to monitor
 */
export function addPendingBridge(bridge: PendingBridge): void {
  const key = `${bridge.beneficiary}-${bridge.sourceTxHash}`;
  pendingBridges.set(key, bridge);
  console.log(`[DestMonitor] Added pending bridge for ${bridge.beneficiary} (${bridge.tokenSymbol})`);
}

/**
 * Create a destination chain client
 */
export function createDestinationClient(rpcUrl: string) {
  return createPublicClient({
    chain: arbitrum, // Arc Network / Arbitrum
    transport: http(rpcUrl),
  });
}

/**
 * Check for Deposited events on the vault
 */
export async function checkDestinationDeposits(
  rpcUrl: string,
  vaultAddress: Address,
  fromBlock: bigint
): Promise<DepositedEvent[]> {
  const client = createDestinationClient(rpcUrl);

  try {
    const logs = await client.getLogs({
      address: vaultAddress,
      event: {
        type: 'event',
        name: 'Deposited',
        inputs: [
          { type: 'address', indexed: true, name: 'depositor' },
          { type: 'address', indexed: true, name: 'beneficiary' },
          { type: 'uint256', indexed: false, name: 'amount' },
        ],
      },
      fromBlock,
      toBlock: 'latest',
    });

    return logs.map((log) => ({
      depositor: log.args.depositor!,
      beneficiary: log.args.beneficiary!,
      amount: log.args.amount!,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    }));
  } catch (error) {
    console.error('[DestMonitor] Error fetching deposit events:', error);
    return [];
  }
}

/**
 * Run destination monitoring check
 * Matches pending bridges with actual deposits
 */
export async function runDestinationCheck(
  rpcUrl: string,
  vaultAddress: Address,
  fromBlock: bigint
): Promise<{ confirmed: string[]; stuck: PendingBridge[] }> {
  const deposits = await checkDestinationDeposits(rpcUrl, vaultAddress, fromBlock);
  const confirmed: string[] = [];
  const stuck: PendingBridge[] = [];

  // Check each pending bridge
  const staleThreshold = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();

  for (const [key, bridge] of pendingBridges.entries()) {
    // Check if there's a matching deposit
    const matchingDeposit = deposits.find(
      (d) => d.beneficiary.toLowerCase() === bridge.beneficiary.toLowerCase()
    );

    if (matchingDeposit) {
      console.log(
        `[DestMonitor] ✅ Bridge confirmed for ${bridge.beneficiary}: ${matchingDeposit.transactionHash}`
      );
      confirmed.push(key);
      pendingBridges.delete(key);
    } else if (now - bridge.timestamp > staleThreshold) {
      // Bridge is taking too long, flag as potentially stuck
      console.warn(
        `[DestMonitor] ⚠️ Bridge may be stuck for ${bridge.beneficiary} (source tx: ${bridge.sourceTxHash})`
      );
      stuck.push(bridge);
    }
  }

  return { confirmed, stuck };
}

/**
 * Get all pending bridges (for API endpoint)
 */
export function getPendingBridges(): PendingBridge[] {
  return Array.from(pendingBridges.values());
}
