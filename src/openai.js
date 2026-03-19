/* ================= OPENAI CALL ================= */

export async function callOpenAI(env, messages, maxTokens = 4000, { model = "gpt-5.2", temperature = 0.7, jsonMode = true } = {}) {
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 95000); // 95s Timeout (Worker-Limit = 100s)
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
