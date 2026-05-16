/* ================= AUTH & RATE LIMITING ================= */
import { jsonResponse } from './utils.js';
import { TOKEN_EXPIRY, RATE_LIMIT_WINDOW } from './config.js';

/* ---- Token-System (HMAC-SHA256) ---- */
// extra: optionale Felder, die in den Payload gemerged werden (z.B. { sub: nameLower, sid })
export async function generateToken(env, secret, extra) {
  const secretKey = secret || env.ACCESS_PASSWORD;
  const payload = JSON.stringify({
    iat: Date.now(),
    nonce: crypto.randomUUID(),
    ...(extra || {})
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
  return !!(await getTokenPayload(token, env, secret));
}

// Liefert den Payload bei gültigem Token, sonst null (Signatur + TTL geprüft)
export async function getTokenPayload(token, env, secret) {
  try {
    const secretKey = secret || env.ACCESS_PASSWORD;
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [dataB64, sigHex] = parts;
    const data = atob(dataB64);
    const payload = JSON.parse(data);

    if (Date.now() - payload.iat > TOKEN_EXPIRY) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    return valid ? payload : null;
  } catch {
    return null;
  }
}

// Liest den im Login-Token gebundenen Schüler-Identitätsanteil (sub = name_lower, sid = id).
// Gibt null zurück, wenn kein Token, ungültig, abgelaufen oder ohne sub-Feld (alter Token vor IDOR-Fix).
export async function getStudentTokenIdentity(request, env) {
  const token = request.headers.get("X-Access-Token") || "";
  const payload = await getTokenPayload(token, env);
  if (!payload || !payload.sub) return null;
  return {
    nameLower: String(payload.sub),
    studentId: payload.sid != null ? String(payload.sid) : null,
  };
}

// Vereinheitlichter Identitäts-Resolver für Schüler-Endpunkte.
// Schüler-Token: zwingend der gebundene Name (Body wird ignoriert).
// Lehrer-Token (X-Teacher-Auth-Token): erlaubt Lesezugriff auf den im Body angegebenen Schüler.
// Rückgabe: { nameLower } oder null (Aufrufer antwortet dann mit 401).
export async function resolveStudentIdentity(request, env, requestedNameLower) {
  const teacherToken = request.headers.get("X-Teacher-Auth-Token") || "";
  if (teacherToken) {
    const teacherId = await verifyTeacherAuthToken(teacherToken, env);
    if (teacherId) {
      const requested = (requestedNameLower || "").trim().toLowerCase();
      return requested ? { nameLower: requested, isTeacher: true, teacherId } : null;
    }
  }
  const ident = await getStudentTokenIdentity(request, env);
  if (!ident) return null;
  return { nameLower: ident.nameLower, studentId: ident.studentId, isTeacher: false };
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

/* ---- URL→Fach Mapping für fächerspezifischen Abo-Check ---- */
const ENDPOINT_SUBJECT_MAP = {
  'generate': 'Englisch', 'grade': 'Englisch',
  'generate-from-text-writing': 'Englisch', 'generate-from-text-mediation': 'Englisch',
  'generate-listening': 'Englisch', 'grade-listening': 'Englisch',
  'generate-geschichte': 'Geschichte', 'grade-geschichte': 'Geschichte',
  'generate-abitur-geschichte': 'Geschichte', 'grade-abitur-geschichte': 'Geschichte',
  'generate-deutsch': 'Deutsch', 'grade-deutsch': 'Deutsch', 'grade-deutsch-stream': 'Deutsch',
  'generate-mathe': 'Mathematik', 'grade-mathe': 'Mathematik',
  'generate-abitur-mathe': 'Mathematik', 'grade-abitur-mathe': 'Mathematik',
  'generate-pug': 'Politik und Gesellschaft', 'grade-pug': 'Politik und Gesellschaft',
  'generate-abitur-pug': 'Politik und Gesellschaft', 'grade-abitur-pug': 'Politik und Gesellschaft',
  'generate-wr': 'Wirtschaft und Recht', 'grade-wr': 'Wirtschaft und Recht',
  'generate-abitur-wr': 'Wirtschaft und Recht', 'grade-abitur-wr': 'Wirtschaft und Recht',
  'generate-ethik': 'Ethik', 'grade-ethik': 'Ethik',
  'generate-abitur-ethik': 'Ethik', 'grade-abitur-ethik': 'Ethik',
  'generate-religion': 'Evangelische Religionslehre', 'grade-religion': 'Evangelische Religionslehre',
  'generate-abitur-religion': 'Evangelische Religionslehre', 'grade-abitur-religion': 'Evangelische Religionslehre',
  'generate-katholisch': 'Katholische Religionslehre', 'grade-katholisch': 'Katholische Religionslehre',
  'generate-abitur-katholisch': 'Katholische Religionslehre', 'grade-abitur-katholisch': 'Katholische Religionslehre',
  'generate-geographie': 'Geographie', 'grade-geographie': 'Geographie',
  'generate-abitur-geographie': 'Geographie', 'grade-abitur-geographie': 'Geographie',
  'generate-latein': 'Latein', 'grade-latein': 'Latein',
  'generate-abitur-latein': 'Latein', 'grade-abitur-latein': 'Latein',
  'generate-chemie': 'Chemie', 'grade-chemie': 'Chemie',
  'generate-abitur-chemie': 'Chemie', 'grade-abitur-chemie': 'Chemie',
  'generate-physik': 'Physik', 'grade-physik': 'Physik',
  'generate-abitur-physik': 'Physik', 'grade-abitur-physik': 'Physik',
  'generate-bio': 'Biologie', 'grade-bio': 'Biologie',
  'generate-abitur-biologie': 'Biologie', 'grade-abitur-biologie': 'Biologie',
  'generate-sport': 'Sport', 'grade-sport': 'Sport',
  'generate-abitur-sport': 'Sport', 'grade-abitur-sport': 'Sport',
  'generate-informatik': 'Informatik', 'grade-informatik': 'Informatik',
  'generate-abitur-informatik': 'Informatik', 'grade-abitur-informatik': 'Informatik',
  'generate-abitur-kunst': 'Kunst', 'grade-abitur-kunst': 'Kunst',
  'grade-french': 'Französisch',
  'grade-italian': 'Italienisch',
};

export function getSubjectFromPathname(pathname) {
  const segment = pathname.replace('/api/', '').replace('fos-', '');
  return ENDPOINT_SUBJECT_MAP[segment] || null;
}

/* ---- Schullizenz-Aktivitätsprüfung ---- */
// Prüft ob eine Schullizenz (school_license_code) noch aktiv ist
export async function isSchoolLicenseActive(schoolLicenseCode, env) {
  if (!schoolLicenseCode) return false;
  const cp = await env.DB.prepare(
    "SELECT 1 FROM class_passwords WHERE UPPER(password) = UPPER(?) AND active = 1 AND free_access = 1"
  ).bind(schoolLicenseCode).first();
  return !!cp;
}

/* ---- Subscription-Check für kostenpflichtige Endpoints ---- */
// allowTeacherCredits: true bei Grade-Endpoints, false bei Generate-Endpoints
// subject: optionaler Fachname für fächerspezifischen Fach-Lizenz-Check
import { findAvailableTeacherCredits } from './handlers/teacher-credits.js';

export async function checkSubscriptionAccess(studentName, env, allowTeacherCredits = false, subject = null) {
  const studentNameLower = (studentName || "").trim().toLowerCase();
  if (!studentNameLower) return null; // Kein Student-Name → kein Check möglich

  const student = await env.DB.prepare(
    "SELECT id, subscription_status, trial_end, class_group, free_access_until FROM students WHERE name_lower = ?"
  ).bind(studentNameLower).first();

  if (!student) return null; // Unbekannter Schüler → durchlassen (Gast)

  // Manuell vom Lehrer gewährter Free Access (überschreibt nichts, läuft parallel zu Stripe)
  if (student.free_access_until && new Date(student.free_access_until) > new Date()) {
    return null;
  }

  // Aktive Subs direkt in der subscriptions-Tabelle prüfen (Vollzugang).
  // KEIN Vorab-Check auf students.subscription_status – sonst sperrt ein Desync zwischen
  // students und subscriptions ungewollt aus. Alle aktiven Subs durchgehen, sobald EINE
  // gültig ist, durchlassen.
  const subsResult = await env.DB.prepare(
    "SELECT current_period_end, school_license_code FROM subscriptions WHERE student_id = $1 AND status = 'active'"
  ).bind(String(student.id)).all();
  const subs = subsResult?.rows || [];
  const now = new Date();
  for (const sub of subs) {
    if (sub.school_license_code) {
      if (await isSchoolLicenseActive(sub.school_license_code, env)) {
        return null; // Schullizenz aktiv → Zugang erlaubt
      }
    } else if (sub.current_period_end && new Date(sub.current_period_end) > now) {
      return null; // Normales Abo gültig
    }
  }
  // Keine Sub gültig → weiter zu Trial/Credits-Prüfung

  // Schullizenz via class_group (für Schüler ohne subscriptions-Eintrag)
  if (student.class_group) {
    const cp = await env.DB.prepare(
      "SELECT 1 FROM class_passwords WHERE label = ? AND active = 1 AND free_access = 1"
    ).bind(student.class_group).first();
    if (cp) return null; // Schullizenz über class_group aktiv
  }

  // Trial prüfen (Vollzugang)
  if (student.subscription_status === 'trialing' && student.trial_end) {
    if (new Date(student.trial_end) > new Date()) {
      return null; // Trial aktiv
    }
  }

  // Fachschafts-Lizenz prüfen (nur für das angefragte Fach)
  if (subject) {
    const subjectLicense = await env.DB.prepare(`
      SELECT 1 FROM student_subject_licenses ssl
      JOIN subject_licenses sl ON sl.id = ssl.subject_license_id
      WHERE ssl.student_id = $1 AND sl.subject = $2 AND sl.active = 1
        AND (sl.expires_at IS NULL OR sl.expires_at > $3)
    `).bind(String(student.id), subject, new Date().toISOString()).first();
    if (subjectLicense) return null; // Fach-Lizenz aktiv
  }

  // Lehrer-Credits nur bei Grade-Endpoints erlauben
  if (allowTeacherCredits) {
    const credit = await findAvailableTeacherCredits(studentNameLower, env);
    if (credit) return null; // Lehrer-Credits verfügbar
  }

  return jsonResponse({
    error: "Kein aktives Abo. Bitte schließe ein Abo ab.",
    requires_subscription: true
  }, 403, env);
}

/* ---- Auth-Check (Token statt Passwort) ---- */
export async function checkAuth(request, env) {
  // Lehrer-Token als Alternative akzeptieren (fuer Teacher-Mode iFrame)
  const teacherToken = request.headers.get("X-Teacher-Auth-Token") || "";
  if (teacherToken) {
    const teacherId = await verifyTeacherAuthToken(teacherToken, env);
    if (teacherId) return null; // Lehrer ist authentifiziert
  }
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

    // Zähler für Kolloquium-Übungen im Probezeitraum (Limit: 3 Stück)
    await addCol("trial_colloquium_count", "INTEGER DEFAULT 0");

    // Manuell vom Lehrer/Admin gewährter freier Zugang (orthogonal zu Stripe & Trial)
    await addCol("free_access_until", "TEXT DEFAULT NULL");

    // Cleanup einer früheren, fehlerhaften Implementierung, die den Trial-Mechanismus
    // missbraucht hat: alte 'free_access'-Marker in die neue Spalte umziehen.
    try {
      await env.DB.prepare(`
        UPDATE students
        SET free_access_until = trial_end,
            subscription_plan = 'free',
            subscription_status = 'none',
            trial_end = NULL
        WHERE subscription_plan = 'free_access'
      `).run();
    } catch (_) {}

    // free_access Spalte für Schulcodes (kostenloser Vollzugang)
    try { await env.DB.prepare("ALTER TABLE class_passwords ADD COLUMN free_access INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}

    // Lehrer-Faecher-Spalte
    try { await env.DB.prepare("ALTER TABLE teachers ADD COLUMN subjects TEXT DEFAULT '[]'").run(); } catch (_) {}

    // Lehrer-Status (pending/approved) — bestehende Lehrer automatisch approved
    try {
      await env.DB.prepare("ALTER TABLE teachers ADD COLUMN status TEXT DEFAULT 'approved'").run();
    } catch (_) {}

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

    // Lehrer-Korrekturguthaben (49 € / 75 Korrekturen)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_credits (
        id         TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        credits_total INTEGER NOT NULL DEFAULT 75,
        credits_used  INTEGER NOT NULL DEFAULT 0,
        stripe_payment_intent TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_credit_usage (
        id                 SERIAL PRIMARY KEY,
        teacher_id         TEXT NOT NULL,
        credit_id          TEXT NOT NULL,
        student_name_lower TEXT NOT NULL,
        grading_job_id     TEXT,
        subject            TEXT,
        used_at            TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        name_lower TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        used_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    // Double-Opt-In Email-Verifizierung: Spalte + Token-Tabelle
    // Default 1 → Bestandsuser bleiben verifiziert; neue Inserts setzen explizit 0.
    try { await env.DB.prepare("ALTER TABLE students ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1").run(); } catch (_) {}
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        name_lower TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        used_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_approvals (
        teacher_id TEXT NOT NULL,
        token TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        used_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stripe_processed_events (
        event_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_credit_usage_count (
        teacher_id TEXT NOT NULL,
        year_month TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (teacher_id, year_month)
      )
    `).run();
    await env.DB.prepare(`
      INSERT INTO teacher_credit_usage_count (teacher_id, year_month, count)
      SELECT teacher_id, substr(used_at, 1, 7), COUNT(*)
      FROM teacher_credit_usage
      GROUP BY teacher_id, substr(used_at, 1, 7)
      ON CONFLICT DO NOTHING
    `).run();

    // Stripe-Customer-ID für Lehrer
    try { await env.DB.prepare("ALTER TABLE teachers ADD COLUMN stripe_customer_id TEXT DEFAULT NULL").run(); } catch (_) {}

    // Nachrichten (Admin → Schüler)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        recipient_name_lower TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        read_at TEXT,
        reply TEXT,
        reply_at TEXT
      )
    `).run();
    // Migration: reply-Spalten hinzufügen falls Tabelle schon existiert
    try { await env.DB.prepare("ALTER TABLE messages ADD COLUMN reply TEXT DEFAULT NULL").run(); } catch (_) {}
    try { await env.DB.prepare("ALTER TABLE messages ADD COLUMN reply_at TEXT DEFAULT NULL").run(); } catch (_) {}

    // Fachschafts-Lizenzen (Fachcodes für einzelne Fächer)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS subject_licenses (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        subject TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        expires_at TEXT
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS student_subject_licenses (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        subject_license_id TEXT NOT NULL,
        redeemed_at TEXT NOT NULL,
        UNIQUE(student_id, subject_license_id),
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (subject_license_id) REFERENCES subject_licenses(id)
      )
    `).run();

    // E-Mail-Pflicht: NULL-Einträge auf Platzhalter setzen, dann NOT NULL Constraint
    try {
      await env.DB.prepare("UPDATE students SET email = 'fehlt@unbekannt.de' WHERE email IS NULL OR TRIM(email) = ''").run();
      await env.DB.prepare("ALTER TABLE students ALTER COLUMN email SET NOT NULL").run();
      await env.DB.prepare("ALTER TABLE students ALTER COLUMN email SET DEFAULT ''").run();
    } catch (_) { /* Constraint existiert bereits oder D1 unterstützt es nicht */ }

    // Retention-Emails: Onboarding-Stage + Opt-out
    await addCol("onboarding_stage", "INTEGER DEFAULT 0");
    await addCol("retention_optout", "INTEGER DEFAULT 0");

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
