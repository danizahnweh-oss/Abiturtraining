import { jsonResponse, truncate, extractJSON, buildUserContent, corsHeaders } from '../utils.js';
import { callOpenAI, callOpenAIStream } from '../openai.js';
import { KORREKTUR_SINGLE, BILDER_HINWEIS_TEXT, zeitanpassung, klausurZeitHinweis, skaliereTokens } from '../config.js';

export async function handleParseTaskDeutsch(request, env) {
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
      text: `Diese Bilder zeigen eine Deutsch-Abitur Interpretationsaufgabe. Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben
2. Den literarischen Text (primary_text) - Gedicht, Dramenausschnitt oder Prosatext VOLLSTÄNDIG
3. Metadaten (primary_meta) - Autor, Titel, Erscheinungsjahr

Bei Gedichten: Alle Strophen und Verse extrahieren.
Bei Dramen: Den kompletten Dialog mit Sprecherangaben.
Bei Prosa: Den gesamten Textausschnitt.

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GESCHICHTE: GENERATE ================= */
export async function handleGenerateGeschichte(request, env) {
  const body = await request.json();
  const { schwerpunkt, halbjahr, unterpunkte, level, be, zeit, anzahl } = body;
  const totalBE = be || 60;
  const zeitMinuten = zeit || 180;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2.5);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  // Teilaufgaben pro Aufgabe dynamisch nach BE berechnen
  const beProAufgabe = aufgabenAnzahl > 1 ? Math.round(totalBE / aufgabenAnzahl) : totalBE;
  const teilaufgabenAnzahl = beProAufgabe <= 30 ? 2 : beProAufgabe <= 50 ? 3 : 4;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const schwerpunkte = {
    "12_1": {
      titel: "Auf dem Weg zu gesellschaftlicher und politischer Partizipation",
      zeitraum: level === "eA" ? "vom Ende des 18. Jahrhunderts bis zur Weimarer Republik" : "vom 19. Jahrhundert bis zur Weimarer Republik",
      themen: "G12 1.1 (22 Std.): Französische Revolution (Ursachen, Überwindung Ständegesellschaft, Terreur), Revolution von oben (Preußen/Bayern), Vormärz ab 1832, Revolution 1848/49 (Märzereignisse, Paulskirche, europäische Dimension, Bilanz). G12 1.2 (26 Std.): Kaiserreich (Industrialisierung, Soziale Frage, Bismarck, Obrigkeitsstaat), Wilhelminismus, Frauenbewegung, Erster Weltkrieg, Weimarer Republik (Verfassung, Parteien, Krisenjahre)" + (level === "eA" ? ". G12 1.3 (8 Std., nur eA): Vertiefungsmodul Jüdisches Leben (Emanzipation, Antisemitismus, kulturelle Beiträge)" : "")
    },
    "12_2": {
      titel: "Deutschland zwischen Demokratie und Diktatur",
      zeitraum: "von der Weimarer Republik bis zur Wiedervereinigung",
      themen: "G12 2.1 (21 Std.): Endphase Weimarer Republik (Präsidialkabinette, Radikalisierung), NS-Machtübernahme (Gleichschaltung, Ermächtigungsgesetz), Ideologie/Terror/Holocaust, Widerstand (20. Juli 1944). G12 2.2 (13 Std.): Zwei deutsche Staaten (Grundgesetz, SED-Diktatur, Mauerbau, Alltag BRD/DDR). G12 2.3 (11 Std.): Wiedervereinigung (Friedliche Revolution, Transformationsprozess, Aufarbeitung der SED-Diktatur)" + (level === "eA" ? ". G12 2.4 (11 Std., nur eA): Vertiefungsmodul Erinnerungskultur (Gedenkstätten, Historikerstreit, Aufarbeitung)" : "")
    },
    "13_1": {
      titel: "Akteure internationaler Politik in historischer Perspektive",
      zeitraum: "im 20. und 21. Jahrhundert",
      themen: "G13 1.1 (10 Std.): Israelisch-palästinensischer Konflikt (Diaspora, Zionismus, Staatsgründung 1948, Kriege, Friedensprozess). G13 1.2 (10 Std.): USA (Supermacht, Interventionismus, Selbstverständnis). G13 1.3 (10 Std.): Russland/Sowjetunion (Revolution, Kalter Krieg, Transformation). G13 1.4 (10 Std.): China (Revolution, Mao, Reform und Öffnung, Aufstieg zur Weltmacht)" + (level === "eA" ? ". G13 1.5 (8 Std., nur eA): Vertiefungsmodul Naher/Mittlerer Osten als Konfliktfeld" : "")
    },
    "13_2": {
      titel: "Historische Grundlagen moderner politischer Ordnungsformen und Identifikationsmuster in Europa",
      zeitraum: "von der Antike bis zur Gegenwart",
      themen: "G13 2.1 (10 Std.): Attische Demokratie (Polis, Volksversammlung, Grenzen). G13 2.2 (10 Std.): Aufklärung und Menschenrechte (Naturrecht, Gewaltenteilung, Verfassungen). G13 2.3 (14 Std.): Nationalismus im 19. Jh. (Kulturnation, Staatsnation, Nationalstaatsbildung). G13 2.4 (14 Std.): Deutsch-französische/deutsch-polnische Beziehungen, Europäische Integration (Montanunion, EWG, EU)"
    }
  };

  const rawSchwerpunkt = schwerpunkt || halbjahr || "12_1";
  const schwerpunktKeys = rawSchwerpunkt.split(",").map(s => s.trim()).filter(s => schwerpunkte[s]);
  const selectedSchwerpunkt = rawSchwerpunkt === "random"
    ? Object.keys(schwerpunkte)[Math.floor(Math.random() * 4)]
    : schwerpunktKeys[Math.floor(Math.random() * schwerpunktKeys.length)] || "12_1";
  const sp = schwerpunkte[selectedSchwerpunkt];

  const niveauText = level === "eA"
    ? "Erhöhtes Anforderungsniveau (eA). Komplexere Quellen, höherer Anteil AFB III, tiefere multiperspektivische Analyse."
    : "Grundlegendes Anforderungsniveau (gA). Schwerpunkt auf AFB I und II, zugänglicherer Quellenzugang.";

  // Dynamische Teilaufgaben-Beschreibung je nach BE
  const teilaufgabenNummern = Array.from({length: teilaufgabenAnzahl}, (_, i) => i + 1).join(', ');
  let teilaufgabenBeschreibung;
  if (teilaufgabenAnzahl === 2) {
    teilaufgabenBeschreibung = `3. TEILAUFGABEN (genau 2) mit Bewertungseinheiten (BE):
   Teilaufgabe 1 (AFB I/II, ca. ${Math.round(beProAufgabe * 0.57)} BE):
   - Operatoren: "Arbeiten Sie aus M 1 heraus ...", "Analysieren Sie ...", "Stellen Sie mithilfe von M 1 dar ..."
   - Bezieht sich DIREKT auf die Quelle M 1

   Teilaufgabe 2 (AFB II/III, ca. ${Math.round(beProAufgabe * 0.43)} BE):
   - Operatoren: "Beurteilen Sie ...", "Erörtern Sie, inwieweit ...", "Nehmen Sie Stellung ..."
   - Verlangt Transfer, Urteilsbildung, eigenes Wissen`;
  } else if (teilaufgabenAnzahl === 3) {
    teilaufgabenBeschreibung = `3. TEILAUFGABEN (genau 3) mit Bewertungseinheiten (BE):
   Teilaufgabe 1 (AFB I, ca. ${Math.round(beProAufgabe * 0.30)} BE):
   - Operatoren: "Arbeiten Sie aus M 1 heraus ...", "Fassen Sie zusammen ...", "Stellen Sie dar ..."
   - Bezieht sich DIREKT auf die Quelle M 1

   Teilaufgabe 2 (AFB II, ca. ${Math.round(beProAufgabe * 0.35)} BE):
   - Operatoren: "Analysieren Sie ...", "Ordnen Sie ein ...", "Erklären Sie mithilfe von M 1 ..."
   - Verbindet Quelle mit historischem Kontext und eigenem Wissen

   Teilaufgabe 3 (AFB III, ca. ${Math.round(beProAufgabe * 0.35)} BE):
   - Operatoren: "Beurteilen Sie ...", "Erörtern Sie, inwieweit ...", "Nehmen Sie Stellung ..."
   - Verlangt Transfer, Urteilsbildung, eigenes Wissen`;
  } else {
    teilaufgabenBeschreibung = `3. TEILAUFGABEN (genau 4) mit Bewertungseinheiten (BE):
   Teilaufgabe 1 (AFB I, ca. ${Math.round(beProAufgabe * 0.20)} BE):
   - Operatoren: "Fassen Sie zusammen ...", "Arbeiten Sie aus M 1 heraus ..."
   - Reine Reproduktion aus der Quelle M 1

   Teilaufgabe 2 (AFB I/II, ca. ${Math.round(beProAufgabe * 0.25)} BE):
   - Operatoren: "Stellen Sie dar ...", "Analysieren Sie ...", "Charakterisieren Sie ..."
   - Verbindet Quelle mit historischem Hintergrundwissen

   Teilaufgabe 3 (AFB II, ca. ${Math.round(beProAufgabe * 0.25)} BE):
   - Operatoren: "Ordnen Sie ein ...", "Erklären Sie ...", "Vergleichen Sie ..."
   - Transfer und Einordnung in den historischen Zusammenhang

   Teilaufgabe 4 (AFB III, ca. ${Math.round(beProAufgabe * 0.30)} BE):
   - Operatoren: "Beurteilen Sie ...", "Erörtern Sie, inwieweit ...", "Nehmen Sie Stellung ..."
   - Eigene begründete Urteilsbildung, geht über M 1 hinaus`;
  }

  const systemPrompt = `Du bist ein Experte für das bayerische Geschichte-Abitur (ab 2026, G9). Erstelle eine authentische Abituraufgabe exakt nach dem Format der offiziellen IQB-Beispielaufgaben.

SCHWERPUNKT: ${sp.titel} ${sp.zeitraum}
MÖGLICHE THEMEN: ${sp.themen}${schwerpunktZusatz}
ANFORDERUNGSNIVEAU: ${niveauText}

KLAUSUR-PARAMETER:
- Gesamt: ${beProAufgabe} BE (Bewertungseinheiten)
- Bearbeitungszeit: ${aufgabenAnzahl > 1 ? Math.round(zeitMinuten / aufgabenAnzahl) : zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${beProAufgabe} BE sinnvoll auf die Teilaufgaben
- Die Summe aller Teilaufgaben-BE muss exakt ${beProAufgabe} ergeben
- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!

AUFGABENFORMAT (orientiert am offiziellen Beispielabitur Bayern):
Die Aufgabe besteht aus einem Einleitungstext, einem Hauptmaterial (M 1) und ${teilaufgabenAnzahl} Teilaufgaben.

1. EINLEITUNG (2-4 Sätze):
   - Stellt den historischen Kontext her und führt zum Material hin
   - Kann ein Szenario enthalten (z.B. "An Ihrer Schule findet ... statt", "Im Rahmen eines Projekts ...")
   - Benennt das Material (z.B. "In seiner Rede ... legte XY dar (M 1)." oder "Die Statistik M 1 zeigt ...")
   - Beispiel: "Der deutsche Staatsrechtler Hugo Preuß legte am 14. November 1918 seine Kritik an der Revolutionsregierung dar (M 1)."

2. HAUPTMATERIAL (M 1) — wähle EINEN der folgenden Typen:

   a) primary_type "text" (ca. 60% der Fälle, STANDARD):
      - Substanzielle Textquelle (400-800 Wörter): Rede, Zeitungsartikel, Brief, Memoiren, Erlass, Vertragsauszug, Historikertext
      - MUSS einen REALEN historischen Autor und korrekten Kontext haben
      - Mit Zeilennummerierung (alle 5 Zeilen) und ggf. Fußnoten
      - Sprache muss dem Entstehungszeitraum entsprechen
      - Inhalt in "primary_text", Quellenangabe in "primary_meta"

   b) primary_type "statistik" (ca. 20% der Fälle):
      - Historische Daten als Markdown-Tabelle: Bevölkerungszahlen, Wahlergebnisse, Wirtschaftsdaten, Zeitleisten
      - Mit Titel und Quellenangabe
      - Inhalt in "primary_text" als Markdown-Tabelle (mit |), Quellenangabe in "primary_meta"

   c) primary_type "foto" (ca. 20% der Fälle):
      - Historisches Foto, Gemälde, Plakat, Denkmal, Gebäude, Ort
      - "primary_text" = Bildprompt auf Englisch (5-10 Sätze), NUR visuellen Inhalt
      - Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen, KEINE Wörter im Bild!
      - "primary_bild_labels": {"1": "Deutsche Beschriftung", "2": "..."}
      - "primary_meta" = Bildunterschrift/Quellenangabe
      - KEINE Karikaturen oder realen Personen!

