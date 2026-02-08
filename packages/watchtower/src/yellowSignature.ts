import { verifyTypedData, type Address } from 'viem';
import { loadConfig } from './config.js'; // FIX: Import config loader

// Load config to get the correct Chain ID
const config = loadConfig();

/**
 * EIP-712 Domain for Yellow Network Heartbeat verification
 */
export const HEARTBEAT_DOMAIN = {
  name: 'Lazarus Protocol',
  version: '1',
  chainId: BigInt(config.sourceChainId), // FIX: Use config value, do not hardcode
} as const;

/**
 * EIP-712 Types for Heartbeat message
 */
export const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

export interface HeartbeatMessage {
  message: string;
  timestamp: bigint;
  nonce: bigint;
}

export interface VerificationResult {
  valid: boolean;
  recoveredAddress?: Address;
  error?: string;
}

/**
 * Verify a Yellow Network style EIP-712 signed heartbeat message
 */
export async function verifyYellowSignature(
  message: HeartbeatMessage,
  signature: `0x${string}`,
  expectedSigner: Address
): Promise<VerificationResult> {
  try {
    // Verify the message was signed recently (within 5 minutes)
    const now = BigInt(Math.floor(Date.now() / 1000));
    const fiveMinutes = 300n;
    
    if (message.timestamp < now - fiveMinutes || message.timestamp > now + fiveMinutes) {
      return {
        valid: false,
        error: 'Heartbeat timestamp is too old or in the future',
      };
    }

    // Verify the signature using EIP-712 typed data
    const isValid = await verifyTypedData({
      address: expectedSigner,
      domain: HEARTBEAT_DOMAIN,
      types: HEARTBEAT_TYPES,
      primaryType: 'Heartbeat',
      message: {
        message: message.message,
        timestamp: message.timestamp,
        nonce: message.nonce,
      },
      signature,
    });

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature verification failed',
      };
    }

    return {
      valid: true,
      recoveredAddress: expectedSigner,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error during verification',
    };
  }
}
