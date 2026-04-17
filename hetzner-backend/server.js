/**
 * myAbiFlow Backend Server – Hetzner Edition
 */

import './src/crypto-polyfill.js';
import express from 'express';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { initDB, closeDB } from './src/db-adapter.js';
import { initQueues, startQueueWorker, closeQueues } from './src/queue-adapter.js';
import { createKVAdapter } from './src/kv-adapter.js';

dotenv.config();

const db = initDB(process.env.DATABASE_URL);
const GRADING_QUEUE = initQueues(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const env = {
  DB: db,
  RESULTS_KV: createKVAdapter(),
  GRADING_QUEUE: GRADING_QUEUE,
  GRADING_DLQ: { send: async () => {} },
  ACCESS_PASSWORD: process.env.ACCESS_PASSWORD,
  TEACHER_PASSWORD: process.env.TEACHER_PASSWORD,
  TEACHER_AUTH_SECRET: process.env.TEACHER_AUTH_SECRET,
  TEACHER_REGISTER_SECRET: process.env.TEACHER_REGISTER_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  IDEOGRAM_API_KEY: process.env.IDEOGRAM_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_6MONTHS: process.env.STRIPE_PRICE_6MONTHS,
  STRIPE_PRICE_12MONTHS: process.env.STRIPE_PRICE_12MONTHS,
  STRIPE_PRICE_24MONTHS: process.env.STRIPE_PRICE_24MONTHS,
  STRIPE_PRICE_ABITUR: process.env.STRIPE_PRICE_ABITUR,
  WOLFRAM_APP_ID: process.env.WOLFRAM_APP_ID,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'https://myabiflow.de',
  ALLOWED_ORIGIN_FOS: process.env.ALLOWED_ORIGIN_FOS || '',
};

import workerModule from './src/worker-bridge.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Raw Body für Stripe Webhook Signaturverifizierung speichern
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.originalUrl === '/api/stripe/webhook') {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.text({ limit: '10mb' }));
app.set('trust proxy', 1);