${teilaufgabenBeschreibung}

BEISPIELE FÜR KORREKTE AUFGABENSTELLUNGEN:
- "1 Arbeiten Sie aus dem Zeitungsartikel M 1 die Argumentation und Position von Hugo Preuß vor dem Hintergrund des Ringens um eine demokratische Ordnung heraus!" (AFB I/II)
- "2 Ordnen Sie die Position von Hugo Preuß in die politische Debatte um die Verfassungsordnung 1918/19 ein!" (AFB II)
- "3 Erörtern Sie, inwieweit die Weimarer Reichsverfassung ein Gegenmodell zum Obrigkeitsstaat des Deutschen Kaiserreichs entwirft!" (AFB III)
- "1 Stellen Sie auch mithilfe von M 1 zentrale Konfliktthemen in den israelisch-palästinensischen Beziehungen seit 1948 dar!" (AFB I)
- "2 Arbeiten Sie aus M 1 die Grundlinien für eine Lösung heraus und bewerten Sie diese differenziert!" (AFB II/III)

ABSOLUTE PFLICHT:
- Das Material MUSS historisch KORREKT sein mit realen Fakten
- Die Operatoren MÜSSEN den AFB-Stufen entsprechen
- Die Aufgabe MUSS zum Schwerpunkt passen
- Bei primary_type "text": Quelle MUSS 400-800 Wörter lang sein, NICHT kürzer!
- Bei primary_type "statistik": Tabelle mit mindestens 5 Zeilen realer historischer Daten
- Bei primary_type "foto": Detaillierter englischer Bildprompt (5-10 Sätze), NUR Nummern als Marker
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, die in den oben genannten Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern.
${level !== "eA" ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" oder Vertiefungsmodule (z.B. Jüdisches Leben, Erinnerungskultur, Naher/Mittlerer Osten) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}
- JEDES Material MUSS in mindestens einer Teilaufgabe explizit referenziert werden (z.B. "mithilfe von M 1", "anhand von M 2"). Erstelle KEINE Materialien, die nicht in den Aufgabenstellungen genutzt werden!
- Optional 0-2 ergänzende Materialien (M 2, M 3) als Array "zusatz_materialien", NUR wenn sie in den Teilaufgaben benötigt und referenziert werden
  - type "foto"/"bild": content = Bildprompt auf Englisch (5-10 Sätze), NUR Nummern als Marker. "bild_labels": {"1": "Beschriftung", ...}. KEINE Karikaturen oder Personen!
  - type "statistik": content = Markdown-Tabelle, title = Titel
  - type "text": content = Textauszug

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "primary_type": "text ODER statistik ODER foto",
  "task_instruction": "Vollständige Aufgabenstellung: Einleitung + nummerierte Teilaufgaben (${teilaufgabenNummern}) mit BE-Angaben — Summe MUSS ${beProAufgabe} BE ergeben!",
  "primary_text": "Bei text: Textquelle (400-800 Wörter) MIT Quelleneinleitung. Bei statistik: Markdown-Tabelle. Bei foto: Bildprompt auf Englisch.",
  "primary_meta": "Quellenangabe / Bildunterschrift",
  "primary_bild_labels": "NUR bei primary_type foto: {\"1\": \"Beschriftung\", ...} — sonst weglassen",
  "zusatz_materialien": [
    {"title": "...", "type": "foto", "content": "Bildprompt auf Englisch.", "bild_labels": {"1": "...", "2": "..."}, "source": ""}
  ],
  "thema": "Konkretes Thema der Aufgabe",
  "schwerpunkt": "${selectedSchwerpunkt.replace('_', '/')}"
}`;

  const userPrompt = `Erstelle eine materialgebundene Abituraufgabe für das Fach Geschichte (Bayern, G9, ab 2026).

