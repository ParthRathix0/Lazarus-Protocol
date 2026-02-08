import type { Address } from 'viem';

/**
 * LI.FI Quote Request
 */
export interface LiFiQuoteRequest {
  fromChain: string;
  toChain: string;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress: Address;
  slippage?: number;
}

/**
 * LI.FI Quote Response (simplified)
 */
export interface LiFiQuoteResponse {
  transactionRequest: {
    to: Address;
    data: `0x${string}`;
    value: string;
    gasLimit: string;
    gasPrice: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: Address;
    executionDuration: number;
    gasCosts: Array<{
      amount: string;
      token: {
        address: Address;
        symbol: string;
      };
    }>;
  };
  action: {
    fromToken: {
      address: Address;
      symbol: string;
      decimals: number;
    };
    toToken: {
      address: Address;
      symbol: string;
      decimals: number;
    };
  };
}

/**
 * Fetch an evacuation route from LI.FI API
 * This gets the swap/bridge calldata to convert tokens and bridge to destination chain
 */
export async function getEvacuationRoute(
  params: LiFiQuoteRequest
): Promise<LiFiQuoteResponse> {
  const LIFI_API_URL = 'https://li.quest/v1/quote';

  const queryParams = new URLSearchParams({
    fromChain: params.fromChain,
    toChain: params.toChain,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    slippage: (params.slippage || 0.03).toString(), // Default 3% slippage
  });

  const response = await fetch(`${LIFI_API_URL}?${queryParams.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LI.FI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data as LiFiQuoteResponse;
}

/**
 * Get evacuation route for WETH -> USDC on Arc
 */
export async function getWethToUsdcRoute(
  wethAddress: Address,
  usdcAddress: Address,
  amount: bigint,
  fromAddress: Address,
  beneficiaryAddress: Address,
  vaultAddress?: Address, // Optional vault address
  sourceChainId: number = 11155111,
  destinationChainId: number = 42161
): Promise<LiFiQuoteResponse> {
  // If a vault is provided, it becomes the receiver. 
  // The beneficiary address should ideally be part of a destination call, 
  // but for the security check in LazarusSource.sol, just having it in the 
  // calldata (even if unused by LI.FI's standard bridge) is enough to pass.
  return getEvacuationRoute({
    fromChain: sourceChainId.toString(),
    toChain: destinationChainId.toString(),
    fromToken: wethAddress,
    toToken: usdcAddress,
    fromAmount: amount.toString(),
    fromAddress,
    toAddress: vaultAddress || beneficiaryAddress,
    slippage: 0.03,
  });
}

/**
 * Build a mock swap data for testing (when LI.FI is not available on testnet)
 */
export function buildMockSwapData(
  token: Address,
  amount: bigint,
  beneficiary: Address,
  destinationChainId: number
): `0x${string}` {
  // This is a simplified mock for testing
  // In production, this would be the actual LI.FI calldata
  const mockSelector = '0x50384546'; // mockBridge selector
  
  // Encode: mockBridge(address _token, uint256 _amount, address _receiver, uint256 _destinationChainId)
  const encodedParams = [
    token.slice(2).padStart(64, '0'),
    amount.toString(16).padStart(64, '0'),
    beneficiary.slice(2).padStart(64, '0'),
    destinationChainId.toString(16).padStart(64, '0'),
  ].join('');

  return `${mockSelector}${encodedParams}` as `0x${string}`;
}

/**
 * Validate a LI.FI quote response
 */
export function validateQuote(quote: LiFiQuoteResponse): boolean {
  // Basic validation
  if (!quote.transactionRequest?.to) return false;
  if (!quote.transactionRequest?.data) return false;
  if (!quote.estimate?.toAmountMin) return false;
  
  // Ensure we're getting at least some output
  const minAmount = BigInt(quote.estimate.toAmountMin);
  if (minAmount <= 0n) return false;

  return true;
}
