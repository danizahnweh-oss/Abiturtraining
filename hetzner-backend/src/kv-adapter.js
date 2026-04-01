/**
 * KV-Kompatibilitäts-Adapter für PostgreSQL
 *
 * Emuliert die Cloudflare KV API (get/put/delete) mit einer
 * PostgreSQL-Tabelle als Backend.
 *
 * Erstellt die Tabelle automatisch beim ersten Zugriff.
 */

import { getPool } from './db-adapter.js';

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

/**
 * Erstellt ein Objekt das die Cloudflare KV API nachbildet:
 * kv.get(key), kv.put(key, value), kv.delete(key)
 */
export function createKVAdapter() {
  return {
    async get(key) {
      await ensureTable();
      const pool = getPool();
      const { rows } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
      return rows.length > 0 ? rows[0].value : null;
    },

    async put(key, value) {
      await ensureTable();
      const pool = getPool();
      await pool.query(
        `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    },

    async delete(key) {
      await ensureTable();
      const pool = getPool();
      await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
    }
  };
}

export default { createKVAdapter };
