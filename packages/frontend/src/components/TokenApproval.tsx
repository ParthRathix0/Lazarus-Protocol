'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS } from '@/config/wagmi';
import { ERC20ABI } from '@/config/abis';
import { formatError } from '@/utils/error';

export function TokenApproval() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');

  // Read current allowance
  const { data: currentAllowance, refetch } = useReadContract({
    address: CONTRACTS.weth,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.lazarusSource] : undefined,
    query: { enabled: !!address },
  });

  // Read balance
  const { data: balance } = useReadContract({
    address: CONTRACTS.weth,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Refetch allowance after successful approval
  if (isSuccess) {
    refetch();
  }

  const handleApprove = () => {
    if (!amount) return;

    writeContract({
      address: CONTRACTS.weth,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [CONTRACTS.lazarusSource, parseEther(amount)],
    });
  };

  const handleMaxApproval = () => {
    writeContract({
      address: CONTRACTS.weth,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [CONTRACTS.lazarusSource, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    });
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-amber-500/20 shadow-2xl shadow-amber-500/10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Token Approval</h2>
          <p className="text-slate-400 text-sm">Allow Lazarus to protect your tokens</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Current Status */}
        <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Current Approval</span>
            <span className="text-white font-mono">
              {currentAllowance ? parseFloat(formatEther(currentAllowance)).toFixed(4) : '0'} WETH
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-slate-400">Your Balance</span>
            <span className="text-white font-mono">
              {balance ? parseFloat(formatEther(balance)).toFixed(4) : '0'} WETH
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Amount to Approve (WETH)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
            />
            <button
              onClick={() => setAmount(balance ? formatEther(balance) : '0')}
              className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all"
            >
              MAX
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{formatError(error)}</p>
          </div>
        )}

        {isSuccess && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-green-400 text-sm">✅ Approval successful!</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={!amount || isPending || isConfirming}
            className="flex-1 py-4 px-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200"
          >
            {isPending || isConfirming ? 'Processing...' : 'Approve Amount'}
          </button>
          <button
            onClick={handleMaxApproval}
            disabled={isPending || isConfirming}
            className="py-4 px-6 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200"
          >
            Unlimited
          </button>
        </div>
      </div>
    </div>
  );
}
