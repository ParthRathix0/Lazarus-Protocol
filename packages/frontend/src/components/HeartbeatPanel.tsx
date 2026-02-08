'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignTypedData, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useEnsAddress, useEnsName } from 'wagmi';
import { WATCHTOWER_URL, CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI, ERC20ABI } from '@/config/abis';
import { mainnet } from 'wagmi/chains';
import { normalize } from 'viem/ens';
import { formatEther } from 'viem';
import { formatError } from '@/utils/error';

// EIP-712 Domain for Yellow Network Heartbeat
const SOURCE_CHAIN_ID = BigInt(process.env.NEXT_PUBLIC_SOURCE_CHAIN_ID || 11155111);

const HEARTBEAT_DOMAIN = {
  name: 'Lazarus Protocol',
  version: '1',
  chainId: SOURCE_CHAIN_ID,
} as const;

const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

const PERIOD_OPTIONS = [
  { label: '30 Seconds (Test)', value: 30 },
  { label: '1 Minute (Test)', value: 60 },
  { label: '3 Days', value: 259200 },
  { label: '7 Days', value: 604800 },
  { label: '15 Days', value: 1296000 },
  { label: '30 Days', value: 2592000 },
  { label: '3 Months', value: 7776000 },
  { label: '6 Months', value: 15552000 },
  { label: '1 Year', value: 31536000 },
];

/**
 * Helpers ported from RegistrationForm for consistency
 */
function safeNormalize(name: string): string | undefined {
  if (!name.includes('.')) return undefined;
  if (name.endsWith('.') || name.startsWith('.')) return undefined;
  try { return normalize(name); } catch { return undefined; }
}

function getAddressValidationError(addr: string): string | undefined {
  if (!addr) return undefined;
  if (!addr.startsWith('0x')) return 'Address must start with 0x';
  if (addr.length < 42) return 'Address too short (42 chars)';
  if (addr.length > 42) return 'Address too long (42 chars)';
  const hexPart = addr.slice(2);
  if (!/^[a-fA-F0-9]{40}$/.test(hexPart)) return 'Invalid hex characters';
  return undefined;
}

