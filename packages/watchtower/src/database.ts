import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface HeartbeatRecord {
  userAddress: string;
  lastSeen: number;
  signature: string;
  inactivityPeriod: number;
  createdAt: number;
  updatedAt: number;
}

export class HeartbeatStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, '..', 'data', 'heartbeats.db');
    this.db = new Database(dbPath || defaultPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS heartbeats (
        user_address TEXT PRIMARY KEY,
        last_seen INTEGER NOT NULL,
        signature TEXT NOT NULL,
        inactivity_period INTEGER NOT NULL DEFAULT 604800,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen 
      ON heartbeats(last_seen)
    `);
  }

  /**
   * Record a heartbeat for a user
   */
  recordHeartbeat(userAddress: string, signature: string, inactivityPeriod: number): HeartbeatRecord {
    const now = Date.now();
    const normalizedAddress = userAddress.toLowerCase();

    const stmt = this.db.prepare(`
      INSERT INTO heartbeats (user_address, last_seen, signature, inactivity_period, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_address) DO UPDATE SET
        last_seen = excluded.last_seen,
        signature = excluded.signature,
        inactivity_period = excluded.inactivity_period,
        updated_at = excluded.updated_at
    `);

    stmt.run(normalizedAddress, now, signature, inactivityPeriod, now, now);

    return {
      userAddress: normalizedAddress,
      lastSeen: now,
      signature,
      inactivityPeriod,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get heartbeat record for a specific user
   */
  getHeartbeat(userAddress: string): HeartbeatRecord | null {
    const stmt = this.db.prepare(`
      SELECT user_address, last_seen, signature, inactivity_period, created_at, updated_at
      FROM heartbeats
      WHERE user_address = ?
    `);

    const row = stmt.get(userAddress.toLowerCase()) as {
      user_address: string;
      last_seen: number;
      signature: string;
      inactivity_period: number;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      userAddress: row.user_address,
      lastSeen: row.last_seen,
      signature: row.signature,
      inactivityPeriod: row.inactivity_period,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all users who haven't pinged in their specified duration (in ms)
   */
  getInactiveUsers(): HeartbeatRecord[] {
    const now = Date.now();

    // Select users where now - last_seen > inactivity_period (converted to ms)
    const stmt = this.db.prepare(`
      SELECT user_address, last_seen, signature, inactivity_period, created_at, updated_at
      FROM heartbeats
      WHERE ? - last_seen > (inactivity_period * 1000)
    `);

    const rows = stmt.all(now) as Array<{
      user_address: string;
      last_seen: number;
      signature: string;
      inactivity_period: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      userAddress: row.user_address,
      lastSeen: row.last_seen,
      signature: row.signature,
      inactivityPeriod: row.inactivity_period,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Remove a user from the heartbeat tracking (after liquidation)
   */
  removeUser(userAddress: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM heartbeats WHERE user_address = ?
    `);
    stmt.run(userAddress.toLowerCase());
  }

  /**
   * Get all tracked users
   */
  getAllUsers(): HeartbeatRecord[] {
    const stmt = this.db.prepare(`
      SELECT user_address, last_seen, signature, inactivity_period, created_at, updated_at
      FROM heartbeats
    `);

    const rows = stmt.all() as Array<{
      user_address: string;
      last_seen: number;
      signature: string;
      inactivity_period: number;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      userAddress: row.user_address,
      lastSeen: row.last_seen,
      signature: row.signature,
      inactivityPeriod: row.inactivity_period,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance for the application
let storeInstance: HeartbeatStore | null = null;

export function getHeartbeatStore(dbPath?: string): HeartbeatStore {
  if (!storeInstance) {
    storeInstance = new HeartbeatStore(dbPath);
  }
  return storeInstance;
}
