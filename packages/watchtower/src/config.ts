import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// LazarusSource ABI (minimal)
export const LazarusSourceABI = [
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'checkUserStatus',
    outputs: [
      { name: 'canLiquidate', type: 'bool' },
      { name: 'timeRemaining', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'getUserInfo',
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'beneficiary', type: 'address' },
      { name: 'lastPing', type: 'uint256' },
      { name: 'dead', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'pingFor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_token', type: 'address' },
      { name: '_swapData', type: 'bytes' },
    ],
    name: 'liquidate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// ERC20 ABI (minimal)
export const ERC20ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface Config {
  watchtowerPrivateKey: `0x${string}`;
  sepoliaRpcUrl: string;
  lazarusSourceAddress: Address;
  lifiDiamondAddress: Address;
  wethAddress: Address;
  usdcAddress: Address;
  sourceChainId: number;
  destinationChainId: number;
  port: number;
}

export function loadConfig(): Config {
  const watchtowerPrivateKey = process.env.WATCHTOWER_PRIVATE_KEY;
  if (!watchtowerPrivateKey) {
    throw new Error('WATCHTOWER_PRIVATE_KEY is required');
  }

  return {
    watchtowerPrivateKey: watchtowerPrivateKey.startsWith('0x')
      ? (watchtowerPrivateKey as `0x${string}`)
      : (`0x${watchtowerPrivateKey}` as `0x${string}`),
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    lazarusSourceAddress: (process.env.LAZARUS_SOURCE_ADDRESS || '0x') as Address,
    lifiDiamondAddress: (process.env.LIFI_DIAMOND_ADDRESS || '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE') as Address,
    wethAddress: (process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14') as Address,
    usdcAddress: (process.env.USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as Address,
    sourceChainId: parseInt(process.env.SOURCE_CHAIN_ID || '11155111'),
    destinationChainId: parseInt(process.env.DESTINATION_CHAIN_ID || '42161'),
    port: parseInt(process.env.PORT || '3001'),
  };
}

export function createClients(config: Config): {
  publicClient: PublicClient;
  walletClient: WalletClient;
} {
  const account = privateKeyToAccount(config.watchtowerPrivateKey);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  });

  return { publicClient, walletClient };
}
