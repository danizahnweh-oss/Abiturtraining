// Handler: Features (Detail-Feedback, Rewrite)
import { jsonResponse, truncate, extractJSON } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { SUBJECT_TYPES_MAP, SUBJECT_NAMES } from './student.js';

/* ================= DETAIL-FEEDBACK (Lazy-Load) ================= */

export async function handleDetailFeedback(request, env) {
  const body = await request.json();
  const { rubric_prompt, task_instruction, primary_text, student_text, scores, feedback_kurz } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  const kurzText = (feedback_kurz && feedback_kurz.length)
    ? feedback_kurz.join("; ")
    : "Keine Kurzfeedback-Punkte vorhanden.";

  const scoresText = scores
    ? Object.entries(scores).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "Keine Noten vorhanden.";

  const systemPrompt = `Du bist ein erfahrener Lehrer. Schreibe ein ausführliches, konstruktives Feedback zu einer Schülerarbeit auf Deutsch.
Verwende die bereits ermittelten Noten und Kurzfeedback-Punkte als Grundlage.
Schreibe in Markdown-Format mit Überschriften (##) und Absätzen.

Bewertungskriterien:
${truncate(rubric_prompt, 3000)}`;

  const userPrompt = `Aufgabenstellung:
${truncate(task_instruction || "", 2000)}

${primary_text ? "Ausgangstext:\n" + truncate(primary_text, 3000) + "\n" : ""}
Noten: ${scoresText}
Kurzfeedback: ${kurzText}

Schülertext:
${truncate(student_text, 8000)}

Schreibe ein ausführliches Feedback (ca. 300–500 Wörter) mit:
- Detaillierte Stärken der Arbeit
- Konkrete Verbesserungsvorschläge mit Beispielen aus dem Text
- Tipps für die nächste Klausur

Antworte NUR mit dem Feedback als Markdown-Text (kein JSON, keine Codeblöcke).`;

  try {
    const result = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 3000, { temperature: 0.5 });

    return jsonResponse({ feedback: result }, 200, env);
  } catch (err) {
    console.error("Detail-Feedback Fehler:", err.message);
    return jsonResponse({ error: "Feedback konnte nicht generiert werden." }, 500, env);
  }
}

/* ================= REWRITE FEATURE ================= */

export async function handleRewrite(request, env) {
  const { student_text, type, feedback, topic } = await request.json();

  if (!student_text || !type) {
    return jsonResponse({ error: "student_text and type required" }, 400, env);
  }

  // Fach bestimmen
  const typeToSubject = {};
  for (const [subj, types] of Object.entries(SUBJECT_TYPES_MAP)) {
    for (const t of types) typeToSubject[t] = subj;
  }
  const subject = SUBJECT_NAMES[typeToSubject[type]] || type;

  // Sprache des Schuelers bestimmen
  let lang = "Deutsch";
  if (type === "mediation" || type === "writing") lang = "Englisch";
  else if (type.startsWith("french-")) lang = "Französisch";
  else if (type.startsWith("italian-")) lang = "Italienisch";
  else if (type.startsWith("latein")) lang = "Latein";

  const langHint = lang !== "Deutsch"
    ? `\nDer Schülertext ist auf ${lang}. Verbesserungen in derselben Sprache, Erklärungen auf Deutsch.`
    : "";

  const messages = [
    {
      role: "system",
      content: `Du bist ein erfahrener ${subject}-Lehrer am bayerischen Gymnasium (G9).
Deine Aufgabe: Analysiere den Schülertext und zeige 3–5 konkrete Verbesserungsvorschläge.

Für jeden Vorschlag:
- Zitiere die Originalstelle (max. 1-2 Sätze)
- Zeige die verbesserte Version
- Erkläre kurz warum die Verbesserung wichtig ist
- Ordne eine Kategorie zu

Kategorien: "Fachsprache", "Argumentation", "Struktur", "Stil", "Grammatik", "Inhalt", "Quellenarbeit"
${langHint}
Antworte ausschließlich im folgenden JSON-Format:
{
  "suggestions": [
    {
      "original": "Zitat aus dem Schülertext",
      "improved": "Verbesserte Version",
      "reason": "Kurze Begründung auf Deutsch",
      "category": "Kategorie"
    }
  ],
  "rewritten_paragraph": "Optional: Ein besonders schwacher Absatz komplett verbessert umgeschrieben (max. 150 Wörter)"
}`
    },
    {
      role: "user",
      content: `Fach: ${subject}
Thema: ${topic || "Nicht angegeben"}
Aufgabentyp: ${type}

Bisheriges Feedback:
${(feedback || "Kein Feedback vorhanden").substring(0, 3000)}

--- SCHÜLERTEXT ---
${student_text.substring(0, 8000)}`
    }
  ];

  try {
    const answer = await callOpenAI(env, messages, 2000, { temperature: 0.4, jsonMode: true });
    const result = extractJSON(answer);
    return jsonResponse({ success: true, ...result }, 200, env);
  } catch (e) {
    console.error("Rewrite fehlgeschlagen:", e.message);
    return jsonResponse({ error: "Rewrite-Analyse fehlgeschlagen: " + e.message }, 500, env);
  }
}
