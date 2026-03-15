/**
 * myAbiFlow Backend Server – Hetzner Edition
 *
 * Bridge-Layer: Macht den bestehenden Cloudflare Worker Code
 * auf einem normalen Node.js/Express Server lauffähig.
 *
 * Strategie: Statt 15.000 Zeilen neu zu schreiben, wird ein
 * Kompatibilitäts-Layer erstellt, der die Cloudflare-APIs
 * (D1, Queues, crypto.subtle) durch Node.js-Äquivalente ersetzt.
 */

// Crypto-Polyfill MUSS als erstes geladen werden
import './src/crypto-polyfill.js';

import express from 'express';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { initDB, closeDB } from './src/db-adapter.js';
import { initQueues, startQueueWorker, closeQueues } from './src/queue-adapter.js';

dotenv.config();

// ============================================================
// 1. ENV-OBJEKT ERSTELLEN (Kompatibel mit Cloudflare Worker)
// ============================================================

const db = initDB(process.env.DATABASE_URL);
const GRADING_QUEUE = initQueues(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const env = {
  // Datenbank (D1-kompatibel)
  DB: db,

  // Queue (Cloudflare Queue-kompatibel)
  GRADING_QUEUE: GRADING_QUEUE,
  GRADING_DLQ: { send: async () => {} },  // DLQ wird von BullMQ automatisch verwaltet

  // Secrets (aus .env)
  ACCESS_PASSWORD: process.env.ACCESS_PASSWORD,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  IDEOGRAM_API_KEY: process.env.IDEOGRAM_API_KEY,

  // Konfiguration
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'https://myabiflow.de',
  ALLOWED_ORIGIN_FOS: process.env.ALLOWED_ORIGIN_FOS || '',
};

// ============================================================
// 2. WORKER-CODE IMPORTIEREN
// ============================================================

// Der originale Worker-Code wird als ES-Modul importiert.
// Dafür muss src/index.js leicht angepasst werden (siehe worker-bridge.js).
import workerModule from './src/worker-bridge.js';

// ============================================================
// 3. EXPRESS SERVER
// ============================================================

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Body-Parser mit 10MB Limit (wie im Worker)
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Trust Proxy (für Rate Limiting hinter Nginx)
app.set('trust proxy', 1);

// ============================================================
// 4. BRIDGE: Express Request → Worker fetch()
// ============================================================

/**
 * Konvertiert einen Express Request in ein Web API Request-Objekt
 * und ruft den Worker fetch()-Handler auf.
 */
async function bridgeToWorker(req, res) {
  try {
    // Express Request → Web API Request konvertieren
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }

    // IP-Adresse für Rate Limiting (Nginx setzt X-Real-IP)
    const clientIP = req.ip || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown';
    headers.set('CF-Connecting-IP', clientIP);

    const requestInit = {
      method: req.method,
      headers,
    };

    // Body nur bei POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      requestInit.body = JSON.stringify(req.body);
    }

    const request = new Request(url, requestInit);

    // Worker-eigenes env-Objekt mit Origin setzen
    const workerEnv = { ...env, _origin: req.headers.origin || '' };

    // Worker fetch() aufrufen
    const response = await workerModule.fetch(request, workerEnv, {
      // ctx-Objekt (waitUntil wird zu fire-and-forget)
      waitUntil: (promise) => {
        promise.catch(err => console.error('waitUntil Fehler:', err.message));
      }
    });

    // Worker Response → Express Response konvertieren
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.set(key, value);
    }

    const body = await response.text();
    res.send(body);

  } catch (err) {
    console.error('Bridge-Fehler:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
}

// Alle /api/* Routen an den Worker-Bridge weiterleiten
app.all('/api/*', bridgeToWorker);

// Health-Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// 5. QUEUE WORKER STARTEN
// ============================================================

// executeGradeHandler aus dem Worker-Code importieren
if (workerModule.executeGradeHandler) {
  startQueueWorker(workerModule.executeGradeHandler, env);
} else {
  console.warn('executeGradeHandler nicht gefunden – Queue Worker nicht gestartet');
}

// ============================================================
// 6. CRON-JOBS (ersetzt Cloudflare Cron Trigger)
// ============================================================

// Täglich 7:00 UTC (= 8:00/9:00 MEZ/MESZ)
cron.schedule('0 7 * * *', async () => {
  console.log('Cron: Starte tägliche Jobs...');
  try {
    if (workerModule.scheduled) {
      await workerModule.scheduled(
        { cron: '0 7 * * *', scheduledTime: Date.now() },
        env,
        {
          waitUntil: (promise) => {
            promise.catch(err => console.error('Cron waitUntil Fehler:', err.message));
          }
        }
      );
    }
    console.log('Cron: Tägliche Jobs abgeschlossen');
  } catch (err) {
    console.error('Cron-Fehler:', err.message);
  }
});

// ============================================================
// 7. SERVER STARTEN
// ============================================================

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  myAbiFlow Backend – Hetzner Edition     ║
  ║  Port: ${PORT}                              ║
  ║  DB:   PostgreSQL                        ║
  ║  Queue: BullMQ + Redis                   ║
  ║  Cron:  7:00 UTC (Erinnerungen)          ║
  ╚══════════════════════════════════════════╝
  `);
});

// ============================================================
// 8. GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
  console.log(`\n${signal} empfangen – fahre Server herunter...`);

  server.close(async () => {
    await closeQueues();
    await closeDB();
    console.log('Server sauber beendet.');
    process.exit(0);
  });

  // Timeout falls Shutdown hängt
  setTimeout(() => {
    console.error('Shutdown-Timeout – erzwinge Beendigung');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
