import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_TEXT, UEBUNGSAUFGABEN_ANWEISUNG } from '../config.js';

export async function handleParseTaskFrench(request, env) {
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
      text: `Diese Bilder zeigen eine Französisch-Abitur Aufgabe (Sprachmittlung oder Schreiben). Extrahiere:
1. Die Aufgabenstellung (task_instruction) — kann auf Französisch oder Deutsch formuliert sein
2. Den Quelltext (article_text) — bei Sprachmittlung auf Deutsch, bei Schreiben auf Französisch
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

/* ================= FRANZÖSISCH: MODEL ANSWER (Sprachmittlung) ================= */
export async function handleModelAnswerFrench(request, env) {
  const { source_text_de, task_fr } = await request.json();
  if (!source_text_de || !task_fr) {
    return jsonResponse({ error: "source_text_de and task_fr required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B1+/B2 Französisch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Sprachmittlung-Aufgabe auf FRANZÖSISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere und vermittle die Inhalte, übersetze NICHT wörtlich
- Verwende angemessenes, idiomatisches Französisch (registre courant/soutenu)
- Zielumfang: 200–300 Wörter

Formatiere als Markdown: Erst die Lösung auf Französisch, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_fr, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ], 4000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= FRANZÖSISCH: MODEL ANSWER (Schreiben) ================= */
export async function handleModelAnswerFrenchWriting(request, env) {
  const { article_text, task_1, task_2, task_3, selected_tasks } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Französisch, Niveau B2).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf FRANZÖSISCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE angegebenen Aufgaben
- Belege Aussagen mit Textzitaten (citations)
- Analysiere Stilmittel (procédés stylistiques) wenn gefordert
- Verwende angemessenes, idiomatisches Französisch
- Zielumfang: 600-1000 Wörter insgesamt

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe. Am Ende unter "---" eine kurze Reflexion auf Deutsch.`;

  let userContent = `AUSGANGSTEXT:\n${truncate(article_text, 15000)}\n\n`;
  if (task_1) userContent += `AUFGABE 1 (Présentation):\n${truncate(task_1, 1000)}\n\n`;
  if (task_2) userContent += `AUFGABE 2 (Analyse):\n${truncate(task_2, 1000)}\n\n`;
  if (task_3) userContent += `AUFGABE 3:\n${truncate(task_3, 1000)}\n\n`;
  if (selected_tasks) userContent += `Bearbeitete Aufgaben: ${selected_tasks}\n`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= FRANZÖSISCH: GRADE ================= */
export async function handleGradeFrench(request, env) {
  const body = await request.json();
  const { source_text_de, task_fr, task_en, student_text_fr, student_text_en, rubric_prompt, images } = body;

  const task = task_fr || task_en;
  const studentText = student_text_fr || student_text_en;

  if (!studentText) {
    return jsonResponse({ error: "student_text_fr erforderlich." }, 400, env);
  }

  const systemPrompt = rubric_prompt || `Du bist ein erfahrener Französischlehrer am bayerischen Gymnasium.
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
        `Schülertext (Französisch):\n${truncate(studentText, 15000)}`, images)
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

/* ================= FRANZÖSISCH: LISTENING GRADE ================= */
export async function handleGradeListeningFrench(request, env) {
  const body = await request.json();
  const { questions, student_answers, transcript } = body;

  if (!questions || !student_answers) {
    return jsonResponse({ error: "questions and student_answers required" }, 400, env);
  }

  const shortQuestions = [];
  let autoPoints = 0;
  let autoMax = 0;
  const autoResults = [];

  for (const q of questions) {
    const answer = student_answers[q.id];
    if (q.type === "mc" || q.type === "tf") {
      const isCorrect = answer && answer.toLowerCase() === String(q.correct).toLowerCase();
      const pts = isCorrect ? q.points : 0;
      autoPoints += pts;
      autoMax += q.points;
      autoResults.push({
        id: q.id,
        type: q.type,
        question: q.question,
        student_answer: answer || "(keine Antwort)",
        correct_answer: q.correct,
        points_awarded: pts,
        max_points: q.points,
        is_correct: isCorrect
      });
    } else if (q.type === "short") {
      shortQuestions.push({ ...q, student_answer: answer || "" });
    }
  }

  let shortResults = [];
  let shortPoints = 0;
  let shortMax = 0;

  if (shortQuestions.length > 0) {
    const shortPrompt = shortQuestions.map(function(q) {
      return `Frage ${q.id}: ${q.question}\nMusterantwort: ${q.sample_answer}\nSchülerantwort: ${q.student_answer || "(keine Antwort)"}\nMax. Punkte: ${q.points}`;
    }).join("\n\n");

    const gradeRes = await callOpenAI(env, [
      {
        role: "system",
        content: `Du bist ein erfahrener Französischlehrer und bewertest Kurzantworten einer Compréhension orale.
Vergleiche die Schülerantwort semantisch mit der Musterantwort. Der Schüler muss nicht exakt die gleichen Worte verwenden – es geht um den Inhalt. Die Antworten sind auf Französisch.

Bewertungsregeln:
- Volle Punktzahl: Inhaltlich korrekt und vollständig
- Halbe Punktzahl: Teilweise korrekt oder unvollständig
- 0 Punkte: Falsch oder keine Antwort

Antworte NUR mit validem JSON:
{"results": [{"id": <number>, "points_awarded": <number>, "max_points": <number>, "feedback": "<kurze Begründung auf Deutsch>"}]}`
      },
      { role: "user", content: shortPrompt }
    ], 3000, { temperature: 0.3 });

    try {
      const parsed = extractJSON(gradeRes);
      shortResults = (parsed.results || []).map(function(r) {
        var q = shortQuestions.find(function(sq) { return sq.id === r.id; });
        shortPoints += r.points_awarded || 0;
        shortMax += (q ? q.points : r.max_points || 2);
        return {
          id: r.id,
          type: "short",
          question: q ? q.question : "",
          student_answer: q ? q.student_answer : "",
          correct_answer: q ? q.sample_answer : "",
          points_awarded: r.points_awarded || 0,
          max_points: q ? q.points : r.max_points || 2,
          feedback: r.feedback || ""
        };
      });
    } catch (e) {
      for (const q of shortQuestions) {
        shortMax += q.points;
        shortResults.push({
          id: q.id,
          type: "short",
          question: q.question,
          student_answer: q.student_answer,
          correct_answer: q.sample_answer,
          points_awarded: 0,
          max_points: q.points,
          feedback: "Konnte nicht automatisch bewertet werden."
        });
      }
    }
  }

  const totalPoints = autoPoints + shortPoints;
  const maxPoints = autoMax + shortMax;
  const percentage = maxPoints > 0 ? Math.round(totalPoints / maxPoints * 100) : 0;

  let notenpunkte;
  if (percentage >= 95) notenpunkte = 15;
  else if (percentage >= 90) notenpunkte = 14;
  else if (percentage >= 85) notenpunkte = 13;
  else if (percentage >= 80) notenpunkte = 12;
  else if (percentage >= 75) notenpunkte = 11;
  else if (percentage >= 70) notenpunkte = 10;
  else if (percentage >= 65) notenpunkte = 9;
  else if (percentage >= 60) notenpunkte = 8;
  else if (percentage >= 55) notenpunkte = 7;
  else if (percentage >= 50) notenpunkte = 6;
  else if (percentage >= 45) notenpunkte = 5;
  else if (percentage >= 40) notenpunkte = 4;
  else if (percentage >= 33) notenpunkte = 3;
  else if (percentage >= 27) notenpunkte = 2;
  else if (percentage >= 20) notenpunkte = 1;
  else notenpunkte = 0;

  const gradeMap = {15:"1+",14:"1",13:"1-",12:"2+",11:"2",10:"2-",9:"3+",8:"3",7:"3-",6:"4+",5:"4",4:"4-",3:"5+",2:"5",1:"5-",0:"6"};
  const grade = gradeMap[notenpunkte] || "6";

  const allResults = autoResults.concat(shortResults).sort(function(a, b) { return a.id - b.id; });

  return jsonResponse({
    results: allResults,
    total_points: totalPoints,
    max_points: maxPoints,
    percentage: percentage,
    notenpunkte: notenpunkte,
    grade: grade
  }, 200, env);
}
