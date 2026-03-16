#!/usr/bin/env node
/**
 * Worker-Konvertierung — NICHT MEHR NÖTIG
 *
 * Seit der Modularisierung von src/index.js nutzt der Code
 * ES-Module Imports, die Node.js 22 nativ auflösen kann.
 *
 * Die worker-bridge.js importiert jetzt direkt aus ../../src/index.js.
 * Dieses Script bleibt nur als Referenz erhalten.
 *
 * Falls du trotzdem eine gebündelte Version brauchst,
 * kannst du dieses Script weiterhin ausführen.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../../src/index.js');

console.log('=== Worker-Konvertierung ===');
console.log('');
console.log('HINWEIS: Seit der Modularisierung ist dieses Script nicht mehr nötig.');
console.log('Die worker-bridge.js importiert jetzt direkt aus src/index.js.');
console.log('');
console.log(`Quelle: ${SOURCE}`);

if (!existsSync(SOURCE)) {
  console.error('FEHLER: src/index.js nicht gefunden!');
  process.exit(1);
}

// Prüfe ob die neue modulare Version vorhanden ist
const code = readFileSync(SOURCE, 'utf-8');
if (code.includes("import {") && code.includes("from './")) {
  console.log('✓ Modulare Version erkannt — keine Konvertierung nötig.');
  console.log('  Die worker-bridge.js importiert direkt aus src/index.js.');
  console.log('  Starte den Server einfach mit: npm start');
} else {
  console.log('⚠ Alte Monolith-Version erkannt.');
  console.log('  Bitte aktualisiere src/index.js auf die modulare Version.');
}
