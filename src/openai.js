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

/* ================= OPENAI STREAMING CALL ================= */
// Streamt die OpenAI-Antwort chunk-weise. Ruft onChunk(delta) für jedes Text-Fragment auf.
// Gibt den vollständigen Content-String zurück.
export async function callOpenAIStream(env, messages, maxTokens = 4000, { model = "gpt-5.2", temperature = 0.7, jsonMode = true } = {}, onChunk) {
  const t0 = Date.now();
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = data?.error?.message || JSON.stringify(data).substring(0, 200);
      throw new Error("OpenAI(" + response.status + "): " + detail);
    }

    const reader = response.body.getReader();
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
    return content;
  } catch (err) {
    const elapsed = Date.now() - t0;
    throw new Error(`[stream ${elapsed}ms ${model}] ${err.message || err}`);
  }
}
