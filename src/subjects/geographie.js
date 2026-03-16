import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, KORREKTUR_AB, BILDER_HINWEIS_TEXT, klausurZeitHinweis, zeitanpassung, skaliereTokens } from '../config.js';

export async function handleParseTaskGeographie(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Geographie (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen geographischen Materialien (Karten, Klimadiagramme, Texte, Statistiken)
3. Quellenangaben (primary_meta) - Autor, Quelle, Datum

Antworte NUR mit validem JSON:
{"task_instruction": "...", "primary_text": "...", "primary_meta": "..."}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 6000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= GEOGRAPHIE: GENERATE ================= */
export async function handleGenerateGeographie(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const totalBE = be || 60;
  const zeitMinuten = zeit || 90;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2.5);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bePruefungA = totalBE + " BE";
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `Geo12 LB2 (24 Std.): Atmosphäre, Strahlungshaushalt, Drei-Zellen-Modell, Polarfrontjetstream, Monsun, ozeanische Zirkulation, ENSO, Klimawandel (anthropogen/natürlich), IPCC
Geo12 LB3 (20 Std.): Tropen (Immerfeuchte/Wechselfeuchte/Trockene Zone), Desertifikation, nachhaltige Nutzung tropischer Ökosysteme
Geo12 LB4 (16 Std.): Subpolare/Polare Zone, Permafrost, Kippelemente, Arktis-Geopolitik
Geo12 LB5 (24 Std.): Ressource Wasser/Wald/Boden/Fläche, Hochwasser, Klimaschutz in der Landwirtschaft
Geo12 LB6 (16 Std.): Hochgebirgsräume (Alpen), Massenbewegungen, Gletscherrückzug, Tourismus
Geo12 LB7 (12 Std.): Tektonische Naturgefahren, Plattentektonik, Vulkanismus, Erdbeben, tropische Wirbelstürme`,
      schwerpunkte: {
        klima: "Geo12 LB2: Klima und Klimawandel, atmosphärische Zirkulation",
        tropen: "Geo12 LB3: Tropen, Desertifikation, nachhaltige Nutzung",
        permafrost: "Geo12 LB4: Subpolare/Polare Zone, Permafrost, Kippelemente",
        ressourcen: "Geo12 LB5: Ressourcenkonflikte Wasser/Wald/Boden/Fläche",
        hochgebirge: "Geo12 LB6: Hochgebirgsräume, Gletscherrückzug, Tourismus",
        naturgefahren: "Geo12 LB7: Tektonische Naturgefahren, Plattentektonik"
      }
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `Geo12 LB5 (24 Std.): Ressource Wasser (Verfügbarkeit, Konflikte, virtuelles Wasser), Ressource Wald (tropischer Regenwald, Abholzung), Ressource Boden (Degradation, nachhaltige Nutzung), Ressource Fläche (Flächenverbrauch, Flächenkonkurrenz, Versiegelung)
Geo12 LB6 (16 Std.): Alpen als Lebens-/Wirtschafts-/Erholungsraum, Massentourismus, nachhaltiger Tourismus, Tragfähigkeit
Ergänzend: Landwirtschaft (konventionell vs. ökologisch, Agrarstrukturwandel), Erneuerbare Energien (Standortfaktoren, Energiewende)`,
      schwerpunkte: {
        wasser: "Geo12 LB5: Wasser als Ressource und Wasserkonflikte",
        flaeche: "Geo12 LB5: Ressource Fläche und Flächennutzungskonflikte",
        landwirtschaft: "Landwirtschaft, Welternährung, Klimaschutz",
        energie: "Erneuerbare Energien und Energiewende",
        tourismus: "Geo12 LB6: Tourismus in Hochgebirgsräumen"
      }
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `Geo13 LB2 (20 Std.): Entwicklungsindikatoren (HDI, Gini, BNE), Disparitäten, Globalisierung (Global Players, Wertschöpfungsketten), Entwicklungstheorien, Entwicklungsstrategien, Ferntourismus
Geo13 LB3 (24 Std.): Bevölkerungsentwicklung (demographischer Übergang, Altersstruktur), Migration (Push-Pull, Binnenmigration), Megacities, Urbanisierung (informelle Siedlungen, Primatstadt)
Geo13 LB4 (20 Std.): Fragmentierende Entwicklung (Fred Scholz), Nachhaltigkeit (SDGs, Drei-Säulen-Modell), Tropischer Regenwald (Ökosystem, Abholzung, Shifting Cultivation), Desertifikation`,
      schwerpunkte: {
        entwicklung: "Geo13 LB2: Entwicklungsländer und Entwicklungsindikatoren",
        globalisierung: "Geo13 LB2: Globalisierung und Wertschöpfungsketten",
        bevoelkerung: "Geo13 LB3: Bevölkerungsentwicklung und Migration",
        megacities: "Geo13 LB3: Megacities und Urbanisierung",
        nachhaltigkeit: "Geo13 LB4: Nachhaltigkeit und SDGs",
        regenwald: "Geo13 LB4: Tropischer Regenwald und Desertifikation"
      }
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `Geo13 LB5 (24 Std.): Stadtentwicklung (europäische/US-amerikanische/orientalische Stadt), Funktionale Gliederung, Suburbanisierung/Reurbanisierung, Gentrifizierung
Geo13 LB6 (20 Std.): Smart Cities, nachhaltige Stadtplanung, Mobilität, Klimawandel in Städten (Hitzeinsel-Effekt, Stadtklima)
Geo13 LB3: Segregation (soziale/ethnische/demographische), Demographischer Wandel, Integration`,
      schwerpunkte: {
        stadtentwicklung: "Geo13 LB5: Stadtentwicklung und historische Stadttypen",
        gentrifizierung: "Geo13 LB5: Gentrifizierung und soziale Folgen",
        suburbanisierung: "Geo13 LB5: Suburbanisierung und Reurbanisierung",
        smart_cities: "Geo13 LB6: Smart Cities und nachhaltige Stadtplanung",
        segregation: "Geo13 LB3: Segregation und demographischer Wandel",
        migration: "Geo13 LB3: Migration und Integration"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Beschreiben Sie …!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Erklären Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Bewerten Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Ursachen der Desertifikation (Überweidung, Abholzung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1-2 Materialien (1 Text + 1 Karte)' : totalBE < 40 ? '2-3 Materialien (Text, Statistik, Karte)' : '3-5 Materialien (geographische Texte, Statistiken, Karten, Klimadiagramme, Fotos)'}
- AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche geographische Quellentexte (Fachartikel, Zeitungsartikel, Auszüge aus geographischen Werken). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle Materialien vom Typ "karte" (interaktive OpenStreetMap-Karte) NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien!
  - type "karte": content ist ein OBJEKT (kein String!) mit: {"lat": 48.1, "lon": 11.5, "zoom": 6, "label": "Beschriftung"}
  - Wähle präzise Koordinaten für den geographischen Raum der Aufgabe
  - zoom: 3=Kontinent, 5=Land, 7=Region, 10=Stadt, 13=Stadtteil
- Erstelle wenn thematisch passend 1 Material vom Typ "klimadiagramm" (Walter-Lieth-Diagramm):
  - type "klimadiagramm": content ist ein OBJEKT (kein String!) mit: {"station": "Ortsname", "hoehe": 206, "temp": [-26.8,-24.1,-16.5,-5.2,5.8,12.3,16.1,14.2,7.5,-3.1,-15.8,-23.4], "niederschlag": [14,11,13,18,22,30,40,38,32,28,22,16]}
  - temp: Array mit 12 Monatsmitteltemperaturen in °C (Jan-Dez), plausible Werte für den Ort!
  - niederschlag: Array mit 12 Monatsniederschlägen in mm, plausible Werte für den Ort!
- Erstelle Materialien vom Typ "foto" (Landschaften, Städte, Naturphänomene, geographische Besonderheiten) NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien!
  - type "foto": content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen geographisch relevanten Kontext ein (z.B. konkreter Raumbeispiel, aktuelle Umweltdebatte, Nachhaltigkeitsproblem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum räumlichen Transfer

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen — weniger Vertiefung, keine eA-exklusiven Modelle oder Theorien. Halte dich strikt an den oben angegebenen Lehrplan für das gewählte Niveau.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Karte: Region X", "type": "karte", "content": {"lat": 48.1, "lon": 11.5, "zoom": 7, "label": "Süddeutschland"}, "source": "OpenStreetMap"},
    {"title": "Klimadiagramm: Ort X", "type": "klimadiagramm", "content": {"station": "München", "hoehe": 519, "temp": [-1.5,0.2,4.1,8.2,12.8,16.1,18.0,17.4,13.5,8.4,3.2,-0.3], "niederschlag": [48,44,58,62,90,115,126,110,75,56,52,50]}, "source": "DWD Klimadaten"},
    {"title": "Foto: ...", "type": "foto", "content": "Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen!", "source": ""}
  ],
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Geographie:
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 3-5 passende Materialien: 1 geographischer Text (400-800 Wörter), 1 Statistik, 1 Karte (mit Koordinaten-Objekt), und wenn passend 1 Klimadiagramm (mit Klimadaten-Objekt) oder 1 Foto.
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein — vollständige, ausführliche Quellentexte, NICHT Zusammenfassungen!
KRITISCH: Bei "karte" und "klimadiagramm" ist content ein JSON-OBJEKT, KEIN String! Klimadaten müssen realistisch sein für den jeweiligen Ort.
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgabe muss dem grundlegenden Anforderungsniveau entsprechen.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GEOGRAPHIE: GRADE ================= */
export async function handleGradeGeographie(request, env) {
  const body = await request.json();
  const { task_instruction, primary_text, student_text, rubric_prompt, materials, images } = body;

  if (!student_text || !rubric_prompt) {
    return jsonResponse({ error: "student_text und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `Aufgabenstellung:\n${truncate(task_instruction, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
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

/* ================= GEOGRAPHIE: MODEL ANSWER ================= */
export async function handleModelAnswerGeographie(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geographie (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende geographische Fachbegriffe korrekt (z.B. Klimadiagramm, Vegetationszone, Permafrost, HDI, Disparitäten, Fragmentierung, Nachhaltigkeit)
- Beziehe Karten, Statistiken und Texte ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, raumbezogenes, multiperspektivisches Urteil
- Zeige multiperspektivisches Denken: Stelle verschiedene geographische Perspektiven gegenüber
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion zu den verwendeten Strategien.`;

  let userContent = `AUFGABE:\n${truncate(task_instruction, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 5000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= GEOGRAPHIE ABITUR: GENERATE (Teil A + B) ================= */
export async function handleGenerateAbiturGeographie(request, env) {
  const body = await request.json();
  const { halbjahr, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const hjThemen = {
    "12_1": {
      title: "Physische Geographie",
      inhalte: `Geo12 LB2: Atmosphäre, Strahlungshaushalt, Drei-Zellen-Modell, Jetstream, Monsun, ozeanische Zirkulation, ENSO, Klimawandel
Geo12 LB3: Tropen (Immerfeuchte/Wechselfeuchte/Trockene Zone), Desertifikation
Geo12 LB4: Subpolare/Polare Zone, Permafrost, Kippelemente
Geo12 LB5: Ressource Wasser/Wald/Boden/Fläche, Hochwasser
Geo12 LB6: Hochgebirgsräume, Gletscherrückzug, Tourismus
Geo12 LB7: Tektonische Naturgefahren, Plattentektonik, Vulkanismus, tropische Wirbelstürme`
    },
    "12_2": {
      title: "Humangeographie I",
      inhalte: `Geo12 LB5: Ressource Wasser/Wald/Boden/Fläche, Konflikte
Geo12 LB6: Alpen als Lebens-/Wirtschafts-/Erholungsraum, Tourismus
Ergänzend: Landwirtschaft, Erneuerbare Energien, Energiewende`
    },
    "13_1": {
      title: "Entwicklungsgeographie",
      inhalte: `Geo13 LB2: Entwicklungsindikatoren (HDI, Gini, BNE), Disparitäten, Globalisierung, Entwicklungstheorien
Geo13 LB3: Bevölkerungsentwicklung, demographischer Übergang, Migration, Megacities
Geo13 LB4: Fragmentierende Entwicklung, Nachhaltigkeit, SDGs, Tropischer Regenwald, Desertifikation`
    },
    "13_2": {
      title: "Stadtgeographie",
      inhalte: `Geo13 LB5: Stadtentwicklung (europäische/US-amerikanische/orientalische Stadt), Suburbanisierung, Gentrifizierung
Geo13 LB6: Smart Cities, nachhaltige Stadtplanung, Mobilität, Stadtklima (Hitzeinsel-Effekt)
Geo13 LB3: Segregation, Migration, demographischer Wandel`
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];

  const schwerpunktZusatz = (schwerpunkt && schwerpunkt !== "random")
    ? `\n\n⚠️ THEMATISCHER SCHWERPUNKT: ${schwerpunkt.replace(/_/g, ' ')}\nDie Aufgabe muss sich schwerpunktmäßig auf dieses Thema beziehen.`
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Geographie (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 3-5 Materialien: geographische Texte (400-800 Wörter), Statistiken, Karten, Klimadiagramme, Fotos
- Verwende offizielle Operatoren: beschreiben, darstellen, erläutern, erklären, herausarbeiten, bewerten, erörtern, diskutieren, zuordnen, überprüfen, belegen, entwickeln
- Situiere die Aufgabe in einem konkreten Raumbeispiel
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Ursachen der Desertifikation (Überweidung, Abholzung, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Materialien vom Typ "karte" NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien! Content ist ein OBJEKT: {"lat": ..., "lon": ..., "zoom": ..., "label": "..."}
- Wenn thematisch passend: 1 Material vom Typ "klimadiagramm" — content ist ein OBJEKT: {"station": "...", "hoehe": ..., "temp": [12 Werte], "niederschlag": [12 Werte]}
- Erstelle Materialien vom Typ "foto" (Landschaften, Städte, Naturphänomene, geographische Besonderheiten) NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien! Content ist ein Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel erfordern
- Bezug zu einem ANDEREN geographischen Raum oder einer aktuellen Umwelt-/Nachhaltigkeitsdebatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen — weniger Vertiefung, keine eA-exklusiven Modelle oder Theorien. Halte dich strikt an den oben angegebenen Lehrplan für das gewählte Niveau.` : ""}

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur. Generiere KOMPLETT EIGENE Aufgaben mit einem EIGENEN Raumbeispiel passend zum gewählten Halbjahr! Verwende EIGENE Klimadaten, Koordinaten und Statistiken — kopiere NIEMALS die Beispielwerte!

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit ALLEN Teilaufgaben (mind. 3-4) und BE-Angaben. Jede Teilaufgabe mit konkretem Operator und Materialbezug (z.B. 'Beschreiben Sie anhand von M1 ...', 'Erläutern Sie mithilfe von M2 und M3 ...', 'Beurteilen Sie ...'). AFB I → II → III.",
    "materials": [
      {"title": "EIGENER Titel zum Raumbeispiel", "type": "text", "content": "EIGENEN geographischen Quelltext generieren (400-800 Wörter). Vollständiger, ausführlicher Fachtext mit konkreten Fakten, Daten und Zusammenhängen zum gewählten Raumbeispiel.", "source": "Autor, Quelle, Jahr"},
      {"title": "Statistik: EIGENER Titel", "type": "statistik", "content": "EIGENE vollständige Markdown-Tabelle mit mind. 6-10 Datenzeilen und plausiblen Zahlenwerten generieren", "source": "Institut, Jahr"},
      {"title": "Karte: EIGENE Region", "type": "karte", "content": {"lat": "EIGENE Koordinate passend zum Raumbeispiel", "lon": "EIGENE Koordinate", "zoom": "passender Zoomfaktor (3-12)", "label": "EIGENE Beschriftung"}, "source": "OpenStreetMap"},
      {"title": "Klimadiagramm: EIGENER Ort", "type": "klimadiagramm", "content": {"station": "EIGENER Stationsname passend zum Raumbeispiel", "hoehe": "EIGENE Höhenangabe in m", "temp": "12 EIGENE monatliche Temperaturwerte in °C (Jan-Dez), passend zur Klimazone", "niederschlag": "12 EIGENE monatliche Niederschlagswerte in mm (Jan-Dez), passend zur Klimazone"}, "source": "Klimadatenbank"},
      {"title": "Foto: EIGENER Titel", "type": "foto", "content": "Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen!", "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (räumlicher Vergleich/Transfer) mit mind. 1-2 Teilaufgaben und BE-Angaben. Bezug zu einem ANDEREN geographischen Raum.",
    "materials": []
  },
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}
KRITISCH: Bei "karte" und "klimadiagramm" MUSS content ein JSON-OBJEKT sein (KEIN String)! Klimadaten müssen als echte Zahlenarrays (12 Werte) angegeben werden, passend zur gewählten Klimazone. Koordinaten müssen zum Raumbeispiel passen.`;

  const userPrompt = `Erstelle eine vollständige Geographie-Abiturprüfung (Teil A + Teil B):
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

Erstelle 3-5 Materialien: 1 Text (400-800 Wörter), 1 Statistik, 1 Karte (mit Koordinaten-Objekt), und wenn passend 1 Klimadiagramm (mit Klimadaten-Objekt) oder 1 Foto.
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein. Bei "karte" und "klimadiagramm" ist content ein JSON-OBJEKT, KEIN String!
Teil B soll einen räumlichen Vergleich oder Transfer zu einem anderen Raumbeispiel darstellen.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen dem grundlegenden Anforderungsniveau entsprechen.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= GEOGRAPHIE ABITUR: GRADE ================= */
export async function handleGradeAbiturGeographie(request, env) {
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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => {
      const c = m.content ?? m.text ?? "";
      const cStr = typeof c === "string" ? c : JSON.stringify(c);
      return `Material ${i + 1}: ${truncate(m.title || m.titel || "", 200)}\n${truncate(cStr, 3000)}`;
    }).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = KORREKTUR_AB;

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
      korrektur_text_a: parsed.korrektur_text_a || parsed.korrektur_text || "",
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

/* ================= GEOGRAPHIE ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturGeographie(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Geographie (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen
- Fußnoten und Quellenverweise sind erlaubt
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende geographische Fachbegriffe korrekt (z.B. Klimadiagramm, Vegetationszone, Permafrost, HDI, Disparitäten, Fragmentierung, Nachhaltigkeit)
- Beziehe Karten, Statistiken und Texte ein und zitiere daraus
- Zeige multiperspektivisches Denken
- Formuliere eigenständige, raumbezogene Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => {
      const c = m.content ?? m.text ?? "";
      const cStr = typeof c === "string" ? c : JSON.stringify(c);
      return `Material ${i + 1}: ${truncate(m.title || m.titel || "", 200)}\n${truncate(cStr, 3000)}`;
    }).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000);

  return jsonResponse({ model_answer: answer }, 200, env);
}
