# Migrationsplan: Cloudflare → Hetzner (Deutschland)

**Stand:** März 2026 | **Verantwortlich:** Daniel Zahnweh
**Ziel:** Alle Nutzerdaten und Backend-Logik auf deutsche Server migrieren
**Zeitrahmen:** ca. 4–6 Wochen bei Teilzeit-Entwicklung

---

## Warum Hetzner?

| Kriterium | Hetzner | IONOS | Cloudflare (aktuell) |
|-----------|---------|-------|----------------------|
| **DSGVO** | Deutsches Unternehmen, RZ in DE | Deutsches Unternehmen | US-Unternehmen (CLOUD Act) |
| **Preis** | CX22 ab 4,50€/M, Managed DB ab 11€/M | Deutlich teurer | Pay-as-you-go (0–5€/M) |
| **Developer Experience** | Exzellent (API, CLI, Terraform) | Mittelmäßig | Exzellent |
| **Managed PostgreSQL** | Ja | Ja (teurer) | Nein (nur D1/SQLite) |
| **Docker/Container** | Ja (Cloud + Apps) | Begrenzt | Nein |
| **Community** | Sehr groß, viele Tutorials | Klein | Sehr groß |

**Empfehlung: Hetzner Cloud, Rechenzentrum Falkenstein oder Nürnberg (Bayern!)**

---

## Aktueller Stand: Was auf Cloudflare läuft

### 3 Worker (Serverless Functions)
1. **Backend API** (`sag-abi-mediation-api`) – 15.000 Zeilen, ~149 API-Endpunkte
2. **Gemini Proxy** (`gemini-proxy`) – WebSocket-Proxy + Durable Objects
3. **Flowie Tutor** (`backend-tutor`) – RAG mit Vectorize + D1

### 2 Datenbanken (D1/SQLite)
1. **myabiflow-db** – 9 Tabellen (Schüler, Ergebnisse, Lehrer, Jobs…)
2. **tutor-db** – Wissensdatenbank für Flowie

### Weitere Cloudflare-Features
- **Queues** – grading-queue + Dead Letter Queue (async Korrekturen)
- **Durable Objects** – ColloquiumSession (WebSocket-Sessions)
- **Vectorize** – Embedding-Index für RAG (tutor-index)
- **Workers AI** – BAAI BGE Embedding-Modell
- **Cron Trigger** – Täglich 7:00 UTC (E-Mail-Erinnerungen)
- **Pages** – Statisches Hosting (HTML, CSS, JS, React-Build)

---

## Ziel-Architektur auf Hetzner

```
                    ┌─────────────────────────────┐
                    │      Bunny CDN (EU)          │
                    │   oder Hetzner Load Balancer  │
                    │      myabiflow.de             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   Hetzner Cloud CX32         │
                    │   Ubuntu 24.04, Nürnberg     │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │   Nginx (Reverse Proxy) │  │
                    │  │   + Static Files         │  │
                    │  │   + SSL (Let's Encrypt)  │  │
                    │  └──────────┬─────────────┘  │
                    │             │                 │
                    │  ┌──────────▼─────────────┐  │
                    │  │   Node.js (PM2)         │  │
                    │  │   ├── Backend API        │  │
                    │  │   ├── Gemini WS-Proxy   │  │
                    │  │   ├── Flowie Tutor       │  │
                    │  │   └── Cron (node-cron)   │  │
                    │  └──────────┬─────────────┘  │
                    │             │                 │
                    │  ┌──────────▼─────────────┐  │
                    │  │   Redis 7               │  │
                    │  │   ├── BullMQ Queues      │  │
                    │  │   ├── Session Store      │  │
                    │  │   └── Rate Limiting      │  │
                    │  └────────────────────────┘  │
                    └──────────────────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Hetzner Managed PostgreSQL   │
                    │  (Nürnberg, automatische      │
                    │   Backups, HA optional)        │
                    └──────────────────────────────┘
```

### Kostenübersicht (monatlich)