Schwerpunkt: ${sp.titel} ${sp.zeitraum}
Anforderungsniveau: ${level || "gA"}
${level !== "eA" ? `WICHTIG: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-Vertiefungsmodule oder eA-exklusive Themen!` : ""}

KRITISCH:
- Wähle einen passenden primary_type für M 1: "text" (Textquelle, ca. 60%), "statistik" (Daten/Tabelle, ca. 20%) oder "foto" (historisches Bild, ca. 20%). Variiere den Typ!
- Bei primary_type "text": Mindestens 500-800 Wörter! Substanzielle Quelle mit MEHR Informationen als nötig. Verwende eine REALE historische Persönlichkeit als Autor.
- Bei primary_type "statistik": Markdown-Tabelle mit realen historischen Daten (mind. 5 Zeilen). Z.B. Wahlergebnisse, Bevölkerungsentwicklung, Wirtschaftsdaten, Zeitleiste.
- Bei primary_type "foto": Detaillierter Bildprompt auf Englisch (5-10 Sätze). Historisches Foto, Gemälde, Denkmal, Gebäude, Plakat. NUR NUMMERN als Marker! "primary_bild_labels" mitliefern.
- Die Teilaufgaben müssen nummeriert sein (${teilaufgabenNummern}) mit BE-Angaben in Klammern. Summe = ${beProAufgabe} BE!
- Orientiere dich am Format der offiziellen bayerischen Beispielabitur-Aufgaben.
- ALLE Texte und Statistiken auf DEUTSCH! Bildprompts auf Englisch, NUR Nummern als Beschriftungen.
- Erstelle NUR dann ergänzende Materialien (zusatz_materialien), wenn sie in den Teilaufgaben auch explizit referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "statistik" oder "foto". KEINE Karikaturen oder Personen!`;

  // Bei mehreren Aufgaben: parallele API-Aufrufe, dann Ergebnisse zusammenführen
  if (aufgabenAnzahl > 1) {
    const themenHinweise = [
      "Wähle ein FRÜHES Thema aus dem Schwerpunkt.",
      "Wähle ein ANDERES Thema als typischerweise gewählt wird — einen weniger bekannten Aspekt.",
      "Wähle ein SPÄTES Thema oder einen aktuelleren Bezug aus dem Schwerpunkt.",
      "Wähle einen kulturellen oder gesellschaftlichen Aspekt aus dem Schwerpunkt.",
      "Wähle einen internationalen oder vergleichenden Aspekt aus dem Schwerpunkt."
    ];
    const promises = Array.from({length: aufgabenAnzahl}, (_, i) => {
      const variantPrompt = userPrompt + `\n\nWICHTIG: ${themenHinweise[i % themenHinweise.length]} Verwende eine ANDERE historische Quelle und ein ANDERES Unterthema als andere Aufgaben zum selben Schwerpunkt.`;
      return callOpenAI(env, [
        { role: "system", content: systemPrompt },
        { role: "user", content: variantPrompt }
      ], 10000).then(res => {
        try { return extractJSON(res); } catch (e) { console.error(`Geschichte Aufgabe ${i+1} JSON-Fehler:`, e.message); return null; }
      }).catch(err => { console.error(`Geschichte Aufgabe ${i+1} API-Fehler:`, err.message); return null; });
    });

    const results = (await Promise.all(promises)).filter(r => r !== null);
    if (results.length === 0) {
      return jsonResponse({ error: "Keine Aufgabe konnte generiert werden. Bitte erneut versuchen." }, 500, env);
    }

    // Ergebnisse in tasks-Array zurückgeben
    const merged = {
      tasks: results.map((t, i) => ({
        aufgabe_nr: i + 1,
        task_instruction: t.task_instruction,
        primary_type: t.primary_type || "text",
        primary_text: t.primary_text,
        primary_meta: t.primary_meta,
        primary_bild_labels: t.primary_bild_labels || null,
        zusatz_materialien: t.zusatz_materialien || [],
        thema: t.thema || ""
      })),
      thema: results.map(t => t.thema).join(', '),
      schwerpunkt: results[0]?.schwerpunkt || selectedSchwerpunkt.replace('_', '/')
    };
    return jsonResponse(merged, 200, env);
  }

  // Einzelaufgabe: Standard-Aufruf
  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 10000);
  } catch (err) {
    console.error("Geschichte generate – OpenAI Fehler:", err.message);
    return jsonResponse({ error: "KI-Fehler: " + truncate(err.message || "Unbekannt", 150) }, 500, env);
  }

  try {
    const content = extractJSON(openaiRes);
    return jsonResponse(content, 200, env);
  } catch (err) {
    console.error("Geschichte generate – JSON-Parse Fehler:", err.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen." }, 500, env);
  }
}

/* ================= GESCHICHTE: GRADE ================= */
export async function handleGradeGeschichte(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials, images } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Quellenmaterial:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
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
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= DEUTSCH: GENERATE ================= */
export async function handleGenerateDeutsch(request, env) {
  const body = await request.json();
  const { type, gattung, epoche, schreibauftrag, thema, textsorte, typ, aufgabentyp, bearbeitungszeit } = body;
  const refZeit = 315;
  const refBE = 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  let systemPrompt, userPrompt;

  if (type === "interpretation") {
    // Gattungsspezifische Aufgabenstruktur
    const gattungRegeln = gattung === "lyrik"
      ? `AUFGABENSTRUKTUR FÜR LYRIK:
