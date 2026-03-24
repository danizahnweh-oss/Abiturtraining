import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, KORREKTUR_LATEIN, BILDER_HINWEIS_TEXT, klausurZeitHinweis, zeitanpassung, skaliereTokens } from '../config.js';

export async function handleParseTaskLatein(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Latein (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den lateinischen Text (latin_text) - vollständig
3. Die deutsche Übersetzung oder Materialien, falls vorhanden (primary_text)
4. Quellenangabe: Autor, Werk (primary_meta)

Antworte NUR mit validem JSON:
{"task_instruction": "...", "latin_text": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= LATEIN: GENERATE ================= */
export async function handleGenerateLatein(request, env) {
  const body = await request.json();
  const { autor, aufgabentyp, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 3);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const autorInhalte = {
    cicero: "Cicero: Reden, Rhetorik, Philosophie (De officiis, De re publica, Pro Murena, In Catilinam). Typisch: lange Perioden, rhetorische Fragen, Parallelismen, Klimax, Antithesen, Partizipialkonstruktionen.",
    seneca: "Seneca: Moralphilosophie, Epistulae morales, De brevitate vitae, De vita beata. Typisch: Brevitas, Pointen, Sentenzen, Parataxe, rhetorische Fragen, antithetischer Stil.",
    livius: "Livius: Geschichtsschreibung, Ab urbe condita (Exempla, moralische Vorbilder). Typisch: Periodenbau, indirekte Rede, Partizipialkonstruktionen, dramatische Erzählung, moralische Exempla.",
    vergil: "Vergil: Epos, Aeneis (Schicksal, pietas, fatum, Götterwelt). Typisch: Hexameter, Enjambements, Epitheta ornantia, Gleichnisse, pathetischer Stil, mythologische Anspielungen.",
    lyrik: "Lyrik: Catull (Liebeslyrik, Spottgedichte), Horaz (Oden, Satiren, Episteln, carpe diem). Typisch: verschiedene Versmaße, persönlicher Ton, Ironie, Wortspiele, Alliterationen, Metaphern."
  };

  const autorKey = (autor || "cicero").toLowerCase();
  const autorInfo = autorInhalte[autorKey] || autorInhalte.cicero;
  const schwerpunktLabel = schwerpunkt ? truncate(schwerpunkt, 200) : "frei wählbar";

  if (aufgabentyp === "uebersetzung") {
    const wortanzahl = isEA ? "~170 Wörter" : "~135 Wörter";
    const maxBE = totalBE;

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Übersetzungsaufgabe auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Übersetzungstexte (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Jeder Text kürzer und kompakter` : ''}

AUTOR UND STIL:
${autorInfo}

ANFORDERUNGEN:
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des gewählten Autors
- Der Text muss grammatisch korrektes klassisches Latein sein
- Verwende typische Konstruktionen des Autors (z.B. Ciceronische Perioden, Senecas Brevitas, Vergils Hexameter)
- Schwierigkeitsgrad: Abiturniveau Bayern
- Textlänge: ${wortanzahl}
- Erstelle Vokabelhilfen (Vokabelhilfen) für schwierige oder seltene Wörter (8-15 Hilfen)
- Erstelle eine versteckte Musterübersetzung ins Deutsche

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Übersetzen Sie den folgenden lateinischen Text ins Deutsche.",
  "latin_text": "Der vollständige lateinische Text (${wortanzahl})",
  "vokabelhilfen": [{"latein": "lateinisches Wort/Wendung", "deutsch": "deutsche Bedeutung"}, ...],
  "musteruebersetzung": "Die vollständige deutsche Musterübersetzung",
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema des Textes"
}`;

    const userPrompt = `Erstelle eine Latein-Übersetzungsaufgabe:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Textlänge: ${wortanzahl}, maximale BE: ${maxBE}

KRITISCH: Der lateinische Text muss AUTHENTISCH im Stil des Autors verfasst sein — grammatisch korrekt, mit typischen Stilmitteln und Konstruktionen. Er soll wie ein echter Abiturtext wirken.`;

    const openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 8000);

    const content = extractJSON(openaiRes);
    return jsonResponse(content, 200, env);

  } else {
    // Mode: interpretation
    const beHinfuehrend = isEA ? "4 × 4 = 16 BE" : "3 × 4 = 12 BE";
    const anzahlHinfuehrend = isEA ? 4 : 3;
    const beInterpretation = isEA ? "26 BE" : "21 BE";
    const beWeiterfuehrend = isEA ? "3 aus 5 × 6 = 18 BE" : "2 aus 4 × 6 = 12 BE";
    const anzahlWeiterfuehrendGesamt = isEA ? 5 : 4;
    const anzahlWeiterfuehrendWahl = isEA ? 3 : 2;
    const beGesamt = totalBE + " BE";

    const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine Interpretationsaufgabe (Aufgabenteil) auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${totalBE} BE sinnvoll auf die Abschnitte (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Interpretationsaufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

AUTOR UND STIL:
${autorInfo}

STRUKTUR DER AUFGABE:
Der Aufgabenteil besteht aus einem lateinischen Text mit deutscher Übersetzung und 3 Abschnitten:

Abschnitt I – Hinführende Aufgaben (${beHinfuehrend}):
- ${anzahlHinfuehrend} Teilaufgaben à 4 BE
- Anforderungsbereich I-II (Reproduktion/Transfer)
- Operatoren: benennen, gliedern, beschreiben, einordnen, zusammenfassen

Abschnitt II – Interpretationsaufgabe (${beInterpretation}):
- 1 große Interpretationsaufgabe
- Anforderungsbereich II-III (Transfer/Reflexion)
- Operatoren: analysieren, interpretieren, herausarbeiten, erläutern

Abschnitt III – Weiterführende Aufgaben (${beWeiterfuehrend}):
- ${anzahlWeiterfuehrendGesamt} Aufgaben zur Auswahl, davon ${anzahlWeiterfuehrendWahl} zu bearbeiten, je 6 BE
- Anforderungsbereich III (Reflexion/Problemlösung)
- Operatoren: vergleichen, beurteilen, erörtern, Stellung nehmen, in Beziehung setzen

Gesamt-BE Aufgabenteil: ${beGesamt}

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Stilmittel (Anapher, Klimax, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LATEINISCHER TEXT:
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des Autors (80-120 Wörter)
- Der Text muss grammatisch korrektes klassisches Latein sein
- Erstelle eine genaue deutsche Übersetzung dazu

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Aufgabenteil – Interpretation",
  "latin_text": "Der lateinische Text",
  "deutsche_uebersetzung": "Die deutsche Übersetzung des lateinischen Textes",
  "aufgaben": [
    {
      "abschnitt": "I",
      "titel": "Hinführende Aufgaben",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": 4},
        {"nr": "2", "text": "Aufgabentext...", "be": 4}
      ]
    },
    {
      "abschnitt": "II",
      "titel": "Interpretationsaufgabe",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": ${isEA ? 26 : 21}}
      ]
    },
    {
      "abschnitt": "III",
      "titel": "Weiterführende Aufgaben",
      "teilaufgaben": [
        {"nr": "1", "text": "Aufgabentext...", "be": 6},
        {"nr": "2", "text": "Aufgabentext...", "be": 6}
      ]
    }
  ],
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

    const userPrompt = `Erstelle eine Latein-Interpretationsaufgabe:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Abschnitt I: ${beHinfuehrend}, Abschnitt II: ${beInterpretation}, Abschnitt III: ${beWeiterfuehrend}
- Gesamt: ${beGesamt}

KRITISCH: Der lateinische Text muss AUTHENTISCH im Stil des Autors verfasst sein. Die Aufgaben müssen den bayerischen Abitur-Anforderungen entsprechen.
Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben, von denen ${anzahlWeiterfuehrendWahl} zu bearbeiten sind.`;

    const openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 10000);

    const content = extractJSON(openaiRes);
    return jsonResponse(content, 200, env);
  }
}

/* ================= LATEIN: GRADE ================= */
export async function handleGradeLatein(request, env) {
  const body = await request.json();
  const { aufgabentyp, task_instruction, latin_text, student_text, rubric_prompt, vokabelhilfen, musteruebersetzung, aufgaben, deutsche_uebersetzung, level, images } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  if (aufgabentyp === "uebersetzung") {
    const isEA = (level || "eA").toLowerCase() === "ea";
    const maxBE = isEA ? 60 : 45;

    let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;
    contextInfo += `Lateinischer Text:\n${truncate(latin_text, 5000)}\n\n`;
    if (vokabelhilfen && vokabelhilfen.length) {
      contextInfo += `Vokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
    }
    if (musteruebersetzung) {
      contextInfo += `Musterübersetzung:\n${truncate(musteruebersetzung, 8000)}\n\n`;
    }

    const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte die Übersetzung des Schülers nach dem Negativkorrekturverfahren.

BEWERTUNGSVERFAHREN – NEGATIVKORREKTUR:
- Maximale BE: ${maxBE}
- Schwerer Fehler (S) = 1 BE Abzug (falsche Bedeutung, fehlende Satzteile, grundlegend falsche Konstruktion)
- Leichter Fehler (L) = 0,5 BE Abzug (ungenaue Wortwahl, stilistisch ungeschickt, leichte Auslassung)
- Halber Fehler (H) = 0,25 BE Abzug (Rechtschreibung, Wiederholungsfehler, Kleinigkeiten)
- Erreichte BE = ${maxBE} minus Summe der Abzüge (mindestens 0)

BE-ZU-NP-UMRECHNUNG:
Berechne den Prozentsatz der erreichten BE (erreichte BE / ${maxBE} × 100) und verwende diese Tabelle:
≥95% = 15 NP, ≥90% = 14 NP, ≥85% = 13 NP, ≥80% = 12 NP, ≥75% = 11 NP,
≥70% = 10 NP, ≥65% = 9 NP, ≥60% = 8 NP, ≥55% = 7 NP, ≥50% = 6 NP,
≥45% = 5 NP, ≥40% = 4 NP, ≥33% = 3 NP, ≥27% = 2 NP, ≥20% = 1 NP, <20% = 0 NP

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Im korrektur_text: Markiere Übersetzungsfehler zusätzlich mit <mark class='fehler-ue' title='Korrektur: RICHTIG (Fehlertyp: S/L/H)'>FALSCH</mark>.

Antworte NUR mit validem JSON:
{
  "uebersetzung_be": <erreichte BE als Zahl>,
  "uebersetzung_np": <0-15>,
  "feedback": "Ausführliches Feedback zur Übersetzung...",
  "korrektur_text": "Markierter Schülertext...",
  "fehlende_aspekte": [{"aufgabe": "Übersetzung", "aspekte": ["...", "..."]}]
}`;

    const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
    const messages = [
      { role: "system", content: systemPrompt + bilderHinweis },
      { role: "user", content: buildUserContent(`${contextInfo}\nSchülerübersetzung:\n${truncate(student_text, 15000)}`, images) }
    ];

    const openaiRes = await callOpenAI(env, messages, 8000, { temperature: 0.3 });

    try {
      const parsed = extractJSON(openaiRes);
      const be = parsed.uebersetzung_be ?? null;
      const np = parsed.uebersetzung_np ?? null;

      return jsonResponse({
        scores: { uebersetzung: be, total: np },
        feedback: parsed.feedback || "",
        feedback_kurz: parsed.feedback_kurz || [],
        korrektur_text: parsed.korrektur_text || "",
        fehlende_aspekte: parsed.fehlende_aspekte || []
      }, 200, env);
    } catch {
      return jsonResponse({
        scores: { uebersetzung: null, total: null },
        feedback: openaiRes,
        feedback_kurz: [],
        korrektur_text: "",
        fehlende_aspekte: []
      }, 200, env);
    }

  } else {
    // Mode: interpretation
    let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;
    contextInfo += `Lateinischer Text:\n${truncate(latin_text, 5000)}\n\n`;
    if (deutsche_uebersetzung) {
      contextInfo += `Deutsche Übersetzung:\n${truncate(deutsche_uebersetzung, 5000)}\n\n`;
    }
    if (aufgaben && aufgaben.length) {
      contextInfo += `Aufgaben:\n${JSON.stringify(aufgaben).substring(0, 5000)}\n\n`;
    }

    const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte den Interpretationsteil des Schülers.

BEWERTUNG (Inhalt 70% + Darstellung 30%):
- verstehen_np (0-15): Inhaltliche Qualität — korrekte Textanalyse, Stilmittelkenntnis, historischer Kontext, Argumentation
- darstellung_np (0-15): Sprachliche Darstellung — Fachsprache, Ausdruck, Struktur, Kohärenz
- gesamt_np: verstehen_np × 0,7 + darstellung_np × 0,3 (gerundet)

WICHTIG – GANZE SÄTZE:
Antworten sollen in vollständigen Sätzen formuliert sein, nicht in Stichpunkten. Fußnoten sind erlaubt. Leichter Abzug bei darstellung_np nur wenn ausschließlich Stichworte statt ganzer Sätze verwendet werden.

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Antworte NUR mit validem JSON:
{
  "verstehen_np": <0-15>,
  "darstellung_np": <0-15>,
  "gesamt_np": <0-15>,
  "feedback": "Ausführliches Feedback...",
  "korrektur_text": "Markierter Schülertext...",
  "fehlende_aspekte": [{"aufgabe": "Abschnitt X", "aspekte": ["...", "..."]}]
}`;

    const bilderHinweis2 = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
    const messages = [
      { role: "system", content: systemPrompt + bilderHinweis2 },
      { role: "user", content: buildUserContent(`${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
    ];

    const openaiRes = await callOpenAI(env, messages, 8000, { temperature: 0.3 });

    try {
      const parsed = extractJSON(openaiRes);
      const verstehen = parsed.verstehen_np ?? null;
      const darstellung = parsed.darstellung_np ?? null;
      let gesamt = parsed.gesamt_np ?? null;

      if (gesamt == null && verstehen != null && darstellung != null) {
        gesamt = Math.round(verstehen * 0.7 + darstellung * 0.3);
        if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
      }

      return jsonResponse({
        scores: { verstehen, darstellung, total: gesamt },
        feedback: parsed.feedback || "",
        feedback_kurz: parsed.feedback_kurz || [],
        korrektur_text: parsed.korrektur_text || "",
        fehlende_aspekte: parsed.fehlende_aspekte || []
      }, 200, env);
    } catch {
      return jsonResponse({
        scores: { verstehen: null, darstellung: null, total: null },
        feedback: openaiRes,
        feedback_kurz: [],
        korrektur_text: "",
        fehlende_aspekte: []
      }, 200, env);
    }
  }
}

/* ================= LATEIN: MODEL ANSWER ================= */
export async function handleModelAnswerLatein(request, env) {
  const { aufgabentyp, task_instruction, latin_text, vokabelhilfen, musteruebersetzung, aufgaben, deutsche_uebersetzung } = await request.json();

  if (aufgabentyp === "uebersetzung") {
    // Return the stored model translation if available, otherwise generate one
    if (musteruebersetzung) {
      return jsonResponse({ model_answer: musteruebersetzung }, 200, env);
    }

    const systemPrompt = `Du bist ein Experte für lateinische Sprache und Übersetzung auf Abiturniveau (Bayern).
Erstelle eine vorbildliche deutsche Übersetzung des folgenden lateinischen Textes.

ANFORDERUNGEN:
- Die Übersetzung muss den lateinischen Text vollständig und genau wiedergeben
- Verwende gutes, idiomatisches Deutsch
- Halte dich eng am Originaltext, aber formuliere flüssig
- Berücksichtige den Stil des Autors in der Übersetzung`;

    let userContent = `Lateinischer Text:\n${truncate(latin_text, 5000)}`;
    if (vokabelhilfen && vokabelhilfen.length) {
      userContent += `\n\nVokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}`;
    }

    const answer = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ], 4000, { jsonMode: false });

    return jsonResponse({ model_answer: answer }, 200, env);

  } else {
    // Mode: interpretation — generate Fließtext model answer
    const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Latein (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende lateinische Fachbegriffe korrekt (z.B. Stilmittel, Metrik, historischer Kontext)
- Beziehe den lateinischen Text und die Übersetzung ein, zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, fundiertes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe/jeden Abschnitt. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

    let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
    userContent += `\n\nLATEINISCHER TEXT:\n${truncate(latin_text, 5000)}`;
    if (deutsche_uebersetzung) {
      userContent += `\n\nDEUTSCHE ÜBERSETZUNG:\n${truncate(deutsche_uebersetzung, 5000)}`;
    }
    if (aufgaben && aufgaben.length) {
      userContent += `\n\nAUFGABEN:\n${JSON.stringify(aufgaben).substring(0, 5000)}`;
    }

    const answer = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ], 5000, { jsonMode: false });

    return jsonResponse({ model_answer: answer }, 200, env);
  }
}

