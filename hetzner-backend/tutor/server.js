/**
 * Flowie Tutor Backend – Hetzner Edition
 *
 * Ersetzt den Cloudflare Backend-Tutor Worker.
 * - Cloudflare AI → Hugging Face API (Embeddings)
 * - Cloudflare Vectorize → pgvector (PostgreSQL)
 * - Gemini 2.5 Flash bleibt gleich
 */

import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config({ path: '../.env' });

// Access-Token-Verifikation (HMAC-SHA256, identisch zum Haupt-Backend src/auth.js).
// Verhindert, dass /tutor/query ein offener, kostenloser Gemini-Proxy ist.
function verifyAccessToken(token) {
  try {
    const secret = process.env.ACCESS_TOKEN_SECRET || process.env.ACCESS_PASSWORD;
    if (!secret || !token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [dataB64, sigHex] = parts;
    const data = Buffer.from(dataB64, 'base64').toString('utf8');
    const payload = JSON.parse(data);
    if (!payload.iat || Date.now() - payload.iat > 24 * 60 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    if (expected.length !== sigHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sigHex, 'hex'));
  } catch {
    return false;
  }
}

const app = express();
const PORT = process.env.TUTOR_PORT || 3002;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://myabiflow.de';

app.use(express.json({ limit: '2mb' }));

// PostgreSQL Verbindung
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ============================================================
// CORS
// ============================================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token, X-Ingest-Key',
  };
}

app.options('*', (req, res) => {
  res.set(corsHeaders()).status(204).end();
});

// ============================================================
// GEMINI API (gleich wie im Original)
// ============================================================