// ===== BRIDGE: Express Request → Worker fetch() =====
async function bridgeToWorker(req, res) {
  try {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    const clientIP = req.ip || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown';
    headers.set('CF-Connecting-IP', clientIP);
    const requestInit = { method: req.method, headers };
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      // Stripe Webhook braucht den exakten Raw Body für Signaturverifizierung
      requestInit.body = req.rawBody || JSON.stringify(req.body);
    }
    const request = new Request(url, requestInit);
    const workerEnv = { ...env, _origin: req.headers.origin || '' };
    const response = await workerModule.fetch(request, workerEnv, {
      waitUntil: (promise) => { promise.catch(err => console.error('waitUntil Fehler:', err.message)); }
    });
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

// Schullizenz-Check: Korrigiert subscription_status bei deaktivierten Schullizenzen
async function checkSchoolLicense(studentPlan, classGroup) {
  if (studentPlan !== 'school' || !classGroup) return null;
  const cp = await db.prepare(
    "SELECT free_access FROM class_passwords WHERE label = ? AND active = 1"
  ).bind(classGroup).first();
  const freeAccess = cp?.free_access === 1;
  if (!freeAccess) return 'none'; // Schullizenz deaktiviert
  return null; // Schullizenz aktiv
}

// check-student: Subscription-Status korrigieren
app.post('/api/check-student', async (req, res, next) => {
  // Zuerst Worker aufrufen
  const origSend = res.send.bind(res);
  res.send = async function(body) {
    try {
      const data = JSON.parse(body);
      if (data.success) {
        const nameLower = (req.body.student_name || '').trim().toLowerCase();
        const student = await db.prepare(
          "SELECT subscription_plan, class_group FROM students WHERE name_lower = ?"
        ).bind(nameLower).first();
        if (student) {
          if (data.subscription_status === 'active') {
            // Schullizenz deaktiviert? → Status auf "none"
            const override = await checkSchoolLicense(student.subscription_plan, student.class_group);
            if (override) {
              data.subscription_status = override;
              data.free_access = false;
              return origSend(JSON.stringify(data));
            }
          } else if (student.class_group) {
            // class_group mit free_access → Status auf "active"
            const cp = await db.prepare(
              "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
            ).bind(student.class_group).first();
            if (cp) {
              data.subscription_status = 'active';
              data.free_access = true;
              return origSend(JSON.stringify(data));
            }
          }
        }
      }
    } catch(e) { /* JSON parse fehler → durchlassen */ }
    return origSend(body);
  };
  next();
});

// subscription-status: Korrigieren bei deaktivierten Schullizenzen
app.post('/api/stripe/subscription-status', async (req, res, next) => {
  const origSend = res.send.bind(res);
  res.send = async function(body) {
    try {
      const data = JSON.parse(body);
      if (data.status === 'active' && data.is_school_license) {
        // Schullizenz deaktiviert?
        const sub = await db.prepare(
          "SELECT school_license_code FROM subscriptions WHERE student_id = ? AND school_license_code IS NOT NULL LIMIT 1"
        ).bind(String(req.body.student_id)).first();
        if (sub?.school_license_code) {
          const cp = await db.prepare(
            "SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER(?) AND active = 1 AND free_access = 1"
          ).bind(sub.school_license_code).first();
          if (!cp) {
            data.status = 'none';
            data.is_school_license = false;
            return origSend(JSON.stringify(data));
          }
        }
      } else if (data.status !== 'active') {
        // class_group mit free_access → Status auf "active"
        const student = await db.prepare(
          "SELECT class_group FROM students WHERE id = ?"
        ).bind(String(req.body.student_id)).first();
        if (student?.class_group) {
          const cp = await db.prepare(
            "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
          ).bind(student.class_group).first();
          if (cp) {
            data.status = 'active';
            data.is_school_license = true;
            return origSend(JSON.stringify(data));
          }
        }
      }
    } catch(e) { /* durchlassen */ }
    return origSend(body);
  };
  next();
});

// students (Dashboard): class_group-basierte Schüler als "active"/"school" anzeigen
app.post('/api/students', async (req, res, next) => {
  const origSend = res.send.bind(res);
  res.send = async function(body) {
    try {
      const data = JSON.parse(body);
      if (data.success && data.students) {
        const { results: freeLabels } = await db.prepare(
          "SELECT label FROM class_passwords WHERE active = 1 AND free_access = 1"
        ).all();
        const freeSet = new Set((freeLabels || []).map(r => r.label));
        if (freeSet.size > 0) {
          data.students = data.students.map(s => {
            if (s.class_group && freeSet.has(s.class_group) && s.subscription_status !== 'active') {
              s.subscription_status = 'active';
              s.subscription_plan = 'school';
            }
            return s;
          });
        }
        return origSend(JSON.stringify(data));
      }
    } catch(e) { /* durchlassen */ }
    return origSend(body);
  };
  next();
});

// generate/grade: Subscription-Check erzwingen
app.post(/^\/api\/(fos-)?(generate|grade)/, async (req, res, next) => {
  // Lehrer-Requests durchlassen
  if (req.headers['x-teacher-auth-token']) return next();

  const studentName = req.body.student_name || '';
  const headerName = req.headers['x-student-name'];
  const name = studentName || (headerName ? decodeURIComponent(headerName) : '');

  if (!name) return next(); // Kein Name → Worker entscheidet

  const nameLower = name.trim().toLowerCase();
  const student = await db.prepare(
    "SELECT id, subscription_status, subscription_plan, class_group, trial_end FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();

  if (!student) return next(); // Unbekannt → durchlassen

  // Aktives Abo prüfen
  if (student.subscription_status === 'active') {
    const sub = await db.prepare(
      "SELECT current_period_end, school_license_code FROM subscriptions WHERE student_id = $1 AND status = 'active' LIMIT 1"
    ).bind(String(student.id)).first();
    if (sub) {
      if (sub.school_license_code) {
        const cp = await db.prepare(
          "SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER(?) AND active = 1 AND free_access = 1"
        ).bind(sub.school_license_code).first();
        if (cp) return next(); // Schullizenz aktiv → durchlassen
        // Schullizenz deaktiviert → blockieren
        return res.status(403).json({ error: 'Kein aktives Abo. Bitte schließe ein Abo ab.', requires_subscription: true });
      } else if (sub.current_period_end && new Date(sub.current_period_end) > new Date()) {
        return next(); // Normales Abo gültig
      }
    }
  }

  // Schullizenz via class_group (für Schüler ohne subscriptions-Eintrag)
  if (student.class_group) {
    const cpFallback = await db.prepare(
      "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
    ).bind(student.class_group).first();
    if (cpFallback) return next(); // Schullizenz über class_group aktiv
  }

  // Trial prüfen
  if (student.subscription_status === 'trialing' && student.trial_end) {
    if (new Date(student.trial_end) > new Date()) return next();
  }

  // Fachschafts-Lizenzen prüfen
  const slResult = await db.prepare(`
    SELECT 1 FROM student_subject_licenses ssl
    JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
    WHERE ssl.student_id = $1 AND sl.active = 1
      AND (sl.expires_at IS NULL OR sl.expires_at > $2)
    LIMIT 1
  `).bind(String(student.id), new Date().toISOString()).first();
  if (slResult) return next();

  // Kein Zugang
  return res.status(403).json({ error: 'Kein aktives Abo. Bitte schließe ein Abo ab.', requires_subscription: true });
});

app.all('/api/{*path}', bridgeToWorker);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (workerModule.executeGradeHandler) {
  startQueueWorker(workerModule.executeGradeHandler, env);
} else {
  console.warn('executeGradeHandler nicht gefunden – Queue Worker nicht gestartet');
}

cron.schedule('0 7 * * *', async () => {
  console.log('Cron: Starte tägliche Jobs...');
  try {
    if (workerModule.scheduled) {
      await workerModule.scheduled(
        { cron: '0 7 * * *', scheduledTime: Date.now() },
        env,
        { waitUntil: (promise) => { promise.catch(err => console.error('Cron waitUntil Fehler:', err.message)); } }
      );
    }
    console.log('Cron: Tägliche Jobs abgeschlossen');
  } catch (err) {
    console.error('Cron-Fehler:', err.message);
  }
});

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

async function shutdown(signal) {
  console.log(`\n${signal} empfangen – fahre Server herunter...`);
  server.close(async () => {
    await closeQueues();
    await closeDB();
    console.log('Server sauber beendet.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Shutdown-Timeout – erzwinge Beendigung');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
