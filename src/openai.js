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
