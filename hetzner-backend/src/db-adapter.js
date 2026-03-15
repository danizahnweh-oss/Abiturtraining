/**
 * D1-Kompatibilitäts-Adapter für PostgreSQL
 *
 * Macht env.DB.prepare("SELECT * FROM x WHERE id = ?").bind(1).first()
 * transparent mit PostgreSQL nutzbar, sodass der bestehende Worker-Code
 * OHNE Änderungen funktioniert.
 *
 * Unterschiede die automatisch übersetzt werden:
 * - Platzhalter: ? → $1, $2, $3 ...
 * - .first() → einzelne Zeile oder null
 * - .all() → { results: [...], success: true }
 * - .run() → { success: true, meta: { changes: N } }
 */

import pg from 'pg';

let pool = null;

export function initDB(databaseUrl) {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // SSL für Hetzner Managed DB
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL Pool-Fehler:', err.message);
  });

  return createD1Adapter();
}

/**
 * Erstellt ein Objekt das die D1-API nachbildet:
 * db.prepare(sql).bind(...args).first() / .all() / .run()
 */
function createD1Adapter() {
  return {
    prepare(sql) {
      return new D1Statement(sql);
    }
  };
}

class D1Statement {
  constructor(sql) {
    // ? Platzhalter zu $1, $2, $3 ... konvertieren
    this._originalSql = sql;
    this._sql = convertPlaceholders(sql);
    this._params = [];
  }

  bind(...args) {
    this._params = args;
    return this;
  }

  /**
   * Gibt eine einzelne Zeile zurück oder null
   * Entspricht D1's .first()
   */
  async first(column) {
    const { rows } = await pool.query(this._sql, this._params);
    if (rows.length === 0) return null;
    if (column) return rows[0][column];
    return rows[0];
  }

  /**
   * Gibt alle Zeilen zurück im D1-Format: { results: [...], success: true }
   */
  async all() {
    const { rows } = await pool.query(this._sql, this._params);
    return { results: rows, success: true };
  }

  /**
   * Führt ein Statement aus (INSERT, UPDATE, DELETE)
   * Gibt { success: true, meta: { changes: N } } zurück
   */
  async run() {
    const result = await pool.query(this._sql, this._params);
    return {
      success: true,
      meta: {
        changes: result.rowCount || 0,
        last_row_id: null
      }
    };
  }
}

/**
 * Konvertiert ? Platzhalter in $1, $2, $3 ...
 * Ignoriert ? innerhalb von Strings ('...?...')
 */
function convertPlaceholders(sql) {
  let paramIndex = 0;
  let result = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    // String-Erkennung (einfache Anführungszeichen)
    if ((char === "'" || char === '"') && sql[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      result += char;
      continue;
    }

    if (char === '?' && !inString) {
      paramIndex++;
      result += '$' + paramIndex;
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Pool schließen (für graceful shutdown)
 */
export async function closeDB() {
  if (pool) {
    await pool.end();
    console.log('PostgreSQL Pool geschlossen.');
  }
}

/**
 * Pool-Referenz für direkte Queries (z.B. Schema-Migration)
 */
export function getPool() {
  return pool;
}

export default { initDB, closeDB, getPool };
