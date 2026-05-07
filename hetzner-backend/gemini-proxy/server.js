/**
 * Gemini WebSocket-Proxy – Hetzner Edition
 *
 * Ersetzt den Cloudflare Gemini-Proxy Worker + Durable Objects.
 * Session-State wird in Redis gespeichert (statt DO Storage).
 * WebSocket-Proxy: Client ↔ Server ↔ Gemini Live API
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import express from 'express';
import Redis from 'ioredis';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols, request) {
    return selectWebSocketProtocol(protocols, request);
  }
});
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

const PORT = process.env.GEMINI_PROXY_PORT || 3001;
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://myabiflow.de';

// Session-Konfiguration (wie Durable Object)
const SESSION_MAX_DURATION_MS = 60 * 60 * 1000;  // 1 Stunde
const TRANSCRIPT_PERSIST_INTERVAL = 30_000;        // 30 Sekunden
const MAX_TRANSCRIPT_CHARS = 15_000;
const SESSION_CREATE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const SESSION_CREATE_RATE_LIMIT_MAX = 5;

const sessionCreateRateLimit = new Map();

app.use(express.json());

// ============================================================
// CORS
// ============================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token',
  };
}

app.options('/{*path}', (req, res) => {
  res.set(corsHeaders()).status(204).end();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  // /health ist öffentlich (für Backend-Healthchecks und Uptime-Monitoring),
  // muss vor dem Origin-Check durchgelassen werden.
  if (req.path === '/health') {
    return next();
  }

  if (req.headers.origin !== ALLOWED_ORIGIN) {
    return res.status(403).send('Forbidden');
  }

  return next();
});

function getAccessTokenFromRequest(req) {
  const headerToken = req.headers['x-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return {
      token: headerToken.trim(),
      selectedProtocol: null,
    };
  }

  const protocolHeader = req.headers['sec-websocket-protocol'];
  if (typeof protocolHeader !== 'string') {
    return { token: null, selectedProtocol: null };
  }

  const protocols = protocolHeader
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const bearerProtocol = protocols.find((protocol) => protocol.startsWith('bearer.'));
  if (!bearerProtocol) {
    return { token: null, selectedProtocol: null };
  }

  return {
    token: bearerProtocol.slice('bearer.'.length),
    selectedProtocol: bearerProtocol,
  };
}

function hasValidAccessToken(req) {
  const { token, selectedProtocol } = getAccessTokenFromRequest(req);
  if (typeof token !== 'string' || token.length < 16) {
    return null;
  }

  return { token, selectedProtocol };
}

function selectWebSocketProtocol(protocols, request) {
  if (request.selectedProtocol && protocols.has(request.selectedProtocol)) {
    return request.selectedProtocol;
  }

  return false;
}

function isSessionCreateRateLimited(studentId) {
  const now = Date.now();
  const existing = sessionCreateRateLimit.get(studentId) || [];
  const recentAttempts = existing.filter((timestamp) => now - timestamp < SESSION_CREATE_RATE_LIMIT_WINDOW_MS);

  if (recentAttempts.length >= SESSION_CREATE_RATE_LIMIT_MAX) {
    sessionCreateRateLimit.set(studentId, recentAttempts);
    return true;
  }

  recentAttempts.push(now);
  sessionCreateRateLimit.set(studentId, recentAttempts);
  return false;
}

// ============================================================
// SESSION MANAGEMENT (ersetzt Durable Objects)
// ============================================================

// Subscription-Check direkt per DB (subject = gewähltes Fach im Kolloquiumstrainer)
async function checkStudentAccess(studentId, subject) {
  if (!studentId) return false;
  try {
    // 1. Schüler laden
    const { rows: [student] } = await pool.query(
      'SELECT id, subscription_status, subscription_plan, class_group, trial_end FROM students WHERE id = $1',
      [studentId]
    );
    if (!student) return false;

    // 2. Aktives Abo prüfen
    if (student.subscription_status === 'active') {
      const { rows: [sub] } = await pool.query(
        "SELECT current_period_end, school_license_code FROM subscriptions WHERE student_id = $1 AND status = 'active' LIMIT 1",
        [String(student.id)]
      );
      if (sub) {
        if (sub.school_license_code) {
          const { rows: [cp] } = await pool.query(
            'SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER($1) AND active = 1 AND free_access = 1',
            [sub.school_license_code]
          );
          if (cp) return true;
        } else if (sub.current_period_end && new Date(sub.current_period_end) > new Date()) {
          return true;
        }
      }
    }

    // 3. class_group mit free_access
    if (student.class_group) {
      const { rows: [cp] } = await pool.query(
        'SELECT 1 FROM class_passwords WHERE label = $1 AND active = 1 AND free_access = 1',
        [student.class_group]
      );
      if (cp) return true;
    }

    // 4. Trial prüfen
    if (student.subscription_status === 'trialing' && student.trial_end) {
      if (new Date(student.trial_end) > new Date()) return true;
    }

    // 5. Fachschafts-Lizenzen prüfen (nur für das gewählte Fach)
    if (subject) {
      const { rows: [sl] } = await pool.query(
        `SELECT 1 FROM student_subject_licenses ssl
         JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
         WHERE ssl.student_id = $1 AND sl.subject = $2 AND sl.active = 1
           AND (sl.expires_at IS NULL OR sl.expires_at > $3)
         LIMIT 1`,
        [String(student.id), subject, new Date().toISOString()]
      );
      if (sl) return true;
    }

    return false;
  } catch (err) {
    console.error('Subscription-Check Fehler:', err.message);
    return false;
  }
}

// Neue Session erstellen
app.post('/session/create', async (req, res) => {
  try {
    const accessToken = req.headers['x-access-token'];
    if (typeof accessToken !== 'string' || accessToken.trim().length < 16) {
      return res.set(corsHeaders()).status(401).json({ error: 'Unauthorized' });
    }
    // TODO: vollwertiger Token-Verify gegen myabiflow-api

    const config = req.body || {};

    // Subscription-Check: student_id muss mitgeschickt werden
    const studentId = config.student_id;
    if (!studentId) {
      return res.set(corsHeaders()).status(403).json({
        error: 'Kein Zugang. Bitte melde dich an.',
        requires_subscription: true,
      });
    }

    if (isSessionCreateRateLimited(studentId)) {
      return res.set(corsHeaders()).status(429).json({
        error: 'Too Many Requests, bitte spater erneut versuchen',
      });
    }

    const hasAccess = await checkStudentAccess(studentId, config.subject);
    if (!hasAccess) {
      return res.set(corsHeaders()).status(403).json({
        error: 'Kein aktives Abo. Bitte schließe ein Abo ab.',
        requires_subscription: true,
      });
    }

    const sessionId = crypto.randomUUID();
    const session = {
      studentId,
      config,
      transcript: [],
      reconnectCount: 0,
      createdAt: new Date().toISOString()
    };

    // In Redis speichern mit 1h TTL (wie DO Alarm)
    await redis.set(
      `session:${sessionId}`,
      JSON.stringify(session),
      'EX', Math.floor(SESSION_MAX_DURATION_MS / 1000)
    );

    res.set(corsHeaders()).json({ sessionId });
  } catch (err) {
    console.error('Session Create Fehler:', err.message);
    res.set(corsHeaders()).status(500).json({ error: err.message });
  }
});

// Session-Status abfragen
app.get('/session/:id/status', async (req, res) => {
  try {
    const data = await redis.get(`session:${req.params.id}`);
    if (!data) {
      return res.set(corsHeaders()).status(404).json({ error: 'Session not found' });
    }
    const session = JSON.parse(data);
    res.set(corsHeaders()).json({
      status: 'active',
      reconnectCount: session.reconnectCount,
      createdAt: session.createdAt,
      transcriptLength: session.transcript.length
    });
  } catch (err) {
    res.set(corsHeaders()).status(500).json({ error: err.message });
  }
});

// Transkript abrufen
app.get('/session/:id/transcript', async (req, res) => {
  try {
    const data = await redis.get(`session:${req.params.id}`);
    if (!data) {
      return res.set(corsHeaders()).status(404).json({ error: 'Session not found' });
    }
    const session = JSON.parse(data);
    res.set(corsHeaders()).json({ transcript: session.transcript });
  } catch (err) {
    res.set(corsHeaders()).status(500).json({ error: err.message });
  }
});

// ============================================================
// WEBSOCKET PROXY (ersetzt Durable Object WebSocket)
// ============================================================

server.on('upgrade', async (request, socket, head) => {
  if (request.headers.origin !== ALLOWED_ORIGIN) {
    socket.destroy();
    return;
  }

  const accessTokenData = hasValidAccessToken(request);
  if (!accessTokenData) {
    socket.destroy();
    return;
  }

  request.selectedProtocol = accessTokenData.selectedProtocol;

  const url = new URL(request.url, `http://${request.headers.host}`);

  // Session-basiertes WebSocket: /session/{id}/ws
  const sessionMatch = url.pathname.match(/^\/session\/([^/]+)\/ws$/);

  // Direktes WebSocket-Proxy (ohne Session)
  const directWs = request.headers.upgrade?.toLowerCase() === 'websocket' && !sessionMatch;

  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const rawData = await redis.get(`session:${sessionId}`);
    if (!rawData) {
      socket.destroy();
      return;
    }

    const session = JSON.parse(rawData);
    const hasAccess = await checkStudentAccess(
      session.studentId || session.config?.student_id,
      session.config?.subject
    );
    if (!hasAccess) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleSessionWebSocket(ws, sessionId, url);
    });
  } else if (directWs) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleDirectWebSocket(ws, url);
    });
  } else {
    socket.destroy();
  }
});

/**
 * Session-basiertes WebSocket (Kolloquiumstrainer)
 * Entspricht dem Durable Object WebSocket-Handler
 */
