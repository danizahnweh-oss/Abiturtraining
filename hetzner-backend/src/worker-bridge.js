/**
 * Worker-Bridge: Importiert den modularen Worker-Code direkt.
 *
 * Seit der Modularisierung nutzt src/index.js ES-Module Imports.
 * Node.js 22 löst diese nativ auf — kein convert-worker.js mehr nötig!
 *
 * Falls der Import fehlschlägt (z.B. fehlende Dateien), wird ein
 * Platzhalter-Worker verwendet.
 */

let workerModule;
let gradeHandler = null;

try {
  // Direkt-Import des modularen Worker-Codes
  workerModule = await import('../../src/index.js');
  console.log('Worker-Code geladen (modulare Version)');

  // executeGradeHandler separat importieren (für Queue-Worker)
  const gradingModule = await import('../../src/handlers/grading.js');
  gradeHandler = gradingModule.executeGradeHandler || null;
  if (gradeHandler) {
    console.log('executeGradeHandler geladen');
  }
} catch (err) {
  console.warn('Worker-Code konnte nicht geladen werden:', err.message);
  console.warn('Prüfe ob alle Dateien in src/ vorhanden sind.');

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
            message: 'Worker-Code konnte nicht geladen werden. Prüfe src/ Verzeichnis.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          error: 'Worker-Code nicht geladen. Siehe Fehlermeldung oben.'
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

// Worker-Export aufbereiten
const worker = workerModule.default || workerModule;

export default {
  fetch: worker.fetch,
  scheduled: worker.scheduled,
  queue: worker.queue,
  executeGradeHandler: gradeHandler
};