- Teil 1 (Schwerpunkt): Erschließen und interpretieren Sie das vorliegende Gedicht. Arbeiten Sie dabei EIN bis ZWEI zentrale Aspekte heraus (z.B. Naturdarstellung, lyrisches Ich, Vergänglichkeitsmotiv).
- Teil 2: Motivvergleich mit einem ZWEITEN Gedicht (Vergleichstext wird mitgeliefert). Z.B. "Vergleichen Sie die Funktion und Gestaltung des Motivs X im Textausschnitt mit dem Motiv X im Vergleichstext."
- NUR bei Lyrik gibt es einen Vergleichstext (zweites Gedicht)!

TEXTLÄNGE:
- Hauptgedicht: Komplettes Gedicht (3-7 Strophen, 20-40 Verse, ca. 100-200 Wörter)
- Vergleichsgedicht: Kürzeres Gedicht (2-4 Strophen, 8-16 Verse)`
      : gattung === "drama"
      ? `AUFGABENSTRUKTUR FÜR DRAMA:
- Teil 1 (Schwerpunkt): KURZE, fokussierte Aufgabenstellung! Nur 1-2 Sätze. Beispiel: "Interpretieren Sie den vorliegenden Auszug aus [Autor] '[Werk]'. Arbeiten Sie dabei insbesondere heraus, wie [EIN konkreter Aspekt, z.B. 'der Protagonist dargestellt wird' oder 'der Konflikt zwischen X und Y gestaltet wird']."
- Teil 2: KURZ! Vergleich mit einem ANDEREN literarischen Werk (KEIN Vergleichstext mitgeliefert — der Schüler wählt selbst). Nur 1-2 Sätze. Beispiel: "Zeigen Sie ausgehend von Ihren Ergebnissen vergleichend auf, wie in einem anderen literarischen Werk [ein Protagonist/eine Figur] mit einer Situation [des Konflikts/der Überforderung/etc.] umgeht."
- KEIN Vergleichstext bei Drama! compare_text und compare_meta müssen null sein.

TEXTLÄNGE:
- Szenenausschnitt: 100-150 Zeilen Dialog mit Regieanweisungen (800-1200 Wörter)`
      : `AUFGABENSTRUKTUR FÜR EPIK:
