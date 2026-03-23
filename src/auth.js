/* ================= AUTH & RATE LIMITING ================= */
import { jsonResponse } from './utils.js';
import { TOKEN_EXPIRY, RATE_LIMIT_WINDOW } from './config.js';

/* ---- Token-System (HMAC-SHA256) ---- */
export async function generateToken(env, secret) {
  const secretKey = secret || env.ACCESS_PASSWORD;
  const payload = JSON.stringify({
    iat: Date.now(),
    nonce: crypto.randomUUID()
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload) + "." + sigHex;
}

export async function verifyToken(token, env, secret) {
  try {
    const secretKey = secret || env.ACCESS_PASSWORD;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [dataB64, sigHex] = parts;
    const data = atob(dataB64);
    const payload = JSON.parse(data);

    if (Date.now() - payload.iat > TOKEN_EXPIRY) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

/* ---- PBKDF2 Password Hashing ---- */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, salt, hash) {
  const computed = await hashPassword(password, salt);
  // Timing-safe comparison
  if (computed.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  return result === 0;
}

/* ---- Timing-safe Passwortvergleich ---- */
export async function safeCompare(a, b) {
  const enc = new TextEncoder();
  const keyData = enc.encode(a.padEnd(64, "\0"));
  const key = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigA = await crypto.subtle.sign("HMAC", key, enc.encode("compare"));
  const keyDataB = enc.encode(b.padEnd(64, "\0"));
  const keyB = await crypto.subtle.importKey(
    "raw", keyDataB, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigB = await crypto.subtle.sign("HMAC", keyB, enc.encode("compare"));
  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  if (arrA.length !== arrB.length) return false;
  let result = 0;
  for (let i = 0; i < arrA.length; i++) result |= arrA[i] ^ arrB[i];
  return result === 0;
}

/* ---- Auth-Check (Token statt Passwort) ---- */
export async function checkAuth(request, env) {
  const token = request.headers.get("X-Access-Token") || "";
  if (!env.ACCESS_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401, env);
  }
  return null;
}

/* ---- Rate Limiting ---- */
const rateLimitMap = new Map();
const loginRateLimitMap = new Map();
let requestCounter = 0;

export { rateLimitMap, loginRateLimitMap };

export function checkRateLimit(request, map, max, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();

  if (!map.has(ip)) {
    map.set(ip, { count: 1, windowStart: now });
    return null;
  }

  const entry = map.get(ip);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
    return null;
  }

  entry.count++;
  if (entry.count > max) {
    return jsonResponse({ error: "Zu viele Anfragen. Bitte warte eine Minute." }, 429, env);
  }
  return null;
}

export function cleanupRateLimitMaps() {
  requestCounter++;
  if (requestCounter % 100 === 0) {
    const now = Date.now();
    for (const map of [rateLimitMap, loginRateLimitMap]) {
      for (const [ip, entry] of map) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW * 5) {
          map.delete(ip);
        }
      }
    }
  }
}

/* ---- Lehrer-Token-System ---- */
export async function generateTeacherToken(env, teacherId) {
  const payload = JSON.stringify({
    iat: Date.now(),
    nonce: crypto.randomUUID(),
    tid: teacherId
  });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.TEACHER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload) + "." + sigHex;
}

export async function verifyTeacherAuthToken(token, env) {
  try {
    if (!env.TEACHER_AUTH_SECRET) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [dataB64, sigHex] = parts;
    const data = atob(dataB64);
    const payload = JSON.parse(data);
    if (Date.now() - payload.iat > TOKEN_EXPIRY) return null;
    if (!payload.tid) return null;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(env.TEACHER_AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    return valid ? payload.tid : null;
  } catch {
    return null;
  }
}

/* ---- Auto-Migration ---- */
let _migrated = false;
export async function ensureMigrations(env) {
  if (_migrated) return;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS class_passwords (id TEXT PRIMARY KEY, label TEXT NOT NULL, password TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)"
    ).run();
    try {
      await env.DB.prepare("ALTER TABLE students ADD COLUMN class_group TEXT DEFAULT NULL").run();
    } catch (_) { /* Spalte existiert bereits */ }

    // Stripe Subscription-Tabelle
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        plan TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'trialing',
        trial_end TEXT,
        current_period_end TEXT,
        cancel_at_period_end INTEGER DEFAULT 0,
        school_license_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id)
      )
    `).run();

    // Stripe-Spalten in students (für schnellen Zugriff)
    const addCol = async (col, def) => {
      try { await env.DB.prepare(`ALTER TABLE students ADD COLUMN ${col} ${def}`).run(); } catch (_) {}
    };
    await addCol("stripe_customer_id", "TEXT DEFAULT NULL");
    await addCol("subscription_status", "TEXT DEFAULT 'none'");
    await addCol("subscription_plan", "TEXT DEFAULT 'free'");
    await addCol("trial_end", "TEXT DEFAULT NULL");

    // free_access Spalte für Schulcodes (kostenloser Vollzugang)
    try { await env.DB.prepare("ALTER TABLE class_passwords ADD COLUMN free_access INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}

    // Lehrer-Faecher-Spalte
    try { await env.DB.prepare("ALTER TABLE teachers ADD COLUMN subjects TEXT DEFAULT '[]'").run(); } catch (_) {}

    // Lehrer-Aufgaben-Sharing
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_tasks (
        id            TEXT PRIMARY KEY,
        teacher_id    TEXT NOT NULL,
        share_code    TEXT NOT NULL UNIQUE COLLATE NOCASE,
        subject       TEXT NOT NULL,
        subject_group TEXT NOT NULL,
        title         TEXT NOT NULL,
        task_meta     TEXT NOT NULL,
        kv_key        TEXT,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS task_submissions (
        id                 TEXT PRIMARY KEY,
        task_id            TEXT NOT NULL,
        student_name_lower TEXT NOT NULL,
        result_id          TEXT,
        submitted_at       TEXT NOT NULL,
        UNIQUE(task_id, student_name_lower),
        FOREIGN KEY (task_id) REFERENCES teacher_tasks(id) ON DELETE CASCADE
      )
    `).run();

    _migrated = true;
  } catch (e) {
    console.error("Migration error:", e);
  }
}

/* ---- Klassen-Code Generator ---- */
export function generateClassCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[arr[i] % chars.length];
  return code;
}
