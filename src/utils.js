/* ================= UTILS ================= */
/* Gemeinsame Hilfsfunktionen für alle Module */

/* ---- CORS ---- */
// Cloudflare Pages Preview-Origins (z.B. staging.myabiflow.pages.dev)
function isAllowedPreviewOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.myabiflow\.pages\.dev$/.test(origin);
}

export function getAllowedOrigins(env) {
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origins = [primary, primary.replace("://", "://www.")];
  if (env?.ALLOWED_ORIGIN_FOS) {
    origins.push(env.ALLOWED_ORIGIN_FOS, env.ALLOWED_ORIGIN_FOS.replace("://", "://www."));
  }
  return origins;
}

export function isOriginAllowed(origin, env) {
  if (!origin) return false;
  return getAllowedOrigins(env).includes(origin) || isAllowedPreviewOrigin(origin);
}

export function corsHeaders(env, requestOrigin) {
  const primary = env?.ALLOWED_ORIGIN || "https://myabiflow.de";
  const origin = (requestOrigin && isOriginAllowed(requestOrigin, env)) ? requestOrigin : primary;
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Token, X-Teacher-Token, X-Teacher-Auth-Token",
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

/* ---- Input-Validierung ---- */
export function checkBodySize(request, env, maxBodySize) {
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > maxBodySize) {
    return jsonResponse({ error: "Anfrage zu groß." }, 413, env);
  }
  return null;
}

export function truncate(str, max) {
  if (typeof str !== "string") return str;
  return str.length > max ? str.slice(0, max) : str;
}

/* ---- JSON-Parsing mit Reparatur ---- */

// Repariert Steuerzeichen die durch fehlendes JSON-Escaping von LaTeX entstehen
export function fixLatexControlChars(obj) {
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