- Teil 1 (Schwerpunkt): KURZE, fokussierte Aufgabenstellung! Nur 1-2 Sätze. Beispiel: "Interpretieren Sie den vorliegenden Auszug aus [Autor] '[Werk]'. Arbeiten Sie dabei insbesondere heraus, wie [EIN konkreter Aspekt, z.B. 'die Erzählperspektive die Darstellung der Figur prägt' oder 'das Motiv der Entfremdung gestaltet wird']."
- Teil 2: KURZ! Vergleich mit einem ANDEREN literarischen Werk (KEIN Vergleichstext mitgeliefert — der Schüler wählt selbst). Nur 1-2 Sätze. Beispiel: "Zeigen Sie ausgehend von Ihren Ergebnissen vergleichend auf, wie in einem anderen literarischen Werk [Thema/Motiv] dargestellt wird."
- KEIN Vergleichstext bei Epik! compare_text und compare_meta müssen null sein.

TEXTLÄNGE:
- Geschlossener Prosatext: 1000-1500 Wörter (vollständige Kurzgeschichte oder verständlicher Romanauszug)`;

    systemPrompt = `Du bist ein Experte für das bayerische Deutsch-Abitur (ab 2026, G9). Erstelle eine authentische Interpretationsaufgabe.

${gattungRegeln}

EPOCHEN-ZUORDNUNG — STRIKT EINHALTEN:
Verwende NUR Autoren, die tatsächlich zur gewählten Epoche gehören!
- Klassik und Romantik (ca. 1786-1835): Goethe, Schiller, Kleist, Novalis, Eichendorff, E.T.A. Hoffmann, Brentano, Hölderlin
- Realismus (ca. 1848-1890): Fontane, Storm, Keller, Raabe, C.F. Meyer, Droste-Hülshoff (Spätwerk)
- Naturalismus (ca. 1880-1900): Hauptmann, Holz, Schlaf
- Moderne (ca. 1890-1950): Rilke, Trakl, Kafka, Brecht, Döblin, Thomas Mann, Musil, Schnitzler, Hofmannsthal
- Nachkriegszeit bis Mauerfall (1945-1989): Borchert, Böll, Grass, Bachmann, Celan, Bernhard, Dürrenmatt, Frisch, Christa Wolf
- Literatur seit 1989: Erpenbeck (Heimsuchung – G9-Pflichtlektüre!), Herta Müller, Juli Zeh, Daniel Kehlmann
WICHTIG: Kleist gehört zur Klassik/Romantik, NICHT zum Realismus! Hauptmann ist Naturalist, NICHT Moderne!

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Untersuchen Sie die sprachlichen Mittel (Metapher, Alliteration, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Verwende bekannte, kanonische Texte der deutschen Literatur die du vollständig kennst.

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Zweiteilige Aufgabenstellung — bei Drama/Epik: KURZ (je 1-2 Sätze pro Teil)!",
  "primary_text": "DER VOLLSTÄNDIGE LITERARISCHE TEXT in voller Länge!",
  "primary_meta": "Autor, Titel, Jahr",
  "compare_text": "NUR bei Lyrik: Vergleichsgedicht. Bei Drama/Epik: null!",
  "compare_meta": "NUR bei Lyrik: Metadaten Vergleichsgedicht. Sonst null",
  "material_text": "Material für poetologische Aufgabe oder null",
  "material_meta": "Quelle oder null",
  "gattung": "${truncate(gattung, 100)}",
  "epoche": "Konkrete Epoche",
  "weight_part1": 70,
  "weight_part2": 30
}`;
    userPrompt = `Erstelle eine Interpretationsaufgabe:
- Gattung: ${truncate(gattung, 100)}
- Epoche: ${epoche === "random" ? "frei wählbar" : truncate(epoche, 100)}
- Weiterführender Auftrag: ${truncate(schreibauftrag, 500)}

AUFGABENSTELLUNG — ORIENTIERE DICH AN ECHTEN ABITURAUFGABEN:
${gattung === "lyrik" ? `- Teil 1: "Erschließen und interpretieren Sie das vorliegende Gedicht. Arbeiten Sie dabei [Aspekt] heraus und zeigen Sie, wie [...]."
- Teil 2: Motivvergleich mit dem Vergleichsgedicht. "Vergleichen Sie die Funktion und Gestaltung des Motivs X im Gedicht mit dem Motiv X im Vergleichstext."
- Liefere ein Vergleichsgedicht in compare_text!` : `- Teil 1: KURZ! Nur 1-2 Sätze. "Interpretieren Sie den vorliegenden Auszug aus [Autor] '[Werk]'. Arbeiten Sie dabei insbesondere heraus, [EIN Aspekt]."
- Teil 2: KURZ! Nur 1-2 Sätze. Vergleich mit einem anderen Werk (Schüler wählt selbst). "Zeigen Sie vergleichend auf, wie in einem anderen literarischen Werk [Motiv/Thema] dargestellt wird."
- KEIN Vergleichstext! compare_text = null, compare_meta = null`}

EPOCHEN-ZUORDNUNG:
Die gewählte Epoche bestimmt, welche Autoren/Werke verwendet werden dürfen. Halte dich STRIKT an die korrekte literaturhistorische Zuordnung!
LehrplanPLUS-Epochen (G9): Klassik und Romantik, Realismus (19. Jh.), Naturalismus (ca. 1880-1900), Moderne (Jahrhundertwende – Mitte 20. Jh.), Nachkriegszeit bis Mauerfall, Literatur seit 1989.
Ländergemeinsames Themenfeld 2026: "Umbrüche in der deutschsprachigen Literatur um 1900".

Nutze bekannte Werke wie: Goethe (Faust, Werther, Gedichte), Schiller (Die Räuber, Kabale und Liebe), Kleist (Der zerbrochne Krug – G9-Pflichtlektüre!), Büchner (Woyzeck), Fontane, Kafka, Rilke, Trakl, Brecht, Eichendorff, Droste-Hülshoff, Erpenbeck (Heimsuchung – G9-Pflichtlektüre!), Borchert, Bachmann, Bernhard, Herta Müller, Hauptmann (Naturalismus!), etc.`;

  } else if (type === "analyse") {
    systemPrompt = `Du erstellst Analyseaufgaben für pragmatische Texte (Deutsch-Abitur Bayern, ab 2026).

