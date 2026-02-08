'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useEnsAddress, useChainId, useReadContract } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { CONTRACTS } from '@/config/wagmi';
import { LazarusSourceABI } from '@/config/abis';
import { normalize } from 'viem/ens';
import { formatError } from '@/utils/error';

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

// Validate ETH address - must be exactly 42 chars (0x + 40 hex)
function getAddressValidationError(addr: string): string | undefined {
  if (!addr) return undefined;
  if (!addr.startsWith('0x')) return 'Address must start with 0x';
  if (addr.length < 42) return 'Address too short (must be 42 characters)';
  if (addr.length > 42) return 'Address too long (must be 42 characters)';
  
  const hexPart = addr.slice(2);
  if (!/^[a-fA-F0-9]{40}$/.test(hexPart)) {
    return 'Invalid characters (must be 0-9 and a-f)';
  }
  
  return undefined;
}

interface RegistrationFormProps {
  onSuccess?: () => void;
}

export function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [beneficiaryInput, setBeneficiaryInput] = useState('');
  const [inactivityPeriod, setInactivityPeriod] = useState(604800); // 7 days in seconds

  const isWrongChain = isConnected && chainId !== sepolia.id;

  // Check input type
  const isAddressAttempt = beneficiaryInput.startsWith('0x');
  const isENSAttempt = beneficiaryInput.includes('.') && !isAddressAttempt;
  
  // ENS resolution - use mainnet for ENS
  const normalizedName = safeNormalize(beneficiaryInput);
  const { data: ensAddress, isLoading: isEnsLoading, isError: isEnsError } = useEnsAddress({
    name: normalizedName,
    chainId: mainnet.id,
    query: { enabled: isENSAttempt && !!normalizedName },
  });

  // Contract write
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Trigger onSuccess callback when transaction is successful
  useEffect(() => {
    if (isSuccess && onSuccess) {
      onSuccess();
    }
  }, [isSuccess, onSuccess]);

  // Resolve beneficiary address
  const addressError = isAddressAttempt ? getAddressValidationError(beneficiaryInput) : undefined;
  
  const resolvedAddress: `0x${string}` | null = (() => {
    if (isAddressAttempt && !addressError) {
      return beneficiaryInput as `0x${string}`;
    }
    if (isENSAttempt && ensAddress) {
      return ensAddress;
    }
    return null;
  })();

  // Determine validation display state
  const validationUI = (() => {
    if (!beneficiaryInput) return null;

    if (isAddressAttempt) {
      if (addressError) {
        return { type: 'error', message: `✗ ${addressError}` };
      }
      return { type: 'success', message: `✓ Valid address format` };
    }

    if (isENSAttempt) {
      if (isEnsLoading) return { type: 'loading', message: 'Resolving ENS...' };
      if (ensAddress) {
        if (ensAddress.toLowerCase() === address?.toLowerCase()) {
          return { type: 'error', message: '✗ You cannot be your own beneficiary' };
        }
        return { type: 'success', message: `✓ Resolved to ${ensAddress.slice(0, 6)}...${ensAddress.slice(-4)}` };
      }
      
      // If we are here, it's either an error or not found
      if (isEnsError) {
        console.error('ENS resolution error for:', normalizedName);
        return { type: 'error', message: '✗ ENS resolution error (Check console)' };
      }
      if (!isEnsLoading && !ensAddress) {
        return { type: 'error', message: '✗ ENS name not found' };
      }
    }

    // Direct address self-check
    if (isAddressAttempt && !addressError && beneficiaryInput.toLowerCase() === address?.toLowerCase()) {
      return { type: 'error', message: '✗ You cannot be your own beneficiary' };
    }

    if (beneficiaryInput.length > 0 && !isAddressAttempt && !isENSAttempt) {
      return { type: 'error', message: '✗ Enter a valid 0x address or ENS name (.eth)' };
    }

    return null;
  })();

  // Double check registration status directly in this component
  const { data: userInfo, isLoading: isStatusLoading, isError: isStatusError } = useReadContract({
    address: CONTRACTS.lazarusSource,
    abi: LazarusSourceABI,
    functionName: 'getUserInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const isAlreadyRegistered = Boolean(userInfo?.[0]);
  const isSelfRegistration = resolvedAddress?.toLowerCase() === address?.toLowerCase();

  const handleRegister = () => {
    if (!resolvedAddress || !address) return;
    
    if (isSelfRegistration) {
      console.error('Registration failed: Cannot register yourself as beneficiary');
      return;
    }

    if (isAlreadyRegistered) {
      console.error('Registration failed: Already registered');
      return;
    }

    writeContract({
      address: CONTRACTS.lazarusSource,
      abi: LazarusSourceABI,
      functionName: 'register',
      args: [resolvedAddress, BigInt(inactivityPeriod)],
    });
  };

  const canRegister = Boolean(
    isConnected && 
    resolvedAddress && 
    !isPending && 
    !isConfirming && 
    !isWrongChain && 
    !isAlreadyRegistered &&
    !isSelfRegistration &&
    !isStatusLoading && // Ensure we know status before allowing register
    !isStatusError // Disable if we cannot verify status (prevents false negatives)
  );

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
        {isWrongChain && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4 text-center">
            <p className="text-amber-400 text-sm font-medium">Please switch to Sepolia Network to register</p>
          </div>
        )}

        {isAlreadyRegistered && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4 text-center">
            <p className="text-amber-400 text-sm font-medium">⚠️ You are already registered with a beneficiary</p>
          </div>
        )}

        {isSelfRegistration && !isAlreadyRegistered && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-center">
            <p className="text-red-400 text-sm font-medium">✗ You cannot set yourself as your own beneficiary</p>
          </div>
        )}

        {isStatusError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-center">
            <p className="text-red-400 text-sm font-medium">⚠️ Failed to verify registration status. Check your connection.</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Beneficiary Address or ENS Name
          </label>
          <input
            type="text"
            value={beneficiaryInput}
            onChange={(e) => setBeneficiaryInput(e.target.value)}
            placeholder="0x... or vitalik.eth"
            className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all outline-none"
          />
          
          {validationUI && (
            <div className="mt-2 text-sm flex items-center gap-2">
              {validationUI.type === 'loading' && (
                <svg className="animate-spin h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <span className={
                validationUI.type === 'success' ? 'text-green-400' :
                validationUI.type === 'error' ? 'text-red-400' :
                'text-violet-400'
              }>
                {validationUI.message}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Inactivity Period (Cooldown)
          </label>
          <select
            value={inactivityPeriod}
            onChange={(e) => setInactivityPeriod(Number(e.target.value))}
            className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all appearance-none cursor-pointer outline-none"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900">
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            If you don&apos;t heartbeat within this time, your switch will trigger.
          </p>
        </div>

        {writeError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{formatError(writeError)}</p>
          </div>
        )}

        {(hash) && (
          <div className="mt-4 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-violet-300 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Transaction submitted
            </div>
            <a 
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 text-sm font-medium hover:text-violet-300 underline underline-offset-4"
            >
              View on Etherscan
            </a>
          </div>
        )}

        {isSuccess && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-green-400 text-sm">🎉 Registration successful! Your Dead Man&apos;s Switch is now active. The dashboard will update shortly.</p>
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={!canRegister}
          className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 mt-4"
        >
          {isPending ? 'Confirming in Wallet...' : isConfirming ? 'Processing...' : 'Register Beneficiary'}
        </button>
      </div>
    </div>
  );
}
