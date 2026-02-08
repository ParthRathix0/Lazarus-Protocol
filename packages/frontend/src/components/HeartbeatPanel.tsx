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

export function HeartbeatPanel() {
  const { address } = useAccount();
  const [autoPing, setAutoPing] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [heartbeatError, setHeartbeatError] = useState('');

  // Beneficiary Management State
  const [newBeneficiaryInput, setNewBeneficiaryInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Read current beneficiary
  const { data: currentBeneficiary, refetch: refetchInfo } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'beneficiaries',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

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

  // Update Beneficiary
  const { writeContract, data: updateHash, isPending: isUpdatePending, error: updateError } = useWriteContract();
  const { isLoading: isUpdateConfirming, isSuccess: isUpdateSuccess } = useWaitForTransactionReceipt({
    hash: updateHash,
  });

  useEffect(() => {
    if (isUpdateSuccess) {
      refetchInfo();
      setIsUpdating(false);
      setNewBeneficiaryInput('');
    }
  }, [isUpdateSuccess, refetchInfo]);

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

  // Auto-ping effect
  useEffect(() => {
    if (!autoPing || !address) return;
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoPing, address, sendHeartbeat]);

  const handleUpdateBeneficiary = () => {
    if (!resolvedAddress) return;
    writeContract({
      address: CONTRACTS.lazarusSource,
      abi: LazarusSourceABI,
      functionName: 'updateBeneficiary',
      args: [resolvedAddress],
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
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-3"
          >
            {isPinging ? 'Sending...' : '💓 Send Heartbeat'}
          </button>

          <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-700">
            <div>
              <p className="text-white font-medium text-sm">Auto-Ping</p>
              <p className="text-slate-400 text-xs">Ping every hour via Watchtower</p>
            </div>
            <button
              onClick={() => setAutoPing(!autoPing)}
              className={`w-12 h-6 rounded-full transition-all ${autoPing ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ${autoPing ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          {heartbeatStatus === 'success' && (
            <p className="text-emerald-400 text-sm text-center">✅ Heartbeat sent successfully!</p>
          )}
          {heartbeatStatus === 'error' && (
            <p className="text-red-400 text-sm text-center">✗ {heartbeatError}</p>
          )}
        </div>
      </div>

      {/* Manage Beneficiary Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-violet-500/20 shadow-2xl shadow-violet-500/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Manage Beneficiary</h2>
            <p className="text-slate-400 text-sm">Current recipient of your assets</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">Active Beneficiary</p>
            <p className="text-white font-mono break-all text-sm">{currentBeneficiary as string}</p>
          </div>

          {updateError && (
            <p className="text-red-400 text-xs">Error: {updateError.message}</p>
          )}

          {!isUpdating ? (
            <button
              onClick={() => setIsUpdating(true)}
              className="w-full py-2 text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors"
            >
              Change Beneficiary
            </button>
          ) : (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={newBeneficiaryInput}
                onChange={(e) => setNewBeneficiaryInput(e.target.value)}
                placeholder="New address or .eth"
                className="w-full px-4 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-white text-sm focus:border-violet-500"
              />
              {isEnsLoading && <p className="text-violet-400 text-xs">Resolving ENS...</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateBeneficiary}
                  disabled={!resolvedAddress || isUpdatePending || isUpdateConfirming}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-all"
                >
                  {isUpdatePending || isUpdateConfirming ? 'Updating...' : 'Update'}
                </button>
                <button
                  onClick={() => setIsUpdating(false)}
                  className="px-4 py-3 border border-slate-700 hover:bg-slate-800 text-slate-400 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
