import type { Address, PublicClient, WalletClient } from 'viem';
import { getHeartbeatStore } from './database.js';
import { buildMockSwapData, getWethToUsdcRoute, validateQuote } from './lifi.js';
import { Config, LazarusSourceABI, ERC20ABI } from './config.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface LiquidationResult {
  userAddress: Address;
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
}

/**
 * Check on-chain status and determine if user can be liquidated
 */
async function checkUserOnChain(
  publicClient: PublicClient,
  lazarusSourceAddress: Address,
  userAddress: Address
): Promise<{ canLiquidate: boolean; beneficiary?: Address }> {
  try {
    const [canLiquidate] = await publicClient.readContract({
      address: lazarusSourceAddress,
      abi: LazarusSourceABI,
      functionName: 'checkUserStatus',
      args: [userAddress],
    });

    if (!canLiquidate) {
      return { canLiquidate: false };
    }

    const [registered, beneficiary, , dead] = await publicClient.readContract({
      address: lazarusSourceAddress,
      abi: LazarusSourceABI,
      functionName: 'getUserInfo',
      args: [userAddress],
    });

    if (!registered || dead) {
      return { canLiquidate: false };
    }

    return { canLiquidate: true, beneficiary };
  } catch (error) {
    console.error(`Error checking user ${userAddress} on-chain:`, error);
    return { canLiquidate: false };
  }
}

/**
 * Check token allowance and balance for a user
 */
async function checkUserTokens(
  publicClient: PublicClient,
  tokenAddress: Address,
  userAddress: Address,
  spenderAddress: Address
): Promise<{ allowance: bigint; balance: bigint }> {
  const [allowance, balance] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20ABI,
      functionName: 'allowance',
      args: [userAddress, spenderAddress],
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    }),
  ]);

  return { allowance, balance };
}

/**
 * Execute liquidation for a single user and token
 */
async function executeLiquidation(
  publicClient: PublicClient,
  walletClient: WalletClient,
  config: Config,
  userAddress: Address,
  beneficiary: Address,
  tokenAddress: Address,
  tokenSymbol: string
): Promise<LiquidationResult> {
  try {
    // Check token allowance and balance
    const { allowance, balance } = await checkUserTokens(
      publicClient,
      tokenAddress,
      userAddress,
      config.lazarusSourceAddress
    );

    if (allowance === 0n) {
      return {
        userAddress,
        success: false,
        error: `User has not approved ${tokenSymbol} for liquidation`,
      };
    }

    // Use the minimum of allowance and balance
    const amountToLiquidate = allowance < balance ? allowance : balance;

    if (amountToLiquidate === 0n) {
      return {
        userAddress,
        success: false,
        error: `User has no ${tokenSymbol} to liquidate`,
      };
    }

    const feeBps = 100n;
    const fee = (amountToLiquidate * feeBps) / 10000n;
    const amountToSwap = amountToLiquidate - fee;

    // Try to get LI.FI route, fall back to mock if API fails
    let swapData: `0x${string}`;
    
    try {
      const route = await getWethToUsdcRoute(
        tokenAddress,
        config.usdcAddress,
        amountToSwap,
        config.lazarusSourceAddress,
        beneficiary,
        config.sourceChainId,
        config.destinationChainId
      );

      if (!validateQuote(route)) {
        throw new Error('Invalid LI.FI quote');
      }

      swapData = route.transactionRequest.data;
    } catch (lifiError) {
      console.warn(`LI.FI API failed for user ${userAddress}, using mock data:`, lifiError);
      swapData = buildMockSwapData(
        tokenAddress,
        amountToSwap,
        beneficiary,
        config.destinationChainId
      );
    }

    // Simulate the transaction first
    try {
      await publicClient.simulateContract({
        address: config.lazarusSourceAddress,
        abi: LazarusSourceABI,
        functionName: 'liquidate',
        args: [userAddress, tokenAddress, swapData],
        account: walletClient.account,
      });
    } catch (simError) {
      return {
        userAddress,
        success: false,
        error: `Simulation failed: ${simError instanceof Error ? simError.message : 'Unknown error'}`,
      };
    }

    // Execute the liquidation
    const hash = await walletClient.writeContract({
      address: config.lazarusSourceAddress,
      abi: LazarusSourceABI,
      functionName: 'liquidate',
      args: [userAddress, tokenAddress, swapData],
      chain: walletClient.chain,
      account: walletClient.account!,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      // User removal is now handled in runLiquidationCheck after all tokens are processed
      return {
        userAddress,
        success: true,
        txHash: hash,
      };
    } else {
      return {
        userAddress,
        success: false,
        error: 'Transaction reverted',
        txHash: hash,
      };
    }
  } catch (error) {
    return {
      userAddress,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run the liquidation check job
 * This is called by the cron scheduler
 */
export async function runLiquidationCheck(
  publicClient: PublicClient,
  walletClient: WalletClient,
  config: Config
): Promise<LiquidationResult[]> {
  console.log(`[${new Date().toISOString()}] Running liquidation check...`);

  const store = getHeartbeatStore();
  const results: LiquidationResult[] = [];

  // Get users who haven't pinged in 7 days
  const inactiveUsers = store.getInactiveUsers(SEVEN_DAYS_MS);

  console.log(`Found ${inactiveUsers.length} potentially inactive users`);

  for (const user of inactiveUsers) {
    const userAddress = user.userAddress as Address;
    
    // Check on-chain status
    const { canLiquidate, beneficiary } = await checkUserOnChain(
      publicClient,
      config.lazarusSourceAddress,
      userAddress
    );

    if (!canLiquidate || !beneficiary) {
      console.log(`User ${userAddress} cannot be liquidated yet`);
      continue;
    }

    console.log(`Attempting to liquidate user ${userAddress}...`);

    // Iterate through ALL supported tokens
    let anySuccess = false;
    for (const token of config.supportedTokens) {
      console.log(`  Checking ${token.symbol} for user ${userAddress}...`);
      
      const result = await executeLiquidation(
        publicClient,
        walletClient,
        config,
        userAddress,
        beneficiary,
        token.address,
        token.symbol
      );

      results.push(result);

      if (result.success) {
        console.log(`  Successfully liquidated ${token.symbol}: ${result.txHash}`);
        anySuccess = true;
      } else if (!result.error?.includes('not approved')) {
        // Only log non-approval errors (approval errors are expected for tokens user didn't approve)
        console.warn(`  Failed ${token.symbol}: ${result.error}`);
      }
    }

    // Remove user from tracking only if at least one token was liquidated
    if (anySuccess) {
      store.removeUser(userAddress);
    }
  }

  console.log(`Liquidation check complete. Processed ${results.length} token liquidations.`);
  return results;
}