/* ================= LATEIN ABITUR: GENERATE (Teil A + B) ================= */
export async function handleGenerateAbiturLatein(request, env) {
  const body = await request.json();
  const { autor, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 300 : 240;
  const refBE = isEA ? 120 : 90;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const wortanzahlA = isEA ? "~170 Wörter" : "~135 Wörter";
  const beA = isEA ? "60 BE" : "45 BE";
  const beB = isEA ? "60 BE" : "45 BE";
  const beHinfuehrend = isEA ? "4 × 4 = 16 BE" : "3 × 4 = 12 BE";
  const anzahlHinfuehrend = isEA ? 4 : 3;
  const beInterpretation = isEA ? "26 BE" : "21 BE";
  const beWeiterfuehrend = isEA ? "3 aus 5 × 6 = 18 BE" : "2 aus 4 × 6 = 12 BE";
  const anzahlWeiterfuehrendGesamt = isEA ? 5 : 4;
  const anzahlWeiterfuehrendWahl = isEA ? 3 : 2;

  const autorInhalte = {
    cicero: "Cicero: Reden, Rhetorik, Philosophie (De officiis, De re publica, Pro Murena, In Catilinam). Typisch: lange Perioden, rhetorische Fragen, Parallelismen, Klimax, Antithesen.",
    seneca: "Seneca: Moralphilosophie, Epistulae morales, De brevitate vitae, De vita beata. Typisch: Brevitas, Pointen, Sentenzen, Parataxe, antithetischer Stil.",
    livius: "Livius: Geschichtsschreibung, Ab urbe condita (Exempla, moralische Vorbilder). Typisch: Periodenbau, indirekte Rede, dramatische Erzählung.",
    vergil: "Vergil: Epos, Aeneis (Schicksal, pietas, fatum, Götterwelt). Typisch: Hexameter, Enjambements, Gleichnisse, pathetischer Stil.",
    lyrik: "Lyrik: Catull (Liebeslyrik, Spottgedichte), Horaz (Oden, Satiren, Episteln, carpe diem). Typisch: verschiedene Versmaße, persönlicher Ton, Ironie."
  };

  const autorKey = (autor || "cicero").toLowerCase();
  const autorInfo = autorInhalte[autorKey] || autorInhalte.cicero;
  const schwerpunktLabel = schwerpunkt ? truncate(schwerpunkt, 200) : "frei wählbar";

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen.'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Latein (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Teil A (Übersetzung, ${beA}) und Teil B (Aufgabenteil, ${beB}) auf ${niveauLabel}.

AUTOR UND STIL:
${autorInfo}

TEIL A – ÜBERSETZUNG (${beA}):
- Generiere einen AUTHENTISCHEN lateinischen Text im Stil des Autors
- Textlänge: ${wortanzahlA}
- Grammatisch korrektes klassisches Latein mit typischen Konstruktionen des Autors
- Erstelle 8-15 Vokabelhilfen für schwierige/seltene Wörter
- Erstelle eine vollständige deutsche Musterübersetzung

TEIL B – AUFGABENTEIL (${beB}):
Wähle eine passende Gattung (Prosa oder Dichtung) für den zweiten Text.
- Generiere einen zweiten AUTHENTISCHEN lateinischen Text (80-120 Wörter) mit deutscher Übersetzung
- 3 Abschnitte:
  Abschnitt I – Hinführende Aufgaben (${beHinfuehrend}):
    ${anzahlHinfuehrend} Teilaufgaben à 4 BE, AFB I-II
  Abschnitt II – Interpretationsaufgabe (${beInterpretation}):
    1 große Aufgabe, AFB II-III
  Abschnitt III – Weiterführende Aufgaben (${beWeiterfuehrend}):
    ${anzahlWeiterfuehrendGesamt} Aufgaben zur Auswahl, davon ${anzahlWeiterfuehrendWahl} zu bearbeiten, je 6 BE, AFB III

Thematischer Schwerpunkt: ${schwerpunktLabel}${schwerpunktZusatz}

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Stilmittel (Anapher, Klimax, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE lateinische Texte und Aufgaben passend zum gewählten Autor! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "teil_a": {
    "task_instruction": "Übersetzen Sie den folgenden lateinischen Text ins Deutsche.",
    "latin_text": "EIGENEN authentischen lateinischen Text im Stil des gewählten Autors generieren (${wortanzahlA}). Grammatisch korrektes klassisches Latein mit typischen Konstruktionen.",
    "vokabelhilfen": [{"latein": "EIGENES schwieriges Wort", "deutsch": "EIGENE Bedeutung"}, {"latein": "...", "deutsch": "..."}, "8-15 Vokabelhilfen generieren"],
    "musteruebersetzung": "EIGENE vollständige deutsche Musterübersetzung des lateinischen Textes generieren"
  },
  "teil_b": {
    "task_instruction": "Aufgabenteil – [Prosa/Dichtung je nach gewählter Gattung]",
    "latin_text": "EIGENEN zweiten authentischen lateinischen Text generieren (80-120 Wörter)",
    "deutsche_uebersetzung": "EIGENE deutsche Übersetzung des zweiten Textes generieren",
    "aufgaben": [
      {"abschnitt": "I", "titel": "Hinführende Aufgaben", "teilaufgaben": [
        {"nr": "1", "text": "Ordnen Sie den Text einer literarischen Gattung zu und benennen Sie typische Merkmale, die diese Zuordnung stützen.", "be": 4},
        {"nr": "2", "text": "Arbeiten Sie die zentrale Aussage des Textes heraus und belegen Sie diese am lateinischen Original.", "be": 4},
        {"nr": "3", "text": "Bestimmen Sie die syntaktische Funktion der markierten Satzteile und benennen Sie die verwendeten Konstruktionen.", "be": 4}
      ]},
      {"abschnitt": "II", "titel": "Interpretationsaufgabe", "teilaufgaben": [
        {"nr": "1", "text": "Interpretieren Sie den Text unter Berücksichtigung der sprachlich-stilistischen Gestaltung und der historischen Einordnung. Gehen Sie dabei auf die Intention des Autors ein und belegen Sie Ihre Aussagen am lateinischen Text.", "be": ${isEA ? 26 : 21}}
      ]},
      {"abschnitt": "III", "titel": "Weiterführende Aufgaben", "teilaufgaben": [
        {"nr": "1", "text": "Vergleichen Sie die im Text vertretene Position mit einer anderen Ihnen bekannten antiken Sichtweise zum selben Thema.", "be": 6},
        {"nr": "2", "text": "Erörtern Sie die Aktualität der im Text formulierten Gedanken für die heutige Gesellschaft.", "be": 6},
        {"nr": "3", "text": "EIGENE weiterführende Aufgabe generieren (AFB III, 6 BE)", "be": 6},
        {"nr": "4", "text": "EIGENE weiterführende Aufgabe generieren (AFB III, 6 BE)", "be": 6}
      ]}
    ]
  },
  "autor": "${autor || "Cicero"}",
  "thema": "Konkretes Thema der Prüfung"
}
WICHTIG: Generiere ALLE Texte, Übersetzungen und Aufgaben vollständig ausformuliert! Die Aufgabentexte in Abschnitt I-III müssen konkret und auf den generierten Text bezogen sein. Verwende ANDERE Themen und Formulierungen als in den Beispielen! Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben (davon ${anzahlWeiterfuehrendWahl} zu bearbeiten).`;

  const userPrompt = `Erstelle eine vollständige Latein-Abiturprüfung:
- Autor: ${autor || "Cicero"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Teil A: Übersetzung (${beA}, ${wortanzahlA})
- Teil B: Aufgabenteil (${beB}) mit 3 Abschnitten

KRITISCH: Beide lateinischen Texte müssen AUTHENTISCH im Stil des Autors verfasst sein — grammatisch korrekt, mit typischen Stilmitteln.
Teil B Abschnitt III: Erstelle ${anzahlWeiterfuehrendGesamt} Aufgaben, von denen ${anzahlWeiterfuehrendWahl} zu bearbeiten sind.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= LATEIN ABITUR: GRADE ================= */
export async function handleGradeAbiturLatein(request, env) {
  const body = await request.json();
  const { student_text_a, student_text_b, rubric_prompt, task_instruction_a, task_instruction_b, latin_text_a, latin_text_b, vokabelhilfen, musteruebersetzung, deutsche_uebersetzung, aufgaben, level, images } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  const isEA = (level || "eA").toLowerCase() === "ea";
  const maxBEa = isEA ? 60 : 45;

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A (Übersetzung):\n${truncate(task_instruction_a, 3000)}\n\n`;
  if (latin_text_a) contextInfo += `Lateinischer Text (Teil A):\n${truncate(latin_text_a, 5000)}\n\n`;
  if (vokabelhilfen && vokabelhilfen.length) {
    contextInfo += `Vokabelhilfen:\n${vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
  }
  if (musteruebersetzung) contextInfo += `Musterübersetzung:\n${truncate(musteruebersetzung, 8000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B (Aufgabenteil):\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (latin_text_b) contextInfo += `Lateinischer Text (Teil B):\n${truncate(latin_text_b, 3000)}\n\n`;
  if (deutsche_uebersetzung) contextInfo += `Deutsche Übersetzung (Teil B):\n${truncate(deutsche_uebersetzung, 3000)}\n\n`;
  if (aufgaben && aufgaben.length) {
    contextInfo += `Aufgaben (Teil B):\n${JSON.stringify(aufgaben).substring(0, 5000)}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülerübersetzung (Teil A):\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext (Teil B – Aufgabenteil):\n${truncate(student_text_b, 10000)}`;

  const korrekturAnweisung = KORREKTUR_LATEIN;

  const systemPrompt = `Du bist ein erfahrener Latein-Korrektor für das bayerische Abitur.
Bewerte die GESAMTE Abiturprüfung (Teil A + Teil B).

TEIL A – ÜBERSETZUNG (Negativkorrektur):
- Maximale BE: ${maxBEa}
- Schwerer Fehler (S) = 1 BE Abzug, Leichter Fehler (L) = 0,5 BE, Halber Fehler (H) = 0,25 BE
- Erreichte BE = ${maxBEa} minus Abzüge (mindestens 0)
- BE→NP: ≥95%=15, ≥90%=14, ≥85%=13, ≥80%=12, ≥75%=11, ≥70%=10, ≥65%=9, ≥60%=8, ≥55%=7, ≥50%=6, ≥45%=5, ≥40%=4, ≥33%=3, ≥27%=2, ≥20%=1, <20%=0

TEIL B – AUFGABENTEIL (Inhalt 70% + Darstellung 30%):
- teil_b_np (0-15): Inhaltliche Qualität der Interpretation
- darstellung_np (0-15): Sprachliche Darstellung
- teil_b_gesamt_np = teil_b_np × 0,7 + darstellung_np × 0,3

WICHTIG – GANZE SÄTZE (Teil B):
Antworten sollen in vollständigen Sätzen formuliert sein, nicht in Stichpunkten. Leichter Abzug bei darstellung_np nur wenn ausschließlich Stichworte verwendet werden.

GESAMTNOTE:
- Gesamt NP = Durchschnitt aus Teil A NP und Teil B Gesamt NP (1:1 Verhältnis, gerundet)

${truncate(rubric_prompt, 5000)}
${korrekturAnweisung}

Antworte NUR mit validem JSON:
{
  "teil_a_be": <erreichte BE>,
  "teil_a_np": <0-15>,
  "teil_b_np": <0-15>,
  "darstellung_np": <0-15>,
  "teil_b_gesamt_np": <0-15>,
  "gesamt_np": <0-15>,
  "feedback": "Ausführliches Feedback zu beiden Teilen...",
  "korrektur_text_a": "Markierter Schülertext Teil A...",
  "korrektur_text_b": "Markierter Schülertext Teil B...",
  "fehlende_aspekte": [{"aufgabe": "...", "aspekte": ["...", "..."]}]
}`;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: systemPrompt + bilderHinweis },
    { role: "user", content: buildUserContent(`${contextInfo}\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let teil_b_gesamt = parsed.teil_b_gesamt_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (teil_b_gesamt == null && teil_b != null && darstellung != null) {
      teil_b_gesamt = Math.round(teil_b * 0.7 + darstellung * 0.3);
      if (teil_b === 0 || darstellung === 0) teil_b_gesamt = Math.min(teil_b_gesamt, 3);
    }

    if (gesamt == null && teil_a != null && teil_b_gesamt != null) {
      gesamt = Math.round((teil_a + teil_b_gesamt) / 2);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= LATEIN ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturLatein(request, env) {
  const { teil_a, teil_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Latein (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A: Übersetzung + Teil B: Aufgabenteil) auf DEUTSCH.

TEIL A – ÜBERSETZUNG:
- Erstelle eine genaue, idiomatische deutsche Übersetzung des lateinischen Textes
- Die Übersetzung muss den Originaltext vollständig und korrekt wiedergeben
- Verwende flüssiges, gutes Deutsch

TEIL B – AUFGABENTEIL:
WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen
- Fußnoten und Quellenverweise sind erlaubt
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben aller drei Abschnitte
- Verwende lateinische Fachbegriffe korrekt (Stilmittel, Metrik, historischer Kontext)
- Beziehe den lateinischen Text und die Übersetzung ein, zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, fundiertes Urteil
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "# TEIL A – ÜBERSETZUNG\n\n";

  if (teil_a) {
    if (teil_a.task_instruction) userContent += `Aufgabe: ${truncate(teil_a.task_instruction, 2000)}\n\n`;
    if (teil_a.latin_text) userContent += `Lateinischer Text:\n${truncate(teil_a.latin_text, 5000)}\n\n`;
    if (teil_a.vokabelhilfen && teil_a.vokabelhilfen.length) {
      userContent += `Vokabelhilfen:\n${teil_a.vokabelhilfen.map(v => `${v.latein} – ${v.deutsch}`).join("\n")}\n\n`;
    }
    if (teil_a.musteruebersetzung) {
      userContent += `(Hinweis: Musterübersetzung vorhanden – verwende diese als Grundlage)\nMusterübersetzung:\n${truncate(teil_a.musteruebersetzung, 5000)}\n\n`;
    }
  }

  userContent += "# TEIL B – AUFGABENTEIL\n\n";

  if (teil_b) {
    if (teil_b.task_instruction) userContent += `Aufgabe: ${truncate(teil_b.task_instruction, 2000)}\n\n`;
    if (teil_b.latin_text) userContent += `Lateinischer Text:\n${truncate(teil_b.latin_text, 5000)}\n\n`;
    if (teil_b.deutsche_uebersetzung) userContent += `Deutsche Übersetzung:\n${truncate(teil_b.deutsche_uebersetzung, 5000)}\n\n`;
    if (teil_b.aufgaben && teil_b.aufgaben.length) {
      userContent += `Aufgaben:\n${JSON.stringify(teil_b.aufgaben).substring(0, 5000)}\n\n`;
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

