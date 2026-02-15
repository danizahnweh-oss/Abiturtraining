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

      // ===== SUBMIT RESULT =====
      if (pathname === "/api/submit-result" && request.method === "POST") {
        return await handleSubmitResult(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      // Keine internen Details leaken
      return jsonResponse({ error: "Interner Fehler." }, 500, env);
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
  "feedback": "<detailed feedback in German with Markdown formatting>"
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

  const openaiRes = await callOpenAI(env, messages);

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
      corrections: parsed.corrections || ""
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
      corrections: ""
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
Schreibe eine Musterlösung für die Mediation-Aufgabe auf ENGLISCH.
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

Erstelle genau 5-6 verschiedene Materialien:
- Textmaterialien (type "text"): Jeweils 300-600 Wörter. Vollständige Textauszüge aus Zeitungsartikeln, Fachtexten, Essays, Interviews oder Reden. Echte Argumentation, nicht nur Zusammenfassungen!
- Statistiken (type "statistik"): Als Markdown-Tabelle mit konkreten Zahlen und Prozentwerten formatieren. Mindestens 5-8 Datenzeilen. Unter der Tabelle eine kurze Beschreibung der Erhebung.
- Mindestens 1-2 Materialien vom Typ "statistik" (Umfrage, Studie, Statistik als Tabelle)
- Mindestens 3 Materialien vom Typ "text" (Zeitungsartikel, Fachtext, Essay, Interview, Rede)
- 1 Material kann ein kürzeres Zitat/Expertenaussage sein (type "text", 50-100 Wörter)

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Präzise Aufgabenstellung mit Textsorte, Adressat, Anlass und konkretem Schreibauftrag",
  "zieltext": "Geforderte Textsorte",
  "zielgruppe": "Adressaten",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Inhalt (300-600 Wörter)", "source": "Autor, Quelle, Jahr"},
    {"title": "Titel der Statistik", "type": "statistik", "content": "| Kategorie | Wert |\\n|---|---|\\n| ... | ... |\\nBeschreibung der Statistik.", "source": "Institut/Studie, Jahr"}
  ]
}`;
    userPrompt = `Erstelle eine materialgestützte Aufgabe:
- Typ: ${aufgabentyp === "argumentieren" ? "Argumentierender Beitrag" : "Informierender Text"}
- Thema: ${thema === "random" ? "frei wählbar" : truncate(thema, 200)}
- Zieltextsorte: ${truncate(textsorte, 200)}

KRITISCH - Längen wie im echten Abitur:
- 5-6 Materialien insgesamt
- Jedes Textmaterial 300-600 Wörter (vollständige Auszüge, nicht Stichpunkte!)
- Statistiken als Markdown-Tabelle mit echten, plausiblen Zahlen (5-8 Zeilen)
- Gesamtes Lesematerial: ca. 2000-3500 Wörter`;
  } else {
    return jsonResponse({ error: "Unbekannter Aufgabentyp." }, 400, env);
  }

  // Längere Texte brauchen mehr Tokens (Epik/Analyse/Erörterung: 1000-1500 Wörter ≈ 10000+ Tokens)
  const tokenMap = { interpretation: 10000, analyse: 10000, eroerterung: 10000, materialgestuetzt: 12000 };
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

  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);

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
      feedback: parsed.feedback || ""
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes
    }, 200, env);
  }
}

/* ================= DEUTSCH: MODEL ANSWER ================= */
async function handleModelAnswerDeutsch(request, env) {
  const { task_instruction, primary_text, primary_meta, compare_text, material_text, type, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Deutsch).
Schreibe eine Musterlösung auf DEUTSCH.
- Strukturiere klar (Einleitung, Hauptteil, Schluss)
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

/* ================= OPENAI CALL ================= */
async function callOpenAI(env, messages, maxTokens = 4000) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error("KI-Verarbeitung fehlgeschlagen.");
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
