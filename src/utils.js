/* ================= UTILS ================= */
/* Gemeinsame Hilfsfunktionen für alle Module */

export function getAllowedOrigins(env) {
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origins = [primary];
  if (env?.ALLOWED_ORIGIN_FOS) {
    origins.push(env.ALLOWED_ORIGIN_FOS);
  }
  // www-Variante jedes Origins zulassen — manche Nutzer rufen www.myabiflow.de
  // auf; ohne diese Variante gäbe es sonst 403 Forbidden (CSRF-Origin-Check).
  for (const o of [...origins]) {
    if (o.includes("://") && !o.includes("://www.")) {
      origins.push(o.replace("://", "://www."));
    }
  }
  return origins;
}

export function isOriginAllowed(origin, env) {
  if (!origin) return false;
  return getAllowedOrigins(env).includes(origin);
}

export function corsHeaders(env, requestOrigin) {
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origin = (requestOrigin && isOriginAllowed(requestOrigin, env)) ? requestOrigin : primary;
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Token, X-Teacher-Token, X-Teacher-Auth-Token, X-Student-Name, X-Admin-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
  };
}

/* ---- JSON Response ---- */
export function jsonResponse(data, status = 200, env = null) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env, env?._origin) });
}

/* ---- Sicheres JSON.parse: nie werfen, nur Default zurückgeben ---- */
// Wird genutzt für DB-Felder wie exam_subjects, in denen historisch kaputte
// Werte landen können (z.B. "{" durch Browser-Abbruch). Verhindert, dass der
// Cron komplett stehenbleibt, wenn ein einzelner Schüler einen Schaden hat.
export function safeJsonParse(value, fallback = {}) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/* ---- Input-Validierung ---- */
export async function checkBodySize(request, env, maxBodySize) {
  const contentLengthHeader = request.headers.get("Content-Length");
  const contentLength = parseInt(contentLengthHeader || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodySize) {
    return jsonResponse({ error: "Anfrage zu groß." }, 413, env);
  }
  if (!contentLengthHeader || !Number.isFinite(contentLength)) {
    const bodySize = (await request.clone().arrayBuffer()).byteLength;
    if (bodySize > maxBodySize) {
      return jsonResponse({ error: "Anfrage zu groß." }, 413, env);
    }
  }
  return null;
}

export function truncate(str, max) {
  if (typeof str !== "string") return str;
  return str.length > max ? str.slice(0, max) : str;
}

/* ---- Server-seitiger HTML-Sanitizer (Defense-in-Depth) ----
 * Die Korrektur-HTML wird bereits clientseitig mit DOMPurify bereinigt.
 * Hier entfernen wir serverseitig zusaetzlich aktive Inhalte, falls ein
 * manipulierter Client rohes HTML schickt. Bewusst konservativ: <script>,
 * <iframe>, <object>, Event-Handler (on*) und javascript:-URIs raus. */
export function sanitizeStoredHtml(html, maxLen = 250000) {
  if (typeof html !== "string") return "";
  let s = html.slice(0, maxLen);
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta|style)\b[^>]*>/gi, "");
  // Event-Handler-Attribute (onclick, onload, ...) entfernen
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // javascript:-URIs in href/src neutralisieren
  s = s.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  return s;
}

/* ---- JSON-Parsing mit Reparatur ---- */

// Repariert Steuerzeichen und literal \n in Strings (KI gibt Tabellen oft mit \\n statt echten Newlines aus)
export function fixLatexControlChars(obj) {
  if (typeof obj === "string") {
    return obj
      .replace(/\x08/g, "\\b")
      .replace(/\x0C/g, "\\f")
      .replace(/\\n(?![a-zA-Z])/g, "\n")  // Literal \n → echte Newlines (aber nicht \nu, \nabla etc.)
      .replace(/\\t(?![a-zA-Z])/g, "\t"); // Literal \t → echte Tabs (aber nicht \text, \theta etc.)
  }
  if (Array.isArray(obj)) return obj.map(fixLatexControlChars);
  if (obj && typeof obj === "object") {
    const fixed = {};
    for (const k of Object.keys(obj)) fixed[k] = fixLatexControlChars(obj[k]);
    return fixed;
  }
  return obj;
}

export function extractJSON(text) {
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
    const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) truncated += '"';
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
    truncated = truncated.replace(/,\s*$/, "");
    for (let i = 0; i < brackets; i++) truncated += "]";
    for (let i = 0; i < braces; i++) truncated += "}";
    try { return fixLatexControlChars(JSON.parse(truncated)); } catch { }
  }

  throw new Error("Model did not return valid JSON.");
}

