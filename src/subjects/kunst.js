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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Kunst (Bayern). Extrahiere:
1. Die Aufgabenstellung Teil A (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Quellentexten, Bildbeschreibungen, Werkanalysen
3. Die Aufgabenstellung Teil B / Ausweitung (task_instruction_b) - falls vorhanden
4. Quellenangaben (primary_meta) - Künstler, Werk, Epoche, Quelle

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
  const { lernbereich, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const lbThemen = {
    "12_1": {
      title: "Bildende Kunst: Malerei und Grafik",
      lernbereiche: "LB 12.1 (Bildende Kunst: Malerei und Grafik)",
      inhalte: `- Bildanalyse: Komposition, Farbgestaltung, Licht und Schatten, Perspektive
- Malerei-Epochen: Renaissance, Barock, Klassizismus, Romantik, Impressionismus
- Grafische Techniken: Zeichnung, Druckgrafik (Holzschnitt, Radierung, Lithografie)
- Künstler und Werke im Kontext: Dürer, Rembrandt, Caspar David Friedrich, Monet, Cézanne
- Ikonografie und Ikonologie: Bildthemen, Symbolik, Lesarten
- Gestaltungsprinzipien: Goldener Schnitt, Bildrhythmus, Kontraste`
    },
    "12_2": {
      title: "Architektur und Design",
      lernbereiche: isEA
        ? "LB 12.2 (Architektur und Design) und LB 12.3 (Medienkunst)"
        : "LB 12.2 (Architektur und Design)",
      inhalte: `- Architekturanalyse: Grundriss, Aufriss, Raumwirkung, Konstruktion, Material
- Architektur-Epochen: Gotik, Renaissance, Barock, Klassizismus, Jugendstil, Bauhaus, Moderne
- Design: Produktdesign, Kommunikationsdesign, Form follows Function
- Stadtplanung und Raumkonzepte
- Designgeschichte: Arts and Crafts, Bauhaus, Ulmer Schule, Postmoderne
- Wechselwirkung von Funktion, Material, Ästhetik`
    },
    "13_1": {
      title: "Plastik und Skulptur",
      lernbereiche: isEA
        ? "LB 13.1 (Plastik und Installation) und LB 13.2 (Kunsttheorie)"
        : "LB 13.1 (Plastik und Skulptur)",
      inhalte: `- Plastische Gestaltungsmittel: Volumen, Oberfläche, Raumbezug, Material
- Skulptur vs. Plastik: subtraktive und additive Verfahren
- Epochen: Antike Plastik, Michelangelo, Rodin, Brancusi, Beuys, Serra
- Installation und Environment: Rauminstallation, Land Art, Environments
- Kunsttheorie: Mimesis, Abstraktion, Konzeptkunst
- Werkbetrachtung und Interpretation plastischer Werke`
    },
    "13_2": {
      title: "Kunst der Moderne und Gegenwart",
      lernbereiche: isEA
        ? "LB 13.3 (Kunst der Moderne und Gegenwart) und LB 13.4 (Kunstrezeption)"
        : "LB 13.2 (Kunst der Moderne und Gegenwart)",
      inhalte: `- Moderne Kunstströmungen: Expressionismus, Kubismus, Surrealismus, Abstraktion, Pop Art
- Zeitgenössische Kunst: Performance, Videokunst, Neue Medien, Street Art
- Kunstmarkt und Kunstinstitutionen: Museum, Galerie, Biennale, Documenta
- Kunstkritik und Rezeption: Methoden der Werkanalyse
- Künstlerische Positionen: Kandinsky, Picasso, Duchamp, Warhol, Richter, Abramović
- Kunst und Gesellschaft: Provokation, politische Kunst, Kunst im öffentlichen Raum`
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Kunst (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 2-3 Materialien (Werkabbildungen als Bildbeschreibung, Quellentexte/Kunstkritiken 400-800 Wörter, ggf. Statistik)
- Verwende offizielle Operatoren: beschreiben, analysieren, vergleichen, erläutern, interpretieren, erörtern, beurteilen, gestalterisch umsetzen
- Situiere die Aufgabe an einem konkreten Kunstwerk, einer Epoche oder einem kunsttheoretischen Problem
- KEINE LÖSUNGSHINWEISE in den Aufgabenstellungen

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die den Lernbereich erweitern oder vertiefen
- Bezug zu einem ANDEREN Künstler, einer anderen Epoche oder einem aktuellen Kunstdiskurs
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, Künstlern und Konzepten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte. Themen und Künstler, die NUR im eA-Lehrplan stehen, dürfen NICHT vorkommen.` : ""}

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "Abb. 1: Werktitel, Künstler (Jahr)", "type": "bild", "content": "Bildprompt auf Englisch. Beschreibe das Kunstwerk visuell (5-10 Sätze). NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1"}, "source": "Künstler, Werktitel, Jahr, Museum"},
      {"title": "Textquelle 1: Kunstkritik / Quelltext", "type": "text", "content": "Kunstkritik oder kunsttheoretischer Text (400-800 Wörter)", "source": "Autor, Werk, Jahr"}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (Ausweitung) mit BE",
    "materials": []
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}`;

  const userPrompt = `Erstelle eine vollständige Kunst-Abiturprüfung (Teil A + Teil B):
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

KRITISCH: Jedes Textmaterial in Teil A MUSS 400-800 Wörter lang sein.
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden.
Teil B soll eine thematische Vertiefung oder Erweiterung darstellen.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan.` : ""}`;

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
  if (task_instruction_a) contextInfo += `Aufgabenstellung Teil A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) contextInfo += `Aufgabenstellung Teil B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

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

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Kunst (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder reinen Aufzählungen
- Fachterminologie korrekt verwenden
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende kunsthistorische Fachbegriffe korrekt (Komposition, Farbgebung, Perspektive, Ikonografie, Stil, Epoche etc.)
- Beschreibe Kunstwerke präzise (formale Analyse: Farbe, Form, Linie, Raum, Komposition)
- Beziehe die Materialien ein und zitiere daraus
- Zeige kunsthistorisches Kontextwissen
- Formuliere eigenständige, begründete Urteile und Interpretationen
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
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
