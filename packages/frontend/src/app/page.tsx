'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { RegistrationForm } from '@/components/RegistrationForm';
import { HeartbeatPanel } from '@/components/HeartbeatPanel';
import { StatusDashboard } from '@/components/StatusDashboard';
import { TokenApproval } from '@/components/TokenApproval';
import { CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI } from '@/config/abis';

export default function Home() {
  const { address, isConnected } = useAccount();

  // Check if user is registered
  const { data: isRegistered, refetch: refetchStatus, isLoading: isStatusLoading } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'isRegistered',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 10000 // Poll every 10s
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <span className="text-xl">🔮</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Lazarus Protocol</h1>
              <p className="text-xs text-slate-400">Dead Man&apos;s Switch for DeFi</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-12">
        {!isConnected ? (
          <div className="text-center py-24">
            <span className="text-6xl mb-6 block">🔮</span>
            <h2 className="text-4xl font-bold text-white mb-4">
              Welcome to Lazarus Protocol
            </h2>
            <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
              The ultimate Dead Man&apos;s Switch for DeFi. Protect your crypto assets 
              with automatic evacuation to your beneficiary if you go silent.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl mx-auto">
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🟡</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Yellow Liquidity</h3>
                <p className="text-slate-400 text-sm">
                  Integrated with Yellow Network for deep liquidity and gas-free heartbeat sessions.
                </p>
              </div>
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🌉</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">LI.FI Bridge</h3>
                <p className="text-slate-400 text-sm">
                  Autonomous cross-chain evacuation. Assets are swapped and bridged to your beneficiary on Arbitrum.
                </p>
              </div>
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⏳</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Custom Timeout</h3>
                <p className="text-slate-400 text-sm">
                  Define your own cooldown. Assets are sent to the ENS address of your beneficiary after your custom timeout.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Status Dashboard */}
            <StatusDashboard />

            {/* Main Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {isStatusLoading ? (
                <div className="col-span-2 py-12 flex flex-col items-center justify-center bg-slate-900/50 border border-slate-800 rounded-2xl">
                  <svg className="animate-spin h-8 w-8 text-violet-500 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-slate-400">Verifying your protection status...</p>
                </div>
              ) : !isRegistered ? (
                <>
                  <RegistrationForm onSuccess={refetchStatus} />
                  <TokenApproval />
                </>
              ) : (
                <>
                  <HeartbeatPanel />
                  <TokenApproval />
                </>
              )}
            </div>

            {/* Info Section */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8">
              <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-violet-400">1</span>
                  </div>
                  <p className="text-slate-300 text-sm">Register with your beneficiary&apos;s address</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-violet-400">2</span>
                  </div>
                  <p className="text-slate-300 text-sm">Approve tokens for Lazarus to protect</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-violet-400">3</span>
                  </div>
                  <p className="text-slate-300 text-sm">Send heartbeats to prove you&apos;re alive</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-violet-400">4</span>
                  </div>
                  <p className="text-slate-300 text-sm">If silent for your custom period, assets go to beneficiary</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center">
          <p className="text-slate-500 text-sm">
            Lazarus Protocol • Built with Yellow Network & LI.FI • Testnet Only
          </p>
        </div>
      </footer>
    </div>
  );
}
