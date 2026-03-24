import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_AB, BILDER_HINWEIS_TEXT, zeitanpassung, skaliereTokens } from '../config.js';

export async function handleGenerateAbiturGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "G12 1.1: Franz. Revolution (Ursachen, Ständegesellschaft, Terreur), Vormärz, Revolution 1848/49 (Paulskirche, Bilanz). G12 1.2: Kaiserreich (Industrialisierung, Soziale Frage, Bismarck), Wilhelminismus, Frauenbewegung, Erster Weltkrieg, Weimarer Republik" + (isEA ? ". G12 1.3 (nur eA): Jüdisches Leben (Emanzipation, Antisemitismus)" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "G12 2.1: Endphase Weimarer Republik, NS-Machtübernahme (Gleichschaltung, Ermächtigungsgesetz), Holocaust, Widerstand. G12 2.2: Zwei deutsche Staaten (BRD/DDR). G12 2.3: Wiedervereinigung, Aufarbeitung" + (isEA ? ". G12 2.4 (nur eA): Erinnerungskultur" : "")
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "G13 1.1: Israelisch-palästinensischer Konflikt (Zionismus, Staatsgründung, Kriege, Friedensprozess). G13 1.2: USA (Supermacht, Interventionismus). G13 1.3: Russland/Sowjetunion. G13 1.4: China (Revolution, Reform, Aufstieg)" + (isEA ? ". G13 1.5 (nur eA): Naher/Mittlerer Osten als Konfliktfeld" : "")
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "G13 2.1: Attische Demokratie. G13 2.2: Aufklärung und Menschenrechte. G13 2.3: Nationalismus im 19. Jh. G13 2.4: Deutsch-französische/deutsch-polnische Beziehungen, Europäische Integration"
    }
  };

  const selectedSP = schwerpunkt === "random"
    ? Object.keys(schwerpunkte)[Math.floor(Math.random() * 4)]
    : schwerpunkt;
  const sp = schwerpunkte[selectedSP] || schwerpunkte["12_1"];

  // Determine a different Schwerpunkt for Teil B
  const allSP = Object.keys(schwerpunkte);
  const otherSP = allSP.filter(s => s !== selectedSP);
  const transferSP = otherSP[Math.floor(Math.random() * otherSP.length)];
  const transferThema = schwerpunkte[transferSP]?.titel || "";

  const systemPrompt = `Du bist ein Experte für das bayerische Geschichte-Abitur (ab 2026, G9). Erstelle eine VOLLSTÄNDIGE Abituraufgabe bestehend aus Teil A (Quellenanalyse) UND Teil B (Darstellung) auf ${niveauLabel}.

=== TEIL A — QUELLENANALYSE ===
1. EINLEITUNG (2-4 Sätze): Historischer Kontext, Hinführung zur Quelle
2. QUELLENMATERIAL (M 1) — ZWINGEND eine substanzielle TEXTQUELLE von 400-800 Wörtern:
   - Genres: Rede, Zeitungsartikel, Denkschrift, Brief, Memoiren, Flugblatt, Erlass
   - MUSS einen REALEN historischen Autor und korrekten Kontext haben
   - Sprache muss dem Entstehungszeitraum entsprechen
   - Vollständige Quellenangabe
   - Optional: 0-2 ergänzende Materialien (M 2, M 3) als "zusatz_materialien" Array: Schaubilder, Infografiken, Statistiken
3. TEILAUFGABEN (3 Stück, steigende AFB) MIT BE-ANGABEN (inkl. Darstellungsleistung):
   - Teilaufgabe 1 (AFB I/II, ca. ${isEA ? "20" : "16"} BE): "Arbeiten Sie aus M 1 heraus …" / "Stellen Sie dar …"
   - Teilaufgabe 2 (AFB II, ca. ${isEA ? "24" : "20"} BE): "Ordnen Sie ein …" / "Erläutern Sie …"
   - Teilaufgabe 3 (AFB III, ca. ${isEA ? "28" : "24"} BE): "Beurteilen Sie …" / "Erörtern Sie …"
   Gib bei JEDER Teilaufgabe die BE in Klammern an, z.B. "(20 BE)"

SCHWERPUNKT: ${sp.titel} ${sp.zeitraum}
THEMEN: ${sp.themen}
KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Arbeiten Sie die Argumentation heraus (Friedenssicherung, Machtpolitik, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, die in den oben genannten Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" oder Vertiefungsmodule (z.B. Jüdisches Leben, Erinnerungskultur, Naher/Mittlerer Osten) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

=== TEIL B — DARSTELLUNG ===
- Eigenständige Aufgabe OHNE eigene Quelle (oder mit kurzem Materialimpuls, max. 200 Wörter)
- Erfordert historische Darstellung und Beurteilung
- Kann Transfer zu einem anderen Halbjahr enthalten
- Möglicher Transferbezug: ${transferSP.replace("_", "/")} – ${transferThema}
- 2 Teilaufgaben auf AFB II-III mit BE-Angaben (inkl. Darstellungsleistung):
  - Teilaufgabe 1 (AFB II, ca. ${isEA ? "22" : "18"} BE)
  - Teilaufgabe 2 (AFB III, ca. ${isEA ? "26" : "22"} BE)

=== BE-VERTEILUNG (Bewertungseinheiten) ===
- Gesamt: ${refBE} BE (Darstellungsleistung ist bereits in den Teilaufgaben-BE enthalten)
- Teil A: ca. ${isEA ? "72" : "60"} BE (3 Teilaufgaben)
- Teil B: ca. ${isEA ? "48" : "40"} BE (2 Teilaufgaben)
- Gib bei JEDER Teilaufgabe die BE in Klammern an, z.B. "1. Arbeiten Sie … heraus. (20 BE)"
- Die Summe aller Teilaufgaben-BE muss exakt ${refBE} BE ergeben

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_a": "Vollständige Aufgabenstellung Teil A: Einleitung + 3 nummerierte Teilaufgaben mit BE-Angaben in Klammern",
  "primary_text_a": "Die historische Textquelle M 1 (400-800 Wörter) MIT Quelleneinleitung",
  "primary_meta_a": "Quellenangabe: Autor, Textsorte, Datum",
  "zusatz_materialien": [
    {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""}
  ],
  "task_instruction_b": "Vollständige Aufgabenstellung Teil B: 2 Teilaufgaben mit BE-Angaben in Klammern",
  "primary_text_b": "Kurzer Materialimpuls für Teil B (100-200 Wörter) oder leerer String",
  "primary_meta_b": "Quellenangabe Impuls oder leerer String",
  "thema": "Konkretes Thema",
  "schwerpunkt": "${selectedSP}"
}`;

  const userPrompt = `Erstelle eine vollständige Geschichte-Abituraufgabe (Teil A + B):
- Schwerpunkt (Teil A): ${sp.titel} ${sp.zeitraum}
- Niveau: ${niveauLabel}
${!isEA ? `- WICHTIG: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-Vertiefungsmodule oder eA-exklusive Themen!` : ""}

KRITISCH:
- Die Textquelle M 1 MUSS mindestens 500-800 Wörter lang sein! Die Quelle soll MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte herausarbeiten.
- Verwende eine REALE historische Persönlichkeit als Autor
- Teil A: 3 Teilaufgaben mit steigendem AFB und BE-Angaben in Klammern
- Teil B: Eigenständige Darstellungsaufgabe mit BE-Angaben, ggf. mit Transfer zu ${transferSP.replace("_", "/")}
- ALLE Materialien (Texte, Statistiken) müssen auf DEUTSCH sein! Bilder: NUR Nummern als Beschriftungen, KEINE Wörter!
- Erstelle ergänzende Materialien (zusatz_materialien) NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "statistik" (Zeitleisten als Tabelle, Zahlenvergleiche) oder "foto" (historische Gebäude, Denkmäler, Gedenkstätten, Orte). Verwende "bild" NUR wenn ein Strukturdiagramm wirklich nötig ist. Der Bild-Prompt ist auf Englisch (5-10 Sätze) und beschreibt NUR den visuellen Inhalt. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter im Bild! Liefere zusätzlich "bild_labels" als Objekt: {"1": "Deutsche Beschriftung", ...}. KEINE Karikaturen oder Personen!
AUFGABENBEZUG: JEDES bereitgestellte Material (inkl. Zusatzmaterialien) MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(14000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GESCHICHTE ABITUR: GRADE ================= */
export async function handleGradeAbiturGeschichte(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text_a, primary_text_b, student_text_a, student_text_b, rubric_prompt, images } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text_a/b und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `=== TEIL A — QUELLENANALYSE ===\nAufgabenstellung:\n${truncate(task_instruction_a, 5000)}\n\n`;
  contextInfo += `Quellenmaterial M 1:\n${truncate(primary_text_a, 15000)}\n\n`;

  contextInfo += `=== TEIL B — DARSTELLUNG ===\nAufgabenstellung:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text_b) {
    contextInfo += `Materialimpuls:\n${truncate(primary_text_b, 3000)}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_AB;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${contextInfo}\nSchülertext Teil A (Quellenanalyse):\n${truncate(student_text_a, 15000)}\n\nSchülertext Teil B (Darstellung):\n${truncate(student_text_b, 10000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const sach_a = parsed.sach_a_np ?? null;
    const sach_b = parsed.sach_b_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && sach_a != null && sach_b != null && darstellung != null) {
      gesamt = Math.round(sach_a * 0.4 + sach_b * 0.3 + darstellung * 0.3);
      if (sach_a === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { sach_a, sach_b, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { sach_a: null, sach_b: null, darstellung: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= GESCHICHTE ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturGeschichte(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text_a, primary_text_b } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geschichte (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (Teil A + Teil B) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

TEIL A — QUELLENANALYSE:
- Quelleneinordnung (Autor, Textsorte, Adressat, historischer Kontext)
- Herausarbeitung der Kernaussagen mit Textbelegen
- Historische Einordnung und Kontextualisierung
- Beurteilung mit multiperspektivischer Reflexion
- Zielumfang: ca. 800 Wörter

TEIL B — DARSTELLUNG:
- Eigenständige historische Darstellung
- Einbeziehung von Fachwissen über die Quelle hinaus
- Differenziertes historisches Urteil
- Zielumfang: ca. 500 Wörter

Formatiere als Markdown mit klaren Überschriften. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `TEIL A – AUFGABE:\n${truncate(task_instruction_a, 5000)}\n\nQUELLE M 1:\n${truncate(primary_text_a, 15000)}`;
  userContent += `\n\nTEIL B – AUFGABE:\n${truncate(task_instruction_b, 3000)}`;
  if (primary_text_b) userContent += `\n\nMATERIALIMPULS:\n${truncate(primary_text_b, 3000)}`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

