// server/infra/db.ts - PostgreSQL connection with an explicit TLS policy
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { resolveDatabaseSslConfig } from "./databaseSsl";

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  throw new Error("DATABASE_URL is not set. Ensure the database is provisioned.");
}

const isProd = process.env.NODE_ENV === "production";
const ssl = resolveDatabaseSslConfig({
  nodeEnv: process.env.NODE_ENV,
  databaseSsl: process.env.DATABASE_SSL,
});

// Production keeps the historical managed-database TLS default. Environments
// that intentionally use a non-TLS PostgreSQL endpoint must declare
// DATABASE_SSL=disable explicitly; invalid values fail during boot.
const pool = new Pool({
  connectionString: connStr,
  ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // 15s — Neon can take time to wake from suspend
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Set statement_timeout on every new connection so no query can hang indefinitely.
// Critical for cold managed DB wakeup: if the DB accepts the TCP connection but never
// responds to a query, this ensures the query errors out after 15s rather than
// blocking the entire startup sequence.
pool.on('connect', (client) => {
  client.query('SET statement_timeout = 15000; SET lock_timeout = 10000;').catch((err) => {
    console.warn('⚠️ [db] Could not set statement_timeout:', err.message);
  });
});

// Handle pool errors gracefully without crashing
pool.on('error', (err) => {
  console.error('❌ Unexpected pool error (non-fatal):', err.message);
});

// Log pool stats in development
if (!isProd) {
  setInterval(() => {
    console.log('📊 Pool stats:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    });
  }, 300000); // Every 5 minutes
}

export const dbPool = pool;
export const db = drizzle(pool, { schema });

// Sanity check function for boot-time verification
export async function pingDb(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1 as ok");
    return result.rows?.[0]?.ok === 1;
  } catch (error) {
    console.error('❌ DB ping failed:', error instanceof Error ? error.message : error);
    return false;
  }
}
