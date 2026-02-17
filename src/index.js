/* ================= AUTH & RATE LIMITING ================= */
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 Stunden
const rateLimitMap = new Map();
const loginRateLimitMap = new Map();

/* ---- Token-System (HMAC-SHA256) ---- */
async function generateToken(env) {
  const payload = JSON.stringify({
    iat: Date.now(),
    nonce: crypto.randomUUID()
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.ACCESS_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload) + "." + sigHex;
}

async function verifyToken(token, env) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [dataB64, sigHex] = parts;
    const data = atob(dataB64);
    const payload = JSON.parse(data);

    if (Date.now() - payload.iat > TOKEN_EXPIRY) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.ACCESS_PASSWORD),
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
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500);
  }
  if (!token || !(await verifyToken(token, env))) {
    return jsonResponse({ error: "Nicht autorisiert." }, 401);
  }
  return null;
}

/* ---- Rate Limiting ---- */
function checkRateLimit(request, map, max) {
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
    return jsonResponse({ error: "Zu viele Anfragen. Bitte warte eine Minute." }, 429);
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
function corsHeaders(env) {
  const origin = env?.ALLOWED_ORIGIN || "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function jsonResponse(data, status = 200, env = null) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) });
}

/* ---- Input-Validierung ---- */
function checkBodySize(request) {
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return jsonResponse({ error: "Anfrage zu groß." }, 413);
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

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    try {
      // Body-Größe prüfen
      const sizeError = checkBodySize(request);
      if (sizeError) return sizeError;

      // ===== LOGIN ENDPOINT (Rate-Limited) =====
      if (pathname === "/api/login" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleLogin(request, env);
      }
      if (pathname === "/api/check-student" && request.method === "POST") {
        const loginLimit = checkRateLimit(request, loginRateLimitMap, MAX_LOGIN_ATTEMPTS);
        if (loginLimit) return loginLimit;
        cleanupRateLimitMaps();
        return await handleCheckStudent(request, env);
      }

      // ===== DASHBOARD ENDPOINTS (Lehrer-Passwort) =====
      if (pathname === "/api/results" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleGetResults(request, env);
      }
      if (pathname === "/api/delete-result" && request.method === "POST") {
        const rl = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW);
        if (rl) return rl;
        cleanupRateLimitMaps();
        return await handleDeleteResult(request, env);
      }

      // ===== AUTH CHECK für /api/ Endpoints =====
      if (pathname.startsWith("/api/")) {
        const authError = await checkAuth(request, env);
        if (authError) return authError;
        const rateLimitError = checkRateLimit(request, rateLimitMap, MAX_REQUESTS_PER_WINDOW);
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

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      return jsonResponse({ error: err.message || "Interner Fehler." }, 500, env);
    }
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
  if (!personal_password || typeof personal_password !== "string" || personal_password.length < 4) {
    return jsonResponse({ success: false, error: "Passwort muss mindestens 4 Zeichen haben." }, 400, env);
  }

  // Load registered students
  let students = [];
  try {
    const raw = await env.RESULTS_KV.get("registered_students");
    if (raw) students = JSON.parse(raw);
  } catch {}

  const nameLower = student_name.trim().toLowerCase();
  const existingIdx = students.findIndex(s => (s.name || "").trim().toLowerCase() === nameLower);

  if (mode === "register") {
    // Registration requires class password
    if (!password || typeof password !== "string") {
      return jsonResponse({ success: false, error: "Klassenpasswort erforderlich." }, 400, env);
    }
    const validClass = await safeCompare(password, env.ACCESS_PASSWORD);
    if (!validClass) {
      return jsonResponse({ success: false, error: "Falsches Klassenpasswort." }, 401, env);
    }
    if (existingIdx >= 0) {
      return jsonResponse({ success: false, error: "Dieser Name ist bereits vergeben. Bitte füge eine Zahl an (z.B. Max M. 2)." }, 409, env);
    }

    // Hash personal password with PBKDF2
    const salt = crypto.randomUUID();
    const hash = await hashPassword(personal_password, salt);

    students.push({
      name: student_name.trim(),
      level: level || "",
      salt: salt,
      hash: hash,
      date: new Date().toISOString()
    });
    await env.RESULTS_KV.put("registered_students", JSON.stringify(students));
  } else {
    // Login: verify personal password
    if (existingIdx < 0) {
      return jsonResponse({ success: false, error: "Name nicht gefunden. Bitte zuerst registrieren." }, 404, env);
    }

    const student = students[existingIdx];
    if (!student.hash || !student.salt) {
      // Legacy student (registered before password feature) — migrate: set their password now
      const salt = crypto.randomUUID();
      const hash = await hashPassword(personal_password, salt);
      students[existingIdx].salt = salt;
      students[existingIdx].hash = hash;
      await env.RESULTS_KV.put("registered_students", JSON.stringify(students));
    } else {
      const match = await verifyPassword(personal_password, student.salt, student.hash);
      if (!match) {
        return jsonResponse({ success: false, error: "Falsches Passwort." }, 401, env);
      }
    }
  }

  const token = await generateToken(env);
  return jsonResponse({ success: true, token }, 200, env);
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
IMPORTANT: Return ONLY valid JSON. No markdown fences.`
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
      fehlende_aspekte: parsed.fehlende_aspekte || []
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
      fehlende_aspekte: []
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 2000, temperature: 0.1 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("OCR-Verarbeitung fehlgeschlagen.");
  return jsonResponse({ text: data?.choices?.[0]?.message?.content || "" }, 200, env);
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 4000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 6000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GESCHICHTE: GENERATE ================= */
async function handleGenerateGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, level } = body;

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "Revolution 1848/49, Deutsches Kaiserreich, Industrialisierung und soziale Frage, Gesellschaftliche Modernisierung, Frauenbewegung, Erster Weltkrieg, Weimarer Republik" + (level === "eA" ? ", Französische Revolution, Aufklärung" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "Endphase der Weimarer Republik, Aufbau des NS-Staates, Verfolgung und Holocaust, Widerstand gegen den NS, DDR und SED-Diktatur, Friedliche Revolution 1989, Wiedervereinigung, Aufarbeitung der SED-Diktatur"
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "Nahostkonflikt und israelisch-palästinensische Beziehungen, Kalter Krieg und Blockkonfrontation, USA als Weltmacht, Chinas Transformation und Aufstieg, UNO und Weltordnung, Dekolonisation"
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen und Identifikationsmuster in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "Attische Demokratie, Aufklärung und Menschenrechte, Nationalismus und Nationsvorstellungen im 19. Jahrhundert, Deutsch-französische Beziehungen, Deutsch-polnische Beziehungen, Europäische Integration"
    }
  };

  const selectedSchwerpunkt = schwerpunkt === "random"
    ? Object.keys(schwerpunkte)[Math.floor(Math.random() * 4)]
    : schwerpunkt;
  const sp = schwerpunkte[selectedSchwerpunkt];

  const niveauText = level === "eA"
    ? "Erhöhtes Anforderungsniveau (eA), 120 BE gesamt. Komplexere Quellen, höherer Anteil AFB III, tiefere multiperspektivische Analyse."
    : "Grundlegendes Anforderungsniveau (gA), 100 BE gesamt. Schwerpunkt auf AFB I und II, zugänglicherer Quellenzugang.";

  const systemPrompt = `Du bist ein Experte für das bayerische Geschichte-Abitur (ab 2026, G9). Erstelle eine authentische Abituraufgabe exakt nach dem Format der offiziellen IQB-Beispielaufgaben.

SCHWERPUNKT: ${sp.titel} ${sp.zeitraum}
MÖGLICHE THEMEN: ${sp.themen}
ANFORDERUNGSNIVEAU: ${niveauText}

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
- Die Hauptquelle M 1 ist IMMER ein Textdokument
- Optional kannst du 0-2 ergänzende Materialien (M 2, M 3) als Array "zusatz_materialien" hinzufügen: Schaubilder, Infografiken, Statistiken
  - type "bild": content = detaillierte Bildbeschreibung für KI-Generierung (z.B. Infografik, Schaubild, Plakat, Diagramm — KEINE Karikaturen oder Personen!), title = Bildtitel
  - type "statistik": content = Markdown-Tabelle, title = Titel

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung: Einleitung + nummerierte Teilaufgaben (1, 2) mit BE-Angaben",
  "primary_text": "Die historische Textquelle M 1 (400-800 Wörter) MIT Quelleneinleitung (kursiv, vor dem eigentlichen Text, erklärt wer/was/wann)",
  "primary_meta": "Quellenangabe: Autor, Titel/Textsorte, Datum, Publikationsort",
  "zusatz_materialien": [
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung", "source": ""}
  ],
  "thema": "Konkretes Thema der Aufgabe",
  "schwerpunkt": "${selectedSchwerpunkt.replace('_', '/')}"
}`;

  const userPrompt = `Erstelle eine materialgebundene Abituraufgabe für das Fach Geschichte (Bayern, G9, ab 2026).

Schwerpunkt: ${sp.titel} ${sp.zeitraum}
Anforderungsniveau: ${level || "gA"}

KRITISCH:
- Die Textquelle M 1 MUSS mindestens 500-800 Wörter lang sein! Schreibe eine substanzielle, zusammenhängende historische Quelle mit MEHR Informationen als strikt nötig — Schüler müssen die relevanten Inhalte herausarbeiten.
- Verwende eine REALE historische Persönlichkeit als Autor der Quelle.
- Die Teilaufgaben müssen nummeriert sein (1, 2) mit BE-Angaben in Klammern.
- Orientiere dich exakt am Format der offiziellen bayerischen Beispielabitur-Aufgaben.
- Erstelle IMMER 1-2 ergänzende Materialien (zusatz_materialien): z.B. ein Schaubild, eine Infografik oder ein Plakat (type "bild"). KEINE Karikaturen oder Darstellungen von Personen!`;

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
  const { type, gattung, epoche, schreibauftrag, thema, textsorte, typ, aufgabentyp } = body;

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

Nutze bekannte Werke wie: Goethe (Faust, Werther, Gedichte), Schiller (Die Räuber, Kabale und Liebe), Kleist, Büchner (Woyzeck), Fontane, Kafka, Rilke, Trakl, Brecht, Eichendorff, Droste-Hülshoff, etc.`;

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
    systemPrompt = `Du erstellst Erörterungsaufgaben für das Deutsch-Abitur Bayern (ab 2026).

WICHTIG - TEXTLÄNGE WIE IM ECHTEN ABITUR:
- Der Ausgangstext muss 1000-1500 Wörter lang sein (ca. 2-3 Druckseiten)
- Das ist ein vollständiger journalistischer Meinungstext mit klarer These und Argumentation
- Der Text vertritt eine deutliche Position zu einem kontroversen Thema
- Typische Quellen: Zeitungskommentare, Kolumnen, Essays, Reden (FAZ, Die Zeit, SZ, Spiegel)

Die Aufgabenstellung hat ZWEI Teile:
- Teil a) (40%): Analyse der zentralen Aussage und Argumentationsstruktur des Textes
- Teil b) (60%): Erörterung der im Text vertretenen Position (eigene Stellungnahme mit Argumenten und Beispielen)

Antworte NUR mit validem JSON:
{
  "task_instruction": "Zweiteilige Aufgabenstellung: a) Analyse der Argumentation, b) Erörterung der Position",
  "primary_text": "Der vollständige Ausgangstext mit klarer Position (1000-1500 Wörter!)",
  "primary_meta": "Autor, Quelle, Erscheinungsdatum",
  "thema": "Themenbereich"
}`;
    userPrompt = `Erstelle eine Erörterungsaufgabe:
- Thema: ${thema === "random" ? "frei wählbar (aktuell, kontrovers, gesellschaftlich relevant)" : truncate(thema, 200)}
- Typ: ${truncate(typ, 100)}

KRITISCH: Der Ausgangstext MUSS 1000-1500 Wörter lang sein! Ein vollständiger Meinungsartikel mit These, Argumenten, Belegen und Schlussfolgerung. Keine Kurzfassung!`;

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
- Erstelle IMMER 1-2 Materialien vom Typ "bild" (KI-generiertes Schaubild/Infografik/Illustration):
  - type "bild": content = detaillierte Bildbeschreibung für KI-Generierung (z.B. Infografik, Schaubild, Plakat, Diagramm — KEINE Karikaturen oder Personen!), title = Bildtitel

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Präzise Aufgabenstellung mit Textsorte, Adressat, Anlass und konkretem Schreibauftrag",
  "zieltext": "Geforderte Textsorte",
  "zielgruppe": "Adressaten",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Inhalt (300-600 Wörter)", "source": "Autor, Quelle, Jahr"},
    {"title": "Titel der Statistik", "type": "statistik", "content": "| Kategorie | Wert |\\n|---|---|\\n| ... | ... |\\nBeschreibung der Statistik.", "source": "Institut/Studie, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung", "source": ""}
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
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], maxTokens);

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  if (zieltext) contextInfo += `Geforderter Zieltext: ${truncate(zieltext, 200)}\n`;
  if (zielgruppe) contextInfo += `Zielgruppe: ${truncate(zielgruppe, 200)}\n`;

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  const name = student_name.trim().toLowerCase();
  const filtered = results
    .filter(r => (r.student_name || "").trim().toLowerCase() === name)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return jsonResponse({ results: filtered }, 200, env);
}

