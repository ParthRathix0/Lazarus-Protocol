'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi'; // Added useChainId
import { WATCHTOWER_URL } from '@/config/wagmi';

const HEARTBEAT_TYPES = {
  Heartbeat: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

export function HeartbeatPanel() {
  const { address } = useAccount();
  const chainId = useChainId(); // FIX: Dynamically get the current chain ID
  
  // FIX: Dynamic domain based on connected chain
  const heartbeatDomain = useMemo(() => ({
    name: 'Lazarus Protocol',
    version: '1',
    chainId: BigInt(chainId),
  }), [chainId]);

  const [reminderEnabled, setReminderEnabled] = useState(false); // Renamed from autoPing for clarity
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const { signTypedDataAsync } = useSignTypedData();

  const sendHeartbeat = useCallback(async () => {
    if (!address) return;

    setIsPinging(true);
    setStatus('idle');

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
        domain: heartbeatDomain,
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
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsPinging(false);
    }
  }, [address, signTypedDataAsync, heartbeatDomain]);

  // Reminder effect
  useEffect(() => {
    if (!reminderEnabled || !address) return;

    // Ping immediately when enabled
    // Note: This will trigger a wallet popup
    if (!isPinging) {
        sendHeartbeat();
    }

    // Set up interval (every hour)
    const interval = setInterval(() => {
        if (!isPinging) sendHeartbeat();
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [reminderEnabled, address, sendHeartbeat, isPinging]);

  return (
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
        {/* Manual Ping Button */}
        <button
          onClick={sendHeartbeat}
          disabled={isPinging}
          className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-3"
        >
          {isPinging ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Check Wallet...
            </>
          ) : (
            <>
              <span className="text-2xl">💓</span>
              Send Heartbeat Proof
            </>
          )}
        </button>

        {/* Reminder Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-700">
          <div>
            <p className="text-white font-medium">Ping Reminder</p>
            <p className="text-slate-400 text-xs">
                Prompts for signature every hour.<br/>
                <span className="text-amber-500/80">Requires wallet confirmation.</span>
            </p>
          </div>
          <button
            onClick={() => setReminderEnabled(!reminderEnabled)}
            className={`w-14 h-8 rounded-full transition-all duration-200 ${
              reminderEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                reminderEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Status Messages */}
        {status === 'success' && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-emerald-400 font-medium">Heartbeat Verified!</p>
              <p className="text-slate-400 text-sm">
                Last ping: {lastPing?.toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-sm">{errorMessage}</p>
          </div>
        )}

        {reminderEnabled && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-violet-300 text-sm">
              Reminders active. Next prompt in ~1 hour.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
