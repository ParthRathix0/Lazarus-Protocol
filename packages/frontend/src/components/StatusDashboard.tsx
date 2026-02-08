'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI, ERC20ABI } from '@/config/abis';
import { formatEther } from 'viem';

export function StatusDashboard() {
  const { address } = useAccount();

  // Read user info from contract
  const { data: userInfo, isLoading: isUserLoading, refetch: refetchInfo } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 10000 // Poll every 10s
    },
  });

  // Read user status
  const { data: userStatus, refetch: refetchStatus } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'checkUserStatus',
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address,
      refetchInterval: 10000 // Poll every 10s
    },
  });

  const handleManualRefresh = () => {
    refetchInfo();
    refetchStatus();
  };

  // Read token balances
  const { data: tokenData } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.weth,
        abi: ERC20ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
      {
        address: CONTRACTS.weth,
        abi: ERC20ABI,
        functionName: 'allowance',
        args: address ? [address, CONTRACTS.lazarusSource] : undefined,
      },
    ],
    query: { enabled: !!address },
  });

  if (!address) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50">
        <p className="text-slate-400 text-center">Connect wallet to view status</p>
      </div>
    );
  }

  // userInfo: [bool registered, address beneficiary, uint256 lastPing, uint256 inactivityPeriod, bool dead]
  const [registered, beneficiary, lastPing, inactivityPeriod, isDead] = userInfo || [false, '0x', BigInt(0), BigInt(604800), false];
  const [, timeRemaining] = userStatus || [false, BigInt(0)];
  
  const wethBalance = tokenData?.[0]?.result ?? BigInt(0);
  const wethAllowance = tokenData?.[1]?.result ?? BigInt(0);

  const lastPingDate = lastPing ? new Date(Number(lastPing) * 1000) : null;
  const timeRemainingSeconds = Number(timeRemaining);
  const timeRemainingDays = timeRemainingSeconds / 86400;
  const timeRemainingHours = (timeRemainingSeconds % 86400) / 3600;
  const timeRemainingMinutes = (timeRemainingSeconds % 3600) / 60;

  const totalPeriod = Number(inactivityPeriod);

  if (isUserLoading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50">
        <div className="flex items-center justify-center gap-3">
          <svg className="animate-spin h-6 w-6 text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-slate-400">Loading status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-cyan-500/20 shadow-2xl shadow-cyan-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">Status Dashboard</h2>
            <p className="text-slate-400 text-sm">Your protection status at a glance</p>
          </div>
          <button 
            onClick={handleManualRefresh}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors"
            title="Refresh status"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {!registered ? (
          <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
            <span className="text-4xl mb-4 block">⚠️</span>
            <p className="text-amber-400 font-medium">Not Registered</p>
            <p className="text-slate-400 text-sm mt-2">
              Register with a beneficiary to activate your Dead Man&apos;s Switch
            </p>
          </div>
        ) : isDead ? (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <span className="text-4xl mb-4 block">💀</span>
            <p className="text-red-400 font-medium">Switch Triggered</p>
            <p className="text-slate-400 text-sm mt-2">
              Your assets have been evacuated to your beneficiary
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Time Remaining */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-sm mb-1">Time Until Liquidation</p>
              <p className="text-2xl font-bold text-white">
                {timeRemainingSeconds >= 3600 ? (
                  `${Math.floor(timeRemainingDays)}d ${Math.floor(timeRemainingHours)}h`
                ) : (
                  `${Math.floor(timeRemainingMinutes)}m ${timeRemainingSeconds % 60}s`
                )}
              </p>
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    (timeRemainingSeconds / totalPeriod) > 0.7 ? 'bg-emerald-500' : 
                    (timeRemainingSeconds / totalPeriod) > 0.3 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, (timeRemainingSeconds / totalPeriod) * 100)}%` }}
                />
              </div>
            </div>

            {/* Inactivity Period */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-sm mb-1">Cooldown Duration</p>
              <p className="text-lg font-bold text-white">
                {totalPeriod >= 86400 ? `${totalPeriod / 86400} Days` : totalPeriod >= 3600 ? `${totalPeriod / 3600} Hours` : `${totalPeriod / 60} Minutes`}
              </p>
            </div>

            {/* Last Heartbeat */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-sm mb-1">Last Heartbeat</p>
              <p className="text-md font-bold text-white">
                {lastPingDate?.toLocaleDateString()} {lastPingDate?.toLocaleTimeString()}
              </p>
            </div>

            {/* Beneficiary */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
              <p className="text-slate-400 text-sm mb-1">Beneficiary</p>
              <p className="text-md font-mono text-white">
                {beneficiary ? `${String(beneficiary).slice(0, 6)}...${String(beneficiary).slice(-4)}` : 'N/A'}
              </p>
            </div>

            {/* Protected Assets */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700 md:col-span-2">
              <p className="text-slate-400 text-sm mb-1">Protected WETH</p>
              <p className="text-lg font-bold text-white">
                {parseFloat(formatEther(wethAllowance)).toFixed(4)} WETH
              </p>
              <p className="text-slate-500 text-xs">
                Wallet Balance: {parseFloat(formatEther(wethBalance)).toFixed(4)} WETH
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
