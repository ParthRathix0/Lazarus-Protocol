'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignTypedData, useReadContract, useWriteContract, useWaitForTransactionReceipt, useEnsAddress } from 'wagmi';
import { WATCHTOWER_URL, CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI } from '@/config/abis';
import { mainnet } from 'wagmi/chains';
import { normalize } from 'viem/ens';

// EIP-712 Domain for Yellow Network Heartbeat
const HEARTBEAT_DOMAIN = {
  name: 'Lazarus Protocol',
  version: '1',
  chainId: BigInt(11155111), // Sepolia
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

export function HeartbeatPanel() {
  const { address } = useAccount();
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [heartbeatError, setHeartbeatError] = useState('');

  // Settings state
  const [newBeneficiaryInput, setNewBeneficiaryInput] = useState('');
  const [isUpdatingBen, setIsUpdatingBen] = useState(false);
  const [isUpdatingPeriod, setIsUpdatingPeriod] = useState(false);

  // Read user info (to get current period and beneficiary)
  const { data: userInfo, refetch: refetchInfo } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const currentBeneficiary = userInfo?.[1];
  const currentPeriod = Number(userInfo?.[3] || 604800);

  // ENS resolution for updates
  const isENSAttempt = newBeneficiaryInput.includes('.') && !newBeneficiaryInput.startsWith('0x');
  const normalizedName = (() => {
    try { return isENSAttempt ? normalize(newBeneficiaryInput) : undefined; } catch { return undefined; }
  })();

  const { data: ensAddress, isLoading: isEnsLoading } = useEnsAddress({
    name: normalizedName,
    chainId: mainnet.id,
    query: { enabled: !!normalizedName },
  });

  const resolvedAddress = isENSAttempt ? ensAddress : (newBeneficiaryInput.startsWith('0x') ? newBeneficiaryInput as `0x${string}` : undefined);

  // Update Beneficiary & Period
  const { writeContract, data: txHash, isPending: isTxPending, error: writeError } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isTxSuccess) {
      refetchInfo();
      setIsUpdatingBen(false);
      setIsUpdatingPeriod(false);
      setNewBeneficiaryInput('');
    }
  }, [isTxSuccess, refetchInfo]);

  const { signTypedDataAsync } = useSignTypedData();

  const sendHeartbeat = useCallback(async () => {
    if (!address) return;

    setIsPinging(true);
    setHeartbeatStatus('idle');

    try {
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      const nonce = BigInt(Math.floor(Math.random() * 1000000));

      const message = {
        message: 'I am alive',
        timestamp,
        nonce,
      };

      // Sign the message
      const signature = await signTypedDataAsync({
        domain: HEARTBEAT_DOMAIN,
        types: HEARTBEAT_TYPES,
        primaryType: 'Heartbeat',
        message,
      });

      // Send to watchtower
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

      if (!response.ok) {
        throw new Error('Failed to send heartbeat');
      }

      setLastPing(new Date());
      setHeartbeatStatus('success');
    } catch (err) {
      setHeartbeatStatus('error');
      setHeartbeatError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsPinging(false);
    }
  }, [address, signTypedDataAsync]);

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

  return (
    <div className="space-y-8">
      {/* Heartbeat Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Heartbeat</h2>
            <p className="text-slate-400 text-sm">Prove you&apos;re still alive</p>
          </div>
        </div>

        <div className="space-y-6">
          <button
            onClick={sendHeartbeat}
            disabled={isPinging}
            className="w-full py-4 px-6 bg-gradient-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-3"
          >
            {isPinging ? 'Sending...' : '💓 Send Heartbeat'}
          </button>

          <p className="text-slate-500 text-xs text-center px-4 italic">
            Your heartbeat is sent to the off-chain Watchtower.
          </p>

          {heartbeatStatus === 'success' && (
            <p className="text-emerald-400 text-sm text-center">✅ Heartbeat sent successfully!</p>
          )}
          {heartbeatStatus === 'error' && (
            <p className="text-red-400 text-sm text-center">✗ {heartbeatError}</p>
          )}
        </div>
      </div>

      {/* Settings Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-violet-500/20 shadow-2xl shadow-violet-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Settings</h2>
            <p className="text-slate-400 text-sm">Manage your beneficiary and cooldown</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Beneficiary Setting */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
            <div className="flex justify-between items-start mb-2">
              <p className="text-slate-500 text-xs">Active Beneficiary</p>
              {!isUpdatingBen && (
                <button onClick={() => setIsUpdatingBen(true)} className="text-xs text-violet-400 hover:text-violet-300">Change</button>
              )}
            </div>
            {!isUpdatingBen ? (
              <p className="text-white font-mono break-all text-sm">{currentBeneficiary as string}</p>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newBeneficiaryInput}
                  onChange={(e) => setNewBeneficiaryInput(e.target.value)}
                  placeholder="New address or .eth"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={handleUpdateBeneficiary} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold">Confirm</button>
                  <button onClick={() => setIsUpdatingBen(false)} className="px-3 py-2 border border-slate-700 text-slate-400 rounded-lg text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Cooldown Setting */}
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
            <div className="flex justify-between items-start mb-2">
              <p className="text-slate-500 text-xs">Inactivity Cooldown</p>
              {!isUpdatingPeriod && (
                <button onClick={() => setIsUpdatingPeriod(true)} className="text-xs text-violet-400 hover:text-violet-300">Change</button>
              )}
            </div>
            {!isUpdatingPeriod ? (
              <p className="text-white font-bold">{PERIOD_OPTIONS.find(o => o.value === currentPeriod)?.label || `${currentPeriod}s`}</p>
            ) : (
              <div className="space-y-3">
                <select
                  value={currentPeriod}
                  onChange={(e) => handleUpdateInactivityPeriod(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:border-violet-500 outline-none"
                >
                  {PERIOD_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button onClick={() => setIsUpdatingPeriod(false)} className="w-full py-2 border border-slate-700 text-slate-400 rounded-lg text-xs">Done</button>
              </div>
            )}
          </div>
          
          {writeError && <p className="text-red-400 text-xs mt-2">{writeError.message}</p>}
        </div>
      </div>
    </div>
  );
}
