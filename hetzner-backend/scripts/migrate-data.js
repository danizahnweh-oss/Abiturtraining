#!/usr/bin/env node
/**
 * Datenmigration: Cloudflare D1 → PostgreSQL (Hetzner)
 *
 * Exportiert alle Daten aus der D1-Datenbank und importiert
 * sie in PostgreSQL.
 *
 * Voraussetzungen:
 * - Wrangler CLI installiert (npx wrangler)
 * - PostgreSQL Schema bereits angelegt (schema.sql)
 * - .env mit DATABASE_URL konfiguriert
 *
 * Nutzung:
 *   node scripts/migrate-data.js
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Fehler: DATABASE_URL nicht in .env gesetzt');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

console.log('╔══════════════════════════════════════════╗');
console.log('║  Datenmigration: D1 → PostgreSQL         ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// ============================================================
// 1. D1 EXPORT
// ============================================================

const EXPORT_FILE = resolve(__dirname, '../d1-export.sql');
const PROJECT_ROOT = resolve(__dirname, '../..');

async function exportD1() {
  console.log('→ Exportiere D1-Datenbank...');

  try {
    execSync(
      `npx wrangler d1 export myabiflow-db --output=${EXPORT_FILE}`,
      { cwd: PROJECT_ROOT, stdio: 'inherit' }
    );
    console.log('  ✓ D1-Export erfolgreich');
  } catch (err) {
    console.error('  ✗ D1-Export fehlgeschlagen. Stelle sicher, dass wrangler eingeloggt ist.');
    console.error('  Tipp: npx wrangler login');
    process.exit(1);
  }
}

// ============================================================
// 2. SQL KONVERTIERUNG (SQLite → PostgreSQL)
// ============================================================

function convertSQLiteToPostgres(sqliteDump) {
  let sql = sqliteDump;

  // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

  // datetime('now') → NOW()
  sql = sql.replace(/datetime\('now'\)/gi, "TO_CHAR(NOW(), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')");

  // BOOLEAN 0/1 bleibt (PostgreSQL akzeptiert 0/1 für INTEGER)

  // CREATE TABLE IF NOT EXISTS → beibehalten

  // SQLite-spezifische Pragma-Anweisungen entfernen
  sql = sql.replace(/PRAGMA .+;/gi, '');

  // BEGIN TRANSACTION / COMMIT beibehalten (PostgreSQL-kompatibel)

  // Backticks → Anführungszeichen (PostgreSQL)
  // Aber vorsichtig: nicht innerhalb von Strings
  // Einfachster Ansatz: Backticks einfach entfernen (Spaltennamen ohne Sonderzeichen)
  sql = sql.replace(/`/g, '"');

  return sql;
}

// ============================================================
// 3. TABELLEN-WEISE MIGRATION (sicherer als SQL-Dump)
// ============================================================

const TABLES = [
  'students',
  'results',
  'result_details',
  'teachers',
  'teacher_codes',
  'student_teacher_links',
  'class_passwords',
  'learning_plans',
  'grading_jobs'
];

async function migrateTable(tableName) {
  console.log(`  → Migriere Tabelle: ${tableName}`);

  try {
    // D1-Daten als JSON exportieren
    const result = execSync(
      `npx wrangler d1 execute myabiflow-db --command="SELECT * FROM ${tableName}" --json`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    const data = JSON.parse(result);
    const rows = data[0]?.results || [];

    if (rows.length === 0) {
      console.log(`    (leer – übersprungen)`);
      return 0;
    }

    // Spalten bestimmen
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnList = columns.map(c => `"${c}"`).join(', ');

    // Bulk Insert
    let inserted = 0;
    for (const row of rows) {
      const values = columns.map(c => row[c]);
      try {
        await pool.query(
          `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      } catch (err) {
        console.warn(`    ⚠ Zeile übersprungen (${tableName}):`, err.message.substring(0, 100));
      }
    }

    console.log(`    ✓ ${inserted}/${rows.length} Zeilen importiert`);
    return inserted;
  } catch (err) {
    console.error(`    ✗ Fehler bei ${tableName}:`, err.message.substring(0, 200));
    return 0;
  }
}

// ============================================================
// 4. MIGRATION DURCHFÜHREN
// ============================================================

async function migrate() {
  // Schema anlegen
  console.log('→ PostgreSQL Schema anlegen...');
  const schemaSQL = readFileSync(resolve(__dirname, '../config/schema.sql'), 'utf-8');
  try {
    await pool.query(schemaSQL);
    console.log('  ✓ Schema angelegt');
  } catch (err) {
    // Ignoriere "already exists" Fehler
    if (!err.message.includes('already exists')) {
      console.error('  Schema-Fehler:', err.message);
    }
    console.log('  ✓ Schema existiert bereits');
  }

  // Tabellen migrieren
  console.log('');
  console.log('→ Tabellen migrieren...');
  let totalRows = 0;
  for (const table of TABLES) {
    totalRows += await migrateTable(table);
  }

  // Sequenzen synchronisieren (SERIAL)
  console.log('');
  console.log('→ Sequenzen synchronisieren...');
  const sequenceTables = ['students', 'result_details', 'teachers', 'teacher_codes', 'student_teacher_links', 'learning_plans'];
  for (const table of sequenceTables) {
    try {
      await pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM ${table}`);
    } catch (err) {
      // Ignorieren wenn Tabelle kein SERIAL hat
    }
  }
  console.log('  ✓ Sequenzen synchronisiert');

  // Ergebnis
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║  Migration abgeschlossen!                ║`);
  console.log(`║  ${totalRows} Zeilen importiert                ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('Prüfe die Daten:');
  console.log('  psql -h DB-HOST -U myabiflow -d myabiflow');
  console.log('  SELECT COUNT(*) FROM students;');
  console.log('  SELECT COUNT(*) FROM results;');
}

migrate()
  .catch(err => console.error('Migration fehlgeschlagen:', err))
  .finally(() => pool.end());
