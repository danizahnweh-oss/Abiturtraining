#!/usr/bin/env node
/**
 * Konvertiert den Cloudflare Worker (src/index.js) automatisch
 * für die Nutzung mit Node.js/Express.
 *
 * Änderungen:
 * 1. "export default {" → "const workerHandlers = {"
 * 2. Am Ende: "export default workerHandlers;"
 * 3. executeGradeHandler wird separat exportiert
 *
 * Nutzung:
 *   node scripts/convert-worker.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../../src/index.js');
const TARGET = resolve(__dirname, '../src/worker-original.js');

console.log('=== Worker-Konvertierung ===');
console.log(`Quelle: ${SOURCE}`);
console.log(`Ziel:   ${TARGET}`);

let code = readFileSync(SOURCE, 'utf-8');
const originalLength = code.length;

// 1. "export default {" ersetzen
//    Suche nach dem Pattern am Anfang der Zeile
const exportPattern = /^export\s+default\s+\{/m;
if (exportPattern.test(code)) {
  code = code.replace(exportPattern, 'const workerHandlers = {');
  console.log('✓ "export default {" → "const workerHandlers = {"');
} else {
  console.warn('⚠ "export default {" nicht gefunden – prüfe manuell');
}

// 2. Am Ende die Exports hinzufügen
code += `

// === Node.js Exports (automatisch hinzugefügt) ===
export default workerHandlers;

// executeGradeHandler exportieren (wird vom Queue-Worker genutzt)
if (typeof executeGradeHandler === 'function') {
  workerHandlers.executeGradeHandler = executeGradeHandler;
}
`;

console.log('✓ Exports hinzugefügt');

// 3. Optional: "CF-Connecting-IP" Header-Referenzen prüfen
const cfIPCount = (code.match(/CF-Connecting-IP/g) || []).length;
if (cfIPCount > 0) {
  console.log(`ℹ ${cfIPCount}x "CF-Connecting-IP" gefunden – wird von server.js automatisch gesetzt`);
}

// 4. Schreiben
writeFileSync(TARGET, code, 'utf-8');

console.log(`\n✓ Konvertierung abgeschlossen!`);
console.log(`  Original: ${originalLength.toLocaleString()} Zeichen`);
console.log(`  Konvertiert: ${code.length.toLocaleString()} Zeichen`);
console.log(`  Differenz: +${(code.length - originalLength).toLocaleString()} Zeichen (Exports)`);
console.log(`\nDer Server kann jetzt gestartet werden: npm start`);
