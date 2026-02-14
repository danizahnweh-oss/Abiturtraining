/* ================= AUTH & RATE LIMITING ================= */
const RATE_LIMIT_WINDOW = 60 * 1000; 
const MAX_REQUESTS_PER_WINDOW = 10;
const rateLimitMap = new Map();

function checkAuth(request, env) {
  const authHeader = request.headers.get("X-Access-Password") || "";
  const accessPassword = env.ACCESS_PASSWORD || "stanna2026";
  if (authHeader !== accessPassword) {
    return jsonResponse({ error: "Nicht autorisiert. Falsches Passwort." }, 401);
  }
  return null; 
}

function checkRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return null; 
  }
  const entry = rateLimitMap.get(ip);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
    return null; 
  }
  entry.count++;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return jsonResponse({ error: "Zu viele Anfragen. Bitte warte eine Minute." }, 429);
  }
  return null;
}

/* ================= WORKER ENTRY ================= */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return handleOptions(request);
    
    const url = new URL(request.url);
    const authError = checkAuth(request, env);
    if (authError) return authError;

    const rateError = checkRateLimit(request);
    if (rateError) return rateError;

    if (request.method === "POST" && url.pathname === "/generate-task") {
      return handleGenerateTask(request, env);
    }
    if (request.method === "POST" && url.pathname === "/generate-grade") {
      return handleGrade(request, env);
    }
    if (request.method === "POST" && url.pathname === "/generate-model-answer") {
      return handleModelAnswer(request, env);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  }
};

/* ================= HANDLERS ================= */

// 1. GENERATE TASK
async function handleGenerateTask(request, env) {
  const body = await request.json();
  const subject = body.subject || "english";
  
  let systemPrompt = "";
  if (subject === "german") {
    systemPrompt = `Du bist ein erfahrener Deutschlehrer für die Oberstufe (Abitur Bayern). 
    Erstelle eine anspruchsvolle Abituraufgabe basierend auf dem User-Input (z.B. Gedichtanalyse, Erörterung).
    Strukturiere die Ausgabe mit Markdown (Überschriften, Aufzählungen).
    Vermeide generische Platzhalter, sei kreativ und konkret.`;
  } else {
    systemPrompt = `You are a creative English teacher creating Abitur tasks. Use Markdown.`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: body.prompt }
  ];
  return callAI(env, messages, false);
}

// 2. GRADE (KORREKTUR)
async function handleGrade(request, env) {
  const body = await request.json();
  const subject = body.subject || "english"; 
  
  let systemPrompt = "";

  if (subject === "german") {
    // Prompt für Deutsch Abitur (ISB Kriterien)
    systemPrompt = `Du bist ein strenger Deutschlehrer am bayerischen Gymnasium (Abitur-Korrektur).
    Korrigiere den Schülertext basierend auf:
    1. Inhalt (Verstehensleistung): Themenerschließung, Argumentationsgang, Textbezug.
    2. Sprache (Darstellungsleistung): Fachsprache, Syntax, Rechtschreibung, Zitiertechnik, Stil.
    
    Gib eine Bewertung in Notenpunkten (0-15) ab.
    Deine Antwort MUSS valides JSON sein mit folgenden Feldern:
    {
      "inhalt_np": (Zahl 0-15),
      "sprache_np": (Zahl 0-15),
      "gesamt_np": (Zahl 0-15, gewichtet),
      "feedback": "Detailliertes Feedback in Markdown formatiert (Stärken/Schwächen)",
      "correction_details": "Konkrete Verbesserungsvorschläge"
    }`;
  } else {
    // Prompt für Englisch Abitur
    systemPrompt = `You are a strict German Abitur English teacher. 
    Correct the student's text based on: Content (Structure, arguments) and Language (Grammar, Vocab, Register).
    Range: 0-15 points (German Notenpunkte). 
    Output strictly JSON:
    {
      "inhalt_np": (int 0-15),
      "sprache_np": (int 0-15),
      "gesamt_np": (int 0-15),
      "feedback": "Markdown text",
      "correction_details": "Details"
    }`;
  }

  // Wir fügen den Kontext (die Aufgabenstellung) hinzu, falls vorhanden
  const userContent = `Aufgabe/Kontext: ${body.task_context || "Keine Angabe"}\n\nSchülertext:\n${body.prompt}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  return callAI(env, messages, true); // true = force JSON
}

// 3. MODEL ANSWER (MUSTERLÖSUNG)
async function handleModelAnswer(request, env) {
  const body = await request.json();
  const subject = body.subject || "english";
  
  let systemPrompt = "";

  if (subject === "german") {
    systemPrompt = `Du bist Deutschlehrer (Abiturniveau Bayern). Erstelle eine exzellente Musterlösung (14-15 Punkte).
    Schreibe niveauvoll, präzise und strukturiert. Nutze Markdown.`;
  } else {
    systemPrompt = `You are an English teacher (German Abitur level). Write a model answer (13-15 points).
    Language: Sophisticated English (C1/C2). Use Markdown.`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: body.prompt }
  ];

  return callAI(env, messages, false);
}

/* ================= AI & UTILS ================= */

async function callAI(env, messages, jsonMode = false) {
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      body: JSON.stringify({
        messages,
        max_tokens: 3000,
        temperature: 0.6,
        response_format: jsonMode ? { type: "json_object" } : undefined
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error("AI Error: " + JSON.stringify(result.errors));
    
    const content = result.result.response;
    return jsonResponse(jsonMode ? tryParseJSON(content) : { answer: content });

  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function tryParseJSON(text) {
  try { return JSON.parse(text); }
  catch (e) { 
    // Fallback falls die AI Markdown um das JSON packt (```json ... ```)
    const match = text.match(/\{[\s\S]*\}/);
    if(match) {
        try { return JSON.parse(match[0]); } catch(err) {}
    }
    return { feedback: text, gesamt_np: 0, inhalt_np: 0, sprache_np: 0 }; 
  }
}

function handleOptions(request) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Password"
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}