WICHTIG - TEXTLÄNGE WIE IM ECHTEN ABITUR:
- Der pragmatische Text muss 1000-1500 Wörter lang sein (ca. 2-3 Druckseiten)
- Das entspricht einem vollständigen Zeitungsartikel, Kommentar, Essay oder Redeauszug
- Der Text muss eine klare argumentative Struktur, sprachliche Gestaltungsmittel und eine erkennbare Intention haben
- Typische Quellen: FAZ, Die Zeit, Süddeutsche Zeitung, Spiegel, Reden, Fachessays

Die Aufgabenstellung ist ZWEITEILIG:
- Teil 1: Analyse des Textes (Argumentationsstruktur, sprachliche Mittel, Intention)
- Teil 2: Weiterführender Schreibauftrag

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Analysieren Sie die Argumentationsstruktur (These, Belege, Schlussfolgerung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Zweiteilige Aufgabenstellung mit klaren Operatoren",
  "primary_text": "Der vollständige pragmatische Text (1000-1500 Wörter!)",
  "primary_meta": "Autor, Quelle (z.B. Zeitung), Erscheinungsdatum",
  "textsorte": "Textsorte (Kommentar, Essay, Rede, Kolumne, etc.)",
  "compare_text": "Vergleichstext oder null",
  "compare_meta": "Metadaten oder null"
}`;
    userPrompt = `Erstelle eine Analyseaufgabe:
- Textsorte: ${textsorte === "random" ? "frei wählbar" : truncate(textsorte, 200)}
- Thema: ${thema === "random" ? "frei wählbar" : truncate(thema, 200)}
- Weiterführend: ${truncate(schreibauftrag, 500)}

KRITISCH: Der Text MUSS 1000-1500 Wörter lang sein! Das ist die Länge eines vollständigen Zeitungsartikels oder Essays. Keine Zusammenfassung, sondern ein ausführlicher, durchargumentierter Text mit Einleitung, Hauptteil und Schluss.`;

  } else if (type === "eroerterung") {
    systemPrompt = `Du erstellst textbezogene Erörterungsaufgaben (Aufgabe 4, EP) für das Deutsch-Abitur Bayern G9 (ab 2026).

Bei der Erörterung pragmatischer Texte erhalten die Schüler einen heuristischen Zieltext und verfassen eine textbezogene Erörterung.

WICHTIG - TEXTLÄNGE WIE IM ECHTEN ABITUR:
- Der Ausgangstext muss 1000-1500 Wörter lang sein (ca. 2-3 Druckseiten)
- Das ist ein vollständiger journalistischer Meinungstext mit klarer These und Argumentation
- Der Text vertritt eine deutliche Position zu einem kontroversen Thema
- Typische Quellen: Zeitungskommentare, Kolumnen, Essays, Reden (FAZ, Die Zeit, SZ, Spiegel)

Die Aufgabenstellung hat ZWEI Teile:
- Teil a) (~40%): Analyse der zentralen Aussage und Argumentationsstruktur des Textes
- Teil b) (~60%): Erörterung der im Text vertretenen Position (eigene Stellungnahme mit Argumenten und Beispielen)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die Position des Autors (Digitalisierung, soziale Medien, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

Antworte NUR mit validem JSON:
{
  "task_instruction": "Zweiteilige Aufgabenstellung: a) Analyse der Argumentation, b) Erörterung der Position",
  "primary_text": "Der vollständige Ausgangstext mit klarer Position (1000-1500 Wörter!)",
  "primary_meta": "Autor, Quelle, Erscheinungsdatum",
  "thema": "Themenbereich"
}`;
    userPrompt = `Erstelle eine textbezogene Erörterungsaufgabe (Aufgabe 4, EP):
- Thema: ${thema === "random" ? "frei wählbar (aktuell, kontrovers, gesellschaftlich relevant)" : truncate(thema, 200)}

KRITISCH: Der Ausgangstext MUSS 1000-1500 Wörter lang sein! Ein vollständiger Meinungsartikel mit These, Argumenten, Belegen und Schlussfolgerung. Keine Kurzfassung!
Die Aufgabe muss zweiteilig sein: a) Analyse der Argumentation (~40%) + b) Erörterung der Position (~60%).`;

  } else if (type === "materialgestuetzt") {
    systemPrompt = `Du erstellst materialgestützte Schreibaufgaben für das Deutsch-Abitur Bayern (ab 2026).

WICHTIG - MATERIALIEN WIE IM ECHTEN ABITUR:
Im echten Abitur gibt es 5-9 Materialien mit insgesamt 2000-3500 Wörtern Lesematerial.

Erstelle genau 6-8 verschiedene Materialien:
- Textmaterialien (type "text"): MINDESTENS 400-800 Wörter pro Material! Vollständige Textauszüge aus Zeitungsartikeln, Fachtexten, Essays, Interviews oder Reden. Echte Argumentation, NICHT nur Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten.
- Statistiken (type "statistik"): Als Markdown-Tabelle mit konkreten Zahlen und Prozentwerten formatieren. Mindestens 6-10 Datenzeilen. Unter der Tabelle eine kurze Beschreibung der Erhebung.
- Mindestens 1-2 Materialien vom Typ "statistik" (Umfrage, Studie, Statistik als Tabelle)
- Mindestens 4 Materialien vom Typ "text" (Zeitungsartikel, Fachtext, Essay, Interview, Rede)
- 1 Material kann ein kürzeres Zitat/Expertenaussage sein (type "text", 100-200 Wörter)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Setzen Sie sich mit dem Thema auseinander (Pro/Contra, gesellschaftliche Folgen, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Alltagssituationen, Symbolbilder, Natur) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - type "foto": Realistisches Foto. content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Alltagsszenen (ohne Gesichter), Gebäude, Natur, Symbolbilder. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - type "bild": Schaubild/Infografik/Diagramm. content = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Zusätzlich MUSS das Material-Objekt ein Feld "bild_labels" enthalten: {"1": "Deutsche Beschriftung", "2": "Weitere Beschriftung", ...}. KEINE Karikaturen oder Personen!
Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Präzise Aufgabenstellung mit Textsorte, Adressat, Anlass und konkretem Schreibauftrag",
  "zieltext": "Geforderte Textsorte",
  "zielgruppe": "Adressaten",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Inhalt (300-600 Wörter)", "source": "Autor, Quelle, Jahr"},
    {"title": "Titel der Statistik", "type": "statistik", "content": "| Kategorie | Wert |\\n|---|---|\\n| ... | ... |\\nBeschreibung der Statistik.", "source": "Institut/Studie, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""}
  ]
}`;
    userPrompt = `Erstelle eine materialgestützte Aufgabe:
