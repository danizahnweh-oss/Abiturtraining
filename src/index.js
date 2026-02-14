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

let requestCounter = 0;
function cleanupRateLimitMap() {
  requestCounter++;
  if (requestCounter % 100 === 0) {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW * 5) {
        rateLimitMap.delete(ip);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (pathname.startsWith("/api/")) {
        const authError = checkAuth(request, env);
        if (authError) return authError;
        const rateLimitError = checkRateLimit(request);
        if (rateLimitError) return rateLimitError;
        cleanupRateLimitMap();
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

      // ===== DASHBOARD ENDPOINTS =====
      if (pathname === "/api/submit-result" && request.method === "POST") {
        return await handleSubmitResult(request, env);
      }
      if (pathname === "/api/results" && request.method === "POST") {
        return await handleGetResults(request, env);
      }
      if (pathname === "/api/delete-result" && request.method === "POST") {
        return await handleDeleteResult(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders() });
    }
  }
};

/* ================= ENGLISCH: GENERATE ================= */
async function handleGenerate(request, env) {
  const body = await request.json();
  const { topic, source_len_words, prompt_template } = body;

  const prompt = prompt_template
    .replace(/\{topic\}/g, topic || "")
    .replace(/\$\{topic\}/g, topic || "")
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
    { role: "user", content: prompt }
  ], maxTokens);

  const content = extractJSON(openaiRes);
  return jsonResponse(content);
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
        `Deutscher Quelltext:\n${source_text_de}\n\n` +
        `Englische Aufgabenstellung:\n${task_en}\n\n` +
        `Schülertext (Englisch):\n${student_text_en}\n\n` +
        `Bewertungsraster:\n${rubric_prompt}`
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
    });
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
    });
  }
}

/* ================= ENGLISCH: OCR ================= */
async function handleOCR(request, env) {
  const { image_base64 } = await request.json();
  if (!image_base64) {
    return jsonResponse({ error: "image_base64 required" }, 400);
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
  if (!openaiRes.ok) throw new Error(data?.error?.message || "OpenAI Vision error");
  return jsonResponse({ text: data?.choices?.[0]?.message?.content || "" });
}

/* ================= ENGLISCH: PARSE TASK ================= */
async function handleParseTask(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400);
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
  if (!openaiRes.ok) throw new Error(data?.error?.message || "OpenAI Vision error");
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  return jsonResponse(parsed);
}

/* ================= ENGLISCH: MODEL ANSWER ================= */
async function handleModelAnswer(request, env) {
  const { source_text_de, task_en } = await request.json();
  if (!source_text_de || !task_en) {
    return jsonResponse({ error: "source_text_de and task_en required" }, 400);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B2/C1). 
Schreibe eine Musterlösung für die Mediation-Aufgabe auf ENGLISCH.
- Halte dich an die Aufgabenstellung
- Paraphrasiere, übersetze NICHT wörtlich
- Zielumfang: 200–280 Wörter

Formatiere als Markdown: Erst die Lösung, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${task_en}\n\nQUELLTEXT:\n${source_text_de}` }
  ]);

  return jsonResponse({ model_answer: answer });
}

/* ================= DEUTSCH: GENERATE ================= */
async function handleGenerateDeutsch(request, env) {
  const body = await request.json();
  const { type, gattung, epoche, schreibauftrag, thema, textsorte, typ, aufgabentyp } = body;

  let systemPrompt, userPrompt;

  if (type === "interpretation") {
    systemPrompt = `Du bist ein Experte für das bayerische Deutsch-Abitur. Erstelle eine authentische Interpretationsaufgabe.
Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Zweiteilige Aufgabenstellung",
  "primary_text": "Der literarische Text (vollständig bei Lyrik, Ausschnitt bei Drama/Epik)",
  "primary_meta": "Autor, Titel, Jahr",
  "compare_text": "Vergleichstext bei Motivvergleich, sonst null",
  "compare_meta": "Metadaten Vergleichstext oder null",
  "material_text": "Material für poetologische Aufgabe oder null",
  "material_meta": "Quelle oder null",
  "gattung": "${gattung}",
  "epoche": "Konkrete Epoche",
  "weight_part1": 70,
  "weight_part2": 30
}`;
    userPrompt = `Erstelle eine Interpretationsaufgabe:
- Gattung: ${gattung}
- Epoche: ${epoche === "random" ? "frei wählbar" : epoche}
- Weiterführender Auftrag: ${schreibauftrag}
Verwende ECHTE literarische Texte. Die Aufgabe muss abiturtypisch formuliert sein.`;

  } else if (type === "analyse") {
    systemPrompt = `Du erstellst Analyseaufgaben für pragmatische Texte (Deutsch-Abitur Bayern).
Antworte NUR mit validem JSON:
{
  "task_instruction": "Aufgabenstellung mit Analyse und weiterführendem Auftrag",
  "primary_text": "Der pragmatische Text (400-600 Wörter)",
  "primary_meta": "Autor, Quelle, Jahr",
  "textsorte": "Textsorte",
  "compare_text": "Vergleichstext oder null",
  "compare_meta": "Metadaten oder null"
}`;
    userPrompt = `Erstelle eine Analyseaufgabe:
- Textsorte: ${textsorte === "random" ? "frei wählbar" : textsorte}
- Thema: ${thema === "random" ? "frei wählbar" : thema}
- Weiterführend: ${schreibauftrag}`;

  } else if (type === "eroerterung") {
    systemPrompt = `Du erstellst Erörterungsaufgaben für das Deutsch-Abitur Bayern.