async function handleSessionWebSocket(clientWs, sessionId, url) {
  console.log(`WebSocket: Session ${sessionId} verbunden`);

  // Session aus Redis laden
  const rawData = await redis.get(`session:${sessionId}`);
  if (!rawData) {
    clientWs.close(4004, 'Session not found');
    return;
  }

  const session = JSON.parse(rawData);
  session.reconnectCount = (session.reconnectCount || 0) + 1;

  // Gemini WebSocket URL bauen
  const model = session.config?.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
  const geminiUrl = `wss://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

  let upstream;
  try {
    upstream = new WebSocket(geminiUrl);
  } catch (err) {
    console.error('Gemini WebSocket Verbindungsfehler:', err.message);
    clientWs.close(1011, 'Upstream connection failed');
    return;
  }

  let transcriptTimer = null;
  let pendingTranscript = [...session.transcript];

  // Upstream (Gemini) ist bereit
  upstream.on('open', () => {
    console.log(`WebSocket: Gemini verbunden für Session ${sessionId}`);

    // Reconnect-Info an Client senden
    if (session.reconnectCount > 1) {
      clientWs.send(JSON.stringify({
        type: 'reconnect',
        reconnectCount: session.reconnectCount,
        transcriptLength: pendingTranscript.length
      }));
    }

    // Transkript periodisch in Redis speichern
    transcriptTimer = setInterval(async () => {
      try {
        const currentData = await redis.get(`session:${sessionId}`);
        if (currentData) {
          const s = JSON.parse(currentData);
          s.transcript = pendingTranscript;
          s.reconnectCount = session.reconnectCount;
          await redis.set(`session:${sessionId}`, JSON.stringify(s),
            'EX', Math.floor(SESSION_MAX_DURATION_MS / 1000));
        }
      } catch (err) {
        console.error('Transkript-Persist Fehler:', err.message);
      }
    }, TRANSCRIPT_PERSIST_INTERVAL);
  });

  // Client → Gemini
  clientWs.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      try {
        upstream.send(data);
      } catch (err) {
        console.error('Client→Gemini Sendefehler:', err.message);
      }
    }
  });

  // Gemini → Client
  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        clientWs.send(data);
      } catch (err) {
        console.error('Gemini→Client Sendefehler:', err.message);
      }
    }

    // Transkript extrahieren
    try {
      const msg = JSON.parse(data.toString());
      extractTranscript(msg, pendingTranscript);
    } catch (e) {
      // Nicht-JSON Nachrichten ignorieren
    }
  });

  // Cleanup-Funktion
  const cleanup = async () => {
    if (transcriptTimer) clearInterval(transcriptTimer);

    // Finales Transkript in Redis speichern
    try {
      const currentData = await redis.get(`session:${sessionId}`);
      if (currentData) {
        const s = JSON.parse(currentData);
        s.transcript = pendingTranscript;
        await redis.set(`session:${sessionId}`, JSON.stringify(s),
          'EX', Math.floor(SESSION_MAX_DURATION_MS / 1000));
      }
    } catch (err) {
      console.error('Finales Transkript-Speichern fehlgeschlagen:', err.message);
    }

    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    console.log(`WebSocket: Session ${sessionId} beendet`);
  };

  clientWs.on('close', cleanup);
  clientWs.on('error', (err) => {
    console.error(`Client WebSocket Fehler (${sessionId}):`, err.message);
    cleanup();
  });
  upstream.on('close', (code, reason) => {
    console.log(`Gemini WebSocket geschlossen (${sessionId}): ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1000, reason?.toString() || 'upstream closed');
    }
  });
  upstream.on('error', (err) => {
    console.error(`Gemini WebSocket Fehler (${sessionId}):`, err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, 'upstream error');
    }
  });
}