async function callGemini(systemPrompt, userMessage, maxTokens = 4000) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini API Fehler (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// EMBEDDING (ersetzt Cloudflare AI)
// ============================================================

/**
 * Generiert Embeddings mit der Hugging Face Inference API.
 * Modell: BAAI/bge-base-en-v1.5 (gleich wie Cloudflare AI)
 */
async function generateEmbedding(text) {
  // Option 1: Hugging Face API (kostenlos, aber Rate-Limited)
  const response = await fetch(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-base-en-v1.5',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optional: HF Token für höhere Limits
        ...(process.env.HF_API_TOKEN ? { 'Authorization': `Bearer ${process.env.HF_API_TOKEN}` } : {})
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding-Fehler (${response.status}): ${err}`);
  }

  const embedding = await response.json();
  // HF gibt ein Array von Arrays zurück für Feature-Extraction
  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
}

// ============================================================
// VECTOR SEARCH (ersetzt Cloudflare Vectorize)
// ============================================================

/**
 * Sucht ähnliche Dokumente mit pgvector (Cosine Similarity)
 */
async function vectorSearch(embedding, topK = 3, subject = null) {
  const vectorStr = `[${embedding.join(',')}]`;

  let query = `
    SELECT id, title, content, subject, metadata,
           1 - (embedding <=> $1::vector) AS score
    FROM tutor_knowledge
  `;
  const params = [vectorStr];

  if (subject) {
    query += ' WHERE subject = $2';
    params.push(subject);
  }

  query += ' ORDER BY embedding <=> $1::vector LIMIT $' + (params.length + 1);
  params.push(topK);

  const { rows } = await pool.query(query, params);
  return rows;
}

// ============================================================
// /query ENDPOINT (Haupt-RAG-Endpoint)
// ============================================================

app.post('/tutor/query', async (req, res) => {
  try {
    // Auth: nur eingeloggte Schüler (gültiges Access-Token) — kein offener Gemini-Proxy.
    if (!verifyAccessToken(req.headers['x-access-token'])) {
      return res.set(corsHeaders()).status(401).json({ error: 'Nicht autorisiert.' });
    }

    const { question, subject, taskContext } = req.body;

    if (!question) {
      return res.set(corsHeaders()).status(400).json({ error: 'question ist erforderlich' });
    }

    // 1. Embedding generieren
    const embedding = await generateEmbedding(question);

    // 2. Ähnliche Dokumente suchen
    const matches = await vectorSearch(embedding, 3, subject);

    // 3. RAG-Kontext aufbauen
    let ragContext = '';
    if (matches.length > 0) {
      ragContext = '\n\nRELEVANTE INFORMATIONEN AUS DEM LEHRPLAN:\n';
      for (const match of matches) {
        ragContext += `\n--- ${match.title || 'Quelle'} (Relevanz: ${(match.score * 100).toFixed(0)}%) ---\n`;
        ragContext += match.content + '\n';
      }
    }

    // 4. Task-Kontext (falls vorhanden)
    let taskInfo = '';
    if (taskContext) {
      taskInfo = `\n\nAKTUELLE AUFGABE DES SCHÜLERS:\n${taskContext}\n`;
    }

    // 5. System-Prompt (Flowie-Charakter)
    const systemPrompt = `Du bist "Flowie", der freundliche KI-Lernassistent von myAbiFlow.
Du hilfst Schülerinnen und Schülern bei der Vorbereitung auf das bayerische Abitur.

WICHTIGE REGELN:
- Antworte IMMER auf Deutsch
- Sei ermutigend und motivierend
- Erkläre Konzepte verständlich, nicht zu akademisch
- Gib KEINE vollständigen Lösungen – leite die Schüler zum eigenständigen Denken an
- Stelle Rückfragen, wenn die Frage unklar ist
- Verweise auf Lehrplan-Inhalte, wenn möglich
- Halte dich an den LehrplanPLUS Bayern (G9)
- Nutze Beispiele aus dem bayerischen Kontext
${taskInfo}${ragContext}`;

    // 6. Gemini aufrufen
    const answer = await callGemini(systemPrompt, question);

    res.set(corsHeaders()).json({
      answer,
      context: matches.map(m => ({
        id: m.id,
        title: m.title,
        score: m.score,
        subject: m.subject
      }))
    });
  } catch (err) {
    console.error('Tutor Query Fehler:', err.message);
    res.set(corsHeaders()).status(500).json({
      error: 'Flowie hat gerade ein technisches Problem. Versuche es in ein paar Sekunden nochmal.'
    });
  }
});

// ============================================================
// /ingest ENDPOINT (Wissen einspeisen)
// ============================================================

app.post('/tutor/ingest', async (req, res) => {
  try {
    // Nur mit Ingest-Secret (server-seitiges Einspeisen). Verhindert RAG-Poisoning.
    if (!process.env.INGEST_KEY || req.headers['x-ingest-key'] !== process.env.INGEST_KEY) {
      return res.set(corsHeaders()).status(401).json({ error: 'Nicht autorisiert.' });
    }

    const { id, text, title, subject, metadata } = req.body;

    if (!text || !id) {
      return res.set(corsHeaders()).status(400).json({ error: 'id und text sind erforderlich' });
    }

    // Embedding generieren
    const embedding = await generateEmbedding(text);
    const vectorStr = `[${embedding.join(',')}]`;

    // In PostgreSQL speichern (UPSERT)
    await pool.query(`
      INSERT INTO tutor_knowledge (id, title, content, subject, metadata, embedding)
      VALUES ($1, $2, $3, $4, $5, $6::vector)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        subject = EXCLUDED.subject,
        metadata = EXCLUDED.metadata,
        embedding = EXCLUDED.embedding
    `, [id, title || '', text, subject || '', JSON.stringify(metadata || {}), vectorStr]);

    res.set(corsHeaders()).json({ success: true, id });
  } catch (err) {
    console.error('Tutor Ingest Fehler:', err.message);
    res.set(corsHeaders()).status(500).json({ error: 'Ingest fehlgeschlagen.' });
  }
});

// Health-Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tutor', timestamp: new Date().toISOString() });
});

// ============================================================
// SERVER STARTEN
// ============================================================

app.listen(PORT, () => {
  console.log(`Flowie Tutor gestartet auf Port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

export default app;
