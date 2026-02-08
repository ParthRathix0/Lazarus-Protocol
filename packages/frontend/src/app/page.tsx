'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { RegistrationForm } from '@/components/RegistrationForm';
import { HeartbeatPanel } from '@/components/HeartbeatPanel';
import { TokenApproval } from '@/components/TokenApproval';
import { CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI } from '@/config/abis';

import Image from 'next/image';

export default function Home() {
  const { address, isConnected } = useAccount();

  // FIX: Use 'getUserInfo' instead of 'isRegistered' because 'isRegistered' is missing from the minimal ABI
  // getUserInfo returns [registered, beneficiary, lastPing, dead]
  const { data: userInfo, isLoading: isStatusLoading, isError: isStatusError } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Extract the boolean (first return value)
  const isRegistered = userInfo ? userInfo[0] : false;

  // Show loading state while checking registration
  if (isConnected && isStatusLoading) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400">Checking status...</p>
      </div>
    );
  }

  // Show error if status check fails (likely RPC issue)
  if (isConnected && isStatusError) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="text-red-400 text-5xl mb-4">⚠️</div>
        <h2 className="text-white text-2xl font-bold mb-2">Connection Error</h2>
        <p className="text-slate-400 text-center max-w-md mb-6">
          Failed to fetch your registration status. This is likely due to an RPC connection issue.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950 flex flex-col overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/50 backdrop-blur-xl flex-none">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-lg shadow-violet-500/25">
              <Image src="/logo.png" alt="Lazarus Protocol" fill className="object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Lazarus Protocol</h1>
              <p className="text-[10px] text-slate-400">Dead Man&apos;s Switch for DeFi</p>
            </div>
          </div>
          <div className="scale-90 origin-right">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-grow flex flex-col items-center justify-center px-4 w-full max-w-7xl mx-auto">
        {!isConnected ? (
          <div className="text-center w-full max-w-5xl flex flex-col gap-8">
            {/* Hero Section */}
            <div className="flex flex-col items-center">
              <div className="relative w-32 h-32 mb-6 animate-bounce">
                <Image src="/logo.png" alt="Lazarus Protocol" fill className="object-contain" priority />
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">
                Welcome to Lazarus Protocol
              </h2>
              <p className="text-lg text-slate-400 mb-6 max-w-2xl mx-auto leading-relaxed">
                The ultimate Dead Man&apos;s Switch for DeFi. Protect your crypto assets 
                with automatic evacuation to your beneficiary if you go silent.
              </p>
              <div className="flex justify-center scale-110">
                <ConnectButton />
              </div>
            </div>

            {/* Features - Larger Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:bg-slate-800/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">🛡️</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Set & Forget</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Register once, enable ping reminders, and your assets are protected forever.
                </p>
              </div>
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:bg-slate-800/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">🌉</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Cross-Chain</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Assets are automatically swapped and bridged to your beneficiary on Arc Network.
                </p>
              </div>
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl hover:bg-slate-800/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">🔐</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Secure</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  7-day timeout, on-chain verification, and non-custodial design.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-4 py-4 overflow-y-auto max-h-[calc(100vh-100px)] scrollbar-hide">
            {/* Info Section - Now at Top */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg font-bold text-violet-400">1</span>
                  </div>
                  <p className="text-slate-300 text-xs">Register beneficiary</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg font-bold text-violet-400">2</span>
                  </div>
                  <p className="text-slate-300 text-xs">Approve tokens</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg font-bold text-violet-400">3</span>
                  </div>
                  <p className="text-slate-300 text-xs">Send heartbeats</p>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-2">
                    <span className="text-lg font-bold text-violet-400">4</span>
                  </div>
                  <p className="text-slate-300 text-xs">Assets evacuated on timeout</p>
                </div>
              </div>
            </div>

            {/* Main Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {!isRegistered ? (
                <>
                  <RegistrationForm />
                  <TokenApproval />
                </>
              ) : (
                <>
                  <HeartbeatPanel />
                  <TokenApproval />
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 flex-none bg-slate-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center">
          <p className="text-slate-500 text-xs">
            Lazarus Protocol • Built with Yellow Network & LI.FI • Testnet Only
          </p>
        </div>
      </footer>
    </div>
  );
}