| Komponente | Produkt | Kosten/Monat |
|------------|---------|--------------|
| Server | CX32 (4 vCPU, 8 GB RAM, 80 GB SSD) | 7,49€ |
| Datenbank | Managed PostgreSQL CPX11 | 10,99€ |
| Backup | Automatische Snapshots | 1,49€ |
| CDN (optional) | Bunny CDN (EU) | ~1–3€ |
| Domain/DNS | Cloudflare DNS (kostenlos) oder Hetzner DNS | 0€ |
| **Gesamt** | | **~20–23€/Monat** |

---

## Phase 1: Server aufsetzen + Statische Seiten (2–3 Tage)

### 1.1 Hetzner Cloud Server erstellen

1. **Hetzner Cloud Console** → Neues Projekt "myAbiFlow"
2. Server erstellen:
   - **Typ:** CX32 (4 vCPU, 8 GB RAM)
   - **Standort:** Nürnberg (nbg1) oder Falkenstein (fsn1)
   - **Image:** Ubuntu 24.04
   - **SSH Key:** Eigenen Public Key hinterlegen
   - **Firewall:** Ports 22 (SSH), 80 (HTTP), 443 (HTTPS) öffnen

3. **Domain vorbereiten** (NOCH NICHT umstellen):
   - Subdomain `staging.myabiflow.de` → auf Hetzner-IP zeigen
   - Damit kannst du alles testen, bevor du die Haupt-Domain umstellst

### 1.2 Server einrichten

```bash
# Auf dem Server via SSH:

# System aktualisieren
apt update && apt upgrade -y

# Node.js 22 LTS installieren
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# PM2 (Prozess-Manager) installieren
npm install -g pm2

# Redis installieren
apt install -y redis-server
systemctl enable redis-server

# Nginx installieren
apt install -y nginx

# Let's Encrypt (SSL)
apt install -y certbot python3-certbot-nginx

# Projektverzeichnisse anlegen
mkdir -p /var/www/myabiflow        # Statische Dateien
mkdir -p /app/myabiflow-backend    # Backend-Code
```

### 1.3 Nginx konfigurieren

```nginx
# /etc/nginx/sites-available/myabiflow

server {
    listen 443 ssl http2;
    server_name staging.myabiflow.de;  # Später: myabiflow.de

    ssl_certificate /etc/letsencrypt/live/staging.myabiflow.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.myabiflow.de/privkey.pem;

    # Statische Dateien (HTML, CSS, JS, Bilder)
    root /var/www/myabiflow;
    index index.html;

    # API-Requests an Node.js Backend weiterleiten
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;  # Für lange KI-Anfragen
    }

    # WebSocket für Gemini Proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;  # WebSocket Keep-Alive
    }

    # Kolloquiumstrainer Sessions
    location /session/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    # Flowie Tutor
    location /tutor/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Caching für statische Assets
    location ~* \.(css|js|png|jpg|mp4|woff2|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
}

server {
    listen 80;
    server_name staging.myabiflow.de;
    return 301 https://$host$request_uri;
}
```

### 1.4 Deploy-Skript für statische Dateien

```bash
# deploy-static.sh (lokal auf deinem Mac)
#!/bin/bash
set -e

echo "=== Statische Dateien deployen ==="

# 1. Build (wie bisher)
bash build-pages.sh

# 2. Hochladen auf Server
rsync -avz --delete \
  _site/ \
  root@DEINE-HETZNER-IP:/var/www/myabiflow/

echo "=== Deploy fertig! ==="
```

### 1.5 Ergebnis Phase 1

- Statische Seiten laufen auf `staging.myabiflow.de`
- API-Calls gehen noch an Cloudflare Workers (funktioniert, weil CORS)
- Du kannst testen, ob HTML/CSS/JS korrekt dargestellt wird

---

## Phase 2: Datenbank migrieren (3–4 Tage)

### 2.1 Managed PostgreSQL erstellen