export function HeartbeatPanel() {
  const { address } = useAccount();
  const [isPinging, setIsPinging] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [heartbeatError, setHeartbeatError] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  // Settings state
  const [newBeneficiaryInput, setNewBeneficiaryInput] = useState('');
  const [isUpdatingBen, setIsUpdatingBen] = useState(false);
  const [isUpdatingPeriod, setIsUpdatingPeriod] = useState(false);

  // Read user info
  const { data: userInfo, refetch: refetchInfo } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read user status (time remaining)
  const { data: userStatus, refetch: refetchStatus } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'checkUserStatus',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read token balances & allowances
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({
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

  const currentBeneficiary = userInfo?.[1] as `0x${string}` | undefined;
  const lastOnChainPing = userInfo?.[2];
  const currentPeriod = Number(userInfo?.[3] || 604800);
  const isDead = userInfo?.[4];
  const [, timeRemaining] = userStatus || [false, BigInt(0)];

  const wethBalance = tokenData?.[0]?.result ?? BigInt(0);
  const wethAllowance = tokenData?.[1]?.result ?? BigInt(0);

  const timeRemainingSeconds = Number(timeRemaining);
  const timeRemainingDays = timeRemainingSeconds / 86400;
  const timeRemainingHours = (timeRemainingSeconds % 86400) / 3600;
  const timeRemainingMinutes = (timeRemainingSeconds % 3600) / 60;

  // Resolve current beneficiary ENS
  const { data: currentEnsName } = useEnsName({
    address: currentBeneficiary,
    chainId: mainnet.id,
    query: { enabled: !!currentBeneficiary },
  });

  // Handle new beneficiary input validation
  const isAddressAttempt = newBeneficiaryInput.startsWith('0x');
  const isENSAttempt = newBeneficiaryInput.includes('.') && !isAddressAttempt;
  const addressError = isAddressAttempt ? getAddressValidationError(newBeneficiaryInput) : undefined;
  const normalizedName = safeNormalize(newBeneficiaryInput);

  const { data: ensAddress, isLoading: isEnsLoading, isError: isEnsError } = useEnsAddress({
    name: normalizedName,
    chainId: mainnet.id,
    query: { enabled: isENSAttempt && !!normalizedName },
  });

  const resolvedAddress = isAddressAttempt && !addressError 
    ? newBeneficiaryInput as `0x${string}` 
    : (isENSAttempt && ensAddress ? ensAddress : undefined);

  // Validation UI logic similar to RegistrationForm
  const validationUI = (() => {
    if (!newBeneficiaryInput) return null;
    if (isAddressAttempt) {
      if (addressError) return { type: 'error', message: `✗ ${addressError}` };
      return { type: 'success', message: `✓ Valid address format` };
    }
    if (isENSAttempt) {
      if (isEnsLoading) return { type: 'loading', message: 'Resolving ENS...' };
      if (ensAddress) return { type: 'success', message: `✓ Resolved to ${ensAddress.slice(0, 6)}...${ensAddress.slice(-4)}` };
      if (isEnsError) return { type: 'error', message: '✗ ENS resolution error' };
      if (!ensAddress) return { type: 'error', message: '✗ ENS name not found' };
    }
    return { type: 'error', message: '✗ Invalid format' };
  })();

  // Update Beneficiary & Period
  const { writeContract, data: txHash, error: writeError, isPending: isTxPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // Use a simpler success check
  useEffect(() => {
    if (txHash && !isConfirming && !writeError) {
      // Small delay to allow chain to propagate before refetching
      const timer = setTimeout(() => {
        refetchInfo();
        refetchStatus();
        refetchTokens();
        setIsUpdatingBen(false);
        setIsUpdatingPeriod(false);
        setNewBeneficiaryInput('');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [txHash, isConfirming, writeError, refetchInfo, refetchStatus, refetchTokens]);

  const { signTypedDataAsync } = useSignTypedData();

  const sendHeartbeat = useCallback(async () => {
    if (!address) return;
    setIsPinging(true);
    setHeartbeatStatus('idle');
    setHeartbeatError('');

    try {
      console.log('[Heartbeat] Starting off-chain signature flow...');
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      const nonce = BigInt(Math.floor(Math.random() * 1000000));
      
      const message = {
        message: 'I am alive',
        timestamp,
        nonce,
      };

      console.log('[Heartbeat] Signing payload:', message);

      const signature = await signTypedDataAsync({
        domain: HEARTBEAT_DOMAIN,
        types: HEARTBEAT_TYPES,
        primaryType: 'Heartbeat',
        message: {
          ...message,
          // Ensure bigint is passed if signTypedDataAsync requires it
        },
      });

      console.log('[Heartbeat] Signature obtained:', signature);

      const response = await fetch(`${WATCHTOWER_URL}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message: {
            message: message.message,
            timestamp: timestamp.toString(),
            nonce: nonce.toString(),
          },
          signature,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('[Heartbeat] Watchtower error:', data);
        throw new Error(data.error || 'Failed to record heartbeat');
      }

      console.log('[Heartbeat] Success:', data);
      setHeartbeatStatus('success');
      refetchStatus();
    } catch (err) {
      console.error('[Heartbeat] Catch block triggered:', err);
      setHeartbeatStatus('error');
      setHeartbeatError(formatError(err));
    } finally {
      setIsPinging(false);
    }
  }, [address, signTypedDataAsync, refetchStatus]);

  const handleUpdateBeneficiary = () => {
    if (!resolvedAddress) return;
    writeContract({
      address: CONTRACTS.lazarusSource,
      abi: LazarusSourceABI,
      functionName: 'updateBeneficiary',
      args: [resolvedAddress],
    });
  };

  const handleUpdateInactivityPeriod = (newPeriod: number) => {
    writeContract({
      address: CONTRACTS.lazarusSource,
      abi: LazarusSourceABI,
      functionName: 'updateInactivityPeriod',
      args: [BigInt(newPeriod)],
    });
  };

  if (isDead) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center animate-pulse">
        <span className="text-6xl mb-4 block">💀</span>
        <h2 className="text-2xl font-bold text-red-500 mb-2">Protocol Triggered</h2>
        <p className="text-slate-400">Assets have been evacuated to your beneficiary on-chain.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 💓 Heartbeat Card (Full Width) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Heartbeat & Status</h2>
            <p className="text-slate-400 text-sm">Keep your switch active and monitor status</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
            <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">Time Until Liquidation</p>
            <p className="text-3xl font-bold text-white mb-2">
              {timeRemainingSeconds >= 3600 ? (
                `${Math.floor(timeRemainingDays)}d ${Math.floor(timeRemainingHours)}h`
              ) : (
                `${Math.floor(timeRemainingMinutes)}m ${timeRemainingSeconds % 60}s`
              )}
            </p>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${
                  (timeRemainingSeconds / currentPeriod) > 0.6 ? 'bg-emerald-500' : 
                  (timeRemainingSeconds / currentPeriod) > 0.3 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, (timeRemainingSeconds / currentPeriod) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700 flex flex-col justify-center">
            <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">Protection Status</p>
            <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${timeRemainingSeconds > 86400 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
               <span className={`text-lg font-bold ${timeRemainingSeconds > 86400 ? 'text-emerald-400' : 'text-red-400'}`}>
                {timeRemainingSeconds > 86400 ? 'Active & Secure' : 'Critically Low'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6 p-4 bg-slate-950/30 rounded-xl border border-slate-700/50">
          <div>
            <p className="text-white font-semibold text-sm">Ping Reminder</p>
            <p className="text-slate-500 text-[10px]">Requires wallet confirmation each time.</p>
          </div>
          <button 
            onClick={() => setRemindersEnabled(!remindersEnabled)}
            className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${remindersEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out ${remindersEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        <button
          onClick={sendHeartbeat}
          disabled={isPinging}
          className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-3"
        >
          {isPinging ? 'Check Wallet for Signature...' : '💓 Send Heartbeat Proof'}
        </button>
        {heartbeatStatus === 'success' && <p className="text-emerald-400 text-xs text-center mt-3">✅ Signed proof received by Watchtower</p>}
        {heartbeatStatus === 'error' && <p className="text-red-400 text-xs text-center mt-3 font-medium flex flex-col gap-1">
          <span>✗ {heartbeatError}</span>
          <span className="text-[10px] opacity-70">Check console for detailed logs</span>
        </p>}
      </div>

      {/* ⚙️ Settings & Assets Card (Full Width) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-violet-500/20 shadow-2xl shadow-violet-500/10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Beneficiary & Assets</h2>
            <p className="text-slate-400 text-sm">Manage who receives your protected assets</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Beneficiary Info */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
              <div className="flex justify-between items-start mb-2">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">Active Beneficiary</p>
                {!isUpdatingBen && (
                  <button onClick={() => setIsUpdatingBen(true)} className="text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase transition-colors">Update</button>
                )}
              </div>
              {!isUpdatingBen ? (
                <div className="flex flex-col gap-1">
                  {currentEnsName && <p className="text-violet-400 font-bold text-sm tracking-tight">{currentEnsName}</p>}
                  <p className="text-white font-mono text-xs opacity-80 break-all">{currentBeneficiary as string}</p>
                </div>
              ) : (
                <div className="space-y-3 mt-2">
                  <div>
                    <input
                      type="text"
                      value={newBeneficiaryInput}
                      onChange={(e) => setNewBeneficiaryInput(e.target.value)}
                      placeholder="Address or .eth"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs outline-none focus:border-violet-500"
                    />
                    {validationUI && (
                      <div className="mt-2 text-[10px] flex items-center gap-1">
                        {validationUI.type === 'loading' && <svg className="animate-spin h-3 w-3 text-violet-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                        <span className={validationUI.type === 'success' ? 'text-green-400' : validationUI.type === 'error' ? 'text-red-400' : 'text-violet-400'}>
                          {validationUI.message}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleUpdateBeneficiary} 
                      disabled={!resolvedAddress || isTxPending || isConfirming}
                      className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition-colors"
                    >
                      {isTxPending || isConfirming ? 'Processing...' : 'Save Change'}
                    </button>
                    <button onClick={() => { setIsUpdatingBen(false); setNewBeneficiaryInput(''); }} className="px-3 py-1.5 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px]">Back</button>
                  </div>
                </div>
              )}
            </div>

            {/* Inactivity Period Info */}
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
               <div className="flex justify-between items-start mb-2">
                <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">Inactivity Cooldown</p>
                {!isUpdatingPeriod && (
                  <button onClick={() => setIsUpdatingPeriod(true)} className="text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase transition-colors">Update</button>
                )}
              </div>
              {!isUpdatingPeriod ? (
                <p className="text-white font-bold text-lg">
                  {PERIOD_OPTIONS.find(o => o.value === currentPeriod)?.label || `${currentPeriod}s`}
                </p>
              ) : (
                <div className="space-y-3 mt-2">
                  <select
                    value={currentPeriod}
                    onChange={(e) => handleUpdateInactivityPeriod(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg text-white text-xs px-2 py-2 outline-none focus:border-violet-500"
                  >
                    {PERIOD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button onClick={() => setIsUpdatingPeriod(false)} className="w-full py-1.5 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-[10px] transition-colors">Finished</button>
                </div>
              )}
            </div>
          </div>

          {/* Protected Assets Info */}
          <div className="p-6 bg-slate-950/50 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">Asset Coverage</p>
              <div className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded text-[10px] text-violet-400 font-bold">WETH PROTECTION</div>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-4xl font-bold text-white mb-1">
                  {parseFloat(formatEther(wethAllowance)).toFixed(4)} <span className="text-xl font-normal text-slate-400 ml-1">WETH</span>
                </p>
                <p className="text-xs text-slate-500">
                  Total wallet balance: {parseFloat(formatEther(wethBalance)).toFixed(6)} WETH
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 mb-1">Last Sync (On-Chain)</p>
                <p className="text-xs text-white font-medium">
                  {lastOnChainPing ? new Date(Number(lastOnChainPing) * 1000).toLocaleDateString() : 'Pending Registration'}
                </p>
              </div>
            </div>
          </div>
          
          {(writeError || heartbeatError) && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs text-center font-medium italic">✗ {formatError(writeError || heartbeatError)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