/* ================= IMAGE GENERATION: DALL-E ================= */
async function handleGenerateImage(request, env) {
  const { prompt } = await request.json();
  if (!prompt) {
    return jsonResponse({ error: "prompt erforderlich." }, 400, env);
  }

  // Extract short search keywords from the prompt via GPT
  let keywords = prompt;
  try {
    const kwRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Extrahiere 2-4 englische Suchbegriffe für ein Stockfoto zu folgendem Thema. Nur die Begriffe, kommagetrennt, keine Erklärung.\n\nThema: ${prompt}` }],
        max_tokens: 30,
        temperature: 0.3
      })
    });
    const kwData = await kwRes.json();
    keywords = kwData.choices?.[0]?.message?.content?.trim() || prompt;
  } catch {}

  try {
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keywords)}&orientation=landscape`,
      { headers: { "Authorization": `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
    );
    const data = await response.json();
    if (data.errors) {
      return jsonResponse({ error: data.errors[0] || "Unsplash Fehler" }, 500, env);
    }

    // Generate a short German caption
    let caption = "";
    try {
      const captionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: `Schreibe eine kurze, sachliche deutsche Bildunterschrift (max. 15 Wörter) für ein Foto zum Thema. Nur die Bildunterschrift, kein "Abb." Präfix, keine Anführungszeichen.\n\nThema: ${prompt}` }],
          max_tokens: 60,
          temperature: 0.3
        })
      });
      const captionData = await captionRes.json();
      caption = captionData.choices?.[0]?.message?.content?.trim() || "";
    } catch {}

    return jsonResponse({
      url: data.urls.regular,
      credit: `${data.user.name} / Unsplash`,
      caption
    }, 200, env);
  } catch (e) {
    return jsonResponse({ error: "Foto laden fehlgeschlagen: " + e.message }, 500, env);
  }
}

/* ================= IMAGE FETCH: UNSPLASH ================= */
async function handleFetchUnsplash(request, env) {
  const { keywords } = await request.json();
  if (!keywords) {
    return jsonResponse({ error: "keywords erforderlich." }, 400, env);
  }
  try {
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keywords)}&orientation=landscape`,
      { headers: { "Authorization": `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
    );
    const data = await response.json();
    if (data.errors) {
      return jsonResponse({ error: data.errors[0] || "Unsplash Fehler" }, 500, env);
    }
    return jsonResponse({
      url: data.urls.regular,
      credit: `${data.user.name} / Unsplash`
    }, 200, env);
  } catch (e) {
    return jsonResponse({ error: "Foto laden fehlgeschlagen: " + e.message }, 500, env);
  }
}

/* ================= DASHBOARD: SUBMIT RESULT ================= */
async function handleSubmitResult(request, env) {
  const { student_name, course, type, topic, content, language, total, date } = await request.json();

  if (!student_name || typeof student_name !== "string" || total == null) {
    return jsonResponse({ error: "student_name and total required" }, 400, env);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  results.push({
    id: Date.now().toString(36) + crypto.randomUUID().slice(0, 8),
    student_name: truncate(student_name, 100),
    course: truncate(course || "", 20),
    type: truncate(type || "mediation", 50),
    topic: truncate(topic || "—", 500),
    content: content ?? null,
    language: language ?? null,
    total,
    date: date || new Date().toISOString()
  });

  await env.RESULTS_KV.put("all_results", JSON.stringify(results));
  return jsonResponse({ success: true, count: results.length }, 200, env);
}

/* ================= DASHBOARD: GET RESULTS ================= */
async function handleGetResults(request, env) {
  const { teacher_password } = await request.json();
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!teacher_password || !(await safeCompare(teacher_password, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401, env);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  return jsonResponse({ results }, 200, env);
}

/* ================= DASHBOARD: DELETE RESULT ================= */
async function handleDeleteResult(request, env) {
  const { teacher_password, result_id } = await request.json();
  if (!env.TEACHER_PASSWORD) {
    return jsonResponse({ error: "Server nicht konfiguriert." }, 500, env);
  }
  if (!teacher_password || !(await safeCompare(teacher_password, env.TEACHER_PASSWORD))) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401, env);
  }

  if (!result_id || typeof result_id !== "string") {
    return jsonResponse({ error: "result_id required" }, 400, env);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  results = results.filter(r => r.id !== result_id);
  await env.RESULTS_KV.put("all_results", JSON.stringify(results));
  return jsonResponse({ success: true, count: results.length }, 200, env);
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 6000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= POLITIK UND GESELLSCHAFT: GENERATE ================= */
async function handleGeneratePuG(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const bearbeitungszeit = isEA ? "270 Minuten" : "210 Minuten";
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";

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

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Reproduktion (Anforderungsebene I) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Reorganisation und Transfer (Ebene II) – z.B. "Ermitteln Sie aus M1 …", "Arbeiten Sie … heraus!"
- Letzte Teilaufgabe: Reflexion und Problemlösung (Ebene III) – z.B. "Beurteilen Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, nennen, ermitteln, erarbeiten, erläutern, analysieren, vergleichen, begründen, beurteilen, bewerten, diskutieren, Stellung nehmen
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Erstelle 2-3 realistische Materialien (Texte, Statistiken, Bilder)
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche Quellentexte (Zeitungsartikel, Interviews, Reden, Fachtexte). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (KI-generiertes Schaubild/Infografik/Illustration):
  - type "bild": content = detaillierte Bildbeschreibung für KI-Generierung (z.B. Infografik, Schaubild, Plakat, Diagramm), title = Bildtitel. KEINE politischen Karikaturen oder Personen!

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag, Leserbrief, digitale Pinnwand)
- Das macht die Aufgabe authentischer und prüft Adressatenorientierung

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (200-500 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Titel ggf. Statistik", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung für KI-Generierung", "source": ""}
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
Summe der BE für Prüfungsteil A: ${bePruefungA}.`;

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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
  const { halbjahr, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
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
  - type "bild": content = detaillierte Bildbeschreibung für KI-Generierung (z.B. Infografik, Schaubild, Plakat, Diagramm — KEINE Karikaturen oder Personen!), title = Bildtitel

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag)

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
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung für KI-Generierung", "source": ""}
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

KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein! Vollständige Quellentexte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER mindestens 1 Bild als Material.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  contextInfo += `=== PRÜFUNGSTEIL B (Ausweitung) ===\nAufgabenstellung:\n${truncate(task_instruction_b, 3000)}\n\n`;

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Vollständiger Schülertext Teil A mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "korrektur_text_b": Vollständiger Schülertext Teil B mit gleichen Fehlermarkierungen.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
      fehlende_aspekte: parsed.fehlende_aspekte || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: []
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
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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
  const { niveau, fachbereich, thema } = body;

  const isGA = (niveau || "gA").toLowerCase() === "ga";
  const niveauLabel = isGA ? "grundlegendes Anforderungsniveau (gA)" : "erhöhtes Anforderungsniveau (eA)";
  const gesamtBE = isGA ? 100 : 60;
  const bloecke = isGA ? "2-3 Aufgabenblöcke (integriert: BWL+VWL+Recht)" : "2-3 Aufgabenblöcke";
  const materialCount = isGA ? "4-5 Materialien" : "3-4 Materialien";

  const fachbereiche = {
    bwl: {
      label: "Betriebswirtschaftslehre",
      themen: {
        unternehmensziele: "Unternehmensziele und Zielkonflikte",
        swot: "SWOT-Analyse und strategische Planung",
        investition: "Investitionsrechnung (statisch und dynamisch)",
        finanzierung: "Finanzierung (Eigen-/Fremdfinanzierung, Leasing)",
        bilanz: "Bilanzkennzahlen und Jahresabschlussanalyse",
        organisation: "Organisationsstruktur und Unternehmensführung",
        marketing: "Marketing-Mix und Marktanalyse",
        rechtsformen: "Rechtsformen von Unternehmen"
      }
    },
    vwl: {
      label: "Volkswirtschaftslehre",
      themen: {
        konjunktur: "Konjunktur und Konjunkturpolitik",
        geldpolitik: "Geldpolitik der EZB",
        tarifpolitik: "Tarifpolitik und Arbeitsmarkt",
        wirtschaftspolitik: "Wirtschaftspolitik (Angebots-/Nachfrageorientiert)",
        spieltheorie: "Spieltheorie und Marktverhalten",
        aussenhandel: "Außenhandel und Globalisierung",
        preisbildung: "Preisbildung auf verschiedenen Märkten",
        soziale_marktwirtschaft: "Soziale Marktwirtschaft"
      }
    },
    recht: {
      label: "Recht",
      themen: {
        vertragsrecht: "Vertragsrecht (Zustandekommen, Anfechtung, Nichtigkeit)",
        kaufrecht: "Kaufrecht und Gewährleistung",
        schuldrecht: "Schuldrecht (Leistungsstörungen)",
        sachenrecht: "Sachenrecht (Eigentum, Besitz)",
        deliktsrecht: "Deliktsrecht (§ 823 BGB)",
        arbeitsrecht: "Arbeitsrecht (Kündigung, Arbeitsvertrag)",
        handelsrecht: "Handelsrecht und Gesellschaftsrecht"
      }
    }
  };

  let fbLabel, fbThemen;
  if (isGA) {
    fbLabel = "Integriert (BWL + VWL + Recht)";
    fbThemen = "Integrierte Aufgabe über alle drei Fachbereiche";
  } else {
    const fb = fachbereiche[fachbereich] || fachbereiche.bwl;
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
- Gesamt: ${gesamtBE} BE (Bewertungseinheiten)
- ${bloecke}
- ${materialCount}
- Fachbereich: ${fbLabel}

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen, zusammenfassen (ca. 20% der BE)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40% der BE)
- AFB III (Reflexion/Problemlösung): beurteilen, erörtern, Stellung nehmen, entwickeln (ca. 40% der BE)
- Jede Teilaufgabe hat eine konkrete BE-Angabe
- Operatoren müssen korrekt und eindeutig verwendet werden

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
    {"nr": "M3", "titel": "Schaubild: ...", "typ": "bild", "inhalt": "Detaillierte Bildbeschreibung für KI-Generierung", "quelle": ""}
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
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER mindestens 1 Bild als Material.`;

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

  const messages = [
    { role: "system", content: rubricPrompt },
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
      fehlende_aspekte: parsed.fehlende_aspekte || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      bewertung_bloecke: [],
      feedback: openaiRes,
      korrektur_text: "",
      fehlende_aspekte: []
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

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 8000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GESCHICHTE ABITUR: GENERATE (Teil A + B) ================= */
async function handleGenerateAbiturGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "Revolution 1848/49, Deutsches Kaiserreich, Industrialisierung und soziale Frage, Gesellschaftliche Modernisierung, Frauenbewegung, Erster Weltkrieg, Weimarer Republik" + (level === "eA" ? ", Französische Revolution, Aufklärung" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "Endphase der Weimarer Republik, Aufbau des NS-Staates, Verfolgung und Holocaust, Widerstand gegen den NS, DDR und SED-Diktatur, Friedliche Revolution 1989, Wiedervereinigung"
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "Nahostkonflikt, Kalter Krieg, USA als Weltmacht, Chinas Aufstieg, UNO und Weltordnung, Dekolonisation"
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "Attische Demokratie, Aufklärung und Menschenrechte, Nationalismus im 19. Jh., Deutsch-französische Beziehungen, Europäische Integration"
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
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung", "source": ""}
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

KRITISCH:
- Die Textquelle M 1 MUSS mindestens 500-800 Wörter lang sein! Die Quelle soll MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte herausarbeiten.
- Verwende eine REALE historische Persönlichkeit als Autor
- Teil A: 3 Teilaufgaben mit steigendem AFB
- Teil B: Eigenständige Darstellungsaufgabe, ggf. mit Transfer zu ${transferSP.replace("_", "/")}
- Erstelle IMMER 1-2 ergänzende Materialien (zusatz_materialien): z.B. ein Schaubild, eine Infografik oder ein historisches Plakat (type "bild"). KEINE Karikaturen oder Darstellungen von Personen!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

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

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Vollständiger Schülertext Teil A mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "korrektur_text_b": Vollständiger Schülertext Teil B mit gleichen Fehlermarkierungen.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
      fehlende_aspekte: parsed.fehlende_aspekte || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { sach_a: null, sach_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: []
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
  const { niveau, fachbereich_1, fachbereich_2 } = body;

  const isEA = (niveau || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";

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

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen (ca. 20%)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40%)
- AFB III (Reflexion): beurteilen, erörtern, Stellung nehmen (ca. 40%)
- Jede Teilaufgabe hat eine konkrete BE-Angabe

MATERIALIEN:
- Typen: Zeitungsartikel, Tabellen/Statistiken, Bilanzen, Gesetzestexte, Fallbeispiele
- Textmaterialien: MINDESTENS 300-600 Wörter pro Material! Vollständige, ausführliche Texte — NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte herausarbeiten müssen.
- Tabellen: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Gesetzestexte: Korrekte §-Angaben (150-300 Wörter)
- Erstelle IMMER zusätzlich 1 Material vom typ "bild" (KI-generiertes Schaubild/Illustration) pro Aufgabe:
  - typ "bild": inhalt = detaillierte Bildbeschreibung, titel = Bildtitel

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_1": "Situationstext / Rahmenhandlung Aufgabe 1",
  "aufgabenbloecke_1": [{"nr":1,"titel":"...","teilaufgaben":[{"nr":"1.1","text":"...","be":5,"afb":"I"}],"be_gesamt":15}],
  "materialien_1": [{"nr":"M1","titel":"...","typ":"text","inhalt":"Ausführlicher Text (300-600 Wörter!)","quelle":"..."},{"nr":"M2","titel":"Schaubild: ...","typ":"bild","inhalt":"Bildbeschreibung","quelle":""}],
  "task_instruction_2": "Situationstext / Rahmenhandlung Aufgabe 2",
  "aufgabenbloecke_2": [{"nr":1,"titel":"...","teilaufgaben":[{"nr":"1.1","text":"...","be":5,"afb":"II"}],"be_gesamt":15}],
  "materialien_2": [{"nr":"M1","titel":"...","typ":"text","inhalt":"Ausführlicher Text (300-600 Wörter!)","quelle":"..."},{"nr":"M2","titel":"Schaubild: ...","typ":"bild","inhalt":"Detaillierte Bildbeschreibung","quelle":""}],
  "gesamt_be": ${isEA ? 120 : 100},
  "fachbereich_1": "${isEA ? (fachbereich_1 || "bwl") : "integriert"}",
  "fachbereich_2": "${isEA ? (fachbereich_2 || "vwl") : "transfer"}",
  "thema_1": "Konkretes Thema Aufgabe 1",
  "thema_2": "Konkretes Thema Aufgabe 2"
}`;

  const userPrompt = `Erstelle eine vollständige WR-Abiturprüfung (2 Aufgaben):
- Niveau: ${niveauLabel}
${isEA
  ? `- Aufgabe 1: ${fbLabels[fachbereich_1] || "BWL"} (60 BE)
- Aufgabe 2: ${fbLabels[fachbereich_2] || "VWL"} (60 BE)`
  : `- Aufgabe 1: Integriert BWL+VWL+Recht (75 BE)
- Aufgabe 2: Transferaufgabe ohne Materialien (25 BE)`}

Beide Aufgaben müssen eigenständig und thematisch verschieden sein.
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle IMMER pro Aufgabe mindestens 1 Bild als Material.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

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

  const messages = [
    { role: "system", content: rubricPrompt },
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
      fehlende_aspekte: parsed.fehlende_aspekte || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_1: null, be_max_1: be1Max, be_2: null, be_max_2: be2Max, be_gesamt: null, be_max_gesamt: maxBE, notenpunkte: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: []
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

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 4000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 4000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 6000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ETHIK: GENERATE ================= */
async function handleGenerateEthik(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const bePruefungA = isEA ? "85 BE" : "75 BE";

  const lbThemen = {
    "12_1": {
      title: "Theorie und Praxis des Handelns",
      lernbereiche: "LB 12.1 (Theorie und Praxis des Handelns)",
      inhalte: `- Handlungsbegriff: Willensfreiheit, Intentionalität, Verantwortung
- Pflichtethik (Kant): Kategorischer Imperativ, Maximen, guter Wille, Pflicht vs. Neigung, Autonomie
- Utilitarismus (Bentham, Mill): Nützlichkeitsprinzip, hedonistisches Kalkül, Handlungs- und Regelutilitarismus
- Tugendethik (Aristoteles): Eudaimonia, Mesotes-Lehre, Tugenden als Charakterhaltungen, praktische Klugheit (Phronesis)
- Verantwortungsethik (Jonas): Prinzip Verantwortung, Heuristik der Furcht, Nachhaltigkeit
- Angewandte Ethik: Medizinethik, Technikethik, Wirtschaftsethik, Tierethik
- Moralische Dilemmata und Fallanalysen
- Verhältnis von Moral, Recht und Sitte`,
      schwerpunkte: {
        kant: "Kants Pflichtethik und der Kategorische Imperativ",
        utilitarismus: "Utilitarismus (Bentham/Mill) und Nützlichkeitsprinzip",
        tugend: "Aristoteles' Tugendethik und Eudaimonia",
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
        ? `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens, Differenzprinzip), Nozick (Libertarismus), Höffe
- Naturrecht und Rechtspositivismus: Radbruchsche Formel
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Vergeltung, Prävention, Resozialisierung
- Politische Ethik: Legitimation von Herrschaft, Gemeinwohl
- Vertragstheorien: Hobbes (Leviathan), Locke, Rousseau
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

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Geben Sie … wieder!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Analysieren Sie …", "Vergleichen Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …"
- Verwende die offiziellen Operatoren: wiedergeben, darstellen, beschreiben, erläutern, analysieren, vergleichen, herausarbeiten, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Erstelle 2-3 realistische Materialien (philosophische Texte, literarische Auszüge, Statistiken)
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche philosophische Quellentexte (Essays, Fachtexte, Zeitungsartikel zu ethischen Themen, Auszüge aus philosophischen Werken). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle IMMER zusätzlich 1 Material vom Typ "bild" (Illustration/Schaubild):
  - type "bild": content = detaillierte Bildbeschreibung für KI-Generierung (z.B. Gedankenexperiment-Illustration, Schaubild, Diagramm). KEINE Personen!

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}

SITUIERUNG:
- Bette die Aufgabe in einen philosophisch relevanten Kontext ein (z.B. ethische Debatte, philosophisches Gedankenexperiment, aktuelles gesellschaftliches Problem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum philosophischen Transfer

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Detaillierte Bildbeschreibung für KI-Generierung", "source": ""}
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
Summe der BE für Prüfungsteil A: ${bePruefungA}.`;

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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
  const { lernbereich, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
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

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Ethik (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 2-3 Materialien (philosophische Texte 400-800 Wörter, Statistiken, 1 Bild)
- Verwende offizielle Operatoren: wiedergeben, darstellen, erläutern, analysieren, vergleichen, erörtern, beurteilen, Stellung nehmen
- Situiere die Aufgabe in einem philosophisch relevanten Kontext

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die den Lernbereich erweitern oder vertiefen
- Bezug zu einem ANDEREN philosophischen Ansatz oder einer aktuellen ethischen Debatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "Titel", "type": "text", "content": "Philosophischer Quelltext (400-800 Wörter)", "source": "Autor, Werk, Jahr"},
      {"title": "Statistik: ...", "type": "statistik", "content": "| ... |", "source": "Institut, Jahr"},
      {"title": "Schaubild: ...", "type": "bild", "content": "Bildbeschreibung für KI-Generierung", "source": ""}
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
Teil B soll eine thematische Vertiefung oder Erweiterung darstellen.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}.`;

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
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 6000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GEOGRAPHIE: GENERATE ================= */
async function handleGenerateGeographie(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const bePruefungA = isEA ? "85 BE" : "75 BE";

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `- Subpolare und Polare Zone: Klima, Vegetation, Permafrost
- Vegetationszonen der Erde und ihre klimatischen Bedingungen
- Gletscherdynamik: Akkumulation, Ablation, Gletscherrückzug im Klimawandel
- Naturgefahren: Vulkanismus, Erdbeben, Überschwemmungen, Lawinen
- Bodentypen und Bodenbildungsprozesse (Podsol, Schwarzerde, Laterit)
- Klimaklassifikationen (Köppen, Neef) und Klimadiagramme
- Geomorphologische Prozesse: Verwitterung, Erosion, Sedimentation
- Plattentektonik und endogene Kräfte`,
      schwerpunkte: {
        klima: "Klimazonen und Vegetationszonen der Erde",
        permafrost: "Permafrost und Auswirkungen des Klimawandels",
        gletscher: "Gletscherdynamik und glaziale Prozesse",
        naturgefahren: "Naturgefahren: Vulkanismus, Erdbeben, Überschwemmungen",
        boden: "Bodentypen und Bodenbildungsprozesse"
      }
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `- Ressource Fläche: Flächennutzung, Flächenverbrauch, Flächenkonkurrenz
- Wasser als Ressource: Wasserverfügbarkeit, Wasserkonflikte, virtuelles Wasser
- Gebirgsregionen: Alpen als Lebens-, Wirtschafts- und Erholungsraum
- Landwirtschaft: konventionell vs. ökologisch, Agrarstrukturwandel, Welternährung
- Erneuerbare Energien: Standortfaktoren, Energiewende, Raumwirksamkeit
- Tourismus: Massentourismus, nachhaltiger Tourismus, Overtourism, Tragfähigkeit
- Flächennutzungskonflikte: Siedlung vs. Landwirtschaft vs. Naturschutz
- Rohstoffe und Ressourcenmanagement`,
      schwerpunkte: {
        flaeche: "Ressource Fläche und Flächennutzungskonflikte",
        wasser: "Wasser als Ressource und Wasserkonflikte",
        landwirtschaft: "Landwirtschaft und Welternährung",
        energie: "Erneuerbare Energien und Energiewende",
        tourismus: "Tourismus: Nachhaltigkeit und Tragfähigkeit"
      }
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `- Entwicklungsländer: Merkmale, Indikatoren (HDI, Gini-Koeffizient, BNE)
- Globalisierung: Global Players, Welthandel, Standortverlagerung, Wertschöpfungsketten
- Fragmentierende Entwicklung (Fred Scholz): Globale Orte vs. abgehängte Räume
- Nachhaltigkeit: Drei-Säulen-Modell, SDGs, Nachhaltigkeitsstrategien
- Megacities: Urbanisierung in Entwicklungsländern, informelle Siedlungen, Primatstadt
- Tropischer Regenwald: Ökosystem, Abholzung, Nutzungskonflikte, Shifting Cultivation
- Desertifikation: Ursachen, Sahelzone, Gegenmaßnahmen
- Entwicklungstheorien: Modernisierungstheorie, Dependenztheorie`,
      schwerpunkte: {
        entwicklung: "Entwicklungsländer und Entwicklungsindikatoren (HDI, Gini)",
        globalisierung: "Globalisierung und fragmentierende Entwicklung",
        nachhaltigkeit: "Nachhaltigkeit und SDGs",
        megacities: "Megacities und Urbanisierung in Entwicklungsländern",
        regenwald: "Tropischer Regenwald: Ökosystem und Nutzungskonflikte",
        desertifikation: "Desertifikation: Ursachen und Gegenmaßnahmen"
      }
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `- Stadtentwicklung: historische Stadttypen (europäische Stadt, US-amerikanische Stadt, orientalische Stadt)
- Migration: Binnenmigration, internationale Migration, Push-Pull-Modell, Integration
- Bevölkerungsentwicklung: demographischer Übergang, Altersstruktur, Bevölkerungspyramiden
- Smart Cities: Digitalisierung, nachhaltige Stadtplanung, Mobilität der Zukunft
- Gentrifizierung: Ursachen, Phasen, soziale Folgen, Verdrängungsprozesse
- Suburbanisierung: Stadtflucht, Zersiedlung, Pendlerströme, Reurbanisierung
- Klimawandel in Städten: Hitzeinsel-Effekt, Stadtklima, Anpassungsstrategien
- Segregation: soziale, ethnische und demographische Entmischung`,
      schwerpunkte: {
        stadtentwicklung: "Stadtentwicklung und historische Stadttypen",
        migration: "Migration und Bevölkerungsentwicklung",
        smart_cities: "Smart Cities und nachhaltige Stadtplanung",
        gentrifizierung: "Gentrifizierung und soziale Folgen",
        suburbanisierung: "Suburbanisierung und Reurbanisierung",
        segregation: "Segregation und sozialräumliche Ungleichheit"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Beschreiben Sie …!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Erklären Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Bewerten Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Erstelle 3-5 realistische Materialien (geographische Texte, Statistiken, Karten, Klimadiagramme, Fotos)
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
- Optional: Erstelle 1 Material vom Typ "foto" (Unsplash-Foto):
  - type "foto": content = englische Suchbegriffe für Unsplash (z.B. "glacier landscape arctic", "tropical rainforest aerial")

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}

SITUIERUNG:
- Bette die Aufgabe in einen geographisch relevanten Kontext ein (z.B. konkreter Raumbeispiel, aktuelle Umweltdebatte, Nachhaltigkeitsproblem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum räumlichen Transfer

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Karte: Region X", "type": "karte", "content": {"lat": 48.1, "lon": 11.5, "zoom": 7, "label": "Süddeutschland"}, "source": "OpenStreetMap"},
    {"title": "Klimadiagramm: Ort X", "type": "klimadiagramm", "content": {"station": "München", "hoehe": 519, "temp": [-1.5,0.2,4.1,8.2,12.8,16.1,18.0,17.4,13.5,8.4,3.2,-0.3], "niederschlag": [48,44,58,62,90,115,126,110,75,56,52,50]}, "source": "DWD Klimadaten"},
    {"title": "Foto: ...", "type": "foto", "content": "glacier landscape arctic", "source": ""}
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
Summe der BE für Prüfungsteil A: ${bePruefungA}.`;

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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
  const { halbjahr, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `- Subpolare und Polare Zone: Klima, Vegetation, Permafrost
- Vegetationszonen der Erde und ihre klimatischen Bedingungen
- Gletscherdynamik: Akkumulation, Ablation, Gletscherrückzug
- Naturgefahren: Vulkanismus, Erdbeben, Überschwemmungen, Lawinen
- Bodentypen und Bodenbildungsprozesse
- Klimaklassifikationen und Klimadiagramme
- Geomorphologische Prozesse: Verwitterung, Erosion, Sedimentation`
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `- Ressource Fläche: Flächennutzung, Flächenverbrauch, Flächenkonkurrenz
- Wasser als Ressource: Wasserverfügbarkeit, Wasserkonflikte, virtuelles Wasser
- Gebirgsregionen: Alpen als Lebens- und Wirtschaftsraum
- Landwirtschaft: konventionell vs. ökologisch, Agrarstrukturwandel
- Erneuerbare Energien: Standortfaktoren, Energiewende
- Tourismus: Massentourismus, nachhaltiger Tourismus, Tragfähigkeit
- Flächennutzungskonflikte: Siedlung vs. Landwirtschaft vs. Naturschutz`
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `- Entwicklungsländer: Merkmale, Indikatoren (HDI, Gini-Koeffizient, BNE)
- Globalisierung: Global Players, Welthandel, Wertschöpfungsketten
- Fragmentierende Entwicklung (Fred Scholz): Globale Orte vs. abgehängte Räume
- Nachhaltigkeit: Drei-Säulen-Modell, SDGs
- Megacities: Urbanisierung in Entwicklungsländern, informelle Siedlungen
- Tropischer Regenwald: Ökosystem, Abholzung, Nutzungskonflikte
- Desertifikation: Ursachen, Sahelzone, Gegenmaßnahmen`
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `- Stadtentwicklung: europäische Stadt, US-amerikanische Stadt, orientalische Stadt
- Migration: Binnenmigration, internationale Migration, Push-Pull-Modell
- Bevölkerungsentwicklung: demographischer Übergang, Altersstruktur
- Smart Cities: Digitalisierung, nachhaltige Stadtplanung
- Gentrifizierung: Ursachen, Phasen, soziale Folgen
- Suburbanisierung: Stadtflucht, Zersiedlung, Reurbanisierung
- Klimawandel in Städten: Hitzeinsel-Effekt, Anpassungsstrategien
- Segregation: soziale, ethnische und demographische Entmischung`
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 3-5 Materialien: geographische Texte (400-800 Wörter), Statistiken, Karten, Klimadiagramme, Fotos
- Verwende offizielle Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Situiere die Aufgabe in einem konkreten Raumbeispiel
- IMMER mindestens 1 Material vom Typ "karte" — content ist ein OBJEKT: {"lat": ..., "lon": ..., "zoom": ..., "label": "..."}
- Wenn thematisch passend: 1 Material vom Typ "klimadiagramm" — content ist ein OBJEKT: {"station": "...", "hoehe": ..., "temp": [12 Werte], "niederschlag": [12 Werte]}
- Optional: 1 Material vom Typ "foto" mit englischen Suchbegriffen für Unsplash

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel erfordern
- Bezug zu einem ANDEREN geographischen Raum oder einer aktuellen Umwelt-/Nachhaltigkeitsdebatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "Titel", "type": "text", "content": "Geographischer Quelltext (400-800 Wörter)", "source": "Autor, Quelle, Jahr"},
      {"title": "Statistik: ...", "type": "statistik", "content": "| ... |", "source": "Institut, Jahr"},
      {"title": "Karte: Region X", "type": "karte", "content": {"lat": 48.1, "lon": 11.5, "zoom": 7, "label": "Süddeutschland"}, "source": "OpenStreetMap"},
      {"title": "Klimadiagramm: Ort X", "type": "klimadiagramm", "content": {"station": "München", "hoehe": 519, "temp": [-1.5,0.2,4.1,8.2,12.8,16.1,18.0,17.4,13.5,8.4,3.2,-0.3], "niederschlag": [48,44,58,62,90,115,126,110,75,56,52,50]}, "source": "DWD Klimadaten"},
      {"title": "Foto: ...", "type": "foto", "content": "glacier landscape arctic", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (räumlicher Vergleich/Transfer) mit BE",
    "materials": []
  },
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}`;

  const userPrompt = `Erstelle eine vollständige Geographie-Abiturprüfung (Teil A + Teil B):
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

Erstelle 3-5 Materialien: 1 Text (400-800 Wörter), 1 Statistik, 1 Karte (mit Koordinaten-Objekt), und wenn passend 1 Klimadiagramm (mit Klimadaten-Objekt) oder 1 Foto.
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein. Bei "karte" und "klimadiagramm" ist content ein JSON-OBJEKT, KEIN String!
Teil B soll einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel darstellen.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}.`;

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
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i+1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
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

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 6000, temperature: 0.2 })
  });

  const data = await openaiRes.json();
  if (!openaiRes.ok) throw new Error("Aufgaben-Erkennung fehlgeschlagen.");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= LATEIN: GENERATE ================= */
async function handleGenerateLatein(request, env) {
  const body = await request.json();
  const { autor, aufgabentyp, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";

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
    const maxBE = isEA ? 60 : 45;

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Übersetzungsaufgabe auf ${niveauLabel}.

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

Thematischer Schwerpunkt: ${schwerpunktLabel}

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
    const beGesamt = isEA ? "60 BE" : "45 BE";

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Interpretationsaufgabe (Aufgabenteil) auf ${niveauLabel}.

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

LATEINISCHER TEXT:
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des Autors (80-120 Wörter)
- Der Text muss grammatisch korrektes klassisches Latein sein
- Erstelle eine genaue deutsche Übersetzung dazu

Thematischer Schwerpunkt: ${schwerpunktLabel}

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

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text": Gib den VOLLSTÄNDIGEN Schülertext zurück. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}. Liste pro Teilaufgabe die inhaltlichen Aspekte auf, die der Schüler nicht oder unzureichend behandelt hat.`;

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
  const { autor, schwerpunkt, level } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
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

Thematischer Schwerpunkt: ${schwerpunktLabel}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a": {
    "task_instruction": "Übersetzen Sie den folgenden lateinischen Text ins Deutsche.",
    "latin_text": "Der vollständige lateinische Übersetzungstext (${wortanzahlA})",
    "vokabelhilfen": [{"latein": "Wort", "deutsch": "Bedeutung"}, ...],
    "musteruebersetzung": "Die vollständige deutsche Musterübersetzung"
  },
  "teil_b": {
    "task_instruction": "Aufgabenteil – [Prosa/Dichtung]",
    "latin_text": "Der zweite lateinische Text (80-120 Wörter)",
    "deutsche_uebersetzung": "Die deutsche Übersetzung des zweiten Textes",
    "aufgaben": [
      {"abschnitt": "I", "titel": "Hinführende Aufgaben", "teilaufgaben": [{"nr": "1", "text": "...", "be": 4}, ...]},
      {"abschnitt": "II", "titel": "Interpretationsaufgabe", "teilaufgaben": [{"nr": "1", "text": "...", "be": ${isEA ? 26 : 21}}]},
      {"abschnitt": "III", "titel": "Weiterführende Aufgaben", "teilaufgaben": [{"nr": "1", "text": "...", "be": 6}, ...]}
    ]
  },
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema der Prüfung"
}`;

  const userPrompt = `Erstelle eine vollständige Latein-Abiturprüfung:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Teil A: Übersetzung (${beA}, ${wortanzahlA})
- Teil B: Aufgabenteil (${beB}) mit 3 Abschnitten

KRITISCH: Beide lateinischen Texte müssen AUTHENTISCH im Stil des Autors verfasst sein — grammatisch korrekt, mit typischen Stilmitteln.
Teil B Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben, von denen ${anzahlWeiterfuehrendWahl} zu bearbeiten sind.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

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

  const korrekturAnweisung = `\n\nZUSÄTZLICH im JSON-Output:
- "korrektur_text_a": Markierter Schülertext Teil A. Markiere Übersetzungsfehler mit <mark class='fehler-ue' title='Korrektur: RICHTIG (Fehlertyp: S/L/H)'>FALSCH</mark>.
- "korrektur_text_b": Markierter Schülertext Teil B. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>.
- "fehlende_aspekte": Array von Objekten mit {"aufgabe": "Teil/Aufgabe", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}.`;

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
      fehlende_aspekte: parsed.fehlende_aspekte || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: []
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
  const { sachgebiet, aufgabentyp } = body;

  const sg = sachgebiet || "analysis";
  const typ = aufgabentyp || "kurzaufgabe";
  const isKurz = typ === "kurzaufgabe";

  const sgThemen = {
    analysis: {
      title: "Analysis",
      inhalte: `- Funktionen: ganzrationale, e-Funktionen, ln-Funktionen, trigonometrische Funktionen
- Ableitungsregeln: Potenz-, Produkt-, Quotienten-, Kettenregel
- Kurvendiskussion: Nullstellen, Extrema, Wendepunkte, Monotonie, Krümmung
- Integralrechnung: Stammfunktionen, bestimmtes Integral, Flächenberechnung, Rotationsvolumen
- Grenzwerte und Stetigkeit
- Anwendungsaufgaben: Optimierung, Wachstum, Änderungsraten`
    },
    stochastik: {
      title: "Stochastik",
      inhalte: `- Wahrscheinlichkeitsrechnung: Baumdiagramme, Pfadregeln, bedingte Wahrscheinlichkeit
- Binomialverteilung: Bernoulli-Kette, Erwartungswert, Standardabweichung
- Normalverteilung als Näherung
- Hypothesentests: Signifikanztests, Fehler 1. und 2. Art
- Kombinatorik: Permutationen, Kombinationen
- Stochastische Unabhängigkeit, Vierfeldertafel`
    },
    geometrie: {
      title: "Geometrie",
      inhalte: `- Vektoren: Addition, Skalarprodukt, Kreuzprodukt, Betrag
- Geraden: Parameterform, Lagebeziehungen, Schnittpunkte
- Ebenen: Parameter-, Normalenform, Koordinatenform, Spurgeraden
- Abstände: Punkt-Ebene, Punkt-Gerade, windschiefe Geraden
- Winkel: zwischen Geraden, Ebenen, Gerade und Ebene
- Spiegelungen und Symmetrie`
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.analysis;

  const systemPrompt = `Du bist ein Experte für das bayerische Mathematik-Abitur (eA, G9, ab 2026).
Erstelle eine authentische Mathematik-Aufgabe.

${isKurz ? `KURZAUFGABE (Teil-A-Stil, ohne CAS/Hilfsmittel):
- 1 Aufgabe mit 2-3 Teilaufgaben
- Gesamt: 5 BE
- Schwierigkeit: ~10 Minuten Bearbeitungszeit
- OHNE CAS/Taschenrechner lösbar
- Klare, rechnerisch durchführbare Aufgaben` :
`LANGAUFGABE (Teil-B-Stil, mit CAS/Hilfsmitteln):
- 1 große Aufgabe mit 4-6 Teilaufgaben
- Gesamt: 20-30 BE
- Schwierigkeit: ~45 Minuten Bearbeitungszeit
- CAS/Hilfsmittel erlaubt
- Kontextbezogene Anwendungsaufgabe mit steigendem Anforderungsniveau`}

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Die Aufgabe muss mathematisch korrekt und eindeutig lösbar sein

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "Aufgabentext mit LaTeX-Formeln (Kontext/Einleitung)",
  "teilaufgaben": [
    {"id": "a)", "text": "Teilaufgabe mit $LaTeX$-Formeln", "be": 2},
    {"id": "b)", "text": "...", "be": 3}
  ],
  "gesamt_be": ${isKurz ? 5 : "20-30"},
  "sachgebiet": "${sg}",
  "aufgabentyp": "${typ}"
}`;

  const userPrompt = `Erstelle eine ${isKurz ? "Kurzaufgabe (5 BE, ohne CAS)" : "Langaufgabe (20-30 BE, mit CAS)"} im Sachgebiet ${sgInfo.title}.
Die Aufgabe soll abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATHEMATIK: GRADE ================= */
async function handleGradeMathe(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, aufgabentyp, student_text } = body;

  if (!student_text) {
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

  const rubricPrompt = `Du bewertest eine Mathematik-Klausur (Bayern, eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Ansatz, Rechnung/Lösungsweg, Ergebnis
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in Plain-Text-Mathe (z.B. f'(x) = 4x + 3, int_0^1 x^2 dx = 1/3). Interpretiere dies großzügig.
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für mathematische Ausdrücke.

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
    { role: "system", content: rubricPrompt },
    { role: "user", content: `${aufgabenInfo}\nSchülerlösung:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95,15],[90,14],[85,13],[80,12],[75,11],[70,10],[65,9],[60,8],[55,7],[50,6],[45,5],[40,4],[33,3],[27,2],[20,1],[0,0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || ""
    }, 200, env);
  } catch {
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: openaiRes
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
- Am Ende: Zusammenfassung der erreichten BE`;

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
        { type: "text", text: "Extrahiere die Mathematik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$). Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);
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
  - B1 (30 BE): Analysis — eine große mehrteilige Aufgabe (6-8 Teilaufgaben)
    Kontextbezogen (z.B. Modellierung, Optimierung), steigendes Niveau
  - B2 (20 BE): Stochastik — eine große mehrteilige Aufgabe (4-6 Teilaufgaben)
    Z.B. Binomialverteilung, Hypothesentest, bedingte Wahrscheinlichkeit
  - B3 (20 BE): Geometrie — eine große mehrteilige Aufgabe (4-6 Teilaufgaben)
    Z.B. Geraden/Ebenen im Raum, Abstände, Winkel, Anwendung

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen mathematisch korrekt und eindeutig lösbar sein
- Teil A muss OHNE CAS/Taschenrechner lösbar sein
- Teil B darf CAS voraussetzen

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a_pflicht": [
    {"id": "A1", "sachgebiet": "Analysis", "be": 5, "text": "Aufgabentext", "teilaufgaben": [{"id": "a)", "text": "...", "be": 2}, {"id": "b)", "text": "...", "be": 3}]},
    {"id": "A2", "sachgebiet": "Analysis", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A3", "sachgebiet": "Stochastik", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A4", "sachgebiet": "Geometrie", "be": 5, "text": "...", "teilaufgaben": [...]}
  ],
  "teil_a_wahl": [
    {"id": "A5", "sachgebiet": "Analysis", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A6", "sachgebiet": "Analysis", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A7", "sachgebiet": "Stochastik", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A8", "sachgebiet": "Stochastik", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A9", "sachgebiet": "Geometrie", "be": 5, "text": "...", "teilaufgaben": [...]},
    {"id": "A10", "sachgebiet": "Geometrie", "be": 5, "text": "...", "teilaufgaben": [...]}
  ],
  "teil_b": [
    {"id": "B1", "sachgebiet": "Analysis", "be": 30, "text": "Kontextbeschreibung", "teilaufgaben": [{"id": "a)", "text": "...", "be": 4}, ...]},
    {"id": "B2", "sachgebiet": "Stochastik", "be": 20, "text": "...", "teilaufgaben": [...]},
    {"id": "B3", "sachgebiet": "Geometrie", "be": 20, "text": "...", "teilaufgaben": [...]}
  ]
}`;

  const userPrompt = `Erstelle eine vollständige Mathematik-Abiturprüfung (eA, 100 BE).
Teil A: 4 Pflichtaufgaben + 6 Wahlaufgaben (je 5 BE), ohne CAS
Teil B: B1 Analysis (30 BE), B2 Stochastik (20 BE), B3 Geometrie (20 BE), mit CAS
KRITISCH: Alle Formeln in LaTeX-Notation. Aufgaben müssen mathematisch korrekt sein.`;

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
- Der Schüler schreibt in Plain-Text-Mathe. Interpretiere großzügig.

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.

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
    { role: "system", content: rubricPrompt },
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
      const table = [[95,15],[90,14],[85,13],[80,12],[75,11],[70,10],[65,9],[60,8],[55,7],[50,6],[45,5],[40,4],[33,3],[27,2],[20,1],[0,0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teil_a_be: teilABE,
      teil_b_be: teilBBE,
      gesamt_be: gesamtBE,
      note: np,
      feedback: parsed.feedback || ""
    }, 200, env);
  } catch {
    return jsonResponse({
      teil_a_be: null,
      teil_b_be: null,
      gesamt_be: null,
      note: null,
      feedback: openaiRes
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

/* ================= OPENAI CALL ================= */
async function callOpenAI(env, messages, maxTokens = 4000) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      messages,
      temperature: 0.7,
      max_completion_tokens: maxTokens
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error("OpenAI: " + (data?.error?.message || JSON.stringify(data)));
  }
  return data.choices[0].message.content;
}

/* ================= HELPERS ================= */
function extractJSON(text) {
  let clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try { return JSON.parse(clean); } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}

    let repaired = match[0];
    repaired = repaired.replace(/:\s*"([\s\S]*?)"\s*([,\}])/g, (m, val, end) => {
      const fixed = val.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      return ': "' + fixed + '"' + end;
    });
    try { return JSON.parse(repaired); } catch {}
  }

  throw new Error("Model did not return valid JSON.");
}