1. Hetzner Cloud Console → Datenbanken → Neue Datenbank
2. **Typ:** CPX11 (2 vCPU, 2 GB RAM)
3. **Standort:** Nürnberg (gleich wie Server)
4. **Name:** myabiflow-db
5. **Datenbank-User + Passwort** notieren

### 2.2 Schema von D1/SQLite nach PostgreSQL umschreiben

Die Unterschiede sind gering, aber wichtig:

```sql
-- PostgreSQL Schema: schema.sql

-- Schüler
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_lower TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    level VARCHAR(3) DEFAULT 'gA',
    hidden_subjects TEXT DEFAULT '[]',     -- JSON als Text
    class_group VARCHAR(50),
    email TEXT,
    exam_subjects TEXT DEFAULT '{}',       -- JSON als Text
    reminder_interval INTEGER DEFAULT 0,
    last_reminder_sent TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_students_name_lower ON students(name_lower);

-- Ergebnisse
CREATE TABLE results (
    id TEXT PRIMARY KEY,                   -- UUID
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT,
    course TEXT NOT NULL,
    type TEXT NOT NULL,
    topic TEXT,
    content TEXT,
    language VARCHAR(5) DEFAULT 'de',
    total REAL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_results_student_id ON results(student_id);
CREATE INDEX idx_results_created_at ON results(created_at);

-- Kompetenzprofile
CREATE TABLE result_details (
    id SERIAL PRIMARY KEY,
    result_id TEXT REFERENCES results(id) ON DELETE CASCADE,
    strengths TEXT DEFAULT '[]',
    weaknesses TEXT DEFAULT '[]',
    error_types TEXT DEFAULT '{}',
    afb_scores TEXT DEFAULT '{}',
    missing_topics TEXT DEFAULT '[]'
);

-- Lehrkräfte
CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    salt TEXT,
    hash TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Klassen-Codes
CREATE TABLE teacher_codes (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    label TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Schüler-Lehrer-Zuordnung
CREATE TABLE student_teacher_links (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    subject TEXT,
    code_id INTEGER REFERENCES teacher_codes(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, teacher_id, subject)
);

-- Klassenpasswörter
CREATE TABLE class_passwords (
    id SERIAL PRIMARY KEY,
    class_group VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Lernpläne (gecacht)
CREATE TABLE learning_plans (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    plan_data TEXT,                         -- JSON
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Async Grading Jobs
CREATE TABLE grading_jobs (
    id TEXT PRIMARY KEY,                   -- UUID
    result_id TEXT,
    status VARCHAR(20) DEFAULT 'queued',   -- queued, processing, completed, failed
    endpoint TEXT,
    input_data TEXT,                        -- JSON (bis 10 MB)
    output_data TEXT,                       -- JSON
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tutor-Wissensdatenbank (für Flowie)
CREATE TABLE tutor_knowledge (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    subject TEXT,
    embedding VECTOR(768),                 -- pgvector für RAG
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Wichtige Unterschiede zu D1:**
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `datetime('now')` → `NOW()`
- Keine `ON DELETE CASCADE` Unterstützung in D1 → jetzt möglich
- pgvector Extension für Embeddings (statt Cloudflare Vectorize)

### 2.3 pgvector installieren (für Flowie/RAG)

```sql
-- In PostgreSQL:
CREATE EXTENSION IF NOT EXISTS vector;
```

Hetzner Managed PostgreSQL unterstützt pgvector. Falls nicht: selbst PostgreSQL auf dem VPS installieren und die Extension aktivieren.

### 2.4 Daten von D1 exportieren

```bash
# Lokal auf deinem Mac:

# 1. D1-Daten exportieren (Wrangler CLI)
npx wrangler d1 export myabiflow-db --output=export-main.sql
npx wrangler d1 export tutor-db --output=export-tutor.sql