/* ---- Bilder-Support für multimodale OpenAI-Aufrufe ---- */
export function buildUserContent(textContent, images) {
  if (!images || !images.length) return textContent;
  // Bei vielen Seiten (>6) auf "auto" wechseln, damit das Modell nicht
  // mit Token-Masse überfordert wird und inkonsistent bewertet
  const detail = images.length > 6 ? "auto" : "high";
  const hinweis = images.length > 6
    ? `\n\n[WICHTIG: Die Schülerlösung umfasst ${images.length} Seiten. Betrachte JEDE Seite sorgfältig und vollständig, bevor du die Bewertung abgibst. Vergib Punkte konsistent über alle Seiten hinweg.]`
    : "";
  return [
    { type: "text", text: textContent + hinweis },
    ...images.slice(0, 10).map(img => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${img}`, detail }
    }))
  ];
}

/* ---- Batch-Extraktion: Bilder in Gruppen lesen, dann Text-basiert bewerten ---- */

const MINT_ENDPOINTS = /mathe|physik|chemie|bio|informatik/;

function getExtractionPrompt(isMint) {
  if (isMint) {
    return `Du bist ein Experte für das Lesen handschriftlicher Schülerlösungen in MINT-Fächern.

AUFGABE: Transkribiere den VOLLSTÄNDIGEN Inhalt jeder Seite. Erfasse ALLES:
- Handgeschriebenen Text (wortgetreu)
- Mathematische Formeln und Gleichungen (in LaTeX-Notation)
- Rechenwege und Zwischenschritte
- Diagramme, Skizzen, Graphen (beschreibe sie präzise)
- Reaktionsgleichungen
- Tabellen und Wertetabellen
- Durchgestrichene Passagen mit [DURCHGESTRICHEN] markieren

Gib die Transkription seitenweise aus:
--- Seite X ---
[Inhalt]

WICHTIG: Lass NICHTS aus. Jede Zahl, jede Formel, jeder Pfeil zählt.`;
  }
  return `Du bist ein Experte für das Lesen handschriftlicher Schülerlösungen.

AUFGABE: Transkribiere den VOLLSTÄNDIGEN Inhalt jeder Seite. Erfasse ALLES:
- Handgeschriebenen Text (wortgetreu, mit Absätzen)
- Überschriften und Gliederungspunkte
- Randnotizen oder Ergänzungen
- Durchgestrichene Passagen mit [DURCHGESTRICHEN] markieren

Gib die Transkription seitenweise aus:
--- Seite X ---
[Inhalt]

WICHTIG: Lass NICHTS aus. Jedes Wort zählt für die anschließende Bewertung.`;
}

/**
 * Extrahiert Text aus vielen Bildern in Batches.
 * Gibt den zusammengeführten transkribierten Text zurück.
 * @param {string[]} images - Base64-kodierte JPEG-Bilder
 * @param {string} endpoint - Grade-Endpoint (für MINT-Erkennung)
 * @param {object} env - Environment mit OPENAI_API_KEY
 * @param {function} callOpenAIFn - callOpenAI-Funktion (Dependency Injection)
 * @returns {Promise<string>} - Transkribierter Gesamttext
 */
export async function batchExtractFromImages(images, endpoint, env, callOpenAIFn) {
  const isMint = MINT_ENDPOINTS.test(endpoint);
  const systemPrompt = getExtractionPrompt(isMint);
  const BATCH_SIZE = 4;
  const batches = [];

  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    batches.push(images.slice(i, i + BATCH_SIZE));
  }

  console.log(`[batchExtract] ${images.length} Bilder in ${batches.length} Batches (${isMint ? 'MINT' : 'Text'})`);

  const results = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const startPage = b * BATCH_SIZE + 1;

    const userContent = [
      { type: "text", text: `Transkribiere die folgenden ${batch.length} Seite(n) (Seite ${startPage} bis ${startPage + batch.length - 1}):` },
      ...batch.map(img => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${img}`, detail: "high" }
      }))
    ];

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];

    const text = await callOpenAIFn(env, messages, 4000, {
      temperature: 0.1,
      jsonMode: false
    });

    results.push(text);
    console.log(`[batchExtract] Batch ${b + 1}/${batches.length} fertig (${text.length} Zeichen)`);
  }

  return results.join("\n\n");
}
