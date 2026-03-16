import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_TEXT, UEBUNGSAUFGABEN_ANWEISUNG } from '../config.js';

export async function handleParseTaskItalian(request, env) {
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
      text: `Diese Bilder zeigen eine Italienisch-Abitur Aufgabe (Sprachmittlung oder Schreiben). Extrahiere:
1. Die Aufgabenstellung (task_instruction) — kann auf Italienisch oder Deutsch formuliert sein
2. Den Quelltext (article_text) — bei Sprachmittlung auf Deutsch, bei Schreiben auf Italienisch
3. Die Überschrift/Titel (headline)
4. Falls vorhanden: Quellenangabe (source_info)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "article_text": "...", "headline": "...", "source_info": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 4000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ITALIENISCH: MODEL ANSWER (Sprachmittlung) ================= */
export async function handleModelAnswerItalian(request, env) {
  const { source_text_de, task_it } = await request.json();
  if (!source_text_de || !task_it) {
    return jsonResponse({ error: "source_text_de and task_it required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B1+/B2 Italienisch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Sprachmittlung-Aufgabe auf ITALIENISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere und vermittle die Inhalte, übersetze NICHT wörtlich
- Verwende angemessenes, idiomatisches Italienisch (registro standard/formale)
- Zielumfang: 200–300 Wörter

Formatiere als Markdown: Erst die Lösung auf Italienisch, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_it, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ]);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ITALIENISCH: MODEL ANSWER (Schreiben) ================= */
export async function handleModelAnswerItalianWriting(request, env) {
  const { article_text, task_1, task_2, task_3, selected_tasks } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Italienisch, Niveau B2).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf ITALIENISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE angegebenen Aufgaben
- Belege Aussagen mit Textzitaten (citazioni)
- Analysiere Stilmittel (figure retoriche: metafora, similitudine, personificazione, iperbole, enumerazione, parallelismi, ripetizione, contrasto, discorso diretto) wenn gefordert
- Verwende angemessenes, idiomatisches Italienisch
- Zielumfang: 600-1000 Wörter insgesamt

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe. Am Ende unter "---" eine kurze Reflexion auf Deutsch.`;

  let userContent = `AUSGANGSTEXT:\n${truncate(article_text, 15000)}\n\n`;
  if (task_1) userContent += `AUFGABE 1 (Presentazione):\n${truncate(task_1, 1000)}\n\n`;
  if (task_2) userContent += `AUFGABE 2 (Analisi):\n${truncate(task_2, 1000)}\n\n`;
  if (task_3) userContent += `AUFGABE 3:\n${truncate(task_3, 1000)}\n\n`;
  if (selected_tasks) userContent += `Bearbeitete Aufgaben: ${selected_tasks}\n`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= ITALIENISCH: GRADE ================= */
export async function handleGradeItalian(request, env) {
  const body = await request.json();
  const { source_text_de, task_it, task_en, student_text_it, student_text_en, rubric_prompt, images } = body;

  const task = task_it || task_en;
  const studentText = student_text_it || student_text_en;

  if (!studentText) {
    return jsonResponse({ error: "student_text_it erforderlich." }, 400, env);
  }

  const systemPrompt = rubric_prompt || `Du bist ein erfahrener Italienischlehrer am bayerischen Gymnasium.
Bewerte die Schülerarbeit nach dem ISB-Bewertungsraster mit Notenpunkten (0-15 NP).
Antworte NUR mit validem JSON:
{"inhalt_np": <0-15>, "sprache_np": <0-15>, "gesamt_np": <0-15>, "feedback": "<Markdown-Feedback auf Deutsch>", "korrektur_text": "<Vollständiger Schülertext mit Fehlermarkierungen>", "fehlende_aspekte": [...]}
BERECHNUNG: gesamt_np = round(inhalt_np * 0.4 + sprache_np * 0.6)
SPERRKLAUSEL: Wenn inhalt_np ODER sprache_np = 0, dann gesamt_np maximal 3.`;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(systemPrompt, 5000) + bilderHinweis + UEBUNGSAUFGABEN_ANWEISUNG },
    {
      role: "user",
      content: buildUserContent(
        `Deutscher Quelltext:\n${truncate(source_text_de, 15000)}\n\n` +
        `Aufgabenstellung:\n${truncate(task, 5000)}\n\n` +
        `Schülertext (Italienisch):\n${truncate(studentText, 15000)}`, images)
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { temperature: 0.3 });

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
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { content_textstructure: null, language: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= ETHIK: PARSE TASK (OCR) ================= */