# 2. SQLite-Dump nach PostgreSQL konvertieren
# Die Hauptunterschiede:
# - AUTOINCREMENT entfernen
# - datetime('now') → NOW()
# - Boolean 0/1 → false/true
# - TEXT für JSON bleibt gleich
```

Alternativ: Ein kleines Node-Skript, das die D1-Daten via API liest und in PostgreSQL schreibt. Das ist sicherer bei großen Datenmengen.

### 2.5 Daten importieren

```bash
# Auf dem Hetzner-Server oder lokal mit psql:
psql -h HETZNER-DB-HOST -U myabiflow -d myabiflow-db -f schema.sql
psql -h HETZNER-DB-HOST -U myabiflow -d myabiflow-db -f export-main-converted.sql
```

---

## Phase 3: Backend API migrieren (1–2 Wochen)

Das ist die größte Phase. Der aktuelle Worker (`src/index.js`, ~15.000 Zeilen) muss auf Node.js/Express umgestellt werden.

### 3.1 Neues Projekt aufsetzen

```bash
# Neues Verzeichnis für den Hetzner-Backend
mkdir -p /app/myabiflow-backend
cd /app/myabiflow-backend
npm init -y

# Dependencies installieren
npm install express cors helmet
npm install pg                      # PostgreSQL Client
npm install bullmq ioredis          # Queue + Redis
npm install node-cron               # Cron-Jobs
npm install dotenv                  # Umgebungsvariablen
npm install ws                      # WebSocket (für Gemini Proxy)
```

### 3.2 Projektstruktur

```
/app/myabiflow-backend/
├── .env                    # Secrets (NICHT committen!)
├── server.js               # Express-Server Einstiegspunkt
├── src/
│   ├── routes/
│   │   ├── auth.js         # Login, Register, Token
│   │   ├── grading.js      # Aufgaben-Korrektur (alle Fächer)
│   │   ├── students.js     # Schülerverwaltung
│   │   ├── teachers.js     # Lehrerverwaltung + Dashboard
│   │   ├── results.js      # Ergebnisse abrufen/löschen
│   │   └── utility.js      # Preferences, Reminders, OCR
│   ├── middleware/
│   │   ├── auth.js         # Token-Verifizierung
│   │   ├── cors.js         # CORS-Handler
│   │   └── rateLimit.js    # Rate Limiting
│   ├── services/
│   │   ├── openai.js       # OpenAI API-Calls
│   │   ├── gemini.js       # Gemini API-Calls
│   │   ├── email.js        # Resend E-Mail
│   │   └── crypto.js       # PBKDF2, HMAC, Token
│   ├── queue/
│   │   ├── grading-worker.js  # BullMQ Consumer
│   │   └── setup.js           # Queue-Konfiguration
│   ├── cron/
│   │   └── reminders.js    # Tägliche E-Mail-Erinnerungen
│   └── db.js               # PostgreSQL-Verbindung
├── ecosystem.config.js     # PM2-Konfiguration
└── package.json
```

### 3.3 Haupt-Umstellungen im Code

#### A) `env.DB.prepare()` → PostgreSQL-Client

```javascript
// VORHER (Cloudflare D1):
const result = await env.DB.prepare(
  'SELECT * FROM students WHERE name_lower = ?'
).bind(name.toLowerCase()).first();

// NACHHER (PostgreSQL mit pg):
const { rows } = await db.query(
  'SELECT * FROM students WHERE name_lower = $1',
  [name.toLowerCase()]
);
const result = rows[0];
```

**Wichtig:** D1 nutzt `?` als Platzhalter, PostgreSQL nutzt `$1, $2, $3...`

Alle `.bind(...).first()` → `.query(...); rows[0]`
Alle `.bind(...).all()` → `.query(...); rows`
Alle `.bind(...).run()` → `.query(...)`

#### B) Worker Export → Express-Server

```javascript
// VORHER (Cloudflare Worker):
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/login') { ... }
  }
}

// NACHHER (Express):
import express from 'express';
const app = express();
app.use(express.json({ limit: '10mb' }));
app.post('/api/login', authController.login);
app.listen(3000);
```

#### C) Cloudflare Queue → BullMQ

```javascript
// VORHER (Cloudflare Queue):
await env.GRADING_QUEUE.send({ jobId, endpoint, inputData });

