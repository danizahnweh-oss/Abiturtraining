import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_TEXT, UEBUNGSAUFGABEN_ANWEISUNG } from '../config.js';

export async function handleGenerate(request, env) {
  const body = await request.json();
  const { topic, source_len_words, prompt_template } = body;

  if (!prompt_template || typeof prompt_template !== "string") {
    return jsonResponse({ error: "prompt_template required" }, 400, env);
  }

  const safeTopic = truncate(topic || "", 500);
  const prompt = prompt_template
    .replace(/\{topic\}/g, safeTopic)
    .replace(/\$\{topic\}/g, safeTopic)
    .replace(/\{length\}/g, String(source_len_words || 600))
    .replace(/\$\{length\}/g, String(source_len_words || 600));

  const wordTarget = source_len_words || 700;
  const estimatedTokens = Math.round(wordTarget * 1.5) + 1200;
  const maxTokens = Math.min(Math.max(estimatedTokens, 2500), 8000);

  const openaiRes = await callOpenAI(env, [
    {
      role: "system",
      content: `You are an Abitur exam generator. Return valid JSON only. No markdown fences. No preamble.
CRITICAL: The JSON must be valid. All string values must properly escape special characters.`
    },
    { role: "user", content: truncate(prompt, 10000) }
  ], maxTokens);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= ENGLISCH: AUFGABEN AUS EIGENEM TEXT GENERIEREN (Writing) ================= */
export async function handleGenerateFromTextWriting(request, env) {
  const body = await request.json();
  const customText = body.custom_text;
  if (!customText || customText.trim().length < 50) {
    return jsonResponse({ error: "Bitte einen englischen Text mit mindestens 50 Zeichen eingeben." }, 400, env);
  }
  const level = body.level || "gA";
  const levelDesc = level === "eA" ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Englisch (Prüfungsteil B: Schreiben).
Dir wird ein englischer Text gegeben, den ein Schüler hochgeladen hat. Erstelle dazu passende Abitur-Schreibaufgaben im Stil des bayerischen Abiturs.

WICHTIG: Verändere den Text NICHT. Verwende ihn exakt so wie er ist.

NIVEAU: ${levelDesc}

Erstelle DREI Aufgaben zum Text:

Aufgabe 1 (30%): Eine kurze, präzise Outline-Aufgabe (1-2 Sätze).
- z.B. "Outline the main arguments presented in the article."

Aufgabe 2 (30%): Eine kurze, präzise Analyse-Aufgabe (1-2 Sätze).
- z.B. "Analyse the writer's attitude. Focus on the use of language."

Aufgabe 3 (40%): ZWEI Wahlaufgaben (3.1 und 3.2):
- 3.1: Ein Zitat aus dem Text + "Taking the quotation as a starting point, assess/discuss..." (1 Satz)
- 3.2: Gestaltendes Schreiben (z.B. Brief, Rede, Dialog) mit kurzer Situationsbeschreibung + Aufgabe (2-3 Sätze)

ABSOLUT KEINE LÖSUNGSHINWEISE IN KLAMMERN!

Antworte NUR mit validem JSON:
{
  "headline": "Titel/Thema des Textes",
  "source_info": "Autor, Quelle (falls erkennbar, sonst leer)",
  "article_text": "DER ORIGINALTEXT UNVERÄNDERT",
  "task_1": "Outline-Aufgabe...",
  "task_2": "Analyse-Aufgabe...",
  "task_3_1": "Stellungnahme-Aufgabe...",
  "task_3_1_quote": "Zitat aus dem Text für 3.1",
  "task_3_2": "Gestaltendes Schreiben Aufgabe...",
  "task_3_2_situation": "Situationsbeschreibung für 3.2"
}`;

  const userPrompt = `Hier ist der englische Text, zu dem du Aufgaben erstellen sollst:

---
${customText.substring(0, 8000)}
---

Erstelle drei Schreibaufgaben (Outline, Analyse, Stellungnahme/Gestaltendes Schreiben) im Abitur-Stil.
Der Text oben soll UNVERÄNDERT als "article_text" im JSON erscheinen.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= ENGLISCH: MEDIATION AUS EIGENEM TEXT GENERIEREN ================= */
export async function handleGenerateFromTextMediation(request, env) {
  const body = await request.json();
  const customText = body.custom_text;
  if (!customText || customText.trim().length < 50) {
    return jsonResponse({ error: "Bitte einen deutschen Text mit mindestens 50 Zeichen eingeben." }, 400, env);
  }

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Englisch (Mediation/Sprachmittlung).
Dir wird ein deutscher Quelltext gegeben, den ein Schüler hochgeladen hat. Erstelle dazu eine passende Mediation-Aufgabenstellung im Stil des bayerischen Abiturs.

WICHTIG: Verändere den Text NICHT. Verwende ihn exakt so wie er ist.

Erstelle eine KOMPAKTE englische Aufgabenstellung (3-5 Sätze) im authentischen Stil bayerischer Abiturprüfungen:
- Erster Satz: Beschreibe kurz die Situation des Schülers (z.B. Ehrenamt, Austauschprogramm, Projekt).
- Zweiter Satz: Erkläre den konkreten Anlass, warum ein Text verfasst werden muss.
- Letzter Satz: Beginne mit "Write a/an [Textsorte] on..." und nenne die inhaltlichen Aspekte als natürlicher Fließtext.
- ABSOLUT KEINE LÖSUNGSHINWEISE IN KLAMMERN!

Antworte NUR mit validem JSON:
{
  "headline": "Titel/Thema des Quelltextes",
  "article_text": "DER ORIGINALTEXT UNVERÄNDERT",
  "task_instruction": "Die kompakte englische Aufgabenstellung in 3-5 Sätzen..."
}`;

  const userPrompt = `Hier ist der deutsche Quelltext, zu dem du eine Mediation-Aufgabe erstellen sollst:

---
${customText.substring(0, 8000)}
---

Erstelle eine authentische Mediation-Aufgabenstellung im bayerischen Abitur-Stil.
Der Text oben soll UNVERÄNDERT als "article_text" im JSON erscheinen.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 4000);

  return jsonResponse(extractJSON(openaiRes), 200, env);
}

/* ================= GENERISCHES OCR: TEXT EXTRAHIEREN ================= */
export async function handleOCRText(request, env) {
  const body = await request.json();
  const images = body.images;
  const language = body.language || "auto";
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const langHint = language === "de"
    ? "einen deutschen Text"
    : language === "en"
      ? "einen englischen Text"
      : "einen Text";

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen ${langHint} (z.B. einen Zeitungsartikel, Essay, Buchseite oder Auszug).
Extrahiere den KOMPLETTEN Text aus den Bildern so genau wie möglich.

Antworte NUR mit validem JSON:
{"text": "Der extrahierte Text...", "title": "Titel falls erkennbar, sonst leer"}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ENGLISCH: GRADE ================= */
export async function handleGrade(request, env) {
  const body = await request.json();
  const { source_text_de, task_en, student_text_en, rubric_prompt, images } = body;

  const messages = [
    {
      role: "system",
      content: `You are a strict German Abitur English teacher grading a Sprachmittlung (mediation).
You must grade using the official ISB Bewertungsraster with Notenpunkte (0-15 NP).
Return your evaluation in JSON format ONLY:
{
  "inhalt_np": <number 0-15>,
  "sprache_np": <number 0-15>,
  "gesamt_np": <number 0-15>,
  "feedback": "<detailed feedback in German with Markdown formatting>",
  "korrektur_text": "<Der VOLLSTÄNDIGE Schülertext. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe X", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}]
}
CALCULATION: gesamt_np = round(inhalt_np * 0.4 + sprache_np * 0.6)
SPERRKLAUSEL: If inhalt_np OR sprache_np is 0, gesamt_np must be at most 3.
IMPORTANT: Return ONLY valid JSON. No markdown fences.` + ((images && images.length) ? BILDER_HINWEIS_TEXT : "") + UEBUNGSAUFGABEN_ANWEISUNG
    },
    {
      role: "user",
      content: buildUserContent(
        `Deutscher Quelltext:\n${truncate(source_text_de, 15000)}\n\n` +
        `Englische Aufgabenstellung:\n${truncate(task_en, 5000)}\n\n` +
        `Schülertext (Englisch):\n${truncate(student_text_en, 15000)}\n\n` +
        `Bewertungsraster:\n${truncate(rubric_prompt, 5000)}`, images)
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
      corrections: parsed.corrections || "",
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    const contentMatch = openaiRes.match(/inhalt_np["\s:]*(\d{1,2})/i);
    const langMatch = openaiRes.match(/sprache_np["\s:]*(\d{1,2})/i);
    const totalMatch = openaiRes.match(/gesamt_np["\s:]*(\d{1,2})/i);

    const contentScore = contentMatch ? Math.min(parseInt(contentMatch[1]), 15) : null;
    const langScore = langMatch ? Math.min(parseInt(langMatch[1]), 15) : null;
    let totalScore = totalMatch ? Math.min(parseInt(totalMatch[1]), 15) : null;

    if (totalScore == null && contentScore != null && langScore != null) {
      totalScore = Math.round(contentScore * 0.4 + langScore * 0.6);
      if (contentScore === 0 || langScore === 0) totalScore = Math.min(totalScore, 3);
    }

    return jsonResponse({
      scores: { content_textstructure: contentScore, language: langScore, total: totalScore },
      feedback: openaiRes,
      feedback_kurz: [],
      corrections: "",
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= LISTENING COMPREHENSION: GENERATE ================= */
export async function handleGenerateListening(request, env) {
  const body = await request.json();
  const { topic, format, prompt_template } = body;

  const safeTopic = truncate(topic || "Science & Technology", 500);
  const safeFormat = truncate(format || "news report", 200);

  let prompt;
  if (prompt_template && typeof prompt_template === "string") {
    prompt = prompt_template
      .replace(/\{topic\}/g, safeTopic)
      .replace(/\{format\}/g, safeFormat);
  } else {
    prompt = `Du bist ein erfahrener Englischlehrer am bayerischen Gymnasium und erstellst eine Listening Comprehension Aufgabe für das Abitur (Niveau B2/C1).

THEMA: ${safeTopic}
FORMAT: ${safeFormat}

Erstelle einen englischen Hörtext und passende Fragen.

TEIL 1 – HÖRTEXT:
- 400–600 Wörter, authentisch klingender englischer Text
- Format: ${safeFormat} (z.B. Nachrichtenbericht, Interview, Vortrag, Dialog)
- Sprachniveau B2/C1 (Oberstufe)
- Natürliche Sprache mit klarer Struktur
- WICHTIG für TTS-Sprecherzuordnung: Jede Sprechzeile MUSS mit "Sprechername: " beginnen (ohne Klammern!), z.B.:
  Reporter: Welcome to today's programme.
  Expert: Thank you for having me.
- Verwende genau 2 Sprecher (z.B. Reporter + Expert, Interviewer + Guest, Host + Scientist)
- Bei Monolog-Formaten (Vortrag, Nachrichtenbericht): Verwende nur 1 Sprecher (z.B. "Presenter: ...")
- Der Text muss beim Hören gut verständlich sein (keine zu komplexen Schachtelsätze)

TEIL 2 – FRAGEN (insgesamt 20 Punkte):
Erstelle einen Mix aus drei Fragetypen:

A) Multiple Choice (5 Fragen, je 1 Punkt = 5 Punkte):
- 4 Optionen (A, B, C, D), genau eine richtig
- Fragen zur Hauptaussage, Details und Schlussfolgerungen

B) True / False / Not Given (5 Fragen, je 1 Punkt = 5 Punkte):
- Aussagen zum Text
- "true" = im Text so gesagt
- "false" = im Text das Gegenteil gesagt
- "not_given" = im Text nicht erwähnt

C) Kurzantworten (5 Fragen, je 2 Punkte = 10 Punkte):
- Offene Fragen, die in 1-2 Sätzen beantwortet werden
- Beziehen sich auf Argumentation, Meinungen oder Zusammenhänge

WICHTIG: Die Fragen sollen in der Reihenfolge des Textes gestellt werden (chronologisch).
KEINE LÖSUNGSHINWEISE IN KLAMMERN: Nenne in den Fragestellungen NIEMALS konkrete Beispiele oder Hinweise in Klammern. Die Schüler müssen selbst erkennen, worauf sich die Frage bezieht.

OUTPUT FORMAT – Antworte NUR mit reinem JSON:
{
  "title": "Kurzer englischer Titel",
  "transcript": "Der vollständige Hörtext...",
  "format": "${safeFormat}",
  "speakers": ["Reporter", "Expert"],
  "questions": [
    {"id": 1, "type": "mc", "question": "What is the main topic of the report?", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": "B", "points": 1},
    {"id": 6, "type": "tf", "question": "The expert claims that...", "correct": "true", "points": 1},
    {"id": 11, "type": "short", "question": "Explain why the speaker believes...", "sample_answer": "The speaker believes... because...", "points": 2}
  ],
  "total_points": 20
}`;
  }

  const openaiRes = await callOpenAI(env, [
    {
      role: "system",
      content: "You are a Listening Comprehension exam generator for the Bavarian Abitur. Return valid JSON only. No markdown fences. No preamble. All questions must be in English."
    },
    { role: "user", content: truncate(prompt, 12000) }
  ], 6000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= LISTENING COMPREHENSION: GRADE ================= */
export async function handleGradeListening(request, env) {
  const body = await request.json();
  const { questions, student_answers, transcript } = body;

  if (!questions || !student_answers) {
    return jsonResponse({ error: "questions and student_answers required" }, 400, env);
  }

  // MC und True/False clientseitig auswerten – nur Kurzantworten an KI senden
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

  // Kurzantworten per KI bewerten
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
        content: `Du bist ein erfahrener Englischlehrer und bewertest Kurzantworten einer Listening Comprehension.
Vergleiche die Schülerantwort semantisch mit der Musterantwort. Der Schüler muss nicht exakt die gleichen Worte verwenden – es geht um den Inhalt.

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
      // Fallback: 0 Punkte für alle Kurzantworten
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

  // Notenpunkte berechnen (0-15 NP)
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

  // Schulnote
  const gradeMap = {15:"1+",14:"1",13:"1-",12:"2+",11:"2",10:"2-",9:"3+",8:"3",7:"3-",6:"4+",5:"4",4:"4-",3:"5+",2:"5",1:"5-",0:"6"};
  const grade = gradeMap[notenpunkte] || "6";

  // Alle Ergebnisse zusammenführen und nach ID sortieren
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

/* ================= ENGLISCH: OCR ================= */
export async function handleOCR(request, env) {
  const { image_base64 } = await request.json();
  if (!image_base64) {
    return jsonResponse({ error: "image_base64 required" }, 400, env);
  }

  const content = [
    { type: "text", text: `Transkribiere den gesamten handgeschriebenen Text aus diesem Bild. Regeln:
- Mathematische Formeln als LaTeX: $\\frac{a}{b}$, $\\int_0^1 x^2\\,dx$, $\\sqrt{x}$, $e^{-x}$
- Chemische Formeln: H₂O, NaOH, CH₃COOH, Reaktionsgleichungen mit →
- Physikalische Einheiten beibehalten: m/s, kg, N, J
- Unsichere/unleserliche Stellen mit [?] markieren
- Gib NUR den transkribierten Text zurück, keine Erklärungen.` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 2000, { model: "gpt-5.2", temperature: 0.1, jsonMode: false });
  return jsonResponse({ text: text || "" }, 200, env);
}

/* ================= BWR: OCR (BWR-spezifische Handschrift-Transkription) ================= */
export async function handleOCRBWR(request, env) {
  const { image_base64 } = await request.json();
  if (!image_base64) {
    return jsonResponse({ error: "image_base64 required" }, 400, env);
  }

  const content = [
    { type: "text", text: `Transkribiere die handgeschriebene BwR-Lösung (Betriebswirtschaftslehre mit Rechnungswesen) aus diesem Bild.

WICHTIG – BWR-SPEZIFISCHE REGELN:

1. TABELLEN als Markdown-Tabellen darstellen:
   - Bilanzen/Strukturbilanzen: | Aktiva | € | Passiva | € |
   - BAB: | Kostenart | Gesamt | Material | Fertigung | ... |
   - Tilgungspläne: | Jahr | Restschuld | Zinsen | Tilgung | Annuität |
   - Ergebnisverwendung: | Position | Betrag |
   - Kapitalwert-Tabellen: | Jahr | Einzahlung | Auszahlung | Überschuss | AZF | Barwert |
   - Plankostenrechnung: | Größe | Wert |

2. BUCHUNGSSÄTZE im Format:
   Soll-Konto [Betrag] an Haben-Konto [Betrag]

3. STAFFELRECHNUNGEN strukturiert:
   Listenpreis: 50.000,00 €
   - Rabatt 20 %: 10.000,00 €
   = Zieleinkaufspreis: 40.000,00 €
   - Skonto 2 %: 800,00 €
   = Bareinkaufspreis: 39.200,00 €
   + Bezugskosten: 1.500,00 €
   = Anschaffungskosten: 40.700,00 €

4. BERECHNUNGEN mit Ansatz:
   Formelname: Formel
   Einsetzen der Werte
   = Ergebnis mit Einheit

5. KENNZAHLEN:
   Name der Kennzahl
   Formel: z.B. EK-Quote = EK / GK × 100
   Berechnung: 450.000 / 1.200.000 × 100
   = 37,50 %

6. ALLGEMEINE REGELN:
   - Geldbeträge mit € und 2 Dezimalstellen: 12.345,67 €
   - Prozentsätze mit 2 Dezimalstellen: 37,50 %
   - Unsichere/unleserliche Stellen mit [?] markieren
   - Durchgestrichenes ignorieren
   - Unterstreichungen als **fett** markieren

Gib NUR den transkribierten Text zurück, keine Erklärungen oder Kommentare.` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 3000, { model: "gpt-5.2", temperature: 0.1, jsonMode: false });
  return jsonResponse({ text: text || "" }, 200, env);
}

/* ================= ENGLISCH: PARSE TASK ================= */
export async function handleParseTask(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur Sprachmittlung Aufgabe. Extrahiere:
1. Die englische Aufgabenstellung (task_instruction)
2. Den deutschen Quelltext (article_text)
3. Die Überschrift/Titel (headline)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "article_text": "...", "headline": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 4000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= ENGLISCH: MODEL ANSWER ================= */
export async function handleModelAnswer(request, env) {
  const { source_text_de, task_en } = await request.json();
  if (!source_text_de || !task_en) {
    return jsonResponse({ error: "source_text_de and task_en required" }, 400, env);
  }

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler (Niveau B2/C1).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für die Mediation-Aufgabe auf ENGLISCH.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Halte dich an die Aufgabenstellung
- Paraphrasiere, übersetze NICHT wörtlich
- Zielumfang: 200–280 Wörter

Formatiere als Markdown: Erst die Lösung, dann unter "---" eine kurze Erklärung auf Deutsch.`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `AUFGABE:\n${truncate(task_en, 5000)}\n\nQUELLTEXT:\n${truncate(source_text_de, 15000)}` }
  ]);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= DEUTSCH: PARSE TASK (OCR) ================= */
