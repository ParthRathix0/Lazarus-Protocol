import { verifyTypedData, type Address } from 'viem';

/**
 * EIP-712 Domain for Yellow Network Heartbeat verification
 */
export const getHeartbeatDomain = (chainId: number | bigint) => ({
  name: 'Lazarus Protocol',
  version: '1',
  chainId: BigInt(chainId),
});

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
  expectedSigner: Address,
  chainId: number | bigint
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
      domain: getHeartbeatDomain(chainId),
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

/**
 * Generate the message to be signed for a heartbeat
 */
export function generateHeartbeatMessage(): HeartbeatMessage {
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const nonce = BigInt(Math.floor(Math.random() * 1000000));
  
  return {
    message: 'I am alive',
    timestamp,
    nonce,
  };
}

/**
 * Get the EIP-712 signing payload for frontend use
 */
export function getSigningPayload(message: HeartbeatMessage, chainId: number | bigint) {
  return {
    domain: getHeartbeatDomain(chainId),
    types: HEARTBEAT_TYPES,
    primaryType: 'Heartbeat' as const,
    message: {
      message: message.message,
      timestamp: message.timestamp,
      nonce: message.nonce,
    },
  };
}