// NACHHER (BullMQ):
import { Queue } from 'bullmq';
const gradingQueue = new Queue('grading', { connection: redis });
await gradingQueue.add('grade', { jobId, endpoint, inputData }, {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 30 * 24 * 3600 },  // 30 Tage
});
```

```javascript
// Queue Consumer (BullMQ Worker):
import { Worker } from 'bullmq';

const worker = new Worker('grading', async (job) => {
  const { jobId, endpoint, inputData } = job.data;

  // Status auf 'processing' setzen
  await db.query(
    "UPDATE grading_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1",
    [jobId]
  );

  // OpenAI API aufrufen (gleicher Code wie bisher)
  const result = await callOpenAI(inputData);

  // Ergebnis speichern
  await db.query(
    "UPDATE grading_jobs SET status = 'completed', output_data = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(result), jobId]
  );
}, {
  connection: redis,
  concurrency: 1,  // Wie max_batch_size = 1
});

// Dead Letter Queue: BullMQ macht das automatisch nach max attempts
worker.on('failed', (job, err) => {
  if (job.attemptsMade >= 2) {
    console.error(`Job ${job.id} → DLQ: ${err.message}`);
  }
});
```

#### D) Cron Trigger → node-cron

```javascript
// VORHER (Cloudflare):
async scheduled(event, env, ctx) {
  ctx.waitUntil(sendReminderEmails(env));
}

// NACHHER (node-cron):
import cron from 'node-cron';
cron.schedule('0 7 * * *', async () => {
  console.log('Cron: Sende Erinnerungs-E-Mails...');
  await sendReminderEmails();
  await cleanupOldGradingJobs();
});
```

#### E) Crypto API (Web Crypto → Node.js Crypto)

```javascript
// VORHER (Web Crypto in Cloudflare Worker):
const key = await crypto.subtle.importKey('raw', ...);
const signature = await crypto.subtle.sign('HMAC', key, data);

// NACHHER (Node.js crypto):
import crypto from 'node:crypto';
const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
```

**Wichtig:** PBKDF2-Implementierung muss identisch sein, damit bestehende Passwort-Hashes weiterhin funktionieren! Test mit bekanntem Passwort unbedingt durchführen.

#### F) Rate Limiting → Redis-basiert

```javascript
// VORHER (In-Memory Map im Worker):
const rateLimitMap = new Map();

// NACHHER (Redis – überlebt Server-Neustarts):
import Redis from 'ioredis';
const redis = new Redis();

async function checkRateLimit(ip, limit = 25, windowSec = 60) {
  const key = `rate:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count <= limit;
}
```

### 3.4 Umgebungsvariablen (.env)

```env
# /app/myabiflow-backend/.env

# Server
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://myabiflow.de

# Datenbank
DATABASE_URL=postgresql://myabiflow:PASSWORT@HETZNER-DB-HOST:5432/myabiflow-db

# Redis
REDIS_URL=redis://127.0.0.1:6379

# API Keys
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=AI...
GEMINI_API_KEY=AI...
RESEND_API_KEY=re_...
ACCESS_PASSWORD=...

# Sicherheit
TOKEN_SECRET=...          # Für HMAC-SHA256 Tokens
```

### 3.5 PM2-Konfiguration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'myabiflow-api',
      script: 'server.js',
      instances: 1,           // Erstmal 1 Instanz
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      max_memory_restart: '500M',
      error_file: '/var/log/myabiflow/error.log',
      out_file: '/var/log/myabiflow/out.log',
    },
    {
      name: 'myabiflow-gemini-proxy',
      script: 'src/gemini-proxy/server.js',
      instances: 1,
      env: {
        PORT: 3001
      }
    },
    {
      name: 'myabiflow-tutor',
      script: 'src/tutor/server.js',
      instances: 1,
      env: {
        PORT: 3002
      }
    },
    {
      name: 'myabiflow-queue-worker',
      script: 'src/queue/grading-worker.js',
      instances: 1,
    }
  ]
};
```

### 3.6 Empfohlene Migrations-Reihenfolge für die ~149 Endpunkte

Nicht alles auf einmal umschreiben! Schrittweise:

1. **Auth-Endpunkte zuerst** (Login, Register, Token) – 5 Routen
   - Damit kannst du testen, ob PBKDF2-Hashes kompatibel sind
2. **Ergebnis-Endpunkte** (Results CRUD) – 7 Routen
3. **Grading-Endpunkte** (ein Fach zum Testen) – 3 Routen
   - z.B. Englisch Mediation: generate, grade, model-answer
4. **Queue-System** einbauen (BullMQ)
5. **Alle weiteren Fächer** – Die Pattern sind identisch, nur die Prompts unterscheiden sich
6. **Utility-Endpunkte** (Preferences, Reminders, OCR)
7. **Cron-Job** (Erinnerungen)

---

## Phase 4: Gemini WebSocket-Proxy migrieren (3–5 Tage)

### 4.1 Durable Objects → Redis Sessions

```javascript
// /app/myabiflow-backend/src/gemini-proxy/server.js

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import Redis from 'ioredis';

