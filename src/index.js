/* ================= AUTH & RATE LIMITING ================= */
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 Stunden
const API_TIMEOUT = 90000; // 90s timeout for external API calls
const rateLimitMap = new Map();
const loginRateLimitMap = new Map();

/* ================= SHARED PROMPT CONSTANTS ================= */
const KEINE_LOESUNGSHINWEISE = `KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.`;

function keineLoesungshinweise(beispiel) {
  if (!beispiel) return KEINE_LOESUNGSHINWEISE;
  return `KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "${beispiel}"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.`;
}

const KORREKTUR_SINGLE = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

const KORREKTUR_AB = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Vollständiger Schülertext Teil A mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "korrektur_text_b": Vollständiger Schülertext Teil B mit gleichen Fehlermarkierungen.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

const LEHRPLAN_TREUE = `LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.`;

/* ---- Zeitanpassung: Materialumfang an Prüfungsdauer anpassen ---- */
function zeitanpassung(bearbeitungszeit, referenzzeit, referenzBE) {
  if (!bearbeitungszeit || bearbeitungszeit >= referenzzeit * 0.8) return '';

  const faktor = bearbeitungszeit / referenzzeit;

  const textMin = Math.max(100, Math.round(400 * faktor));
  const textMax = Math.max(200, Math.round(800 * faktor));
  const maxMaterialien = Math.max(1, Math.round(3 * faktor));
  const maxTeilaufgaben = Math.max(2, Math.round(4 * faktor));
  const skalBE = Math.max(20, Math.round(referenzBE * faktor));

  let teilB = '';
  if (bearbeitungszeit < 90) {
    teilB = '\n- Teil B ENTFÄLLT komplett — generiere NUR Teil A';
  } else if (bearbeitungszeit < 150) {
    teilB = '\n- Teil B: maximal 1 kurze Teilaufgabe';
  }

  return `\n\nWICHTIG – ZEITANPASSUNG: Diese Prüfung dauert nur ${bearbeitungszeit} Minuten (statt der üblichen ${referenzzeit} Min.). Passe den Umfang STRIKT an:
- Textmaterialien: ${textMin}–${textMax} Wörter pro Text (statt 400–800)
- Anzahl Materialien: maximal ${maxMaterialien}
- Teilaufgaben: maximal ${maxTeilaufgaben}
- Bewertungseinheiten: insgesamt ca. ${skalBE} BE${teilB}
Die Aufgabenqualität und Anforderungsniveaus (AFB I–III) bleiben gleich — nur der UMFANG wird reduziert.`;
}

function skaliereTokens(basisTokens, bearbeitungszeit, referenzzeit) {
  if (!bearbeitungszeit || bearbeitungszeit >= referenzzeit * 0.8) return basisTokens;
  const faktor = Math.max(0.3, bearbeitungszeit / referenzzeit);
  return Math.max(4000, Math.round(basisTokens * faktor));
}

const KORREKTUR_LATEIN = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Markierter Schülertext Teil A. Markiere Übersetzungsfehler mit <mark class='fehler-ue' title='Korrektur: RICHTIG (Fehlertyp: S/L/H)'>FALSCH</mark>.
- "korrektur_text_b": Markierter Schülertext Teil B. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teil/Aufgabe", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}.
- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

const UEBUNGSAUFGABEN_ANWEISUNG = `\n- "uebungsaufgaben": NUR wenn die Gesamtnote < 10 NP: Array mit 2–3 gezielten Übungsaufgaben basierend auf den häufigsten Fehlern dieser Abgabe. Format: [{"titel":"Kurztitel","schwerpunkt":"Identifizierter Fehler/Schwäche","aufgabe":"Vollständige, selbstständig lösbare Aufgabenstellung auf Deutsch","hinweis":"Optionaler methodischer Tipp oder null"}]. Die Aufgaben müssen ohne externes Material lösbar sein — bei Textaufgaben den benötigten Kurztext direkt einfügen. Wenn Gesamtnote >= 10: "uebungsaufgaben": []`;

/* ================= KORREKTURHILFE GEWÄHRLEISTUNGSRECHT ================= */
const KORREKTURHILFE_GEWAEHRLEISTUNG = `
KORREKTURHILFE GEWÄHRLEISTUNGSRECHT (bei Rechtsaufgaben zum Thema Mängelrecht/Gewährleistung anwenden):

1. MANGELBEGRIFF – Was Schüler können müssen:
- Mangel identifizieren unter Rückgriff auf die Systematik
- Fachsprache verwenden: subjektive Anforderungen, objektive Anforderungen, Montage-/Installations-/Integrationsanforderungen, Aliud-Lieferung
- Mangelfreiheit erfordert Erfüllung ALLER Anforderungskategorien gleichrangig (kein Vorrang der vereinbarten Beschaffenheit!)
- Subjektive Anforderungen: vereinbarte Beschaffenheit, vereinbarte Verwendung, vereinbartes Zubehör/Anleitungen/Aktualisierungen
- Objektive Anforderungen: gewöhnliche Verwendung, übliche Beschaffenheit (Haltbarkeit, Funktionalität, Kompatibilität, Sicherheit), erwartbares Zubehör/Verpackung/Anleitungen, erwartbare Aktualisierungen
- Montage-/Installationsanforderungen: sachgemäße Durchführung ODER unsachgemäß, aber nicht bedingt durch Verkäufer/mangelhafte Anleitung
- Aliud-Lieferung = Lieferung einer anderen als der geschuldeten Sache steht einem Mangel gleich
- KEINE aktive Zuordnung zu den vier Regelkreisen (§ 434, § 475b, § 475c, §§ 327e/f) erforderlich
- Paragrafen sind NUR Merkhilfe, nicht zu fordern

2. STUFENSTRUKTUR (Kernwissen!):
Stufe 1 – Vorrang der Nacherfüllung:
- Nacherfüllung hat Vorrang (pacta sunt servanda)
- Käufer hat Wahlrecht: Nachbesserung (Reparatur) ODER Neulieferung (Ersatzlieferung)
- Verkäufer trägt Kosten
- Frist: angemessene Frist ab Information über Mangel – KEINE aktive Fristsetzung durch Verbraucher beim Verbrauchsgüterkauf mehr nötig!
- Verkäufer kann bei unverhältnismäßigen Kosten verweigern

Stufe 2 – Nachrangige Rechte (Rücktritt/Vertragsbeendigung, Minderung, SE statt der Leistung):
Übergang möglich wenn EINE der folgenden Voraussetzungen erfüllt:
(1) Fristablauf: Nacherfüllung nicht innerhalb angemessener Frist nach Unterrichtung über Mangel
(2) Fehlgeschlagene Nacherfüllung (grundsätzlich nach 1. Fehlversuch beim Verbrauchsgüterkauf)
(3) Schwerwiegender Mangel: sofortiges Lösen gerechtfertigt
(4) Verweigerung: Verkäufer verweigert Nacherfüllung (muss NICHT "ernsthaft und endgültig" sein!)
(5) Offensichtlichkeit: offensichtlich keine ordnungsgemäße Nacherfüllung
(6) Unmöglichkeit (nur eA)

Zusätzliche Voraussetzung für Rücktritt + SE statt Leistung: Mangel muss ERHEBLICH sein
Minderung: gleiche Voraussetzungen wie Rücktritt, aber OHNE Erheblichkeit

3. SCHADENSERSATZ – Wichtige Unterscheidung:
- SE NEBEN der Leistung (Mangelfolgeschaden): steht NEBEN Nacherfüllung, ist KEIN nachrangiges Recht! Voraussetzung: Pflichtverletzung + Vertretenmüssen. Betrifft Integritätsinteresse (Schäden an anderen Rechtsgütern).
- SE STATT der Leistung: nachrangiges Recht (gleiche Voraussetzungen wie Rücktritt) + Vertretenmüssen + erheblicher Mangel + kausaler Schaden

4. VERBRAUCHERSCHUTZ:
- Beweislastumkehr: 1 Jahr ab Gefahrübergang (Tiere: 6 Monate)
- Keine aktive Fristsetzung mehr nötig (§ 475 V BGB)
- Aktualisierungspflicht: Mangel wegen fehlender Aktualisierung kann auch NACH Gefahrübergang entstehen

5. HÄUFIGE SCHÜLERFEHLER (besonders beachten bei Bewertung!):
- Sofort Rücktritt fordern ohne Nacherfüllung zu berücksichtigen → Punktabzug
- SE neben der Leistung als nachrangiges Recht behandeln → Punktabzug
- Minderung mit Rücktritt gleichsetzen (Minderung braucht KEINE Erheblichkeit) → Punktabzug
- "Frist setzen" als Voraussetzung nennen (beim Verbrauchsgüterkauf nicht mehr nötig) → Hinweis im Feedback
- Bei Aktualisierungspflicht vergessen, dass Gefahrübergang nicht allein maßgeblich ist → Hinweis
`;

/* ---- Token-System (HMAC-SHA256) ---- */
async function generateToken(env, secret) {
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

async function verifyToken(token, env, secret) {
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
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password, salt, hash) {
  const computed = await hashPassword(password, salt);
  // Timing-safe comparison
  if (computed.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  return result === 0;
}

/* ---- Timing-safe Passwortvergleich ---- */
async function safeCompare(a, b) {
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
async function checkAuth(request, env) {
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
function checkRateLimit(request, map, max, env) {
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

let requestCounter = 0;
function cleanupRateLimitMaps() {
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

/* ---- CORS ---- */
function getAllowedOrigins(env) {
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origins = [primary, primary.replace("://", "://www.")];
  if (env?.ALLOWED_ORIGIN_FOS) {
    origins.push(env.ALLOWED_ORIGIN_FOS, env.ALLOWED_ORIGIN_FOS.replace("://", "://www."));
  }
  return origins;
}

function corsHeaders(env, requestOrigin) {
  const allowedOrigins = getAllowedOrigins(env);
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origin = (requestOrigin && allowedOrigins.includes(requestOrigin)) ? requestOrigin : primary;
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Token, X-Teacher-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
  };
}

function jsonResponse(data, status = 200, env = null) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env, env?._origin) });
}

/* ---- Input-Validierung ---- */
function checkBodySize(request, env) {
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return jsonResponse({ error: "Anfrage zu groß." }, 413, env);
  }
  return null;
}

function truncate(str, max) {
  if (typeof str !== "string") return str;
  return str.length > max ? str.slice(0, max) : str;
}

/* ================= MAIN HANDLER ================= */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // Store origin on env to avoid global state race condition
    env._origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env, env._origin) });
    }

    try {
      // Origin-Validierung (CSRF-Schutz)
      const origin = env._origin;
      const allowedOrigins = getAllowedOrigins(env);
      if (origin && !allowedOrigins.includes(origin)) {
        return jsonResponse({ error: "Forbidden" }, 403, env);
      }

      // Body-Größe prüfen
      const sizeError = checkBodySize(request, env);
      if (sizeError) return sizeError;

      // ===== LOGIN ENDPOINT (Rate-Limited) =====
      if (pathname === "/api/login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleLogin(request, env);
      }
      if (pathname === "/api/check-student" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleCheckStudent(request, env);
      }

      // ===== DASHBOARD ENDPOINTS (Token-basiert) =====
      if (pathname === "/api/teacher-login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS, env);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleTeacherLogin(request, env);
      }
      if (pathname === "/api/results" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetResults(request, env);
      }
      if (pathname === "/api/delete-result" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteResult(request, env);
      }
      if (pathname === "/api/students" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetStudents(request, env);
      }
      if (pathname === "/api/delete-student" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteStudent(request, env);
      }

      // ===== AUTH CHECK für /api/ Endpoints =====
      if (pathname.startsWith("/api/")) {
        const authError = await checkAuth(request, env);
        if (authError) return authError;
        const rateLimitError = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW, env);
        if (rateLimitError) return rateLimitError;
        cleanupRateLimitMaps();
      }

      // ===== STUDENT RESULTS =====
      if (pathname === "/api/student-results" && request.method === "POST") {
        return await handleStudentResults(request, env);
      }

      // ===== ENGLISCH ENDPOINTS =====
      if (pathname === "/api/generate" && request.method === "POST") {
        return await handleGenerate(request, env);
      }
      if (pathname === "/api/grade" && request.method === "POST") {
        return await handleGrade(request, env);
      }
      if (pathname === "/api/ocr" && request.method === "POST") {
        return await handleOCR(request, env);
      }
      if (pathname === "/api/parse-task" && request.method === "POST") {
        return await handleParseTask(request, env);
      }
      if (pathname === "/api/model-answer" && request.method === "POST") {
        return await handleModelAnswer(request, env);
      }

      // ===== GESCHICHTE ENDPOINTS =====
      if (pathname === "/api/generate-geschichte" && request.method === "POST") {
        return await handleGenerateGeschichte(request, env);
      }

      // ===== DEUTSCH ENDPOINTS =====
      if (pathname === "/api/generate-deutsch" && request.method === "POST") {
        return await handleGenerateDeutsch(request, env);
      }
      if (pathname === "/api/grade-deutsch" && request.method === "POST") {
        return await handleGradeDeutsch(request, env);
      }
      if (pathname === "/api/model-answer-deutsch" && request.method === "POST") {
        return await handleModelAnswerDeutsch(request, env);
      }
      if (pathname === "/api/parse-task-deutsch" && request.method === "POST") {
        return await handleParseTaskDeutsch(request, env);
      }

      // ===== POLITIK UND GESELLSCHAFT ENDPOINTS =====
      if (pathname === "/api/generate-pug" && request.method === "POST") {
        return await handleGeneratePuG(request, env);
      }
      if (pathname === "/api/grade-pug" && request.method === "POST") {
        return await handleGradePuG(request, env);
      }
      if (pathname === "/api/model-answer-pug" && request.method === "POST") {
        return await handleModelAnswerPuG(request, env);
      }
      if (pathname === "/api/parse-task-pug" && request.method === "POST") {
        return await handleParseTaskPuG(request, env);
      }

      // ===== PUG ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-pug" && request.method === "POST") {
        return await handleGenerateAbiturPuG(request, env);
      }
      if (pathname === "/api/grade-abitur-pug" && request.method === "POST") {
        return await handleGradeAbiturPuG(request, env);
      }
      if (pathname === "/api/model-answer-abitur-pug" && request.method === "POST") {
        return await handleModelAnswerAbiturPuG(request, env);
      }

      // ===== GESCHICHTE ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-geschichte" && request.method === "POST") {
        return await handleGenerateAbiturGeschichte(request, env);
      }
      if (pathname === "/api/grade-abitur-geschichte" && request.method === "POST") {
        return await handleGradeAbiturGeschichte(request, env);
      }
      if (pathname === "/api/model-answer-abitur-geschichte" && request.method === "POST") {
        return await handleModelAnswerAbiturGeschichte(request, env);
      }

      // ===== WR ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-wr" && request.method === "POST") {
        return await handleGenerateAbiturWR(request, env);
      }
      if (pathname === "/api/grade-abitur-wr" && request.method === "POST") {
        return await handleGradeAbiturWR(request, env);
      }
      if (pathname === "/api/model-answer-abitur-wr" && request.method === "POST") {
        return await handleModelAnswerAbiturWR(request, env);
      }

      // ===== WIRTSCHAFT UND RECHT ENDPOINTS =====
      if (pathname === "/api/generate-wr" && request.method === "POST") {
        return await handleGenerateWR(request, env);
      }
      if (pathname === "/api/grade-wr" && request.method === "POST") {
        return await handleGradeWR(request, env);
      }
      if (pathname === "/api/model-answer-wr" && request.method === "POST") {
        return await handleModelAnswerWR(request, env);
      }
      if (pathname === "/api/parse-task-wr" && request.method === "POST") {
        return await handleParseTaskWR(request, env);
      }

      // ===== FRANZÖSISCH ENDPOINTS =====
      if (pathname === "/api/model-answer-french" && request.method === "POST") {
        return await handleModelAnswerFrench(request, env);
      }
      if (pathname === "/api/model-answer-french-writing" && request.method === "POST") {
        return await handleModelAnswerFrenchWriting(request, env);
      }
      if (pathname === "/api/parse-task-french" && request.method === "POST") {
        return await handleParseTaskFrench(request, env);
      }

      // ===== ITALIENISCH ENDPOINTS =====
      if (pathname === "/api/model-answer-italian" && request.method === "POST") {
        return await handleModelAnswerItalian(request, env);
      }
      if (pathname === "/api/model-answer-italian-writing" && request.method === "POST") {
        return await handleModelAnswerItalianWriting(request, env);
      }
      if (pathname === "/api/parse-task-italian" && request.method === "POST") {
        return await handleParseTaskItalian(request, env);
      }

      // ===== ETHIK ENDPOINTS =====
      if (pathname === "/api/generate-ethik" && request.method === "POST") {
        return await handleGenerateEthik(request, env);
      }
      if (pathname === "/api/grade-ethik" && request.method === "POST") {
        return await handleGradeEthik(request, env);
      }
      if (pathname === "/api/model-answer-ethik" && request.method === "POST") {
        return await handleModelAnswerEthik(request, env);
      }
      if (pathname === "/api/parse-task-ethik" && request.method === "POST") {
        return await handleParseTaskEthik(request, env);
      }

      // ===== ETHIK ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-ethik" && request.method === "POST") {
        return await handleGenerateAbiturEthik(request, env);
      }
      if (pathname === "/api/grade-abitur-ethik" && request.method === "POST") {
        return await handleGradeAbiturEthik(request, env);
      }
      if (pathname === "/api/model-answer-abitur-ethik" && request.method === "POST") {
        return await handleModelAnswerAbiturEthik(request, env);
      }

      // ===== EV. RELIGION ENDPOINTS =====
      if (pathname === "/api/generate-religion" && request.method === "POST") {
        return await handleGenerateReligion(request, env);
      }
      if (pathname === "/api/grade-religion" && request.method === "POST") {
        return await handleGradeReligion(request, env);
      }
      if (pathname === "/api/model-answer-religion" && request.method === "POST") {
        return await handleModelAnswerReligion(request, env);
      }
      if (pathname === "/api/parse-task-religion" && request.method === "POST") {
        return await handleParseTaskReligion(request, env);
      }

      // ===== EV. RELIGION ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-religion" && request.method === "POST") {
        return await handleGenerateAbiturReligion(request, env);
      }
      if (pathname === "/api/grade-abitur-religion" && request.method === "POST") {
        return await handleGradeAbiturReligion(request, env);
      }
      if (pathname === "/api/model-answer-abitur-religion" && request.method === "POST") {
        return await handleModelAnswerAbiturReligion(request, env);
      }

      // ===== KATH. RELIGION ENDPOINTS =====
      if (pathname === "/api/generate-katholisch" && request.method === "POST") {
        return await handleGenerateKatholisch(request, env);
      }
      if (pathname === "/api/grade-katholisch" && request.method === "POST") {
        return await handleGradeKatholisch(request, env);
      }
      if (pathname === "/api/model-answer-katholisch" && request.method === "POST") {
        return await handleModelAnswerKatholisch(request, env);
      }
      if (pathname === "/api/parse-task-katholisch" && request.method === "POST") {
        return await handleParseTaskKatholisch(request, env);
      }

      // ===== KATH. RELIGION ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-katholisch" && request.method === "POST") {
        return await handleGenerateAbiturKatholisch(request, env);
      }
      if (pathname === "/api/grade-abitur-katholisch" && request.method === "POST") {
        return await handleGradeAbiturKatholisch(request, env);
      }
      if (pathname === "/api/model-answer-abitur-katholisch" && request.method === "POST") {
        return await handleModelAnswerAbiturKatholisch(request, env);
      }

      // ===== GEOGRAPHIE ENDPOINTS =====
      if (pathname === "/api/generate-geographie" && request.method === "POST") {
        return await handleGenerateGeographie(request, env);
      }
      if (pathname === "/api/grade-geographie" && request.method === "POST") {
        return await handleGradeGeographie(request, env);
      }
      if (pathname === "/api/model-answer-geographie" && request.method === "POST") {
        return await handleModelAnswerGeographie(request, env);
      }
      if (pathname === "/api/parse-task-geographie" && request.method === "POST") {
        return await handleParseTaskGeographie(request, env);
      }

      // ===== GEOGRAPHIE ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-geographie" && request.method === "POST") {
        return await handleGenerateAbiturGeographie(request, env);
      }
      if (pathname === "/api/grade-abitur-geographie" && request.method === "POST") {
        return await handleGradeAbiturGeographie(request, env);
      }
      if (pathname === "/api/model-answer-abitur-geographie" && request.method === "POST") {
        return await handleModelAnswerAbiturGeographie(request, env);
      }

      // ===== LATEIN ENDPOINTS =====
      if (pathname === "/api/generate-latein" && request.method === "POST") {
        return await handleGenerateLatein(request, env);
      }
      if (pathname === "/api/grade-latein" && request.method === "POST") {
        return await handleGradeLatein(request, env);
      }
      if (pathname === "/api/model-answer-latein" && request.method === "POST") {
        return await handleModelAnswerLatein(request, env);
      }
      if (pathname === "/api/parse-task-latein" && request.method === "POST") {
        return await handleParseTaskLatein(request, env);
      }

      // ===== LATEIN ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-latein" && request.method === "POST") {
        return await handleGenerateAbiturLatein(request, env);
      }
      if (pathname === "/api/grade-abitur-latein" && request.method === "POST") {
        return await handleGradeAbiturLatein(request, env);
      }
      if (pathname === "/api/model-answer-abitur-latein" && request.method === "POST") {
        return await handleModelAnswerAbiturLatein(request, env);
      }

      // ===== MATHEMATIK ENDPOINTS =====
      if (pathname === "/api/generate-mathe" && request.method === "POST") {
        return await handleGenerateMathe(request, env);
      }
      if (pathname === "/api/grade-mathe" && request.method === "POST") {
        return await handleGradeMathe(request, env);
      }
      if (pathname === "/api/model-answer-mathe" && request.method === "POST") {
        return await handleModelAnswerMathe(request, env);
      }
      if (pathname === "/api/parse-task-mathe" && request.method === "POST") {
        return await handleParseTaskMathe(request, env);
      }

      // ===== MATHEMATIK ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-mathe" && request.method === "POST") {
        return await handleGenerateAbiturMathe(request, env);
      }
      if (pathname === "/api/grade-abitur-mathe" && request.method === "POST") {
        return await handleGradeAbiturMathe(request, env);
      }
      if (pathname === "/api/model-answer-abitur-mathe" && request.method === "POST") {
        return await handleModelAnswerAbiturMathe(request, env);
      }

      // ===== CHEMIE ENDPOINTS =====
      if (pathname === "/api/generate-chemie" && request.method === "POST") {
        return await handleGenerateChemie(request, env);
      }
      if (pathname === "/api/grade-chemie" && request.method === "POST") {
        return await handleGradeChemie(request, env);
      }
      if (pathname === "/api/model-answer-chemie" && request.method === "POST") {
        return await handleModelAnswerChemie(request, env);
      }
      if (pathname === "/api/parse-task-chemie" && request.method === "POST") {
        return await handleParseTaskChemie(request, env);
      }

      // ===== PHYSIK ENDPOINTS =====
      if (pathname === "/api/generate-physik" && request.method === "POST") {
        return await handleGeneratePhysik(request, env);
      }
      if (pathname === "/api/grade-physik" && request.method === "POST") {
        return await handleGradePhysik(request, env);
      }
      if (pathname === "/api/model-answer-physik" && request.method === "POST") {
        return await handleModelAnswerPhysik(request, env);
      }
      if (pathname === "/api/parse-task-physik" && request.method === "POST") {
        return await handleParseTaskPhysik(request, env);
      }

      // ===== BIO ENDPOINTS =====
      if (pathname === "/api/generate-bio" && request.method === "POST") {
        return await handleGenerateBio(request, env);
      }
      if (pathname === "/api/grade-bio" && request.method === "POST") {
        return await handleGradeBio(request, env);
      }
      if (pathname === "/api/model-answer-bio" && request.method === "POST") {
        return await handleModelAnswerBio(request, env);
      }
      if (pathname === "/api/parse-task-bio" && request.method === "POST") {
        return await handleParseTaskBio(request, env);
      }

      // ===== SPORT ENDPOINTS =====
      if (pathname === "/api/generate-sport" && request.method === "POST") {
        return await handleGenerateSport(request, env);
      }
      if (pathname === "/api/grade-sport" && request.method === "POST") {
        return await handleGradeSport(request, env);
      }
      if (pathname === "/api/model-answer-sport" && request.method === "POST") {
        return await handleModelAnswerSport(request, env);
      }
      if (pathname === "/api/parse-task-sport" && request.method === "POST") {
        return await handleParseTaskSport(request, env);
      }

      // ===== SPORT ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-sport" && request.method === "POST") {
        return await handleGenerateAbiturSport(request, env);
      }
      if (pathname === "/api/grade-abitur-sport" && request.method === "POST") {
        return await handleGradeAbiturSport(request, env);
      }
      if (pathname === "/api/model-answer-abitur-sport" && request.method === "POST") {
        return await handleModelAnswerAbiturSport(request, env);
      }

      // ===== INFORMATIK ENDPOINTS =====
      if (pathname === "/api/generate-informatik" && request.method === "POST") {
        return await handleGenerateInformatik(request, env);
      }
      if (pathname === "/api/grade-informatik" && request.method === "POST") {
        return await handleGradeInformatik(request, env);
      }
      if (pathname === "/api/model-answer-informatik" && request.method === "POST") {
        return await handleModelAnswerInformatik(request, env);
      }
      if (pathname === "/api/parse-task-informatik" && request.method === "POST") {
        return await handleParseTaskInformatik(request, env);
      }

      // ===== CHEMIE ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-chemie" && request.method === "POST") {
        return await handleGenerateAbiturChemie(request, env);
      }
      if (pathname === "/api/grade-abitur-chemie" && request.method === "POST") {
        return await handleGradeAbiturChemie(request, env);
      }
      if (pathname === "/api/model-answer-abitur-chemie" && request.method === "POST") {
        return await handleModelAnswerAbiturChemie(request, env);
      }

      // ===== PHYSIK ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-physik" && request.method === "POST") {
        return await handleGenerateAbiturPhysik(request, env);
      }
      if (pathname === "/api/grade-abitur-physik" && request.method === "POST") {
        return await handleGradeAbiturPhysik(request, env);
      }
      if (pathname === "/api/model-answer-abitur-physik" && request.method === "POST") {
        return await handleModelAnswerAbiturPhysik(request, env);
      }

      // ===== BIOLOGIE ABITUR =====
      if (pathname === "/api/generate-abitur-biologie" && request.method === "POST") {
        return await handleGenerateAbiturBiologie(request, env);
      }
      if (pathname === "/api/grade-abitur-biologie" && request.method === "POST") {
        return await handleGradeAbiturBiologie(request, env);
      }
      if (pathname === "/api/model-answer-abitur-biologie" && request.method === "POST") {
        return await handleModelAnswerAbiturBiologie(request, env);
      }

      // ===== INFORMATIK ABITUR ENDPOINTS =====
      if (pathname === "/api/generate-abitur-informatik" && request.method === "POST") {
        return await handleGenerateAbiturInformatik(request, env);
      }
      if (pathname === "/api/grade-abitur-informatik" && request.method === "POST") {
        return await handleGradeAbiturInformatik(request, env);
      }
      if (pathname === "/api/model-answer-abitur-informatik" && request.method === "POST") {
        return await handleModelAnswerAbiturInformatik(request, env);
      }

      // ===== FOS ENDPOINTS (alle Fächer) =====
      if (pathname.startsWith("/api/fos-") && request.method === "POST") {
        return await handleFOSRoute(pathname, request, env);
      }

      // ===== IMAGE GENERATION =====
      if (pathname === "/api/generate-image" && request.method === "POST") {
        return await handleGenerateImage(request, env);
      }
      if (pathname === "/api/fetch-unsplash" && request.method === "POST") {
        return await handleFetchUnsplash(request, env);
      }

      // ===== SUBMIT RESULT =====
      if (pathname === "/api/submit-result" && request.method === "POST") {
        return await handleSubmitResult(request, env);
      }

      // ===== STUDENT PREFERENCES =====
      if (pathname === "/api/get-preferences" && request.method === "POST") {
        return await handleGetPreferences(request, env);
      }
      if (pathname === "/api/save-preferences" && request.method === "POST") {
        return await handleSavePreferences(request, env);
      }
      if (pathname === "/api/check-reminders" && request.method === "POST") {
        return await handleCheckReminders(request, env);
      }

      // ===== UNSUBSCRIBE (GET mit signiertem Token) =====
      if (pathname === "/api/unsubscribe" && request.method === "GET") {
        return await handleUnsubscribe(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      console.error("Unhandled error:", err.message);
      const msg = err.message || "Interner Fehler.";
      const isUnsafe = msg.length > 200 || /api[_-]?key|token|secret|stack|\.js:/i.test(msg);
      return jsonResponse({ error: isUnsafe ? "Interner Fehler." : msg }, 500, env);
    }
  },

  // Täglicher Cron-Job für Email-Erinnerungen
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminderEmails(env));
  }
};

/* ================= LOGIN HANDLER ================= */
async function handleLogin(request, env) {
  const { password } = await request.json();

  if (!env.ACCESS_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }

  if (!password || typeof password !== "string") {
    return jsonResponse({ success: false, error: "Passwort erforderlich." }, 400, env);
  }

  const valid = await safeCompare(password, env.ACCESS_PASSWORD);
  if (valid) {
    const token = await generateToken(env);
    return jsonResponse({ success: true, token }, 200, env);
  } else {
    return jsonResponse({ success: false, error: "Falsches Passwort." }, 401, env);
  }
}

/* ================= CHECK STUDENT (Register / Login) ================= */
async function handleCheckStudent(request, env) {
  const { password, personal_password, student_name, mode, level } = await request.json();

  if (!env.ACCESS_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!student_name || typeof student_name !== "string" || !student_name.trim()) {
    return jsonResponse({ success: false, error: "Name erforderlich." }, 400, env);
  }
  if (mode !== "register" && mode !== "login") {
    return jsonResponse({ success: false, error: "Ungültiger Modus." }, 400, env);
  }
  if (!personal_password || typeof personal_password !== "string") {
    return jsonResponse({ success: false, error: "Passwort erforderlich." }, 400, env);
  }
  if (mode === "register" && personal_password.length < 6) {
    return jsonResponse({ success: false, error: "Passwort muss mindestens 6 Zeichen haben." }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const existing = await env.DB.prepare(
    "SELECT id, name, level, salt, hash FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();

  if (mode === "register") {
    if (!password || typeof password !== "string") {
      return jsonResponse({ success: false, error: "Klassenpasswort erforderlich." }, 400, env);
    }
    const validClass = await safeCompare(password, env.ACCESS_PASSWORD);
    if (!validClass) {
      return jsonResponse({ success: false, error: "Falsches Klassenpasswort." }, 401, env);
    }
    if (existing) {
      return jsonResponse({ success: false, error: "Dieser Name ist bereits vergeben. Bitte füge eine Zahl an (z.B. Max M. 2)." }, 409, env);
    }

    const salt = crypto.randomUUID();
    const hash = await hashPassword(personal_password, salt);
    await env.DB.prepare(
      "INSERT INTO students (name, name_lower, level, salt, hash, hidden_subjects, created_at) VALUES (?, ?, ?, ?, ?, '[]', ?)"
    ).bind(student_name.trim(), nameLower, level || "", salt, hash, new Date().toISOString()).run();
  } else {
    if (!existing) {
      return jsonResponse({ success: false, error: "Name nicht gefunden. Bitte zuerst registrieren." }, 404, env);
    }
    if (!existing.hash || !existing.salt) {
      const salt = crypto.randomUUID();
      const hash = await hashPassword(personal_password, salt);
      await env.DB.prepare(
        "UPDATE students SET salt = ?, hash = ? WHERE id = ?"
      ).bind(salt, hash, existing.id).run();
    } else {
      const match = await verifyPassword(personal_password, existing.salt, existing.hash);
      if (!match) {
        return jsonResponse({ success: false, error: "Falsches Passwort." }, 401, env);
      }
    }
  }

  const token = await generateToken(env);
  return jsonResponse({ success: true, token }, 200, env);
}

/* ================= STUDENT PREFERENCES ================= */
async function handleGetPreferences(request, env) {
  const { student_name } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT hidden_subjects, exam_subjects, reminder_interval, email FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();
  if (!student) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);

  return jsonResponse({
    success: true,
    preferences: {
      hidden_subjects: JSON.parse(student.hidden_subjects || "[]"),
      exam_subjects: JSON.parse(student.exam_subjects || "{}"),
      reminder_interval: student.reminder_interval ?? 3,
      email: student.email || ""
    }
  }, 200, env);
}

async function handleSavePreferences(request, env) {
  const { student_name, hidden_subjects, exam_subjects, reminder_interval, email } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();

  // Dynamisch nur die übergebenen Felder updaten
  const updates = [];
  const binds = [];

  if (Array.isArray(hidden_subjects)) {
    updates.push("hidden_subjects = ?");
    binds.push(JSON.stringify(hidden_subjects));
  }
  if (exam_subjects && typeof exam_subjects === "object") {
    const es = exam_subjects;
    if (!Array.isArray(es.written) || !Array.isArray(es.oral)) {
      return jsonResponse({ error: "exam_subjects braucht written[] und oral[]." }, 400, env);
    }
    if (es.written.length > 3 || es.oral.length > 3) {
      return jsonResponse({ error: "Maximal 3 schriftliche und 3 mündliche Fächer." }, 400, env);
    }
    updates.push("exam_subjects = ?");
    binds.push(JSON.stringify(es));
  }
  if (reminder_interval !== undefined) {
    const ri = parseInt(reminder_interval, 10);
    if (isNaN(ri) || ri < 0 || ri > 30) {
      return jsonResponse({ error: "reminder_interval muss zwischen 0 und 30 liegen." }, 400, env);
    }
    updates.push("reminder_interval = ?");
    binds.push(ri);
  }
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Ungültige Email-Adresse." }, 400, env);
    }
    updates.push("email = ?");
    binds.push(email || null);
  }

  if (updates.length === 0) {
    return jsonResponse({ error: "Keine Felder zum Speichern." }, 400, env);
  }

  binds.push(nameLower);
  const result = await env.DB.prepare(
    `UPDATE students SET ${updates.join(", ")} WHERE name_lower = ?`
  ).bind(...binds).run();

  if (result.meta.changes === 0) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  return jsonResponse({ success: true }, 200, env);
}

/* ================= CHECK REMINDERS ================= */
const SUBJECT_TYPES_MAP = {
  english: ["mediation", "writing"],
  german: ["deutsch-interpretation", "deutsch-analyse", "deutsch-eroerterung", "deutsch-materialgestuetzt-informierend", "deutsch-materialgestuetzt-argumentierend"],
  history: ["geschichte", "geschichte-abitur"],
  pug: ["pug-klausur", "pug-abitur"],
  wr: ["wr", "wr-abitur"],
  french: ["french-mediation", "french-writing"],
  italian: ["italian-mediation", "italian-writing"],
  ethik: ["ethik", "ethik-abitur"],
  religion: ["religion", "religion-abitur"],
  katholisch: ["katholisch", "katholisch-abitur"],
  geographie: ["geographie", "geographie-abitur"],
  latein: ["latein", "latein-abitur"],
  mathe: ["mathe", "mathe-abitur"],
  chemie: ["chemie", "chemie-abitur"],
  physik: ["physik", "physik-abitur"],
  biologie: ["biologie", "biologie-abitur"],
  sport: ["sport", "sport-abitur"],
  informatik: ["informatik", "informatik-abitur"]
};

// Anzeige-Namen für Emails
const SUBJECT_NAMES = {
  english: "Englisch", german: "Deutsch", history: "Geschichte",
  pug: "Politik und Gesellschaft", wr: "Wirtschaft & Recht",
  french: "Französisch", italian: "Italienisch", ethik: "Ethik",
  religion: "Ev. Religion", katholisch: "Kath. Religion",
  geographie: "Geographie", latein: "Latein", mathe: "Mathematik",
  chemie: "Chemie", physik: "Physik", biologie: "Biologie",
  sport: "Sport", informatik: "Informatik"
};

const SUBJECT_ICONS = {
  english: "🇬🇧", german: "📖", history: "📜", pug: "🏛️", wr: "⚖️",
  french: "🇫🇷", italian: "🇮🇹", ethik: "🧠", religion: "✝️",
  katholisch: "⛪", geographie: "🌍", latein: "🏺", mathe: "📐",
  chemie: "🧪", physik: "⚛️", biologie: "🧬", sport: "⚽", informatik: "💻"
};

async function handleCheckReminders(request, env) {
  const { student_name } = await request.json();
  if (!student_name) return jsonResponse({ error: "Name erforderlich." }, 400, env);

  const nameLower = student_name.trim().toLowerCase();
  const student = await env.DB.prepare(
    "SELECT exam_subjects, reminder_interval FROM students WHERE name_lower = ?"
  ).bind(nameLower).first();
  if (!student) return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);

  const examSubjects = JSON.parse(student.exam_subjects || "{}");
  const allExam = [...(examSubjects.written || []), ...(examSubjects.oral || [])];
  if (allExam.length === 0) {
    return jsonResponse({ success: true, reminders: [] }, 200, env);
  }

  const interval = student.reminder_interval ?? 3;
  if (interval === 0) {
    return jsonResponse({ success: true, reminders: [] }, 200, env);
  }

  // Letzte Aktivität pro Fach ermitteln
  const results = await env.DB.prepare(
    "SELECT type, MAX(created_at) as last_date FROM results WHERE LOWER(TRIM(student_name)) = ? GROUP BY type"
  ).bind(nameLower).all();

  const lastByType = {};
  for (const r of (results.results || [])) {
    lastByType[r.type] = r.last_date;
  }

  const now = Date.now();
  const reminders = [];

  for (const subj of allExam) {
    const types = SUBJECT_TYPES_MAP[subj] || [];
    let lastDate = null;
    for (const t of types) {
      if (lastByType[t]) {
        const d = new Date(lastByType[t]).getTime();
        if (!lastDate || d > lastDate) lastDate = d;
      }
    }

    const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : null;
    if (daysSince === null || daysSince >= interval) {
      reminders.push({
        subject: subj,
        daysSince: daysSince,
        isWritten: (examSubjects.written || []).includes(subj)
      });
    }
  }

  return jsonResponse({ success: true, reminders }, 200, env);
}

/* ================= UNSUBSCRIBE ================= */
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response(unsubscribePage("Ungültiger Link."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  try {
    // Token = base64(name_lower:timestamp:hmac)
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length < 3) throw new Error("Ungültig");
    const hmac = parts.pop();
    const ts = parseInt(parts.pop(), 10);
    const nameLower = parts.join(":");

    // Token max 7 Tage gültig
    if (Date.now() - ts > 7 * 86400000) {
      return new Response(unsubscribePage("Dieser Link ist abgelaufen."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // HMAC verifizieren
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ACCESS_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const payload = `${nameLower}:${ts}`;
    const sigBytes = new Uint8Array(hmac.match(/.{2}/g).map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) throw new Error("Ungültig");

    await env.DB.prepare("UPDATE students SET reminder_interval = 0 WHERE name_lower = ?").bind(nameLower).run();

    return new Response(unsubscribePage("Du erhältst ab sofort keine Erinnerungs-Emails mehr. Du kannst die Erinnerungen jederzeit in der App wieder aktivieren."), {
      status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch {
    return new Response(unsubscribePage("Ungültiger oder abgelaufener Link."), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

function unsubscribePage(message) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>myAbiFlow – Abmeldung</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f5;color:#333}div{background:#fff;padding:2rem;border-radius:12px;max-width:400px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1)}h2{margin-top:0}a{color:#2563eb}</style></head><body><div><h2>myAbiFlow</h2><p>${message}</p><a href="https://myabiflow.de">Zurück zur App</a></div></body></html>`;
}

/* ================= EMAIL-ERINNERUNGEN (CRON) ================= */
async function generateUnsubscribeToken(nameLower, env) {
  const ts = Date.now();
  const payload = `${nameLower}:${ts}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ACCESS_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${nameLower}:${ts}:${hmac}`);
}

// Prüfungstermine (synchron mit index.html)
const ABITUR_DATES_Q13 = {
  chemie: "2026-04-24", german: "2026-04-28", english: "2026-04-30",
  mathe: "2026-05-06", french: "2026-05-08",
  history: { gA: "2026-05-11", eA: "2026-05-13" },
  pug: { gA: "2026-05-11", eA: "2026-05-13" },
  wr: { gA: "2026-05-11", eA: "2026-05-13" },
  italian: { gA: "2026-05-11", eA: "2026-05-13" },
  ethik: { gA: "2026-05-11", eA: "2026-05-13" },
  religion: { gA: "2026-05-11", eA: "2026-05-13" },
  katholisch: { gA: "2026-05-11", eA: "2026-05-13" },
  geographie: { gA: "2026-05-11", eA: "2026-05-13" },
  latein: { gA: "2026-05-11", eA: "2026-05-13" },
  physik: { gA: "2026-05-11", eA: "2026-05-13" },
  biologie: { gA: "2026-05-11", eA: "2026-05-13" }
};

function getExamDateStr(subject, isEa) {
  const d = ABITUR_DATES_Q13[subject];
  if (!d) return null;
  if (typeof d === "string") return d;
  return isEa ? d.eA : d.gA;
}

function daysUntilExam(subject, isEa) {
  const dateStr = getExamDateStr(subject, isEa);
  if (!dateStr) return null;
  const exam = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((exam - now) / 86400000);
}

function buildReminderEmail(studentName, overdueSubjects, unsubscribeUrl, eaSubject) {
  const rows = overdueSubjects.map(s => {
    const icon = SUBJECT_ICONS[s.subject] || "📚";
    const name = SUBJECT_NAMES[s.subject] || s.subject;
    const days = s.daysSince === null ? "noch nie geübt" : `zuletzt vor ${s.daysSince} Tagen`;
    const isEa = s.subject === eaSubject;
    const level = isEa ? "eA" : "gA";
    const daysLeft = daysUntilExam(s.subject, isEa);
    const countdown = daysLeft !== null && daysLeft > 0
      ? `<span style="color:#dc2626;font-weight:600">noch ${daysLeft} Tage bis zur Prüfung</span>`
      : daysLeft === 0 ? `<span style="color:#dc2626;font-weight:600">Prüfung HEUTE!</span>` : "";
    return `<tr>
<td style="padding:8px 12px;font-size:16px">${icon} <strong>${name}</strong> <span style="color:#888;font-size:12px">(${level})</span></td>
<td style="padding:8px 12px;font-size:14px"><span style="color:#666">${days}</span>${countdown ? "<br>" + countdown : ""}</td>
</tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;background:#f0f0f5;padding:20px;margin:0">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<h2 style="color:#2563eb;margin-top:0">myAbiFlow – Erinnerung</h2>
<p>Hallo ${studentName},</p>
<p>du hast folgende Abifächer seit einiger Zeit nicht mehr geübt:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
<p style="text-align:center;margin:24px 0">
<a href="https://myabiflow.de" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Jetzt üben →</a>
</p>
<p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Du kannst die Erinnerungsfrequenz jederzeit in der App ändern.<br>
<a href="${unsubscribeUrl}" style="color:#999">Erinnerungen abbestellen</a>
</p>
</div></body></html>`;
}

async function sendReminderEmails(env) {
  if (!env.RESEND_API_KEY) return;

  // Alle Schüler mit Email + aktiver Erinnerung laden
  const { results: students } = await env.DB.prepare(
    "SELECT name, name_lower, email, exam_subjects, reminder_interval, last_reminder_sent FROM students WHERE email IS NOT NULL AND email != '' AND reminder_interval > 0"
  ).all();

  if (!students || students.length === 0) return;

  const now = Date.now();

  for (const student of students) {
    // Nicht öfter als reminder_interval senden
    if (student.last_reminder_sent) {
      const lastSent = new Date(student.last_reminder_sent).getTime();
      const daysSinceSent = Math.floor((now - lastSent) / 86400000);
      if (daysSinceSent < student.reminder_interval) continue;
    }

    const examSubjects = JSON.parse(student.exam_subjects || "{}");
    const allExam = [...(examSubjects.written || []), ...(examSubjects.oral || [])];
    if (allExam.length === 0) continue;

    // Letzte Aktivität pro Typ
    const { results: activityRows } = await env.DB.prepare(
      "SELECT type, MAX(created_at) as last_date FROM results WHERE LOWER(TRIM(student_name)) = ? GROUP BY type"
    ).bind(student.name_lower).all();

    const lastByType = {};
    for (const r of (activityRows || [])) {
      lastByType[r.type] = r.last_date;
    }

    // Überfällige Fächer ermitteln
    const overdue = [];
    for (const subj of allExam) {
      const types = SUBJECT_TYPES_MAP[subj] || [];
      let lastDate = null;
      for (const t of types) {
        if (lastByType[t]) {
          const d = new Date(lastByType[t]).getTime();
          if (!lastDate || d > lastDate) lastDate = d;
        }
      }
      const daysSince = lastDate ? Math.floor((now - lastDate) / 86400000) : null;
      if (daysSince === null || daysSince >= student.reminder_interval) {
        overdue.push({ subject: subj, daysSince });
      }
    }

    if (overdue.length === 0) continue;

    // Unsubscribe-Token + Email bauen
    const unsubToken = await generateUnsubscribeToken(student.name_lower, env);
    const unsubUrl = `https://sag-abi-mediation-api.sanktannagymnasium.workers.dev/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const eaSubject = examSubjects.ea || null;
    const html = buildReminderEmail(student.name, overdue, unsubUrl, eaSubject);

    const count = overdue.length;
    const subject = count === 1
      ? `myAbiFlow – ${SUBJECT_NAMES[overdue[0].subject] || overdue[0].subject} wartet auf dich`
      : `myAbiFlow – ${count} Abifächer warten auf dich`;

    // Via Resend senden
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "myAbiFlow <erinnerung@myabiflow.de>",
          to: [student.email],
          subject,
          html
        })
      });

      await env.DB.prepare(
        "UPDATE students SET last_reminder_sent = ? WHERE name_lower = ?"
      ).bind(new Date().toISOString(), student.name_lower).run();
    } catch (err) {
      console.error(`Email-Fehler für ${student.name_lower}:`, err.message);
    }
  }
}

/* ================= ENGLISCH: GENERATE ================= */
async function handleGenerate(request, env) {
  const body = await request.json();
  const { topic, source_len_words, prompt_template } = body;

  if (!prompt_template || typeof prompt_template !== "string") {
    return jsonResponse({ error: "prompt_template required" }, 400, env);
  }

  const safeTopic = truncate(topic || "", 500);
  const prompt = prompt_template
    .replace(/\{topic\}/g, safeTopic)
    .replace(/\$\{topic\}/g, safeTopic)
    .replace(/\{length\}/g, String(source_len_words || 600))
    .replace(/\$\{length\}/g, String(source_len_words || 600));

  const wordTarget = source_len_words || 700;
  const estimatedTokens = Math.round(wordTarget * 1.5) + 1200;
  const maxTokens = Math.min(Math.max(estimatedTokens, 2500), 8000);

  const openaiRes = await callOpenAI(env, [
    {
      role: "system",
      content: `You are an Abitur exam generator. Return valid JSON only. No markdown fences. No preamble.
CRITICAL: The JSON must be valid. All string values must properly escape special characters.`
    },
    { role: "user", content: truncate(prompt, 10000) }
  ], maxTokens);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= ENGLISCH: GRADE ================= */
async function handleGrade(request, env) {
  const body = await request.json();
  const { source_text_de, task_en, student_text_en, rubric_prompt } = body;

  const messages = [
    {
      role: "system",
      content: `You are a strict German Abitur English teacher grading a Sprachmittlung (mediation).
You must grade using the official ISB Bewertungsraster with Notenpunkte (0-15 NP).
Return your evaluation in JSON format ONLY:
{
  "inhalt_np": <number 0-15>,
  "sprache_np": <number 0-15>,
  "gesamt_np": <number 0-15>,
  "feedback": "<detailed feedback in German with Markdown formatting>",
  "korrektur_text": "<Der VOLLSTÄNDIGE Schülertext. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}]
}
CALCULATION: gesamt_np = round(inhalt_np * 0.4 + sprache_np * 0.6)
SPERRKLAUSEL: If inhalt_np OR sprache_np is 0, gesamt_np must be at most 3.
IMPORTANT: Return ONLY valid JSON. No markdown fences.` + UEBUNGSAUFGABEN_ANWEISUNG
    },
    {
      role: "user",
      content:
        `Deutscher Quelltext:\n${truncate(source_text_de, 15000)}\n\n` +
        `Englische Aufgabenstellung:\n${truncate(task_en, 5000)}\n\n` +
        `Schülertext (Englisch):\n${truncate(student_text_en, 15000)}\n\n` +
        `Bewertungsraster:\n${truncate(rubric_prompt, 5000)}`
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const inhalt = parsed.inhalt_np ?? parsed.content_textstructure ?? null;
    const sprache = parsed.sprache_np ?? parsed.language ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && inhalt != null && sprache != null) {
      gesamt = Math.round(inhalt * 0.4 + sprache * 0.6);
      if (inhalt === 0 || sprache === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { content_textstructure: inhalt, language: sprache, total: gesamt },
      feedback: parsed.feedback || "",
      corrections: parsed.corrections || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    const contentMatch = openaiRes.match(/inhalt_np["\s:]*(\d{1,2})/i);
    const langMatch = openaiRes.match(/sprache_np["\s:]*(\d{1,2})/i);
    const totalMatch = openaiRes.match(/gesamt_np["\s:]*(\d{1,2})/i);

    const contentScore = contentMatch ? Math.min(parseInt(contentMatch[1]), 15) : null;
    const langScore = langMatch ? Math.min(parseInt(langMatch[1]), 15) : null;
    let totalScore = totalMatch ? Math.min(parseInt(totalMatch[1]), 15) : null;

    if (totalScore == null && contentScore != null && langScore != null) {
      totalScore = Math.round(contentScore * 0.4 + langScore * 0.6);
      if (contentScore === 0 || langScore === 0) totalScore = Math.min(totalScore, 3);
    }

    return jsonResponse({
      scores: { content_textstructure: contentScore, language: langScore, total: totalScore },
      feedback: openaiRes,
      corrections: "",
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= ENGLISCH: OCR ================= */
async function handleOCR(request, env) {
  const { image_base64 } = await request.json();
  if (!image_base64) {
    return jsonResponse({ error: "image_base64 required" }, 400, env);
  }

  const content = [
    { type: "text", text: "Transcribe all handwritten English text from this image. Return ONLY the transcribed text, nothing else." },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 2000, { model: "gpt-5.2", temperature: 0.1 });
  return jsonResponse({ text: text || "" }, 200, env);
}

/* ================= ENGLISCH: PARSE TASK ================= */
async function handleParseTask(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur Sprachmittlung Aufgabe. Extrahiere:
1. Die englische Aufgabenstellung (task_instruction)
2. Den deutschen Quelltext (article_text)
3. Die Überschrift/Titel (headline)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "article_text": "...", "headline": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 4000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ENGLISCH: MODEL ANSWER ================= */
async function handleModelAnswer(request, env) {
  const { source_text_de, task_en } = await request.json();
  if (!source_text_de || !task_en) {
    return jsonResponse({ error: "source_text_de and task_en required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B2/C1).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Mediation-Aufgabe auf ENGLISCH.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein — wie ein echter Aufsatz, den ein Schüler in der Prüfung abgeben würde.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich flüssig lesen lassen, mit sinnvollen Absätzen und Gedankenführung

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere, übersetze NICHT wörtlich
- Zielumfang: 200–280 Wörter

Formatiere als Markdown: Erst die Lösung, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_en, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ]);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= DEUTSCH: PARSE TASK (OCR) ================= */
async function handleParseTaskDeutsch(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Deutsch-Abitur Interpretationsaufgabe. Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben
2. Den literarischen Text (primary_text) - Gedicht, Dramenausschnitt oder Prosatext VOLLSTÄNDIG
3. Metadaten (primary_meta) - Autor, Titel, Erscheinungsjahr

Bei Gedichten: Alle Strophen und Verse extrahieren.
Bei Dramen: Den kompletten Dialog mit Sprecherangaben.
Bei Prosa: Den gesamten Textausschnitt.

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GESCHICHTE: GENERATE ================= */
async function handleGenerateGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;
  const totalBE = be || 60;
  const zeitMinuten = zeit || 180;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "G12 1.1 (22 Std.): Französische Revolution (Ursachen, Überwindung Ständegesellschaft, Terreur), Revolution von oben (Preußen/Bayern), Vormärz ab 1832, Revolution 1848/49 (Märzereignisse, Paulskirche, europäische Dimension, Bilanz). G12 1.2 (26 Std.): Kaiserreich (Industrialisierung, Soziale Frage, Bismarck, Obrigkeitsstaat), Wilhelminismus, Frauenbewegung, Erster Weltkrieg, Weimarer Republik (Verfassung, Parteien, Krisenjahre)" + (level === "eA" ? ". G12 1.3 (8 Std., nur eA): Vertiefungsmodul Jüdisches Leben (Emanzipation, Antisemitismus, kulturelle Beiträge)" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "G12 2.1 (21 Std.): Endphase Weimarer Republik (Präsidialkabinette, Radikalisierung), NS-Machtübernahme (Gleichschaltung, Ermächtigungsgesetz), Ideologie/Terror/Holocaust, Widerstand (20. Juli 1944). G12 2.2 (13 Std.): Zwei deutsche Staaten (Grundgesetz, SED-Diktatur, Mauerbau, Alltag BRD/DDR). G12 2.3 (11 Std.): Wiedervereinigung (Friedliche Revolution, Transformationsprozess, Aufarbeitung der SED-Diktatur)" + (level === "eA" ? ". G12 2.4 (11 Std., nur eA): Vertiefungsmodul Erinnerungskultur (Gedenkstätten, Historikerstreit, Aufarbeitung)" : "")
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "G13 1.1 (10 Std.): Israelisch-palästinensischer Konflikt (Diaspora, Zionismus, Staatsgründung 1948, Kriege, Friedensprozess). G13 1.2 (10 Std.): USA (Supermacht, Interventionismus, Selbstverständnis). G13 1.3 (10 Std.): Russland/Sowjetunion (Revolution, Kalter Krieg, Transformation). G13 1.4 (10 Std.): China (Revolution, Mao, Reform und Öffnung, Aufstieg zur Weltmacht)" + (level === "eA" ? ". G13 1.5 (8 Std., nur eA): Vertiefungsmodul Naher/Mittlerer Osten als Konfliktfeld" : "")
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen und Identifikationsmuster in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "G13 2.1 (10 Std.): Attische Demokratie (Polis, Volksversammlung, Grenzen). G13 2.2 (10 Std.): Aufklärung und Menschenrechte (Naturrecht, Gewaltenteilung, Verfassungen). G13 2.3 (14 Std.): Nationalismus im 19. Jh. (Kulturnation, Staatsnation, Nationalstaatsbildung). G13 2.4 (14 Std.): Deutsch-französische/deutsch-polnische Beziehungen, Europäische Integration (Montanunion, EWG, EU)"
    }
  };

  const selectedSchwerpunkt = schwerpunkt === "random"
    ? Object.keys(schwerpunkte)[Math.floor(Math.random() * 4)]
    : schwerpunkt;
  const sp = schwerpunkte[selectedSchwerpunkt];

  const niveauText = level === "eA"
    ? "Erhöhtes Anforderungsniveau (eA). Komplexere Quellen, höherer Anteil AFB III, tiefere multiperspektivische Analyse."
    : "Grundlegendes Anforderungsniveau (gA). Schwerpunkt auf AFB I und II, zugänglicherer Quellenzugang.";

  const systemPrompt = `Du bist ein Experte für das bayerische Geschichte-Abitur (ab 2026, G9). Erstelle eine authentische Abituraufgabe exakt nach dem Format der offiziellen IQB-Beispielaufgaben.

SCHWERPUNKT: ${sp.titel} ${sp.zeitraum}
MÖGLICHE THEMEN: ${sp.themen}${schwerpunktZusatz}
ANFORDERUNGSNIVEAU: ${niveauText}

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE (Bewertungseinheiten)
- Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben
- Die Summe aller Teilaufgaben-BE muss exakt ${totalBE} ergeben
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im task_instruction-Feld
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

AUFGABENFORMAT (orientiert am offiziellen Beispielabitur Bayern):
Die Aufgabe besteht aus einem Einleitungstext, einer historischen Textquelle (= Material M 1) und 2 Teilaufgaben.

1. EINLEITUNG (2-4 Sätze):
   - Stellt den historischen Kontext her und führt zur Quelle hin
   - Kann ein Szenario enthalten (z.B. "An Ihrer Schule findet ... statt", "Im Rahmen eines Projekts ...")
   - Benennt die Quelle (z.B. "In seiner Rede ... legte XY dar (M 1).")
   - Beispiel: "Der deutsche Staatsrechtler Hugo Preuß legte am 14. November 1918 seine Kritik an der Revolutionsregierung dar (M 1)."

2. QUELLENMATERIAL (M 1) - ZWINGEND eine substanzielle TEXTQUELLE von 400-800 Wörtern:
   - Genres: Rede, Zeitungsartikel, Denkschrift, Brief, Memoiren, Flugblatt, Erlass, Vertragsauszug, Historikertext
   - MUSS einen REALEN historischen Autor und korrekten Kontext haben
   - Mit Zeilennummerierung (alle 5 Zeilen) und ggf. Fußnoten für schwierige Begriffe
   - Sprache muss dem Entstehungszeitraum entsprechen
   - Vollständige Quellenangabe: Autor, Titel/Textsorte, Datum, Publikationsort

3. TEILAUFGABEN mit Bewertungseinheiten (BE):
   Teilaufgabe 1 (AFB I/II, ca. 55-60% der BE):
   - Operatoren: "Arbeiten Sie aus M 1 heraus ...", "Analysieren Sie ...", "Stellen Sie mithilfe von M 1 dar ...", "Charakterisieren Sie ..."
   - Bezieht sich DIREKT auf die Quelle M 1

   Teilaufgabe 2 (AFB II/III, ca. 40-45% der BE):
   - Operatoren: "Beurteilen Sie ...", "Erörtern Sie, inwieweit ...", "Nehmen Sie Stellung ...", "Überprüfen Sie ..."
   - Verlangt Transfer, Urteilsbildung, Einbeziehung von Ergebnissen aus Teilaufgabe 1
   - Geht über die Quelle hinaus und erfordert eigenes Wissen

BEISPIELE FÜR KORREKTE AUFGABENSTELLUNGEN:
- "1 Arbeiten Sie aus dem Zeitungsartikel M 1 die Argumentation und Position von Hugo Preuß vor dem Hintergrund des Ringens um eine demokratische Ordnung heraus!"
- "2 Erörtern Sie, inwieweit die Weimarer Reichsverfassung ein Gegenmodell zum Obrigkeitsstaat des Deutschen Kaiserreichs entwirft!"
- "1 Stellen Sie auch mithilfe von M 1 zentrale Konfliktthemen in den israelisch-palästinensischen Beziehungen seit 1948 dar!"
- "2 Arbeiten Sie aus M 1 die Grundlinien für eine Lösung heraus und bewerten Sie diese differenziert!"

ABSOLUTE PFLICHT:
- Die Quelle MUSS historisch KORREKT sein mit realen Personen und Fakten
- Die Operatoren MÜSSEN den AFB-Stufen entsprechen
- Die Aufgabe MUSS zum Schwerpunkt passen
- Die Quelle MUSS 400-800 Wörter lang sein, NICHT kürzer!
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, die in den oben genannten Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Arbeiten Sie die Argumentation heraus (Demokratiekritik, Verfassungsforderung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
${level !== "eA" ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" oder Vertiefungsmodule (z.B. Jüdisches Leben, Erinnerungskultur, Naher/Mittlerer Osten) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}
- Die Hauptquelle M 1 ist IMMER ein Textdokument
- Optional kannst du 0-2 ergänzende Materialien (M 2, M 3) als Array "zusatz_materialien" hinzufügen: Schaubilder, Infografiken, Statistiken
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden (z.B. "Title 'Bevölkerungsentwicklung 2010-2024' centered at the top in bold black font, x-axis labeled 'Jahr', y-axis labeled 'Einwohner in Mio.'"). (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt geschrieben sein! (3) Layout, Farben, Stil, Proportionen und alle visuellen Elemente detailliert beschreiben. KEINE Karikaturen oder Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!
  - type "statistik": content = Markdown-Tabelle, title = Titel

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung: Einleitung + nummerierte Teilaufgaben (1, 2) mit BE-Angaben",
  "primary_text": "Die historische Textquelle M 1 (400-800 Wörter) MIT Quelleneinleitung (kursiv, vor dem eigentlichen Text, erklärt wer/was/wann)",
  "primary_meta": "Quellenangabe: Autor, Titel/Textsorte, Datum, Publikationsort",
  "zusatz_materialien": [
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ],
  "thema": "Konkretes Thema der Aufgabe",
  "schwerpunkt": "${selectedSchwerpunkt.replace('_', '/')}"
}`;

  const userPrompt = `Erstelle eine materialgebundene Abituraufgabe für das Fach Geschichte (Bayern, G9, ab 2026).

Schwerpunkt: ${sp.titel} ${sp.zeitraum}
Anforderungsniveau: ${level || "gA"}
${level !== "eA" ? `WICHTIG: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-Vertiefungsmodule oder eA-exklusive Themen!` : ""}

KRITISCH:
- Die Textquelle M 1 MUSS mindestens 500-800 Wörter lang sein! Schreibe eine substanzielle, zusammenhängende historische Quelle mit MEHR Informationen als strikt nötig — Schüler müssen die relevanten Inhalte herausarbeiten.
- Verwende eine REALE historische Persönlichkeit als Autor der Quelle.
- Die Teilaufgaben müssen nummeriert sein (1, 2) mit BE-Angaben in Klammern.
- Orientiere dich exakt am Format der offiziellen bayerischen Beispielabitur-Aufgaben.
- ALLE Materialien (Texte, Statistiken, Bildtexte) müssen auf DEUTSCH sein!
- Erstelle IMMER 1-2 ergänzende Materialien (zusatz_materialien): z.B. ein Schaubild, eine Infografik oder ein Plakat (type "bild"). Der Bild-Prompt ist auf Englisch (mind. 3-5 Sätze), aber alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in "" mit exakter Positionsbeschreibung stehen. KEINE Rechtschreibfehler! KEINE Karikaturen oder Personen!
- VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 10000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= DEUTSCH: GENERATE ================= */
async function handleGenerateDeutsch(request, env) {
  const body = await request.json();
  const { type, gattung, epoche, schreibauftrag, thema, textsorte, typ, aufgabentyp, bearbeitungszeit } = body;
  const refZeit = 315;
  const refBE = 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  let systemPrompt, userPrompt;

  if (type === "interpretation") {
    systemPrompt = `Du bist ein Experte für das bayerische Deutsch-Abitur (ab 2026, G9). Erstelle eine authentische Interpretationsaufgabe.

WICHTIG - TEXTLÄNGEN WIE IM ECHTEN ABITUR:
- Bei LYRIK: Das KOMPLETTE Gedicht (3-7 Strophen, 20-40 Verse, ca. 100-200 Wörter). Bei Vergleichsaufgabe zusätzlich ein kürzeres Vergleichsgedicht (2-4 Strophen, 8-16 Verse).
- Bei DRAMA: Einen substantiellen Szenenausschnitt von 100-150 Zeilen Dialog mit Regieanweisungen (ca. 800-1200 Wörter). Eine zusammenhängende Szene mit echtem dramatischem Konflikt.
- Bei EPIK: Einen geschlossenen Prosatext von 1000-1500 Wörtern (ca. 2-3 Druckseiten). Vollständige Kurzgeschichte oder selbständig verständlicher Romanauszug.

Die Aufgabenstellung ist ZWEITEILIG:
- Teil 1 (70%): Erschließung und Interpretation des Textes
- Teil 2 (30%): Weiterführender Schreibauftrag (Vergleich, Stellungnahme, Kreativauftrag)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Untersuchen Sie die sprachlichen Mittel (Metapher, Alliteration, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Verwende bekannte, kanonische Texte der deutschen Literatur die du vollständig kennst.

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Zweiteilige Aufgabenstellung mit klarem Operator",
  "primary_text": "DER VOLLSTÄNDIGE LITERARISCHE TEXT in voller Länge!",
  "primary_meta": "Autor, Titel, Jahr",
  "compare_text": "VOLLSTÄNDIGER Vergleichstext oder null",
  "compare_meta": "Metadaten Vergleichstext oder null",
  "material_text": "Material für poetologische Aufgabe oder null",
  "material_meta": "Quelle oder null",
  "gattung": "${truncate(gattung, 100)}",
  "epoche": "Konkrete Epoche",
  "weight_part1": 70,
  "weight_part2": 30
}`;
    userPrompt = `Erstelle eine Interpretationsaufgabe:
- Gattung: ${truncate(gattung, 100)}
- Epoche: ${epoche === "random" ? "frei wählbar" : truncate(epoche, 100)}
- Weiterführender Auftrag: ${truncate(schreibauftrag, 500)}

KRITISCH - Textlängen wie im echten bayerischen Abitur:
- Lyrik: Komplettes Gedicht mit 3-7 Strophen, 20-40 Versen (ca. 100-200 Wörter). Bei Vergleich: zweites Gedicht mit 2-4 Strophen.
- Drama: 100-150 Zeilen zusammenhängender Dialog mit Sprecherangaben und Regieanweisungen (800-1200 Wörter)
- Epik: Geschlossener Prosatext von 1000-1500 Wörtern

Nutze bekannte Werke wie: Goethe (Faust, Werther, Gedichte), Schiller (Die Räuber, Kabale und Liebe), Kleist (Der zerbrochne Krug – G9-Pflichtlektüre!), Büchner (Woyzeck), Fontane, Kafka, Rilke, Trakl, Brecht, Eichendorff, Droste-Hülshoff, Erpenbeck (Heimsuchung – G9-Pflichtlektüre!), Borchert, Bachmann, Bernhard, Herta Müller, etc.

LehrplanPLUS-Epochen (G9): Klassik und Romantik, Realismus (19. Jh.), Moderne (Jahrhundertwende – Mitte 20. Jh.), Nachkriegszeit bis Mauerfall, Literatur seit 1989.
Ländergemeinsames Themenfeld 2026: "Umbrüche in der deutschsprachigen Literatur um 1900".`;

  } else if (type === "analyse") {
    systemPrompt = `Du erstellst Analyseaufgaben für pragmatische Texte (Deutsch-Abitur Bayern, ab 2026).

WICHTIG - TEXTLÄNGE WIE IM ECHTEN ABITUR:
- Der pragmatische Text muss 1000-1500 Wörter lang sein (ca. 2-3 Druckseiten)
- Das entspricht einem vollständigen Zeitungsartikel, Kommentar, Essay oder Redeauszug
- Der Text muss eine klare argumentative Struktur, sprachliche Gestaltungsmittel und eine erkennbare Intention haben
- Typische Quellen: FAZ, Die Zeit, Süddeutsche Zeitung, Spiegel, Reden, Fachessays

Die Aufgabenstellung ist ZWEITEILIG:
- Teil 1: Analyse des Textes (Argumentationsstruktur, sprachliche Mittel, Intention)
- Teil 2: Weiterführender Schreibauftrag

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Argumentationsstruktur (These, Belege, Schlussfolgerung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Zweiteilige Aufgabenstellung mit klaren Operatoren",
  "primary_text": "Der vollständige pragmatische Text (1000-1500 Wörter!)",
  "primary_meta": "Autor, Quelle (z.B. Zeitung), Erscheinungsdatum",
  "textsorte": "Textsorte (Kommentar, Essay, Rede, Kolumne, etc.)",
  "compare_text": "Vergleichstext oder null",
  "compare_meta": "Metadaten oder null"
}`;
    userPrompt = `Erstelle eine Analyseaufgabe:
- Textsorte: ${textsorte === "random" ? "frei wählbar" : truncate(textsorte, 200)}
- Thema: ${thema === "random" ? "frei wählbar" : truncate(thema, 200)}
- Weiterführend: ${truncate(schreibauftrag, 500)}

KRITISCH: Der Text MUSS 1000-1500 Wörter lang sein! Das ist die Länge eines vollständigen Zeitungsartikels oder Essays. Keine Zusammenfassung, sondern ein ausführlicher, durchargumentierter Text mit Einleitung, Hauptteil und Schluss.`;

  } else if (type === "eroerterung") {
    systemPrompt = `Du erstellst textbezogene Erörterungsaufgaben (Aufgabe 4, EP) für das Deutsch-Abitur Bayern G9 (ab 2026).

Bei der Erörterung pragmatischer Texte erhalten die Schüler einen heuristischen Zieltext und verfassen eine textbezogene Erörterung.

WICHTIG - TEXTLÄNGE WIE IM ECHTEN ABITUR:
- Der Ausgangstext muss 1000-1500 Wörter lang sein (ca. 2-3 Druckseiten)
- Das ist ein vollständiger journalistischer Meinungstext mit klarer These und Argumentation
- Der Text vertritt eine deutliche Position zu einem kontroversen Thema
- Typische Quellen: Zeitungskommentare, Kolumnen, Essays, Reden (FAZ, Die Zeit, SZ, Spiegel)

Die Aufgabenstellung hat ZWEI Teile:
- Teil a) (~40%): Analyse der zentralen Aussage und Argumentationsstruktur des Textes
- Teil b) (~60%): Erörterung der im Text vertretenen Position (eigene Stellungnahme mit Argumenten und Beispielen)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die Position des Autors (Digitalisierung, soziale Medien, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Zweiteilige Aufgabenstellung: a) Analyse der Argumentation, b) Erörterung der Position",
  "primary_text": "Der vollständige Ausgangstext mit klarer Position (1000-1500 Wörter!)",
  "primary_meta": "Autor, Quelle, Erscheinungsdatum",
  "thema": "Themenbereich"
}`;
    userPrompt = `Erstelle eine textbezogene Erörterungsaufgabe (Aufgabe 4, EP):
- Thema: ${thema === "random" ? "frei wählbar (aktuell, kontrovers, gesellschaftlich relevant)" : truncate(thema, 200)}

KRITISCH: Der Ausgangstext MUSS 1000-1500 Wörter lang sein! Ein vollständiger Meinungsartikel mit These, Argumenten, Belegen und Schlussfolgerung. Keine Kurzfassung!
Die Aufgabe muss zweiteilig sein: a) Analyse der Argumentation (~40%) + b) Erörterung der Position (~60%).`;

  } else if (type === "materialgestuetzt") {
    systemPrompt = `Du erstellst materialgestützte Schreibaufgaben für das Deutsch-Abitur Bayern (ab 2026).

WICHTIG - MATERIALIEN WIE IM ECHTEN ABITUR:
Im echten Abitur gibt es 5-9 Materialien mit insgesamt 2000-3500 Wörtern Lesematerial.

Erstelle genau 6-8 verschiedene Materialien:
- Textmaterialien (type "text"): MINDESTENS 400-800 Wörter pro Material! Vollständige Textauszüge aus Zeitungsartikeln, Fachtexten, Essays, Interviews oder Reden. Echte Argumentation, NICHT nur Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten.
- Statistiken (type "statistik"): Als Markdown-Tabelle mit konkreten Zahlen und Prozentwerten formatieren. Mindestens 6-10 Datenzeilen. Unter der Tabelle eine kurze Beschreibung der Erhebung.
- Mindestens 1-2 Materialien vom Typ "statistik" (Umfrage, Studie, Statistik als Tabelle)
- Mindestens 4 Materialien vom Typ "text" (Zeitungsartikel, Fachtext, Essay, Interview, Rede)
- 1 Material kann ein kürzeres Zitat/Expertenaussage sein (type "text", 100-200 Wörter)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Setzen Sie sich mit dem Thema auseinander (Pro/Contra, gesellschaftliche Folgen, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

- Erstelle IMMER 1-2 Materialien vom Typ "bild" (KI-generiertes Schaubild/Infografik/Illustration):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden (z.B. "Title 'Wirtschaftswachstum in Deutschland' centered at top in bold, x-axis labeled 'Jahr'"). (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Karikaturen oder Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Präzise Aufgabenstellung mit Textsorte, Adressat, Anlass und konkretem Schreibauftrag",
  "zieltext": "Geforderte Textsorte",
  "zielgruppe": "Adressaten",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Inhalt (300-600 Wörter)", "source": "Autor, Quelle, Jahr"},
    {"title": "Titel der Statistik", "type": "statistik", "content": "| Kategorie | Wert |\\n|---|---|\\n| ... | ... |\\nBeschreibung der Statistik.", "source": "Institut/Studie, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ]
}`;
    userPrompt = `Erstelle eine materialgestützte Aufgabe:
- Typ: ${aufgabentyp === "argumentieren" ? "Argumentierender Beitrag" : "Informierender Text"}
- Thema: ${thema === "random" ? "frei wählbar" : truncate(thema, 200)}
- Zieltextsorte: ${truncate(textsorte, 200)}

KRITISCH - Längen wie im echten Abitur:
- 6-8 Materialien insgesamt
- Jedes Textmaterial MINDESTENS 400-800 Wörter (vollständige Auszüge, NICHT Stichpunkte oder Zusammenfassungen!)
- Die Materialien sollen MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten
- Statistiken als Markdown-Tabelle mit echten, plausiblen Zahlen (6-10 Zeilen)
- Gesamtes Lesematerial: ca. 3000-5000 Wörter
- IMMER 1-2 Bilder als Material erstellen`;
  } else {
    return jsonResponse({ error: "Unbekannter Aufgabentyp." }, 400, env);
  }

  // Längere Texte brauchen mehr Tokens (Epik/Analyse/Erörterung: 1000-1500 Wörter ≈ 10000+ Tokens)
  const tokenMap = { interpretation: 10000, analyse: 10000, eroerterung: 10000, materialgestuetzt: 16000 };
  const maxTokens = tokenMap[type] || 8000;
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(maxTokens, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= DEUTSCH: GRADE ================= */
async function handleGradeDeutsch(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, type, materials, zieltext, zielgruppe } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Ausgangstext:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  if (zieltext) contextInfo += `Geforderter Zieltext: ${truncate(zieltext, 200)}\n`;
  if (zielgruppe) contextInfo += `Zielgruppe: ${truncate(zielgruppe, 200)}\n`;

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      const weight = type === "materialgestuetzt" ? 0.6 : 0.7;
      gesamt = Math.round(verstehen * weight + darstellung * (1 - weight));
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= DEUTSCH: MODEL ANSWER ================= */
async function handleModelAnswerDeutsch(request, env) {
  const { task_instruction, primary_text, primary_meta, compare_text, material_text, type, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Deutsch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit eleganten Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Aufsatz lesen — mit sinnvollen Absätzen und klarer Gedankenführung
- Strukturiere klar (Einleitung, Hauptteil, Schluss), aber gliedere durch Absätze, NICHT durch Aufzählungen

Inhaltlich:
- Verwende Fachbegriffe korrekt
- Belege Aussagen mit Textzitaten
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion, welche Strategien verwendet wurden.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}\n\nHAUPTTEXT:\n${truncate(primary_text, 15000)}`;
  if (primary_meta) userContent += `\n(${truncate(primary_meta, 500)})`;
  if (compare_text) userContent += `\n\nVERGLEICHSTEXT:\n${truncate(compare_text, 10000)}`;
  if (material_text) userContent += `\n\nMATERIAL:\n${truncate(material_text, 10000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= STUDENT: GET OWN RESULTS ================= */
async function handleStudentResults(request, env) {
  const { student_name } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name required" }, 400, env);
  }

  const nameLower = student_name.trim().toLowerCase();
  const { results } = await env.DB.prepare(
    "SELECT id, student_name, course, type, topic, content, language, total, created_at AS date FROM results WHERE LOWER(TRIM(student_name)) = ? ORDER BY created_at ASC"
  ).bind(nameLower).all();

  return jsonResponse({ results: results || [] }, 200, env);
}

/* ================= IMAGE GENERATION: GEMINI FLASH ================= */
async function handleGenerateImage(request, env) {
  const { prompt } = await request.json();
  if (!prompt) {
    return jsonResponse({ error: "prompt erforderlich." }, 400, env);
  }

  // Strukturierter Prompt für hochwertige Bildgenerierung
  const enhancedPrompt = `Generate a high-quality, professional educational illustration for a German Abitur exam.

STYLE REQUIREMENTS:
- Clean, modern infographic or diagram style with crisp lines, vivid colors, and professional typography
- High contrast and sharp details suitable for educational materials
- White or light neutral background for clarity
- No watermarks, no logos, no decorative borders

TEXT REQUIREMENTS:
- ALL text, labels, titles, annotations, and captions within the image MUST be in GERMAN
- Use correct German spelling and grammar for every word
- Text must be clearly legible with appropriate font sizes

SUBJECT TO ILLUSTRATE:
${prompt}

ADDITIONALLY: After generating the image, write a short, factual German caption (max 15 words) that describes what the image shows. Write ONLY the caption text, no prefix like "Abb." or quotes.`;

  try {
    // Bild generieren via Gemini 3.1 Flash Image Preview (2K-Auflösung)
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GOOGLE_AI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: enhancedPrompt }]
          }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            imageConfig: {
              aspectRatio: "16:9",
              outputOptions: { resolution: "2048" }
            }
          }
        })
      }
    );
    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const errMsg = geminiData.error?.message || JSON.stringify(geminiData).substring(0, 200) || "Gemini Fehler";
      return jsonResponse({ error: `Gemini API ${geminiRes.status}: ${errMsg}` }, geminiRes.status, env);
    }

    // Bild- und Text-Parts aus der Antwort extrahieren
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imagePart) {
      return jsonResponse({ error: "Kein Bild generiert. Response: " + JSON.stringify(geminiData).substring(0, 300) }, 500, env);
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const dataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

    // Caption aus der Gemini-Antwort extrahieren (da wir sie explizit angefordert haben)
    const textPart = parts.find(p => p.text);
    let caption = "";
    if (textPart?.text) {
      // Erste Zeile als Caption nehmen, da der Prompt das so anfordert
      const lines = textPart.text.trim().split("\n").filter(l => l.trim());
      caption = lines[0]?.replace(/^["„"']|["„"']$/g, "").trim() || "";
      // Zu lange Captions kürzen
      if (caption.length > 120) caption = caption.substring(0, 117) + "...";
    }

    // Fallback: Nur wenn Gemini keine Caption liefert, via GPT generieren
    if (!caption) {
      try {
        const captionRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: `Schreibe eine kurze, sachliche deutsche Bildunterschrift (max. 15 Wörter) für ein generiertes Bild zum Thema. Nur die Bildunterschrift, kein "Abb." Präfix, keine Anführungszeichen.\n\nThema: ${prompt}` }],
            max_tokens: 60,
            temperature: 0.3
          })
        });
        const captionData = await captionRes.json();
        caption = captionData.choices?.[0]?.message?.content?.trim() || "";
      } catch { }
    }

    return jsonResponse({
      url: dataUrl,
      credit: "Google Gemini",
      caption
    }, 200, env);
  } catch (e) {
    return jsonResponse({ error: "Bildgenerierung fehlgeschlagen: " + e.message }, 500, env);
  }
}

/* ================= IMAGE FETCH: LEGACY ENDPOINT ================= */
async function handleFetchUnsplash(request, env) {
  const { keywords } = await request.json();
  if (!keywords) {
    return jsonResponse({ error: "keywords erforderlich." }, 400, env);
  }
  // Redirect to Imagen generation with keywords as prompt
  const fakeReq = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: keywords })
  });
  return handleGenerateImage(fakeReq, env);
}

/* ================= D1 HELPER ================= */
async function d1GetAllResults(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, student_name, course, type, topic, content, language, total, created_at AS date FROM results ORDER BY created_at ASC"
  ).all();
  return results || [];
}

/* ================= DASHBOARD: SUBMIT RESULT ================= */
async function handleSubmitResult(request, env) {
  const { student_name, course, type, topic, content, language, total, date } = await request.json();

  if (!student_name || typeof student_name !== "string" || total == null) {
    return jsonResponse({ error: "student_name and total required" }, 400, env);
  }

  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
  const sName = truncate(student_name, 100);
  const nameLower = sName.trim().toLowerCase();
  const studentRow = await env.DB.prepare("SELECT id FROM students WHERE name_lower = ?").bind(nameLower).first();

  await env.DB.prepare(
    "INSERT INTO results (id, student_id, student_name, course, type, topic, content, language, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    studentRow ? studentRow.id : null,
    sName,
    truncate(course || "", 20),
    truncate(type || "mediation", 50),
    truncate(topic || "—", 500),
    content ?? null,
    language ?? null,
    total,
    date || new Date().toISOString()
  ).run();

  return jsonResponse({ success: true }, 200, env);
}

/* ================= DASHBOARD: TEACHER LOGIN ================= */
async function handleTeacherLogin(request, env) {
  const { teacher_password } = await request.json();
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!teacher_password || typeof teacher_password !== "string") {
    return jsonResponse({ error: "Passwort erforderlich." }, 400, env);
  }
  const valid = await safeCompare(teacher_password, env.TEACHER_PASSWORD);
  if (!valid) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401, env);
  }
  const token = await generateToken(env, env.TEACHER_PASSWORD);
  return jsonResponse({ success: true, token }, 200, env);
}

/* ================= DASHBOARD: GET RESULTS ================= */
async function handleGetResults(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const results = await d1GetAllResults(env);

  return jsonResponse({ results }, 200, env);
}

/* ================= DASHBOARD: DELETE RESULT ================= */
async function handleDeleteResult(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { result_id } = await request.json();
  if (!result_id || typeof result_id !== "string") {
    return jsonResponse({ error: "result_id required" }, 400, env);
  }

  await env.DB.prepare("DELETE FROM results WHERE id = ?").bind(result_id).run();
  return jsonResponse({ success: true }, 200, env);
}

/* ================= DASHBOARD: GET REGISTERED STUDENTS ================= */
async function handleGetStudents(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { results: students } = await env.DB.prepare(
    "SELECT name, level, hidden_subjects, created_at AS date FROM students ORDER BY name ASC"
  ).all();

  const safe = (students || []).map(s => ({
    name: s.name,
    level: s.level || "",
    date: s.date || "",
    hidden_subjects: JSON.parse(s.hidden_subjects || "[]"),
  }));

  return jsonResponse({ success: true, students: safe }, 200, env);
}

/* ================= DASHBOARD: DELETE STUDENT ================= */
async function handleDeleteStudent(request, env) {
  const token = request.headers.get("X-Teacher-Token");
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!token || !(await verifyToken(token, env, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Nicht autorisiert. Bitte erneut einloggen." }, 401, env);
  }

  const { student_name } = await request.json();
  if (!student_name || typeof student_name !== "string") {
    return jsonResponse({ error: "student_name required" }, 400, env);
  }

  const result = await env.DB.prepare("DELETE FROM students WHERE name = ?").bind(student_name).run();
  if (result.meta.changes === 0) {
    return jsonResponse({ error: "Schüler nicht gefunden." }, 404, env);
  }
  // CASCADE loescht automatisch zugehoerige Results

  const countResult = await env.DB.prepare("SELECT COUNT(*) as cnt FROM students").first();
  return jsonResponse({ success: true, remaining: countResult.cnt }, 200, env);
}

/* ================= POLITIK UND GESELLSCHAFT: PARSE TASK (OCR) ================= */
async function handleParseTaskPuG(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Politik und Gesellschaft (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Quellentexten, Statistiken, Zitaten
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= POLITIK UND GESELLSCHAFT: GENERATE ================= */
async function handleGeneratePuG(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const hjThemen = {
    "12_1": {
      title: "Frieden und Sicherheit als Motive deutscher Außenpolitik und das europäische Projekt",
      lernbereiche: "LB 12.1 (Frieden und Sicherheit) und LB 12.2 (Das europäische Projekt)",
      inhalte: `- Negativer und positiver Frieden, Frieden als Prozess
- Mittel bundesdeutscher Außenpolitik: Diplomatie, Bündnisse, Sanktionen
- Einflussfaktoren: historische Verantwortung, geostrategische Lage, internationale Organisationen, Grundgesetz, wirtschaftliche Interessen
- Umfassender Sicherheitsbegriff: vernetzte Sicherheit, ressortgemeinsamer Ansatz
- Bundeswehr als Parlamentsarmee, Auslandseinsätze
- Kopenhagener Kriterien, EU-Erweiterung, Aufnahmefähigkeit
- Szenarien zukünftiger EU-Entwicklung, GASP, Europäische Armee`,
      schwerpunkte: {
        aussenpolitik: "Deutsche Außenpolitik und Bundeswehreinsätze",
        sicherheit: "Umfassender Sicherheitsbegriff und vernetzte Sicherheit",
        eu_erweiterung: "EU-Erweiterung, Kopenhagener Kriterien und EU-Zukunftsszenarien",
        gasp: "Gemeinsame Außen- und Sicherheitspolitik der EU"
      }
    },
    "12_2": {
      title: "Politische Theorien, Politische Systeme und Demokratieförderung",
      lernbereiche: isEA
        ? "LB 12.3 (Politische Theorien und Utopien), LB 12.4 (Politische Systeme vergleichen) und LB 12.5 (Demokratieförderung)"
        : "LB 12.3 (Politische Systeme vergleichen) und LB 12.4 (Demokratieförderung)",
      inhalte: isEA
        ? `- Liberalismus, Konservativismus, Sozialismus (Verhältnis Individuum – Staat)
- Staatstheoretische Ansätze der Aufklärung (Locke, Montesquieu)
- Utopien und Dystopien: Definition, Merkmale, politisch-gesellschaftliche Funktionen
- Kriterien zur Bestimmung politischer Systeme: Partizipation, Gewaltenteilung, Rechtsstaat
- Herrschaftsbegriff: Legitimation, Zugang, Anspruch, Weise, Monopol, Struktur
- Parlamentarische, semipräsidentielle, präsidentielle Demokratien
- Digitalisierung und politische Willensbildung
- Demokratisierungsprozesse von innen und außen, Akteure der Demokratieförderung`
        : `- Formen politischer Teilhabe auf Bundesebene
- Kriterien zur Bestimmung politischer Systeme
- Menschenrechte als Unterscheidungsmerkmal Demokratie/Diktatur
- Digitalisierung und politische Willensbildung
- Demokratieförderung: Chancen und Grenzen`,
      schwerpunkte: {
        liberalismus: "Politische Theorien zum Verhältnis Individuum und Staat",
        politische_systeme: "Vergleich politischer Systeme (parlamentarisch, semipräsidentiell, präsidentiell)",
        demokratiefoerderung: "Demokratisierungsprozesse und Demokratieförderung",
        digitalisierung_politik: "Digitalisierung und politische Willensbildung"
      }
    },
    "13_1": {
      title: "Modernisierungsprozesse und ihre Auswirkungen auf Gesellschaft und Politik",
      lernbereiche: isEA
        ? "LB 13.1 (Soziologische Theorien) und LB 13.2 (Modernisierungsprozesse und Zusammenleben)"
        : "LB 13.1 (Modernisierungsprozesse und Zusammenleben)",
      inhalte: isEA
        ? `- Dimensionen der Modernisierung: Domestizierung, Differenzierung, Rationalisierung, Individualisierung
- Soziologische Theorien als Erklärungsansätze
- Familienformen im Wandel
- Geschlechterrollen: Hierarchien, Emanzipation, Gender Pay Gap, Sexismus
- Familienpolitische Maßnahmen, Quotenregelungen
- Digitalisierung der Arbeitswelt: Flexibilisierung, lebenslanges Lernen
- Robotik und KI: Herausforderungen, Gewerkschaften und betriebliche Mitbestimmung
- Plattformökonomie und neue Arbeitsformen`
        : `- Zeitgenössische Familienformen
- Geschlechterrollen: Gender Pay/Time Gap, Gleichstellung
- Digitalisierung der Arbeitswelt: Industrie 4.0, Chancen und Herausforderungen
- Staatliche Maßnahmen zur Gleichstellung`,
      schwerpunkte: {
        modernisierung: "Dimensionen der Modernisierung (Domestizierung, Differenzierung, Rationalisierung, Individualisierung)",
        arbeitswelt: "Digitalisierung der Arbeitswelt und Industrie 4.0",
        geschlechter: "Geschlechterrollen, Gender Pay Gap und Gleichstellungspolitik",
        gewerkschaften: "Gewerkschaften und betriebliche Mitbestimmung in der digitalen Arbeitswelt"
      }
    },
    "13_2": {
      title: "Soziale Ungleichheit, internationale Konfliktbearbeitung und Völkerrecht",
      lernbereiche: isEA
        ? "LB 13.3 (Soziale Ungleichheit), LB 13.4 (Internationale Beziehungen) und LB 13.5 (Völkerrecht)"
        : "LB 13.2 (Soziale Ungleichheit) und LB 13.3 (Internationale Beziehungen und Völkerrecht)",
      inhalte: `- Einkommens- und Vermögensverteilung, Gini-Koeffizient, Armutsquote
- Dimensionen sozialer Ungleichheit: Einkommen, Bildung, Gesundheit
- Sozialstaatsprinzip (Art. 20 GG), Modelle des Sozialstaats
- Sozialpolitische Maßnahmen: Mindestlohn, Transfers, Steuerprogression
- Staatliche, transnationale und supranationale Akteure (IGOs, NGOs, Wirtschaftsunternehmen)
- Kennzeichen des Völkerrechts: Souveränität, Gewohnheitsrecht, Kodifizierung, eingeschränkte Sanktionierbarkeit
- Humanitäres Völkerrecht, Gewaltverbot, Selbstverteidigungsrecht
- Internationaler Strafgerichtshof: Aufbau, Zuständigkeiten, Römisches Statut
- Menschenrechte: UN-Menschenrechtskonvention
- Medien als Akteure der internationalen Politik
- Private Sicherheitsfirmen, hybride Kriegsführung`,
      schwerpunkte: {
        soziale_ungleichheit: "Einkommens-/Vermögensverteilung und Dimensionen sozialer Ungleichheit",
        sozialstaat: "Sozialstaatsprinzip und sozialpolitische Maßnahmen",
        voelkerrecht: "Kennzeichen und Grenzen des Völkerrechts",
        igos_ngos: "Rolle von IGOs und NGOs in der internationalen Politik",
        istgh: "Internationaler Strafgerichtshof und Menschenrechte",
        medien: "Medien als Akteure der internationalen Politik"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Politik und Gesellschaft (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Reproduktion (Anforderungsebene I) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Reorganisation und Transfer (Ebene II) – z.B. "Ermitteln Sie aus M1 …", "Arbeiten Sie … heraus!"
- Letzte Teilaufgabe: Reflexion und Problemlösung (Ebene III) – z.B. "Beurteilen Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, nennen, ermitteln, erarbeiten, erläutern, analysieren, vergleichen, begründen, beurteilen, bewerten, diskutieren, Stellung nehmen
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (Text ODER Statistik)' : totalBE < 40 ? '1-2 Materialien (Texte, Statistiken)' : '2-3 Materialien (Texte, Statistiken, Bilder)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche Quellentexte (Zeitungsartikel, Interviews, Reden, Fachtexte). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (KI-generiertes Schaubild/Infografik/Illustration):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden (z.B. "Title 'Soziale Marktwirtschaft' centered at top in bold"). (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Karikaturen oder Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag, Leserbrief, digitale Pinnwand)
- Das macht die Aufgabe authentischer und prüft Adressatenorientierung

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie das Sozialstaatsprinzip (Arbeitslosenversicherung, Sozialhilfe, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte und Lernbereiche. Themen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Politische Theorien/Utopien, Soziologische Theorien als eigener LB, zusätzliche eA-Lernbereiche), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (200-500 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Titel ggf. Statistik", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ],
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Politik und Gesellschaft:
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 2-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (I → II → III).
Erstelle 2-3 passende Materialien (Texte, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein — vollständige, ausführliche Quellentexte, NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als für die Aufgaben nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten.
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= POLITIK UND GESELLSCHAFT: GRADE ================= */
async function handleGradePuG(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= POLITIK UND GESELLSCHAFT: MODEL ANSWER ================= */
async function handleModelAnswerPuG(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Politik und Gesellschaft (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende politikwissenschaftliche Fachbegriffe korrekt
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsebenen
- Formuliere bei Reflexionsaufgaben ein eigenständiges, begründetes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= PUG ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturPuG(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const hjThemen = {
    "12_1": {
      title: "Frieden und Sicherheit als Motive deutscher Außenpolitik und das europäische Projekt",
      lernbereiche: "LB 12.1 (Frieden und Sicherheit) und LB 12.2 (Das europäische Projekt)",
      inhalte: `- Negativer und positiver Frieden, Frieden als Prozess
- Mittel bundesdeutscher Außenpolitik: Diplomatie, Bündnisse, Sanktionen
- Einflussfaktoren: historische Verantwortung, geostrategische Lage, internationale Organisationen, Grundgesetz, wirtschaftliche Interessen
- Umfassender Sicherheitsbegriff: vernetzte Sicherheit, ressortgemeinsamer Ansatz
- Bundeswehr als Parlamentsarmee, Auslandseinsätze
- Kopenhagener Kriterien, EU-Erweiterung, Aufnahmefähigkeit
- Szenarien zukünftiger EU-Entwicklung, GASP, Europäische Armee`,
      schwerpunkte: {
        aussenpolitik: "Deutsche Außenpolitik und Bundeswehreinsätze",
        sicherheit: "Umfassender Sicherheitsbegriff und vernetzte Sicherheit",
        eu_erweiterung: "EU-Erweiterung, Kopenhagener Kriterien und EU-Zukunftsszenarien",
        gasp: "Gemeinsame Außen- und Sicherheitspolitik der EU"
      }
    },
    "12_2": {
      title: "Politische Theorien, Politische Systeme und Demokratieförderung",
      lernbereiche: isEA
        ? "LB 12.3 (Politische Theorien und Utopien), LB 12.4 (Politische Systeme vergleichen) und LB 12.5 (Demokratieförderung)"
        : "LB 12.3 (Politische Systeme vergleichen) und LB 12.4 (Demokratieförderung)",
      inhalte: isEA
        ? `- Liberalismus, Konservativismus, Sozialismus (Verhältnis Individuum – Staat)
- Staatstheoretische Ansätze der Aufklärung (Locke, Montesquieu)
- Utopien und Dystopien: Definition, Merkmale, politisch-gesellschaftliche Funktionen
- Kriterien zur Bestimmung politischer Systeme: Partizipation, Gewaltenteilung, Rechtsstaat
- Herrschaftsbegriff: Legitimation, Zugang, Anspruch, Weise, Monopol, Struktur
- Parlamentarische, semipräsidentielle, präsidentielle Demokratien
- Digitalisierung und politische Willensbildung
- Demokratisierungsprozesse von innen und außen, Akteure der Demokratieförderung`
        : `- Formen politischer Teilhabe auf Bundesebene
- Kriterien zur Bestimmung politischer Systeme
- Menschenrechte als Unterscheidungsmerkmal Demokratie/Diktatur
- Digitalisierung und politische Willensbildung
- Demokratieförderung: Chancen und Grenzen`,
      schwerpunkte: {
        liberalismus: "Politische Theorien zum Verhältnis Individuum und Staat",
        politische_systeme: "Vergleich politischer Systeme (parlamentarisch, semipräsidentiell, präsidentiell)",
        demokratiefoerderung: "Demokratisierungsprozesse und Demokratieförderung",
        digitalisierung_politik: "Digitalisierung und politische Willensbildung"
      }
    },
    "13_1": {
      title: "Modernisierungsprozesse und ihre Auswirkungen auf Gesellschaft und Politik",
      lernbereiche: isEA
        ? "LB 13.1 (Soziologische Theorien) und LB 13.2 (Modernisierungsprozesse und Zusammenleben)"
        : "LB 13.1 (Modernisierungsprozesse und Zusammenleben)",
      inhalte: isEA
        ? `- Dimensionen der Modernisierung: Domestizierung, Differenzierung, Rationalisierung, Individualisierung
- Soziologische Theorien als Erklärungsansätze
- Familienformen im Wandel
- Geschlechterrollen: Hierarchien, Emanzipation, Gender Pay Gap, Sexismus
- Familienpolitische Maßnahmen, Quotenregelungen
- Digitalisierung der Arbeitswelt: Flexibilisierung, lebenslanges Lernen
- Robotik und KI: Herausforderungen, Gewerkschaften und betriebliche Mitbestimmung
- Plattformökonomie und neue Arbeitsformen`
        : `- Zeitgenössische Familienformen
- Geschlechterrollen: Gender Pay/Time Gap, Gleichstellung
- Digitalisierung der Arbeitswelt: Industrie 4.0, Chancen und Herausforderungen
- Staatliche Maßnahmen zur Gleichstellung`,
      schwerpunkte: {
        modernisierung: "Dimensionen der Modernisierung (Domestizierung, Differenzierung, Rationalisierung, Individualisierung)",
        arbeitswelt: "Digitalisierung der Arbeitswelt und Industrie 4.0",
        geschlechter: "Geschlechterrollen, Gender Pay Gap und Gleichstellungspolitik",
        gewerkschaften: "Gewerkschaften und betriebliche Mitbestimmung in der digitalen Arbeitswelt"
      }
    },
    "13_2": {
      title: "Soziale Ungleichheit, internationale Konfliktbearbeitung und Völkerrecht",
      lernbereiche: isEA
        ? "LB 13.3 (Soziale Ungleichheit), LB 13.4 (Internationale Beziehungen) und LB 13.5 (Völkerrecht)"
        : "LB 13.2 (Soziale Ungleichheit) und LB 13.3 (Internationale Beziehungen und Völkerrecht)",
      inhalte: `- Einkommens- und Vermögensverteilung, Gini-Koeffizient, Armutsquote
- Dimensionen sozialer Ungleichheit: Einkommen, Bildung, Gesundheit
- Sozialstaatsprinzip (Art. 20 GG), Modelle des Sozialstaats
- Sozialpolitische Maßnahmen: Mindestlohn, Transfers, Steuerprogression
- Staatliche, transnationale und supranationale Akteure (IGOs, NGOs, Wirtschaftsunternehmen)
- Kennzeichen des Völkerrechts: Souveränität, Gewohnheitsrecht, Kodifizierung, eingeschränkte Sanktionierbarkeit
- Humanitäres Völkerrecht, Gewaltverbot, Selbstverteidigungsrecht
- Internationaler Strafgerichtshof: Aufbau, Zuständigkeiten, Römisches Statut
- Menschenrechte: UN-Menschenrechtskonvention
- Medien als Akteure der internationalen Politik
- Private Sicherheitsfirmen, hybride Kriegsführung`,
      schwerpunkte: {
        soziale_ungleichheit: "Einkommens-/Vermögensverteilung und Dimensionen sozialer Ungleichheit",
        sozialstaat: "Sozialstaatsprinzip und sozialpolitische Maßnahmen",
        voelkerrecht: "Kennzeichen und Grenzen des Völkerrechts",
        igos_ngos: "Rolle von IGOs und NGOs in der internationalen Politik",
        istgh: "Internationaler Strafgerichtshof und Menschenrechte",
        medien: "Medien als Akteure der internationalen Politik"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const schwerpunktZusatz = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? `\n\n⚠️ THEMATISCHER SCHWERPUNKT: ${hj.schwerpunkte[schwerpunkt]}\nDie Aufgabe muss sich schwerpunktmäßig auf dieses Thema beziehen.`
    : '';

  // Determine a different Halbjahr for Teil B transfer
  const allHJ = ["12_1", "12_2", "13_1", "13_2"];
  const otherHJ = allHJ.filter(h => h !== halbjahr);
  const transferHJ = otherHJ[Math.floor(Math.random() * otherHJ.length)];
  const transferThema = hjThemen[transferHJ]?.title || "";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Politik und Gesellschaft (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abituraufgabe bestehend aus Prüfungsteil A UND Prüfungsteil B auf ${niveauLabel}.

=== PRÜFUNGSTEIL A (${bePruefungA}) ===
STRUKTUR:
- 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Reproduktion (Ebene I) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Reorganisation und Transfer (Ebene II) – z.B. "Ermitteln Sie aus M1 …", "Arbeiten Sie … heraus!"
- Letzte Teilaufgabe: Reflexion und Problemlösung (Ebene III) – z.B. "Beurteilen Sie …", "Diskutieren Sie …"
- Gib bei jeder Teilaufgabe die BE an, Summe = ${bePruefungA}
- Verwende offizielle Operatoren: darstellen, beschreiben, nennen, ermitteln, erarbeiten, erläutern, analysieren, vergleichen, begründen, beurteilen, bewerten, diskutieren, Stellung nehmen

MATERIALIEN (nur für Teil A):
- 2-3 realistische Materialien (Texte, Statistiken, Bilder)
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Vollständige, ausführliche Quellentexte — NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte selbst herausarbeiten müssen.
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (KI-generiertes Schaubild/Infografik/Illustration):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden. (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Karikaturen oder Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie das Sozialstaatsprinzip (Arbeitslosenversicherung, Sozialhilfe, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte und Lernbereiche. Themen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Politische Theorien/Utopien, Soziologische Theorien als eigener LB, zusätzliche eA-Lernbereiche), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

=== PRÜFUNGSTEIL B – AUSWEITUNG (${bePruefungB}) ===
- EIGENSTÄNDIGE Aufgabe, die über die Materialien hinausgeht
- Transfer zu einem ANDEREN Halbjahr/Themenbereich oder breitere politikwissenschaftliche Reflexion
- Möglicher Transferbezug: ${transferHJ.replace("_", "/")} – ${transferThema}
- 1-2 Teilaufgaben auf Ebene II-III
- Gib BE an, Summe = ${bePruefungB}
- Teil B hat KEINE eigenen Materialien
- Typische Formulierungen: "Unabhängig von den Materialien …", "Unter Rückgriff auf Ihre Kenntnisse aus … erörtern Sie …"

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_a": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE-Angaben",
  "materials": [
    {"title": "Titel", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter!)", "source": "Autor, Quelle, Datum"},
    {"title": "Titel", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| ... | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ],
  "task_instruction_b": "Vollständige Aufgabenstellung Teil B (Ausweitung) mit BE-Angaben",
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine vollständige Abituraufgabe (Teil A + B) für Politik und Gesellschaft:
- Halbjahr (für Teil A): ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Gesamt-BE: ${beGesamt} (Teil A: ${bePruefungA}, Teil B: ${bePruefungB})

Teil A: 2-4 Teilaufgaben mit Materialien, steigendes Anforderungsniveau.
Teil B: Eigenständige Transferaufgabe OHNE Materialien, Bezug zu einem anderen Halbjahr oder übergreifende Reflexion.

KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein! Vollständige Quellentexte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER mindestens 1 Bild als Material.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(14000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= PUG ABITUR: GRADE ================= */
async function handleGradeAbiturPuG(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text_a/b und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `=== PRÜFUNGSTEIL A ===\nAufgabenstellung:\n${truncate(task_instruction_a, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  contextInfo += `=== PRÜFUNGSTEIL B (Ausweitung) ===\nAufgabenstellung:\n${truncate(task_instruction_b, 3000)}\n\n`;

  const korrekturAnweisung = KORREKTUR_AB;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext Teil A:\n${truncate(student_text_a, 15000)}\n\nSchülertext Teil B:\n${truncate(student_text_b, 10000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && teil_a != null && teil_b != null && darstellung != null) {
      gesamt = Math.round(teil_a * 0.5 + teil_b * 0.2 + darstellung * 0.3);
      if (teil_a === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= PUG ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturPuG(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Politik und Gesellschaft (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (Teil A + Teil B) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

PRÜFUNGSTEIL A:
- Bearbeite ALLE Teilaufgaben
- Verwende politikwissenschaftliche Fachbegriffe korrekt
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsebenen
- Formuliere bei Reflexionsaufgaben ein eigenständiges, begründetes Urteil

PRÜFUNGSTEIL B (Ausweitung):
- Bearbeite die Transferaufgabe eigenständig
- Beziehe Fachwissen aus anderen Halbjahren ein
- Zeige politikwissenschaftliche Urteilsfähigkeit
- Teil B hat KEINE Materialien – nutze dein Fachwissen

Zielumfang: Teil A ca. 800-1200 Wörter, Teil B ca. 400-600 Wörter.

Formatiere als Markdown mit klaren Überschriften für jeden Prüfungsteil und jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `PRÜFUNGSTEIL A – AUFGABE:\n${truncate(task_instruction_a, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }
  userContent += `\n\nPRÜFUNGSTEIL B – AUFGABE (Ausweitung):\n${truncate(task_instruction_b, 3000)}`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= WIRTSCHAFT UND RECHT: GENERATE ================= */
async function handleGenerateWR(request, env) {
  const body = await request.json();
  const { niveau, fachbereich, sachgebiet, unterpunkte, thema, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const isGA = (niveau || "gA").toLowerCase() === "ga";
  const niveauLabel = isGA ? "grundlegendes Anforderungsniveau (gA)" : "erhöhtes Anforderungsniveau (eA)";
  const gesamtBE = be || (isGA ? 100 : 60);
  const zeitMinuten = zeit || (isGA ? 210 : 135);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bloecke = isGA ? "2-3 Aufgabenblöcke (integriert: BWL+VWL+Recht)" : "2-3 Aufgabenblöcke";
  const materialCount = isGA ? "4-5 Materialien" : "3-4 Materialien";

  const fachbereiche = {
    bwl: {
      label: "Betriebswirtschaftslehre",
      themen: {
        unternehmensziele: "WR12 1.1: Ökonomische/ökologische/soziale/ethische Ziele, Zielwechselwirkungen, Stakeholder, Aufbau-/Ablauforganisation (nur eA: Wertschöpfung, Funktionsbereiche)",
        markt_produktion: "WR12 1.2: Beschaffungsarten (Einzel/JIT/Vorrat), Break-even-Analyse (Gewinnschwelle, fixe/variable Kosten), Marktsituation, ABC-Analyse, BCG-Portfolio (nur eA)",
        bilanzanalyse: "WR12 1.3 (nur eA): Bilanz, GuV, Lagebericht, Bilanzkennzahlen (Anlageintensität, EK-Quote, Deckungsgrade, Liquiditätsgrade), Rentabilitäten (EK-/GK-/Umsatzrentabilität), EBIT",
        investition: "WR12 1.4: Gewinnvergleichsrechnung, Amortisationsrechnung (eA: + Kapitalwertmethode), Eigen- vs. Fremdfinanzierung, Leverage-Effekt (nur eA)",
        management: "WR12 1.5 (nur eA): SWOT-Analyse, Wettbewerbsstrategien nach Porter, Kernkompetenzen, Managementfunktionen (Planung, Entscheidung, Aufgabenübertragung, Kontrolle)"
      }
    },
    vwl: {
      label: "Volkswirtschaftslehre",
      themen: {
        konjunktur: "WR12 2.1: Magisches Viereck (Wachstum, Beschäftigung, Preisniveaustabilität, außenwirtschaftliches GGW), Konjunkturzyklus, Konjunkturindikatoren, Zielbeziehungen",
        wirtschaftspolitik: "WR12 2.2: BIP (Verwendungs-/Entstehungsrechnung), Arbeitslosigkeit (friktionell/saisonal/konjunkturell/strukturell), Nachfrage-/Angebotstheorie, expansive/kontraktive Effekte, Staatsverschuldung, Umweltschutz/Klimaschutz",
        soziale_sicherung: "WR12 2.3: Tarifpartner, Sozialversicherung (Kranken-/Rentenversicherung), Umlage-/Kapitaldeckungsverfahren, demographischer Wandel, Moral Hazard (nur eA), soziale Gerechtigkeit (Leistungs-/Chancen-/Bedarfs-/Generationengerechtigkeit, nur eA), Beveridge-Modell, BGE (nur eA)",
        geldpolitik: "WR13 2.1: Preisniveaustabilität, EZB (Mandat, Unabhängigkeit), geldpolitische Instrumente (Zins-/Geldmengensteuerung), Transmissionsmechanismus, Wirkungsgrenzen, Kryptowährungen",
        aussenhandel: "WR13 2.2: Leistungsbilanz, Kapitalbilanz (nur eA), Wechselkursbildung (Marktmodell), Ursachen/Folgen von Wechselkursschwankungen (eA: + Spieltheorie, Gefangenendilemma, Nash-GGW, Pareto-Optimum)"
      }
    },
    recht: {
      label: "Recht",
      themen: {
        rechtsgrundlagen: "WR12 3.1: Systematik des BGB, Kaufhandlung, Trennungsprinzip, juristische Arbeitstechniken (Zitierweise, Normenanalyse, Subsumtionstechnik, Gutachtenstil)",
        gesetzl_schuld: "WR12 3.2: Herausgabeanspruch des Eigentümers, gutgläubiger Eigentumserwerb, § 823 I BGB (Schadensersatz), Gefährdungshaftung (nur eA: § 833 BGB, § 7 StVG)",
        vertragstypen: "WR13 1.1 (nur eA): Werk-/Werklieferungs-/Dienstvertrag, Leistungsstörungen (Pflichtverletzung, Fristsetzung, Rücktritt, Schadensersatz)",
        kaufrecht: "WR13 1.2: Mangelfreiheit (subjektive/objektive Anforderungen), Gewährleistung beim Verbrauchsgüterkauf (Nacherfüllung, Rücktritt, Minderung, Schadensersatz), Verbraucherschutz (Beweislastumkehr, Widerrufsrecht bei Fernabsatz), AGB, Vertragsfreiheit",
        strafrecht: "WR13 1.3: Ordnungswidrigkeit vs. Straftat, Aufbau einer Straftat (Tatbestandsmäßigkeit, Rechtswidrigkeit, Schuld), Strafzwecktheorien, Strafzumessung (eA: + Rechtfertigungsgründe Notwehr/Notstand, Entschuldigungsgründe, Radbruchsche Formel)"
      }
    }
  };

  let fbLabel, fbThemen;
  const fbKey = sachgebiet || fachbereich || "bwl";
  if (isGA) {
    fbLabel = "Integriert (BWL + VWL + Recht)";
    fbThemen = "Integrierte Aufgabe über alle drei Fachbereiche";
  } else {
    const fb = fachbereiche[fbKey] || fachbereiche.bwl;
    fbLabel = fb.label;
    fbThemen = Object.values(fb.themen).join(", ");
  }

  const themaLabel = (thema && thema !== "random")
    ? truncate(thema, 200)
    : "frei wählbar (abiturrelevant)";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur 2026 im Fach Wirtschaft und Recht (G9).
Erstelle eine authentische Abituraufgabe.

PRÜFUNGSFORMAT:
- ${niveauLabel}
- Gesamt: ${gesamtBE} BE (Bewertungseinheiten), Bearbeitungszeit: ${zeitMinuten} Minuten
- ${bloecke}
- ${materialCount}
- Fachbereich: ${fbLabel}${schwerpunktZusatz}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgabenblöcke (je ca. ${Math.round(gesamtBE / aufgabenAnzahl)} BE)
- Jeder Block kompakt und kleinschrittiger` : ''}

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen, zusammenfassen (ca. 20% der BE)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40% der BE)
- AFB III (Reflexion/Problemlösung): beurteilen, erörtern, Stellung nehmen, entwickeln (ca. 40% der BE)
- Jede Teilaufgabe hat eine konkrete BE-Angabe
- Operatoren müssen korrekt und eindeutig verwendet werden
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Marktformen (Monopol, Oligopol, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lehrplan-Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus. Beachte insbesondere die eA/gA-Differenzierung.
${isGA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" (z.B. Bilanzanalyse, BCG-Portfolio, Leverage-Effekt, Management/SWOT/Porter, Kapitalwertmethode, Vertragstypen/Leistungsstörungen, Moral Hazard, Spieltheorie, Gefährdungshaftung §833/§7 StVG) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

MATERIALIEN:
- Materialien (M1, M2, …) sind der Kern der Aufgabe
- Typen: Zeitungsartikel, Tabellen/Statistiken, Bilanzen, Gesetzestexte, Schaubilder, Fallbeispiele
- Textmaterialien: MINDESTENS 300-600 Wörter pro Material! Vollständige, ausführliche Texte — NICHT Zusammenfassungen oder Stichpunkte! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte selbst herausarbeiten müssen.
- Tabellen/Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Gesetzestexte: Korrekte §-Angaben mit vereinfachtem Wortlaut (150-300 Wörter)
- Jedes Material hat einen Titel und eine Quellenangabe
- Erstelle IMMER zusätzlich 1 Material vom typ "bild" (KI-generiertes Schaubild/Diagramm/Illustration):
  - typ "bild": inhalt = detaillierte Bildbeschreibung für KI-Generierung, titel = Bildtitel
${isGA ? "\n- Bei gA: Die Aufgabe muss alle drei Fachbereiche (BWL, VWL, Recht) integrieren" : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Einleitender Situationstext / Rahmenhandlung",
  "aufgabenbloecke": [
    {
      "nr": 1,
      "titel": "Titel des Aufgabenblocks",
      "teilaufgaben": [
        {"nr": "1.1", "text": "Aufgabentext mit Operator und Materialbezug", "be": 5, "afb": "I"},
        {"nr": "1.2", "text": "Aufgabentext", "be": 10, "afb": "II"}
      ],
      "be_gesamt": 15
    }
  ],
  "materialien": [
    {"nr": "M1", "titel": "Titel des Materials", "typ": "text", "inhalt": "Ausführlicher Materialtext (300-600 Wörter!)", "quelle": "Quellenangabe"},
    {"nr": "M2", "titel": "Statistik: ...", "typ": "statistik", "inhalt": "| Spalte1 | Spalte2 |\\n|---|---|\\n| ... | ... |", "quelle": "Institut, Jahr"},
    {"nr": "M3", "titel": "Schaubild: ...", "typ": "bild", "inhalt": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "quelle": ""}
  ],
  "gesamt_be": ${gesamtBE},
  "fachbereich": "${isGA ? "integriert" : (fachbereich || "bwl")}",
  "thema": "Konkretes Thema"
}`;

  const userPrompt = `Erstelle eine Wirtschaft-und-Recht-Abituraufgabe:
- Niveau: ${niveauLabel}
- Fachbereich: ${fbLabel}
- Thema: ${themaLabel}
- Gesamt-BE: ${gesamtBE}

Die Aufgabe soll ${bloecke} mit insgesamt ${gesamtBE} BE umfassen.
Erstelle ${materialCount} (Texte, Tabellen, ggf. Gesetzestexte) plus 1 Bild.
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER mindestens 1 Bild als Material.
${isGA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Themen mit "nur eA" dürfen NICHT vorkommen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= WIRTSCHAFT UND RECHT: GRADE ================= */
async function handleGradeWR(request, env) {
  const body = await request.json();
  const { aufgabenbloecke, materialien, student_text, niveau, gesamt_be, task_instruction } = body;

  if (!student_text) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || (niveau === "gA" ? 100 : 60);

  let aufgabenInfo = "";
  if (task_instruction) aufgabenInfo += `Situationstext:\n${truncate(task_instruction, 3000)}\n\n`;
  if (aufgabenbloecke && aufgabenbloecke.length) {
    aufgabenInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      aufgabenInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          aufgabenInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien && materialien.length) {
    aufgabenInfo += "\nMaterialien:\n";
    for (const m of materialien.slice(0, 6)) {
      aufgabenInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n(${m.quelle || ""})\n\n`;
    }
  }

  const rubricPrompt = `Du bewertest eine Wirtschaft-und-Recht-Abiturarbeit nach dem bayerischen BE-System (Bewertungseinheiten).

WICHTIG – FLIEẞTEXT-PFLICHT: Antworten MÜSSEN in zusammenhängendem Fließtext verfasst sein. Wenn der Schüler in Stichpunkten oder Aufzählungen antwortet statt in Fließtext, muss dies zu deutlichem Punktabzug führen. Erwähne dies explizit im Feedback.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Berücksichtige: Materialbezug, Operatoren-Anforderung (AFB I/II/III), fachliche Korrektheit, Struktur
- AFB I: Korrekte Wiedergabe von Fakten/Definitionen
- AFB II: Sachgerechte Analyse, korrekte Berechnungen, logische Transferleistung
- AFB III: Eigenständiges, begründetes Urteil mit Abwägung
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (0-15):
Formel: NP = round((erreichte_BE / ${maxBE}) * 15)
Mindestens 0, maximal 15.

Antworte NUR mit validem JSON:
{
  "bewertung_bloecke": [
    {"block_nr": 1, "teilaufgaben": [{"nr": "1.1", "be_erreicht": 4, "be_max": 5, "kommentar": "..."}], "be_erreicht": 12, "be_max": 15}
  ],
  "be_erreicht": <Zahl>,
  "be_max": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit Stärken, Schwächen, Verbesserungsvorschlägen>",
  "korrektur_text": "<Der VOLLSTÄNDIGE Schülertext. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe 1.1", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}]
}`;

  // Korrekturhilfe Gewährleistungsrecht bei Rechtsaufgaben einfügen
  const aufgabenText = (aufgabenInfo + (task_instruction || '')).toLowerCase();
  const istRechtsaufgabe = aufgabenText.includes('recht') || aufgabenText.includes('mangel') || aufgabenText.includes('gewährleist') || aufgabenText.includes('nacherfüllung') || aufgabenText.includes('verbrauchsgüterkauf') || aufgabenText.includes('bgb') || aufgabenText.includes('schadensersatz') || aufgabenText.includes('rücktritt') || aufgabenText.includes('kaufvertrag');
  const rechtsKorrektur = istRechtsaufgabe ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const messages = [
    { role: "system", content: rubricPrompt + rechtsKorrektur + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.be_erreicht ?? null;
    const beMax = parsed.be_max ?? maxBE;
    let np = parsed.notenpunkte ?? null;

    if (np == null && beErreicht != null) {
      np = Math.max(0, Math.min(15, Math.round((beErreicht / beMax) * 15)));
    }

    return jsonResponse({
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      bewertung_bloecke: parsed.bewertung_bloecke || [],
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      bewertung_bloecke: [],
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= WIRTSCHAFT UND RECHT: MODEL ANSWER ================= */
async function handleModelAnswerWR(request, env) {
  const { task_instruction, aufgabenbloecke, materialien } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Wirtschaft und Recht.
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben strukturiert
- Verwende Fachbegriffe korrekt (BWL, VWL, Recht)
- Beziehe die Materialien ein und verweise darauf
- Beachte die Operatoren und AFB-Stufen
- Bei Berechnungen: Rechenweg aufzeigen
- Bei Rechtsfragen: Obersatz, Definition, Subsumtion, Ergebnis
- Zielumfang: 800-1500 Wörter

Formatiere als Markdown mit klaren Überschriften für jeden Aufgabenblock.`;

  let userContent = "";
  if (task_instruction) userContent += `SITUATION:\n${truncate(task_instruction, 3000)}\n\n`;
  if (aufgabenbloecke && aufgabenbloecke.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien && materialien.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  // Bei Rechtsaufgaben Gewährleistungs-Systematik als Referenz einfügen
  const maText = (userContent + (task_instruction || '')).toLowerCase();
  const maIstRecht = maText.includes('recht') || maText.includes('mangel') || maText.includes('gewährleist') || maText.includes('nacherfüllung') || maText.includes('verbrauchsgüterkauf') || maText.includes('bgb') || maText.includes('schadensersatz') || maText.includes('rücktritt') || maText.includes('kaufvertrag');
  const maRechtsRef = maIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt + maRechtsRef },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= WIRTSCHAFT UND RECHT: PARSE TASK (OCR) ================= */
async function handleParseTaskWR(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Wirtschaft und Recht (Bayern). Extrahiere:
1. Den Situationstext / die Aufgabenstellung (task_instruction)
2. Die Aufgabenblöcke mit Teilaufgaben und BE-Angaben
3. Die Materialien (Texte, Tabellen, Gesetzestexte)

Antworte NUR mit validem JSON:
{
  "task_instruction": "Situationstext",
  "aufgabenbloecke": [{"nr": 1, "titel": "...", "teilaufgaben": [{"nr": "1.1", "text": "...", "be": 5, "afb": "I"}], "be_gesamt": 15}],
  "materialien": [{"nr": "M1", "titel": "...", "typ": "text", "inhalt": "...", "quelle": "..."}],
  "gesamt_be": 60
}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 8000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GESCHICHTE ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "G12 1.1: Franz. Revolution (Ursachen, Ständegesellschaft, Terreur), Vormärz, Revolution 1848/49 (Paulskirche, Bilanz). G12 1.2: Kaiserreich (Industrialisierung, Soziale Frage, Bismarck), Wilhelminismus, Frauenbewegung, Erster Weltkrieg, Weimarer Republik" + (isEA ? ". G12 1.3 (nur eA): Jüdisches Leben (Emanzipation, Antisemitismus)" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "G12 2.1: Endphase Weimarer Republik, NS-Machtübernahme (Gleichschaltung, Ermächtigungsgesetz), Holocaust, Widerstand. G12 2.2: Zwei deutsche Staaten (BRD/DDR). G12 2.3: Wiedervereinigung, Aufarbeitung" + (isEA ? ". G12 2.4 (nur eA): Erinnerungskultur" : "")
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "G13 1.1: Israelisch-palästinensischer Konflikt (Zionismus, Staatsgründung, Kriege, Friedensprozess). G13 1.2: USA (Supermacht, Interventionismus). G13 1.3: Russland/Sowjetunion. G13 1.4: China (Revolution, Reform, Aufstieg)" + (isEA ? ". G13 1.5 (nur eA): Naher/Mittlerer Osten als Konfliktfeld" : "")
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "G13 2.1: Attische Demokratie. G13 2.2: Aufklärung und Menschenrechte. G13 2.3: Nationalismus im 19. Jh. G13 2.4: Deutsch-französische/deutsch-polnische Beziehungen, Europäische Integration"
    }
  };

  const selectedSP = schwerpunkt === "random"
    ? Object.keys(schwerpunkte)[Math.floor(Math.random() * 4)]
    : schwerpunkt;
  const sp = schwerpunkte[selectedSP] || schwerpunkte["12_1"];

  // Determine a different Schwerpunkt for Teil B
  const allSP = Object.keys(schwerpunkte);
  const otherSP = allSP.filter(s => s !== selectedSP);
  const transferSP = otherSP[Math.floor(Math.random() * otherSP.length)];
  const transferThema = schwerpunkte[transferSP]?.titel || "";

  const systemPrompt = `Du bist ein Experte für das bayerische Geschichte-Abitur (ab 2026, G9). Erstelle eine VOLLSTÄNDIGE Abituraufgabe bestehend aus Teil A (Quellenanalyse) UND Teil B (Darstellung) auf ${niveauLabel}.

=== TEIL A — QUELLENANALYSE ===
1. EINLEITUNG (2-4 Sätze): Historischer Kontext, Hinführung zur Quelle
2. QUELLENMATERIAL (M 1) — ZWINGEND eine substanzielle TEXTQUELLE von 400-800 Wörtern:
   - Genres: Rede, Zeitungsartikel, Denkschrift, Brief, Memoiren, Flugblatt, Erlass
   - MUSS einen REALEN historischen Autor und korrekten Kontext haben
   - Sprache muss dem Entstehungszeitraum entsprechen
   - Vollständige Quellenangabe
   - Optional: 0-2 ergänzende Materialien (M 2, M 3) als "zusatz_materialien" Array: Schaubilder, Infografiken, Statistiken
3. TEILAUFGABEN (3 Stück, steigende AFB):
   - Teilaufgabe 1 (AFB I/II): "Arbeiten Sie aus M 1 heraus …" / "Stellen Sie dar …"
   - Teilaufgabe 2 (AFB II): "Ordnen Sie ein …" / "Erläutern Sie …"
   - Teilaufgabe 3 (AFB III): "Beurteilen Sie …" / "Erörtern Sie …"

SCHWERPUNKT: ${sp.titel} ${sp.zeitraum}
THEMEN: ${sp.themen}
KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Arbeiten Sie die Argumentation heraus (Friedenssicherung, Machtpolitik, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, die in den oben genannten Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" oder Vertiefungsmodule (z.B. Jüdisches Leben, Erinnerungskultur, Naher/Mittlerer Osten) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

=== TEIL B — DARSTELLUNG ===
- Eigenständige Aufgabe OHNE eigene Quelle (oder mit kurzem Materialimpuls, max. 200 Wörter)
- Erfordert historische Darstellung und Beurteilung
- Kann Transfer zu einem anderen Halbjahr enthalten
- Möglicher Transferbezug: ${transferSP.replace("_", "/")} – ${transferThema}
- 2 Teilaufgaben auf AFB II-III

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_a": "Vollständige Aufgabenstellung Teil A: Einleitung + 3 nummerierte Teilaufgaben",
  "primary_text_a": "Die historische Textquelle M 1 (400-800 Wörter) MIT Quelleneinleitung",
  "primary_meta_a": "Quellenangabe: Autor, Textsorte, Datum",
  "zusatz_materialien": [
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ],
  "task_instruction_b": "Vollständige Aufgabenstellung Teil B: 2 Teilaufgaben",
  "primary_text_b": "Kurzer Materialimpuls für Teil B (100-200 Wörter) oder leerer String",
  "primary_meta_b": "Quellenangabe Impuls oder leerer String",
  "thema": "Konkretes Thema",
  "schwerpunkt": "${selectedSP}"
}`;

  const userPrompt = `Erstelle eine vollständige Geschichte-Abituraufgabe (Teil A + B):
- Schwerpunkt (Teil A): ${sp.titel} ${sp.zeitraum}
- Niveau: ${niveauLabel}
${!isEA ? `- WICHTIG: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-Vertiefungsmodule oder eA-exklusive Themen!` : ""}

KRITISCH:
- Die Textquelle M 1 MUSS mindestens 500-800 Wörter lang sein! Die Quelle soll MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte herausarbeiten.
- Verwende eine REALE historische Persönlichkeit als Autor
- Teil A: 3 Teilaufgaben mit steigendem AFB
- Teil B: Eigenständige Darstellungsaufgabe, ggf. mit Transfer zu ${transferSP.replace("_", "/")}
- ALLE Materialien (Texte, Statistiken, Bildtexte) müssen auf DEUTSCH sein!
- Erstelle IMMER 1-2 ergänzende Materialien (zusatz_materialien): z.B. ein Schaubild, eine Infografik oder ein historisches Plakat (type "bild"). Der Bild-Prompt ist auf Englisch (mind. 3-5 Sätze), aber alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in "" mit exakter Positionsbeschreibung stehen. KEINE Rechtschreibfehler! KEINE Karikaturen oder Personen!
- VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(14000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GESCHICHTE ABITUR: GRADE ================= */
async function handleGradeAbiturGeschichte(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text_a, primary_text_b, student_text_a, student_text_b, rubric_prompt } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text_a/b und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `=== TEIL A — QUELLENANALYSE ===\nAufgabenstellung:\n${truncate(task_instruction_a, 5000)}\n\n`;
  contextInfo += `Quellenmaterial M 1:\n${truncate(primary_text_a, 15000)}\n\n`;

  contextInfo += `=== TEIL B — DARSTELLUNG ===\nAufgabenstellung:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text_b) {
    contextInfo += `Materialimpuls:\n${truncate(primary_text_b, 3000)}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_AB;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext Teil A (Quellenanalyse):\n${truncate(student_text_a, 15000)}\n\nSchülertext Teil B (Darstellung):\n${truncate(student_text_b, 10000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const sach_a = parsed.sach_a_np ?? null;
    const sach_b = parsed.sach_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && sach_a != null && sach_b != null && darstellung != null) {
      gesamt = Math.round(sach_a * 0.4 + sach_b * 0.3 + darstellung * 0.3);
      if (sach_a === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { sach_a, sach_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { sach_a: null, sach_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= GESCHICHTE ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturGeschichte(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text_a, primary_text_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geschichte (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (Teil A + Teil B) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen, klarer Argumentation und Gedankenführung
- Jeder Teil als eigener Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

TEIL A — QUELLENANALYSE:
- Quelleneinordnung (Autor, Textsorte, Adressat, historischer Kontext)
- Herausarbeitung der Kernaussagen mit Textbelegen
- Historische Einordnung und Kontextualisierung
- Beurteilung mit multiperspektivischer Reflexion
- Zielumfang: ca. 800 Wörter

TEIL B — DARSTELLUNG:
- Eigenständige historische Darstellung
- Einbeziehung von Fachwissen über die Quelle hinaus
- Differenziertes historisches Urteil
- Zielumfang: ca. 500 Wörter

Formatiere als Markdown mit klaren Überschriften. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `TEIL A – AUFGABE:\n${truncate(task_instruction_a, 5000)}\n\nQUELLE M 1:\n${truncate(primary_text_a, 15000)}`;
  userContent += `\n\nTEIL B – AUFGABE:\n${truncate(task_instruction_b, 3000)}`;
  if (primary_text_b) userContent += `\n\nMATERIALIMPULS:\n${truncate(primary_text_b, 3000)}`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= WR ABITUR: GENERATE (2 Aufgaben) ================= */
async function handleGenerateAbiturWR(request, env) {
  const body = await request.json();
  const { niveau, fachbereich_1, fachbereich_2, bearbeitungszeit } = body;

  const isEA = (niveau || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  const fbLabels = { bwl: "Betriebswirtschaftslehre", vwl: "Volkswirtschaftslehre", recht: "Recht" };

  let aufgabenDesc;
  if (isEA) {
    const fb1 = fbLabels[fachbereich_1] || "BWL";
    const fb2 = fbLabels[fachbereich_2] || "VWL";
    aufgabenDesc = `Die Prüfung besteht aus 2 SEPARATEN Aufgaben:
- Aufgabe 1: Fachbereich ${fb1}, 60 BE, 2-3 Aufgabenblöcke, 3-4 Materialien
- Aufgabe 2: Fachbereich ${fb2}, 60 BE, 2-3 Aufgabenblöcke, 3-4 Materialien
Gesamt: 120 BE, 270 Minuten`;
  } else {
    aufgabenDesc = `Die Prüfung besteht aus 2 Teilen:
- Aufgabe 1: Integrierte Aufgabe (BWL + VWL + Recht), 75 BE, 2-3 Aufgabenblöcke, 4-5 Materialien
- Aufgabe 2: Transferaufgabe OHNE eigene Materialien, 25 BE, 1-2 Aufgabenblöcke
Gesamt: 100 BE, 210 Minuten`;
  }

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur 2026 im Fach Wirtschaft und Recht (G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit 2 Aufgaben auf ${niveauLabel}.

PRÜFUNGSFORMAT:
${aufgabenDesc}

LEHRPLAN-INHALTE (G9, Bayern, ab 2026):
BWL (WR12 LB1): Unternehmensziele/Stakeholder (1.1), Beschaffung/Break-even/Marktsituation/ABC-Analyse/BCG-Portfolio (1.2), Bilanzanalyse/Kennzahlen/EBIT (1.3, nur eA), Investition: Gewinnvergleich/Amortisation/Kapitalwertmethode/Leverage-Effekt (1.4), Management: SWOT/Porter/Kernkompetenzen (1.5, nur eA).
VWL (WR12 LB2 + WR13 LB2): Magisches Viereck/Konjunktur (12.2.1), BIP/Arbeitslosigkeit/Nachfrage-Angebotstheorie/Staatsverschuldung (12.2.2), Tarifpartner/Sozialversicherung/Umlage-Kapitaldeckung/Moral Hazard/Beveridge/BGE (12.2.3), EZB/Geldpolitik/Transmissionsmechanismus (13.2.1), Leistungsbilanz/Wechselkurse/Spieltheorie/Nash-GGW (13.2.2).
Recht (WR12 LB3 + WR13 LB1): BGB-Systematik/Gutachtenstil (12.3.1), Herausgabeanspruch/gutgläubiger Erwerb/§823 I/Gefährdungshaftung (12.3.2), Vertragstypen/Leistungsstörungen (13.1.1, nur eA), Mangelfreiheit/Gewährleistung/Verbraucherschutz/AGB/Widerrufsrecht (13.1.2), Strafrecht: Straftat-Aufbau/Strafzwecktheorien/Radbruchsche Formel (13.1.3).

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen (ca. 20%)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40%)
- AFB III (Reflexion): beurteilen, erörtern, Stellung nehmen (ca. 40%)
- Jede Teilaufgabe hat eine konkrete BE-Angabe
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Marktformen (Monopol, Oligopol, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lehrplan-Inhalten stehen. Gehe NICHT über den Lehrplan hinaus. Beachte insbesondere die eA/gA-Differenzierung.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" (z.B. Bilanzanalyse, BCG-Portfolio, Leverage-Effekt, Management/SWOT/Porter, Kapitalwertmethode, Vertragstypen/Leistungsstörungen, Moral Hazard, Spieltheorie, Gefährdungshaftung) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

MATERIALIEN:
- Typen: Zeitungsartikel, Tabellen/Statistiken, Bilanzen, Gesetzestexte, Fallbeispiele
- Textmaterialien: MINDESTENS 300-600 Wörter pro Material! Vollständige, ausführliche Texte — NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte herausarbeiten müssen.
- Tabellen: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Gesetzestexte: Korrekte §-Angaben (150-300 Wörter)
- Erstelle IMMER zusätzlich 1 Material vom typ "bild" (KI-generiertes Schaubild/Illustration) pro Aufgabe:
  - typ "bild": inhalt = detaillierte Bildbeschreibung, titel = Bildtitel

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Fallbeispielen und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_1": "Die Metallbau Müller GmbH, ein mittelständisches Unternehmen mit 120 Mitarbeitern, plant die Erweiterung ihrer Produktionskapazitäten. Die Geschäftsführerin Frau Weber muss verschiedene betriebswirtschaftliche Entscheidungen treffen.",
  "aufgabenbloecke_1": [
    {"nr":1,"titel":"Investitionsrechnung","teilaufgaben":[
      {"nr":"1.1","text":"Stellen Sie die Ziele eines Unternehmens im Überblick dar und unterscheiden Sie dabei zwischen ökonomischen und nicht-ökonomischen Zielen.","be":6,"afb":"I"},
      {"nr":"1.2","text":"Ermitteln Sie mithilfe von M1 den Break-even-Punkt der geplanten Investition und erläutern Sie dessen Bedeutung für die Entscheidung.","be":8,"afb":"II"},
      {"nr":"1.3","text":"Vergleichen Sie auf Grundlage von M2 zwei Investitionsalternativen mithilfe der Gewinnvergleichsrechnung und der Amortisationsrechnung.","be":10,"afb":"II"},
      {"nr":"1.4","text":"Beurteilen Sie, ob die statischen Investitionsrechenverfahren für diese Entscheidung ausreichend sind oder ob dynamische Verfahren vorzuziehen wären.","be":6,"afb":"III"}
    ],"be_gesamt":30},
    {"nr":2,"titel":"EIGENEN Aufgabenblock generieren (anderes Thema, 3-4 Teilaufgaben, AFB I→II→III)","teilaufgaben":["EIGENE Teilaufgaben generieren"],"be_gesamt":30}
  ],
  "materialien_1": [
    {"nr":"M1","titel":"Kostenkalkulation der Erweiterung","typ":"text","inhalt":"EIGENEN ausführlichen Text generieren (300-600 Wörter): Fallbeispiel mit konkreten Zahlen zu Fixkosten, variablen Kosten, Absatzpreis, geplanter Produktionsmenge etc.","quelle":"Unternehmensunterlagen"},
    {"nr":"M2","titel":"Vergleich Investitionsalternativen","typ":"statistik","inhalt":"EIGENE Markdown-Tabelle mit konkreten Zahlenwerten generieren (mind. 6 Zeilen): Vergleich zweier Maschinen mit Anschaffungskosten, Nutzungsdauer, Erlösen, Kosten etc.","quelle":"Angebote der Hersteller, 2025"},
    {"nr":"M3","titel":"Schaubild: Kostenvergleich","typ":"bild","inhalt":"Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!","quelle":""}
  ],
  "task_instruction_2": "EIGENEN Situationstext generieren (anderes Thema/anderer Fachbereich als Aufgabe 1)",
  "aufgabenbloecke_2": [{"nr":1,"titel":"EIGENEN Aufgabenblock generieren","teilaufgaben":["EIGENE Teilaufgaben generieren (3-4 Teilaufgaben, AFB I→II→III, mit konkreten BE-Angaben)"],"be_gesamt":"EIGENE BE-Verteilung"}],
  "materialien_2": [{"nr":"M1","titel":"EIGENES Material generieren","typ":"text","inhalt":"EIGENEN ausführlichen Text generieren (300-600 Wörter)","quelle":"EIGENE Quelle"},{"nr":"M2","titel":"Schaubild: EIGENES Thema","typ":"bild","inhalt":"Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Alle Texte im Bild auf DEUTSCH in Anführungszeichen.","quelle":""}],
  "gesamt_be": ${isEA ? 120 : 100},
  "fachbereich_1": "${isEA ? (fachbereich_1 || "bwl") : "integriert"}",
  "fachbereich_2": "${isEA ? (fachbereich_2 || "vwl") : "transfer"}",
  "thema_1": "Konkretes Thema Aufgabe 1",
  "thema_2": "Konkretes Thema Aufgabe 2"
}
WICHTIG: Generiere für BEIDE Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! MINDESTENS 3 Teilaufgaben pro Aufgabenblock. Material-Inhalte MÜSSEN ausformuliert sein (300-600 Wörter für Texte, echte Zahlenwerte für Tabellen). Verwende ANDERE Themen als im Beispiel!`;

  const userPrompt = `Erstelle eine vollständige WR-Abiturprüfung (2 Aufgaben):
- Niveau: ${niveauLabel}
${isEA
      ? `- Aufgabe 1: ${fbLabels[fachbereich_1] || "BWL"} (60 BE)
- Aufgabe 2: ${fbLabels[fachbereich_2] || "VWL"} (60 BE)`
      : `- Aufgabe 1: Integriert BWL+VWL+Recht (75 BE)
- Aufgabe 2: Transferaufgabe ohne Materialien (25 BE)`}

Beide Aufgaben müssen eigenständig und thematisch verschieden sein.
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER pro Aufgabe mindestens 1 Bild als Material.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Themen mit "nur eA" dürfen NICHT vorkommen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= WR ABITUR: GRADE ================= */
async function handleGradeAbiturWR(request, env) {
  const body = await request.json();
  const { task_instruction_1, aufgabenbloecke_1, materialien_1, task_instruction_2, aufgabenbloecke_2, materialien_2, student_text_1, student_text_2, niveau, gesamt_be } = body;

  if (!student_text_1 && !student_text_2) {
    return jsonResponse({ error: "student_text_1/2 erforderlich." }, 400, env);
  }

  const isEA = (niveau || "eA").toLowerCase() === "ea";
  const maxBE = gesamt_be || (isEA ? 120 : 100);
  const be1Max = isEA ? 60 : 75;
  const be2Max = isEA ? 60 : 25;

  let contextInfo = "=== AUFGABE 1 ===\n";
  if (task_instruction_1) contextInfo += `Situationstext:\n${truncate(task_instruction_1, 3000)}\n\n`;
  if (aufgabenbloecke_1 && aufgabenbloecke_1.length) {
    contextInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke_1.slice(0, 5)) {
      contextInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          contextInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_1 && materialien_1.length) {
    contextInfo += "\nMaterialien Aufg. 1:\n";
    for (const m of materialien_1.slice(0, 6)) {
      contextInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n\n`;
    }
  }

  contextInfo += "\n=== AUFGABE 2 ===\n";
  if (task_instruction_2) contextInfo += `Situationstext:\n${truncate(task_instruction_2, 3000)}\n\n`;
  if (aufgabenbloecke_2 && aufgabenbloecke_2.length) {
    contextInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke_2.slice(0, 5)) {
      contextInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          contextInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_2 && materialien_2.length) {
    contextInfo += "\nMaterialien Aufg. 2:\n";
    for (const m of materialien_2.slice(0, 6)) {
      contextInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n\n`;
    }
  }

  const rubricPrompt = `Du bewertest eine vollständige WR-Abiturprüfung (2 Aufgaben) nach dem bayerischen BE-System.

WICHTIG – FLIEẞTEXT-PFLICHT: Antworten MÜSSEN in zusammenhängendem Fließtext verfasst sein. Wenn der Schüler in Stichpunkten oder Aufzählungen antwortet statt in Fließtext, muss dies zu deutlichem Punktabzug führen. Erwähne dies explizit im Feedback.

BEWERTUNGSREGELN:
- Bewerte JEDE Aufgabe separat mit BE
- Aufgabe 1: max ${be1Max} BE
- Aufgabe 2: max ${be2Max} BE
- Gesamt: max ${maxBE} BE
- Berücksichtige: Materialbezug, Operatoren (AFB I/II/III), fachliche Korrektheit, Struktur

BE → NOTENPUNKTE (0-15):
Formel: NP = round((be_gesamt / ${maxBE}) * 15)

Antworte NUR mit validem JSON:
{
  "be_1": <Zahl>,
  "be_max_1": ${be1Max},
  "be_2": <Zahl>,
  "be_max_2": ${be2Max},
  "be_gesamt": <Zahl>,
  "be_max_gesamt": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback>",
  "korrektur_text_a": "<Vollständiger Schülertext Aufgabe 1 mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>>",
  "korrektur_text_b": "<Vollständiger Schülertext Aufgabe 2 mit gleichen Fehlermarkierungen>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe 1.1", "aspekte": ["fehlender Punkt 1"]}]
}`;

  // Korrekturhilfe Gewährleistungsrecht bei Rechtsaufgaben einfügen
  const abiWrText = contextInfo.toLowerCase();
  const abiIstRecht = abiWrText.includes('recht') || abiWrText.includes('mangel') || abiWrText.includes('gewährleist') || abiWrText.includes('nacherfüllung') || abiWrText.includes('verbrauchsgüterkauf') || abiWrText.includes('bgb') || abiWrText.includes('schadensersatz') || abiWrText.includes('rücktritt') || abiWrText.includes('kaufvertrag');
  const abiRechtsKorrektur = abiIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const messages = [
    { role: "system", content: rubricPrompt + abiRechtsKorrektur + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${contextInfo}\nSchülertext Aufgabe 1:\n${truncate(student_text_1, 15000)}\n\nSchülertext Aufgabe 2:\n${truncate(student_text_2, 10000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000);

  try {
    const parsed = extractJSON(openaiRes);
    const be1 = parsed.be_1 ?? null;
    const be2 = parsed.be_2 ?? null;
    const beGesamt = parsed.be_gesamt ?? (be1 != null && be2 != null ? be1 + be2 : null);
    let np = parsed.notenpunkte ?? null;

    if (np == null && beGesamt != null) {
      np = Math.max(0, Math.min(15, Math.round((beGesamt / maxBE) * 15)));
    }

    return jsonResponse({
      scores: { be_1: be1, be_max_1: be1Max, be_2: be2, be_max_2: be2Max, be_gesamt: beGesamt, be_max_gesamt: maxBE, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_1: null, be_max_1: be1Max, be_2: null, be_max_2: be2Max, be_gesamt: null, be_max_gesamt: maxBE, notenpunkte: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= WR ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturWR(request, env) {
  const { task_instruction_1, aufgabenbloecke_1, materialien_1, task_instruction_2, aufgabenbloecke_2, materialien_2 } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Wirtschaft und Recht.
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (2 Aufgaben) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Aufgaben
- Verwende Fachbegriffe korrekt (BWL, VWL, Recht)
- Beziehe die Materialien ein
- Bei Berechnungen: Rechenweg aufzeigen
- Bei Rechtsfragen: Obersatz, Definition, Subsumtion, Ergebnis
- Zielumfang: Aufgabe 1 ca. 800-1200 Wörter, Aufgabe 2 ca. 500-800 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe und jeden Block.`;

  let userContent = "=== AUFGABE 1 ===\n";
  if (task_instruction_1) userContent += `SITUATION:\n${truncate(task_instruction_1, 3000)}\n\n`;
  if (aufgabenbloecke_1 && aufgabenbloecke_1.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke_1.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_1 && materialien_1.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien_1.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  userContent += "\n=== AUFGABE 2 ===\n";
  if (task_instruction_2) userContent += `SITUATION:\n${truncate(task_instruction_2, 3000)}\n\n`;
  if (aufgabenbloecke_2 && aufgabenbloecke_2.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke_2.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_2 && materialien_2.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien_2.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  // Bei Rechtsaufgaben Gewährleistungs-Systematik als Referenz einfügen
  const abiMaText = userContent.toLowerCase();
  const abiMaIstRecht = abiMaText.includes('recht') || abiMaText.includes('mangel') || abiMaText.includes('gewährleist') || abiMaText.includes('nacherfüllung') || abiMaText.includes('verbrauchsgüterkauf') || abiMaText.includes('bgb') || abiMaText.includes('schadensersatz') || abiMaText.includes('rücktritt') || abiMaText.includes('kaufvertrag');
  const abiMaRechtsRef = abiMaIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt + abiMaRechtsRef },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= FRANZÖSISCH: PARSE TASK (OCR) ================= */
async function handleParseTaskFrench(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Französisch-Abitur Aufgabe (Sprachmittlung oder Schreiben). Extrahiere:
1. Die Aufgabenstellung (task_instruction) — kann auf Französisch oder Deutsch formuliert sein
2. Den Quelltext (article_text) — bei Sprachmittlung auf Deutsch, bei Schreiben auf Französisch
3. Die Überschrift/Titel (headline)
4. Falls vorhanden: Quellenangabe (source_info)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "article_text": "...", "headline": "...", "source_info": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 4000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= FRANZÖSISCH: MODEL ANSWER (Sprachmittlung) ================= */
async function handleModelAnswerFrench(request, env) {
  const { source_text_de, task_fr } = await request.json();
  if (!source_text_de || !task_fr) {
    return jsonResponse({ error: "source_text_de and task_fr required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B1+/B2 Französisch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Sprachmittlung-Aufgabe auf FRANZÖSISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen (connecteurs logiques)
- Der Text muss sich flüssig lesen lassen, mit sinnvollen Absätzen und Gedankenführung
- Beachte die geforderte Textsorte (courriel, lettre, article) und deren formale Merkmale

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere und vermittle die Inhalte, übersetze NICHT wörtlich
- Verwende angemessenes, idiomatisches Französisch (registre courant/soutenu)
- Zielumfang: 200–300 Wörter

Formatiere als Markdown: Erst die Lösung auf Französisch, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_fr, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ]);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= FRANZÖSISCH: MODEL ANSWER (Schreiben) ================= */
async function handleModelAnswerFrenchWriting(request, env) {
  const { article_text, task_1, task_2, task_3, selected_tasks } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Französisch, Niveau B2).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf FRANZÖSISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit eleganten Übergängen und Verknüpfungen (connecteurs logiques)
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Aufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE angegebenen Aufgaben
- Belege Aussagen mit Textzitaten (citations)
- Analysiere Stilmittel (procédés stylistiques) wenn gefordert
- Verwende angemessenes, idiomatisches Französisch
- Zielumfang: 600-1000 Wörter insgesamt

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe. Am Ende unter "---" eine kurze Reflexion auf Deutsch.`;

  let userContent = `AUSGANGSTEXT:\n${truncate(article_text, 15000)}\n\n`;
  if (task_1) userContent += `AUFGABE 1 (Présentation):\n${truncate(task_1, 1000)}\n\n`;
  if (task_2) userContent += `AUFGABE 2 (Analyse):\n${truncate(task_2, 1000)}\n\n`;
  if (task_3) userContent += `AUFGABE 3:\n${truncate(task_3, 1000)}\n\n`;
  if (selected_tasks) userContent += `Bearbeitete Aufgaben: ${selected_tasks}\n`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ITALIENISCH: PARSE TASK (OCR) ================= */
async function handleParseTaskItalian(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Italienisch-Abitur Aufgabe (Sprachmittlung oder Schreiben). Extrahiere:
1. Die Aufgabenstellung (task_instruction) — kann auf Italienisch oder Deutsch formuliert sein
2. Den Quelltext (article_text) — bei Sprachmittlung auf Deutsch, bei Schreiben auf Italienisch
3. Die Überschrift/Titel (headline)
4. Falls vorhanden: Quellenangabe (source_info)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "article_text": "...", "headline": "...", "source_info": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 4000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ITALIENISCH: MODEL ANSWER (Sprachmittlung) ================= */
async function handleModelAnswerItalian(request, env) {
  const { source_text_de, task_it } = await request.json();
  if (!source_text_de || !task_it) {
    return jsonResponse({ error: "source_text_de and task_it required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B1+/B2 Italienisch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Sprachmittlung-Aufgabe auf ITALIENISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen (connettivi logici)
- Der Text muss sich flüssig lesen lassen, mit sinnvollen Absätzen und Gedankenführung
- Beachte die geforderte Textsorte (e-mail, lettera, articolo) und deren formale Merkmale

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere und vermittle die Inhalte, übersetze NICHT wörtlich
- Verwende angemessenes, idiomatisches Italienisch (registro standard/formale)
- Zielumfang: 200–300 Wörter

Formatiere als Markdown: Erst die Lösung auf Italienisch, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_it, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ]);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ITALIENISCH: MODEL ANSWER (Schreiben) ================= */
async function handleModelAnswerItalianWriting(request, env) {
  const { article_text, task_1, task_2, task_3, selected_tasks } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Italienisch, Niveau B2).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf ITALIENISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit eleganten Übergängen und Verknüpfungen (connettivi logici)
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Aufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE angegebenen Aufgaben
- Belege Aussagen mit Textzitaten (citazioni)
- Analysiere Stilmittel (figure retoriche: metafora, similitudine, personificazione, iperbole, enumerazione, parallelismi, ripetizione, contrasto, discorso diretto) wenn gefordert
- Verwende angemessenes, idiomatisches Italienisch
- Zielumfang: 600-1000 Wörter insgesamt

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe. Am Ende unter "---" eine kurze Reflexion auf Deutsch.`;

  let userContent = `AUSGANGSTEXT:\n${truncate(article_text, 15000)}\n\n`;
  if (task_1) userContent += `AUFGABE 1 (Presentazione):\n${truncate(task_1, 1000)}\n\n`;
  if (task_2) userContent += `AUFGABE 2 (Analisi):\n${truncate(task_2, 1000)}\n\n`;
  if (task_3) userContent += `AUFGABE 3:\n${truncate(task_3, 1000)}\n\n`;
  if (selected_tasks) userContent += `Bearbeitete Aufgaben: ${selected_tasks}\n`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ETHIK: PARSE TASK (OCR) ================= */
async function handleParseTaskEthik(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Ethik (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Quellentexten, philosophischen Texten, Statistiken, Zitaten
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ETHIK: GENERATE ================= */
async function handleGenerateEthik(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const lbThemen = {
    "12_1": {
      title: "Theorie und Praxis des Handelns",
      lernbereiche: "LB 12.1 (Theorie und Praxis des Handelns)",
      inhalte: `- Handlungsbegriff: Willensfreiheit, Intentionalität, Verantwortung
- Platon (Politeia): Idee des Guten, Seelenlehre, Tugenden, Höhlengleichnis
- Tugendethik (Aristoteles): Eudaimonia, Mesotes-Lehre, dianoetische/ethische Tugenden, Phronesis
- Pflichtethik (Kant): Kategorischer Imperativ, Maximen, guter Wille, Pflicht vs. Neigung, Autonomie
- Utilitarismus (Bentham, Mill): Nützlichkeitsprinzip, hedonistisches Kalkül, Handlungs-/Regelutilitarismus
- Diskursethik (Habermas): ideale Sprechsituation, Diskursregeln, kommunikatives Handeln
- Verantwortungsethik (Jonas): Prinzip Verantwortung, Heuristik der Furcht, Nachhaltigkeit
- Philosophie als Sprachkritik (Wittgenstein): Sprachspiel, Grenzen der Sprache
- Angewandte Ethik: Medizinethik, Technikethik, Wirtschaftsethik, Tierethik
- Moralische Dilemmata und Fallanalysen`,
      schwerpunkte: {
        platon: "Platons Ideenlehre, Seelenlehre und Tugenden (Politeia)",
        kant: "Kants Pflichtethik und der Kategorische Imperativ",
        utilitarismus: "Utilitarismus (Bentham/Mill) und Nützlichkeitsprinzip",
        tugend: "Aristoteles' Tugendethik und Eudaimonia",
        habermas: "Habermas' Diskursethik und kommunikatives Handeln",
        verantwortung: "Jonas' Verantwortungsethik und Nachhaltigkeit",
        angewandt: "Angewandte Ethik: Medizin, Technik, Wirtschaft"
      }
    },
    "12_2": {
      title: "Freiheit und Determination",
      lernbereiche: isEA
        ? "LB 12.2 (Erkenntnistheorie und Wissenschaftstheorie) und LB 12.3 (Freiheit und Determination)"
        : "LB 12.2 (Freiheit und Determination)",
      inhalte: isEA
        ? `- Erkenntnistheorie: Rationalismus (Descartes), Empirismus (Locke, Hume), Kants Transzendentalphilosophie
- Wissenschaftstheorie: Verifikation, Falsifikation (Popper), Paradigmenwechsel (Kuhn)
- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Freiheitsbegriff: negative und positive Freiheit (Berlin), Handlungsfreiheit vs. Willensfreiheit
- Neurowissenschaftliche Positionen (Libet-Experiment, Roth, Singer)
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit, Geworfenheit
- Freiheit und Verantwortung: Schuld, Zurechnungsfähigkeit
- Menschenwürde und Autonomie (Kant)`
        : `- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Negative und positive Freiheit
- Neurowissenschaftliche Herausforderungen der Willensfreiheit
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit
- Freiheit und Verantwortung
- Menschenwürde und Autonomie`,
      schwerpunkte: {
        willensfreiheit: "Willensfreiheit: Determinismus vs. Indeterminismus",
        neurowissenschaft: "Neurowissenschaftliche Herausforderungen der Willensfreiheit",
        sartre: "Sartres Existenzialismus und radikale Freiheit",
        erkenntnis: "Erkenntnistheorie: Rationalismus, Empirismus, Kant",
        freiheit_verantwortung: "Freiheit und Verantwortung"
      }
    },
    "13_1": {
      title: "Recht und Gerechtigkeit",
      lernbereiche: isEA
        ? "LB 13.1 (Recht und Gerechtigkeit) und LB 13.2 (Politische Ethik)"
        : "LB 13.1 (Recht und Gerechtigkeit)",
      inhalte: isEA
        ? `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens, Differenzprinzip), Nozick (Libertarismus), Aristoteles (kommutative/distributive Gerechtigkeit)
- Naturrecht und Rechtspositivismus: Radbruchsche Formel, Arendt (Banalität des Bösen, Eichmann-Prozess)
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Strafzwecktheorien (absolute/relative/Vereinigungstheorie), Tat- vs. Täterstrafrecht, Jugendstrafrecht
- Kriminalitätstheorien: Anomie-Theorie, Etikettierungsansatz
- Politische Ethik: Legitimation von Herrschaft, Gemeinwohl, Vertragstheorien (Hobbes, Locke, Rousseau)
- Globale Gerechtigkeit: Verteilungsgerechtigkeit, Klimagerechtigkeit
- Zivilcourage und ziviler Ungehorsam
- Menschenwürde (Art. 1 GG) als Grundlage des Rechtsstaats`
        : `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens, Differenzprinzip)
- Naturrecht und Rechtspositivismus
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Vergeltung, Prävention, Resozialisierung
- Vertragstheorien: Hobbes, Locke, Rousseau
- Globale Gerechtigkeit und Klimagerechtigkeit`,
      schwerpunkte: {
        rawls: "Rawls' Gerechtigkeitstheorie und das Differenzprinzip",
        naturrecht: "Naturrecht vs. Rechtspositivismus",
        menschenrechte: "Menschenrechte: Universalität und Kulturrelativismus",
        strafe: "Straftheorien: Vergeltung, Prävention, Resozialisierung",
        vertragstheorien: "Vertragstheorien: Hobbes, Locke, Rousseau",
        global: "Globale Gerechtigkeit und Klimagerechtigkeit"
      }
    },
    "13_2": {
      title: "Sinnorientierung und Lebensgestaltung",
      lernbereiche: isEA
        ? "LB 13.3 (Sinnorientierung und Lebensgestaltung) und LB 13.4 (Religionsphilosophie und Ethik)"
        : "LB 13.2 (Sinnorientierung und Lebensgestaltung)",
      inhalte: isEA
        ? `- Sinnfrage: Frankl (Logotherapie, Wille zum Sinn), Camus (Mythos des Sisyphos, Absurdität)
- Stoa (Seneca, Epiktet, Marc Aurel): Gelassenheit, Leidenschaftslosigkeit (Apatheia), Schicksalsergebenheit
- Epikur: Lustprinzip, Ataraxie, Unterscheidung natürliche/nichtnatürliche Bedürfnisse
- Existenzialismus: Sartre (Entwurf), Heidegger (Sein zum Tode)
- Glück und gelingendes Leben: Eudaimonia vs. hedonistisches Glück
- Religionsphilosophie: Gottesbeweise (ontologisch, kosmologisch, teleologisch), Theodizee
- Religionskritik: Feuerbach (Projektionsthese), Marx (Opium des Volkes), Nietzsche (Tod Gottes)
- Buddhismus und fernöstliche Perspektiven auf Leid und Erlösung
- Ethik ohne Gott: Säkulare Begründungen der Moral`
        : `- Sinnfrage: Frankl (Logotherapie, Wille zum Sinn), Camus (Absurdität)
- Stoa: Gelassenheit und Schicksalsergebenheit
- Epikur: Lustprinzip und Ataraxie
- Glück und gelingendes Leben
- Existenzialismus: Sartre und Heidegger
- Religionsphilosophie und Religionskritik`,
      schwerpunkte: {
        frankl: "Frankls Logotherapie und die Sinnfrage",
        stoa: "Stoische Philosophie: Gelassenheit und Tugend",
        epikur: "Epikurs Lustprinzip und Ataraxie",
        existenz: "Existenzialismus: Sartre und Heidegger zur Sinnfrage",
        glueck: "Glück und gelingendes Leben in der Philosophie",
        religion: "Religionsphilosophie und Religionskritik"
      }
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && lb.schwerpunkte[schwerpunkt])
    ? lb.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Lernbereichs";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Ethik (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Geben Sie … wieder!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Analysieren Sie …", "Vergleichen Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …"
- Verwende die offiziellen Operatoren: wiedergeben, darstellen, beschreiben, erläutern, analysieren, vergleichen, herausarbeiten, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (philosophischer Text ODER Statistik)' : totalBE < 40 ? '1-2 Materialien (philosophische Texte, Statistiken)' : '2-3 Materialien (philosophische Texte, literarische Auszüge, Statistiken)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche philosophische Quellentexte (Essays, Fachtexte, Zeitungsartikel zu ethischen Themen, Auszüge aus philosophischen Werken). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (Illustration/Schaubild):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden. (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen philosophisch relevanten Kontext ein (z.B. ethische Debatte, philosophisches Gedankenexperiment, aktuelles gesellschaftliches Problem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum philosophischen Transfer

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die ethische Problematik (Autonomie, Würde, Gerechtigkeit, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, Philosophen und Konzepten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte. Themen, Philosophen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Erkenntnistheorie/Wissenschaftstheorie als eigener LB, Politische Ethik als eigener LB, Religionsphilosophie als eigener LB), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
  ],
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Ethik:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 2-3 passende Materialien (philosophische Texte, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein — vollständige, ausführliche Quellentexte, NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als für die Aufgaben nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten.
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= ETHIK: GRADE ================= */
async function handleGradeEthik(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= ETHIK: MODEL ANSWER ================= */
async function handleModelAnswerEthik(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Ethik (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende philosophische Fachbegriffe korrekt (z.B. Kategorischer Imperativ, Eudaimonia, Schleier des Nichtwissens, Apatheia, Ataraxie)
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, philosophisch begründetes Urteil
- Zeige multiperspektivisches Denken: Stelle verschiedene philosophische Positionen gegenüber
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ETHIK ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturEthik(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const lbThemen = {
    "12_1": {
      title: "Theorie und Praxis des Handelns",
      lernbereiche: "LB 12.1 (Theorie und Praxis des Handelns)",
      inhalte: `- Handlungsbegriff, Willensfreiheit, Intentionalität, Verantwortung
- Pflichtethik (Kant): Kategorischer Imperativ, Maximen, guter Wille
- Utilitarismus (Bentham, Mill): Nützlichkeitsprinzip, hedonistisches Kalkül
- Tugendethik (Aristoteles): Eudaimonia, Mesotes-Lehre, Phronesis
- Verantwortungsethik (Jonas): Prinzip Verantwortung, Heuristik der Furcht
- Angewandte Ethik: Medizinethik, Technikethik, Wirtschaftsethik`
    },
    "12_2": {
      title: "Freiheit und Determination",
      lernbereiche: isEA
        ? "LB 12.2 (Erkenntnistheorie) und LB 12.3 (Freiheit und Determination)"
        : "LB 12.2 (Freiheit und Determination)",
      inhalte: `- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Negative und positive Freiheit (Berlin)
- Neurowissenschaftliche Positionen (Libet-Experiment)
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit
- Freiheit und Verantwortung, Menschenwürde und Autonomie`
    },
    "13_1": {
      title: "Recht und Gerechtigkeit",
      lernbereiche: isEA
        ? "LB 13.1 (Recht und Gerechtigkeit) und LB 13.2 (Politische Ethik)"
        : "LB 13.1 (Recht und Gerechtigkeit)",
      inhalte: `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens), Nozick, Höffe
- Naturrecht und Rechtspositivismus, Radbruchsche Formel
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Vergeltung, Prävention, Resozialisierung
- Vertragstheorien: Hobbes, Locke, Rousseau`
    },
    "13_2": {
      title: "Sinnorientierung und Lebensgestaltung",
      lernbereiche: isEA
        ? "LB 13.3 (Sinnorientierung) und LB 13.4 (Religionsphilosophie)"
        : "LB 13.2 (Sinnorientierung und Lebensgestaltung)",
      inhalte: `- Frankl (Logotherapie, Wille zum Sinn), Camus (Absurdität)
- Stoa: Gelassenheit, Apatheia, Schicksalsergebenheit
- Epikur: Lustprinzip, Ataraxie
- Existenzialismus: Sartre, Heidegger (Sein zum Tode)
- Glück und gelingendes Leben: Eudaimonia vs. Hedonismus`
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Ethik (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 2-3 Materialien (philosophische Texte 400-800 Wörter, Statistiken, 1 Bild)
- Verwende offizielle Operatoren: wiedergeben, darstellen, erläutern, analysieren, vergleichen, erörtern, beurteilen, Stellung nehmen
- Situiere die Aufgabe in einem philosophisch relevanten Kontext
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die ethische Problematik (Autonomie, Würde, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die den Lernbereich erweitern oder vertiefen
- Bezug zu einem ANDEREN philosophischen Ansatz oder einer aktuellen ethischen Debatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, Philosophen und Konzepten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte. Themen, Philosophen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Erkenntnistheorie/Wissenschaftstheorie als eigener LB, Politische Ethik als eigener LB, Religionsphilosophie als eigener LB, soziologische Theorien als eigener LB), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "Titel", "type": "text", "content": "Philosophischer Quelltext (400-800 Wörter)", "source": "Autor, Werk, Jahr"},
      {"title": "Statistik: ...", "type": "statistik", "content": "| ... |", "source": "Institut, Jahr"},
      {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in Anführungszeichen mit Positionsangabe stehen. Keine Rechtschreibfehler!", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (Ausweitung) mit BE",
    "materials": []
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}`;

  const userPrompt = `Erstelle eine vollständige Ethik-Abiturprüfung (Teil A + Teil B):
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

KRITISCH: Jedes Textmaterial in Teil A MUSS 400-800 Wörter lang sein.
Teil B soll eine thematische Vertiefung oder Erweiterung darstellen.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= ETHIK ABITUR: GRADE ================= */
async function handleGradeAbiturEthik(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= ETHIK ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturEthik(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Ethik (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende philosophische Fachbegriffe korrekt
- Beziehe die Materialien ein und zitiere daraus
- Zeige multiperspektivisches Denken
- Formuliere eigenständige, philosophisch begründete Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= EV. RELIGION: PARSE TASK (OCR) ================= */
async function handleParseTaskReligion(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Evangelische Religionslehre (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen theologischen Texten, biblischen Quellen, Statistiken
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= EV. RELIGION: GENERATE ================= */
async function handleGenerateReligion(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const lbThemen = {
    "12_1": {
      title: "Sinnfrage und Gottesfrage / Der im-perfekte Mensch",
      lernbereiche: "LB 12.1 (Sinnfrage und Gottesfrage) und LB 12.2 (Der im-perfekte Mensch)",
      inhalte: `- Sinnfragen in Kultur und Gesellschaft, Zusammenhang Sinn- und Transzendenzvorstellungen
- Gottesfrage als existenzielle Frage: Luther (Deus absconditus), Schleiermacher (Gefühl schlechthinniger Abhängigkeit), Tillich (Gott als Grund des Seins)${isEA ? '; ggf. Barth (Offenbarungstheologie)' : ''}
- Beziehung Gottes zu den Menschen in der Bibel: Schöpfer, Befreier, Unverfügbarkeit, Menschwerdung, Passion, Auferstehung
- Verhältnis von Allmacht und Liebe Gottes: Luther (Kreuzestheologie), Bonhoeffer (ohnmächtiger Gott), Dalferth
- Theodizeefrage: Hiob, Leibniz (beste aller möglichen Welten), zeitgenössische Theologie
- Trinitätsvorstellung (Apostolisches Glaubensbekenntnis)
- Philosophische Religionskritik: Feuerbachs Projektionstheorie${isEA ? '; Marx (Opium des Volkes), Nietzsche (Tod Gottes), Freud (Illusion)' : '; ggf. weitere Position'}
- Menschenbild: Perfektion vs. Fragmentarität, Identität und Selbstkonzept
- Sünde und Gnade: Gen 1-11, Lk 15, Röm 3,21ff., Röm 7
- Rechtfertigung als Befreiung vom Perfektionszwang`,
      schwerpunkte: {
        gottesfrage: "Sinnfrage und Gottesfrage (Luther, Schleiermacher, Tillich)",
        theodizee: "Theodizee: Hiob, Leibniz und moderne Theologie",
        religionskritik: "Religionskritik: Feuerbach und weitere Positionen",
        trinitaet: "Trinität und christliches Gottesverständnis",
        anthropologie: "Menschenbild: Identität, Perfektion und Fragmentarität",
        suende: "Sünde, Vergebung und Rechtfertigung"
      }
    },
    "12_2": {
      title: "Homo faber / Christsein in der Gesellschaft",
      lernbereiche: "LB 12.3 (Homo faber) und LB 12.4 (Christsein in der Gesellschaft)",
      inhalte: `- Mensch als gestaltendes Wesen: philosophische Anthropologie
- Schöpfungsglaube: Mensch als Ebenbild Gottes, Weltgestaltungsauftrag, Sabbatruhe
- Luthers Auslegung zum 1. Artikel, Freiheit eines Christenmenschen
- Arbeit und Beruf: Luther (Berufung), Marx (Entfremdung), moderne Deutungen
- Aktuelle Arbeitswelt: Digitalisierung, Globalisierung, Gerechtigkeit
- Mensch als zoon politikon: Hobbes, Rousseau${isEA ? ', Arendt' : ''}
- Kirche in der Gesellschaft: Wahrnehmungen, Erwartungen, konziliarer Prozess
- Sozialethik: Schöpfungsbegründete Menschenwürde, Gerechtigkeit (AT-Prophetie)
- Theologische Modelle: Luthers Zwei-Reiche-Lehre, Barths Königsherrschaft Christi
${isEA ? '- Bonhoeffer (Kirche vor der Judenfrage), Befreiungstheologie, Öffentliche Theologie' : ''}`,
      schwerpunkte: {
        homo_faber: "Homo faber: Arbeit und Beruf (Luther, Marx)",
        schoepfung: "Schöpfungsglaube und Weltgestaltungsauftrag",
        freiheit: "Freiheit eines Christenmenschen (Luther)",
        kirche: "Kirche in der Gesellschaft",
        sozialethik: "Sozialethik: Zwei-Reiche-Lehre und Königsherrschaft Christi",
        politikon: "Mensch als zoon politikon"
      }
    },
    "13_1": {
      title: "Ethik: Gutes Leben und richtiges Handeln",
      lernbereiche: "LB 13.1 (Gutes Leben und richtiges Handeln) und LB 13.2 (Ethische Problemstellungen)",
      inhalte: `- Vorstellungen von gutem Leben, ethische Grundbegriffe
- Argumentationsmodelle: Situations-, Gesinnungs-, Verantwortungs-, Tugendethik
- Ethik Kants (Kategorischer Imperativ), Utilitarismus (Bentham, Mill)${isEA ? ', Diskursethik (Habermas), Theorie der Gerechtigkeit (Rawls)' : ''}
- Christliche Ethik: Rechtfertigungsglaube, Dekalog, Bergpredigt, Doppelgebot der Liebe
- Angewandte Ethik: Medizin-, Friedens-, Tier-, Wirtschafts-, Umwelt-, Medienethik
- Differenziertes ethisches Argumentieren: Konflikte, Perspektiven
- Theologische und nicht-theologische Beiträge im Gespräch`,
      schwerpunkte: {
        ethische_modelle: "Ethische Grundmodelle (Kant, Utilitarismus)",
        christliche_ethik: "Christliche Ethik: Dekalog, Bergpredigt, Doppelgebot der Liebe",
        angewandte_ethik: "Angewandte Ethik (Medizin-/Friedens-/Umweltethik)",
        argumentation: "Ethische Argumentationsmodelle",
        gutes_leben: "Vorstellungen vom guten Leben"
      }
    },
    "13_2": {
      title: "Christliche Hoffnungsbilder",
      lernbereiche: "LB 13.3 (Christliche Hoffnungsbilder – Eschatologie)",
      inhalte: `- Übergangssituation: Erwartungen, Hoffnungen, Ängste
- Zukunftsvisionen: Fortschrittsoptimismus vs. apokalyptische Szenarien
- Begrenztheit und Endlichkeit des Lebens, Tod und Trauer
- Vorstellungen vom Überwinden des Todes: Reinkarnation, Transhumanismus
- Christliche Hoffnungsbilder: Prophetische Visionen, Reich Gottes, Auferweckung Jesu
- Gericht als Durchsetzung von Gottes Gerechtigkeit, ewiges Leben
- Biblische Texte: 1 Kor 15, Offb 21f., Apostolisches Glaubensbekenntnis${isEA ? ', Jes 65, Reich-Gottes-Gleichnisse' : ''}`,
      schwerpunkte: {
        eschatologie: "Eschatologie und Reich Gottes",
        tod: "Tod, Endlichkeit und Auferstehung",
        hoffnung: "Christliche Hoffnungsbilder (prophetische Visionen, 1 Kor 15)",
        zukunft: "Zukunftsvisionen und Lebenssinn"
      }
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && lb.schwerpunkte[schwerpunkt])
    ? lb.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Lernbereichs";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Evangelische Religionslehre (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Vergleichen Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …", "Gestalten Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, zusammenfassen, wiedergeben, erläutern, analysieren, vergleichen, herausarbeiten, einordnen, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (theologischer Text ODER biblische Quelle)' : totalBE < 40 ? '1-2 Materialien (theologische Texte, biblische Quellen)' : '2-3 Materialien (theologische Texte, biblische Quellen, philosophische Auszüge, Zeitungsartikel)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche theologische/philosophische Quellentexte. NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen (z.B. Umfragen zu Glauben, Kirchenmitgliedschaft, ethische Einstellungen)
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (Illustration/Schaubild):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden. (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen theologisch relevanten Kontext ein (z.B. ethische Debatte, gesellschaftliche Frage mit religiöser Dimension, biblische Thematik, kirchengeschichtliches Ereignis)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Konzepten, die in den oben angegebenen Lernbereichen stehen.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte IM BILD auf DEUTSCH!", "source": ""}
  ],
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Evangelische Religionslehre:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 2-3 passende Materialien (theologische Texte, biblische Quellen, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein!
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= EV. RELIGION: GRADE ================= */
async function handleGradeReligion(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= EV. RELIGION: MODEL ANSWER ================= */
async function handleModelAnswerReligion(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Evangelische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende theologische Fachbegriffe korrekt (z.B. Theodizee, Trinität, Rechtfertigung, Sünde, Gnade, Zwei-Reiche-Lehre, Eschatologie, Königsherrschaft Christi)
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, theologisch begründetes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= EV. RELIGION ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturReligion(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const lbThemen = {
    "12_1": {
      title: "Sinnfrage und Gottesfrage / Der im-perfekte Mensch", lernbereiche: "LB 12.1 und LB 12.2",
      inhalte: `- Gottesfrage, Theodizee, Trinität, Religionskritik (Feuerbach)
- Menschenbild: Identität, Fragmentarität, Sünde und Rechtfertigung` },
    "12_2": {
      title: "Homo faber / Christsein in der Gesellschaft", lernbereiche: "LB 12.3 und LB 12.4",
      inhalte: `- Schöpfungsglaube, Arbeit und Beruf (Luther, Marx), Freiheit eines Christenmenschen
- Kirche in der Gesellschaft, Sozialethik, Zwei-Reiche-Lehre` },
    "13_1": {
      title: "Ethik: Gutes Leben und richtiges Handeln", lernbereiche: "LB 13.1 und LB 13.2",
      inhalte: `- Ethische Grundmodelle (Kant, Utilitarismus), christliche Ethik (Dekalog, Bergpredigt)
- Angewandte Ethik, ethische Argumentationsmodelle` },
    "13_2": {
      title: "Christliche Hoffnungsbilder", lernbereiche: "LB 13.3",
      inhalte: `- Eschatologie, Reich Gottes, Tod und Auferstehung
- Zukunftsvisionen, christliche Hoffnungsbilder (1 Kor 15, Offb 21f.)` }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Evangelische Religionslehre (ab 2026, G9).
Erstelle eine vollständige Abiturprüfung (Teil A + Teil B) auf ${niveauLabel}.
${zeitHinweis}

PRÜFUNGSSTRUKTUR:
- Prüfungsteil A: ${bePruefungA} – 3-4 Teilaufgaben mit Materialien, steigendes Anforderungsniveau (AFB I → II → III)
- Prüfungsteil B (Ausweitung): ${bePruefungB} – 1-2 Transferaufgaben OHNE zusätzliche Materialien, die über den Lernbereich von Teil A hinausgehen
- Gesamt: ${beGesamt}

TEIL A – LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.inhalte}${schwerpunktZusatz}

MATERIALIEN für Teil A:
- 2-3 Materialien (theologische/biblische Texte, Statistiken, plus 1 Bild)
- Textmaterialien MINDESTENS 400-800 Wörter

TEIL B – AUSWEITUNG:
- Geht thematisch ÜBER den Lernbereich von Teil A hinaus
- Verknüpft mit einem ANDEREN Lernbereich der Ev. Religionslehre
- Erfordert Transfer und eigenständige theologische Reflexion

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "...", "type": "text", "content": "400-800 Wörter", "source": "..."},
      {"title": "Schaubild: ...", "type": "bild", "content": "Imagen-Prompt auf Englisch, Texte im Bild auf Deutsch!", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Aufgabenstellung Teil B (Ausweitung) mit BE"
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Thema"
}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Erstelle eine vollständige Abiturprüfung für Ev. Religionslehre, Lernbereich ${lernbereich?.replace("_", "/") || "12/1"}, ${niveauLabel}.` }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= EV. RELIGION ABITUR: GRADE ================= */
async function handleGradeAbiturReligion(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_AB;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext Teil A:\n${truncate(student_text_a || "", 15000)}\n\nSchülertext Teil B:\n${truncate(student_text_b || "", 10000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && teil_a != null && teil_b != null && darstellung != null) {
      gesamt = Math.round(teil_a * 0.5 + teil_b * 0.2 + darstellung * 0.3);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "", korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= EV. RELIGION ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturReligion(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Evangelische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende theologische Fachbegriffe korrekt
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe die Materialien ein und zitiere daraus
- Formuliere eigenständige, theologisch begründete Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= KATH. RELIGION: PARSE TASK (OCR) ================= */
async function handleParseTaskKatholisch(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Katholische Religionslehre (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen theologischen Texten, biblischen Quellen, Statistiken
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= KATH. RELIGION: GENERATE ================= */
async function handleGenerateKatholisch(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const lbThemen = {
    "12_1": {
      title: "Personalität: Der Mensch und die Frage \u201eWer bin ich?\u201c",
      lernbereiche: "KR 12 LB 1 (Personalität)",
      inhalte: `- Philosophische Anthropologie: Identitätsfrage, Menschenbilder in Philosophie und Wissenschaft
- Biblisch-christliches Menschenbild: Gottebenbildlichkeit (Gen 1-3), Personalität, Sozialität, Transzendentalität
- Menschenwürde und Menschenrechte: theologische Begründung, Art. 1 GG
- Vorstellungen vom Menschsein in Wirtschaft, Politik, Wissenschaft (KI, Transhumanismus)
${isEA ? '- Vertiefung: Personbegriff (Boethius), relationale Anthropologie, Leib-Seele-Problem' : ''}
- Freiheit und Verantwortung als Wesensmerkmale des Menschen`,
      schwerpunkte: {
        anthropologie: "Philosophische Anthropologie und Identitätsfrage",
        menschenbild: "Biblisch-christliches Menschenbild (Gottebenbildlichkeit)",
        menschenwuerde: "Menschenwürde und Menschenrechte",
        personalitaet: "Personalität, Sozialität und Transzendentalität",
        freiheit: "Freiheit und Verantwortung"
      }
    },
    "12_2": {
      title: "Transzendentalität: Gottessuche und Gottesbild",
      lernbereiche: "KR 12 LB 2 (Transzendentalität)",
      inhalte: `- Gottesbeweise: Anselm v. Canterbury (ontologisch), Thomas v. Aquin (quinque viae), Pascal (Wette)${isEA ? ', Rahner (transzendentale Erfahrung)' : ''}
- Religionskritik: Feuerbach (Projektionsthese), Marx (Opium des Volkes), Nietzsche (Tod Gottes)${isEA ? ', Freud (Illusion)' : ''}
- Bibel als Gotteswort in Menschenwort: Offenbarungsverständnis, Auslegungsmethoden (historisch-kritisch, kanonisch)
- Trinitarisches Gottesbild: Credo, Vater – Sohn – Heiliger Geist
- Verhältnis Glaube und Naturwissenschaft: komplementäre Betrachtung, Schöpfung vs. Evolution
- Interreligiöser Vergleich: christliches und islamisches Gottesbild`,
      schwerpunkte: {
        gottesbeweise: "Gottesbeweise (Anselm, Thomas, Pascal)",
        religionskritik: "Religionskritik (Feuerbach, Marx, Nietzsche)",
        bibelauslegung: "Bibel als Gotteswort (Auslegungsmethoden)",
        trinitaet: "Trinitarisches Gottesbild",
        islam: "Christentum und Islam im Vergleich"
      }
    },
    "13_1": {
      title: "Sozialität: Ethik und Kath. Soziallehre",
      lernbereiche: "KR 13 LB 1 (Sozialität)",
      inhalte: `- Normenbegründungsmodelle: Naturrecht (Thomas v. Aquin), Pflichtethik (Kant), Utilitarismus (Bentham/Mill), Verantwortungsethik (Jonas)${isEA ? ', Diskursethik (Habermas), Tugendethik (Aristoteles)' : ''}
- Biblische Ethik: Dekalog, Bergpredigt (Seligpreisungen, Antithesen), Doppelgebot der Liebe
- Gewissensbildung: Gewissensfreiheit, Gewissensentscheidung, kath. Moraltheologie
- Katholische Soziallehre: Sozialprinzipien (Personalität, Solidarität, Subsidiarität, Gemeinwohl, Nachhaltigkeit)
- Sozialenzykliken: Rerum novarum, Quadragesimo anno, Laudato si'
- Ethik der Lebensbereiche: Ehe und Familie, Bioethik${isEA ? ', Wirtschaftsethik, Medienethik' : ''}`,
      schwerpunkte: {
        normenbegruendung: "Normenbegründung (Naturrecht, Pflichtethik, Utilitarismus)",
        bibl_ethik: "Dekalog, Bergpredigt und Gewissensbildung",
        soziallehre: "Kath. Soziallehre und Sozialprinzipien",
        nachhaltigkeit: "Nachhaltigkeit und Laudato si'",
        ehe_familie: "Ehe und Familie"
      }
    },
    "13_2": {
      title: "Existentielle Fragen und christliche Antwortangebote",
      lernbereiche: "KR 13 LB 2 (Existentielle Fragen)",
      inhalte: `- Wahrheitsansprüche: Exklusivismus, Inklusivismus, Pluralismus, interreligiöser Dialog
- Christliche Ethik als Letztbegründung: Verhältnis von Glaube und Vernunft
- Eschatologie: Auferstehungshoffnung, Reich-Gottes-Botschaft Jesu, christliche Zukunftshoffnung
- Lebensentwürfe: Rückblick auf die vier Kantischen Fragen (Was kann ich wissen? Was soll ich tun? Was darf ich hoffen? Was ist der Mensch?)
${isEA ? '- Vertiefung: Theodizee als existentielle Frage, Religionsphilosophie, Dialog mit Atheismus/Agnostizismus' : ''}`,
      schwerpunkte: {
        wahrheit: "Wahrheitsansprüche (Exklusivismus, Inklusivismus, Pluralismus)",
        letztbegruendung: "Christliche Ethik als Letztbegründung",
        eschatologie: "Eschatologie und Reich-Gottes-Botschaft",
        lebensentwuerfe: "Lebensentwürfe (Vier Kantische Fragen)"
      }
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && lb.schwerpunkte[schwerpunkt])
    ? lb.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Lernbereichs";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Katholische Religionslehre (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Vergleichen Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …", "Gestalten Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, zusammenfassen, wiedergeben, erläutern, analysieren, vergleichen, herausarbeiten, einordnen, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (theologischer Text ODER biblische Quelle)' : totalBE < 40 ? '1-2 Materialien (theologische Texte, biblische Quellen)' : '2-3 Materialien (theologische Texte, biblische Quellen, kirchliche Dokumente, Zeitungsartikel)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche theologische/philosophische Quellentexte. NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen (z.B. Umfragen zu Glauben, Kirchenmitgliedschaft, ethische Einstellungen)
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (Illustration/Schaubild):
  - type "bild": content = Ausführlicher Imagen-Prompt auf Englisch (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden. (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt sein! (3) Layout, Farben, Stil und visuelle Elemente detailliert beschreiben. KEINE Personen!
  - VERBOTEN: Bilder als Text beschreiben (z.B. "Die Abbildung zeigt...") — IMMER type "bild" mit Imagen-Prompt verwenden!

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen theologisch relevanten Kontext ein (z.B. ethische Debatte, gesellschaftliche Frage mit religiöser Dimension, biblische Thematik, kirchengeschichtliches Ereignis)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Konzepten, die in den oben angegebenen Lernbereichen stehen.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). WICHTIG: Alle Texte IM BILD auf DEUTSCH!", "source": ""}
  ],
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Katholische Religionslehre:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 2-3 passende Materialien (theologische Texte, biblische Quellen, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein!
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= KATH. RELIGION: GRADE ================= */
async function handleGradeKatholisch(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= KATH. RELIGION: MODEL ANSWER ================= */
async function handleModelAnswerKatholisch(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Katholische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende theologische Fachbegriffe korrekt (z.B. Theodizee, Trinität, Rechtfertigung, Sünde, Gnade, Zwei-Reiche-Lehre, Eschatologie, Königsherrschaft Christi)
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, theologisch begründetes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= KATH. RELIGION ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturKatholisch(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const lbThemen = {
    "12_1": {
      title: "Personalität: Der Mensch und die Frage \u201eWer bin ich?\u201c", lernbereiche: "KR 12 LB 1",
      inhalte: `- Philosophische Anthropologie, Identitätsfrage, christliches Menschenbild (Gottebenbildlichkeit)
- Personalität, Sozialität, Transzendentalität, Menschenwürde, Menschenrechte, Freiheit und Verantwortung` },
    "12_2": {
      title: "Transzendentalität: Gottessuche und Gottesbild", lernbereiche: "KR 12 LB 2",
      inhalte: `- Gottesbeweise (Anselm, Thomas, Pascal), Religionskritik (Feuerbach, Marx, Nietzsche)
- Bibel als Gotteswort, trinitarisches Gottesbild, Glaube und Naturwissenschaft, Christentum und Islam` },
    "13_1": {
      title: "Sozialität: Ethik und Kath. Soziallehre", lernbereiche: "KR 13 LB 1",
      inhalte: `- Normenbegründung (Naturrecht, Pflichtethik, Utilitarismus, Verantwortungsethik)
- Dekalog, Bergpredigt, Gewissensbildung, Kath. Soziallehre (Sozialprinzipien), Ehe/Familie, Nachhaltigkeit` },
    "13_2": {
      title: "Existentielle Fragen und christliche Antwortangebote", lernbereiche: "KR 13 LB 2",
      inhalte: `- Wahrheitsansprüche (Exklusivismus, Inklusivismus, Pluralismus), christliche Ethik als Letztbegründung
- Eschatologie, Reich-Gottes-Botschaft, Lebensentwürfe (Vier Kantische Fragen)` }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Katholische Religionslehre (ab 2026, G9).
Erstelle eine vollständige Abiturprüfung (Teil A + Teil B) auf ${niveauLabel}.
${zeitHinweis}

PRÜFUNGSSTRUKTUR:
- Prüfungsteil A: ${bePruefungA} – 3-4 Teilaufgaben mit Materialien, steigendes Anforderungsniveau (AFB I → II → III)
- Prüfungsteil B (Ausweitung): ${bePruefungB} – 1-2 Transferaufgaben OHNE zusätzliche Materialien, die über den Lernbereich von Teil A hinausgehen
- Gesamt: ${beGesamt}

TEIL A – LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.inhalte}${schwerpunktZusatz}

MATERIALIEN für Teil A:
- 2-3 Materialien (theologische/biblische Texte, kirchliche Dokumente, Statistiken, plus 1 Bild)
- Textmaterialien MINDESTENS 400-800 Wörter

TEIL B – AUSWEITUNG:
- Geht thematisch ÜBER den Lernbereich von Teil A hinaus
- Verknüpft mit einem ANDEREN Lernbereich der Kath. Religionslehre
- Erfordert Transfer und eigenständige theologische Reflexion

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "...", "type": "text", "content": "400-800 Wörter", "source": "..."},
      {"title": "Schaubild: ...", "type": "bild", "content": "Imagen-Prompt auf Englisch, Texte im Bild auf Deutsch!", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Aufgabenstellung Teil B (Ausweitung) mit BE"
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Thema"
}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Erstelle eine vollständige Abiturprüfung für Kath. Religionslehre, Lernbereich ${lernbereich?.replace("_", "/") || "12/1"}, ${niveauLabel}.` }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= KATH. RELIGION ABITUR: GRADE ================= */
async function handleGradeAbiturKatholisch(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_AB;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext Teil A:\n${truncate(student_text_a || "", 15000)}\n\nSchülertext Teil B:\n${truncate(student_text_b || "", 10000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && teil_a != null && teil_b != null && darstellung != null) {
      gesamt = Math.round(teil_a * 0.5 + teil_b * 0.2 + darstellung * 0.3);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "", korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= KATH. RELIGION ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturKatholisch(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Katholische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende theologische Fachbegriffe korrekt
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe die Materialien ein und zitiere daraus
- Formuliere eigenständige, theologisch begründete Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => {
      const c = m.content ?? m.text ?? "";
      const cStr = typeof c === "string" ? c : JSON.stringify(c);
      return `Material ${i + 1}: ${truncate(m.title || m.titel || "", 200)}\n${truncate(cStr, 3000)}`;
    }).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= GEOGRAPHIE: PARSE TASK (OCR) ================= */
async function handleParseTaskGeographie(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Geographie (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen geographischen Materialien (Karten, Klimadiagramme, Texte, Statistiken)
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GEOGRAPHIE: GENERATE ================= */
async function handleGenerateGeographie(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `Geo12 LB2 (24 Std.): Atmosphäre, Strahlungshaushalt, Drei-Zellen-Modell, Polarfrontjetstream, Monsun, ozeanische Zirkulation, ENSO, Klimawandel (anthropogen/natürlich), IPCC
Geo12 LB3 (20 Std.): Tropen (Immerfeuchte/Wechselfeuchte/Trockene Zone), Desertifikation, nachhaltige Nutzung tropischer Ökosysteme
Geo12 LB4 (16 Std.): Subpolare/Polare Zone, Permafrost, Kippelemente, Arktis-Geopolitik
Geo12 LB5 (24 Std.): Ressource Wasser/Wald/Boden/Fläche, Hochwasser, Klimaschutz in der Landwirtschaft
Geo12 LB6 (16 Std.): Hochgebirgsräume (Alpen), Massenbewegungen, Gletscherrückzug, Tourismus
Geo12 LB7 (12 Std.): Tektonische Naturgefahren, Plattentektonik, Vulkanismus, Erdbeben, tropische Wirbelstürme`,
      schwerpunkte: {
        klima: "Geo12 LB2: Klima und Klimawandel, atmosphärische Zirkulation",
        tropen: "Geo12 LB3: Tropen, Desertifikation, nachhaltige Nutzung",
        permafrost: "Geo12 LB4: Subpolare/Polare Zone, Permafrost, Kippelemente",
        ressourcen: "Geo12 LB5: Ressourcenkonflikte Wasser/Wald/Boden/Fläche",
        hochgebirge: "Geo12 LB6: Hochgebirgsräume, Gletscherrückzug, Tourismus",
        naturgefahren: "Geo12 LB7: Tektonische Naturgefahren, Plattentektonik"
      }
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `Geo12 LB5 (24 Std.): Ressource Wasser (Verfügbarkeit, Konflikte, virtuelles Wasser), Ressource Wald (tropischer Regenwald, Abholzung), Ressource Boden (Degradation, nachhaltige Nutzung), Ressource Fläche (Flächenverbrauch, Flächenkonkurrenz, Versiegelung)
Geo12 LB6 (16 Std.): Alpen als Lebens-/Wirtschafts-/Erholungsraum, Massentourismus, nachhaltiger Tourismus, Tragfähigkeit
Ergänzend: Landwirtschaft (konventionell vs. ökologisch, Agrarstrukturwandel), Erneuerbare Energien (Standortfaktoren, Energiewende)`,
      schwerpunkte: {
        wasser: "Geo12 LB5: Wasser als Ressource und Wasserkonflikte",
        flaeche: "Geo12 LB5: Ressource Fläche und Flächennutzungskonflikte",
        landwirtschaft: "Landwirtschaft, Welternährung, Klimaschutz",
        energie: "Erneuerbare Energien und Energiewende",
        tourismus: "Geo12 LB6: Tourismus in Hochgebirgsräumen"
      }
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `Geo13 LB2 (20 Std.): Entwicklungsindikatoren (HDI, Gini, BNE), Disparitäten, Globalisierung (Global Players, Wertschöpfungsketten), Entwicklungstheorien, Entwicklungsstrategien, Ferntourismus
Geo13 LB3 (24 Std.): Bevölkerungsentwicklung (demographischer Übergang, Altersstruktur), Migration (Push-Pull, Binnenmigration), Megacities, Urbanisierung (informelle Siedlungen, Primatstadt)
Geo13 LB4 (20 Std.): Fragmentierende Entwicklung (Fred Scholz), Nachhaltigkeit (SDGs, Drei-Säulen-Modell), Tropischer Regenwald (Ökosystem, Abholzung, Shifting Cultivation), Desertifikation`,
      schwerpunkte: {
        entwicklung: "Geo13 LB2: Entwicklungsländer und Entwicklungsindikatoren",
        globalisierung: "Geo13 LB2: Globalisierung und Wertschöpfungsketten",
        bevoelkerung: "Geo13 LB3: Bevölkerungsentwicklung und Migration",
        megacities: "Geo13 LB3: Megacities und Urbanisierung",
        nachhaltigkeit: "Geo13 LB4: Nachhaltigkeit und SDGs",
        regenwald: "Geo13 LB4: Tropischer Regenwald und Desertifikation"
      }
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `Geo13 LB5 (24 Std.): Stadtentwicklung (europäische/US-amerikanische/orientalische Stadt), Funktionale Gliederung, Suburbanisierung/Reurbanisierung, Gentrifizierung
Geo13 LB6 (20 Std.): Smart Cities, nachhaltige Stadtplanung, Mobilität, Klimawandel in Städten (Hitzeinsel-Effekt, Stadtklima)
Geo13 LB3: Segregation (soziale/ethnische/demographische), Demographischer Wandel, Integration`,
      schwerpunkte: {
        stadtentwicklung: "Geo13 LB5: Stadtentwicklung und historische Stadttypen",
        gentrifizierung: "Geo13 LB5: Gentrifizierung und soziale Folgen",
        suburbanisierung: "Geo13 LB5: Suburbanisierung und Reurbanisierung",
        smart_cities: "Geo13 LB6: Smart Cities und nachhaltige Stadtplanung",
        segregation: "Geo13 LB3: Segregation und demographischer Wandel",
        migration: "Geo13 LB3: Migration und Integration"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Beschreiben Sie …!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Erklären Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Bewerten Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Ursachen der Desertifikation (Überweidung, Abholzung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1-2 Materialien (1 Text + 1 Karte)' : totalBE < 40 ? '2-3 Materialien (Text, Statistik, Karte)' : '3-5 Materialien (geographische Texte, Statistiken, Karten, Klimadiagramme, Fotos)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche geographische Quellentexte (Fachartikel, Zeitungsartikel, Auszüge aus geographischen Werken). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER mindestens 1 Material vom Typ "karte" (interaktive OpenStreetMap-Karte):
  - type "karte": content ist ein OBJEKT (kein String!) mit: {"lat": 48.1, "lon": 11.5, "zoom": 6, "label": "Beschriftung"}
  - Wähle präzise Koordinaten für den geographischen Raum der Aufgabe
  - zoom: 3=Kontinent, 5=Land, 7=Region, 10=Stadt, 13=Stadtteil
- Erstelle wenn thematisch passend 1 Material vom Typ "klimadiagramm" (Walter-Lieth-Diagramm):
  - type "klimadiagramm": content ist ein OBJEKT (kein String!) mit: {"station": "Ortsname", "hoehe": 206, "temp": [-26.8,-24.1,-16.5,-5.2,5.8,12.3,16.1,14.2,7.5,-3.1,-15.8,-23.4], "niederschlag": [14,11,13,18,22,30,40,38,32,28,22,16]}
  - temp: Array mit 12 Monatsmitteltemperaturen in °C (Jan-Dez), plausible Werte für den Ort!
  - niederschlag: Array mit 12 Monatsniederschlägen in mm, plausible Werte für den Ort!
- Optional: Erstelle 1 Material vom Typ "foto" (KI-generiertes Bild):
  - type "foto": content = Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein und in "" stehen!

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen geographisch relevanten Kontext ein (z.B. konkreter Raumbeispiel, aktuelle Umweltdebatte, Nachhaltigkeitsproblem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum räumlichen Transfer

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen — weniger Vertiefung, keine eA-exklusiven Modelle oder Theorien. Halte dich strikt an den oben angegebenen Lehrplan für das gewählte Niveau.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Karte: Region X", "type": "karte", "content": {"lat": 48.1, "lon": 11.5, "zoom": 7, "label": "Süddeutschland"}, "source": "OpenStreetMap"},
    {"title": "Klimadiagramm: Ort X", "type": "klimadiagramm", "content": {"station": "München", "hoehe": 519, "temp": [-1.5,0.2,4.1,8.2,12.8,16.1,18.0,17.4,13.5,8.4,3.2,-0.3], "niederschlag": [48,44,58,62,90,115,126,110,75,56,52,50]}, "source": "DWD Klimadaten"},
    {"title": "Foto: ...", "type": "foto", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Alle Texte im Bild auf DEUTSCH in Anführungszeichen.", "source": ""}
  ],
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Geographie:
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 3-5 passende Materialien: 1 geographischer Text (400-800 Wörter), 1 Statistik, 1 Karte (mit Koordinaten-Objekt), und wenn passend 1 Klimadiagramm (mit Klimadaten-Objekt) oder 1 Foto.
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein — vollständige, ausführliche Quellentexte, NICHT Zusammenfassungen!
KRITISCH: Bei "karte" und "klimadiagramm" ist content ein JSON-OBJEKT, KEIN String! Klimadaten müssen realistisch sein für den jeweiligen Ort.
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgabe muss dem grundlegenden Anforderungsniveau entsprechen.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GEOGRAPHIE: GRADE ================= */
async function handleGradeGeographie(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= GEOGRAPHIE: MODEL ANSWER ================= */
async function handleModelAnswerGeographie(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geographie (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende geographische Fachbegriffe korrekt (z.B. Klimadiagramm, Vegetationszone, Permafrost, HDI, Disparitäten, Fragmentierung, Nachhaltigkeit)
- Beziehe Karten, Statistiken und Texte ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, raumbezogenes, multiperspektivisches Urteil
- Zeige multiperspektivisches Denken: Stelle verschiedene geographische Perspektiven gegenüber
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= GEOGRAPHIE ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturGeographie(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `Geo12 LB2: Atmosphäre, Strahlungshaushalt, Drei-Zellen-Modell, Jetstream, Monsun, ozeanische Zirkulation, ENSO, Klimawandel
Geo12 LB3: Tropen (Immerfeuchte/Wechselfeuchte/Trockene Zone), Desertifikation
Geo12 LB4: Subpolare/Polare Zone, Permafrost, Kippelemente
Geo12 LB5: Ressource Wasser/Wald/Boden/Fläche, Hochwasser
Geo12 LB6: Hochgebirgsräume, Gletscherrückzug, Tourismus
Geo12 LB7: Tektonische Naturgefahren, Plattentektonik, Vulkanismus, tropische Wirbelstürme`
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `Geo12 LB5: Ressource Wasser/Wald/Boden/Fläche, Konflikte
Geo12 LB6: Alpen als Lebens-/Wirtschafts-/Erholungsraum, Tourismus
Ergänzend: Landwirtschaft, Erneuerbare Energien, Energiewende`
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `Geo13 LB2: Entwicklungsindikatoren (HDI, Gini, BNE), Disparitäten, Globalisierung, Entwicklungstheorien
Geo13 LB3: Bevölkerungsentwicklung, demographischer Übergang, Migration, Megacities
Geo13 LB4: Fragmentierende Entwicklung, Nachhaltigkeit, SDGs, Tropischer Regenwald, Desertifikation`
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `Geo13 LB5: Stadtentwicklung (europäische/US-amerikanische/orientalische Stadt), Suburbanisierung, Gentrifizierung
Geo13 LB6: Smart Cities, nachhaltige Stadtplanung, Mobilität, Stadtklima (Hitzeinsel-Effekt)
Geo13 LB3: Segregation, Migration, demographischer Wandel`
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];

  const schwerpunktZusatz = (schwerpunkt && schwerpunkt !== "random")
    ? `\n\n⚠️ THEMATISCHER SCHWERPUNKT: ${schwerpunkt.replace(/_/g, ' ')}\nDie Aufgabe muss sich schwerpunktmäßig auf dieses Thema beziehen.`
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 3-5 Materialien: geographische Texte (400-800 Wörter), Statistiken, Karten, Klimadiagramme, Fotos
- Verwende offizielle Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Situiere die Aufgabe in einem konkreten Raumbeispiel
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Ursachen der Desertifikation (Überweidung, Abholzung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- IMMER mindestens 1 Material vom Typ "karte" — content ist ein OBJEKT: {"lat": ..., "lon": ..., "zoom": ..., "label": "..."}
- Wenn thematisch passend: 1 Material vom Typ "klimadiagramm" — content ist ein OBJEKT: {"station": "...", "hoehe": ..., "temp": [12 Werte], "niederschlag": [12 Werte]}
- Optional: 1 Material vom Typ "foto" — content ist ein ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Alle Texte/Beschriftungen IM BILD auf DEUTSCH in "" angeben!

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel erfordern
- Bezug zu einem ANDEREN geographischen Raum oder einer aktuellen Umwelt-/Nachhaltigkeitsdebatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen — weniger Vertiefung, keine eA-exklusiven Modelle oder Theorien. Halte dich strikt an den oben angegebenen Lehrplan für das gewählte Niveau.` : ""}

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur. Generiere KOMPLETT EIGENE Aufgaben mit einem EIGENEN Raumbeispiel passend zum gewählten Halbjahr! Verwende EIGENE Klimadaten, Koordinaten und Statistiken — kopiere NIEMALS die Beispielwerte!

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit ALLEN Teilaufgaben (mind. 3-4) und BE-Angaben. Jede Teilaufgabe mit konkretem Operator und Materialbezug (z.B. 'Beschreiben Sie anhand von M1 ...', 'Erläutern Sie mithilfe von M2 und M3 ...', 'Beurteilen Sie ...'). AFB I → II → III.",
    "materials": [
      {"title": "EIGENER Titel zum Raumbeispiel", "type": "text", "content": "EIGENEN geographischen Quelltext generieren (400-800 Wörter). Vollständiger, ausführlicher Fachtext mit konkreten Fakten, Daten und Zusammenhängen zum gewählten Raumbeispiel.", "source": "Autor, Quelle, Jahr"},
      {"title": "Statistik: EIGENER Titel", "type": "statistik", "content": "EIGENE vollständige Markdown-Tabelle mit mind. 6-10 Datenzeilen und plausiblen Zahlenwerten generieren", "source": "Institut, Jahr"},
      {"title": "Karte: EIGENE Region", "type": "karte", "content": {"lat": "EIGENE Koordinate passend zum Raumbeispiel", "lon": "EIGENE Koordinate", "zoom": "passender Zoomfaktor (3-12)", "label": "EIGENE Beschriftung"}, "source": "OpenStreetMap"},
      {"title": "Klimadiagramm: EIGENER Ort", "type": "klimadiagramm", "content": {"station": "EIGENER Stationsname passend zum Raumbeispiel", "hoehe": "EIGENE Höhenangabe in m", "temp": "12 EIGENE monatliche Temperaturwerte in °C (Jan-Dez), passend zur Klimazone", "niederschlag": "12 EIGENE monatliche Niederschlagswerte in mm (Jan-Dez), passend zur Klimazone"}, "source": "Klimadatenbank"},
      {"title": "Foto: EIGENER Titel", "type": "foto", "content": "Ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Alle Texte im Bild auf DEUTSCH in Anführungszeichen.", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (räumlicher Vergleich/Transfer) mit mind. 1-2 Teilaufgaben und BE-Angaben. Bezug zu einem ANDEREN geographischen Raum.",
    "materials": []
  },
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}
KRITISCH: Bei "karte" und "klimadiagramm" MUSS content ein JSON-OBJEKT sein (KEIN String)! Klimadaten müssen als echte Zahlenarrays (12 Werte) angegeben werden, passend zur gewählten Klimazone. Koordinaten müssen zum Raumbeispiel passen.`;

  const userPrompt = `Erstelle eine vollständige Geographie-Abiturprüfung (Teil A + Teil B):
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

Erstelle 3-5 Materialien: 1 Text (400-800 Wörter), 1 Statistik, 1 Karte (mit Koordinaten-Objekt), und wenn passend 1 Klimadiagramm (mit Klimadaten-Objekt) oder 1 Foto.
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein. Bei "karte" und "klimadiagramm" ist content ein JSON-OBJEKT, KEIN String!
Teil B soll einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel darstellen.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen dem grundlegenden Anforderungsniveau entsprechen.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GEOGRAPHIE ABITUR: GRADE ================= */
async function handleGradeAbiturGeographie(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => {
      const c = m.content ?? m.text ?? "";
      const cStr = typeof c === "string" ? c : JSON.stringify(c);
      return `Material ${i + 1}: ${truncate(m.title || m.titel || "", 200)}\n${truncate(cStr, 3000)}`;
    }).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = KORREKTUR_AB;

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + korrekturAnweisung },
    { role: "user", content: `${contextInfo}\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && teil_a != null && teil_b != null && darstellung != null) {
      gesamt = Math.round(teil_a * 0.5 + teil_b * 0.2 + darstellung * 0.3);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || parsed.korrektur_text || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= GEOGRAPHIE ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturGeographie(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geographie (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende geographische Fachbegriffe korrekt (z.B. Klimadiagramm, Vegetationszone, Permafrost, HDI, Disparitäten, Fragmentierung, Nachhaltigkeit)
- Beziehe Karten, Statistiken und Texte ein und zitiere daraus
- Zeige multiperspektivisches Denken
- Formuliere eigenständige, raumbezogene Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => {
      const c = m.content ?? m.text ?? "";
      const cStr = typeof c === "string" ? c : JSON.stringify(c);
      return `Material ${i + 1}: ${truncate(m.title || m.titel || "", 200)}\n${truncate(cStr, 3000)}`;
    }).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= LATEIN: PARSE TASK (OCR) ================= */
async function handleParseTaskLatein(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Latein (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den lateinischen Text (latin_text) - vollständig
3. Die deutsche Übersetzung oder Materialien, falls vorhanden (primary_text)
4. Quellenangabe: Autor, Werk (primary_meta)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "latin_text": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= LATEIN: GENERATE ================= */
async function handleGenerateLatein(request, env) {
  const body = await request.json();
  const { autor, aufgabentyp, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const autorInhalte = {
    cicero: "Cicero: Reden, Rhetorik, Philosophie (De officiis, De re publica, Pro Murena, In Catilinam). Typisch: lange Perioden, rhetorische Fragen, Parallelismen, Klimax, Antithesen, Partizipialkonstruktionen.",
    seneca: "Seneca: Moralphilosophie, Epistulae morales, De brevitate vitae, De vita beata. Typisch: Brevitas, Pointen, Sentenzen, Parataxe, rhetorische Fragen, antithetischer Stil.",
    livius: "Livius: Geschichtsschreibung, Ab urbe condita (Exempla, moralische Vorbilder). Typisch: Periodenbau, indirekte Rede, Partizipialkonstruktionen, dramatische Erzählung, moralische Exempla.",
    vergil: "Vergil: Epos, Aeneis (Schicksal, pietas, fatum, Götterwelt). Typisch: Hexameter, Enjambements, Epitheta ornantia, Gleichnisse, pathetischer Stil, mythologische Anspielungen.",
    lyrik: "Lyrik: Catull (Liebeslyrik, Spottgedichte), Horaz (Oden, Satiren, Episteln, carpe diem). Typisch: verschiedene Versmaße, persönlicher Ton, Ironie, Wortspiele, Alliterationen, Metaphern."
  };

  const autorKey = (autor || "cicero").toLowerCase();
  const autorInfo = autorInhalte[autorKey] || autorInhalte.cicero;
  const schwerpunktLabel = schwerpunkt ? truncate(schwerpunkt, 200) : "frei wählbar";

  if (aufgabentyp === "uebersetzung") {
    const wortanzahl = isEA ? "~170 Wörter" : "~135 Wörter";
    const maxBE = totalBE;

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Übersetzungsaufgabe auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Übersetzungstexte (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Jeder Text kürzer und kompakter` : ''}

AUTOR UND STIL:
${autorInfo}

ANFORDERUNGEN:
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des gewählten Autors
- Der Text muss grammatisch korrektes klassisches Latein sein
- Verwende typische Konstruktionen des Autors (z.B. Ciceronische Perioden, Senecas Brevitas, Vergils Hexameter)
- Schwierigkeitsgrad: Abiturniveau Bayern
- Textlänge: ${wortanzahl}
- Erstelle Vokabelhilfen (Vokabelhilfen) für schwierige oder seltene Wörter (8-15 Hilfen)
- Erstelle eine versteckte Musterübersetzung ins Deutsche

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Übersetzen Sie den folgenden lateinischen Text ins Deutsche.",
  "latin_text": "Der vollständige lateinische Text (${wortanzahl})",
  "vokabelhilfen": [{"latein": "lateinisches Wort/Wendung", "deutsch": "deutsche Bedeutung"}, ...],
  "musteruebersetzung": "Die vollständige deutsche Musterübersetzung",
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema des Textes"
}`;

    const userPrompt = `Erstelle eine Latein-Übersetzungsaufgabe:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Textlänge: ${wortanzahl}, maximale BE: ${maxBE}

KRITISCH: Der lateinische Text muss AUTHENTISCH im Stil des Autors verfasst sein — grammatisch korrekt, mit typischen Stilmitteln und Konstruktionen. Er soll wie ein echter Abiturtext wirken.`;

    const openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 8000);

    const content = extractJSON(openaiRes);
    return jsonResponse(content, 200, env);

  } else {
    // Mode: interpretation
    const beHinfuehrend = isEA ? "4 × 4 = 16 BE" : "3 × 4 = 12 BE";
    const anzahlHinfuehrend = isEA ? 4 : 3;
    const beInterpretation = isEA ? "26 BE" : "21 BE";
    const beWeiterfuehrend = isEA ? "3 aus 5 × 6 = 18 BE" : "2 aus 4 × 6 = 12 BE";
    const anzahlWeiterfuehrendGesamt = isEA ? 5 : 4;
    const anzahlWeiterfuehrendWahl = isEA ? 3 : 2;
    const beGesamt = totalBE + " BE";

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Interpretationsaufgabe (Aufgabenteil) auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten
- Verteile die ${totalBE} BE sinnvoll auf die Abschnitte (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Interpretationsaufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

AUTOR UND STIL:
${autorInfo}

STRUKTUR DER AUFGABE:
Der Aufgabenteil besteht aus einem lateinischen Text mit deutscher Übersetzung und 3 Abschnitten:

Abschnitt I – Hinführende Aufgaben (${beHinfuehrend}):
- ${anzahlHinfuehrend} Teilaufgaben à 4 BE
- Anforderungsbereich I-II (Reproduktion/Transfer)
- Operatoren: benennen, gliedern, beschreiben, einordnen, zusammenfassen

Abschnitt II – Interpretationsaufgabe (${beInterpretation}):
- 1 große Interpretationsaufgabe
- Anforderungsbereich II-III (Transfer/Reflexion)
- Operatoren: analysieren, interpretieren, herausarbeiten, erläutern

Abschnitt III – Weiterführende Aufgaben (${beWeiterfuehrend}):
- ${anzahlWeiterfuehrendGesamt} Aufgaben zur Auswahl, davon ${anzahlWeiterfuehrendWahl} zu bearbeiten, je 6 BE
- Anforderungsbereich III (Reflexion/Problemlösung)
- Operatoren: vergleichen, beurteilen, erörtern, Stellung nehmen, in Beziehung setzen

Gesamt-BE Aufgabenteil: ${beGesamt}

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Stilmittel (Anapher, Klimax, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LATEINISCHER TEXT:
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des Autors (80-120 Wörter)
- Der Text muss grammatisch korrektes klassisches Latein sein
- Erstelle eine genaue deutsche Übersetzung dazu

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Aufgabenteil – Interpretation",
  "latin_text": "Der lateinische Text",
  "deutsche_uebersetzung": "Die deutsche Übersetzung des lateinischen Textes",
  "aufgaben": [
    {
      "abschnitt": "I",
      "titel": "Hinführende Aufgaben",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": 4},
        {"nr": "2", "text": "Aufgabentext...", "be": 4}
      ]
    },
    {
      "abschnitt": "II",
      "titel": "Interpretationsaufgabe",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": ${isEA ? 26 : 21}}
      ]
    },
    {
      "abschnitt": "III",
      "titel": "Weiterführende Aufgaben",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": 6},
        {"nr": "2", "text": "Aufgabentext...", "be": 6}
      ]
    }
  ],
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

    const userPrompt = `Erstelle eine Latein-Interpretationsaufgabe:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Abschnitt I: ${beHinfuehrend}, Abschnitt II: ${beInterpretation}, Abschnitt III: ${beWeiterfuehrend}
- Gesamt: ${beGesamt}

KRITISCH: Der lateinische Text muss AUTHENTISCH im Stil des Autors verfasst sein. Die Aufgaben müssen den bayerischen Abitur-Anforderungen entsprechen.
Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben, von denen ${anzahlWeiterfuehrendWahl} zu bearbeiten sind.`;

    const openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 10000);

    const content = extractJSON(openaiRes);
    return jsonResponse(content, 200, env);
  }
}

/* ================= LATEIN: GRADE ================= */
async function handleGradeLatein(request, env) {
  const body = await request.json();
  const { aufgabentyp, task_instruction, latin_text, student_text, rubric_prompt, vokabelhilfen, musteruebersetzung, aufgaben, deutsche_uebersetzung, level } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  if (aufgabentyp === "uebersetzung") {
    const isEA = (level || "eA").toLowerCase() === "ea";
    const maxBE = isEA ? 60 : 45;

    let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;
    contextInfo += `Lateinischer Text:\n${truncate(latin_text, 5000)}\n\n`;
    if (vokabelhilfen && vokabelhilfen.length) {
      contextInfo += `Vokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
    }
    if (musteruebersetzung) {
      contextInfo += `Musterübersetzung:\n${truncate(musteruebersetzung, 8000)}\n\n`;
    }

    const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte die Übersetzung des Schülers nach dem Negativkorrekturverfahren.

BEWERTUNGSVERFAHREN – NEGATIVKORREKTUR:
- Maximale BE: ${maxBE}
- Schwerer Fehler (S) = 1 BE Abzug (falsche Bedeutung, fehlende Satzteile, grundlegend falsche Konstruktion)
- Leichter Fehler (L) = 0,5 BE Abzug (ungenaue Wortwahl, stilistisch ungeschickt, leichte Auslassung)
- Halber Fehler (H) = 0,25 BE Abzug (Rechtschreibung, Wiederholungsfehler, Kleinigkeiten)
- Erreichte BE = ${maxBE} minus Summe der Abzüge (mindestens 0)

BE-ZU-NP-UMRECHNUNG:
Berechne den Prozentsatz der erreichten BE (erreichte BE / ${maxBE} × 100) und verwende diese Tabelle:
≥95% = 15 NP, ≥90% = 14 NP, ≥85% = 13 NP, ≥80% = 12 NP, ≥75% = 11 NP,
≥70% = 10 NP, ≥65% = 9 NP, ≥60% = 8 NP, ≥55% = 7 NP, ≥50% = 6 NP,
≥45% = 5 NP, ≥40% = 4 NP, ≥33% = 3 NP, ≥27% = 2 NP, ≥20% = 1 NP, <20% = 0 NP

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Im korrektur_text: Markiere Übersetzungsfehler zusätzlich mit <mark class='fehler-ue' title='Korrektur: RICHTIG (Fehlertyp: S/L/H)'>FALSCH</mark>.

Antworte NUR mit validem JSON:
{
  "uebersetzung_be": <erreichte BE als Zahl>,
  "uebersetzung_np": <0-15>,
  "feedback": "Ausführliches Feedback zur Übersetzung...",
  "korrektur_text": "Markierter Schülertext...",
  "fehlende_aspekte": [{"aufgabe": "Übersetzung", "aspekte": ["...", "..."]}]
}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${contextInfo}\nSchülerübersetzung:\n${truncate(student_text, 15000)}` }
    ];

    const openaiRes = await callOpenAI(env, messages, 8000);

    try {
      const parsed = extractJSON(openaiRes);
      const be = parsed.uebersetzung_be ?? null;
      const np = parsed.uebersetzung_np ?? null;

      return jsonResponse({
        scores: { uebersetzung: be, total: np },
        feedback: parsed.feedback || "",
        korrektur_text: parsed.korrektur_text || "",
        fehlende_aspekte: parsed.fehlende_aspekte || []
      }, 200, env);
    } catch {
      return jsonResponse({
        scores: { uebersetzung: null, total: null },
        feedback: openaiRes,
        korrektur_text: "",
        fehlende_aspekte: []
      }, 200, env);
    }

  } else {
    // Mode: interpretation
    let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;
    contextInfo += `Lateinischer Text:\n${truncate(latin_text, 5000)}\n\n`;
    if (deutsche_uebersetzung) {
      contextInfo += `Deutsche Übersetzung:\n${truncate(deutsche_uebersetzung, 5000)}\n\n`;
    }
    if (aufgaben && aufgaben.length) {
      contextInfo += `Aufgaben:\n${JSON.stringify(aufgaben).substring(0, 5000)}\n\n`;
    }

    const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte den Interpretationsteil des Schülers.

BEWERTUNG (Inhalt 70% + Darstellung 30%):
- verstehen_np (0-15): Inhaltliche Qualität — korrekte Textanalyse, Stilmittelkenntnis, historischer Kontext, Argumentation
- darstellung_np (0-15): Sprachliche Darstellung — Fachsprache, Ausdruck, Struktur, Kohärenz
- gesamt_np: verstehen_np × 0,7 + darstellung_np × 0,3 (gerundet)

WICHTIG – FLIEẞTEXT-PFLICHT:
Der Schüler soll in zusammenhängendem Fließtext antworten. Stichpunktartige Antworten sind ABZUWERTEN (mindestens 2 NP Abzug bei darstellung_np).

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Antworte NUR mit validem JSON:
{
  "verstehen_np": <0-15>,
  "darstellung_np": <0-15>,
  "gesamt_np": <0-15>,
  "feedback": "Ausführliches Feedback...",
  "korrektur_text": "Markierter Schülertext...",
  "fehlende_aspekte": [{"aufgabe": "Abschnitt X", "aspekte": ["...", "..."]}]
}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
    ];

    const openaiRes = await callOpenAI(env, messages, 8000);

    try {
      const parsed = extractJSON(openaiRes);
      const verstehen = parsed.verstehen_np ?? null;
      const darstellung = parsed.darstellung_np ?? null;
      let gesamt = parsed.gesamt_np ?? null;

      if (gesamt == null && verstehen != null && darstellung != null) {
        gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
        if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
      }

      return jsonResponse({
        scores: { verstehen, darstellung, total: gesamt },
        feedback: parsed.feedback || "",
        korrektur_text: parsed.korrektur_text || "",
        fehlende_aspekte: parsed.fehlende_aspekte || []
      }, 200, env);
    } catch {
      return jsonResponse({
        scores: { verstehen: null, darstellung: null, total: null },
        feedback: openaiRes,
        korrektur_text: "",
        fehlende_aspekte: []
      }, 200, env);
    }
  }
}

/* ================= LATEIN: MODEL ANSWER ================= */
async function handleModelAnswerLatein(request, env) {
  const { aufgabentyp, task_instruction, latin_text, vokabelhilfen, musteruebersetzung, aufgaben, deutsche_uebersetzung } = await request.json();

  if (aufgabentyp === "uebersetzung") {
    // Return the stored model translation if available, otherwise generate one
    if (musteruebersetzung) {
      return jsonResponse({ model_answer: musteruebersetzung }, 200, env);
    }

    const systemPrompt = `Du bist ein Experte für lateinische Sprache und Übersetzung auf Abiturniveau (Bayern).
Erstelle eine vorbildliche deutsche Übersetzung des folgenden lateinischen Textes.

ANFORDERUNGEN:
- Die Übersetzung muss den lateinischen Text vollständig und genau wiedergeben
- Verwende gutes, idiomatisches Deutsch
- Halte dich eng am Originaltext, aber formuliere flüssig
- Berücksichtige den Stil des Autors in der Übersetzung`;

    let userContent = `Lateinischer Text:\n${truncate(latin_text, 5000)}`;
    if (vokabelhilfen && vokabelhilfen.length) {
      userContent += `\n\nVokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}`;
    }

    const answer = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ], 4000);

    return jsonResponse({ model_answer: answer }, 200, env);

  } else {
    // Mode: interpretation — generate Fließtext model answer
    const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Latein (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – FLIEẞTEXT-PFLICHT:
Diese Musterlösung dient Schülern als Vorbild. Sie MUSS als durchgehender, zusammenhängender Fließtext verfasst sein.
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Verwende vollständige Sätze mit Übergängen und Verknüpfungen zwischen den Absätzen
- Der Text muss sich wie ein echter Prüfungsaufsatz lesen — mit sinnvollen Absätzen und klarer Argumentation
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift, NICHT als Aufzählung

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende lateinische Fachbegriffe korrekt (z.B. Stilmittel, Metrik, historischer Kontext)
- Beziehe den lateinischen Text und die Übersetzung ein, zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, fundiertes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe/jeden Abschnitt. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

    let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
    userContent += `\n\nLATEINISCHER TEXT:\n${truncate(latin_text, 5000)}`;
    if (deutsche_uebersetzung) {
      userContent += `\n\nDEUTSCHE ÜBERSETZUNG:\n${truncate(deutsche_uebersetzung, 5000)}`;
    }
    if (aufgaben && aufgaben.length) {
      userContent += `\n\nAUFGABEN:\n${JSON.stringify(aufgaben).substring(0, 5000)}`;
    }

    const answer = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ], 5000);

    return jsonResponse({ model_answer: answer }, 200, env);
  }
}

/* ================= LATEIN ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturLatein(request, env) {
  const body = await request.json();
  const { autor, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 300 : 240;
  const refBE = isEA ? 120 : 90;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const wortanzahlA = isEA ? "~170 Wörter" : "~135 Wörter";
  const beA = isEA ? "60 BE" : "45 BE";
  const beB = isEA ? "60 BE" : "45 BE";
  const beHinfuehrend = isEA ? "4 × 4 = 16 BE" : "3 × 4 = 12 BE";
  const anzahlHinfuehrend = isEA ? 4 : 3;
  const beInterpretation = isEA ? "26 BE" : "21 BE";
  const beWeiterfuehrend = isEA ? "3 aus 5 × 6 = 18 BE" : "2 aus 4 × 6 = 12 BE";
  const anzahlWeiterfuehrendGesamt = isEA ? 5 : 4;
  const anzahlWeiterfuehrendWahl = isEA ? 3 : 2;

  const autorInhalte = {
    cicero: "Cicero: Reden, Rhetorik, Philosophie (De officiis, De re publica, Pro Murena, In Catilinam). Typisch: lange Perioden, rhetorische Fragen, Parallelismen, Klimax, Antithesen.",
    seneca: "Seneca: Moralphilosophie, Epistulae morales, De brevitate vitae, De vita beata. Typisch: Brevitas, Pointen, Sentenzen, Parataxe, antithetischer Stil.",
    livius: "Livius: Geschichtsschreibung, Ab urbe condita (Exempla, moralische Vorbilder). Typisch: Periodenbau, indirekte Rede, dramatische Erzählung.",
    vergil: "Vergil: Epos, Aeneis (Schicksal, pietas, fatum, Götterwelt). Typisch: Hexameter, Enjambements, Gleichnisse, pathetischer Stil.",
    lyrik: "Lyrik: Catull (Liebeslyrik, Spottgedichte), Horaz (Oden, Satiren, Episteln, carpe diem). Typisch: verschiedene Versmaße, persönlicher Ton, Ironie."
  };

  const autorKey = (autor || "cicero").toLowerCase();
  const autorInfo = autorInhalte[autorKey] || autorInhalte.cicero;
  const schwerpunktLabel = schwerpunkt ? truncate(schwerpunkt, 200) : "frei wählbar";

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen.'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Teil A (Übersetzung, ${beA}) und Teil B (Aufgabenteil, ${beB}) auf ${niveauLabel}.

AUTOR UND STIL:
${autorInfo}

TEIL A – ÜBERSETZUNG (${beA}):
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des Autors
- Textlänge: ${wortanzahlA}
- Grammatisch korrektes klassisches Latein mit typischen Konstruktionen des Autors
- Erstelle 8-15 Vokabelhilfen für schwierige/seltene Wörter
- Erstelle eine vollständige deutsche Musterübersetzung

TEIL B – AUFGABENTEIL (${beB}):
Wähle eine passende Gattung (Prosa oder Dichtung) für den zweiten Text.
- Generiere einen zweiten AUTHENTISCHEN lateinischen Text (80-120 Wörter) mit deutscher Übersetzung
- 3 Abschnitte:
  Abschnitt I – Hinführende Aufgaben (${beHinfuehrend}):
    ${anzahlHinfuehrend} Teilaufgaben à 4 BE, AFB I-II
  Abschnitt II – Interpretationsaufgabe (${beInterpretation}):
    1 große Aufgabe, AFB II-III
  Abschnitt III – Weiterführende Aufgaben (${beWeiterfuehrend}):
    ${anzahlWeiterfuehrendGesamt} Aufgaben zur Auswahl, davon ${anzahlWeiterfuehrendWahl} zu bearbeiten, je 6 BE, AFB III

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Stilmittel (Anapher, Klimax, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE lateinische Texte und Aufgaben passend zum gewählten Autor! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a": {
    "task_instruction": "Übersetzen Sie den folgenden lateinischen Text ins Deutsche.",
    "latin_text": "EIGENEN authentischen lateinischen Text im Stil des gewählten Autors generieren (${wortanzahlA}). Grammatisch korrektes klassisches Latein mit typischen Konstruktionen.",
    "vokabelhilfen": [{"latein": "EIGENES schwieriges Wort", "deutsch": "EIGENE Bedeutung"}, {"latein": "...", "deutsch": "..."}, "8-15 Vokabelhilfen generieren"],
    "musteruebersetzung": "EIGENE vollständige deutsche Musterübersetzung des lateinischen Textes generieren"
  },
  "teil_b": {
    "task_instruction": "Aufgabenteil – [Prosa/Dichtung je nach gewählter Gattung]",
    "latin_text": "EIGENEN zweiten authentischen lateinischen Text generieren (80-120 Wörter)",
    "deutsche_uebersetzung": "EIGENE deutsche Übersetzung des zweiten Textes generieren",
    "aufgaben": [
      {"abschnitt": "I", "titel": "Hinführende Aufgaben", "teilaufgaben": [
        {"nr": "1", "text": "Ordnen Sie den Text einer literarischen Gattung zu und benennen Sie typische Merkmale, die diese Zuordnung stützen.", "be": 4},
        {"nr": "2", "text": "Arbeiten Sie die zentrale Aussage des Textes heraus und belegen Sie diese am lateinischen Original.", "be": 4},
        {"nr": "3", "text": "Bestimmen Sie die syntaktische Funktion der markierten Satzteile und benennen Sie die verwendeten Konstruktionen.", "be": 4}
      ]},
      {"abschnitt": "II", "titel": "Interpretationsaufgabe", "teilaufgaben": [
        {"nr": "1", "text": "Interpretieren Sie den Text unter Berücksichtigung der sprachlich-stilistischen Gestaltung und der historischen Einordnung. Gehen Sie dabei auf die Intention des Autors ein und belegen Sie Ihre Aussagen am lateinischen Text.", "be": ${isEA ? 26 : 21}}
      ]},
      {"abschnitt": "III", "titel": "Weiterführende Aufgaben", "teilaufgaben": [
        {"nr": "1", "text": "Vergleichen Sie die im Text vertretene Position mit einer anderen Ihnen bekannten antiken Sichtweise zum selben Thema.", "be": 6},
        {"nr": "2", "text": "Erörtern Sie die Aktualität der im Text formulierten Gedanken für die heutige Gesellschaft.", "be": 6},
        {"nr": "3", "text": "EIGENE weiterführende Aufgabe generieren (AFB III, 6 BE)", "be": 6},
        {"nr": "4", "text": "EIGENE weiterführende Aufgabe generieren (AFB III, 6 BE)", "be": 6}
      ]}
    ]
  },
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema der Prüfung"
}
WICHTIG: Generiere ALLE Texte, Übersetzungen und Aufgaben vollständig ausformuliert! Die Aufgabentexte in Abschnitt I-III müssen konkret und auf den generierten Text bezogen sein. Verwende ANDERE Themen und Formulierungen als in den Beispielen! Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben (davon ${anzahlWeiterfuehrendWahl} zu bearbeiten).`;

  const userPrompt = `Erstelle eine vollständige Latein-Abiturprüfung:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Teil A: Übersetzung (${beA}, ${wortanzahlA})
- Teil B: Aufgabenteil (${beB}) mit 3 Abschnitten

KRITISCH: Beide lateinischen Texte müssen AUTHENTISCH im Stil des Autors verfasst sein — grammatisch korrekt, mit typischen Stilmitteln.
Teil B Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben, von denen ${anzahlWeiterfuehrendWahl} zu bearbeiten sind.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= LATEIN ABITUR: GRADE ================= */
async function handleGradeAbiturLatein(request, env) {
  const body = await request.json();
  const { student_text_a, student_text_b, rubric_prompt, task_instruction_a, task_instruction_b, latin_text_a, latin_text_b, vokabelhilfen, musteruebersetzung, deutsche_uebersetzung, aufgaben, level } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  const isEA = (level || "eA").toLowerCase() === "ea";
  const maxBEa = isEA ? 60 : 45;

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A (Übersetzung):\n${truncate(task_instruction_a, 3000)}\n\n`;
  if (latin_text_a) contextInfo += `Lateinischer Text (Teil A):\n${truncate(latin_text_a, 5000)}\n\n`;
  if (vokabelhilfen && vokabelhilfen.length) {
    contextInfo += `Vokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
  }
  if (musteruebersetzung) contextInfo += `Musterübersetzung:\n${truncate(musteruebersetzung, 8000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B (Aufgabenteil):\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (latin_text_b) contextInfo += `Lateinischer Text (Teil B):\n${truncate(latin_text_b, 3000)}\n\n`;
  if (deutsche_uebersetzung) contextInfo += `Deutsche Übersetzung (Teil B):\n${truncate(deutsche_uebersetzung, 3000)}\n\n`;
  if (aufgaben && aufgaben.length) {
    contextInfo += `Aufgaben (Teil B):\n${JSON.stringify(aufgaben).substring(0, 5000)}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülerübersetzung (Teil A):\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext (Teil B – Aufgabenteil):\n${truncate(student_text_b, 10000)}`;

  const korrekturAnweisung = KORREKTUR_LATEIN;

  const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte die GESAMTE Abiturprüfung (Teil A + Teil B).

TEIL A – ÜBERSETZUNG (Negativkorrektur):
- Maximale BE: ${maxBEa}
- Schwerer Fehler (S) = 1 BE Abzug, Leichter Fehler (L) = 0,5 BE, Halber Fehler (H) = 0,25 BE
- Erreichte BE = ${maxBEa} minus Abzüge (mindestens 0)
- BE→NP: ≥95%=15, ≥90%=14, ≥85%=13, ≥80%=12, ≥75%=11, ≥70%=10, ≥65%=9, ≥60%=8, ≥55%=7, ≥50%=6, ≥45%=5, ≥40%=4, ≥33%=3, ≥27%=2, ≥20%=1, <20%=0

TEIL B – AUFGABENTEIL (Inhalt 70% + Darstellung 30%):
- teil_b_np (0-15): Inhaltliche Qualität der Interpretation
- darstellung_np (0-15): Sprachliche Darstellung
- teil_b_gesamt_np = teil_b_np × 0,7 + darstellung_np × 0,3

WICHTIG – FLIEẞTEXT-PFLICHT (Teil B):
Stichpunktartige Antworten sind bei darstellung_np ABZUWERTEN (mindestens 2 NP Abzug).

GESAMTNOTE:
- Gesamt NP = Durchschnitt aus Teil A NP und Teil B Gesamt NP (1:1 Verhältnis, gerundet)

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Antworte NUR mit validem JSON:
{
  "teil_a_be": <erreichte BE>,
  "teil_a_np": <0-15>,
  "teil_b_np": <0-15>,
  "darstellung_np": <0-15>,
  "teil_b_gesamt_np": <0-15>,
  "gesamt_np": <0-15>,
  "feedback": "Ausführliches Feedback zu beiden Teilen...",
  "korrektur_text_a": "Markierter Schülertext Teil A...",
  "korrektur_text_b": "Markierter Schülertext Teil B...",
  "fehlende_aspekte": [{"aufgabe": "...", "aspekte": ["...", "..."]}]
}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `${contextInfo}\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000);

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let teil_b_gesamt = parsed.teil_b_gesamt_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (teil_b_gesamt == null && teil_b != null && darstellung != null) {
      teil_b_gesamt = Math.round(teil_b * 0.7 + darstellung * 0.3);
      if (teil_b === 0 || darstellung === 0) teil_b_gesamt = Math.min(teil_b_gesamt, 3);
    }

    if (gesamt == null && teil_a != null && teil_b_gesamt != null) {
      gesamt = Math.round((teil_a + teil_b_gesamt) / 2);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= LATEIN ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturLatein(request, env) {
  const { teil_a, teil_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Latein (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A: Übersetzung + Teil B: Aufgabenteil) auf DEUTSCH.

TEIL A – ÜBERSETZUNG:
- Erstelle eine genaue, idiomatische deutsche Übersetzung des lateinischen Textes
- Die Übersetzung muss den Originaltext vollständig und korrekt wiedergeben
- Verwende flüssiges, gutes Deutsch

TEIL B – AUFGABENTEIL:
WICHTIG – FLIEẞTEXT-PFLICHT:
- KEINE Stichpunkte, Aufzählungen, Bullet Points oder nummerierte Listen
- Durchgehender, zusammenhängender Fließtext mit sinnvollen Absätzen
- Jede Teilaufgabe als eigenen Fließtext-Abschnitt mit Überschrift

Inhaltlich:
- Bearbeite ALLE Teilaufgaben aller drei Abschnitte
- Verwende lateinische Fachbegriffe korrekt (Stilmittel, Metrik, historischer Kontext)
- Beziehe den lateinischen Text und die Übersetzung ein, zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, fundiertes Urteil
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "# TEIL A – ÜBERSETZUNG\n\n";

  if (teil_a) {
    if (teil_a.task_instruction) userContent += `Aufgabe: ${truncate(teil_a.task_instruction, 2000)}\n\n`;
    if (teil_a.latin_text) userContent += `Lateinischer Text:\n${truncate(teil_a.latin_text, 5000)}\n\n`;
    if (teil_a.vokabelhilfen && teil_a.vokabelhilfen.length) {
      userContent += `Vokabelhilfen:\n${teil_a.vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
    }
    if (teil_a.musteruebersetzung) {
      userContent += `(Hinweis: Musterübersetzung vorhanden – verwende diese als Grundlage)\nMusterübersetzung:\n${truncate(teil_a.musteruebersetzung, 5000)}\n\n`;
    }
  }

  userContent += "# TEIL B – AUFGABENTEIL\n\n";

  if (teil_b) {
    if (teil_b.task_instruction) userContent += `Aufgabe: ${truncate(teil_b.task_instruction, 2000)}\n\n`;
    if (teil_b.latin_text) userContent += `Lateinischer Text:\n${truncate(teil_b.latin_text, 5000)}\n\n`;
    if (teil_b.deutsche_uebersetzung) userContent += `Deutsche Übersetzung:\n${truncate(teil_b.deutsche_uebersetzung, 5000)}\n\n`;
    if (teil_b.aufgaben && teil_b.aufgaben.length) {
      userContent += `Aufgaben:\n${JSON.stringify(teil_b.aufgaben).substring(0, 5000)}\n\n`;
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= MATHEMATIK: GENERATE ================= */
async function handleGenerateMathe(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "analysis";
  const totalBE = be || 25;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const minTeilaufgaben = Math.max(3, Math.ceil(totalBE / 6));
  const maxTeilaufgaben = Math.max(minTeilaufgaben, Math.ceil(totalBE / 3));

  const sgThemen = {
    analysis: {
      title: "Analysis",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.1.1: Ganzrationale Funktionen (mit Parametern), Stammfunktionen, Funktionenscharen
- M12.1.2: Natürliche Exponentialfunktion, Produkt-/Kettenregel, Wachstums-/Abklingmodelle, Grenzwerte
- M12.1.3: Sinus-/Kosinusfunktion (Ableitungen, einfache Verknüpfungen)
- M12.4.1: Gebrochen-rationale Funktionen, Quotientenregel
- M12.4.2: Wurzelfunktion, Umkehrfunktion, Potenzfunktionen mit rationalen Exponenten
- M12.4.3: Natürliche Logarithmusfunktion als Umkehrfunktion von e^x
Lehrplan-Inhalte Jgst. 13:
- M13.1: Bestimmtes Integral als Flächenbilanz, Hauptsatz, Stammfunktionen, Flächenberechnung, uneigentliche Integrale, Rotationsvolumen
- M13.4: Anwendungen der Differential-/Integralrechnung, Parameterfunktionen, Extremwertprobleme`,
      kontexte: `Wachstums-/Abklingmodelle (Bakterienkultur, Medikament im Blut, Bevölkerung), CO₂-/Feinstaub-Messung, Produktionskosten/-gewinn, Geschwindigkeit und zurückgelegte Strecke, Wasserstand/Pegelstand, Temperaturverlauf, Höhenprofil einer Straße/Rutsche`
    },
    stochastik: {
      title: "Stochastik",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.2: Zufallsgrößen, Wahrscheinlichkeitsverteilung, Erwartungswert, Varianz, Standardabweichung, Bernoulli-Ketten, Binomialverteilung, Binomialkoeffizienten
- M12.3: Einseitiger Signifikanztest, Nullhypothese, Fehler 1. und 2. Art, Ablehnungsbereich, Signifikanzniveau
Lehrplan-Inhalte Jgst. 13:
- M13.2: Normalverteilung, diskrete vs. stetige Zufallsgrößen, Dichtefunktion, kumulative Verteilungsfunktion, Sigma-Regeln`,
      kontexte: `Verkehrszählung (Radfahrer, Helme, E-Bikes), Qualitätskontrolle (Produktionsfehler, fehlerhafte Verpackungen), Wahlumfragen, medizinische Tests (Schnelltest-Zuverlässigkeit), Versicherungen (Pedelecs, Schadenshäufigkeit), Schulveranstaltung (Lose, Glücksrad, CD-Verkauf)`
    },
    geometrie: {
      title: "Geometrie",
      inhalte: `Lehrplan-Inhalte Jgst. 12:
- M12.5: Punkte/Figuren/Körper im 3D-Koordinatensystem, Vektoren (Addition, Skalarprodukt, Kreuzprodukt, Betrag), Winkel, Flächeninhalte, Volumina
Lehrplan-Inhalte Jgst. 13:
- M13.3: Geraden und Ebenen (Parameter-, Normalen-, Koordinatenform), Lagebeziehungen, Schnittpunkte/-geraden, Schnittwinkel, Abstände (Punkt-Gerade, Punkt-Ebene, windschiefe Geraden, Hesse'sche Normalform), Kugeln (Koordinatenform, Lage zu Geraden/Ebenen)`,
      kontexte: `Theaterkulisse mit Licht/Schatten, Hügel/Berg mit Weinanbau und Burg, Dach-/Gebäudemodell, Sonnensegel/Zeltdach, Brückenkonstruktion, Aussichtsturm/Sichtlinie, Rampe/Auffahrt`
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.analysis;

  const systemPrompt = `Du bist ein Experte für das bayerische Mathematik-Abitur (eA, G9, ab 2026).
Erstelle eine authentische Mathematik-Aufgabe.

AUFGABE:
- Gesamt: EXAKT ${totalBE} BE — die Summe aller Teilaufgaben-BE MUSS EXAKT ${totalBE} ergeben!
- Bearbeitungszeit: ${zeitMinuten} Minuten
- Erstelle mindestens ${minTeilaufgaben} und höchstens ${maxTeilaufgaben} Teilaufgaben
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im aufgabe-Feld
- Teilaufgaben nummerieren: "1a)", "1b)", ..., "2a)", "2b)", etc.
- Jede einzelne Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen ' + totalBE + ' BE ergeben.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- VALIDIERUNG: Zähle am Ende nach — die Summe aller "be"-Werte MUSS EXAKT ${totalBE} ergeben!
- Hilfsmittel/CAS erlaubt
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Bestimmen Sie die Extrempunkte (Hoch- und Tiefpunkte, ...)"). Die Schüler sollen selbst herausfinden, welche Methoden anzuwenden sind.

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}
Sachkontext-Ideen: ${sgInfo.kontexte}

ISB-REFERENZFORMAT (orientiere dich an den illustrierenden Prüfungsaufgaben des ISB Bayern 2025):

PFLICHT-REGELN FÜR JEDE TEILAUFGABE:
- Jede Teilaufgabe MUSS einen klaren OPERATOR enthalten — NIEMALS nur eine Formel ohne Anweisung!
  FALSCH: "$f(x) = x^{3} - 6x^{2}$" (Was soll der Schüler tun?!)
  RICHTIG: "Gegeben ist die Funktion $f$ mit $f(x) = x^{3} - 6x^{2}$, $x \\in \\mathbb{R}$. Bestimmen Sie die Nullstellen von $f$."
- Operatoren nach AFB:
  AFB I: "Geben Sie an", "Berechnen Sie", "Bestimmen Sie", "Skizzieren Sie"
  AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie", "Untersuchen Sie"
  AFB III: "Beurteilen Sie", "Formulieren Sie eine Aussage im Sachzusammenhang", "Begründen Sie, ob das Modell sinnvoll ist"
- AFB-Verteilung: ca. 30% AFB I, 50% AFB II, 20% AFB III

SACHKONTEXT-ANFORDERUNGEN:
- Bei ≥15 BE: Die Aufgabe MUSS in einen KONKRETEN Sachkontext eingebettet sein (z.B. aus der obigen Sachkontext-Ideen-Liste)
- Einleitung: 1-3 Sätze, die den Sachzusammenhang beschreiben, BEVOR die Funktion/Formel kommt
  Beispiel: "Junge Hunde wachsen in ihren ersten Lebensmonaten sehr schnell. Die momentane Zunahme der Körpermasse eines Hundes wird durch die Funktion $f$ mit $f(t) = \\frac{1}{100} \\cdot (2t^{3} - 43t^{2} + 248t)$, $0 \\le t \\le 10$ (t in Monaten), modelliert."
- Bei <15 BE: Sachkontext optional, aber JEDE Teilaufgabe muss trotzdem einen vollständigen Aufgabentext mit Operator haben

KONTROLLWERTE:
- Bei mehrstufigen Aufgaben (≥15 BE): Gib bei einem wichtigen Zwischenergebnis einen Kontrollwert an — "(zur Kontrolle: ...)"

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Die Aufgabe muss mathematisch korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Methoden oder Konzepte verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \cdot x$ (NIEMALS $3.6 * x$)
- e-FUNKTION KRITISCH: Exponent IMMER in geschweifte Klammern!
  RICHTIG: $e^{-x}$, $e^{2x}$, $e^{-0{,}5x}$, $e^{-\frac{x}{2}}$
  FALSCH: $e^-x$, $e^(-x)$, $e^{-0.5x}$, $\exp(-x)$
  NIEMALS $e^-x$ (Klammern fehlen!), NIEMALS $\exp(...)$, NIEMALS runde Klammern $e^(...)$
- Brüche: $\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$ (NICHT $e^{-0.12x}$)
- Potenzen: $x^{2}$, $x^{n+1}$ (Klammern bei mehreren Zeichen)
- Wurzeln: $\sqrt{x}$, $\sqrt[3]{x}$
- Vergleiche: $\le$, $\ge$, $\ne$, $\approx$ (NICHT <=, >=)
- Integral: $\int_a^b f(x)\,dx$
- Ableitung: $f'(x)$, $f''(x)$
- Vektoren: $\vec{a}$, $\overrightarrow{AB}$
- Intervall: $0 \le x \le 30$ (NICHT $0 <= x <= 30$)
BEISPIEL: $$p(x) = 3{,}6 \cdot x \cdot e^{-0{,}12x} + 0{,}4 \quad (0 \le x \le 30)$$

GEOGEBRA-VISUALISIERUNG (optional):
Falls die Aufgabe von einer grafischen Darstellung profitiert, füge ein "grafik"-Feld hinzu.
- Analysis: type "graphing" — Funktionsgraphen, Tangenten, Nullstellen
- Geometrie: type "3d" — Punkte, Geraden, Ebenen im 3D-Raum
- Stochastik: type "probability" — nur wenn es die Aufgabe verdeutlicht

KRITISCHE GEOGEBRA-REGELN:
1. Variable ist IMMER x (NICHT t, n, k!). Auch wenn die Aufgabe t verwendet: b(x) = 80*x*exp(-0.2*x)
2. Immer * für Multiplikation: 2*x, NICHT 2x
3. e-Funktion: exp(x), NICHT e^x oder e^(x)
4. Nur EINFACHE Befehle: Funktionsdefinitionen, Punkte, Geraden
5. VERBOTEN: Integral(), Derivative(), Solve(), If(), Sequence(), Zip() — diese erzeugen Fehler!
6. KEINE LaTeX-Syntax ($, \frac, \int, etc.) in GeoGebra-Befehlen!
7. Funktionsnamen: Kleinbuchstaben (f, g, h), NICHT Großbuchstaben (F, G, B)

KORREKT: f(x) = 80*x*exp(-0.2*x), A = (2, f(2))
FALSCH: b(t) = 80*t*e^(-0.2*t), Integral(f, 0, 5), B(x) = ..., SetColor(...)
8. KEINE SetColor-Befehle — Farben werden automatisch gesetzt.
9. "settings" ist NICHT nötig — die Achsen werden automatisch angepasst.

WANN Grafik: NUR wenn die Grafik zum LÖSEN der Aufgabe NOTWENDIG ist!
- Die Aufgabe verlangt, Werte aus einem Graphen abzulesen
- Die Aufgabe bezieht sich auf eine abgebildete geometrische Figur
- Die Aufgabe sagt explizit "Der Graph ist dargestellt" oder "Siehe Abbildung"
WANN KEINE Grafik (= NORMALFALL, meistens KEINE Grafik!):
- Schüler sollen den Graph selbst skizzieren (das ist Teil der Aufgabe!)
- Reine Rechenaufgaben, Ableitungen, Integrale, Gleichungen lösen
- Kurvendiskussion (Schüler sollen Extrema/Nullstellen SELBST berechnen)
- Stochastik, Hypothesentests
- Die Funktion dient nur als Kontext
Im Zweifel: KEINE Grafik. Nur wenige Aufgaben brauchen tatsächlich eine Grafik.

WICHTIG: Das folgende Beispiel zeigt NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Funktionen, Kontexten und Zahlenwerten! Kopiere NIEMALS Inhalte aus dem Beispiel!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "In einer Messstation wird seit 2010 die Feinstaubkonzentration in der Luft gemessen. Die Konzentration $c$ (in $\\mu g/m^{3}$) lässt sich im Zeitraum $0 \\le t \\le 12$ ($t$ in Monaten) modellhaft durch die Funktion $c$ mit $c(t) = 8 \\cdot t \\cdot e^{-0{,}3t} + 15$ beschreiben.",
  "teilaufgaben": [
    {"id": "a)", "text": "Berechnen Sie $c(0)$ und $c(5)$ und beschreiben Sie die Bedeutung der Ergebnisse im Sachzusammenhang.", "be": 3},
    {"id": "b)", "text": "Bestimmen Sie den Zeitpunkt, zu dem die Feinstaubkonzentration maximal ist.", "be": 5},
    {"id": "c)", "text": "Ermitteln Sie die durchschnittliche Feinstaubkonzentration in den ersten 12 Monaten.", "be": 5},
    {"id": "d)", "text": "Beurteilen Sie, ob das Modell für große Werte von $t$ sinnvoll ist.", "be": 2}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}"
}
Hinweis: "grafik" ist OPTIONAL — nur wenn eine Visualisierung zum LÖSEN der Aufgabe nötig ist. Grafik-Format: {"type": "graphing", "commands": ["f(x) = 2*x^2 - 3*x + 1"]}
WICHTIG: Generiere EIGENE Aufgaben! Das Beispiel oben ist NUR zur Orientierung.`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Mathematik-Aufgaben' : 'eine Mathematik-Aufgabe'} (EXAKT ${totalBE} BE gesamt, mindestens ${minTeilaufgaben} Teilaufgaben) im Sachgebiet ${sgInfo.title}.
${totalBE >= 15 ? 'Die Aufgabe MUSS in einen konkreten Sachkontext eingebettet sein (z.B. Modellierung, Messdaten, Alltagsproblem).' : 'Die Aufgabe soll klar formuliert sein mit vollständigen Aufgabenstellungen.'}
Jede Teilaufgabe braucht einen klaren Operator (Bestimmen Sie, Zeigen Sie, Begründen Sie, etc.) — NIEMALS nur eine Formel ohne Anweisung!
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).
PFLICHT: Die Summe aller Teilaufgaben-BE muss EXAKT ${totalBE} ergeben. Erstelle genügend Teilaufgaben!`;

  const maxTokens = Math.max(6000, 3000 + aufgabenAnzahl * 2000 + totalBE * 80);
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], Math.min(maxTokens, 16000));

  const content = extractJSON(openaiRes);

  // Validierung: BE-Summe prüfen und ggf. korrigieren
  if (content.teilaufgaben && content.teilaufgaben.length > 0) {
    const beSum = content.teilaufgaben.reduce((sum, t) => sum + (parseInt(t.be) || 0), 0);
    if (beSum !== totalBE) {
      content.gesamt_be = beSum;
    }
  }
  if (!content.gesamt_be) content.gesamt_be = totalBE;

  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK: GRADE ================= */
async function handleGradeMathe(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, aufgabentyp, student_text, student_texts } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 5;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  // Build structured student solution text
  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    // Per-Teilaufgabe format
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        // Find matching Teilaufgabe for BE info
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Mathematik-Klausur (Bayern, eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Ansatz, Rechnung/Lösungsweg, Ergebnis
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text-Mathe (z.B. f'(x) = 4x + 3, int_0^1 x^2 dx = 1/3) und LaTeX-Notation ($\\frac{1}{2}$, $\\int_0^1 x^2\\,dx$). Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für mathematische Ausdrücke.
LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 2, "bewertung": "Markdown-Bewertung mit $LaTeX$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= MATHEMATIK: MODEL ANSWER ================= */
async function handleModelAnswerMathe(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Mathematik-Oberstufenschüler am bayerischen Gymnasium (eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Ableitung mit Kettenregel")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\cdot$ (NIEMALS $*$)
- e-Funktion: Exponent IMMER in geschweifte Klammern! $e^{-x}$, $e^{-0{,}5x}$ (NIEMALS $e^-x$, $e^(-x)$ oder $\exp(...)$)
- Brüche: $\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$
- Vergleiche: $\le$, $\ge$, $\approx$`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= MATHEMATIK: PARSE TASK ================= */
async function handleParseTaskMathe(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Mathematik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$). LATEX-REGELN: \\cdot statt *, e-Funktion IMMER mit geschweiften Klammern im Exponent: e^{-x}, e^{-0{,}5x} (NIEMALS e^-x oder \\exp(...)), \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { jsonMode: true });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK ABITUR: GENERATE ================= */
async function handleGenerateAbiturMathe(request, env) {
  const systemPrompt = `Du bist ein Experte für das bayerische Mathematik-Abitur (eA, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit 100 BE.

PRÜFUNGSSTRUKTUR:

TEIL A (30 BE, ohne CAS/Hilfsmittel, max. 110 min):
- Aufgabengruppe 1 (Pflichtteil, 20 BE):
  - A1 (5 BE): Analysis
  - A2 (5 BE): Analysis
  - A3 (5 BE): Stochastik
  - A4 (5 BE): Geometrie
  Jede Aufgabe: 2-3 Teilaufgaben, ohne CAS lösbar

- Aufgabengruppe 2 (Wahlteil, 10 BE — Schüler wählt 2 von 6):
  - A5 (5 BE): Analysis
  - A6 (5 BE): Analysis
  - A7 (5 BE): Stochastik
  - A8 (5 BE): Stochastik
  - A9 (5 BE): Geometrie
  - A10 (5 BE): Geometrie
  Jede Aufgabe: 2-3 Teilaufgaben, ohne CAS lösbar

TEIL B (70 BE, mit CAS/Hilfsmitteln):
  - B1 (30 BE): Analysis — große mehrteilige Aufgabe
  - B2 (20 BE): Stochastik — große mehrteilige Aufgabe
  - B3 (20 BE): Geometrie — große mehrteilige Aufgabe

LEHRPLAN-INHALTE (G9, Bayern, ab 2026):
Analysis: M12.1 Ganzrationale Funktionen (Parameterscharen, Stammfunktionen), M12.1.2 Natürliche Exponentialfunktion (Produkt-/Kettenregel, Wachstums-/Abklingmodelle), M12.1.3 Sinus-/Kosinusfunktion, M12.4 Gebrochen-rationale Funktionen (Quotientenregel), Wurzel-/Umkehrfunktionen, Logarithmusfunktion. M13.1 Bestimmtes Integral (Flächenbilanz, Hauptsatz, uneigentliche Integrale, Rotationsvolumen), M13.4 Extremwertprobleme, Parameterfunktionen.
Stochastik: M12.2 Zufallsgrößen, Binomialverteilung (Bernoulli-Ketten, Erwartungswert, Standardabweichung), M12.3 Einseitiger Signifikanztest (Fehler 1./2. Art, Ablehnungsbereich), M13.2 Normalverteilung (Dichtefunktion, Sigma-Regeln).
Geometrie: M12.5 Vektoren (Skalar-/Kreuzprodukt, Winkel, Flächeninhalte), M13.3 Geraden/Ebenen (Parameter-/Normalen-/Koordinatenform, Lagebeziehungen, Abstände, Hesse'sche Normalform, Kugeln).

ISB-AUFGABENSTRUKTUR (basierend auf den offiziellen illustrierenden Prüfungsaufgaben Bayern 2025):

TEIL A — KOMPAKTE AUFGABEN (je 5 BE, 2-3 Teilaufgaben, OHNE CAS):
- Analysis: Funktion mit klarer Definition + Definitionsmenge, dann Operatoren wie "Zeigen Sie", "Bestimmen Sie"
- Stochastik: Sachkontext (z.B. Gärtnerei, Würfelspiel, Verkehr), dann Berechnung + Erläuterung
- Geometrie: Sachkontext mit Koordinatenmodell (z.B. Bühne/Lampe/Schatten, Gebäude), dann rechnerische Untersuchung
- Teil A Aufgaben MÜSSEN ohne CAS lösbar sein → nur "schöne" Zahlen, keine komplizierten Dezimalzahlen

TEIL B — GROSSE MEHRTEILIGE AUFGABEN:
• B1 Analysis (30 BE): MUSS aus 2-3 NUMMERIERTEN ABSCHNITTEN bestehen (im "text"-Feld mit "1 ...", "2 ...", "3 ..." nummeriert), die AUFEINANDER AUFBAUEN:
  - Abschnitt 1 (ca. 11 BE): Innermathematische Untersuchung einer konkreten Funktion (z.B. ganzrationale Funktion mit Graph). Teilaufgaben: Symmetrie, Krümmung, lokale/mittlere Änderungsrate, Tangente.
  - Abschnitt 2 (ca. 9 BE): Weitere Funktion oder Funktionenschar (z.B. $g_k: x \\mapsto 3x \\cdot e^{kx}$ mit $k \\in \\mathbb{R} \\setminus \\{0\\}$). Teilaufgaben: Extrempunkte der Schar, Parameter bestimmen, Gleichung lösen.
  - Abschnitt 3 (ca. 10 BE): SACHKONTEXT — die Funktionen aus 1 und 2 werden in einem realen Modell verwendet (z.B. Hundewachstum, CO₂-Konzentration, Temperaturverlauf). Teilaufgaben: "Formulieren Sie eine Aussage im Sachzusammenhang", Integration, Modellvergleich, Modellkritik.
  KONTROLLWERTE: Bei 1-2 wichtigen Zwischenergebnissen "(zur Kontrolle: ...)" angeben!

• B2 Stochastik (20 BE): MUSS 3 NUMMERIERTE ABSCHNITTE mit durchgängigem Sachkontext haben!
  - Abschnitt 1 (ca. 6 BE): Vierfeldertafel / bedingte Wahrscheinlichkeit (konkrete Daten: "630 Radfahrer, ein Drittel mit E-Bike, 147 ohne Helm...")
  - Abschnitt 2 (ca. 5 BE): Binomialverteilung mit konkreter Berechnung ("Auf 50 km tritt mit 1,6% Wahrscheinlichkeit eine Reifenpanne auf...")
  - Abschnitt 3 (ca. 9 BE): Hypothesentest oder weiterführende Modellierung mit Interpretation im Sachzusammenhang
  Beispiel-Kontexte: Verkehrszählung/Radfahrer/Helm, Pedelec-Verkauf/Versicherung, Qualitätskontrolle, Schulveranstaltung/CD/Glücksrad

• B3 Geometrie (20 BE): MUSS Sachkontext mit 3D-Koordinatenmodell haben (5-6 Teilaufgaben)!
  - Einleitung: Reales Objekt im Koordinatensystem modellieren (z.B. "Die x₁x₂-Ebene stellt die horizontale Grundfläche dar, auf der sich ein Hügel erhebt. Ein Hang wird durch das Trapez ABCD dargestellt.")
  - Punkte mit konkreten Koordinaten angeben: A(17|−10|0), B(17|20|0), C(2|4|8), D(2|−10|8)
  - Teilaufgaben: Nachweis (rechter Winkel, Parallelogramm), Flächeninhalt, Ebenengleichung in Koordinatenform, Neigungswinkel, Abstand/Sichtlinie, Beurteilung
  - Tabellen/Zusatzinfo einbinden wenn sinnvoll (z.B. Neigungswinkel-Klassifizierung: Flachlage 0°-3°, Hanglage 3°-17°, Steillage ≥17°)
  - KONTROLLWERTE bei 1-2 Zwischenergebnissen angeben
  Beispiel-Kontexte: Hügel/Berg mit Weinanbau und Burg, Dachkonstruktion, Sonnensegel, Brückenmodell

PFLICHT-REGELN FÜR ALLE AUFGABEN:
- JEDE Teilaufgabe MUSS einen klaren OPERATOR haben — NIEMALS nur eine Formel ohne Anweisung!
  VERBOTEN: {"text": "$f(x) = 2x^{3} - 6x^{2}$"}
  RICHTIG: {"text": "Gegeben ist die in $\\mathbb{R}$ definierte Funktion $f$ mit $f(x) = 2x^{3} - 6x^{2}$. Bestimmen Sie die Nullstellen von $f$."}
- Operatoren nach AFB:
  AFB I: "Geben Sie an", "Berechnen Sie", "Bestimmen Sie", "Skizzieren Sie"
  AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie", "Untersuchen Sie", "Weisen Sie nach"
  AFB III: "Beurteilen Sie", "Formulieren Sie eine Aussage im Sachzusammenhang", "Begründen Sie, ob das Modell sinnvoll ist"

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen mathematisch korrekt und eindeutig lösbar sein
- Teil A muss OHNE CAS/Taschenrechner lösbar sein
- Teil B darf CAS voraussetzen
- KEINE LÖSUNGSHINWEISE in Klammern
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Inhalten.

LATEX-FORMATIERUNG (schreibe echte Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \cdot x$ (NIEMALS $3.6 * x$)
- e-FUNKTION KRITISCH: Exponent IMMER in geschweifte Klammern!
  RICHTIG: $e^{-x}$, $e^{2x}$, $e^{-0{,}5x}$, $e^{-\frac{x}{2}}$
  FALSCH: $e^-x$, $e^(-x)$, $e^{-0.5x}$, $\exp(-x)$
  NIEMALS $e^-x$ (Klammern fehlen!), NIEMALS $\exp(...)$, NIEMALS runde Klammern $e^(...)$
- Brüche: $\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$) — auch im Exponenten: $e^{-0{,}12x}$ (NICHT $e^{-0.12x}$)
- Potenzen: $x^{2}$, $x^{n+1}$ (Klammern bei mehreren Zeichen)
- Wurzeln: $\sqrt{x}$, $\sqrt[3]{x}$
- Vergleiche: $\le$, $\ge$, $\ne$, $\approx$ (NICHT <=, >=)
- Integral: $\int_a^b f(x)\,dx$
- Ableitung: $f'(x)$, $f''(x)$
- Vektoren: $\vec{a}$, $\overrightarrow{AB}$
- Intervall: $0 \le x \le 30$ (NICHT $0 <= x <= 30$)
BEISPIEL: $$p(x) = 3{,}6 \cdot x \cdot e^{-0{,}12x} + 0{,}4 \quad (0 \le x \le 30)$$

GEOGEBRA-VISUALISIERUNG (optional, pro Aufgabe):
Jede Aufgabe kann ein optionales "grafik"-Feld enthalten, um eine interaktive Grafik anzuzeigen.
- Analysis: type "graphing" — Funktionsgraphen, Tangenten, Nullstellen
- Geometrie: type "3d" — Punkte, Geraden, Ebenen im 3D-Raum
- Stochastik: type "probability" — nur wenn sinnvoll

KRITISCHE GEOGEBRA-REGELN:
1. Variable ist IMMER x (NICHT t, n, k!). Auch wenn die Aufgabe t verwendet: b(x) = 80*x*exp(-0.2*x)
2. Immer * für Multiplikation: 2*x, NICHT 2x
3. e-Funktion: exp(x), NICHT e^x oder e^(x)
4. Nur EINFACHE Befehle: Funktionsdefinitionen, Punkte, Geraden
5. VERBOTEN: Integral(), Derivative(), Solve(), If(), Sequence(), Zip() — diese erzeugen Fehler!
6. KEINE LaTeX-Syntax ($, \frac, \int, etc.) in GeoGebra-Befehlen!
7. Funktionsnamen: Kleinbuchstaben (f, g, h), NICHT Großbuchstaben (F, G, B)

KORREKT: f(x) = 80*x*exp(-0.2*x), A = (2, f(2))
FALSCH: b(t) = 80*t*e^(-0.2*t), Integral(f, 0, 5), B(x) = ..., SetColor(...)
8. KEINE SetColor-Befehle — Farben werden automatisch gesetzt.
9. "settings" ist NICHT nötig — die Achsen werden automatisch angepasst.

WANN Grafik: NUR wenn die Grafik zum LÖSEN der Aufgabe NOTWENDIG ist!
- Die Aufgabe verlangt, Werte aus einem Graphen abzulesen
- Die Aufgabe bezieht sich auf eine abgebildete geometrische Figur
- Die Aufgabe sagt "Der Graph ist dargestellt" oder "Siehe Abbildung"
WANN KEINE Grafik (= NORMALFALL, meistens KEINE Grafik!):
- Schüler sollen den Graph selbst skizzieren (das ist Teil der Aufgabe!)
- Reine Rechenaufgaben, Ableitungen, Integrale, Gleichungen lösen
- Kurvendiskussion (Schüler sollen Extrema/Nullstellen SELBST berechnen)
- Stochastik, Hypothesentests
- Die Funktion dient nur als Kontext
Im Zweifel: KEINE Grafik. Nur wenige Aufgaben brauchen tatsächlich eine Grafik.

WICHTIG: Das folgende Beispiel zeigt NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Funktionen, Kontexten und Zahlenwerten! Kopiere NIEMALS Inhalte aus dem Beispiel!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a_pflicht": [
    {"id": "A1", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben ist die in $\\mathbb{R}^{+}$ definierte Funktion $f: x \\mapsto (\\ln x)^{2}$. Der Graph von $f$ verläuft durch den Punkt $P(e|1)$.", "teilaufgaben": [{"id": "a)", "text": "Die zweite Ableitungsfunktion von $f$ besitzt an der Stelle $x = e$ eine Nullstelle mit Vorzeichenwechsel. Geben Sie die Bedeutung dieser Tatsache für den Graphen von $f$ an.", "be": 1}, {"id": "b)", "text": "Bestimmen Sie eine Gleichung der Tangente an den Graphen von $f$ im Punkt $P$.", "be": 4}]},
    {"id": "A2", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben ist eine in $\\mathbb{R}$ definierte Funktion $f$ mit $f(x) = x^{4} - kx^{2}$, wobei $k$ eine positive reelle Zahl ist.", "teilaufgaben": [{"id": "a)", "text": "Zeigen Sie, dass $f'(x) = 2x \\cdot (2x^{2} - k)$ ein Term der ersten Ableitungsfunktion von $f$ ist.", "be": 1}, {"id": "b)", "text": "Die beiden Tiefpunkte des Graphen von $f$ haben jeweils die $y$-Koordinate $-1$. Ermitteln Sie den Wert von $k$.", "be": 4}]},
    {"id": "A3", "sachgebiet": "Stochastik", "be": 5, "text": "Eine Bäckerei verkauft Brötchen in den Sorten Weizen, Roggen und Dinkel. Aus 20 Brötchen wird eine Tüte zusammengestellt.", "teilaufgaben": [{"id": "a)", "text": "Eine Tüte soll Brötchen in genau zwei verschiedenen Sorten enthalten. Bestimmen Sie die Anzahl der Möglichkeiten, diese Tüte zusammenzustellen.", "be": 2}, {"id": "b)", "text": "In einer Tüte sollen zu jeder der drei Sorten mindestens fünf und höchstens acht Brötchen enthalten sein. Bestimmen Sie die Anzahl der Möglichkeiten.", "be": 3}]},
    {"id": "A4", "sachgebiet": "Geometrie", "be": 5, "text": "In einem Koordinatensystem wird modellhaft ein $8\\,\\text{m}$ breiter Bühnenraum dargestellt. Die Rückwand liegt in der $x_1 x_3$-Ebene. Ein Scheinwerfer wird durch den Punkt $L(3|0|6)$ dargestellt, die Spitze einer Requisite durch den Punkt $S(1|5|2)$.", "teilaufgaben": [{"id": "a)", "text": "Untersuchen Sie rechnerisch, ob der Schatten der Spitze auf die Rückwand fällt.", "be": 5}]}
  ],
  "teil_a_wahl": [
    {"id": "A5", "sachgebiet": "Analysis", "be": 5, "text": "Gegeben sind die in $\\mathbb{R}$ definierten Funktionen $f$ und $g$. Der Graph von $f$ ist symmetrisch bezüglich der $y$-Achse, der Graph von $g$ ist symmetrisch bezüglich des Koordinatenursprungs. Beide Graphen haben einen Hochpunkt im Punkt $(2|1)$.", "teilaufgaben": [{"id": "a)", "text": "Geben Sie für die Graphen von $f$ und $g$ jeweils die Koordinaten und die Art eines weiteren Extrempunkts an.", "be": 2}, {"id": "b)", "text": "Untersuchen Sie die in $\\mathbb{R}$ definierte Funktion $h$ mit $h(x) = f(x) \\cdot (g(x))^{3}$ im Hinblick auf eine mögliche Symmetrie ihres Graphen.", "be": 3}]},
    {"id": "A6", "sachgebiet": "Analysis", "be": 5, "text": "Der Graph der in $\\mathbb{R}$ definierten Funktion $f: x \\mapsto \\frac{1}{4}x^{2}$ und die Gerade mit der Gleichung $y = 1$ schließen ein Flächenstück ein.", "teilaufgaben": [{"id": "a)", "text": "Bestimmen Sie das Volumen des Körpers, der durch Rotation dieses Flächenstücks um die $y$-Achse entsteht.", "be": 5}]},
    {"id": "A7", "sachgebiet": "Stochastik", "be": 5, "text": "Bei einem Spiel werfen zwei Spieler abwechselnd jeweils drei Würfel. Das Spiel endet, wenn ein Spieler die Augensumme 18 erzielt oder die Augensumme des vorausgegangenen Wurfs des anderen Spielers nicht übertrifft. Beim ersten Wurf erzielt ein Spieler die Augensumme 15.", "teilaufgaben": [{"id": "a)", "text": "Berechnen Sie die Wahrscheinlichkeit dafür, dass dieser Spieler die Würfel im selben Spiel noch einmal wirft. Erläutern Sie Ihr Vorgehen.", "be": 5}]},
    {"id": "A8", "sachgebiet": "Stochastik", "be": 5, "text": "Die Abbildung zeigt den Graphen der Dichtefunktion der normalverteilten Zufallsgröße $A$.", "teilaufgaben": [{"id": "a)", "text": "Die Wahrscheinlichkeit dafür, dass $A$ einen Wert aus dem Intervall $[6; 10]$ annimmt, beträgt etwa $68\\%$. Berechnen Sie die Wahrscheinlichkeit dafür, dass $A$ einen Wert annimmt, der größer als $10$ ist.", "be": 2}, {"id": "b)", "text": "Die Zufallsgröße $B$ ist ebenfalls normalverteilt; der Erwartungswert von $B$ ist ebenso groß wie der von $A$, die Standardabweichung von $B$ ist größer. Skizzieren Sie einen möglichen Graphen der Dichtefunktion von $B$.", "be": 3}]},
    {"id": "A9", "sachgebiet": "Geometrie", "be": 5, "text": "Gegeben sind die Punkte $A(0|0|0)$, $B(3|4|1)$, $C(1|7|3)$ und $D(-2|3|2)$.", "teilaufgaben": [{"id": "a)", "text": "Weisen Sie nach, dass das Viereck $ABCD$ ein Parallelogramm ist.", "be": 1}, {"id": "b)", "text": "Der Punkt $T$ liegt auf der Strecke $\\overline{AC}$. Das Dreieck $ABT$ hat bei $B$ einen rechten Winkel. Ermitteln Sie das Verhältnis der Länge von $\\overline{AT}$ zur Länge von $\\overline{CT}$.", "be": 4}]},
    {"id": "A10", "sachgebiet": "Geometrie", "be": 5, "text": "Die Punkte $P$ und $Q$ liegen in der Ebene $E: 5x_1 - 4x_2 + 3x_3 - 6 = 0$ und haben voneinander den Abstand $10$.", "teilaufgaben": [{"id": "a)", "text": "Ermitteln Sie mögliche Koordinaten von $P$ und $Q$.", "be": 5}]}
  ],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 30, "text": "1 Gegeben ist die in $\\mathbb{R}$ definierte Funktion $f: x \\mapsto \\frac{1}{100} \\cdot (2x^{3} - 43x^{2} + 248x)$. Abbildung 1 zeigt den Graphen $G_f$ von $f$ im Bereich $0 \\le x \\le 10$.", "teilaufgaben": [{"id": "1a)", "text": "Begründen Sie anhand des Terms von $f$, dass $G_f$ nicht symmetrisch bezüglich des Koordinatenursprungs ist, und zeigen Sie rechnerisch, dass $G_f$ für $x < 7\\frac{1}{6}$ rechtsgekrümmt ist.", "be": 4}, {"id": "1b)", "text": "Es gibt eine Stelle $x_0 \\in [0; 10]$, an der die lokale Änderungsrate von $f$ mit der mittleren Änderungsrate von $f$ im Intervall $[0; 10]$ übereinstimmt. Ermitteln Sie grafisch einen Näherungswert für $x_0$.", "be": 3}, {"id": "1c)", "text": "Bestimmen Sie eine Gleichung der Tangente $t$ an $G_f$ im Punkt $(10|f(10))$.\\n(zur Kontrolle: Gleichung von $t$: $y = -0{,}12x + 3$)", "be": 4}, {"id": "2a)", "text": "Betrachtet wird die Schar der in $\\mathbb{R}$ definierten Funktionen $g_k: x \\mapsto 3x \\cdot e^{kx}$ mit $k \\in \\mathbb{R} \\setminus \\{0\\}$. Der Graph jeder Funktion $g_k$ hat genau einen Extrempunkt $E_k$. Alle Extrempunkte $E_k$ liegen auf einer Geraden $h$. Bestimmen Sie rechnerisch die Steigung von $h$.", "be": 5}, {"id": "2b)", "text": "Der Graph $G$ einer Funktion dieser Schar besitzt den Hochpunkt $(4|\\frac{12}{e})$. Begründen Sie, dass $G$ der Graph der Funktion $g_k$ mit $k = -0{,}25$ ist.", "be": 2}, {"id": "2c)", "text": "Geben Sie alle Werte $a \\in \\mathbb{R}$ an, für die die Gleichung $3x \\cdot e^{-0{,}25x} = a$ genau eine Lösung besitzt.", "be": 2}, {"id": "3a)", "text": "Junge Hunde wachsen in ihren ersten Lebensmonaten sehr schnell. Zur Beschreibung der Zunahme der Körpermasse werden zwei Modelle betrachtet: Modell A verwendet für $0 \\le x \\le 10$ den Graphen $G_f$ und für $10 \\le x \\le 25$ die Tangente $t$; Modell B verwendet für $0 \\le x \\le 25$ den Graphen von $g_{-0{,}25}$. Die $y$-Koordinate steht jeweils für die momentane Änderungsrate der Körpermasse in kg pro Monat. Formulieren Sie eine Aussage im Sachzusammenhang, die für beide Modelle für $x = 4$ zutrifft.", "be": 1}, {"id": "3b)", "text": "Berechnen Sie auf der Grundlage von Modell A, wie viele Monate nach der Geburt ein Hund erstmals nicht mehr an Körpermasse zunimmt.\\n(zur Kontrolle: 25 Monate)", "be": 2}, {"id": "3c)", "text": "Begründen Sie, dass auf der Grundlage von Modell A die Masse, um die ein Hund in den ersten 25 Monaten insgesamt zunimmt, mit dem Term $\\int_0^{10} f(x)\\,dx + 13{,}5$ berechnet werden kann.", "be": 3}, {"id": "3d)", "text": "Geben Sie für zwei verschiedene in $[0; 10]$ definierte Funktionen, deren Funktionswerte für $x > 0$ zwischen denen von $f$ und $g_{-0{,}25}$ liegen, jeweils einen Funktionsterm an.", "be": 4}]},
    {"id": "B2", "sachgebiet": "Stochastik", "be": 20, "text": "1 Bei einer Verkehrszählung zur Untersuchung des Sicherheitsbewusstseins im Straßenverkehr wurden 630 Radfahrer erfasst. Ein Drittel davon fuhr ein Fahrrad mit Elektromotor, 147 waren mit einem Fahrrad ohne Elektromotor unterwegs und trugen keinen Helm. Insgesamt trugen $40\\%$ der Radfahrer keinen Helm. Betrachtet werden die Ereignisse E: „Die Person fuhr ein Fahrrad mit Elektromotor" und H: „Die Person trug einen Helm".", "teilaufgaben": [{"id": "1a)", "text": "Begründen Sie anhand der vorliegenden Daten, dass $E$ und $H$ stochastisch abhängig sind.", "be": 3}, {"id": "1b)", "text": "Beschreiben Sie das Ereignis $\\bar{E} \\cap H$ im Sachzusammenhang und ermitteln Sie die Wahrscheinlichkeit dafür, dass die Person einen Helm trug, wenn bekannt ist, dass sie auf einem Fahrrad ohne Elektromotor unterwegs war.", "be": 3}, {"id": "2a)", "text": "Nach einer statistischen Erhebung tritt auf einer $50\\,\\text{km}$ langen, mit dem Fahrrad zurückgelegten Strecke mit einer Wahrscheinlichkeit von $1{,}6\\%$ eine Reifenpanne auf. Ermitteln Sie auf $50\\,\\text{km}$ genau, ab welcher Gesamtstrecke die Wahrscheinlichkeit für mindestens eine Reifenpanne mehr als $90\\%$ beträgt.", "be": 5}, {"id": "3a)", "text": "Im Jahr 2020 wurden in Deutschland rund fünf Millionen Fahrräder verkauft, davon $40\\%$ Pedelecs. Unter 200 zufällig ausgewählten Fahrrädern beschreibt $X$ die Anzahl der Pedelecs. Bestimmen Sie $P(70 \\le X \\le 90)$ und beschreiben Sie die Bedeutung im Sachzusammenhang.", "be": 3}, {"id": "3b)", "text": "Für jedes vierte verkaufte Pedelec wurde eine Versicherung abgeschlossen. $Y$ beschreibt die Anzahl der versicherten Pedelecs unter den 200 Fahrrädern. Berechnen Sie $P(Y = 0)$.", "be": 2}, {"id": "3c)", "text": "Ermitteln Sie den größtmöglichen Wert von $k$, für den $P_{0{,}1}^{200}(Y \\ge k) > 0{,}8$ gilt, und interpretieren Sie das Ergebnis im Sachzusammenhang.", "be": 4}]},
    {"id": "B3", "sachgebiet": "Geometrie", "be": 20, "text": "Gegeben sind die Punkte $A(17|-10|0)$, $B(17|20|0)$, $C(2|4|8)$ und $D(2|-10|8)$. Es gilt $\\overline{AB} \\parallel \\overline{CD}$, somit ist das Viereck $ABCD$ ein Trapez. In einem Modell stellt die $x_1 x_2$-Ebene die horizontale Grundfläche dar, auf der sich ein Hügel erhebt. Ein Hang des Hügels wird durch das Trapez $ABCD$ dargestellt. Auf einem Plateau steht eine Burg, deren höchste Stelle der vorderen Fassade durch $S(-6|2|12)$ dargestellt wird. Eine Längeneinheit entspricht $10\\,\\text{m}$.", "teilaufgaben": [{"id": "a)", "text": "Zeigen Sie, dass das Trapez $ABCD$ bei $D$ einen rechten Innenwinkel hat.", "be": 2}, {"id": "b)", "text": "Bestimmen Sie den Flächeninhalt des Trapezes $ABCD$.\\n(zur Kontrolle: $374$)", "be": 3}, {"id": "c)", "text": "Das Trapez $ABCD$ liegt in der Ebene $H$. Bestimmen Sie eine Gleichung von $H$ in Koordinatenform.\\n(zur Kontrolle: $H: 8x_1 + 15x_3 - 136 = 0$)", "be": 3}, {"id": "d)", "text": "Bestimmen Sie die Höhe der vorderen Burgfassade an ihrer höchsten Stelle in Metern.", "be": 2}, {"id": "e)", "text": "Der Hang wird auf seiner gesamten Fläche für den Weinanbau genutzt. Berechnen Sie den Inhalt der Weinanbaufläche in Hektar und untersuchen Sie mithilfe der folgenden Tabelle, um welche Weinanbaulage es sich handelt: Flachlage $0°$ bis $3°$, Hanglage $3°$ bis $17°$, Steillage $17°$ oder mehr.", "be": 5}, {"id": "f)", "text": "Ein Arbeiter steht auf dem Hang an der Stelle $P(5{,}75|-2{,}5|6)$ und versucht, aus einer Blickhöhe von zwei Metern die Burg zu sehen. Beurteilen Sie, ob der Hang die freie Sicht auf die höchste Stelle der vorderen Fassade verhindert.", "be": 5}]}
  ]
}
Hinweis: "grafik" ist OPTIONAL pro Aufgabe.
WICHTIG: Generiere für ALLE Aufgaben VOLLSTÄNDIGE, AUSFORMULIERTE Teilaufgaben mit klaren Operatoren! MINDESTENS 2 Teilaufgaben pro Teil-A-Aufgabe, MINDESTENS 6 Teilaufgaben pro Teil-B-Aufgabe. Verwende KOMPLETT ANDERE Funktionen, Kontexte und Zahlenwerte als im Beispiel! B1 MUSS 2-3 nummerierte Abschnitte haben, B2 und B3 MÜSSEN Sachkontexte haben!`;

  const userPrompt = `Erstelle eine vollständige Mathematik-Abiturprüfung (eA, 100 BE).
Teil A: 4 Pflichtaufgaben + 6 Wahlaufgaben (je 5 BE), ohne CAS lösbar
Teil B: B1 Analysis (30 BE, 2-3 nummerierte Abschnitte mit Sachkontext), B2 Stochastik (20 BE, durchgängiger Sachkontext), B3 Geometrie (20 BE, 3D-Modell mit Sachkontext), mit CAS
KRITISCH: Alle Formeln in LaTeX-Notation. JEDE Teilaufgabe braucht einen klaren Operator — NIEMALS nur eine Formel ohne Anweisung!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK ABITUR: GRADE ================= */
async function handleGradeAbiturMathe(request, env) {
  const body = await request.json();
  const { teil_a_pflicht, teil_a_wahl, teil_b, student_text_a, student_text_b } = body;

  if (!student_text_a && !student_text_b) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  let aufgabenInfo = "TEIL A (30 BE, ohne CAS):\n\nPflichtteil (20 BE):\n";
  if (teil_a_pflicht && teil_a_pflicht.length) {
    for (const a of teil_a_pflicht) {
      aufgabenInfo += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }
  aufgabenInfo += "\nWahlteil (gewählte Aufgaben, 10 BE):\n";
  if (teil_a_wahl && teil_a_wahl.length) {
    for (const a of teil_a_wahl) {
      aufgabenInfo += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }
  aufgabenInfo += "\n\nTEIL B (70 BE, mit CAS):\n";
  if (teil_b && teil_b.length) {
    for (const b of teil_b) {
      aufgabenInfo += `${b.id} – ${b.sachgebiet} (${b.be} BE): ${truncate(b.text || "", 500)}\n`;
      if (b.teilaufgaben) {
        for (const t of b.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  const rubricPrompt = `Du bewertest eine vollständige Mathematik-Abiturprüfung (Bayern, eA, 100 BE).

BEWERTUNGSREGELN:
- Teil A (30 BE): Pflichtteil (20 BE) + Wahlteil (10 BE aus gewählten Aufgaben)
- Teil B (70 BE): B1 Analysis (30 BE), B2 Stochastik (20 BE), B3 Geometrie (20 BE)
- Bewerte jede Teilaufgabe einzeln: Ansatz, Rechnung, Ergebnis
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Mathe und LaTeX-Notation ($...$). Interpretiere beides großzügig.

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.
LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.

Antworte NUR mit validem JSON:
{
  "teil_a_be": <0-30>,
  "teil_b_be": <0-70>,
  "gesamt_be": <0-100>,
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülerlösung Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülerlösung Teil B:\n${truncate(student_text_b, 12000)}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    const teilABE = parsed.teil_a_be ?? null;
    const teilBBE = parsed.teil_b_be ?? null;
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && teilABE != null && teilBBE != null) {
      gesamtBE = teilABE + teilBBE;
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / 100) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teil_a_be: teilABE,
      teil_b_be: teilBBE,
      gesamt_be: gesamtBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      teil_a_be: null,
      teil_b_be: null,
      gesamt_be: null,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= MATHEMATIK ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturMathe(request, env) {
  const { teil_a_pflicht, teil_a_wahl, teil_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Mathematik-Oberstufenschüler am bayerischen Gymnasium (eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für die GESAMTE Abiturprüfung.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\cdot$ statt *, e-Funktion IMMER $e^{...}$ mit geschweiften Klammern (z.B. $e^{-x}$, $e^{-0{,}5x}$, NIEMALS $e^-x$ oder $\exp(...)$), $\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- Formatiere als Markdown mit klaren Überschriften:
  ## Teil A – Pflichtteil
  ### A1: Analysis
  ...
  ## Teil A – Wahlteil
  ...
  ## Teil B
  ### B1: Analysis
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "TEIL A – PFLICHTTEIL (20 BE):\n";
  if (teil_a_pflicht && teil_a_pflicht.length) {
    for (const a of teil_a_pflicht) {
      userContent += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }
  userContent += "\nTEIL A – WAHLTEIL (gewählte Aufgaben, 10 BE):\n";
  if (teil_a_wahl && teil_a_wahl.length) {
    for (const a of teil_a_wahl) {
      userContent += `${a.id} – ${a.sachgebiet} (${a.be} BE): ${truncate(a.text || "", 500)}\n`;
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }
  userContent += "\nTEIL B (70 BE):\n";
  if (teil_b && teil_b.length) {
    for (const b of teil_b) {
      userContent += `${b.id} – ${b.sachgebiet} (${b.be} BE): ${truncate(b.text || "", 500)}\n`;
      if (b.teilaufgaben) {
        for (const t of b.teilaufgaben) userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
      }
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= CHEMIE: GENERATE ================= */
async function handleGenerateChemie(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "elektrochemie";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    elektrochemie: {
      title: "Elektrochemie",
      inhalte: "C12 LB8: Redoxgleichgewichte, galvanische Zellen (Halbzellen, Leerlaufspannung, Optimierung), Standardwasserstoffhalbzelle, elektrochemische Spannungsreihe, Nernst-Gleichung (Konzentrationsabhängigkeit), Primärzellen (Zink-Luft, Brennstoffzelle), Entropie, Gibbs-Helmholtz-Gleichung, Elektrolyse. C13 LB5: Faraday-Gesetze, Zersetzungsspannung, Überpotential, Chlor-Alkali-Elektrolyse, Korrosion (Sauerstoff-/Säure-/Kontaktkorrosion), aktiver/passiver Korrosionsschutz, Sekundärzellen (Li-Ionen-Akku, Blei-Akku), Redox-Flow-Batterie, Elektromobilität"
    },
    gleichgewicht: {
      title: "Chemisches Gleichgewicht / Säure-Base",
      inhalte: "C12 LB7: Reversible Reaktion, dynamisches Gleichgewicht, Prinzip von Le Chatelier, Massenwirkungsgesetz (Kc), Löslichkeitsprodukt (KL), Haber-Bosch-Verfahren. C13 LB3: Säure-Base nach Brönsted, Autoprotolyse, Ionenprodukt des Wassers, pKs/pKb als Maß für Säure-/Basenstärke, pH-Berechnungen (starke/schwache Säuren/Basen, Näherungsformeln), Säure-Base-Titration (Titrationskurven, Äquivalenzpunkt, Halbtitration), Henderson-Hasselbalch-Gleichung, Puffersysteme (Acetat-, Carbonat-, Phosphat-Puffer), induktive/mesomere Effekte auf Säurestärke"
    },
    thermochemie: {
      title: "Thermochemie / Reaktionskinetik",
      inhalte: "C12 LB6: Reaktionsgeschwindigkeit (mittlere/momentane), Abhängigkeit von Konzentration, Temperatur (RGT-Regel), Druck, Zerteilungsgrad, Katalysator; Stoßtheorie (Maxwell-Boltzmann-Verteilung, Aktivierungsenergie), homogene/heterogene Katalyse. C12 LB5/LB8: Enthalpie, Standard-Reaktionsenthalpien, Satz von Hess, Kalorimetrie, Entropie (Verteilung von Energie/Teilchen), Gibbs-Helmholtz-Gleichung (ΔG = ΔH − TΔS), exergone/endergone Reaktionen"
    },
    organik: {
      title: "Organische Chemie",
      inhalte: "C12 LB5: Kohlenwasserstoffe (Alkane, Alkene, Aromaten), Erdöl/Erdgas/nachwachsende Rohstoffe, Reaktivität und Mechanismen: radikalische Substitution (Homolyse), elektrophile Addition (Heterolyse, SSS-/KKK-Regel), elektrophile aromatische Substitution, nukleophile Substitution; Benzol (Mesomerie, Delokalisierung), induktive/mesomere Effekte, Halogenkohlenwasserstoffe. C12 LB4: LCAO-Modell, Hybridisierung (sp³/sp²/sp), σ-/π-Bindungen, HOMO/LUMO"
    },
    kunststoffe: {
      title: "Kunststoffe",
      inhalte: "C13 LB4.2: Radikalische Polymerisation (Mechanismus: Start-/Kettenreaktion/Abbruch), Polykondensation (Polyester, Polyamid; bi-/trifunktionelle Monomere), Polyaddition (Polyurethan), Thermoplaste/Duroplaste/Elastomere (Struktur-Eigenschafts-Beziehungen), Copolymerisate, Silikone (anorganische Polymere, Nanotechnologie), elektrisch leitfähige Kunststoffe (konjugiertes π-System), OLED (Farbstoffe + leitende Polymere), Recycling (rohstofflich/werkstofflich/thermisch), biologisch abbaubare Kunststoffe"
    },
    spektroskopie: {
      title: "Analytik / Spektroskopie",
      inhalte: "C12 LB3: Qualitative Nachweisreaktionen (Ionen, funktionelle Gruppen: Fehling, Tollens, Schiff, Bromwasser), chromatographische Verfahren (DC, HPLC, GC; Rf-Wert, Retentionszeit), Redox-Titration (Manganometrie), komplexometrische Titration (EDTA, Wasserhärte), quantitative Fotometrie (Lambert-Beer-Gesetz, Kalibriergerade, Absorptionsmaximum)"
    },
    enzymkatalyse: {
      title: "Aminosäuren / Proteine / Enzymkatalyse",
      inhalte: "C13 LB4.1: 2-Aminocarbonsäuren (Ampholyt, Zwitter-Ion, isoelektrischer Punkt, Fischer-Projektion, Enantiomere), Peptidbindung (Kondensation, Mesomerie), Proteinstrukturen (Primär-/Sekundär-/Tertiär-/Quartärstruktur, Faserproteine/globuläre Proteine), Denaturierung (Hitze, pH, Schwermetalle), Enzyme: Substrat-/Wirkungsspezifität, Schlüssel-Schloss-Prinzip, Einflussfaktoren (Konzentration, Temperatur, pH), Nachweisreaktionen (Ninhydrin, Biuret, Xanthoprotein)"
    },
    farbstoffe: {
      title: "Farbigkeit und Farbstoffe",
      inhalte: "C13 LB2: Farbigkeit durch Lichtabsorption, Energiedifferenz HOMO/LUMO, konjugierte Doppelbindungen und Delokalisierung, Chromophor, auxochrome/antiauxochrome Gruppen, Absorptionsspektren; Azofarbstoffe (Diazotierung + Azokupplung), Triphenylmethanfarbstoffe (Kondensation); Farbstoff-Faser-Bindung (ionisch, Reaktivfarbstoffe, Direktfarbstoffe, Küpenfarbstoffe), Küpenfärbung mit Indigo, Funktionsprinzip von Indikatoren (Säure-Base, Redox)"
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.elektrochemie;

  const systemPrompt = `Du bist ein Chemie-Experte für das bayerische Abitur (gA/eA, G9, ab 2026).
Erstelle eine authentische Chemie-Aufgabe nach dem IQB-Aufgabenformat.

AUFGABE:
- Gesamt: ${totalBE} BE
- Bearbeitungszeit: ${zeitMinuten} Minuten
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im aufgabe-Feld
- Teilaufgaben nummerieren: "1a)", "1b)", ..., "2a)", "2b)", etc.
- Jede einzelne Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen ' + totalBE + ' BE ergeben.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (Tabelle ODER Diagramm)' : totalBE < 40 ? '1-2 Materialien' : '2-3 Materialien (Diagramme, Tabellen, Texte)'}
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

IQB-REFERENZFORMAT (orientiere dich an den IQB-Beispielaufgaben wie Taschenofen, Kaffeebecher, Adblue):
- Aufgabe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. Taschenofen, Kaffeebecher, Dieselabgase, Mineraldünger, PET-Recycling) — keine abstrakten Lehrbuchtexte
- 5-7 Teilaufgaben bei 30 BE, gemischte Aufgabentypen:
  • Berechnungen (Stöchiometrie, Thermochemie, Nernst, Faraday) mit konkreten Zahlenwerten
  • Erklärungen/Erläuterungen chemischer Phänomene
  • Reaktionsgleichungen aufstellen und erklären
  • Beurteilungen/Diskussionen (z.B. Umweltaspekte, Nachhaltigkeit)
- Materialien M1-M7: Texte, Tabellen mit Messdaten, Diagramme (Temperatur-Zeit, Energie), Schemata, Sicherheitshinweise
- AFB-Verteilung: ca. 30% AFB I, 50% AFB II, 20% AFB III
- Operatoren gezielt einsetzen:
  • AFB I: "Berechnen Sie", "Formulieren Sie", "Beschreiben Sie", "Skizzieren Sie" (4-6 BE)
  • AFB II: "Erläutern Sie", "Zeigen Sie", "Erstellen Sie ein Fließschema" (6-13 BE)
  • AFB III: "Beurteilen Sie", "Diskutieren Sie", "Vergleichen Sie kritisch" (4-6 BE)
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Die Aufgabe muss fachlich korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

CHEMIE-SPEZIFISCHE LATEX-REGELN (mhchem-Erweiterung \\ce{}):
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Phasenindikatoren: $\\ce{(aq)}$, $\\ce{(g)}$, $\\ce{(l)}$, $\\ce{(s)}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$, $\\text{kJ/mol}$
- Gleichgewichtskonstante: $K_c$, $K_p$, $K_s$, $K_w$, $K_a$, $K_b$
- pH-Berechnungen: $\\text{pH} = -\\lg c(\\ce{H3O+})$
- Nernst-Gleichung: $E = E^\\circ + \\frac{R \\cdot T}{z \\cdot F} \\cdot \\ln Q$

TEMPERATUR-NOTATION:
- RICHTIG: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$
- FALSCH: $^\\circ\\ce{C}$ (\\ce{C} wird als Kohlenstoff interpretiert!)
- FALSCH: $\\vartheta$ (nicht in KaTeX verfügbar) — verwende stattdessen $\\theta$ oder $T$

KEINE GeoGebra-Visualisierung — Chemie verwendet kein GeoGebra.

STRUKTURFORMELN:
Bei Organik- und Kunststoffe-Aufgaben MUSST du ein "strukturformeln"-Array mit 2–4 relevanten Molekülen angeben.
Bei anderen Sachgebieten (Elektrochemie, Gleichgewicht, Thermochemie etc.) kannst du es weglassen.
Format: [{"name": "ethanol", "caption": "Ethanol (Edukt)"}, {"name": "acetic acid", "caption": "Essigsäure"}]
- "name": englischer chemischer Name (IUPAC oder Trivialname) für PubChem-Lookup
- "caption": deutsche Beschriftung für die Anzeige
- KEIN SMILES, KEIN InChI — nur englische Namen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "Aufgabentext mit LaTeX-Formeln (Kontext/Einleitung)",
  "teilaufgaben": [
    {"id": "a)", "text": "Teilaufgabe mit $LaTeX$/$\\\\ce{}$-Formeln", "be": 3},
    {"id": "b)", "text": "...", "be": 4}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [{"id": "M1", "titel": "...", "type": "statistik", "chart_type": "bar", "text": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Wert1 | Wert2 |"}],
  "strukturformeln": [{"name": "ethanol", "caption": "Ethanol"}, {"name": "acetic acid", "caption": "Essigsäure"}]
}

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Zahlenwerten (mind. 4-6 Datenzeilen)
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte)
- "bild": "text" ist ein ausführlicher Imagen-Prompt auf ENGLISCH (3-5 Sätze), Beschriftungen auf DEUTSCH in ""
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
${totalBE >= 25 ? 'Pro Aufgabe: mindestens 1x statistik/diagramm + 1x text.' : totalBE >= 15 ? 'Maximal 1 Material pro Aufgabe.' : 'Keine Materialien bei dieser Aufgabengröße.'}
Hinweis: "strukturformeln" ist PFLICHT bei Organik/Kunststoffe, sonst optional.`;

  const organikHint = (sg === "organik" || sg === "kunststoffe" || sg === "farbstoffe") ? "\nWICHTIG: Gib unbedingt ein strukturformeln-Array mit 2–4 relevanten Molekülen an (englische Namen für PubChem)!" : "";
  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$), chemische Formeln mit $\\ce{}$.${organikHint}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= CHEMIE: GRADE ================= */
async function handleGradeChemie(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  // Build structured student solution text
  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    // Per-Teilaufgabe format
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Chemie-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, Reaktionsgleichungen, Mechanismen, quantitative Berechnungen, korrekte chemische Nomenklatur
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text-Chemie (z.B. H2O, NaOH + HCl -> NaCl + H2O) und LaTeX-Notation ($\\ce{H2O}$, $\\frac{1}{2}$). Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für chemische und mathematische Ausdrücke.
LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.
CHEMIE-REGELN: Verwende $\\ce{}$ für alle Reaktionsgleichungen und chemische Formeln.
TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$).

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung mit $LaTeX$/$\\\\ce{}$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$/$\\\\ce{}$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= CHEMIE: MODEL ANSWER ================= */
async function handleModelAnswerChemie(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Chemie-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung der Nernst-Gleichung")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\\cdot$ (NIEMALS $*$)
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

CHEMIE-SPEZIFISCHE LATEX-REGELN:
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$
- Gleichgewichtsreaktionen: $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$
- Temperatur: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$)`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= CHEMIE: PARSE TASK ================= */
async function handleParseTaskChemie(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Chemie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln, Reaktionsgleichungen, Strukturformeln und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$) und $\\ce{}$ für chemische Formeln und Reaktionsgleichungen (mhchem-Erweiterung). CHEMIE-REGELN: $\\ce{H2O}$ für Formeln, $\\ce{2H2 + O2 -> 2H2O}$ für Reaktionen, $\\ce{<=>}$ für Gleichgewichte. LATEX-REGELN: \\cdot statt *, \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= PHYSIK: GENERATE ================= */
async function handleGeneratePhysik(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "elektrostatik";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    elektrostatik: {
      title: "Elektrostatik & Magnetostatik",
      inhalte: "Ph12 LB1: Elektrische Feldlinien, homogenes Feld, Radialfeld, Dipolfeld. Definition der elektrischen Feldstärke über Kraft auf Probeladung. Coulombkraft, Feldstärke radialsymmetrisches Feld. Superposition von Feldern. Kapazität, Abhängigkeit der Kapazität eines Plattenkondensators von geometrischen Daten, Energieinhalt des E-Feldes. Materie im elektrischen Feld, Dielektrikum, Dielektrizitätszahl. Auf-/Entladevorgang RC-Glied. Potentielle Energie, Potential, Spannung als Potentialdifferenz, Zusammenhang U und E. Geladene Teilchen in homogenen elektrischen Längs-/Querfeldern. Relativistischer Impuls, relativistische Energie, Energie-Impuls-Beziehung. Definition magnetische Flussdichte, B-Feld einer langgestreckten Spule, Energieinhalt des B-Feldes. Lorentzkraft, Kreisbahnen geladener Teilchen in homogenen Magnetfeldern. Hall-Effekt, Massenspektrometer, Geschwindigkeitsfilter, Teilchenbeschleuniger."
    },
    induktion: {
      title: "EM-Induktion & Schwingungen",
      inhalte: "Ph12 LB2: Magnetischer Fluss, Induktionsgesetz, Erzeugung sinusförmiger Wechselspannung. Selbstinduktion: Ein-/Ausschaltvorgang bei Spule, Induktivität, Energieinhalt des B-Feldes. Schaltvorgänge in RL-Glied, Zeitkonstante. Technische Anwendungen der Induktion. Differentialgleichung der EM-Schwingung in LC-Kreis, Thomson-Gleichung, periodischer Energieaustausch Spule-Kondensator, Analogie mechanische/EM-Schwingung. Gedämpfte mechanische und EM-Schwingungen, Abklingverhalten. Resonanzphänomene bei mechanischen und EM-Schwingungen. Zeigerdiagramme. Spule und Kondensator in Wechselstromkreisen, Wechselstromwiderstand, Frequenzfilter."
    },
    emwellen: {
      title: "Elektromagnetische Wellen",
      inhalte: "Ph12 LB3: Ladung und Stromstärke bei Grundschwingung eines EM-Dipols, E- und B-Feld im Nahbereich. Maxwellgleichungen, Ausbreitung EM-Wellen. Struktur des EM-Wechselfeldes im Fernbereich, Eigenschaften: Ausbreitungsgeschwindigkeit, Polarisation, Brechung, Beugung, Reflexion. Mathematische Beschreibung einer eindimensionalen Welle. Superposition von Wellen, Interferenz am Doppelspalt, Intensität einer EM-Welle, konstruktive/destruktive Interferenz, Kohärenz, stehende Welle. Mehrfachspalt und optisches Gitter. Wellenlängenbestimmung bei mono-/polychromatischem Licht. Einfachspalt. Bragg-Reflexion, Bragg-Bedingung. Aufbau Röntgenröhre, Röntgenbremsspektrum. Elektromagnetisches Spektrum."
    },
    quantenphysik: {
      title: "Quantenphysik",
      inhalte: "Ph13 LB1: Elektronenbeugungsröhre, Hypothesen zur Interpretation. Simulation Doppelspaltexperiment: wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Elektron, Interpretation durch Wellenfunktion. De-Broglie-Beziehung für Elektron. Wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Photon. Energie und Impuls des Photons. Äußerer Photoeffekt, Bestimmung des Planck'schen Wirkungsquantums. Grenzfrequenz Röntgenbremsspektrum. Wellenfunktion: Betragsquadrat als Nachweiswahrscheinlichkeit, Superposition, Determiniertheit. Komplementarität. Quantenphysikalischer Messprozess, Kausalität, Realität, Nicht-Lokalität. Heisenberg'sche Unbestimmtheitsrelation."
    },
    atommodell: {
      title: "Atommodell der Quantenphysik",
      inhalte: "Ph13 LB2: Eindimensionaler Potentialtopf mit unendlich hohen Wänden: stehende Wellen, diskrete Energiewerte, Wellenfunktionen und Nachweiswahrscheinlichkeiten. Wellenfunktionen für weitere Potentiale: Potentialtopf mit endlich hohen Wänden, Coulomb-Potential, Tunneleffekt. Darstellung von Aufenthaltswahrscheinlichkeiten durch Orbitale, Struktur der Orbitale des Wasserstoffatoms, Quantenzahlen, Energiewerte für Wasserstoff. Emission und Absorption von Licht atomarer Gase, Energieniveauschema der Atomhülle, charakteristisches Röntgenspektrum. Energieübertrag durch Stoßanregung, Franck-Hertz-Versuch. Bestimmung der Rydberg-Konstante."
    },
    kernphysik: {
      title: "Kernphysik",
      inhalte: "Ph13 LB4: Massendefekt und mittlere Bindungsenergie je Nukleon in Abhängigkeit von Nukleonenzahl. Potentialtopfmodell des Kerns, Pauli-Prinzip. Entstehung von α-, β⁻-, β⁺- und γ-Strahlung, Tunneleffekt beim α-Zerfall, β-Zerfälle im Standardmodell, Stabilität von Atomkernen. Energiebilanzen bei Zerfällen und Kernreaktionen, Energiespektren. Ionisierende Wirkung und Nachweis von α-, β-, γ-Strahlung. Aktivität, Zerfallsgesetz, Halbwertszeit. C14-Methode zur Altersbestimmung. Strahlenbelastung, Energiedosis, Äquivalentdosis, Strahlenschutz. Kernspaltung, Kettenreaktion, prinzipieller Aufbau Kernreaktor, Chancen und Risiken. Kernfusion. Ph13 LB3: Standardmodell, Quarks, Teilchenfamilien, fundamentale Wechselwirkungen und Austauschteilchen, Erhaltung der Leptonen-/Baryonenzahl."
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.elektrostatik;

  const systemPrompt = `Du bist ein Physik-Experte für das bayerische Abitur (gA/eA, G9, ab 2026).
Erstelle eine authentische Physik-Aufgabe.

AUFGABE:
- Gesamt: ${totalBE} BE
- Bearbeitungszeit: ${zeitMinuten} Minuten
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im aufgabe-Feld
- Teilaufgaben nummerieren: "1a)", "1b)", ..., "2a)", "2b)", etc.
- Jede einzelne Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen ' + totalBE + ' BE ergeben.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (Tabelle ODER Diagramm)' : totalBE < 40 ? '1-2 Materialien' : '2-3 Materialien (Diagramme, Tabellen, Texte)'}
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Die Aufgabe muss fachlich korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$, $\\text{J}$
- Physikalische Konstanten: $h = 6{,}626 \\cdot 10^{-34}\\,\\text{J}\\cdot\\text{s}$, $e = 1{,}602 \\cdot 10^{-19}\\,\\text{C}$
- Kreuzprodukt: $\\vec{F} = q \\cdot \\vec{v} \\times \\vec{B}$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Energie: $E = h \\cdot f$, $E_{\\text{kin}} = \\frac{1}{2}mv^2$, $E = mc^2$
- De Broglie: $\\lambda = \\frac{h}{p}$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$

KEINE GeoGebra-Visualisierung.
KEINE Strukturformeln oder \\ce{}-Notation (das ist Chemie, nicht Physik).

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "Aufgabentext mit LaTeX-Formeln (Kontext/Einleitung)",
  "teilaufgaben": [
    {"id": "a)", "text": "Teilaufgabe mit $LaTeX$-Formeln", "be": 3},
    {"id": "b)", "text": "...", "be": 4}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [{"id": "M1", "titel": "...", "type": "diagramm", "chart_type": "line", "text": "| t in s | U in V |\\n|---|---|\\n| 0 | 0 |\\n| 1 | 3.2 |"}]
}

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Messwerten (mind. 4-6 Datenzeilen)
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte, z.B. t/U, t/I, λ/Intensität)
- "bild": "text" ist ein ausführlicher Imagen-Prompt auf ENGLISCH (3-5 Sätze), Beschriftungen auf DEUTSCH in ""
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
${totalBE >= 25 ? 'Pro Aufgabe: mindestens 1x statistik/diagramm + 1x text.' : totalBE >= 15 ? 'Maximal 1 Material pro Aufgabe.' : 'Keine Materialien bei dieser Aufgabengröße.'}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= PHYSIK: GRADE ================= */
async function handleGradePhysik(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Physik-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, physikalische Gesetze, Herleitungen, quantitative Berechnungen, Einheiten, Diagramme
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text und LaTeX-Notation. Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für physikalische und mathematische Ausdrücke.
LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.
PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten korrekt angeben.

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung mit $LaTeX$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= PHYSIK: MODEL ANSWER ================= */
async function handleModelAnswerPhysik(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Physik-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung des Induktionsgesetzes")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\\cdot$ (NIEMALS $*$)
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$
- Konstanten: $h$, $e$, $c$, $\\varepsilon_0$, $\\mu_0$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$, $T_{1/2} = \\frac{\\ln 2}{\\lambda}$`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= PHYSIK: PARSE TASK ================= */
async function handleParseTaskPhysik(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Physik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln, Diagramme, Tabellen und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$). PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten korrekt. LATEX-REGELN: \\cdot statt *, \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATERIAL-PLATZHALTER REPARATUR ================= */
const PLACEHOLDER_PATTERNS = [
  /^ein\s+(text|fachtext|auszug|artikel|bericht)/i,
  /^(hier\s+(ist|steht|folgt)|im\s+folgenden)/i,
  /^\(.*?(text|inhalt|platzhalter|einfügen|ergänzen).*?\)$/i,
  /^beschreib(e|ung)/i,
  /^erstell(e|ung)/i,
  /^\[.*?\]$/,
  /^<.*?>$/
];

function isMaterialPlaceholder(material) {
  if (!material || !material.text) return true;
  const text = material.text.trim();
  // Zu kurz für echten Inhalt (Tabellen dürfen kürzer sein)
  const minLen = (material.type === "statistik" || material.type === "diagramm") ? 30 : 80;
  if (text.length < minLen) return true;
  // Bekannte Platzhalter-Muster
  for (const pat of PLACEHOLDER_PATTERNS) {
    if (pat.test(text)) return true;
  }
  return false;
}

async function repairPlaceholderMaterials(env, materials, sachgebietTitle) {
  const toRepair = materials.filter(m => isMaterialPlaceholder(m));
  if (!toRepair.length) return materials;

  console.warn(`[repairMaterials] ${toRepair.length}/${materials.length} Materialien sind Platzhalter, generiere nach...`);

  // Alle Platzhalter parallel nachgenerieren
  const repairs = await Promise.allSettled(toRepair.map(async (m) => {
    const typeInstr = {
      text: `Schreibe einen vollständigen, ausformulierten Fachtext (mind. 150 Wörter) für Biologie-Oberstufenschüler. Der Text soll als Material in einer Klausuraufgabe dienen. Thema: "${m.titel || "Fachtext"}". Sachgebiet: ${sachgebietTitle}. Gib NUR den reinen Fachtext aus, keine Überschrift, kein JSON.`,
      statistik: `Erstelle eine vollständige Markdown-Tabelle mit echten, realistischen Zahlenwerten (mind. 4 Datenzeilen) zum Thema "${m.titel || "Daten"}". Sachgebiet: ${sachgebietTitle}. Gib NUR die Markdown-Tabelle aus.`,
      diagramm: `Erstelle eine vollständige Markdown-Tabelle mit echten, realistischen x/y-Messwerten (mind. 6 Datenpunkte) zum Thema "${m.titel || "Messwerte"}". Sachgebiet: ${sachgebietTitle}. Gib NUR die Markdown-Tabelle aus.`,
      bild: `Schreibe einen ausführlichen Imagen-Prompt auf Englisch (3-5 Sätze) für eine biologische Abbildung zum Thema "${m.titel || "Abbildung"}". Beschriftungen auf Deutsch. Gib NUR den Prompt aus.`
    };
    const prompt = typeInstr[m.type] || typeInstr.text;
    try {
      const result = await callOpenAI(env, [
        { role: "user", content: prompt }
      ], 3000, { model: "gpt-5.2", temperature: 0.5 });
      return { id: m.id, text: result.trim() };
    } catch (e) {
      console.error(`[repairMaterials] Fehler bei ${m.id}:`, e.message);
      return null;
    }
  }));

  // Reparierte Texte einsetzen
  const repairMap = {};
  for (const r of repairs) {
    if (r.status === "fulfilled" && r.value && r.value.text) {
      repairMap[r.value.id] = r.value.text;
    }
  }

  return materials.map(m => {
    if (repairMap[m.id]) {
      return { ...m, text: repairMap[m.id] };
    }
    return m;
  });
}

/* ================= BIO: GENERATE ================= */
async function handleGenerateBio(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "genetik";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    genetik: {
      title: "Genetik & Gentechnik",
      inhalte: "Genetik & Gentechnik — DNA-Bau, genetischer Code, Proteinbiosynthese (Transkription, Prozessierung, Translation), Genwirkketten, Regulation der Genaktivität (Transkriptionsfaktoren, Enhancer, Silencer), Epigenetik (DNA-Methylierung, X-Inaktivierung), Stammzellen, DNA-Replikation, PCR, Zellzyklus, Meiose, Neukombination, Genommutationen (Trisomie 21), Genmutationen, CRISPR/Cas, Gentechnik-Anwendungen, Mendelsche Regeln (mono-/dihybrid), Erbgänge (autosomal dominant/rezessiv, X-chromosomal), Stammbaumanalyse, Gelelektrophorese, genetischer Fingerabdruck"
    },
    neurobiologie: {
      title: "Neurobiologie",
      inhalte: "Neurobiologie — Bau der Nervenzelle, Biomembran (Flüssig-Mosaik-Modell), Ruhepotential (Ionenverteilung, Na⁺/K⁺-ATPase), Aktionspotential (Ionenkanäle, Refraktärphasen, Alles-oder-Nichts), Erregungsleitung (myelinisiert/nicht-myelinisiert, saltatorisch/kontinuierlich), erregende chemische Synapse, Stoffeinwirkung an Synapsen, Depression (Monoamin-Hypothese, Vulnerabilitäts-Stress-Modell, SSRI)"
    },
    stoffwechsel: {
      title: "Stoffwechselphysiologie",
      inhalte: "Stoffwechselphysiologie — Photosynthese (Gesamtgleichung, Abhängigkeit von abiotischen Faktoren, Absorptions-/Wirkungsspektrum, Chromatographie, Angepasstheiten, lichtabhängige Reaktionen, Calvin-Zyklus), Enzyme (Regulation, kompetitive/nicht-kompetitive Hemmung), Zellatmung (Glykolyse, oxidative Decarboxylierung, Tricarbonsäurezyklus, Atmungskette, Chemiosmose), Gärung (Milchsäure-, alkoholische Gärung), Vergleich Photosynthese/Zellatmung"
    },
    oekologie: {
      title: "Ökologie & Biodiversität",
      inhalte: "Ökologie & Biodiversität — abiotische/biotische Faktoren, Toleranzkurven, ökologische Potenz, Nahrungsnetz, Kohlenstoffkreislauf, Energiefluss, intra-/interspezifische Konkurrenz, Symbiose, Prädation, ökologische Nische, Populationsdynamik (exponentielles/logistisches Wachstum, Umweltkapazität), Ökosystemleistungen, Biodiversität, Nachhaltigkeit, anthropogener Treibhauseffekt"
    },
    evolution: {
      title: "Evolution",
      inhalte: "Evolution — molekularbiologische Homologien, Stammbaum/Kladogramm, synthetische Evolutionstheorie (Mutation, Rekombination, Selektion, Alleldrift), Selektionsformen (stabilisierend, transformierend, disruptiv), Artbildung (geographische/ökologische Isolation), Koevolution, Darwin vs. Lamarck"
    },
    verhalten: {
      title: "Verhaltensökologie",
      inhalte: "Verhaltensökologie — adaptiver Wert von Verhalten, direkte/indirekte Fitness, Kosten-Nutzen-Analyse, Optimalitätsmodell, Kooperation, Altruismus, Kommunikation (Sender-Empfänger), Aggression (Drohen, Kommentkampf), Fortpflanzung (Handicap-Prinzip, Paarungssysteme), Elternaufwand"
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.genetik;

  const systemPrompt = `Du bist Biologielehrer am bayerischen Gymnasium. Erstelle eine Biologie-Klausuraufgabe im IQB-Format (Abitur gA/eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, ALLTAGSNAHEN Kontext ein (z.B. ein bestimmter Organismus, ein Experiment, ein aktuelles Forschungsergebnis)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau: AFB I (Nennen/Beschreiben) → AFB II (Erläutern/Vergleichen) → AFB III (Bewerten/Diskutieren)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- KEINE Lösungshinweise in den Aufgabenstellungen
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG: LaTeX $...$ für Formeln ($Aa$, $\\frac{1}{4}$). Summenformeln als Text: CO₂, ATP.

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter), KEIN Platzhalter
- "bild" → "text" = ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze), Beschriftungen auf Deutsch

KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Organismus/Experiment>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild>", "text": "<ECHTER Inhalt>"}
  ]
}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).`;

  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 12000, { model: "gpt-5.2", temperature: 0.7 });
  } catch (e) {
    const detail = (e.name === "AbortError") ? "Zeitüberschreitung (>25s)" : (e.message || "unbekannt");
    console.error("generate-bio error:", detail);
    return jsonResponse({ error: "Bio-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-bio JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, sgInfo.title);
  }

  return jsonResponse(content, 200, env);
}

/* ================= BIO: GRADE ================= */
async function handleGradeBio(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Biologie-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, wissenschaftliche Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung biologischer Zusammenhänge
- Korrekte Fachsprache (z.B. "homozygot" statt "reinerbig") wird positiv bewertet
- Korrekte Anwendung biologischer Konzepte und Modelle
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text und LaTeX-Notation. Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für biologische Formeln und Notation.
LATEX-REGELN: Brüche $\\frac{a}{b}$, Dezimalkomma $3{,}6$ statt $3.6$.
BIOLOGIE-REGELN: Genotypen $Aa$, Phänotypenverhältnisse $3:1$, Fachbegriffe korrekt verwenden.

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung mit $LaTeX$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { model: "gpt-5.2", temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= BIO: MODEL ANSWER ================= */
async function handleModelAnswerBio(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Biologie-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für Formeln und biologische Notation: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung der Mendelschen Regeln")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG:
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

BIOLOGIE-SPEZIFISCHE REGELN:
- Genotypen: $Aa$, $BB$, $X^a X^A$
- Kreuzungsschemata klar darstellen
- Phänotypenverhältnisse: $3:1$, $9:3:3:1$
- Fachbegriffe korrekt verwenden (homozygot, heterozygot, Allel, dominant, rezessiv)
- Chemische Summenformeln: CO₂, H₂O, ATP, NADPH, O₂
- Biologische Prozesse Schritt für Schritt erklären (z.B. Transkription, Translation)
- Ökologische Modelle und Kurven beschreiben`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { model: "gpt-5.2", temperature: 0.4 });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= BIO: PARSE TASK ================= */
async function handleParseTaskBio(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Biologie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme, Tabellen, Stammbäume und Teilaufgaben. Verwende LaTeX-Notation für Formeln und biologische Notation ($...$, $$...$$). BIOLOGIE-REGELN: Genotypen $Aa$, Phänotypenverhältnisse $3:1$, Fachbegriffe korrekt. LATEX-REGELN: \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= SPORT: GENERATE ================= */
async function handleGenerateSport(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "gesundheit";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    gesundheit: {
      title: "Gesundheit & Fitness",
      inhalte: "Gesundheit & Fitness — Gesundheitsmodelle (Salutogenese, biopsychosoziales Modell, Risikofaktorenmodell), gesundheitsorientiertes Training (Ausdauer, Kraft, Beweglichkeit, Koordination), Fitness-Konzepte, Belastungsnormative (Intensität, Dauer, Umfang, Dichte, Häufigkeit), Sportverletzungen (Prävention, PECH-Regel), Ernährung im Sport (Energiebilanz, Makronährstoffe, Sporternährung vor/während/nach Belastung)"
    },
    trainingslehre: {
      title: "Trainingslehre",
      inhalte: "Trainingslehre — Trainingsprinzipien (Belastung-Erholung, progressive Belastungssteigerung, Variation, Individualisierung, Periodisierung), Superkompensation, Reizstufenregel, Trainingsplanung (Makro-/Meso-/Mikrozyklus), Trainingsmethoden für Kraft (IK-Training, Hypertrophie, Kraftausdauer), Ausdauer (Dauermethode, Intervallmethode, Wiederholungsmethode), Schnelligkeit (Reaktions-, Aktions-, Frequenzschnelligkeit), Beweglichkeit (statisch, dynamisch), Leistungsdiagnostik und Trainingssteuerung"
    },
    sportbiologie: {
      title: "Sportbiologie",
      inhalte: "Sportbiologie — Bewegungsapparat (Knochen, Gelenke, Wirbelsäule, aktiver und passiver Bewegungsapparat), Skelettmuskulatur (Aufbau, Muskelfasertypen ST/FT, Kontraktionsformen: konzentrisch, exzentrisch, isometrisch), Energiebereitstellung (anaerob-alaktazid/ATP-CP, anaerob-laktazid/Glykolyse, aerob/oxidative Phosphorylierung), Herz-Kreislauf-System (Herzfrequenz, Schlagvolumen, Herzzeitvolumen, Blutdruck), Atmungssystem (Ventilation, Gasaustausch, VO₂max), Adaptation des Körpers an Training"
    },
    bewegungslehre: {
      title: "Bewegungslehre",
      inhalte: "Bewegungslehre — Biomechanische Prinzipien (Prinzip der Anfangskraft, der optimalen Beschleunigungswege, der Impulserhaltung, der Gegenwirkung, der zeitlichen Koordination von Teilimpulsen), Körperschwerpunkt und Körperachsen (Breitenachse, Längsachse, Tiefenachse), Bewegungsanalyse (Phasenmodell nach Meinel/Schnabel: Vorbereitungs-, Haupt-, Endphase), motorisches Lernen (Dreiphasenmodell: Grobkoordination, Feinkoordination, variable Verfügbarkeit), koordinative Fähigkeiten (Gleichgewicht, Orientierung, Differenzierung, Reaktion, Rhythmus, Kopplung, Umstellung), Technik- und Taktiktraining"
    },
    sportpsychologie: {
      title: "Sportpsychologie",
      inhalte: "Sportpsychologie — Motivation (intrinsisch/extrinsisch, Leistungsmotivation, Risikowahl-Modell nach Atkinson), Sinnperspektiven des Sports (Leistung, Gesundheit, Spannung, Ästhetik, Gemeinschaft), Emotion im Sport (Angst, Flow-Erleben, Yerkes-Dodson-Gesetz/Aktivierungsniveau), Aggression (Instinkttheorie, Frustrations-Aggressions-Hypothese, Lerntheorien), mentales Training (Visualisierung, Selbstgespräche, Zielsetzung), Konzentration und Aufmerksamkeit, Stressmanagement und Entspannungsverfahren"
    },
    sportgesellschaft: {
      title: "Sport & Gesellschaft",
      inhalte: "Sport & Gesellschaft — Sport und Medien (Medialisierung, Sportberichterstattung, Inszenierung), Kommerzialisierung des Sports (Sponsoring, Vermarktung, Professionalisierung), Doping (Substanzen: anabole Steroide, EPO, Stimulanzien; Methoden: Blutdoping, Gendoping; gesundheitliche Risiken; ethische Bewertung; Anti-Doping-Kampf/WADA/NADA), Fairness und Fair Play (regelkonformes Verhalten, sportliche Integrität), Inklusion und Integration im Sport, Sport und Bildung, Sport und Umwelt, historische Entwicklung des Sports"
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.gesundheit;

  const systemPrompt = `Du bist Sportlehrer am bayerischen Gymnasium (Leistungsfach Sport). Erstelle eine Sporttheorie-Klausuraufgabe im IQB-Format (Abitur eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, PRAXISNAHEN Kontext ein (z.B. ein bestimmter Sportler, ein Trainingsplan, eine Wettkampfsituation, ein Gesundheitsproblem)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau: AFB I (Nennen/Beschreiben) → AFB II (Erläutern/Vergleichen/Analysieren) → AFB III (Bewerten/Diskutieren/Beurteilen)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- KEINE Lösungshinweise in den Aufgabenstellungen
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG: Fachbegriffe klar verwenden. Einheiten korrekt angeben (z.B. Herzfrequenz in min⁻¹, VO₂max in ml/min/kg, Kraft in N).

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter), KEIN Platzhalter
- "bild" → "text" = ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze), Beschriftungen auf Deutsch

KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Sportler/Situation>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild>", "text": "<ECHTER Inhalt>"}
  ]
}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.`;

  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 8000, { model: "gpt-5.2", temperature: 0.7 });
  } catch (e) {
    const detail = (e.name === "AbortError") ? "Zeitüberschreitung (>25s)" : (e.message || "unbekannt");
    console.error("generate-sport error:", detail);
    return jsonResponse({ error: "Sport-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-sport JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  return jsonResponse(content, 200, env);
}

/* ================= SPORT: GRADE ================= */
async function handleGradeSport(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Sporttheorie-Klausur (Bayern, Leistungsfach Sport eA, Abitur ab 2026) nach dem BE-System.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, sportwissenschaftliche Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung sporttheoretischer Zusammenhänge
- Korrekte Fachsprache (z.B. "Superkompensation", "anaerobe Schwelle", "biomechanisches Prinzip") wird positiv bewertet
- Korrekte Anwendung sportwissenschaftlicher Konzepte und Modelle
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { model: "gpt-5.2", temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= SPORT: MODEL ANSWER ================= */
async function handleModelAnswerSport(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Sport-Oberstufenschüler am bayerischen Gymnasium (Leistungsfach Sport, eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende korrekte sportwissenschaftliche Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "nach dem Prinzip der progressiven Belastungssteigerung")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

SPORT-SPEZIFISCHE REGELN:
- Fachbegriffe korrekt verwenden (Superkompensation, anaerobe Schwelle, Biomechanik, Salutogenese etc.)
- Trainingsmethoden und -prinzipien korrekt benennen und erklären
- Sportwissenschaftliche Modelle richtig darstellen
- Einheiten korrekt verwenden (HF in min⁻¹, VO₂max in ml/min/kg)`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { model: "gpt-5.2", temperature: 0.4 });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= SPORT: PARSE TASK ================= */
async function handleParseTaskSport(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Sporttheorie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme, Tabellen und Teilaufgaben. Verwende korrekte sportwissenschaftliche Fachbegriffe. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= INFORMATIK: GENERATE ================= */
async function handleGenerateInformatik(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "rekursion-listen";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  // LehrplanPLUS Informatik G9 gA – verifiziert anhand LIS_PDF_28-02-2026-10/11
  const sgThemen = {
    "rekursion-listen": {
      title: "Rekursion & Listen",
      inhalte: "Rekursion & Listen (LB 1+2, Jgst. 12) — Rekursion (lineare Rekursion, verzweigte Rekursion, Tiefensuche, rekursive Problemlösung, Rekursion vs. Iteration), einfach verkettete Liste (Einfügen, Löschen, Suchen, Durchlaufen), Stapel/Stack (LIFO-Prinzip, Push/Pop), Warteschlange/Queue (FIFO-Prinzip, Enqueue/Dequeue), Kompositum-Entwurfsmuster (Knoten/Blatt-Struktur), Generalisierung/Spezialisierung bei Datenstrukturen. Programmiersprache: Java oder Python."
    },
    baeume: {
      title: "Binärbäume",
      inhalte: "Binärbäume (LB 3, Jgst. 12) — Geordneter Binärbaum (Suchbaum-Eigenschaft), Einfügen in geordneten Binärbaum, Suchen im Binärbaum, Löschen aus Binärbaum, Traversierung (Preorder, Inorder, Postorder), Anwendungen (z.B. Sortieren durch Inorder-Traversierung), rekursive Baumoperationen, Blatt/innerer Knoten/Wurzel, Tiefe und Höhe eines Baumes. Programmiersprache: Java oder Python."
    },
    nebenlaeufigkeit: {
      title: "Nebenläufige Prozesse",
      inhalte: "Nebenläufige Prozesse (LB 4, Jgst. 12) — Nebenläufigkeit (Threads, parallele Ausführung), Synchronisation (kritischer Abschnitt, wechselseitiger Ausschluss), Deadlock (Verklemmung, zirkuläres Warten), Coffman-Bedingungen (mutual exclusion, hold and wait, no preemption, circular wait), Monitorkonzept (synchronized, wait/notify), Erzeuger-Verbraucher-Problem, Semaphore (grundlegend), Zustandsdiagramme nebenläufiger Prozesse."
    },
    automaten: {
      title: "Formale Sprachen & Automaten",
      inhalte: "Formale Sprachen & Automaten (LB 1, Jgst. 13) — Formale Sprache (Alphabet, Wort, Sprache), EBNF (Erweiterte Backus-Naur-Form, Produktionsregeln), Syntaxdiagramme (grafische Darstellung von EBNF), deterministischer endlicher Automat DEA (Zustände, Übergänge, Startzustand, Endzustände, Zustandsdiagramm, Übergangstabelle), nichtdeterministischer endlicher Automat NEA, Äquivalenz DEA/NEA (Potenzmengenkonstruktion), reguläre Sprachen, Scanner/Parser-Prinzip."
    },
    rechner: {
      title: "Rechnerarchitektur",
      inhalte: "Funktionsweise eines Rechners (LB 2, Jgst. 13) — Von-Neumann-Architektur (Steuerwerk, Rechenwerk/ALU, Speicher, Ein-/Ausgabe, Bus), Registermaschine (Akkumulator, Befehlszähler, Befehlsregister), Assemblersprache (LOAD, STORE, ADD, SUB, MUL, DIV, JMP, JEQ, JGT, HALT), Befehlszyklus (Fetch-Decode-Execute), Darstellung von Zahlen im Rechner, Maschinenprogramm erstellen und nachvollziehen."
    },
    berechenbarkeit: {
      title: "Grenzen der Berechenbarkeit",
      inhalte: "Grenzen der Berechenbarkeit (LB 3, Jgst. 13) — Laufzeitaufwand von Algorithmen (linear O(n), quadratisch O(n²), exponentiell O(2^n), logarithmisch O(log n)), O-Notation (Best-/Worst-/Average-Case), Brute-Force-Algorithmen (vollständige Suche), praktisch unlösbare Probleme (z.B. Traveling Salesman), Halteproblem (Beweis der Unentscheidbarkeit, Diagonalisierungsargument), Berechenbarkeit vs. praktische Lösbarkeit."
    },
    ki: {
      title: "Künstliche Intelligenz",
      inhalte: "Künstliche Intelligenz (LB 4, Jgst. 13) — Neuronale Netze (Neuron/Perzeptron, Gewichte, Bias, Aktivierungsfunktion, Schichten: Eingabe-/versteckte/Ausgabeschicht), Forward Propagation (Vorwärtsberechnung), Backpropagation (Fehlerrückführung, Gradientenabstieg, Lernrate), k-Means-Algorithmus (Clustering, Zentroide, iterative Zuordnung), überwachtes Lernen (supervised: Klassifikation, Regression), unüberwachtes Lernen (unsupervised: Clustering), bestärkendes Lernen (reinforcement: Belohnung/Bestrafung), ethische Aspekte von KI."
    },
    sicherheit: {
      title: "Informationssicherheit",
      inhalte: "Informationssicherheit (LB 5, Jgst. 12) — Schutzziele (Vertraulichkeit, Integrität, Verfügbarkeit, Authentizität), Gefährdungen (Social Engineering, Malware, Phishing, Man-in-the-Middle), technische Maßnahmen (Verschlüsselung, Firewall, Backup), organisatorische Maßnahmen (Passwortrichtlinien, Zugriffsrechte, Schulung), symmetrische vs. asymmetrische Verschlüsselung (Grundprinzip), Hashfunktionen (Einweg-Eigenschaft), digitale Signatur (Grundprinzip)."
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen["rekursion-listen"];

  const systemPrompt = `Du bist Informatiklehrer am bayerischen Gymnasium. Erstelle eine Informatik-Klausuraufgabe im IQB-Format (Abitur gA/eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, ALLTAGSNAHEN Kontext ein (z.B. ein Softwareprojekt, eine Anwendung, ein konkretes System)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau: AFB I (Nennen/Beschreiben) → AFB II (Erläutern/Vergleichen/Analysieren) → AFB III (Bewerten/Diskutieren/Entwerfen)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- KEINE Lösungshinweise in den Aufgabenstellungen
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben
- Bei Algorithmen/Datenstrukturen: Java- oder Python-Code bzw. Pseudocode ist erlaubt
- Bei Automaten: Zustandsdiagramme, Übergangstabellen, EBNF-Regeln oder Syntaxdiagramme können verlangt werden
- Bei Rechnerarchitektur: Assembler-Programme für die Registermaschine können verlangt werden
- Bei KI: Berechnungen zu Neuronalen Netzen (Forward Propagation) oder k-Means können verlangt werden

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG: Fachbegriffe klar verwenden. Code in Markdown-Codeblöcken. Pseudocode klar strukturiert.

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter) oder Code-Listing, KEIN Platzhalter
- "bild" → "text" = ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze), Beschriftungen auf Deutsch
- Erstelle IMMER mindestens 1 Material vom Typ "bild" (z.B. Architekturdiagramm, Netzwerkdiagramm, Flussdiagramm, UML-Klassendiagramm, Zustandsdiagramm, ER-Diagramm, Schaubild o.Ä.)
  REGELN für "bild": (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein, in Anführungszeichen angeben und Positionsangabe machen (2) Layout, Farben und visuelle Elemente detailliert beschreiben (3) KEINE Personen!
  VERBOTEN: Diagramme/Bilder als Textbeschreibung oder ASCII-Art einfügen — IMMER type "bild" mit englischem Imagen-Prompt verwenden!

KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Projekt/System>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild>", "text": "<ECHTER Inhalt>"},
    {"id": "M2", "titel": "Schaubild: ...", "type": "bild", "text": "<Englischer Imagen-Prompt, Beschriftungen auf Deutsch>"}
  ]
}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.`;

  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 8000, { model: "gpt-5.2", temperature: 0.7 });
  } catch (e) {
    const detail = (e.name === "AbortError") ? "Zeitüberschreitung (>25s)" : (e.message || "unbekannt");
    console.error("generate-informatik error:", detail);
    return jsonResponse({ error: "Informatik-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-informatik JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  return jsonResponse(content, 200, env);
}

/* ================= INFORMATIK: GRADE ================= */
async function handleGradeInformatik(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Informatik-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, informatische Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung informatischer Zusammenhänge
- Korrekte Fachsprache (z.B. "Laufzeitkomplexität O(n log n)", "Kompositum-Entwurfsmuster", "Coffman-Bedingungen", "DEA", "Von-Neumann-Architektur", "Backpropagation") wird positiv bewertet
- Bei Code/Pseudocode: Korrektheit des Algorithmus, Effizienz, Lesbarkeit (Java oder Python)
- Bei Automaten: Korrekte Zustandsdiagramme, Übergangstabellen, EBNF-Regeln
- Bei Registermaschine: Korrekte Assembler-Programme, Befehlszyklus-Nachvollziehung
- Bei KI: Korrekte Berechnungen (Forward Propagation, k-Means-Schritte)
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `${aufgabenInfo}\n${studentSolutionText}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { model: "gpt-5.2", temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= INFORMATIK: MODEL ANSWER ================= */
async function handleModelAnswerInformatik(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Informatik-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende korrekte informatische Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung des Divide-and-Conquer-Prinzips")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

INFORMATIK-SPEZIFISCHE REGELN:
- Code/Pseudocode in Markdown-Codeblöcken (\`\`\`java oder \`\`\`python)
- Automaten-Definitionen als strukturierte Textdarstellung (Zustandsdiagramm, Übergangstabelle)
- EBNF-Regeln und Syntaxdiagramme klar formatiert
- Assembler-Programme für Registermaschine in Codeblöcken
- O-Notation korrekt verwenden: O(n), O(n²), O(log n), O(2^n)
- Fachbegriffe korrekt verwenden (Kompositum, Stapel/LIFO, Warteschlange/FIFO, Deadlock, Coffman-Bedingungen, DEA/NEA, Von-Neumann, Backpropagation, Halteproblem etc.)
- Algorithmen Schritt für Schritt erklären und Trace/Durchlauf zeigen`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { model: "gpt-5.2", temperature: 0.4 });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= INFORMATIK: PARSE TASK ================= */
async function handleParseTaskInformatik(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Informatik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme (UML, ER, Automaten), Tabellen, Code-Listings und Teilaufgaben. Verwende korrekte informatische Fachbegriffe. Code in Markdown-Codeblöcken. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= CHEMIE ABITUR: GENERATE ================= */
async function handleGenerateAbiturChemie(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Chemie-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Chemie-Abiturprüfung nach dem IQB-Aufgabenformat.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

IQB-REFERENZFORMAT (orientiere dich strikt an IQB-Beispielaufgaben wie Taschenofen, Kaffeebecher, Adblue):
- Jede Aufgabengruppe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. Taschenofen, Kaffeebecher, Dieselabgase, Mineraldünger, PET-Recycling) — KEINE abstrakten Lehrbuchtexte
- Pro Aufgabengruppe 5-7 Teilaufgaben bei 30 BE, gemischte Aufgabentypen:
  • Berechnungen (Stöchiometrie, Thermochemie, Nernst, Faraday) mit konkreten Zahlenwerten aus den Materialien
  • Erklärungen/Erläuterungen chemischer Phänomene im Kontext
  • Reaktionsgleichungen aufstellen und mechanistisch erklären
  • Beurteilungen/Diskussionen (Umweltaspekte, Nachhaltigkeit, Alltagsrelevanz)
- Materialien M1-M5 pro Aufgabengruppe, vielfältig:
  • Texte: Alltagsbeschreibungen, Gebrauchsanleitungen, Produktbeschreibungen
  • Tabellen: Stoffdaten, Messwerte, thermodynamische Daten (ΔH, ΔG, ΔS)
  • Diagramme: Temperatur-Zeit-Verläufe, Energiediagramme, Titrationskurven
  • Schemata: Apparaturen, Versuchsaufbauten, Fließschemata
- AFB-Verteilung: ca. 30% AFB I, 50% AFB II, 20% AFB III
- Operatoren gezielt einsetzen:
  • AFB I: "Berechnen Sie", "Formulieren Sie", "Beschreiben Sie", "Skizzieren Sie"
  • AFB II: "Erläutern Sie", "Zeigen Sie", "Erstellen Sie ein Fließschema", "Vergleichen Sie"
  • AFB III: "Beurteilen Sie", "Diskutieren Sie", "Schätzen Sie ab"
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIETE (wähle 4 verschiedene aus, Lehrplan G9 Bayern ab 2026):
1. Elektrochemie (C12 LB8, C13 LB5): Galvanische Zellen, Nernst-Gleichung, Spannungsreihe, Elektrolyse, Faraday-Gesetze, Korrosion (O2-/Säure-/Kontaktkorrosion), Korrosionsschutz, Sekundärzellen, Brennstoffzelle, Elektromobilität
2. Chemisches Gleichgewicht / Säure-Base (C12 LB7, C13 LB3): MWG, Le Chatelier, Löslichkeitsprodukt, Brönsted, pKs/pKb, pH-Berechnungen (Näherungsformeln), Titration (Kurven, Halbtitration), Henderson-Hasselbalch, Puffersysteme
3. Thermochemie/Kinetik (C12 LB5/6/8): Reaktionsgeschwindigkeit, Stoßtheorie, Aktivierungsenergie, Katalyse, Enthalpie, Hess'scher Satz, Entropie, Gibbs-Helmholtz (ΔG = ΔH − TΔS)
4. Organische Chemie (C12 LB4/5): Kohlenwasserstoffe, Hybridisierung (sp³/sp²/sp), LCAO, Mesomerie, Reaktionsmechanismen (radikalische Substitution, elektrophile Addition, elektrophile aromatische Substitution, nukleophile Substitution), induktive/mesomere Effekte
5. Kunststoffe (C13 LB4.2): Radikalische Polymerisation (Mechanismus), Polykondensation (Polyester, Polyamid), Polyaddition (Polyurethan), Thermoplaste/Duroplaste/Elastomere, Silikone, OLED, leitfähige Kunststoffe
6. Analytik/Spektroskopie (C12 LB3): Nachweisreaktionen, Chromatographie (DC, HPLC, GC), Redox-Titration, Fotometrie (Lambert-Beer), komplexometrische Titration
7. Aminosäuren/Proteine/Enzyme (C13 LB4.1): Aminocarbonsäuren, Peptidbindung, Proteinstrukturen (Primär-Quartär), Denaturierung, Enzymkinetik (Schlüssel-Schloss), Einflussfaktoren
8. Farbstoffe (C13 LB2): HOMO/LUMO, konjugierte Doppelbindungen, Azofarbstoffe (Diazotierung/Azokupplung), Triphenylmethanfarbstoffe, Küpenfärbung, Indikatoren

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Elektrochemie in der Praxis")
- Ein Sachgebiet
- Material (M1, M2, ...): Texte, Tabellen, Diagramme, Messdaten
- 4-8 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Gesamt: ${beProAufgabe} BE

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- Materialien müssen realistisch und aussagekräftig sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger mathematische Tiefe bei Berechnungen, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Materialien und Aufgabenstellungen.` : ""}

LATEX-FORMATIERUNG (schreibe echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

CHEMIE-SPEZIFISCHE LATEX-REGELN (mhchem-Erweiterung \\ce{}):
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$
- Gleichgewichtsreaktionen: $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Phasenindikatoren: $\\ce{(aq)}$, $\\ce{(g)}$, $\\ce{(l)}$, $\\ce{(s)}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$, $\\text{kJ/mol}$

TEMPERATUR-NOTATION:
- RICHTIG: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$
- FALSCH: $^\\circ\\ce{C}$ (\\ce{C} wird als Kohlenstoff interpretiert!)
- FALSCH: $\\vartheta$ (nicht in KaTeX verfügbar) — verwende stattdessen $\\theta$ oder $T$

KEINE GeoGebra-Visualisierung — Chemie verwendet kein GeoGebra.

STRUKTURFORMELN:
Bei Aufgaben zu Organik oder Kunststoffen MUSST du ein "strukturformeln"-Array innerhalb von material angeben (2–4 Moleküle).
Bei anderen Sachgebieten ist es optional.
Format: [{"name": "ethanol", "caption": "Ethanol (Edukt)"}, {"name": "acetic acid", "caption": "Essigsäure"}]
- "name": englischer chemischer Name (IUPAC oder Trivialname) für PubChem-Lookup
- "caption": deutsche Beschriftung für die Anzeige
- KEIN SMILES, KEIN InChI — nur englische Namen!

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN Zahlenwerten (mind. 4-6 Datenzeilen). KEINE Werte aus den Beispielen kopieren!
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN x/y-Datenpunkten (mind. 5-8 Messwerte). KEINE Werte aus den Beispielen kopieren!
- "bild": "text" ist ein Imagen-Prompt auf ENGLISCH (3-5 Sätze), Beschriftungen auf DEUTSCH in ""
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 1x statistik/diagramm + 1x text.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Sachgebieten, Daten und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Galvanische Zelle und Korrosion",
      "sachgebiet": "elektrochemie",
      "material": [
        {"id": "M1", "titel": "Taschenofen als galvanische Zelle", "type": "text", "text": "Ein handelsüblicher Taschenofen nutzt die exotherme Oxidation von Eisenpulver zur Wärmeerzeugung. In einer Salzlösung werden Eisenpulver ($\\\\ce{Fe}$), Aktivkohle und Natriumchlorid ($\\\\ce{NaCl}$) gemischt. An der Oberfläche des Eisenpulvers bilden sich Lokalelement: Eisen wird oxidiert ($\\\\ce{Fe -> Fe^{2+} + 2e-}$, $E^0 = -0{,}44\\\\,\\\\text{V}$), während an der Aktivkohle Sauerstoff reduziert wird ($\\\\ce{O2 + 2H2O + 4e- -> 4OH-}$, $E^0 = +0{,}40\\\\,\\\\text{V}$). Durch die große Oberfläche des Eisenpulvers läuft die Reaktion schnell ab und erzeugt Temperaturen bis zu $70\\\\,°\\\\text{C}$."},
        {"id": "M2", "titel": "Standardpotentiale", "type": "statistik", "chart_type": "bar", "text": "| Halbzelle | $E^0$ / V |\\n|---|---|\\n| $\\\\ce{Li/Li+}$ | $-3{,}04$ |\\n| $\\\\ce{Zn/Zn^{2+}}$ | $-0{,}76$ |\\n| $\\\\ce{Fe/Fe^{2+}}$ | $-0{,}44$ |\\n| $\\\\ce{Cu/Cu^{2+}}$ | $+0{,}34$ |\\n| $\\\\ce{Ag/Ag+}$ | $+0{,}80$ |\\n| $\\\\ce{Au/Au^{3+}}$ | $+1{,}50$ |"},
        {"id": "M3", "titel": "Temperaturverlauf Taschenofen", "type": "diagramm", "chart_type": "line", "text": "| Zeit / min | Temperatur / °C |\\n|---|---|\\n| 0 | 22 |\\n| 5 | 48 |\\n| 10 | 62 |\\n| 20 | 68 |\\n| 30 | 70 |\\n| 45 | 65 |\\n| 60 | 55 |\\n| 90 | 38 |"}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Formulieren Sie die Gesamtreaktionsgleichung für die Oxidation von Eisen im Taschenofen.", "be": 4},
        {"id": "1.2", "text": "Berechnen Sie die Standardzellspannung $\\\\Delta E^0$ und die freie Reaktionsenthalpie $\\\\Delta G^0$ der Reaktion.", "be": 6},
        {"id": "1.3", "text": "Beschreiben Sie den in M3 dargestellten Temperaturverlauf und erklären Sie, warum die Temperatur nach einem Maximum wieder sinkt.", "be": 6},
        {"id": "1.4", "text": "Erläutern Sie anhand des Taschenwärmers das Prinzip der Sauerstoffkorrosion und vergleichen Sie es mit der Säurekorrosion.", "be": 8},
        {"id": "1.5", "text": "Beurteilen Sie, ob der Taschenofen aus ökologischer Sicht eine sinnvolle Alternative zu elektrischen Handwärmern darstellt.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Titration einer Essigsäurelösung",
      "sachgebiet": "gleichgewicht_saeure_base",
      "material": [
        {"id": "M1", "titel": "Versuchsbeschreibung", "type": "text", "text": "In einem Lebensmittellabor wird der Essigsäuregehalt einer Probe Weinessig bestimmt. Dazu werden $25{,}0\\\\,\\\\text{ml}$ der Essigprobe mit Natronlauge ($c = 0{,}1\\\\,\\\\text{mol/l}$) titriert. Als Indikator wird Phenolphthalein (Umschlagbereich pH 8,2–10,0) verwendet. Der pKs-Wert der Essigsäure beträgt 4,75."},
        {"id": "M2", "titel": "Titrationskurve", "type": "diagramm", "chart_type": "line", "text": "| V(NaOH) / ml | pH-Wert |\\n|---|---|\\n| 0 | 2,9 |\\n| 5 | 4,2 |\\n| 10 | 4,6 |\\n| 15 | 4,9 |\\n| 18 | 5,3 |\\n| 19,5 | 6,1 |\\n| 20 | 8,7 |\\n| 20,5 | 11,3 |\\n| 22 | 12,1 |\\n| 25 | 12,5 |"}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Formulieren Sie die Reaktionsgleichung der Titration und berechnen Sie die Stoffmengenkonzentration der Essigsäure in der Probe.", "be": 5},
        {"id": "2.2", "text": "Erklären Sie mithilfe von M2, warum der pH-Wert am Äquivalenzpunkt nicht bei 7,0 liegt.", "be": 6},
        {"id": "2.3", "text": "Bestimmen Sie aus der Titrationskurve den Halbäquivalenzpunkt und erklären Sie dessen Bedeutung für die Bestimmung des pKs-Wertes.", "be": 7},
        {"id": "2.4", "text": "Erläutern Sie die Pufferwirkung der Essigsäure/Acetat-Lösung im Bereich um den Halbäquivalenzpunkt unter Verwendung der Henderson-Hasselbalch-Gleichung.", "be": 8},
        {"id": "2.5", "text": "Beurteilen Sie, ob Methylorange (Umschlagbereich pH 3,1–4,4) als alternativer Indikator für diese Titration geeignet wäre.", "be": 4}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1+2)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen, mit type-Feld)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 5-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1-3)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen, mit type-Feld)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 5-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! Aufgabe 3 und 4 müssen genauso detailliert sein wie Aufgabe 1 und 2. MINDESTENS 5 Teilaufgaben pro Aufgabengruppe.
Erstelle 4 Aufgabengruppen mit KOMPLETT ANDEREN Themen und Sachgebieten als in den Beispielen.`;

  const userPrompt = `Erstelle eine vollständige Chemie-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
KRITISCH: Alle Formeln in LaTeX-Notation, chemische Formeln mit $\\ce{}$.
WICHTIG: Bei Organik/Kunststoffe-Aufgaben UNBEDINGT strukturformeln-Array in material angeben (englische Namen für PubChem)!
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= CHEMIE ABITUR: GRADE ================= */
async function handleGradeAbiturChemie(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 40 : 30;
  const maxBE = 3 * beProAufgabe;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine Chemie-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, Reaktionsgleichungen, Mechanismen, quantitative Berechnungen, korrekte chemische Nomenklatur
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Chemie und LaTeX-Notation. Interpretiere beides großzügig.

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) und $\\ce{}$ im Feedback.
TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$).

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$/$\\\\ce{}$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= CHEMIE ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturChemie(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Chemie-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Verwende $\\ce{}$ für alle chemischen Formeln und Reaktionsgleichungen
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- CHEMIE-REGELN: $\\ce{H2O}$ für Formeln, $\\ce{2H2 + O2 -> 2H2O}$ für Reaktionen, $\\ce{<=>}$ für Gleichgewichte
- TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$)
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
  ...
  ## Aufgabe 2: [Titel]
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABEN:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= PHYSIK ABITUR: GENERATE ================= */
async function handleGenerateAbiturPhysik(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Physik-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Physik-Abiturprüfung.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

SACHGEBIETE (wähle 4 verschiedene aus diesen 6, Lehrplan G9 Bayern ab 2026):
1. Elektrostatik & Magnetostatik (Ph12 LB1): Elektrische Feldlinien, homogenes Feld, Radialfeld, Dipolfeld. Definition der elektrischen Feldstärke über Kraft auf Probeladung. Coulombkraft, Feldstärke radialsymmetrisches Feld. Superposition von Feldern. Kapazität, Abhängigkeit der Kapazität eines Plattenkondensators von geometrischen Daten, Energieinhalt des E-Feldes. Materie im elektrischen Feld, Dielektrikum, Dielektrizitätszahl. Auf-/Entladevorgang RC-Glied. Potentielle Energie, Potential, Spannung als Potentialdifferenz, Zusammenhang U und E. Geladene Teilchen in homogenen elektrischen Längs-/Querfeldern. Relativistischer Impuls, relativistische Energie, Energie-Impuls-Beziehung. Definition magnetische Flussdichte, B-Feld einer langgestreckten Spule, Energieinhalt des B-Feldes. Lorentzkraft, Kreisbahnen geladener Teilchen in homogenen Magnetfeldern. Hall-Effekt, Massenspektrometer, Geschwindigkeitsfilter, Teilchenbeschleuniger.
2. EM-Induktion & Schwingungen (Ph12 LB2): Magnetischer Fluss, Induktionsgesetz, Erzeugung sinusförmiger Wechselspannung. Selbstinduktion: Ein-/Ausschaltvorgang bei Spule, Induktivität, Energieinhalt des B-Feldes. Schaltvorgänge in RL-Glied, Zeitkonstante. Technische Anwendungen der Induktion. Differentialgleichung der EM-Schwingung in LC-Kreis, Thomson-Gleichung, periodischer Energieaustausch Spule-Kondensator, Analogie mechanische/EM-Schwingung. Gedämpfte mechanische und EM-Schwingungen, Abklingverhalten. Resonanzphänomene bei mechanischen und EM-Schwingungen. Zeigerdiagramme. Spule und Kondensator in Wechselstromkreisen, Wechselstromwiderstand, Frequenzfilter.
3. Elektromagnetische Wellen (Ph12 LB3): Ladung und Stromstärke bei Grundschwingung eines EM-Dipols, E- und B-Feld im Nahbereich. Maxwellgleichungen, Ausbreitung EM-Wellen. Struktur des EM-Wechselfeldes im Fernbereich, Eigenschaften: Ausbreitungsgeschwindigkeit, Polarisation, Brechung, Beugung, Reflexion. Mathematische Beschreibung einer eindimensionalen Welle. Superposition von Wellen, Interferenz am Doppelspalt, Intensität einer EM-Welle, konstruktive/destruktive Interferenz, Kohärenz, stehende Welle. Mehrfachspalt und optisches Gitter. Wellenlängenbestimmung bei mono-/polychromatischem Licht. Einfachspalt. Bragg-Reflexion, Bragg-Bedingung. Aufbau Röntgenröhre, Röntgenbremsspektrum. Elektromagnetisches Spektrum.
4. Quantenphysik (Ph13 LB1): Elektronenbeugungsröhre, Hypothesen zur Interpretation. Simulation Doppelspaltexperiment: wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Elektron, Interpretation durch Wellenfunktion. De-Broglie-Beziehung für Elektron. Wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Photon. Energie und Impuls des Photons. Äußerer Photoeffekt, Bestimmung des Planck'schen Wirkungsquantums. Grenzfrequenz Röntgenbremsspektrum. Wellenfunktion: Betragsquadrat als Nachweiswahrscheinlichkeit, Superposition, Determiniertheit. Komplementarität. Quantenphysikalischer Messprozess, Kausalität, Realität, Nicht-Lokalität. Heisenberg'sche Unbestimmtheitsrelation.
5. Atommodell der Quantenphysik (Ph13 LB2): Eindimensionaler Potentialtopf mit unendlich hohen Wänden: stehende Wellen, diskrete Energiewerte, Wellenfunktionen und Nachweiswahrscheinlichkeiten. Wellenfunktionen für weitere Potentiale: Potentialtopf mit endlich hohen Wänden, Coulomb-Potential, Tunneleffekt. Darstellung von Aufenthaltswahrscheinlichkeiten durch Orbitale, Struktur der Orbitale des Wasserstoffatoms, Quantenzahlen, Energiewerte für Wasserstoff. Emission und Absorption von Licht atomarer Gase, Energieniveauschema der Atomhülle, charakteristisches Röntgenspektrum. Energieübertrag durch Stoßanregung, Franck-Hertz-Versuch. Bestimmung der Rydberg-Konstante.
6. Kernphysik (Ph13 LB4): Massendefekt und mittlere Bindungsenergie je Nukleon in Abhängigkeit von Nukleonenzahl. Potentialtopfmodell des Kerns, Pauli-Prinzip. Entstehung von α-, β⁻-, β⁺- und γ-Strahlung, Tunneleffekt beim α-Zerfall, β-Zerfälle im Standardmodell, Stabilität von Atomkernen. Energiebilanzen bei Zerfällen und Kernreaktionen, Energiespektren. Ionisierende Wirkung und Nachweis von α-, β-, γ-Strahlung. Aktivität, Zerfallsgesetz, Halbwertszeit. C14-Methode zur Altersbestimmung. Strahlenbelastung, Energiedosis, Äquivalentdosis, Strahlenschutz. Kernspaltung, Kettenreaktion, prinzipieller Aufbau Kernreaktor. Kernfusion. Standardmodell, Quarks, Teilchenfamilien, fundamentale Wechselwirkungen und Austauschteilchen, Erhaltung der Leptonen-/Baryonenzahl.

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Geladene Teilchen im Magnetfeld")
- Ein Sachgebiet
- Material (M1, M2, ...): Texte, Tabellen, Diagramme, Messdaten
- 4-8 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Gesamt: ${beProAufgabe} BE

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- Materialien müssen realistisch und aussagekräftig sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger mathematische Tiefe bei Herleitungen und Berechnungen, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Materialien und Aufgabenstellungen.` : ""}

LATEX-FORMATIERUNG (schreibe echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$, $\\text{J}$
- Physikalische Konstanten: $h = 6{,}626 \\cdot 10^{-34}\\,\\text{J}\\cdot\\text{s}$, $e = 1{,}602 \\cdot 10^{-19}\\,\\text{C}$
- Kreuzprodukt: $\\vec{F} = q \\cdot \\vec{v} \\times \\vec{B}$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Energie: $E = h \\cdot f$, $E_{\\text{kin}} = \\frac{1}{2}mv^2$, $E = mc^2$
- De Broglie: $\\lambda = \\frac{h}{p}$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$

KEINE GeoGebra-Visualisierung.
KEINE Strukturformeln oder \\ce{}-Notation (das ist Physik, nicht Chemie).

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN Messwerten (mind. 4-6 Datenzeilen). KEINE Werte aus den Beispielen kopieren!
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN x/y-Datenpunkten (mind. 5-8 Messwerte). KEINE Werte aus den Beispielen kopieren!
- "bild": "text" ist ein Imagen-Prompt auf ENGLISCH (3-5 Sätze), Beschriftungen auf DEUTSCH in ""
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 1x statistik/diagramm + 1x text.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Sachgebieten, Daten und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Aufladung eines Kondensators",
      "sachgebiet": "elektrostatik",
      "material": [
        {"id": "M1", "titel": "Versuchsaufbau RC-Glied", "type": "text", "text": "Ein Plattenkondensator mit der Kapazität $C = 470\\,\\\\text{µF}$ wird über einen Widerstand $R = 10\\,\\\\text{k}\\\\Omega$ an eine Gleichspannungsquelle mit $U_0 = 12\\,\\\\text{V}$ angeschlossen. Mit einem Spannungsmessgerät wird die Spannung $U_C(t)$ am Kondensator in regelmäßigen Zeitabständen gemessen. Die Zeitkonstante des RC-Gliedes beträgt $\\\\tau = R \\\\cdot C$."},
        {"id": "M2", "titel": "Messwerte Aufladekurve", "type": "diagramm", "chart_type": "line", "text": "| t / s | $U_C$ / V |\\n|---|---|\\n| 0 | 0,0 |\\n| 1 | 2,4 |\\n| 2 | 4,3 |\\n| 3 | 5,7 |\\n| 5 | 7,9 |\\n| 8 | 10,1 |\\n| 10 | 10,9 |\\n| 15 | 11,8 |"},
        {"id": "M3", "titel": "Energiebetrachtung", "type": "text", "text": "Bei der Aufladung eines Kondensators wird nicht die gesamte von der Spannungsquelle bereitgestellte Energie im Kondensator gespeichert. Ein Teil der Energie wird im Widerstand in Wärme umgewandelt. Die im Kondensator gespeicherte Energie beträgt $W_C = \\\\frac{1}{2} C U^2$, während die Spannungsquelle insgesamt die Energie $W_{ges} = C U_0^2$ liefert."}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Beschreiben Sie den in M2 dargestellten zeitlichen Verlauf der Kondensatorspannung $U_C(t)$.", "be": 4},
        {"id": "1.2", "text": "Berechnen Sie die Zeitkonstante $\\\\tau$ des RC-Gliedes und ermitteln Sie aus M2 den Spannungswert bei $t = \\\\tau$. Vergleichen Sie mit dem theoretischen Wert.", "be": 6},
        {"id": "1.3", "text": "Erläutern Sie mithilfe der Exponentialfunktion $U_C(t) = U_0 \\\\cdot (1 - e^{-\\\\frac{t}{\\\\tau}})$, warum der Kondensator theoretisch nie vollständig aufgeladen wird.", "be": 6},
        {"id": "1.4", "text": "Berechnen Sie die im Kondensator gespeicherte Energie nach vollständiger Aufladung und den Wirkungsgrad des Aufladevorgangs. Erklären Sie das Ergebnis physikalisch.", "be": 8},
        {"id": "1.5", "text": "Beurteilen Sie, wie sich eine Verdopplung des Widerstands $R$ auf den zeitlichen Verlauf der Aufladung und auf den Wirkungsgrad auswirkt.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Interferenz am Doppelspalt",
      "sachgebiet": "em_wellen",
      "material": [
        {"id": "M1", "titel": "Versuchsbeschreibung", "type": "text", "text": "Monochromatisches Laserlicht der Wellenlänge $\\\\lambda$ fällt auf einen Doppelspalt mit dem Spaltabstand $d = 0{,}25\\,\\\\text{mm}$. Auf einem Schirm im Abstand $a = 3{,}0\\,\\\\text{m}$ hinter dem Doppelspalt wird ein Interferenzmuster beobachtet. Die Abstände der Interferenzmaxima vom Maximum nullter Ordnung werden gemessen."},
        {"id": "M2", "titel": "Messwerte Interferenzmaxima", "type": "statistik", "chart_type": "bar", "text": "| Ordnung $k$ | Abstand $x_k$ / mm |\\n|---|---|\\n| 1 | 7,6 |\\n| 2 | 15,1 |\\n| 3 | 22,8 |\\n| 4 | 30,3 |\\n| 5 | 37,9 |"}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Beschreiben Sie die Bedingung für konstruktive Interferenz am Doppelspalt und leiten Sie die Gleichung für die Lage der Maxima her.", "be": 5},
        {"id": "2.2", "text": "Bestimmen Sie mithilfe der Messwerte aus M2 die Wellenlänge $\\\\lambda$ des verwendeten Laserlichts.", "be": 6},
        {"id": "2.3", "text": "Erklären Sie, wie sich das Interferenzmuster verändert, wenn der Spaltabstand $d$ halbiert wird.", "be": 5},
        {"id": "2.4", "text": "Der Doppelspalt wird durch ein optisches Gitter mit 600 Linien pro mm ersetzt. Berechnen Sie den Winkel $\\\\alpha$ für das Maximum erster Ordnung.", "be": 8},
        {"id": "2.5", "text": "Beurteilen Sie, ob mit diesem Gitter weißes Licht in seine Spektralfarben zerlegt werden kann. Begründen Sie Ihre Antwort.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1+2)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1-3)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! Aufgabe 3 und 4 müssen genauso detailliert sein wie Aufgabe 1 und 2. MINDESTENS 4 Teilaufgaben pro Aufgabengruppe.
Erstelle 4 Aufgabengruppen mit dem gleichen Schema aber KOMPLETT ANDEREN Themen als in den Beispielen.`;

  const userPrompt = `Erstelle eine vollständige Physik-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
KRITISCH: Alle Formeln in LaTeX-Notation. KEINE \\ce{}-Notation (Physik, nicht Chemie).
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= PHYSIK ABITUR: GRADE ================= */
async function handleGradeAbiturPhysik(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 40 : 30;
  const maxBE = 3 * beProAufgabe;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine Physik-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, physikalische Formeln, korrekte Einheiten, Lösungswege, Skizzen/Diagramme, quantitative Berechnungen
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Physik und LaTeX-Notation. Interpretiere beides großzügig.

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback. KEINE \\ce{}-Notation.

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= PHYSIK ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturPhysik(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Physik-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- KEINE \\ce{}-Notation (das ist Physik, nicht Chemie)
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten mit korrekten Werten
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
  ...
  ## Aufgabe 2: [Titel]
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABEN:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= BIOLOGIE ABITUR: GENERATE ================= */
async function handleGenerateAbiturBiologie(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Biologie-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Biologie-Abiturprüfung nach dem IQB-Aufgabenformat.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

IQB-REFERENZFORMAT (orientiere dich strikt an IQB-Beispielaufgaben wie Daphnien, Wolf, Anolis):
- Jede Aufgabengruppe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. konkrete Organismen, ökologische Phänomene, Forschungsergebnisse) — KEINE abstrakten Lehrbuchtexte
- Pro Aufgabengruppe 4-5 Teilaufgaben bei 30 BE, aufeinander aufbauend ("scaffolded complexity"):
  • Teilaufgabe 1: Grundwissen/Definition (5-6 BE, AFB I)
  • Teilaufgabe 2: Beschreibung + Interpretation von Daten (7-8 BE, AFB II)
  • Teilaufgabe 3: Analyse oder Vergleich (5-10 BE, AFB II/III)
  • Teilaufgabe 4: Synthese, Modellkritik oder ethische Bewertung (6-8 BE, AFB III)
  • Optional Teilaufgabe 5: Umfassende Beurteilung (6 BE, AFB III)
- Materialien M1-M4 pro Aufgabengruppe, progressiv aufgebaut:
  • M1: Grundlegende Sachinformation/Kontext (Text, Karte, Bild)
  • M2: Detailliertere Daten/Evidenz (Text + Diagramm/Abbildung mit konkreten Messwerten)
  • M3: Forschungsergebnisse, Versuchsdaten, Graphen mit Datenpunkten
  • M4: Kontroverse Perspektiven, Zeitungsartikel, ethische Dimension
- Materialien mischen: quantitative Daten (Diagramme, Tabellen, Messwerte) UND qualitative Quellen (Fachtexte, Fotos, Karten)
- AFB-Verteilung: ca. 25% AFB I, 55% AFB II, 20% AFB III
- Operatoren gezielt einsetzen:
  • AFB I: "Geben Sie an", "Beschreiben Sie", "Nennen Sie"
  • AFB II: "Erläutern Sie", "Interpretieren Sie", "Erklären Sie", "Vergleichen Sie"
  • AFB III: "Bewerten Sie", "Beurteilen Sie", "Diskutieren Sie"
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIETE (wähle 4 verschiedene aus diesen 6, Lehrplan G9 Bayern ab 2026):
1. Genetik & Gentechnik (B12 LB1): Aufbau und Struktur der DNA (Doppelhelix, Basenpaarung, antiparallele Stränge). Semikonservative Replikation. Proteinbiosynthese: Transkription, RNA-Processing (Spleißen), Translation am Ribosom, genetischer Code (Codon, Anticodon, Redundanz). Genregulation bei Prokaryoten (Operon-Modell) und Eukaryoten (Transkriptionsfaktoren, Enhancer, Methylierung). Genmutationen (Punkt-, Rastermutationen), Mutagene, Reparaturmechanismen. Chromosomenmutationen und Genommutationen. Klassische Genetik: Mendel-Regeln (Uniformität, Spaltung, Unabhängigkeit), Rückkreuzung, Dihybrider Erbgang, Kopplung und Rekombination. Humangenetik: Stammbaumanalyse (autosomal/gonosomal, dominant/rezessiv). Gentechnik: Restriktionsenzyme, Vektoren, PCR, Gelelektrophorese, genetischer Fingerabdruck, Klonierung, CRISPR-Cas. Bioethische Bewertung gentechnischer Verfahren.
2. Neurobiologie (B12 LB2): Bau und Funktion von Nervenzellen (Soma, Axon, Dendriten, Myelinscheide, Ranvier-Schnürringe). Ruhepotential (Natrium-Kalium-Pumpe, Kalium-Leckkanäle, Nernst-Gleichung). Aktionspotential (Depolarisation, Repolarisation, Hyperpolarisation, Refraktärzeit, Alles-oder-Nichts-Prinzip). Erregungsleitung: kontinuierlich und saltatorisch, Geschwindigkeit. Synapse: erregende und hemmende postsynaptische Potentiale (EPSP, IPSP), räumliche und zeitliche Summation. Verrechnung an Nervenzellen. Neuroaktive Substanzen und Synapsengifte (Wirkungsmechanismen). Sinnesphysiologie: Bau des Auges, Fotorezeptoren (Stäbchen, Zapfen), Signaltransduktion. Informationsverarbeitung im ZNS, Reflexbogen.
3. Stoffwechselphysiologie (B12 LB3): Enzyme: Aufbau (Proteine, aktives Zentrum), Substrat- und Wirkungsspezifität, Schlüssel-Schloss-Prinzip und Induced-Fit-Modell. Abhängigkeit der Enzymaktivität von Temperatur, pH-Wert und Substratkonzentration. Enzymhemmung (kompetitiv, nicht-kompetitiv, allosterisch), Regulation. Energetik: ATP als universeller Energieträger, exergonische/endergonische Reaktionen, Redoxreaktionen, Elektronentransportketten. Zellatmung: Glykolyse, oxidative Decarboxylierung, Citratzyklus, Atmungskette (Chemiosmose, ATP-Synthase), Energiebilanz. Gärung (alkoholische Gärung, Milchsäuregärung). Photosynthese: Lichtreaktion (Fotosystem I und II, Elektronentransportkette, Fotophosphorylierung), Calvin-Zyklus (CO₂-Fixierung, Reduktion, Regeneration). Abhängigkeit der Fotosyntheserate von Lichtintensität, CO₂-Konzentration, Temperatur. C4- und CAM-Pflanzen.
4. Ökologie & Biodiversität (B12 LB4): Abiotische und biotische Umweltfaktoren. Ökologische Potenz, Toleranzkurve, Minimum-Gesetz, stenök/euryök. Populationsökologie: Wachstumsmodelle (exponentiell, logistisch), Kapazitätsgrenze K, r- und K-Strategen. Intra- und interspezifische Konkurrenz, Konkurrenzvermeidung, ökologische Nische (Fundamental- vs. Realnische). Räuber-Beute-Beziehungen (Lotka-Volterra-Regeln). Symbiose, Parasitismus, Kommensalismus. Ökosystem See/Wald: Trophieebenen, Nahrungsketten/-netze, Energiefluss, Stoffkreisläufe (C, N). Sukzession, Klimaxgesellschaft. Biodiversität: Artenschutz, nachhaltige Nutzung, Biodiversitätsverlust.
5. Evolution (B13 LB1): Evolutionstheorien (Darwin, Lamarck, synthetische Evolutionstheorie). Evolutionsfaktoren: Mutation, Rekombination, Selektion (gerichtet, stabilisierend, disruptiv), Gendrift (Flaschenhalseffekt, Gründereffekt), Genfluss, Isolation. Artbegriffe (biologischer, morphologischer Artbegriff). Artbildung: allopatrisch, sympatrisch, adaptive Radiation. Homologie und Analogie, Rudimente, Atavismen. Molekulare Phylogenetik: DNA-Sequenzvergleich, molekulare Uhr. Stammbaum-Analyse (Kladogramm, Synapomorphien). Koevolution. Humanevolution: fossile Funde, Merkmalsvergleich Menschenaffen/Mensch, kulturelle Evolution, Out-of-Africa-Hypothese.
6. Verhaltensökologie (B13 LB2): Verhalten als Anpassung (Proximate und ultimate Ursachen). Verhaltensökologie: Kosten-Nutzen-Analyse von Verhaltensweisen. Fitness (direkte und indirekte Fitness, Gesamtfitness/Inclusive Fitness). Fortpflanzungsstrategien: sexuelle Selektion (intra- und intersexuell), Partnerwahl, Brutpflege. Altruismus und Verwandtenselektion (Hamilton-Regel: rB > C). Kooperation: reziproker Altruismus, Tit-for-Tat. Sozialverhalten: Gruppenbildung (Vor- und Nachteile), Dominanzhierarchien. Kommunikation im Tierreich (optisch, akustisch, chemisch, taktil). Konflikte: Eltern-Kind-Konflikt, Geschwisterkonkurrenz.

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Genetischer Fingerabdruck")
- Ein Sachgebiet
- MINDESTENS 2-3 Materialien (M1, M2, M3, ...) pro Aufgabengruppe!
- 4-8 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Gesamt: ${beProAufgabe} BE

MATERIALIEN — VIELFÄLTIG UND DATENREICH:
Jede Aufgabengruppe MUSS mindestens 2-3 verschiedene Materialtypen enthalten.
Jedes Material hat ein "type"-Feld:

- **"statistik"** — Datentabellen mit konkreten Zahlenwerten (Messwerte, Versuchsergebnisse). "text" MUSS eine Markdown-Tabelle mit echten Zahlenwerten sein. "chart_type": "bar". Beispiel:
  | Temperatur (°C) | Aktivität (U/ml) |
  |---|---|
  | 20 | 45 |
  | 30 | 78 |
  | 40 | 120 |

- **"diagramm"** — Kurvenverläufe mit x/y-Datenpunkten (Membranpotential über Zeit, Enzymaktivität vs. Temperatur, Populationswachstum, Fotosyntheserate). "text" MUSS eine Markdown-Tabelle mit echten Zahlenwerten sein. Achsenbeschriftungen als Tabellen-Header. "chart_type": "line". Beispiel:
  | Zeit (ms) | Potential (mV) |
  |---|---|
  | 0 | -70 |
  | 1 | +30 |
  | 2 | -80 |

- **"bild"** — Bilder werden GENERIERT (Imagen AI). Geeignet für: Mikroskopaufnahmen, Laboraufbauten, Ökosysteme, Organismen, Gelelektrophorese-Ergebnisse, Versuchsaufbauten. "text" MUSS ein ausführlicher Imagen-Prompt auf Englisch sein (mind. 3-5 Sätze) mit Layout, Farben, Stil und allen visuellen Details. KEIN chart_type. NICHT verwenden für: Stammbäume, Kreuzungsschemata — diese als type "text". WICHTIG: Bilder NIEMALS als Text beschreiben — IMMER type "bild" mit Imagen-Prompt verwenden!

- **"text"** — Textquellen, Versuchsbeschreibungen, Fachtexte, Forschungsergebnisse, Stammbäume (als Textformat mit Generationen I/II/III), Kreuzungsschemata. "text" enthält den Fließtext. KEIN chart_type. NIEMALS Bilder oder visuelle Materialien als Textbeschreibung — dafür type "bild" verwenden!

WICHTIG:
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben ("statistik", "diagramm", "bild" oder "text"). Materialien OHNE type-Feld werden nicht korrekt dargestellt!
- KRITISCH: Für "statistik" und "diagramm": "text" MUSS eine Markdown-Tabelle sein (mit | ... | Syntax und echten Zahlenwerten). KEINE Textbeschreibungen von Diagrammen — stattdessen die Datenpunkte als Tabelle!
- KRITISCH: Für "bild": "text" MUSS ein ausführlicher Imagen-Prompt auf Englisch sein (mind. 3-5 Sätze). REGELN: (1) Alle Texte/Beschriftungen IM BILD müssen auf DEUTSCH sein! In Anführungszeichen "" angeben und EXAKT beschreiben wo sie platziert werden (z.B. "Title 'Enzymaktivität bei verschiedenen pH-Werten' centered at the top in bold, x-axis labeled 'pH-Wert', y-axis labeled 'Reaktionsgeschwindigkeit (µmol/min)'"). (2) KEINE Rechtschreibfehler — jedes deutsche Wort muss korrekt geschrieben sein! (3) Layout, Farben, Stil, Proportionen und alle visuellen Elemente detailliert beschreiben. KEINE kurzen Stichworte — KEINE 2-4 Wort Keywords!
- VERBOTEN: Bilder, Fotos, Abbildungen, Schaubilder oder visuelle Materialien als Textbeschreibung in type "text" einbetten! Wenn ein Material visuell ist (Foto, Mikroskopaufnahme, Versuchsaufbau, Landschaft, Organismus), MUSS es type "bild" mit einem ausführlichen Imagen-Prompt sein. Texte wie "Die Abbildung zeigt..." oder "[Beschreibung eines Bildes]" sind NICHT erlaubt — stattdessen als type "bild" generieren!
- Pro Aufgabengruppe: MINDESTENS 1x "statistik" oder "diagramm" (mit Markdown-Tabelle + chart_type), PLUS mindestens 1x "bild" (mit Imagen-Prompt)
- Verwende LaTeX-Notation für Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- Materialien müssen realistisch, datenreich und aussagekräftig sein — KEINE leeren Platzhalter!
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger Vertiefung, keine über den gA-Lehrplan hinausgehenden Themen, zugänglichere Materialien und Aufgabenstellungen.` : ""}
- Teilaufgaben sollen sich DIREKT auf die Materialien beziehen ("Werte M1 aus", "Beschreibe den in M2 dargestellten Verlauf")

BIOLOGIE-SPEZIFISCHE NOTATION:
- Genotypen: $Aa \\times aa$, $F_1$, $F_2$
- Stoffwechsel: $\\text{ATP}$, $\\text{NADH}$, $\\text{CO}_2$, $\\text{C}_6\\text{H}_{12}\\text{O}_6$
- Populationsökologie: $\\frac{dN}{dt} = r \\cdot N$, $K$ (Kapazität), $N(t)$
- Neurobiologie: Membranpotential in $\\text{mV}$, Ionenkonzentrationen
- Evolution: Allelfrequenzen $p$, $q$, Hardy-Weinberg: $p^2 + 2pq + q^2 = 1$

KEINE GeoGebra-Visualisierung.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, ANDEREN Materialien und ANDEREN Teilaufgaben — kopiere NICHT die Beispiele!
MINDESTENS 4 Teilaufgaben pro Aufgabengruppe, mit steigendem Anforderungsniveau (AFB I → II → III).

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Einfluss der Temperatur auf die Fotosyntheserate",
      "sachgebiet": "stoffwechsel",
      "material": [
        {"id": "M1", "titel": "Messergebnisse zur Fotosyntheserate", "type": "statistik", "text": "| Temperatur (°C) | O₂-Entwicklung (µmol/h) |\\n|---|---|\\n| 5 | EIGENER WERT |\\n| 10 | EIGENER WERT |\\n| 15 | EIGENER WERT |\\n| 20 | EIGENER WERT |\\n| 25 | EIGENER WERT |\\n| 30 | EIGENER WERT |\\n| 35 | EIGENER WERT |\\n| 40 | EIGENER WERT |", "chart_type": "bar"},
        {"id": "M2", "titel": "Zeitlicher Verlauf der O₂-Entwicklung bei 25 °C", "type": "diagramm", "text": "| Zeit (min) | O₂-Konzentration (µmol/l) |\\n|---|---|\\n| 0 | EIGENER WERT |\\n| 5 | EIGENER WERT |\\n| 10 | EIGENER WERT |\\n| 15 | EIGENER WERT |\\n| 20 | EIGENER WERT |\\n| 25 | EIGENER WERT |\\n| 30 | EIGENER WERT |", "chart_type": "line"},
        {"id": "M3", "titel": "Forschungstext zur Temperaturabhängigkeit", "type": "text", "text": "EIGENER vollständig ausformulierter Fachtext (mind. 150–300 Wörter) über den Zusammenhang zwischen Temperatur, Enzymaktivität und Fotosyntheserate. Der Text muss konkrete Fachbegriffe enthalten und auf Forschungsergebnisse Bezug nehmen."}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Beschreiben Sie die in M1 dargestellten Messergebnisse und benennen Sie den Temperaturbereich des Optimums.", "be": 5},
        {"id": "1.2", "text": "Erklären Sie mithilfe von M2 und M3 den Kurvenverlauf der O₂-Entwicklung unter Berücksichtigung der Enzymkinetik.", "be": 8},
        {"id": "1.3", "text": "Erläutern Sie, warum die Fotosyntheserate oberhalb des Temperaturoptimums stark absinkt. Gehen Sie dabei auf molekulare Vorgänge ein.", "be": 8},
        {"id": "1.4", "text": "Beurteilen Sie die Bedeutung der RGT-Regel für die Vorhersage der Fotosyntheserate bei Kulturpflanzen im Kontext des Klimawandels.", "be": 9}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Erbgang einer Stoffwechselerkrankung",
      "sachgebiet": "genetik",
      "material": [
        {"id": "M1", "titel": "Stammbaum einer betroffenen Familie", "type": "text", "text": "EIGENER vollständig ausformulierter Stammbaum über drei Generationen (mind. 8 Personen) mit Phänotyp-Angaben. Der Stammbaum muss als Textbeschreibung formuliert werden und eindeutige Rückschlüsse auf den Erbgang ermöglichen."},
        {"id": "M2", "titel": "Gelelektrophorese-Ergebnisse", "type": "bild", "text": "Scientific laboratory photograph showing a gel electrophoresis result under UV light. A horizontal agarose gel glows blue-green with 6 clearly labeled lanes showing distinct DNA band patterns at different molecular weights. Lane labels read 'Marker', 'Person 1', 'Person 2', 'Person 3', 'Person 4', 'Kontrolle' in small white text. Title 'Ergebnisse der Gelelektrophorese' centered at top in bold white font. Dark laboratory background."},
        {"id": "M3", "titel": "Bandenmuster und Restriktionsanalyse", "type": "text", "text": "EIGENE vollständige Beschreibung der Bandenmuster (mind. 100 Wörter): Für jede Spur die genauen Bandengrößen in bp angeben und Bezug zum RFLP-Muster nehmen."}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Ermitteln Sie anhand des Stammbaums in M1 den zugrunde liegenden Erbgang. Begründen Sie Ihre Entscheidung.", "be": 6},
        {"id": "2.2", "text": "Bestimmen Sie die Genotypen aller Personen im Stammbaum. Verwenden Sie geeignete Symbole.", "be": 6},
        {"id": "2.3", "text": "Werten Sie die Gelelektrophorese-Ergebnisse (M2, M3) aus und ordnen Sie die Bandenmuster den Genotypen der Familienmitglieder zu.", "be": 8},
        {"id": "2.4", "text": "Berechnen Sie die Wahrscheinlichkeit, dass ein weiteres Kind des Paares aus Generation II von der Erkrankung betroffen ist.", "be": 5},
        {"id": "2.5", "text": "Erörtern Sie Chancen und Grenzen der genetischen Diagnostik mittels RFLP-Analyse am Beispiel der dargestellten Erkrankung.", "be": 5}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen — anderes Sachgebiet als Aufgabe 1 und 2",
      "sachgebiet": "EIGENES Sachgebiet wählen (z.B. neurobiologie, oekologie, evolution, verhaltensbiologie)",
      "material": ["EIGENE Materialien generieren: mind. 1x statistik/diagramm + 1x text, optional 1x bild. Alle Zahlenwerte, Texte und Imagen-Prompts SELBST erstellen!"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4–6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE). Jede Teilaufgabe mit konkretem Operator und BE-Angabe."],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen — anderes Sachgebiet als Aufgabe 1, 2 und 3",
      "sachgebiet": "EIGENES Sachgebiet wählen (keines der bereits verwendeten!)",
      "material": ["EIGENE Materialien generieren: mind. 1x statistik/diagramm + 1x text, optional 1x bild. Alle Zahlenwerte, Texte und Imagen-Prompts SELBST erstellen!"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4–6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE). Jede Teilaufgabe mit konkretem Operator und BE-Angabe."],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}`;

  const userPrompt = `Erstelle eine vollständige Biologie-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}
KRITISCH: Alle Formeln in LaTeX-Notation.
KRITISCH: Jedes Material MUSS ein "type"-Feld haben! Verwende die 4 Typen:
- "statistik" (type + chart_type "bar"): "text" = VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Zahlenwerten (mind. 4-6 Datenzeilen)
- "diagramm" (type + chart_type "line"): "text" = VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte)
- "bild" (type): "text" = Imagen-Prompt auf Englisch (3-5 Sätze), Beschriftungen auf DEUTSCH in ""
- "text" (type): "text" = VOLLSTÄNDIGER AUSFORMULIERTER Fachtext (mind. 150-300 Wörter)
ABSOLUT VERBOTEN: Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." — das "text"-Feld MUSS den TATSÄCHLICHEN Inhalt enthalten!
Pro Aufgabengruppe: mindestens 1x statistik/diagramm + 1x text. Optional 1x bild.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000, { model: "gpt-5.2", temperature: 0.7 });

  const content = extractJSON(openaiRes);
  enrichBioMaterials(content);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgaben = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgaben) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Biologie");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= BIOLOGIE: MATERIAL POST-PROCESSING ================= */
function enrichBioMaterials(data) {
  const sachgebietImages = {
    genetik: "A detailed scientific photograph of a gel electrophoresis result under UV light. The agarose gel glows blue-green and shows 6 clearly separated lanes with distinct DNA band patterns at different molecular weights. Lane labels at the top read 'Marker', 'Probe 1', 'Probe 2', 'Probe 3', 'Kontrolle+', 'Kontrolle-' in small white text. A title 'Ergebnisse der Gelelektrophorese' is centered at the top in bold white font. Dark laboratory background with the UV transilluminator as main light source.",
    gentechnik: "A high-resolution photograph of a modern molecular biology laboratory workbench. In the center, a PCR thermocycler with its lid open showing sample tubes. Surrounding equipment includes micropipettes, a centrifuge, and Eppendorf tubes in a rack. A lab notebook with handwritten notes is visible. Clean, well-lit laboratory environment with white surfaces and organized equipment. Title 'PCR-Arbeitsplatz im Labor' in bold text at the top center.",
    neurobiologie: "A detailed fluorescence microscopy image of neurons in vibrant green and blue colors against a dark background. Multiple neurons are visible with clearly defined cell bodies (soma), long axons, and branching dendrites. Synaptic connections between neurons glow brightly. A scale bar labeled '50 µm' appears in the bottom right corner. Title 'Fluoreszenzmikroskopie: Neuronales Netzwerk' centered at the top in white bold text.",
    stoffwechsel: "A professional scientific illustration showing enzyme activity in a laboratory setting. A clear test tube rack with colorful solutions in graduated cylinders showing different reaction stages from light yellow to deep orange. A digital thermometer displays '37.0°C'. Clean white laboratory background with professional lighting. Title 'Enzymaktivität im Laborversuch' centered at the top in bold dark text.",
    stoffwechselphysiologie: "A professional scientific illustration showing enzyme activity in a laboratory setting. A clear test tube rack with colorful solutions in graduated cylinders showing different reaction stages from light yellow to deep orange. A digital thermometer displays '37.0°C'. Clean white laboratory background with professional lighting. Title 'Enzymaktivität im Laborversuch' centered at the top in bold dark text.",
    oekologie: "An aerial photograph of a diverse temperate forest ecosystem showing different vegetation zones. A meandering river runs through the landscape, with deciduous trees in various shades of green on one side and coniferous forest on the other. A meadow with wildflowers borders the river. Clear blue sky with scattered clouds. Title 'Ökosystem: Auenlandschaft' centered at the top in bold white text with a slight shadow for readability.",
    "ökologie": "An aerial photograph of a diverse temperate forest ecosystem showing different vegetation zones. A meandering river runs through the landscape, with deciduous trees in various shades of green on one side and coniferous forest on the other. A meadow with wildflowers borders the river. Clear blue sky with scattered clouds. Title 'Ökosystem: Auenlandschaft' centered at the top in bold white text with a slight shadow for readability.",
    evolution: "A museum display showing a series of hominid skulls arranged chronologically from left to right, demonstrating human evolution. Five skulls from Australopithecus to Homo sapiens are placed on a dark wooden shelf with small labels beneath each. Dramatic museum lighting highlights the bone details. Title 'Schädelvergleich: Evolution des Menschen' centered at the top in elegant white serif font.",
    verhaltensbiologie: "A professional wildlife photograph showing a group of European grey wolves in their natural habitat. Three wolves are visible in a forest clearing — one in an alert posture, one lying down, and one approaching with tail lowered, demonstrating social hierarchy behavior. Soft natural morning light filters through birch trees. Title 'Sozialverhalten bei Wölfen' centered at the top in bold white text.",
    "verhaltensökologie": "A professional wildlife photograph showing a group of European grey wolves in their natural habitat. Three wolves are visible in a forest clearing — one in an alert posture, one lying down, and one approaching with tail lowered, demonstrating social hierarchy behavior. Soft natural morning light filters through birch trees. Title 'Sozialverhalten bei Wölfen' centered at the top in bold white text."
  };

  const aufgaben = data.aufgaben || data.aufgabengruppen || [];
  aufgaben.forEach(a => {
    const mats = a.materialien || a.material || [];
    let hasBild = false;

    mats.forEach(m => {
      if (m.type === "bild") { hasBild = true; return; }
      if (m.type && m.chart_type) return; // already complete

      const text = (m.text || "").replace(/\\n/g, "\n");
      const tableLines = text.split("\n").filter(l => l.trim().startsWith("|") && l.trim().endsWith("|"));
      const dataLines = tableLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));

      if (dataLines.length >= 2) {
        const hdr = dataLines[0].toLowerCase();
        const isTime = /zeit|time|min\b|ms\b|sec|stunde|tag|hour|temperatur|temp\b|konzentration/.test(hdr);
        if (!m.type) m.type = isTime ? "diagramm" : "statistik";
        if (!m.chart_type) m.chart_type = isTime ? "line" : "bar";
      } else if (!m.type) {
        m.type = "text";
      }
    });

    // Add image material if none exists
    if (!hasBild) {
      const sg = (a.sachgebiet || "").toLowerCase().replace(/\s+/g, "");
      const keywords = sachgebietImages[sg] || "A professional scientific photograph of a modern biology laboratory. A high-quality microscope is centered on a clean white workbench, with prepared glass slides, Petri dishes with bacterial cultures, and a rack of test tubes nearby. Soft overhead LED lighting illuminates the workspace. Title 'Biologisches Labor' centered at the top in bold dark text.";
      mats.push({
        id: "M" + (mats.length + 1),
        titel: "Abbildung: " + (a.sachgebiet || "Biologie"),
        type: "bild",
        text: keywords
      });
    }

    // Ensure the material array is stored back
    if (a.material && Array.isArray(a.material)) a.material = mats;
    else if (a.materialien) a.materialien = mats;
    else a.material = mats;
  });
}

/* ================= BIOLOGIE ABITUR: GRADE ================= */
async function handleGradeAbiturBiologie(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 40 : 30;
  const maxBE = 3 * beProAufgabe;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine Biologie-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache (biologische Fachbegriffe), korrekte Verwendung von Fachkonzepten, Materialauswertung, logische Argumentation, Darstellungsleistung
- Korrekte Fachbegriffe und Zusammenhänge → volle Punkte
- Teilweise korrekte Antworten → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Fachsprache und LaTeX-Notation. Interpretiere beides großzügig.

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { model: "gpt-5.2", temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= BIOLOGIE ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturBiologie(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Biologie-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für Formeln: $...$ für inline, $$...$$ für Display
- Verwende korrekte biologische Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- BIOLOGIE-NOTATION: Genotypen $Aa \\times aa$, Stoffwechsel $\\text{ATP}$, $\\text{CO}_2$, Populationsökologie $\\frac{dN}{dt}$
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
  ...
  ## Aufgabe 2: [Titel]
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABEN:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000, { model: "gpt-5.2", temperature: 0.4 });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= SPORT ABITUR: GENERATE ================= */
async function handleGenerateAbiturSport(request, env) {
  const body = await request.json();

  // Sport Abitur: nur eA (Leistungsfach), 3 Aufgaben (1 wählen), 100 BE, 180 min
  const beProAufgabe = 100;
  const gesamtBE = 100;
  const pruefungsdauer = 180;
  const anzahlAufgaben = 3;
  const wahlAnzahl = 1;

  const systemPrompt = `Du bist ein Sport-Experte für das bayerische Abitur (eA, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE schriftliche Sport-Abiturprüfung (Leistungsfach Sport, Sporttheorie) exakt im Stil der ISB-Beispielaufgaben.

PRÜFUNGSSTRUKTUR (eA Leistungsfach Sport):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgaben zur Auswahl, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabe: ${beProAufgabe} BE

LERNBEREICHE (LehrplanPLUS Sporttheorie G9 Bayern ab 2026):
LB1 – Sportbiologie/Trainingslehre (Sp12 LB1): Trainingsprinzipien, Superkompensation, Reizstufenregel. Sportbiologische Grundlagen: Bewegungsapparat, Skelettmuskulatur (Muskelfasertypen ST/FT, Kontraktionsformen). Krafttraining (Maximalkraft, Schnellkraft, Kraftausdauer). Energiebereitstellung (anaerob-alaktazid, anaerob-laktazid, aerob). Herz-Kreislauf-System. Ausdauertraining (aerobe/anaerobe Schwelle, Dauer-/Intervallmethode). Schnelligkeitstraining. Beweglichkeitstraining. Trainingsplanung (Makro-/Meso-/Mikrozyklus). Ernährung.
LB2 – Bewegungslehre (Sp12 LB2): Biomechanische Prinzipien (Anfangskraft, Beschleunigungswege, Impulserhaltung, Gegenwirkung, Koordination von Teilimpulsen). Körperschwerpunkt, Körperachsen. Phasenmodell (Vorbereitungs-, Haupt-, Endphase). Motorisches Lernen (Grobkoordination, Feinkoordination, variable Verfügbarkeit). Koordinative Fähigkeiten. Technik-/Taktiktraining.
LB3 – Sport und Gesundheit (Sp13 LB3): Gesundheitsmodelle (Salutogenese, biopsychosoziales Modell). Sportverletzungen (Prävention, PECH-Regel). Ernährung. Doping (Substanzen, Methoden, ethische Bewertung, WADA/NADA).
LB4 – Psychologische, soziale und gesellschaftspolitische Aspekte (Sp13 LB4): Motivation (intrinsisch/extrinsisch, Risikowahl-Modell). Emotion (Angst, Flow, Yerkes-Dodson). Aggression. Fairness. Sport und Medien. Inklusion. Sport als Bildungsfaktor.

AUFGABENSTRUKTUR — EXAKT WIE ISB-BEISPIELAUFGABEN:
Jede Aufgabe ist um einen SPORTPRAKTISCHEN KONTEXT aufgebaut (z.B. Zehnkampf, Mountainbiken, Volleyball, Schwimmen, Fußball, Turnen, Basketball, Klettern, Triathlon).
Jede Aufgabe integriert MEHRERE Lernbereiche — typischerweise:
- "Sportbiologie/Trainingslehre und Bewegungslehre" (LB1+LB2)
- Optional zusätzlich: "Psychologische, soziale und gesellschaftspolitische Bedeutung des Sports" (LB4)
- Oder: "Sport und Gesundheit" (LB3)

THEMATISCHE BLÖCKE (ISB-Struktur):
Jede Aufgabe hat 3-5 thematische Blöcke (nummeriert 1, 2, 3, 4, ggf. 5).
Jeder Block hat einen EINLEITUNGSTEXT, der den thematischen Kontext setzt.
Unter jedem Block folgen Teilaufgaben (1.1, 1.2, 2.1, 2.2, 3.1, 3.2 usw.).
Ein Block kann auch nur aus einer einzelnen Teilaufgabe bestehen (z.B. Block 4 mit nur Aufgabe 4, ohne 4.1).

Beispiel-Blockstruktur einer ISB-Aufgabe zum Zehnkampf:
- Block 1 (Bewegungslehre, ~25 BE): Einleitung über Wurfdisziplinen → 1.1 Phasenstruktur vergleichen (16 BE), 1.2 Koordinative Fähigkeiten (9 BE)
- Block 2 (Energiebereitstellung/Ernährung, ~24 BE): Einleitung über energetische Anforderungen → 2.1 Energieliefernde Prozesse (12 BE), 2.2 Ernährung (12 BE)
- Block 3 (Trainingslehre/Technik, ~39 BE): Einleitung über Trainingsgestaltung → 3.1 Schnelligkeit (12 BE), 3.2 Einflussgrößen (8 BE), 3.3 Techniktraining (11 BE), 3.4 Übungsreihe (8 BE)
- Block 4 (Gesellschaft, ~12 BE): Zitat + Bewertungsaufgabe (12 BE)

ANFORDERUNGSBEREICHE:
- AFB I (ca. 25%): "Nennen Sie", "Beschreiben Sie", "Geben Sie an", "Stellen Sie dar"
- AFB II (ca. 55%): "Erläutern Sie", "Erklären Sie", "Vergleichen Sie", "Analysieren Sie", "Ordnen Sie zu"
- AFB III (ca. 20%): "Bewerten Sie", "Beurteilen Sie", "Diskutieren Sie", "Erörtern Sie"

MATERIALIEN — ISB-STIL:
Materialien heißen "Abb. 1", "Abb. 2", "Abb. 3" (für Bilder, Diagramme, Schaubilder) oder "Blogauszug – Teil 1", "Textquelle 1", "Tabelle 1" etc. NICHT "M1", "M2"!
Sie sind thematisch in die Aufgabe eingebettet und werden in den Teilaufgaben direkt referenziert ("vgl. Abb. 1", "unter Berücksichtigung von Abb. 2").
Pro Aufgabe 2-4 Materialien. Typen:
- **"bild"** — Bewegungsabläufe, Bildreihen, anatomische Darstellungen. "text" = ausführlicher Imagen-Prompt auf Englisch (3-5 Sätze). Beschriftungen auf DEUTSCH in Anführungszeichen. "titel" = z.B. "Abb. 1: Speerwurf"
- **"diagramm"** — Kurvenverläufe (Laktat, HF, Streckenprofil). "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten. "chart_type": "line". "titel" = z.B. "Abb. 2: Laktatleistungskurve"
- **"statistik"** — Datentabellen (Leistungswerte, Testergebnisse). "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten. "chart_type": "bar". "titel" = z.B. "Tabelle 1: Testergebnisse"
- **"text"** — Blogauszüge, Zitate, Fachtexte, Quellenangaben. "text" = vollständiger Fließtext (mind. 80-200 Wörter). "titel" = z.B. "Blogauszug – Teil 1" oder "Textquelle 1"

WICHTIG:
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben!
- KRITISCH: Für "statistik" und "diagramm": "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten
- KRITISCH: Für "bild": "text" = ausführlicher Imagen-Prompt auf Englisch, Beschriftungen auf DEUTSCH
- Pro Aufgabe: MINDESTENS 1x "bild" oder "diagramm" + 1x "text"
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- KEINE LÖSUNGSHINWEISE in den Aufgabenstellungen

SPORT-SPEZIFISCHE NOTATION:
- Einheiten korrekt: HF in min⁻¹, VO₂max in ml/min/kg, Kraft in N, Laktat in mmol/l
- Energiebereitstellung: ATP, CP, Glykogen, aerob/anaerob
- Trainingszonen: GA1, GA2, WSA, Schwellenbereich

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Zehnkampf",
      "lernbereiche": ["Sportbiologie/Trainingslehre und Bewegungslehre", "Psychologische, soziale und gesellschaftspolitische Bedeutung des Sports"],
      "material": [
        {"id": "Abb. 1", "titel": "Abb. 1: Speerwurf", "type": "bild", "text": "<Imagen-Prompt>"},
        {"id": "Abb. 2", "titel": "Abb. 2: Diskuswurf", "type": "bild", "text": "<Imagen-Prompt>"}
      ],
      "teilaufgaben": [
        {"id": "1", "text": "Mehrkämpferinnen und Mehrkämpfer gelten als die Königinnen bzw. die Könige der Leichtathletik...", "be": 0, "typ": "block"},
        {"id": "1.1", "text": "Stellen Sie Gemeinsamkeiten und Unterschiede hinsichtlich der Bewegungsstruktur... (vgl. Abb. 1 und 2) gegenüber!", "be": 16},
        {"id": "1.2", "text": "Beschreiben Sie drei koordinative Fähigkeiten...", "be": 9},
        {"id": "2", "text": "Die zwei Wettkampftage sind für die Athleten insbesondere aus energetischer Sicht sehr kräftezehrend.", "be": 0, "typ": "block"},
        {"id": "2.1", "text": "Beschreiben Sie die unterschiedlichen energieliefernden Prozesse...", "be": 12},
        {"id": "4", "text": "Bewerten Sie diese Aussage!", "be": 12}
      ],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "eA",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}`;

  const userPrompt = `Erstelle eine vollständige schriftliche Sport-Abiturprüfung (Leistungsfach, eA, ${gesamtBE} BE) im exakten ISB-Stil.
${anzahlAufgaben} Aufgaben à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
WICHTIG:
- Jede Aufgabe um einen konkreten sportpraktischen Kontext (z.B. Zehnkampf, Mountainbiken, Volleyball, Schwimmen, Fußball)
- Jede Aufgabe integriert MEHRERE Lernbereiche (typisch: Sportbiologie/Trainingslehre + Bewegungslehre + ggf. Psychologie/Gesellschaft)
- Thematische Blöcke (1, 2, 3, 4) mit Einleitungstext + Teilaufgaben (1.1, 1.2, 2.1 usw.)
- Block-Einleitungen als Teilaufgaben mit "be": 0 und "typ": "block"
- Materialien als "Abb. 1", "Abb. 2", "Blogauszug – Teil 1" etc. (NICHT M1/M2!)
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000, { model: "gpt-5.2", temperature: 0.7 });

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= SPORT ABITUR: GRADE ================= */
async function handleGradeAbiturSport(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const maxBE = 100;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine schriftliche Sport-Abiturprüfung (Bayern, Leistungsfach Sport eA, G9, ab 2026) im ISB-Format.
Der Schüler hat 1 von 3 Aufgaben gewählt. Gesamt: ${maxBE} BE.
Die Aufgabe ist in thematische Blöcke gegliedert (1, 2, 3, 4) mit Teilaufgaben (1.1, 1.2, 2.1 usw.).

BEWERTUNGSREGELN:
- Bewerte jede Teilaufgabe einzeln (ignoriere Block-Einleitungen mit 0 BE)
- Bewertungskriterien: sportwissenschaftliche Fachsprache, Korrektheit, Materialauswertung (Abb., Blogauszüge, Tabellen), logische Argumentation, Darstellungsleistung
- Korrekte Fachbegriffe und Zusammenhänge → volle Punkte
- Teilweise korrekte Antworten → Teilpunkte
- Folgefehler berücksichtigen

BE → NOTENPUNKTE (ISB-Tabelle, 100 BE Basis):
100-96 → 15, 95-91 → 14, 90-86 → 13, 85-81 → 12, 80-76 → 11, 75-71 → 10
70-66 → 9, 65-61 → 8, 60-56 → 7, 55-51 → 6, 50-46 → 5, 45-41 → 4
40-34 → 3, 33-27 → 2, 26-20 → 1, 19-0 → 0

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${maxBE}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, gegliedert nach thematischen Blöcken und Teilaufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { model: "gpt-5.2", temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      // ISB-Tabelle: absolute BE-Grenzen bei 100 BE Basis
      const table = [[96, 15], [91, 14], [86, 13], [81, 12], [76, 11], [71, 10], [66, 9], [61, 8], [56, 7], [51, 6], [46, 5], [41, 4], [34, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (gesamtBE >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= SPORT ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturSport(request, env) {
  const { aufgaben } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Sport-Oberstufenschüler am bayerischen Gymnasium (Leistungsfach Sport, eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für die gewählte Aufgabe im ISB-Format.

Die Aufgabe ist in thematische Blöcke gegliedert (1, 2, 3, 4) mit Teilaufgaben (1.1, 1.2, 2.1, 2.2 usw.).
Block-Einleitungen (mit 0 BE) geben den Kontext – beantworte nur die eigentlichen Teilaufgaben.
Materialien heißen "Abb. 1", "Abb. 2", "Blogauszug – Teil 1" etc.

WICHTIG:
- Verwende korrekte sportwissenschaftliche Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- Beziehe dich konkret auf die Materialien (Abb., Blogauszüge, Tabellen)
- Einheiten korrekt: HF in min⁻¹, VO₂max in ml/min/kg, Laktat in mmol/l
- Formatiere als Markdown mit klaren Überschriften nach thematischen Blöcken:
  ## Aufgabe: [Titel]
  ### Block 1: [Thema]
  #### Teilaufgabe 1.1 (X BE)
  ...
  #### Teilaufgabe 1.2 (X BE)
  ...
  ### Block 2: [Thema]
  ...
- Am Ende: Zusammenfassung der BE und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABE:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000, { model: "gpt-5.2", temperature: 0.4 });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= INFORMATIK ABITUR: GENERATE ================= */
async function handleGenerateAbiturInformatik(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 30 : 22;
  const gesamtBE = isEA ? 120 : 88;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Informatik-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Informatik-Abiturprüfung.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

SACHGEBIETE (wähle 4 verschiedene, Lehrplan G9 Bayern Informatik ab 2026):
1. Rekursion & Listen (Inf12 LB1): Lineare und verzweigte Rekursion, Abbruchbedingung, rekursive Datenstrukturen. Verkettete Liste (einfach/doppelt verkettet), Einfügen, Löschen, Durchlaufen, Suchen. Stapel (Stack) und Warteschlange (Queue), LIFO/FIFO-Prinzip. Kompositum-Entwurfsmuster. Laufzeitbetrachtung O(n).
2. Binärbäume (Inf12 LB2): Geordneter Binärbaum (Suchbaum), Einfügen, Suchen, Löschen (mit Nachfolger). Traversierung: Preorder, Inorder, Postorder. Laufzeitanalyse O(log n) vs. O(n). Darstellung als Knoten-Kanten-Diagramm. Anwendungen: Huffman-Codierung, Entscheidungsbäume.
3. Nebenläufigkeit (Inf12 LB3): Prozesse und Threads, parallele Ausführung. Kritischer Abschnitt, Race Condition. Synchronisation: Semaphor, Monitor, Mutex. Deadlock (Bedingungen, Vermeidung, Erkennung). Erzeuger-Verbraucher-Problem. Petri-Netze (Stellen, Transitionen, Marken, Schaltregeln).
4. Formale Sprachen & Automaten (Inf13 LB1): Endliche Automaten (DEA/NEA), Zustandsdiagramm, Zustandstabelle. Reguläre Ausdrücke und reguläre Sprachen. Grammatiken (Typ 2/3), Ableitungsbaum. Kellerautomat (PDA). Chomsky-Hierarchie. Zusammenhang Automaten-Grammatiken-Sprachen.
5. Rechnerarchitektur (Inf13 LB2): Von-Neumann-Architektur, Befehlszyklus (Fetch-Decode-Execute). Maschinensprache, Assembler (Befehlssatz, Register). Speicherhierarchie (Register, Cache, RAM, Festplatte). Zahlendarstellung (Zweierkomplement, Gleitkomma IEEE 754). Logische Schaltungen (AND, OR, NOT, XOR), Addierer, Multiplexer.
6. Berechenbarkeit (Inf13 LB3): Turingmaschine (Definition, Arbeitsweise, Übergangstabelle). Berechenbare und nicht-berechenbare Funktionen, Halteproblem. Churchsche These. Komplexitätsklassen P und NP, NP-Vollständigkeit. Entscheidbarkeit.
7. Künstliche Intelligenz (Inf13 LB4): Maschinelles Lernen (überwacht/unüberwacht), Trainings-/Testdaten. Entscheidungsbaum, k-Nearest-Neighbors. Neuronale Netze (Perzeptron, Schichten, Aktivierungsfunktion). Bias und Fairness in KI-Systemen. Ethische Aspekte von KI.
8. Informationssicherheit (Inf13 LB5): Symmetrische Verschlüsselung (AES, One-Time-Pad). Asymmetrische Verschlüsselung (RSA-Prinzip, Public/Private Key). Digitale Signatur, Zertifikate. Hashfunktionen (Einwegeigenschaft, Kollisionsresistenz). Authentifizierung (Passwort, 2FA, biometrisch). Datenschutz (DSGVO, Grundprinzipien).

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Verwaltung einer Bibliothek")
- Ein Sachgebiet
- Material (M1, M2, ...): Pseudocode, UML-Diagramme, Tabellen, Textbeschreibungen, Zustandsdiagramme
- 4-6 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE in den Aufgabenstellungen
- Gesamt: ${beProAufgabe} BE

WICHTIG:
- Pseudocode in Markdown-Codeblöcken (\`\`\`pseudocode ... \`\`\`)
- UML/Zustandsdiagramme als ASCII-Art oder textuelle Beschreibung
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen praxisnah sein (z.B. Schulverwaltung, App, Netzwerk, Datenbank)
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für gA. Weniger mathematische Tiefe, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Aufgaben.` : ""}

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "text": Vollständige Textbeschreibung einer Situation/eines Systems (150-300 Wörter) oder Code-Listing
- "statistik" + "chart_type":"bar": Markdown-Tabelle mit Daten (mind. 4-6 Zeilen)
- "diagramm" + "chart_type":"line": Markdown-Tabelle mit x/y-Werten (mind. 5-8 Werte)
- "bild": Imagen-Prompt auf ENGLISCH (3-5 Sätze) für UML/Zustandsdiagramm, Beschriftungen auf DEUTSCH
- Erstelle pro Aufgabengruppe IMMER mindestens 1 Material vom Typ "bild" (z.B. UML-Klassendiagramm, Zustandsdiagramm, ER-Diagramm, Netzwerkdiagramm, Architekturschaubild, Flussdiagramm o.Ä.)
  REGELN für "bild": (1) Alle Texte/Beschriftungen IM BILD auf DEUTSCH, in Anführungszeichen mit Positionsangabe (2) Layout, Farben, Stil detailliert beschreiben (3) KEINE Personen!
  VERBOTEN: Diagramme/Bilder als Textbeschreibung oder ASCII-Art einfügen — IMMER type "bild" mit englischem Imagen-Prompt verwenden!

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Pseudocode, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 2-3 Materialien verschiedener Typen (davon mindestens 1x "bild").

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Titel der Aufgabe",
      "sachgebiet": "sachgebiet_key",
      "material": [
        {"id": "M1", "titel": "Materialtitel", "type": "text", "text": "Vollständiger Materialtext..."},
        {"id": "M2", "titel": "Diagramm: ...", "type": "bild", "text": "Englischer Imagen-Prompt, Beschriftungen auf Deutsch"}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Aufgabentext", "be": 4}
      ],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien!
Jede Aufgabengruppe MUSS mindestens 1 Material vom Typ "bild" enthalten!
Erstelle 4 Aufgabengruppen mit verschiedenen Sachgebieten.`;

  const userPrompt = `Erstelle eine vollständige Informatik-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit praxisnahem Kontext, Material und steigendem Anforderungsniveau.
Pseudocode in Codeblöcken. KEIN LaTeX nötig.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= INFORMATIK ABITUR: GRADE ================= */
async function handleGradeAbiturInformatik(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 30 : 22;
  const maxBE = 3 * beProAufgabe;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine Informatik-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, korrekter Algorithmus/Pseudocode, logische Argumentation, Vollständigkeit
- Ansatz korrekt aber Folgefehler → Teilpunkte
- Pseudocode/Code muss nicht compilierbar sein, aber logisch korrekt

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const messages = [
    { role: "system", content: rubricPrompt + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: `AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000);

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= INFORMATIK ABITUR: MODEL ANSWER ================= */
async function handleModelAnswerAbiturInformatik(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Informatik-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Pseudocode in Markdown-Codeblöcken
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- Verwende korrekte Fachsprache (Datenstrukturen, Algorithmen, Automatentheorie)
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABEN:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= OPENAI CALL ================= */
async function callOpenAI(env, messages, maxTokens = 4000, { model = "gpt-5.2", temperature = 0.7, jsonMode = false } = {}) {
  const t0 = Date.now();
  let phase = "fetch";
  try {
    const reqBody = {
      model,
      messages,
      temperature,
      max_completion_tokens: maxTokens
    };
    if (jsonMode) reqBody.response_format = { type: "json_object" };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(reqBody)
    });
    phase = "json";
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || JSON.stringify(data).substring(0, 200);
      throw new Error("OpenAI(" + response.status + "): " + detail);
    }
    phase = "done";
    const content = data.choices[0].message.content;
    const finishReason = data.choices[0].finish_reason;
    if (finishReason === "length") {
      console.warn(`[callOpenAI] Antwort abgeschnitten (finish_reason=length, model=${model}, tokens=${maxTokens})`);
    }
    return content;
  } catch (err) {
    const elapsed = Date.now() - t0;
    throw new Error(`[${phase} ${elapsed}ms ${model}] ${err.message || err}`);
  }
}

/* ================= FOS ENDPOINTS (alle Fächer) ================= */

// FOS-Lehrplan-Konfigurationen
const FOS_SUBJECTS = {
  bwr: {
    name: "Betriebswirtschaftslehre mit Rechnungswesen (BwR)",
    shortName: "BwR",
    fachbereiche: {
      rechnungswesen: {
        label: "Rechnungswesen",
        themen: "FOS 11 LB1-3: Finanzbuchhaltung (Bestands-/Erfolgskonten, Buchungssätze, Umsatzsteuer), Bilanz und GuV, Abschreibungen (linear/degressiv/leistungsbezogen), Rückstellungen, Rechnungsabgrenzung. FOS 11 LB4-5: Kosten-/Leistungsrechnung (Vollkostenrechnung, Zuschlagskalkulation, BAB), Deckungsbeitragsrechnung"
      },
      investition: {
        label: "Investition & Finanzierung",
        themen: "FOS 12 LB1-2: Investitionsrechnung (Kostenvergleichsrechnung, Gewinnvergleichsrechnung, Amortisationsrechnung, Kapitalwertmethode), Finanzierungsarten (Eigen-/Fremdfinanzierung, Innen-/Außenfinanzierung), Kreditarten, Leasing, Factoring"
      },
      jahresabschluss: {
        label: "Jahresabschluss & Bilanzanalyse",
        themen: "FOS 12 LB3-4: Jahresabschluss (Bilanz, GuV, Anhang), Bilanzpolitik, Bilanzanalyse (Anlageintensität, Eigenkapitalquote, Liquiditätsgrade I-III, Verschuldungsgrad), Rentabilitäten (Eigenkapital-/Gesamtkapital-/Umsatzrentabilität), Cashflow"
      },
      controlling: {
        label: "Controlling & Kostenmanagement",
        themen: "FOS 13 LB1-4: Plankostenrechnung (starre/flexible Plankostenrechnung, Beschäftigungsabweichung, Verbrauchsabweichung), Controlling (operativ/strategisch, Balanced Scorecard, Kennzahlensysteme), Target Costing, Prozesskostenrechnung, Qualitätsmanagement"
      }
    }
  },
  vwl: {
    name: "Volkswirtschaftslehre (VWL)",
    shortName: "VWL",
    fachbereiche: {
      grundlagen: {
        label: "Grundlagen der Volkswirtschaft",
        themen: "FOS 11 LB1-3: Bedürfnisse und Güter, Ökonomisches Prinzip, Produktionsfaktoren, Markt und Preisbildung (Angebot/Nachfrage, Gleichgewichtspreis, Elastizitäten), Wirtschaftsordnungen (Marktwirtschaft/Planwirtschaft/Soziale Marktwirtschaft), Wettbewerbspolitik"
      },
      geldpolitik: {
        label: "Geld, Währung & Konjunktur",
        themen: "FOS 12 LB1-4: Geld und Geldschöpfung, Europäische Zentralbank (Aufgaben, Instrumente: Leitzins, Mindestreserve, Offenmarktgeschäfte), Inflation/Deflation, Konjunkturzyklus und -indikatoren, BIP (Berechnung, Kritik), Wirtschaftspolitik (Fiskalpolitik, Geldpolitik), Arbeitsmarktpolitik"
      },
      international: {
        label: "Internationale Wirtschaft & Nachhaltigkeit",
        themen: "FOS 13 LB1-6: Außenhandel (komparative Kostenvorteile, Freihandel/Protektionismus), EU-Wirtschaftspolitik (Binnenmarkt, Währungsunion, Stabilitätspakt), Globalisierung (Chancen/Risiken, multinationale Unternehmen), Nachhaltigkeit (Nachhaltigkeitsdreieck, SDGs), Verteilungsgerechtigkeit, Entwicklungspolitik"
      }
    }
  },
  deutsch: {
    name: "Deutsch",
    shortName: "Deutsch",
    fachbereiche: {
      textanalyse: {
        label: "Textanalyse & Interpretation",
        themen: "FOS 11-13: Analyse pragmatischer Texte (Kommentar, Essay, Rede, Interview), Interpretation literarischer Texte (Lyrik, Epik, Drama), Texterschließung (Inhalt, Aufbau, Sprache, Intention), Epochen der deutschen Literatur (Aufklärung bis Gegenwart)"
      },
      eroerterung: {
        label: "Erörterung & Stellungnahme",
        themen: "FOS 11-13: Textgebundene Erörterung (Analyse + eigene Stellungnahme), Freie Erörterung (dialektisch/linear), Argumentationsstrategien, Schlüssigkeit der Argumentation, Materialbezug"
      },
      materialgestuetzt: {
        label: "Materialgestütztes Schreiben",
        themen: "FOS 13: Materialgestütztes Verfassen informierender/argumentierender Texte, Auswertung und Verknüpfung verschiedener Materialien (Texte, Statistiken, Grafiken), Adressaten- und Textsortenorientierung (Kommentar, Rede, Leserbrief, Bericht)"
      },
      literatur: {
        label: "Literaturgeschichte",
        themen: "FOS 11: Literatur des 20./21. Jahrhunderts (Kurzprosa, Jugendliteratur). FOS 12: Literatur des 19./20./21. Jahrhunderts (Epochen: Romantik, Realismus, Expressionismus, Neue Sachlichkeit, Nachkriegsliteratur). FOS 13: Literatur von der Aufklärung bis zur Gegenwart (Sturm und Drang, Klassik, Romantik, Realismus, Moderne)"
      }
    }
  },
  recht: {
    name: "Rechtslehre",
    shortName: "Rechtslehre",
    fachbereiche: {
      privatrecht: {
        label: "Privatrecht / BGB",
        themen: "FOS 11 LB1-3: Rechtssubjekte und Rechtsobjekte, Rechts- und Geschäftsfähigkeit, Willenserklärung (Anfechtbarkeit, Nichtigkeit), Zustandekommen von Verträgen, Vertragsfreiheit und ihre Grenzen, AGB-Recht, Formvorschriften"
      },
      schuldrecht: {
        label: "Schuldrecht & Sachenrecht",
        themen: "FOS 12 LB1-4: Kaufvertrag (Rechte/Pflichten, Mangelfreiheit, Gewährleistung: Nacherfüllung/Rücktritt/Minderung/Schadensersatz), Leistungsstörungen (Unmöglichkeit, Verzug, Schlechtleistung), Sachenrecht (Eigentum/Besitz, Eigentumsübertragung, gutgläubiger Erwerb), Verbraucherschutz (Widerrufsrecht, Fernabsatz)"
      },
      arbeitsrecht: {
        label: "Arbeits- & Wirtschaftsrecht",
        themen: "FOS 13 LB1-4: Arbeitsvertrag (Rechte/Pflichten, Kündigung, Kündigungsschutz), Tarifrecht (Tarifautonomie, Tarifvertrag, Arbeitskampf), Betriebsverfassungsrecht (Betriebsrat, Mitbestimmung), Handelsrecht (Kaufmannseigenschaft, Handelsregister), Gesellschaftsrecht (OHG, KG, GmbH, AG), Insolvenzrecht"
      }
    }
  },
  ibs: {
    name: "International Business Studies (IBV)",
    shortName: "IBV",
    fachbereiche: {
      international_trade: {
        label: "International Trade & Commerce",
        themen: "FOS 11-12: International trade theories (absolute/comparative advantage), INCOTERMS, international payment methods (letter of credit, documentary collection), currency and exchange rates, international logistics and supply chain management"
      },
      marketing: {
        label: "International Marketing & Management",
        themen: "FOS 12-13: International marketing strategies (standardization vs. adaptation), market entry strategies (export, licensing, joint venture, FDI), cross-cultural management (Hofstede, Trompenaars), international human resource management, corporate social responsibility"
      },
      economics: {
        label: "International Economics & EU",
        themen: "FOS 13: European Union (single market, EMU, EU institutions), globalization (opportunities/risks, multinational corporations), trade policy (free trade vs. protectionism, WTO), international financial markets, development economics, sustainability in international business"
      }
    }
  }
};

async function handleFOSRoute(pathname, request, env) {
  const body = await request.json();
  const fakeReq = { json: async () => body };
  const route = pathname.substring(9); // "/api/fos-" entfernen

  // === ENGLISCH (delegiert an bestehende generische Handler) ===
  if (route === "generate-englisch") return handleGenerate(fakeReq, env);
  if (route === "grade-englisch") return handleGrade(fakeReq, env);
  if (route === "model-answer-englisch") return handleModelAnswer(fakeReq, env);
  if (route === "parse-task-englisch") return handleParseTask(fakeReq, env);

  // === MATHE (FOS-spezifische Lehrplaninhalte) ===
  if (route === "generate-mathe") return handleFOSGenerateMathe(body, env);
  if (route === "grade-mathe") return handleGradeMathe(fakeReq, env);
  if (route === "model-answer-mathe") return handleModelAnswerMathe(fakeReq, env);
  if (route === "parse-task-mathe") return handleParseTaskMathe(fakeReq, env);

  // === MATHE ABITUR (FOS-Fachabitur) ===
  if (route === "generate-abitur-mathe") return handleFOSGenerateAbiturMathe(body, env);
  if (route === "grade-abitur-mathe") return handleGradeAbiturMathe(fakeReq, env);
  if (route === "model-answer-abitur-mathe") return handleModelAnswerAbiturMathe(fakeReq, env);

  // === TEXT-FÄCHER (BWR, VWL, Deutsch, Recht, IBV) ===
  const textMatch = route.match(/^(generate|grade|model-answer|parse-task)-(.+)$/);
  if (textMatch) {
    const [, action, subject] = textMatch;
    const config = FOS_SUBJECTS[subject];
    if (config) {
      if (action === "generate") return handleFOSTextGenerate(config, body, env);
      if (action === "grade") return handleGradeWR(fakeReq, env);
      if (action === "model-answer") return handleModelAnswerWR(fakeReq, env);
      if (action === "parse-task") return handleParseTaskWR(fakeReq, env);
    }
  }

  return jsonResponse({ error: "Unbekannte FOS-Route: " + pathname }, 404, env);
}

/* ================= FOS MATHE: GENERATE ================= */
async function handleFOSGenerateMathe(body, env) {
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen.'
    : '';

  const sg = sachgebiet || "analysis";
  const totalBE = be || 25;
  const zeitMinuten = zeit || 45;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const minTeilaufgaben = Math.max(3, Math.ceil(totalBE / 6));
  const maxTeilaufgaben = Math.max(minTeilaufgaben, Math.ceil(totalBE / 3));

  const sgThemen = {
    analysis: {
      title: "Analysis",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 11: Ganzrationale Funktionen (Nullstellen, Symmetrie, Grenzverhalten), Differenzialrechnung (Ableitungsregeln, Potenz-/Summen-/Faktorregel), Tangente, Extremwerte, Monotonie, Wendepunkte
Jgst 12: Differenzialrechnung Vertiefung (Produkt-/Quotientenregel, verkettete Funktionen/Kettenregel), Exponentialfunktion und e-Funktion, Kurvendiskussion (e-Funktionen, Wachstums-/Abklingmodelle), Integralrechnung (Stammfunktion, bestimmtes Integral, Flächenberechnung)
Jgst 13: Gebrochen-rationale Funktionen (Definitionslücken, Asymptoten), ln-Funktion als Umkehrfunktion, komplexe Kurvendiskussion, partielle Integration, uneigentliche Integrale`,
      kontexte: `Wachstums-/Abklingmodelle (Bakterienkultur, Medikament, Bevölkerung), Produktionskosten/-gewinn, Temperaturverlauf, Wasserstand, Geschwindigkeit/Strecke, CO₂-Konzentration`
    },
    stochastik: {
      title: "Stochastik",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 11: Wahrscheinlichkeitsrechnung Grundlagen (Laplace, Baumdiagramm, Pfadregeln), bedingte Wahrscheinlichkeit, Vierfeldertafel, stochastische Unabhängigkeit
Jgst 12: Bernoulli-Ketten und Binomialverteilung, Erwartungswert und Standardabweichung, Sigma-Regeln, Hypothesentests (einseitiger Signifikanztest, Fehler 1. und 2. Art, Ablehnungsbereich)`,
      kontexte: `Qualitätskontrolle, Verkehrszählung, medizinische Tests, Wahlumfragen, Versicherungen, Glücksspiel, Schulveranstaltung`
    },
    geometrie: {
      title: "Geometrie",
      inhalte: `FOS-Lehrplan Bayern:
Jgst 13: Vektoren (Addition, skalare Multiplikation, Linearkombination), Skalarprodukt und Winkelberechnung, Vektorprodukt (Kreuzprodukt, Spatprodukt), Lineare Gleichungssysteme (Gauß-Verfahren), Geraden im Raum (Parameterform, Lagebeziehungen), Ebenen (Parameter-/Normalen-/Koordinatenform), Abstände (Punkt-Ebene, Punkt-Gerade, windschiefe Geraden)`,
      kontexte: `Dachkonstruktion, Sonnensegel, Brückenmodell, Rampe/Auffahrt, Aussichtsturm/Sichtlinie, Theaterkulisse`
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.analysis;

  // Verwende den gleichen Prompt-Aufbau wie Gymnasium-Mathe, aber mit FOS-Lehrplan
  const systemPrompt = `Du bist ein Experte für FOS-Mathematik (Bayern, Fachabitur).
Erstelle eine authentische Mathematik-Aufgabe für die Fachoberschule.

AUFGABE:
- Gesamt: EXAKT ${totalBE} BE — die Summe aller Teilaufgaben-BE MUSS EXAKT ${totalBE} ergeben!
- Bearbeitungszeit: ${zeitMinuten} Minuten
- Erstelle mindestens ${minTeilaufgaben} und höchstens ${maxTeilaufgaben} Teilaufgaben
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...), zusammen ' + totalBE + ' BE.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Hilfsmittel/CAS erlaubt
- KEINE LÖSUNGSHINWEISE in Klammern

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}
Sachkontext-Ideen: ${sgInfo.kontexte}

PFLICHT-REGELN:
- Jede Teilaufgabe MUSS einen klaren OPERATOR enthalten
- AFB I: "Berechnen Sie", "Bestimmen Sie", "Geben Sie an"
- AFB II: "Zeigen Sie, dass", "Ermitteln Sie", "Begründen Sie"
- AFB III: "Beurteilen Sie", "Formulieren Sie im Sachzusammenhang"
- Bei ≥15 BE: KONKRETER Sachkontext erforderlich
- LEHRPLAN-TREUE: NUR Inhalte aus dem FOS-Lehrplan!

LATEX-FORMATIERUNG:
- $\\cdot$ statt *, Dezimalkomma $3{,}6$, $\\frac{a}{b}$ statt a/b
- e-Funktion: $e^{-x}$, $e^{-0{,}5x}$ (NIEMALS $e^-x$ oder $\\exp(...)$)

GEOGEBRA (optional): type "graphing", Variable IMMER x, * für Multiplikation, exp(x) für e-Funktion

Antworte NUR mit validem JSON:
{"aufgabe": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 3}], "gesamt_be": ${totalBE}, "sachgebiet": "${sg}"}`;

  const userPrompt = `Erstelle eine FOS-Mathematik-Aufgabe (EXAKT ${totalBE} BE) im Sachgebiet ${sgInfo.title}.
${totalBE >= 15 ? 'Die Aufgabe MUSS in einen konkreten Sachkontext eingebettet sein.' : ''}
Jede Teilaufgabe braucht einen klaren Operator. Alle Formeln in LaTeX.`;

  const maxTokens = Math.max(6000, 3000 + aufgabenAnzahl * 2000 + totalBE * 80);
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], Math.min(maxTokens, 16000));

  const content = extractJSON(openaiRes);
  if (content.teilaufgaben && content.teilaufgaben.length > 0) {
    const beSum = content.teilaufgaben.reduce((sum, t) => sum + (parseInt(t.be) || 0), 0);
    if (beSum !== totalBE) content.gesamt_be = beSum;
  }
  if (!content.gesamt_be) content.gesamt_be = totalBE;
  return jsonResponse(content, 200, env);
}

/* ================= FOS MATHE ABITUR: GENERATE (FAP) ================= */
async function handleFOSGenerateAbiturMathe(body, env) {
  const systemPrompt = `Du bist ein Experte für die FOS-Fachabiturprüfung Mathematik (Bayern).
Erstelle eine VOLLSTÄNDIGE Fachabiturprüfung mit 100 BE.

PRÜFUNGSSTRUKTUR (FOS Bayern):

TEIL 1 (34 BE, 60 min, OHNE Hilfsmittel/Merkhilfe/CAS):
- Analysis (22 BE): 3-4 kompakte Aufgaben, ohne CAS lösbar, "schöne" Zahlen
- Stochastik (12 BE): 2 kompakte Aufgaben, ohne CAS lösbar

TEIL 2 (66 BE, 120 min, MIT Hilfsmittel/Merkhilfe/CAS):
- Analysis (43 BE): 2 große mehrteilige Aufgaben mit Sachkontext
- Stochastik (23 BE): 1 große mehrteilige Aufgabe mit durchgängigem Sachkontext

WICHTIG: KEINE Geometrie im Fachabitur! Verhältnis Analysis:Stochastik = 65:35

FOS-LEHRPLAN:
Analysis: Ganzrationale Funktionen (Nullstellen, Symmetrie), Differenzialrechnung (Potenz-/Summen-/Faktor-/Produkt-/Quotienten-/Kettenregel), Exponentialfunktion, e-Funktion, Kurvendiskussion, Integralrechnung, gebrochen-rationale Funktionen, ln-Funktion, partielle Integration
Stochastik: Wahrscheinlichkeitsrechnung (Baumdiagramm, Pfadregeln), bedingte Wahrscheinlichkeit, Vierfeldertafel, Bernoulli-Ketten, Binomialverteilung, Erwartungswert, Sigma-Regeln, Hypothesentests (Signifikanztest, Fehler 1./2. Art)

PFLICHT-REGELN:
- JEDE Teilaufgabe MUSS einen klaren OPERATOR haben
- Teil 1 MUSS ohne CAS lösbar sein
- Kontrollwerte bei wichtigen Zwischenergebnissen angeben
- LaTeX-Notation: $\\cdot$ statt *, $e^{-x}$ mit geschweiften Klammern, $\\frac{a}{b}$, Dezimalkomma $3{,}6$

Antworte NUR mit validem JSON:
{
  "teil_a_pflicht": [
    {"id": "A1", "sachgebiet": "Analysis", "be": 7, "text": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 3}]}
  ],
  "teil_a_wahl": [],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 22, "text": "...", "teilaufgaben": [{"id": "a)", "text": "...", "be": 4}]}
  ]
}
Hinweis: teil_a_pflicht = Teil 1 (ohne Hilfsmittel), teil_b = Teil 2 (mit Hilfsmitteln). teil_a_wahl bleibt leer (kein Wahlteil bei FOS).`;

  const userPrompt = `Erstelle eine vollständige FOS-Fachabiturprüfung Mathematik (100 BE).
Teil 1 (34 BE): Analysis 22 BE + Stochastik 12 BE, ohne CAS
Teil 2 (66 BE): Analysis 43 BE + Stochastik 23 BE, mit CAS
KEINE Geometrie! Jede Teilaufgabe braucht einen klaren Operator.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= FOS TEXT-FÄCHER: GENERISCHER GENERATE ================= */
async function handleFOSTextGenerate(config, body, env) {
  const { niveau, fachbereich, sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ')
    : '';

  const gesamtBE = be || 60;
  const zeitMinuten = zeit || 135;
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  // Fachbereich-Inhalte zusammenstellen
  const fbKey = sachgebiet || fachbereich || Object.keys(config.fachbereiche)[0];
  let fbLabel, fbThemen;
  if (config.fachbereiche[fbKey]) {
    fbLabel = config.fachbereiche[fbKey].label;
    fbThemen = config.fachbereiche[fbKey].themen;
  } else {
    fbLabel = config.shortName;
    fbThemen = Object.values(config.fachbereiche).map(f => f.themen).join("\n\n");
  }

  const systemPrompt = `Du bist ein Experte für das Fach ${config.name} an der bayerischen Fachoberschule (FOS).
Erstelle eine authentische Klausuraufgabe.

PRÜFUNGSFORMAT:
- Fach: ${config.name} (FOS Bayern)
- Gesamt: ${gesamtBE} BE (Bewertungseinheiten), Bearbeitungszeit: ${zeitMinuten} Minuten
- 2-3 Aufgabenblöcke
- 3-4 Materialien (Texte, Tabellen, Gesetzestexte, Statistiken)
- Schwerpunkt: ${fbLabel}${schwerpunktZusatz}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgabenblöcke` : ''}

LEHRPLAN-INHALTE (FOS Bayern):
${fbThemen}

AUFGABENSTRUKTUR:
- 2-4 Teilaufgaben pro Block mit steigendem Anforderungsniveau
- AFB I (20%): beschreiben, nennen, darstellen, zusammenfassen
- AFB II (40%): erläutern, analysieren, vergleichen, berechnen
- AFB III (40%): beurteilen, erörtern, Stellung nehmen
- KEINE LÖSUNGSHINWEISE in Klammern
- LEHRPLAN-TREUE: NUR FOS-Lehrplan-Inhalte verwenden!

MATERIALIEN:
- Textmaterialien: 300-600 Wörter pro Material
- Tabellen/Statistiken: Markdown-Tabelle mit plausiblen Zahlen
- 1 Material vom Typ "bild" (KI-generiert)

Antworte NUR mit validem JSON:
{
  "task_instruction": "Einleitender Situationstext",
  "aufgabenbloecke": [{"nr": 1, "titel": "...", "teilaufgaben": [{"nr": "1.1", "text": "...", "be": 5, "afb": "I"}], "be_gesamt": 15}],
  "materialien": [{"nr": "M1", "titel": "...", "typ": "text", "inhalt": "...", "quelle": "..."}],
  "gesamt_be": ${gesamtBE},
  "fachbereich": "${fbLabel}",
  "thema": "Konkretes Thema"
}`;

  const userPrompt = `Erstelle eine ${config.shortName}-Klausuraufgabe (FOS Bayern):
- Schwerpunkt: ${fbLabel}
- Gesamt-BE: ${gesamtBE}
- Erstelle 3-4 Materialien (Texte 300-600 Wörter, Tabellen, 1 Bild).
Jedes Textmaterial MUSS ausführlich sein (300-600 Wörter).`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= HELPERS ================= */
// Repariert Steuerzeichen die durch fehlendes JSON-Escaping von LaTeX entstehen
// \b (0x08) → \\b (z.B. \begin, \binom, \beta, \bar)
// \f (0x0C) → \\f (z.B. \frac, \forall)
function fixLatexControlChars(obj) {
  if (typeof obj === "string") {
    return obj.replace(/\x08/g, "\\b").replace(/\x0C/g, "\\f");
  }
  if (Array.isArray(obj)) return obj.map(fixLatexControlChars);
  if (obj && typeof obj === "object") {
    const fixed = {};
    for (const k of Object.keys(obj)) fixed[k] = fixLatexControlChars(obj[k]);
    return fixed;
  }
  return obj;
}

function extractJSON(text) {
  if (!text || typeof text !== "string") throw new Error("Model did not return valid JSON (empty response).");

  let clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try { return fixLatexControlChars(JSON.parse(clean)); } catch { }

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { return fixLatexControlChars(JSON.parse(match[0])); } catch { }

    let repaired = match[0];
    repaired = repaired.replace(/:\s*"([\s\S]*?)"\s*([,\}])/g, (m, val, end) => {
      const fixed = val.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      return ': "' + fixed + '"' + end;
    });
    try { return fixLatexControlChars(JSON.parse(repaired)); } catch { }
  }

  // Abgeschnittenes JSON reparieren: fehlende Klammern ergänzen
  const jsonStart = clean.indexOf("{");
  if (jsonStart !== -1) {
    let truncated = clean.substring(jsonStart);
    // Abgeschnittenen String-Wert schließen
    const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) truncated += '"';
    // Fehlende Klammern zählen und ergänzen
    let braces = 0, brackets = 0;
    let inString = false;
    for (let i = 0; i < truncated.length; i++) {
      const c = truncated[i];
      if (c === '"' && (i === 0 || truncated[i - 1] !== '\\')) { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') braces++;
      else if (c === '}') braces--;
      else if (c === '[') brackets++;
      else if (c === ']') brackets--;
    }
    // Trailing comma entfernen
    truncated = truncated.replace(/,\s*$/, "");
    for (let i = 0; i < brackets; i++) truncated += "]";
    for (let i = 0; i < braces; i++) truncated += "}";
    try { return fixLatexControlChars(JSON.parse(truncated)); } catch { }
  }

  throw new Error("Model did not return valid JSON.");
}

