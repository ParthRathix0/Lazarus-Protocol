import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { loadConfig, createClients, LazarusSourceABI } from './config.js';
import { getHeartbeatStore } from './database.js';
import { verifyYellowSignature, type HeartbeatMessage } from './yellowSignature.js';
import { runLiquidationCheck } from './liquidator.js';
import type { Address } from 'viem';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load configuration
const config = loadConfig();
const { publicClient, walletClient } = createClients(config);
const store = getHeartbeatStore();

// Create Express app
const app = express();

app.use(cors());
app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /heartbeat
 * Accept a signed heartbeat message from a user
 * 
 * Body:
 * {
 *   "address": "0x...",
 *   "message": { "message": "I am alive", "timestamp": "...", "nonce": "..." },
 *   "signature": "0x..."
 * }
 */
app.post('/heartbeat', async (req, res) => {
  try {
    const { address, message, signature } = req.body;

    // Validate request body
    if (!address || !message || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: address, message, signature',
      });
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        error: 'Invalid address format',
      });
    }

    // Parse message
    const heartbeatMessage: HeartbeatMessage = {
      message: message.message || 'I am alive',
      timestamp: BigInt(message.timestamp),
      nonce: BigInt(message.nonce),
    };

    // Verify the signature
    const verificationResult = await verifyYellowSignature(
      heartbeatMessage,
      signature as `0x${string}`,
      address as Address,
      config.sourceChainId
    );

    if (!verificationResult.valid) {
      return res.status(401).json({
        error: 'Invalid signature',
        details: verificationResult.error,
      });
    }

    // Record the heartbeat in local database
    // We fetch the inactivity period from the record or chain if not provided
    let inactivityPeriod = 604800; // Default 7 days
    const existingRecord = store.getHeartbeat(address);
    if (existingRecord) {
      inactivityPeriod = existingRecord.inactivityPeriod;
    } else {
      // Fetch from chain once if new user
      try {
        const [, , , period] = await publicClient.readContract({
          address: config.lazarusSourceAddress,
          abi: LazarusSourceABI,
          functionName: 'getUserInfo',
          args: [address as Address],
        });
        inactivityPeriod = Number(period);
      } catch (e) {
        console.warn(`Could not fetch period for ${address}, using default`);
      }
    }

    const record = store.recordHeartbeat(address, signature, inactivityPeriod);

    console.log(`[${new Date().toISOString()}] Heartbeat recorded for ${address}`);

    return res.json({
      success: true,
      lastSeen: record.lastSeen,
      message: 'Heartbeat recorded successfully',
    });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /status/:address
 * Get the heartbeat status for a specific address
 */
app.get('/status/:address', (req, res) => {
  const { address } = req.params;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      error: 'Invalid address format',
    });
  }

  const record = store.getHeartbeat(address);

  if (!record) {
    return res.status(404).json({
      error: 'No heartbeat record found for this address',
    });
  }

  const now = Date.now();
  const deadline = record.lastSeen + (record.inactivityPeriod * 1000);
  const timeRemaining = Math.max(0, deadline - now);

  return res.json({
    address: record.userAddress,
    lastSeen: record.lastSeen,
    lastSeenISO: new Date(record.lastSeen).toISOString(),
    inactivityPeriod: record.inactivityPeriod,
    deadline,
    deadlineISO: new Date(deadline).toISOString(),
    timeRemainingMs: timeRemaining,
    timeRemainingDays: timeRemaining / (24 * 60 * 60 * 1000),
    isAtRisk: timeRemaining < (record.inactivityPeriod * 1000) / 3, // At risk if less than 1/3 time left
  });
});

/**
 * GET /users
 * List all tracked users (admin endpoint)
 */
app.get('/users', (_req, res) => {
  const users = store.getAllUsers();
  return res.json({
    count: users.length,
    users: users.map(u => ({
      address: u.userAddress,
      lastSeen: u.lastSeen,
      lastSeenISO: new Date(u.lastSeen).toISOString(),
    })),
  });
});

/**
 * POST /liquidation/check
 * Manually trigger a liquidation check (admin endpoint)
 */
app.post('/liquidation/check', async (_req, res) => {
  try {
    console.log('Manual liquidation check triggered');
    const results = await runLiquidationCheck(publicClient, walletClient, config);
    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error during manual liquidation check:', error);
    return res.status(500).json({
      error: 'Liquidation check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Schedule liquidation check every hour
cron.schedule('0 * * * *', async () => {
  try {
    await runLiquidationCheck(publicClient, walletClient, config);
  } catch (error) {
    console.error('Scheduled liquidation check failed:', error);
  }
});

// Start the server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🗼 Watchtower server running on port ${PORT}`);
  console.log(`📡 Listening for heartbeats...`);
  console.log(`⏰ Liquidation checks scheduled every hour`);

  // Start watching for events
  console.log(`👀 Watching for Registered and InactivityPeriodUpdated events...`);
  
  publicClient.watchContractEvent({
    address: config.lazarusSourceAddress,
    abi: LazarusSourceABI,
    eventName: 'Registered',
    onLogs: (logs) => {
      for (const log of logs) {
        const { user, beneficiary, inactivityPeriod } = log.args;
        if (user && inactivityPeriod) {
          console.log(`[Event] User ${user} registered with period ${inactivityPeriod}s`);
          // Note: we don't have a signature yet, so we use a dummy one or wait for first heartbeat
          // Better: just ensure recordHeartbeat is called eventually.
          // For now, if user is new, we record a "zero" heartbeat just to start tracking
          const existing = store.getHeartbeat(user);
          if (!existing) {
            store.recordHeartbeat(user, '0x-pending-first-heartbeat', Number(inactivityPeriod));
          }
        }
      }
    }
  });

  publicClient.watchContractEvent({
    address: config.lazarusSourceAddress,
    abi: LazarusSourceABI,
    eventName: 'InactivityPeriodUpdated',
    onLogs: (logs) => {
      for (const log of logs) {
        const { user, newPeriod } = log.args;
        if (user && newPeriod) {
          console.log(`[Event] User ${user} updated period to ${newPeriod}s`);
          const existing = store.getHeartbeat(user);
          if (existing) {
            store.recordHeartbeat(user, existing.signature, Number(newPeriod));
          }
        }
      }
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  store.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  store.close();
  process.exit(0);
});