const redis = new Redis();
const server = createServer();
const wss = new WebSocketServer({ noServer: true });

// Session erstellen
app.post('/session/create', async (req, res) => {
  const sessionId = crypto.randomUUID();
  await redis.set(`session:${sessionId}`, JSON.stringify({
    config: req.body,
    transcript: [],
    reconnectCount: 0,
    createdAt: Date.now()
  }), 'EX', 3600);  // 1 Stunde TTL (wie DO Alarm)

  res.json({ sessionId });
});

// WebSocket Upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const match = url.pathname.match(/^\/session\/([^/]+)\/ws$/);

  if (match) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleGeminiProxy(ws, match[1]);
    });
  }
});

async function handleGeminiProxy(clientWs, sessionId) {
  // Session aus Redis laden
  const sessionData = await redis.get(`session:${sessionId}`);
  if (!sessionData) {
    clientWs.close(4004, 'Session not found');
    return;
  }

  const session = JSON.parse(sessionData);

  // Upstream WebSocket zu Gemini öffnen
  const geminiUrl = `wss://generativelanguage.googleapis.com/...`;
  const upstream = new WebSocket(geminiUrl);

  // Bidirektional: Client ↔ Gemini
  clientWs.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    }
  });

  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
    // Transkript in Redis speichern (alle 30s)
    session.transcript.push(JSON.parse(data));
  });

  // Cleanup bei Disconnect
  const cleanup = () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  };

  clientWs.on('close', cleanup);
  upstream.on('close', cleanup);
}

server.listen(3001);
```

### 4.2 Session-Status und Transkript

```javascript
// GET /session/:id/status
app.get('/session/:id/status', async (req, res) => {
  const data = await redis.get(`session:${req.params.id}`);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  const session = JSON.parse(data);
  res.json({ status: 'active', reconnectCount: session.reconnectCount });
});

// GET /session/:id/transcript
app.get('/session/:id/transcript', async (req, res) => {
  const data = await redis.get(`session:${req.params.id}`);
  if (!data) return res.status(404).json({ error: 'Session not found' });
  const session = JSON.parse(data);
  res.json({ transcript: session.transcript });
});
```

**Vorteil gegenüber Durable Objects:** Redis TTL ersetzt den DO-Alarm-Mechanismus automatisch. Sessions werden nach 1 Stunde gelöscht, ohne eigenen Code dafür.

---

## Phase 5: Flowie-Tutor migrieren (2–3 Tage)

### 5.1 Cloudflare AI + Vectorize → pgvector + lokale Embeddings

```javascript
// Embedding-Generierung (ersetzt @cf/baai/bge-base-en-v1.5)
// Option A: Hugging Face Inference API
const response = await fetch(
  'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-base-en-v1.5',
  {
    headers: { Authorization: `Bearer ${HF_TOKEN}` },
    body: JSON.stringify({ inputs: text })
  }
);
const embedding = await response.json();