Antworte NUR mit validem JSON:
{
  "task_instruction": "Aufgabenstellung (Position analysieren + eigene Stellungnahme)",
  "primary_text": "Ausgangstext mit klarer Position (400-600 Wörter)",
  "primary_meta": "Autor, Quelle, Jahr",
  "thema": "Themenbereich"
}`;
    userPrompt = `Erstelle eine Erörterungsaufgabe:
- Thema: ${thema === "random" ? "frei wählbar (aktuell, kontrovers)" : thema}
- Typ: ${typ}`;

  } else if (type === "materialgestuetzt") {
    systemPrompt = `Du erstellst materialgestützte Schreibaufgaben für das Deutsch-Abitur Bayern.
Antworte NUR mit validem JSON:
{
  "task_instruction": "Präzise Aufgabenstellung mit Textsorte, Adressat, Anlass",
  "zieltext": "Geforderte Textsorte",
  "zielgruppe": "Adressaten",
  "materials": [
    {"title": "Titel", "type": "text|statistik", "content": "Inhalt", "source": "Quelle"}
  ]
}
Erstelle 3-5 verschiedene Materialien (Texte, Statistiken, Zitate).`;
    userPrompt = `Erstelle eine materialgestützte Aufgabe:
- Typ: ${aufgabentyp === "argumentieren" ? "Argumentierender Beitrag" : "Informierender Text"}
- Thema: ${thema === "random" ? "frei wählbar" : thema}
- Zieltextsorte: ${textsorte}`;
  }

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content);
}

/* ================= DEUTSCH: GRADE ================= */
async function handleGradeDeutsch(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, type, materials, zieltext, zielgruppe } = body;

  let contextInfo = `Aufgabenstellung:\n${task_instruction}\n\n`;
  
  if (primary_text) {
    contextInfo += `Ausgangstext:\n${primary_text}\n\n`;
  }
  
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.map((m, i) => `Material ${i+1}: ${m.title}\n${m.content}`).join("\n\n")}\n\n`;
  }
  
  if (zieltext) contextInfo += `Geforderter Zieltext: ${zieltext}\n`;
  if (zielgruppe) contextInfo += `Zielgruppe: ${zielgruppe}\n`;

  const messages = [
    { role: "system", content: rubric_prompt },
    { role: "user", content: `${contextInfo}\nSchülertext:\n${student_text}` }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);

  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    // Berechne falls nicht vorhanden (unterschiedliche Gewichtung je nach Aufgabentyp)
    if (gesamt == null && verstehen != null && darstellung != null) {
      const weight = type === "materialgestuetzt" ? 0.6 : 0.7;
      gesamt = Math.round(verstehen * weight + darstellung * (1 - weight));
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || ""
    });
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes
    });
  }
}

/* ================= DEUTSCH: MODEL ANSWER ================= */
async function handleModelAnswerDeutsch(request, env) {
  const { task_instruction, primary_text, primary_meta, compare_text, material_text, type, materials } = await request.json();

  let systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Deutsch).
Schreibe eine Musterlösung auf DEUTSCH.
- Strukturiere klar (Einleitung, Hauptteil, Schluss)
- Verwende Fachbegriffe korrekt
- Belege Aussagen mit Textzitaten
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion, welche Strategien verwendet wurden.`;

  let userContent = `AUFGABE:\n${task_instruction}\n\nHAUPTTEXT:\n${primary_text}`;
  if (primary_meta) userContent += `\n(${primary_meta})`;
  if (compare_text) userContent += `\n\nVERGLEICHSTEXT:\n${compare_text}`;
  if (material_text) userContent += `\n\nMATERIAL:\n${material_text}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.map((m, i) => `Material ${i+1}: ${m.title}\n${m.content}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer });
}

/* ================= DASHBOARD: SUBMIT RESULT ================= */
async function handleSubmitResult(request, env) {
  const { student_name, course, type, topic, content, language, total, date } = await request.json();

  if (!student_name || total == null) {
    return jsonResponse({ error: "student_name and total required" }, 400);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  results.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    student_name,
    course: course || "",
    type: type || "mediation",
    topic: topic || "—",
    content: content ?? null,
    language: language ?? null,
    total,
    date: date || new Date().toISOString()
  });

  await env.RESULTS_KV.put("all_results", JSON.stringify(results));
  return jsonResponse({ success: true, count: results.length });
}

/* ================= DASHBOARD: GET RESULTS ================= */
async function handleGetResults(request, env) {
  const { teacher_password } = await request.json();
  const teacherPw = env.TEACHER_PASSWORD || "stanna-lehrer-2026";
  if (teacher_password !== teacherPw) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  return jsonResponse({ results });
}

/* ================= DASHBOARD: DELETE RESULT ================= */
async function handleDeleteResult(request, env) {
  const { teacher_password, result_id } = await request.json();
  const teacherPw = env.TEACHER_PASSWORD || "stanna-lehrer-2026";
  if (teacher_password !== teacherPw) {
    return jsonResponse({ error: "Falsches Lehrer-Passwort." }, 401);
  }

  let results = [];
  try {
    const raw = await env.RESULTS_KV.get("all_results");
    if (raw) results = JSON.parse(raw);
  } catch {}

  results = results.filter(r => r.id !== result_id);
  await env.RESULTS_KV.put("all_results", JSON.stringify(results));
  return jsonResponse({ success: true, count: results.length });
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
    throw new Error(data?.error?.message || "OpenAI error");
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Password",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
