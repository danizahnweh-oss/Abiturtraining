/**
 * Worker-Bridge: Macht den originalen Cloudflare Worker Code
 * auf Node.js lauffähig.
 *
 * ANLEITUNG:
 * 1. Kopiere den gesamten Inhalt von src/index.js (Original-Worker)
 *    nach src/worker-original.js
 * 2. Ersetze "export default {" am Ende durch "const workerHandlers = {"
 * 3. Füge am Ende hinzu: "export default workerHandlers;"
 * 4. Exportiere executeGradeHandler separat: "export { executeGradeHandler };"
 *
 * Alternativ: Nutze das automatische Konvertierungs-Script:
 *   node scripts/convert-worker.js
 *
 * Die Änderungen am Original-Code sind MINIMAL:
 * - "export default {" → "const workerHandlers = {"
 * - Am Ende: "export default workerHandlers;"
 * - "export { executeGradeHandler };" hinzufügen
 * - Zeile mit "const RATE_LIMIT_WINDOW" → kein Änderung nötig
 *
 * Alles andere (env.DB, crypto.subtle, fetch, Response, Headers,
 * TextEncoder, btoa/atob) funktioniert in Node.js 22 nativ!
 */

// ============================================================
// SCHRITT 1: Versuche den konvertierten Worker zu laden
// ============================================================

let workerModule;

try {
  workerModule = await import('./worker-original.js');
  console.log('Worker-Code geladen (worker-original.js)');
} catch (err) {
  console.warn('worker-original.js nicht gefunden – nutze Platzhalter');
  console.warn('Führe "node scripts/convert-worker.js" aus um den Worker zu konvertieren.');

  // Platzhalter-Implementation für Tests
  workerModule = {
    default: {
      async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);

        if (request.method === 'OPTIONS') {
          return new Response(null, {
            headers: {
              'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
              'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token, X-Teacher-Token, X-Teacher-Auth-Token',
            }
          });
        }

        if (pathname === '/api/health') {
          return new Response(JSON.stringify({
            status: 'ok',
            mode: 'platzhalter',
            message: 'Worker-Code noch nicht konvertiert. Führe node scripts/convert-worker.js aus.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          error: 'Worker-Code nicht geladen. Siehe hetzner-backend/README.md'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      },

      async scheduled(event, env, ctx) {
        console.log('Cron: Platzhalter – Worker-Code nicht geladen');
      },

      async queue(batch, env) {
        console.log('Queue: Platzhalter – Worker-Code nicht geladen');
      }
    }
  };
}

// Den Worker-Export aufbereiten
const worker = workerModule.default || workerModule;

// executeGradeHandler exportieren (falls vorhanden)
const executeGradeHandler = workerModule.executeGradeHandler || null;

export default {
  fetch: worker.fetch,
  scheduled: worker.scheduled,
  queue: worker.queue,
  executeGradeHandler
};