// Option B: Lokales Embedding mit fastembed (Node.js)
// npm install fastembed
import { FlagEmbedding } from 'fastembed';
const model = await FlagEmbedding.init({ model: 'BAAI/bge-base-en-v1.5' });
const embedding = await model.embed([text]);
```

### 5.2 Vektor-Suche mit pgvector

```sql
-- RAG: Ähnlichste Dokumente finden
SELECT id, title, content,
       1 - (embedding <=> $1::vector) AS similarity
FROM tutor_knowledge
WHERE subject = $2
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

Das ersetzt den `VECTORIZE.query()` Aufruf von Cloudflare.

---

## Phase 6: DNS umstellen + Go Live (1 Tag)

### 6.1 Vorbereitungs-Checkliste

Bevor du die Domain umstellst, prüfe:

- [ ] Alle API-Endpunkte auf staging.myabiflow.de getestet
- [ ] Login (Schüler + Lehrer) funktioniert mit bestehenden Passwörtern
- [ ] Aufgaben generieren + korrigieren funktioniert (mindestens 1 Fach)
- [ ] Kolloquiumstrainer WebSocket funktioniert
- [ ] Flowie-Tutor antwortet korrekt
- [ ] E-Mail-Erinnerungen werden versendet
- [ ] Dashboard für Lehrkräfte zeigt Ergebnisse
- [ ] HTTPS/TLS funktioniert korrekt
- [ ] Rate Limiting greift
- [ ] Service Worker Cache-Version aktualisiert

### 6.2 DNS umstellen

```
# Cloudflare DNS (oder Hetzner DNS):
# A-Record:  myabiflow.de → HETZNER-SERVER-IP
# AAAA:      myabiflow.de → HETZNER-SERVER-IPv6
# CNAME:     www.myabiflow.de → myabiflow.de
```

**Wichtig:** DNS-Propagation dauert bis zu 48 Stunden. Plane die Umstellung für ein Wochenende, wenn wenig Schüler aktiv sind.

### 6.3 Cloudflare als reinen DNS-Proxy beibehalten (Optional)

Du kannst Cloudflare weiterhin als DNS-Provider nutzen (kostenlos), ohne dass Daten dort verarbeitet werden. Einfach den Proxy-Status auf "DNS only" (graue Wolke) stellen. So behältst du die schnelle DNS-Auflösung, aber alle Requests gehen direkt an Hetzner.

### 6.4 Parallelbetrieb (Empfohlen)

1. **Woche 1–2:** Backend auf Hetzner läuft parallel, Frontend zeigt noch auf Cloudflare
2. **Woche 3:** Frontend auf `staging.myabiflow.de` testen mit Pilot-Lehrern
3. **Woche 4:** DNS umstellen, Cloudflare Workers deaktivieren
4. **Woche 5:** Cloudflare Workers + D1 löschen (nach Bestätigung, dass alles läuft)

---

## Phase 7: Frontend anpassen (1 Tag)

### 7.1 API-URL aktualisieren

In `shared.js` die API-URL von Cloudflare Worker auf die eigene Domain umstellen:

```javascript
// VORHER:
const API_BASE = 'https://sag-abi-mediation-api.sanktannagymnasium.workers.dev';

// NACHHER:
const API_BASE = '';  // Gleiche Domain → relative URLs reichen!
// Oder explizit: 'https://myabiflow.de'
```

**Vorteil:** Wenn API und Frontend auf der gleichen Domain laufen, brauchst du kein CORS mehr! Nginx leitet `/api/*` intern an Node.js weiter.

### 7.2 Kolloquiumstrainer API-URL

In `abitur-kolloquium-trainer/src/lib/live-api.ts`:

```typescript
// VORHER:
const PROXY_URL = 'wss://gemini-proxy.sanktannagymnasium.workers.dev';

// NACHHER:
const PROXY_URL = 'wss://myabiflow.de/session';
```

### 7.3 Service Worker aktualisieren

Cache-Version bumpen, damit alle Clients die neuen API-URLs bekommen.