/**
 * Direktes WebSocket-Proxy (ohne Session-State)
 * Für einfache bidirektionale Kommunikation
 */
async function handleDirectWebSocket(clientWs, url) {
  const targetPath = url.searchParams.get('target') || url.pathname.replace(/^\/ws\/?/, '/');
  const geminiUrl = `wss://${GEMINI_HOST}${targetPath}${targetPath.includes('?') ? '&' : '?'}key=${GEMINI_API_KEY}`;

  let upstream;
  try {
    upstream = new WebSocket(geminiUrl);
  } catch (err) {
    clientWs.close(1011, 'Upstream connection failed');
    return;
  }

  upstream.on('open', () => {
    console.log('Direktes WebSocket-Proxy: Gemini verbunden');
  });

  clientWs.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
  });

  const cleanup = () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };

  clientWs.on('close', cleanup);
  upstream.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1000, reason?.toString() || '');
    }
  });
  clientWs.on('error', () => cleanup());
  upstream.on('error', () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011, 'upstream error');
  });
}

// ============================================================
// HTTP PROXY (REST-Requests an Gemini)
// ============================================================

app.all('/v1beta/{*path}', async (req, res) => {
  try {
    const targetUrl = `https://${GEMINI_HOST}${req.originalUrl}`;
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY };

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.set(corsHeaders()).status(response.status).send(data);
  } catch (err) {
    res.set(corsHeaders()).status(502).json({ error: 'Gemini Proxy Fehler: ' + err.message });
  }
});