- Typ: ${aufgabentyp === "argumentieren" ? "Argumentierender Beitrag" : "Informierender Text"}
- Thema: ${thema === "random" ? "frei wählbar" : truncate(thema, 200)}
- Zieltextsorte: ${truncate(textsorte, 200)}

KRITISCH - Längen wie im echten Abitur:
- 6-8 Materialien insgesamt
- Jedes Textmaterial MINDESTENS 400-800 Wörter (vollständige Auszüge, NICHT Stichpunkte oder Zusammenfassungen!)
- Die Materialien sollen MEHR Informationen enthalten als strikt nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten
- Statistiken als Markdown-Tabelle mit echten, plausiblen Zahlen (6-10 Zeilen)
- Gesamtes Lesematerial: ca. 3000-5000 Wörter
- IMMER 1-2 Bilder als Material erstellen
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in der Aufgabenstellung direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben — jedes Material muss für die Bearbeitung der Aufgabe notwendig sein!`;
  } else {
    return jsonResponse({ error: "Unbekannter Aufgabentyp." }, 400, env);
  }

  // Längere Texte brauchen mehr Tokens (Epik/Analyse/Erörterung: 1000-1500 Wörter ≈ 10000+ Tokens)
  const tokenMap = { interpretation: 10000, analyse: 10000, eroerterung: 10000, materialgestuetzt: 16000 };
  const maxTokens = tokenMap[type] || 8000;
  // materialgestuetzt braucht viele Tokens → schnelleres Modell verwenden um Timeout zu vermeiden
  const useModel = type === "materialgestuetzt" ? "gpt-4.1" : undefined;
  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(maxTokens, bearbeitungszeit, refZeit), useModel ? { model: useModel } : undefined);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= DEUTSCH: STRUKTURANALYSE (Schritt 1) ================= */
export async function analyzeTextStructure(env, contextInfo, studentText, type, images) {
  const typeLabels = {
    analyse: "Textanalyse eines pragmatischen Textes",
    eroerterung: "Textbezogene Erörterung eines pragmatischen Textes",
    interpretation: "Interpretation eines literarischen Textes",
    materialgestuetzt: "Materialgestütztes Schreiben"
  };
  const aufgabentyp = typeLabels[type] || "Deutschaufsatz";

  const systemPrompt = `Du bist ein erfahrener Deutsch-Lehrer am bayerischen Gymnasium. Analysiere den folgenden Schülertext OHNE ihn zu bewerten oder zu benoten. Erstelle eine sachliche, objektive Bestandsaufnahme der Textstruktur und -inhalte.

Aufgabentyp: ${aufgabentyp}

Antworte NUR mit validem JSON:
{
  "thema_erkannt": true/false,
  "zentrale_these": "Die zentrale These/Deutungshypothese des Schülers in einem Satz (oder null falls nicht erkennbar)",
  "argumentationsstruktur": {
    "anzahl_argumente": <Zahl>,
    "argumente": ["Zusammenfassung Argument 1", "Zusammenfassung Argument 2"],
    "qualitaet": "differenziert" | "einseitig" | "oberflaechlich" | "nicht_erkennbar"
  },
  "fachbegriffe": ["verwendeter Fachbegriff 1", "verwendeter Fachbegriff 2"],
  "textbelege_zitate": <Anzahl direkter Zitate oder Textverweise>,
  "struktur": {
    "einleitung": true/false,
    "hauptteil": true/false,
    "schluss": true/false,
    "kohaerenz": "gut" | "teilweise" | "schwach"
  },
  "fliesstext": true/false,
  "sprachliche_mittel_erkannt": ["erkanntes Mittel 1", "erkanntes Mittel 2"],
  "textlaenge_woerter": <geschätzte Wortanzahl>
}

