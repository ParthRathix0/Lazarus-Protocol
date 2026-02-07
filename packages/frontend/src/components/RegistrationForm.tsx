'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useEnsAddress } from 'wagmi';
import { isAddress } from 'viem';
import { CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI } from '@/config/abis';
import { normalize } from 'viem/ens';

// Helper to safely normalize ENS names (avoid crash on partial input like "grandma.")
function safeNormalize(name: string): string | undefined {
  if (!name.includes('.')) return undefined;
  if (name.endsWith('.') || name.startsWith('.')) return undefined;
  
  try {
    return normalize(name);
  } catch {
    return undefined;
  }
}

export function RegistrationForm() {
  const { address, isConnected } = useAccount();
  const [beneficiaryInput, setBeneficiaryInput] = useState('');

  // ENS resolution - only when we have a valid-looking ENS name
  const normalizedName = safeNormalize(beneficiaryInput);
  const { data: ensAddress, isLoading: isEnsLoading } = useEnsAddress({
    name: normalizedName,
  });

  // Contract write
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Helper to check if string is valid eth address (with regex fallback for checksum issues)
  const isValidAddress = (addr: string): boolean => {
    if (isAddress(addr)) return true;
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  // Compute resolved address
  const resolvedAddress: `0x${string}` | null = (() => {
    if (beneficiaryInput && isValidAddress(beneficiaryInput)) {
      return beneficiaryInput as `0x${string}`;
    }
    if (ensAddress) {
      return ensAddress;
    }
    return null;
  })();

  const handleRegister = () => {
    if (!resolvedAddress || !address) return;

    writeContract({
      address: CONTRACTS.lazarusSource,
      abi: LazarusSourceABI,
      functionName: 'register',
      args: [resolvedAddress],
    });
  };

  const canRegister = Boolean(isConnected && resolvedAddress && !isPending && !isConfirming);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-violet-500/20 shadow-2xl shadow-violet-500/10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Register Beneficiary</h2>
          <p className="text-slate-400 text-sm">Set who receives your assets if you go silent</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Beneficiary Address or ENS Name
          </label>
          <input
            type="text"
            value={beneficiaryInput}
            onChange={(e) => setBeneficiaryInput(e.target.value)}
            placeholder="0x... or grandma.eth"
            className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
          />
          
          {isEnsLoading && (
            <p className="mt-2 text-sm text-violet-400 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Resolving ENS...
            </p>
          )}
          
          {resolvedAddress && beneficiaryInput && (
            <p className="mt-2 text-sm text-green-400">
              ✓ {beneficiaryInput.includes('.') ? 'Resolved to: ' : 'Valid address: '}
              {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{error.message}</p>
          </div>
        )}

        {isSuccess && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-green-400 text-sm">🎉 Registration successful! Your Dead Man&apos;s Switch is now active.</p>
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={!canRegister}
          className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
        >
          {isPending ? 'Confirming in Wallet...' : isConfirming ? 'Processing...' : 'Register Beneficiary'}
        </button>
      </div>
    </div>
  );
}