// ============================================================
// TRANSKRIPT-EXTRAKTION (aus Gemini-Responses)
// ============================================================

function extractTranscript(msg, transcript) {
  const sc = msg?.serverContent;
  if (!sc) return;

  // Prüfer-Text (Gemini Model Output)
  if (sc.modelTurn?.parts) {
    for (const part of sc.modelTurn.parts) {
      if (part.text) {
        transcript.push({ role: 'pruefer', text: part.text, ts: Date.now() });
      }
    }
  }

  // Prüfling-Text (Input Transkription)
  if (sc.inputTranscription?.text) {
    transcript.push({ role: 'pruefling', text: sc.inputTranscription.text, ts: Date.now() });
  }

  // Transkript-Länge begrenzen
  let totalChars = transcript.reduce((sum, t) => sum + (t.text?.length || 0), 0);
  while (totalChars > MAX_TRANSCRIPT_CHARS && transcript.length > 2) {
    const removed = transcript.shift();
    totalChars -= (removed.text?.length || 0);
  }
}

// Health-Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gemini-proxy', timestamp: new Date().toISOString() });
});

// ============================================================
// SERVER STARTEN
// ============================================================

server.listen(PORT, () => {
  console.log(`Gemini Proxy gestartet auf Port ${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/session/{id}/ws`);
  console.log(`  REST Proxy: http://localhost:${PORT}/v1beta/...`);
});

process.on('SIGTERM', async () => {
  console.log('Gemini Proxy wird beendet...');
  await redis.quit();
  await pool.end();
  server.close();
  process.exit(0);
});

export default app;
