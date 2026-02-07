import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, mainnet } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Lazarus Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'demo-project-id',
  chains: [sepolia, mainnet],
  ssr: true,
});

// Contract addresses (update these after deployment)
export const CONTRACTS = {
  lazarusSource: (process.env.NEXT_PUBLIC_LAZARUS_SOURCE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14') as `0x${string}`,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238') as `0x${string}`,
} as const;

// Watchtower API URL
export const WATCHTOWER_URL = process.env.NEXT_PUBLIC_WATCHTOWER_URL || 'http://localhost:3001';
