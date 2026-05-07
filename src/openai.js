import { API_TIMEOUT } from './config.js';

/* ================= TELEGRAM ERROR-ALERT ================= */
// Throttle: pro (status+errorType)-Kombi max. 1 Alert / 30 min, damit ein
// anhaltender 429-/Quota-Sturm nicht hunderte Telegram-Nachrichten erzeugt.
const _alertThrottle = new Map();
const ALERT_THROTTLE_MS = 30 * 60 * 1000;

function shouldSendAlert(key) {
  const now = Date.now();
  const last = _alertThrottle.get(key) || 0;
  if (now - last < ALERT_THROTTLE_MS) return false;
  _alertThrottle.set(key, now);
  // Cleanup: alte Einträge entfernen
  if (_alertThrottle.size > 50) {
    for (const [k, t] of _alertThrottle) {
      if (now - t > ALERT_THROTTLE_MS) _alertThrottle.delete(k);
    }
  }
  return true;
}

// Sendet API-Fehler per Telegram an den Admin (fire-and-forget, throttled)
async function notifyApiError(env, model, status, detail, elapsed, errorType) {
  try {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    // Spezialfall: Quota erschöpft -> kritischer Alert mit Aktion fürs Admin
    const isQuotaError = errorType === 'insufficient_quota';
    const throttleKey = `${status}:${errorType || 'unknown'}`;
    if (!shouldSendAlert(throttleKey)) return;

    const headline = isQuotaError
      ? `🔥 *KRITISCH — OpenAI Quota erschöpft*\n\nKein Schüler/Lehrer kann gerade KI-Aufgaben/Korrekturen nutzen.\n\n*Aktion:* https://platform.openai.com/settings/organization/billing`
      : `🚨 *OpenAI API Fehler*`;

    const text = `${headline}\n\n` +
      `📌 *Status:* ${status}${errorType ? ' (' + errorType + ')' : ''}\n` +
      `🤖 *Modell:* ${model}\n` +
      `⏱ *Dauer:* ${elapsed}ms\n` +
      `🔇 *Nächster Alert für diesen Fehler:* frühestens in 30 min\n\n` +
      `\`\`\`\n${detail.substring(0, 800)}\n\`\`\``;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch { /* Telegram-Fehler nicht eskalieren */ }
}

// Benutzerfreundliche Fehlermeldung basierend auf HTTP-Status
function userFriendlyError(status) {
  if (status === 429) return "Der KI-Dienst ist vorübergehend überlastet. Bitte versuche es in ein paar Minuten erneut.";
  if (status === 503 || status === 502) return "Der KI-Dienst ist gerade nicht erreichbar. Bitte versuche es später erneut.";
  if (status >= 500) return "Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.";
  return null; // Kein Mapping → Original-Fehler durchlassen
}

/* ================= OPENAI CALL ================= */

export async function callOpenAI(env, messages, maxTokens = 4000, { model = "gpt-5.2", temperature = 0.7, jsonMode = true } = {}) {
  const t0 = Date.now();
  let phase = "fetch";
  try {
    // Defensive Prüfung: gpt-5.2 erfordert das Wort "json" in den Messages bei json_object
    if (jsonMode) {
      const hasJson = messages.some(m => {
        const txt = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return /json/i.test(txt);
      });
      if (!hasJson && messages.length > 0) {
        // "json" in den System-Prompt einfügen, damit OpenAI keinen 400-Fehler wirft
        const sysIdx = messages.findIndex(m => m.role === "system");
        if (sysIdx >= 0) {
          messages = [...messages];
          messages[sysIdx] = { ...messages[sysIdx], content: messages[sysIdx].content + "\n\nRespond with valid JSON." };
        } else {
          messages = [{ role: "system", content: "Respond with valid JSON." }, ...messages];
        }
      }
    }
    const reqBody = {
      model,
      messages,
      temperature,
      max_completion_tokens: maxTokens
    };
    if (jsonMode) reqBody.response_format = { type: "json_object" };
    const controller = new AbortController();
    // Timeout: bei großen Anfragen (>10k tokens) auf 180s, sonst 95s
    const timeoutMs = maxTokens > 10000 ? 180000 : 95000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(reqBody)
    });
    clearTimeout(timeout);
    phase = "json";
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || JSON.stringify(data).substring(0, 200);
      const errorType = data?.error?.type;
      const elapsed = Date.now() - t0;
      // Admin per Telegram benachrichtigen (fire-and-forget, throttled)
      notifyApiError(env, model, response.status, detail, elapsed, errorType);
      // Benutzerfreundliche Meldung wenn möglich
      const friendly = userFriendlyError(response.status);
      throw new Error(friendly || "OpenAI(" + response.status + "): " + detail);
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

/* ================= OPENAI STREAMING CALL ================= */
// Streamt die OpenAI-Antwort chunk-weise. Ruft onChunk(delta) für jedes Text-Fragment auf.
// Gibt den vollständigen Content-String zurück.
export async function callOpenAIStream(env, messages, maxTokens = 4000, { model = "gpt-5.2", temperature = 0.7, jsonMode = true } = {}, onChunk) {
  const t0 = Date.now();
  let reader = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    // Defensive Prüfung: gpt-5.2 erfordert das Wort "json" in den Messages bei json_object
    if (jsonMode) {
      const hasJson = messages.some(m => {
        const txt = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return /json/i.test(txt);
      });
      if (!hasJson && messages.length > 0) {
        const sysIdx = messages.findIndex(m => m.role === "system");
        if (sysIdx >= 0) {
          messages = [...messages];
          messages[sysIdx] = { ...messages[sysIdx], content: messages[sysIdx].content + "\n\nRespond with valid JSON." };
        } else {
          messages = [{ role: "system", content: "Respond with valid JSON." }, ...messages];
        }
      }
    }
    const reqBody = {
      model,
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      stream: true
    };
    if (jsonMode) reqBody.response_format = { type: "json_object" };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = data?.error?.message || JSON.stringify(data).substring(0, 200);
      const errorType = data?.error?.type;
      const elapsed = Date.now() - t0;
      notifyApiError(env, model, response.status, detail, elapsed, errorType);
      const friendly = userFriendlyError(response.status);
      throw new Error(friendly || "OpenAI(" + response.status + "): " + detail);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            if (onChunk) await onChunk(delta);
          }
          // Warnung bei Abbruch wegen Token-Limit
          const finish = parsed.choices?.[0]?.finish_reason;
          if (finish === "length") {
            console.warn(`[callOpenAIStream] Antwort abgeschnitten (finish_reason=length, model=${model}, tokens=${maxTokens})`);
          }
        } catch { /* Einzelne Chunks ignorieren bei Parse-Fehlern */ }
      }
    }

    if (!content) throw new Error("OpenAI-Stream lieferte keinen Content.");
    clearTimeout(timeout);
    return content;
  } catch (err) {
    clearTimeout(timeout);
    try { await reader?.cancel(); } catch {}
    const elapsed = Date.now() - t0;
    throw new Error(`[stream ${elapsed}ms ${model}] ${err.message || err}`);
  }
}