WICHTIG: Keine Bewertung, keine Punkte, kein Feedback — nur objektive Bestandsaufnahme.`;

  const userContent = buildUserContent(`${contextInfo}\nSchülertext:\n${truncate(studentText, 15000)}`, images);
  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";

  const res = await callOpenAI(env, [
    { role: "system", content: systemPrompt + bilderHinweis },
    { role: "user", content: userContent }
  ], 2000, { temperature: 0.3 });

  return extractJSON(res);
}

/* ================= DEUTSCH: GRADE (2-Stufen-Bewertung) ================= */
export async function handleGradeDeutsch(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, type, materials, zieltext, zielgruppe, images } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Ausgangstext:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  if (zieltext) contextInfo += `Geforderter Zieltext: ${truncate(zieltext, 200)}\n`;
  if (zielgruppe) contextInfo += `Zielgruppe: ${truncate(zielgruppe, 200)}\n`;

  // Schritt 1: Strukturanalyse (separater KI-Call)
  let analyseText = "";
  try {
    const analyse = await analyzeTextStructure(env, contextInfo, student_text, type, images);
    analyseText = `\n\nVORAB-STRUKTURANALYSE (automatisch erstellt – als Orientierung, nicht blindlings übernehmen):\n${JSON.stringify(analyse, null, 2)}\n\n`;
  } catch {
    // Fallback: Wenn Analyse fehlschlägt, weiter ohne – der Bewertungs-Call funktioniert auch allein
  }

  // Schritt 2: Bewertung nach Rubrik (mit Analyse als Kontext)
  const korrekturAnweisung = KORREKTUR_SINGLE;
  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${analyseText}${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { temperature: 0.3 });

  // Schritt 3: Regelbasierte Punkteberechnung
  try {
    const parsed = extractJSON(openaiRes);
    const verstehen = parsed.verstehen_np ?? null;
    const darstellung = parsed.darstellung_np ?? null;
    let gesamt = parsed.gesamt_np ?? null;

    if (gesamt == null && verstehen != null && darstellung != null) {
      const weight = type === "materialgestuetzt" ? 0.6 : 0.7;
      gesamt = Math.round(verstehen * weight + darstellung * (1 - weight));
      if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
    }

    return jsonResponse({
      scores: { verstehen, darstellung, total: gesamt },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { verstehen: null, darstellung: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= DEUTSCH: GRADE STREAMING (SSE) ================= */
// Streaming-Variante der Deutsch-Korrektur — sendet Server-Sent Events für Echtzeit-Fortschritt.
// Umgeht das Worker-Timeout, da durch kontinuierlichen Datenfluss der CPU-Timer zurückgesetzt wird.
export async function handleGradeDeutschStream(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, type, materials, zieltext, zielgruppe, images } = body;

  if (!student_text || !rubric_prompt) {
    return new Response(JSON.stringify({ error: "student_text und rubric_prompt erforderlich." }), {
      status: 400, headers: corsHeaders(env, env._origin)
    });
  }

  // Kontext aufbauen (identisch zu handleGradeDeutsch)
  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;
  if (primary_text) contextInfo += `Ausgangstext:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }
  if (zieltext) contextInfo += `Geforderter Zieltext: ${truncate(zieltext, 200)}\n`;
  if (zielgruppe) contextInfo += `Zielgruppe: ${truncate(zielgruppe, 200)}\n`;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendSSE = async (event, data) => {
    await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  // Korrektur im Hintergrund verarbeiten, Ergebnisse streamen
  const processGrading = async () => {
    try {
      // Phase 1: Strukturanalyse
      await sendSSE("status", { phase: "analyse", message: "Textstruktur wird analysiert..." });

      let analyseText = "";
      try {
        const analyse = await analyzeTextStructure(env, contextInfo, student_text, type, images);
        analyseText = `\n\nVORAB-STRUKTURANALYSE (automatisch erstellt – als Orientierung, nicht blindlings übernehmen):\n${JSON.stringify(analyse, null, 2)}\n\n`;
        await sendSSE("status", { phase: "analyse_done", message: "Strukturanalyse abgeschlossen" });
      } catch {
        // Fallback: ohne Analyse weiter
      }

      // Phase 2: Bewertung mit Streaming
      await sendSSE("status", { phase: "bewertung", message: "Dein Aufsatz wird bewertet..." });

      const korrekturAnweisung = KORREKTUR_SINGLE;
      const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
      const messages = [
        { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
        { role: "user", content: buildUserContent(`${analyseText}${contextInfo}\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
      ];

      let charCount = 0;
      const openaiRes = await callOpenAIStream(env, messages, 8000, { temperature: 0.3 }, async (chunk) => {
        charCount += chunk.length;
        // Alle ~1000 Zeichen Fortschritt senden (hält Verbindung aktiv + zeigt Progress)
        if (charCount % 1000 < chunk.length) {
          await sendSSE("progress", { chars: charCount });
        }
      });

      // Phase 3: Ergebnis aufbereiten
      await sendSSE("status", { phase: "auswertung", message: "Ergebnis wird aufbereitet..." });

      try {
        const parsed = extractJSON(openaiRes);
        const verstehen = parsed.verstehen_np ?? null;
        const darstellung = parsed.darstellung_np ?? null;
        let gesamt = parsed.gesamt_np ?? null;

        if (gesamt == null && verstehen != null && darstellung != null) {
          const weight = type === "materialgestuetzt" ? 0.6 : 0.7;
          gesamt = Math.round(verstehen * weight + darstellung * (1 - weight));
          if (verstehen === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
        }

        await sendSSE("result", {
          scores: { verstehen, darstellung, total: gesamt },
          feedback: parsed.feedback || "",
          feedback_kurz: parsed.feedback_kurz || [],
          korrektur_text: parsed.korrektur_text || "",
          korrektur_text_a: parsed.korrektur_text_a || "",
          korrektur_text_b: parsed.korrektur_text_b || "",
          fehlende_aspekte: parsed.fehlende_aspekte || [],
          uebungsaufgaben: parsed.uebungsaufgaben || []
        });
      } catch {
        await sendSSE("result", {
          scores: { verstehen: null, darstellung: null, total: null },
          feedback: openaiRes,
          feedback_kurz: [],
          korrektur_text: "",
          fehlende_aspekte: [],
          uebungsaufgaben: []
        });
      }
    } catch (err) {
      const msg = err.message || "Unbekannter Fehler";
      const isUnsafe = /api[_-]?key|token|secret|stack|\.js:/i.test(msg);
      await sendSSE("error", { message: isUnsafe ? "Interner Fehler." : msg });
    } finally {
      await writer.close();
    }
  };

  // Verarbeitung starten (nicht awaiten — läuft parallel zum Stream)
  processGrading();

  const headers = corsHeaders(env, env._origin);
  headers["Content-Type"] = "text/event-stream";
  headers["Cache-Control"] = "no-cache";

  return new Response(readable, { headers });
}

/* ================= DEUTSCH: MODEL ANSWER ================= */
export async function handleModelAnswerDeutsch(request, env) {
  const { task_instruction, primary_text, primary_meta, compare_text, material_text, type, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium (Leistungskurs Deutsch).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Verwende Fachbegriffe korrekt
- Belege Aussagen mit Textzitaten
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion, welche Strategien verwendet wurden.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}\n\nHAUPTTEXT:\n${truncate(primary_text, 15000)}`;
  if (primary_meta) userContent += `\n(${truncate(primary_meta, 500)})`;
  if (compare_text) userContent += `\n\nVERGLEICHSTEXT:\n${truncate(compare_text, 10000)}`;
  if (material_text) userContent += `\n\nMATERIAL:\n${truncate(material_text, 10000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

