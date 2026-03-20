// Handler: Media (Image Generation, Unsplash Fetch, Submit Result)
import { jsonResponse, truncate } from '../utils.js';

/* ================= IMAGE GENERATION: IMAGEN 4 + GEMINI FLASH FALLBACK ================= */
export async function handleGenerateImage(request, env) {
  const { prompt, noText, style } = await request.json();
  if (!prompt) {
    return jsonResponse({ error: "prompt erforderlich." }, 400, env);
  }

  // Ideogram-Prompt: Sauber und fokussiert, Einschränkungen gehen in negative_prompt
  const ideogramPrompt = `Professional educational diagram: ${prompt}. Clean, precise illustration with vivid colors, sharp lines, white background. Label elements with numbers only (1, 2, 3).`;

  // Imagen-Prompt (Fallback)
  const basePrompt = `Professional educational illustration for a school textbook. ${prompt}. Clean, modern style with crisp lines, vivid colors, white background. Label elements with numbers (1, 2, 3) only, no text.`;

  // Gemini-Flash-Prompt (Fallback)
  const flashPrompt = `Generate a professional educational illustration for a German school textbook.

${prompt}

Style: Clean, precise diagram with vivid colors, sharp lines, white background. Label elements with numbers (1, 2, 3) only — no text or words in the image.

After generating the image, write a short factual German caption (max 15 words). Only the caption, no prefix.`;

  // Hilfsfunktion: Caption über GPT generieren
  async function generateCaption() {
    try {
      const captionRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: `Schreibe eine kurze, sachliche deutsche Bildunterschrift (max. 15 Wörter) für ein generiertes Bild zum Thema. Nur die Bildunterschrift, kein "Abb." Präfix, keine Anführungszeichen.\n\nThema: ${prompt}` }],
          max_tokens: 60,
          temperature: 0.3
        })
      });
      const captionData = await captionRes.json();
      return captionData.choices?.[0]?.message?.content?.trim() || "";
    } catch { return ""; }
  }

  let lastError = "";

  // === STUFE 1: Ideogram 3.0 (bestes Text-Rendering) ===
  if (env.IDEOGRAM_API_KEY) {
    try {
      const ideogramRes = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
        method: "POST",
        headers: {
          "Api-Key": env.IDEOGRAM_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: ideogramPrompt,
          aspect_ratio: "16x9",
          rendering_speed: "DEFAULT",
          style_type: "GENERAL",
          magic_prompt: "ON",
          num_images: 1,
          negative_prompt: "text, words, letters, sentences, captions, titles, labels with text, English text, German text, people, persons, faces, portraits, caricatures, watermark, logo, blurry, low quality, ugly"
        })
      });
      const ideogramData = await ideogramRes.json();

      if (!ideogramRes.ok) {
        lastError = ideogramData.error || ideogramData.message || `Ideogram: HTTP ${ideogramRes.status}`;
      } else {
        const imageUrl = ideogramData.data?.[0]?.url;
        if (imageUrl) {
          // Bild herunterladen und als Base64 konvertieren
          const imgFetch = await fetch(imageUrl);
          if (imgFetch.ok) {
            const imgBuffer = await imgFetch.arrayBuffer();
            const bytes = new Uint8Array(imgBuffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            const contentType = imgFetch.headers.get("content-type") || "image/png";
            const dataUrl = `data:${contentType};base64,${base64}`;
            const caption = await generateCaption();
            return jsonResponse({ url: dataUrl, credit: "Ideogram", caption }, 200, env);
          }
          lastError = "Ideogram: Bild-Download fehlgeschlagen";
        } else {
          lastError = "Ideogram: Kein Bild in Antwort";
        }
      }
    } catch (e) {
      lastError = `Ideogram: ${e.message}`;
    }
  }

  // === STUFE 2: Imagen 4 (Fallback) ===
  const IMAGEN_MODELS = ["imagen-4.0-generate-001", "imagen-4.0-fast-generate-001"];
  for (const modelId of IMAGEN_MODELS) {
    try {
      const imagenRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GOOGLE_AI_API_KEY
          },
          body: JSON.stringify({
            instances: [{ prompt: basePrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: "16:9",
              personGeneration: "dont_allow"
            }
          })
        }
      );
      const imagenData = await imagenRes.json();

      if (!imagenRes.ok) {
        lastError = imagenData.error?.message || `${modelId}: HTTP ${imagenRes.status}`;
        console.log(`Imagen ${modelId} fehlgeschlagen: ${lastError}`);
        continue;
      }

      const prediction = imagenData.predictions?.[0];
      if (!prediction?.bytesBase64Encoded) {
        lastError = `${modelId}: Kein Bild in Antwort`;
        console.log(`Imagen ${modelId}: kein Bild in Antwort`);
        continue;
      }

      const mimeType = prediction.mimeType || "image/png";
      const dataUrl = `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
      console.log(`Bild erfolgreich generiert mit ${modelId}`);
      const caption = await generateCaption();
      return jsonResponse({ url: dataUrl, credit: "Google Imagen", caption }, 200, env);
    } catch (e) {
      lastError = `${modelId}: ${e.message}`;
      console.log(`Imagen ${modelId} Exception: ${e.message}`);
      continue;
    }
  }

  // === STUFE 3: Gemini Flash Fallback ===
  const FLASH_MODELS = [
    { id: "gemini-3.1-flash-image-preview", size: "2K" },
    { id: "gemini-2.5-flash-image", size: "1K" }
  ];

  for (const model of FLASH_MODELS) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GOOGLE_AI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: flashPrompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              imageConfig: { aspectRatio: "16:9", imageSize: model.size }
            }
          })
        }
      );
      const geminiData = await geminiRes.json();

      if (!geminiRes.ok) {
        lastError = geminiData.error?.message || `${model.id}: HTTP ${geminiRes.status}`;
        console.log(`Flash ${model.id} fehlgeschlagen: ${lastError}`);
        continue;
      }

      const parts = geminiData.candidates?.[0]?.content?.parts || [];
      const img = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));
      if (!img) {
        const reason = geminiData.candidates?.[0]?.finishReason || "unbekannt";
        lastError = `${model.id}: Kein Bild (finishReason: ${reason})`;
        console.log(`Flash ${model.id}: kein Bild (${reason})`);
        continue;
      }

      const mimeType = img.inlineData.mimeType || "image/png";
      const dataUrl = `data:${mimeType};base64,${img.inlineData.data}`;
      console.log(`Bild erfolgreich generiert mit ${model.id} (Fallback)`);

      const textPart = parts.find(p => p.text);
      let caption = "";
      if (textPart?.text) {
        const lines = textPart.text.trim().split("\n").filter(l => l.trim());
        caption = lines[0]?.replace(/^["„"']|["„"']$/g, "").trim() || "";
        if (caption.length > 120) caption = caption.substring(0, 117) + "...";
      }

      return jsonResponse({ url: dataUrl, credit: "Google Gemini", caption }, 200, env);
    } catch (e) {
      lastError = `${model.id}: ${e.message}`;
      console.log(`Flash ${model.id} Exception: ${e.message}`);
      continue;
    }
  }

  return jsonResponse({ error: "Bildgenerierung fehlgeschlagen: " + lastError }, 500, env);
}

/* ================= IMAGE FETCH: LEGACY ENDPOINT ================= */
export async function handleFetchUnsplash(request, env) {
  const { keywords } = await request.json();
  if (!keywords) {
    return jsonResponse({ error: "keywords erforderlich." }, 400, env);
  }
  // Redirect to Imagen generation with keywords as prompt
  const fakeReq = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: keywords })
  });
  return handleGenerateImage(fakeReq, env);
}

/* ================= DASHBOARD: SUBMIT RESULT ================= */
export async function handleSubmitResult(request, env) {
  const { student_name, course, type, topic, content, language, total, date, details } = await request.json();

  if (!student_name || typeof student_name !== "string" || total == null) {
    return jsonResponse({ error: "student_name and total required" }, 400, env);
  }

  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 8);
  const sName = truncate(student_name, 100);
  const nameLower = sName.trim().toLowerCase();
  const studentRow = await env.DB.prepare("SELECT id FROM students WHERE name_lower = ?").bind(nameLower).first();
  const createdAt = date || new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO results (id, student_id, student_name, course, type, topic, content, language, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    studentRow ? studentRow.id : null,
    sName,
    truncate(course || "", 20),
    truncate(type || "mediation", 50),
    truncate(topic || "—", 500),
    content ?? null,
    language ?? null,
    total,
    createdAt
  ).run();

  // Kompetenzprofil: Optionale Detail-Daten speichern
  if (details && typeof details === "object") {
    try {
      await env.DB.prepare(
        "INSERT INTO result_details (result_id, strengths, weaknesses, error_types, missing_topics, afb_scores, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        id,
        details.strengths ? JSON.stringify(details.strengths) : null,
        details.weaknesses ? JSON.stringify(details.weaknesses) : null,
        details.error_types ? JSON.stringify(details.error_types) : null,
        details.missing_topics ? JSON.stringify(details.missing_topics) : null,
        details.afb_scores ? JSON.stringify(details.afb_scores) : null,
        createdAt
      ).run();
    } catch (e) {
      // Detail-Speicherung darf nie das Hauptergebnis blockieren
      console.error("result_details INSERT fehlgeschlagen:", e.message);
    }
  }

  return jsonResponse({ success: true, result_id: id }, 200, env);
}