---

## Sicherheits-Checkliste nach Migration

- [ ] `.env` ist in `.gitignore` und wird NICHT committed
- [ ] PostgreSQL nur über Private Network erreichbar (nicht öffentlich)
- [ ] Redis nur auf localhost (127.0.0.1) gebunden
- [ ] SSH nur mit Key-Auth (kein Passwort-Login)
- [ ] Firewall: Nur Ports 22, 80, 443 offen
- [ ] Automatische Sicherheits-Updates (unattended-upgrades)
- [ ] PM2 Startup-Script (startet nach Reboot automatisch)
- [ ] Tägliche Datenbank-Backups (Hetzner Managed DB macht das automatisch)
- [ ] Log-Rotation eingerichtet (logrotate)
- [ ] Monitoring: Uptime-Check (z.B. UptimeRobot, kostenlos)

---

## Datenschutzerklärung nach Migration aktualisieren

Nach erfolgreicher Migration die Datenschutzerklärung anpassen:

**Vorher (§3):**
> "Diese Webseite wird über Cloudflare, Inc. gehostet..."

**Nachher (§3):**
> "Diese Webseite wird auf Servern der Hetzner Online GmbH in Deutschland gehostet.
> Alle Nutzerdaten werden ausschließlich in deutschen Rechenzentren gespeichert und verarbeitet.
> Mit Hetzner besteht ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO.
> Anbieter: Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland."

**OpenAI und Gemini bleiben unverändert** – diese Daten gehen weiterhin an US-Server. Aber: die eigentlichen Nutzerdaten (Konten, Ergebnisse, Passwörter) liegen dann in Deutschland.

---

## Zusammenfassung: Zeitplan

| Phase | Was | Dauer | Voraussetzung |
|-------|-----|-------|---------------|
| 1 | Server aufsetzen + statische Seiten | 2–3 Tage | Hetzner-Account |
| 2 | Datenbank migrieren (D1 → PostgreSQL) | 3–4 Tage | Phase 1 |
| 3 | Backend API umschreiben (Worker → Express) | 1–2 Wochen | Phase 2 |
| 4 | Gemini Proxy + WebSocket migrieren | 3–5 Tage | Phase 3 |
| 5 | Flowie-Tutor migrieren (RAG + pgvector) | 2–3 Tage | Phase 2 |
| 6 | DNS umstellen + Go Live | 1 Tag | Phase 3–5 |
| 7 | Frontend-URLs anpassen | 1 Tag | Phase 6 |

**Gesamtdauer: ca. 4–6 Wochen** (bei Teilzeit-Entwicklung)

**Phase 3 + 4 können teilweise parallel zu Phase 5 laufen.**

---

## Was NICHT migriert werden muss

- **Frontend-Code** (HTML, CSS, JS, React) – bleibt identisch
- **OpenAI API-Calls** – gleicher Code, anderer Server ruft auf
- **Gemini API-Calls** – gleicher Code
- **Resend API** – gleicher Code
- **Service Worker** – nur Cache-Version bumpen
- **Prompts und KI-Logik** – 1:1 kopierbar

---

## Risiken und Fallback

| Risiko | Auswirkung | Gegenmaßnahme |
|--------|-----------|----------------|
| PBKDF2-Hashes inkompatibel | Schüler können sich nicht einloggen | Vor Go-Live mit Testaccount prüfen |
| Performance-Probleme | Langsame Antwortzeiten | CX32 auf CX42 upgraden (1 Klick) |
| Server-Ausfall | Plattform offline | PM2 Auto-Restart + Hetzner Monitoring |
| Datenbank-Fehler | Datenverlust | Managed DB mit täglichen Backups |
| Zu viele gleichzeitige WebSockets | Gemini Proxy überlastet | Redis Pub/Sub für Skalierung |

**Ultimativer Fallback:** Cloudflare Workers + D1 bleiben 4 Wochen nach Migration aktiv. Bei Problemen DNS zurück auf Cloudflare stellen → sofort wieder online.
