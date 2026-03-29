import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, BILDER_HINWEIS_TEXT, zeitanpassung, skaliereTokens } from '../config.js';

/* ================= KUNST ABITUR: PARSE TASK ================= */
export async function handleParseTaskKunst(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Kunst (Bayern, Besondere Fachprüfung eA). Extrahiere:
1. Die Werkerschließungs-Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben (Annäherung, Beschreibung, Analyse, Interpretation)
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Werkbeschreibungen, Quellentexten, Künstlerzitaten
3. Die Kontextaufgabe (task_instruction_b) - falls vorhanden (Bezüge zu anderen Halbjahren/Positionen)
4. Quellenangaben (primary_meta) - Künstler, Werktitel, Jahr, Museum/Sammlung

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "task_instruction_b": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= KUNST ABITUR: GENERATE ================= */
export async function handleGenerateAbiturKunst(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, bearbeitungszeit } = body;

  // Kunst-Abitur ist ausschließlich eA (Besondere Fachprüfung)
  const refZeit = 300;
  const refBE = 60;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  const lbThemen = {
    "12_1": {
      title: "Objekt",
      lernbereiche: "Ku12 LB 1 (Objekt)",
      inhalte: `- Alltags-/Gebrauchsgegenstände, Fundstücke: symbolische und ästhetische Qualitäten
- Zusammenwirken von Volumen, Form, Oberfläche, Materialität
- Readymade (Duchamp), Installation, Montage, Assemblage
- Designpositionen 20./21. Jh.: Bauhaus, Ulmer Schule, zeitgenössisches Design
- Objet trouvé, transkulturelle Perspektiven
- Werkerschließung: ästhetische, praktische, symbolische Funktionen
- Bildnerische Methoden inkl. digitaler Verfahren (3D-Druck, CAD)`
    },
    "12_2": {
      title: "Raum",
      lernbereiche: "Ku12 LB 2 (Raum)",
      inhalte: `- Materialeigenschaften, räumliche Situationen
- Entwurf von Bauaufgaben: Wohn-/Versammlungsräume, öffentliche Räume
- Darstellungsformen: Grundriss, Aufriss, Schnitt, CAD, Modellbau
- Raumkunst, Installationen, Raumillusionen
- Baukörper, Material, Konstruktion, Licht
- Nachhaltiges Bauen, Smart City, partizipative Prozesse
- Temporäre Architekturen, digitale Animation
- Architekturgeschichte: Gotik, Renaissance, Barock, Bauhaus, Moderne, Dekonstruktivismus`
    },
    "13_1": {
      title: "Körper",
      lernbereiche: "Ku13 LB 1 (Körper)",
      inhalte: `- Proportionen, Aufbau, Ausdruck menschlicher Körper
- Darstellungsverfahren: Malerei, Plastik, Performance, Fotografie, Film, digitale Medien
- Themenfeld: Natürlichkeit/Künstlichkeit, Schönheitsideale, Verletzlichkeit, Sterblichkeit
- Figuration, Abstraktion, Deformation, Expression, Idealisierung, (Selbst-)Inszenierung
- Körper-Raum-Beziehung, Körper-Körper-Beziehung
- Polaritäten (Gegensatzpaare in der Körperdarstellung)
- Kunstgeschichtliche Positionen: Antike Idealplastik, Michelangelo, Rodin, Giacometti, Beuys, Abramović`
    },
    "13_2": {
      title: "Interaktion und Transformation",
      lernbereiche: "Ku13 LB 2 (Interaktion und Transformation)",
      inhalte: `- Wandlungs- und Umbruchprozesse: Migration, Klimawandel, Identität, Diversität
- Künstlerische Interventionen in Situationen sozialer Interaktion
- Installation, Aktion, Performance, Sound-Collage, Gaming
- Künstlerische Strategien, Erweiterungen des Kunstbegriffs
- Dokumentationsformen: Skizze, Story-Board, Video, Blog, Fotostrecke
- Kommunikationspotenzial von Zeichen, Klang, Schrift, Sprache
- Künstlerische Positionen: Beuys (Soziale Plastik), Fluxus, Situationismus, Banksy, Ai Weiwei`
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Kunst (Besondere Fachprüfung, eA, ab 2026, G9).
Erstelle den SCHRIFTLICH-THEORETISCHEN TEIL einer Kunst-Abiturprüfung als Werkerschließung.
Gesamt: 60 BE. Bearbeitungszeit: 300 Minuten (inkl. bildnerisch-praktischem Teil, der hier nicht gestellt wird).

PRÜFUNGSFORMAT — BESONDERE FACHPRÜFUNG KUNST:
Die echte Prüfung hat einen schriftlich-theoretischen und einen bildnerisch-praktischen Teil.
Du erstellst hier NUR den schriftlich-theoretischen Teil (Werkerschließung + Kontextaufgabe).

WERKERSCHLIESSUNG — AUFGABENSTRUKTUR:
Die Aufgabe basiert auf einem konkreten KUNSTWERK (oder einer Gruppe von Werken) und folgt den Schritten der Werkerschließung:

1. ANNÄHERUNG (ca. 5 BE): Erste Eindrücke, Assoziationen verbalisieren
   → Operatoren: "Schildern Sie Ihre ersten Eindrücke…", "Beschreiben Sie spontan…"
2. BESCHREIBUNG (ca. 8-10 BE): Umfängliche Erfassung des Wahrgenommenen (Motive, Figuren, Objekte, Materialien)
   → Operatoren: "Beschreiben Sie…", "Benennen Sie…"
3. FORMALE ANALYSE (ca. 12-15 BE): Fläche, Raum, Licht, Farbe, Material, Technik, Komposition
   → Operatoren: "Analysieren Sie…", "Untersuchen Sie das Zusammenspiel von…"
4. ERWEITERTE ANALYSE / INTERPRETATION (ca. 10-12 BE): Funktionen, Medialität, Deutungsansätze
   → Operatoren: "Entwickeln Sie Interpretationsansätze…", "Herausarbeiten Sie…"
5. KONTEXTAUFGABE (ca. 8-10 BE): Bezüge zu Werken/Positionen aus ANDEREN Halbjahren
   → Operatoren: "Stellen Sie Bezüge her…", "Vergleichen Sie…", "Diskutieren Sie…"
6. STELLUNGNAHME / WERTUNG (ca. 5-8 BE): Kritische Stellungnahme mit Begründung
   → Operatoren: "Reflektieren Sie…", "Nehmen Sie Stellung…", "Beurteilen Sie…"

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

MATERIALIEN:
- MINDESTENS 1 Werkabbildung als "bild" (Bildprompt auf Englisch, 5-10 Sätze, NUR Nummern als Marker, bild_labels als Objekt)
- MINDESTENS 1 Textquelle als "text" (Kunstkritik, Künstlerzitat, kunsttheoretischer Text — 200-500 Wörter Fließtext)
- Optional: "foto" (Künstlerporträt, Ausstellungsansicht), "statistik" (Markdown-Tabelle)

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Künstlern, die im oben angegebenen Lernbereich stehen.

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Werkerschließung: Alle Teilaufgaben (Annäherung, Beschreibung, Analyse, Interpretation) mit BE-Angaben",
    "materials": [
      {"title": "Abb. 1: Werktitel, Künstler (Jahr)", "type": "bild", "content": "Bildprompt auf Englisch (5-10 Sätze). NUR Nummern als Marker.", "bild_labels": {"1": "Beschriftung"}, "source": "Künstler, Werktitel, Jahr, Museum"},
      {"title": "Textquelle 1: Titel", "type": "text", "content": "Kunstkritik oder Künstlerzitat (200-500 Wörter)", "source": "Autor, Quelle, Jahr"}
    ]
  },
  "teil_b": {
    "task_instruction": "Kontextaufgabe + Stellungnahme mit BE-Angaben",
    "materials": []
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema / Kunstwerk der Prüfung"
}`;

  const userPrompt = `Erstelle eine Werkerschließungs-Aufgabe für die Kunst-Abiturprüfung:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
- Niveau: eA (Besondere Fachprüfung)
- Gesamt: 60 BE (schriftlich-theoretischer Teil)

KRITISCH:
- Die Aufgabe muss sich an einem KONKRETEN Kunstwerk orientieren (mit Werkabbildung)
- Teilaufgaben folgen den Schritten der Werkerschließung (Annäherung → Beschreibung → Analyse → Interpretation)
- Die Kontextaufgabe verlangt Bezüge zu Werken/Positionen aus ANDEREN Halbjahren
- Jedes Material MUSS in mindestens einer Teilaufgabe referenziert werden
- Textmaterialien MÜSSEN 200-500 Wörter lang sein`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= KUNST ABITUR: GRADE ================= */
export async function handleGradeAbiturKunst(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials, images } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = "";
  if (task_instruction_a) contextInfo += `Werkerschließung (Aufgabenstellung):\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Kontextaufgabe:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Werkerschließung:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Kontextaufgabe & Stellungnahme:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = KORREKTUR_SINGLE;
  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${contextInfo}\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const teil_a = parsed.teil_a_np ?? null;
    const teil_b = parsed.teil_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && teil_a != null && teil_b != null && darstellung != null) {
      gesamt = Math.round(teil_a * 0.5 + teil_b * 0.2 + darstellung * 0.3);
    }

    return jsonResponse({
      scores: { teil_a, teil_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { teil_a: null, teil_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= KUNST ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturKunst(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Kunst (Leistungsfach, eA).
Schreibe eine vorbildliche Musterlösung für die Werkerschließung und Kontextaufgabe auf DEUTSCH.

STRUKTUR DER WERKERSCHLIESSUNG:
Folge den Schritten der Werkerschließung:
1. Annäherung — Spontane Eindrücke, Assoziationen, Wirkung des Werks
2. Beschreibung — Systematische Erfassung: Motive, Figuren, Objekte, Materialien, Technik
3. Formale Analyse — Komposition, Farbgebung, Licht-Schatten, Raumwirkung, Materialität
4. Interpretation — Deutungsansätze auf Basis der Analyse, Bezug zu Materialien/Textquellen

KONTEXTAUFGABE & STELLUNGNAHME:
- Bezüge zu Werken/Positionen aus anderen Halbjahren
- Vergleiche und Einordnung
- Eigene begründete Stellungnahme/Wertung

WICHTIG:
- Verwende vollständige Sätze, keine Stichpunkte
- Korrekte kunsthistorische und gestalterische Fachbegriffe verwenden
- Beziehe die Materialien (Werkabbildungen, Textquellen) konkret ein
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown mit Überschriften für jeden Schritt der Werkerschließung.`;

  let userContent = "";
  if (task_instruction_a) userContent += `WERKERSCHLIESSUNG:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `KONTEXTAUFGABE:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}
