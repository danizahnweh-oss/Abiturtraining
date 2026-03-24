import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, KORREKTUR_AB, BILDER_HINWEIS_TEXT, zeitanpassung, klausurZeitHinweis, skaliereTokens } from '../config.js';

export async function handleParseTaskPuG(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Politik und Gesellschaft (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Quellentexten, Statistiken, Zitaten
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

/* ================= POLITIK UND GESELLSCHAFT: GENERATE ================= */
export async function handleGeneratePuG(request, env) {
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
      title: "Frieden und Sicherheit als Motive deutscher Außenpolitik und das europäische Projekt",
      lernbereiche: "LB 12.1 (Frieden und Sicherheit) und LB 12.2 (Das europäische Projekt)",
      inhalte: `- Negativer und positiver Frieden, Frieden als Prozess
- Mittel bundesdeutscher Außenpolitik: Diplomatie, Bündnisse, Sanktionen
- Einflussfaktoren: historische Verantwortung, geostrategische Lage, internationale Organisationen, Grundgesetz, wirtschaftliche Interessen
- Umfassender Sicherheitsbegriff: vernetzte Sicherheit, ressortgemeinsamer Ansatz
- Bundeswehr als Parlamentsarmee, Auslandseinsätze
- Kopenhagener Kriterien, EU-Erweiterung, Aufnahmefähigkeit
- Szenarien zukünftiger EU-Entwicklung, GASP, Europäische Armee`,
      schwerpunkte: {
        aussenpolitik: "Deutsche Außenpolitik und Bundeswehreinsätze",
        sicherheit: "Umfassender Sicherheitsbegriff und vernetzte Sicherheit",
        eu_erweiterung: "EU-Erweiterung, Kopenhagener Kriterien und EU-Zukunftsszenarien",
        gasp: "Gemeinsame Außen- und Sicherheitspolitik der EU"
      }
    },
    "12_2": {
      title: "Politische Theorien, Politische Systeme und Demokratieförderung",
      lernbereiche: isEA
        ? "LB 12.3 (Politische Theorien und Utopien), LB 12.4 (Politische Systeme vergleichen) und LB 12.5 (Demokratieförderung)"
        : "LB 12.3 (Politische Systeme vergleichen) und LB 12.4 (Demokratieförderung)",
      inhalte: isEA
        ? `- Liberalismus, Konservativismus, Sozialismus (Verhältnis Individuum – Staat)
- Staatstheoretische Ansätze der Aufklärung (Locke, Montesquieu)
- Utopien und Dystopien: Definition, Merkmale, politisch-gesellschaftliche Funktionen
- Kriterien zur Bestimmung politischer Systeme: Partizipation, Gewaltenteilung, Rechtsstaat
- Herrschaftsbegriff: Legitimation, Zugang, Anspruch, Weise, Monopol, Struktur
- Parlamentarische, semipräsidentielle, präsidentielle Demokratien
- Digitalisierung und politische Willensbildung
- Demokratisierungsprozesse von innen und außen, Akteure der Demokratieförderung`
        : `- Formen politischer Teilhabe auf Bundesebene
- Kriterien zur Bestimmung politischer Systeme
- Menschenrechte als Unterscheidungsmerkmal Demokratie/Diktatur
- Digitalisierung und politische Willensbildung
- Demokratieförderung: Chancen und Grenzen`,
      schwerpunkte: {
        liberalismus: "Politische Theorien zum Verhältnis Individuum und Staat",
        politische_systeme: "Vergleich politischer Systeme (parlamentarisch, semipräsidentiell, präsidentiell)",
        demokratiefoerderung: "Demokratisierungsprozesse und Demokratieförderung",
        digitalisierung_politik: "Digitalisierung und politische Willensbildung"
      }
    },
    "13_1": {
      title: "Modernisierungsprozesse und ihre Auswirkungen auf Gesellschaft und Politik",
      lernbereiche: isEA
        ? "LB 13.1 (Soziologische Theorien) und LB 13.2 (Modernisierungsprozesse und Zusammenleben)"
        : "LB 13.1 (Modernisierungsprozesse und Zusammenleben)",
      inhalte: isEA
        ? `- Dimensionen der Modernisierung: Domestizierung, Differenzierung, Rationalisierung, Individualisierung
- Soziologische Theorien als Erklärungsansätze
- Familienformen im Wandel
- Geschlechterrollen: Hierarchien, Emanzipation, Gender Pay Gap, Sexismus
- Familienpolitische Maßnahmen, Quotenregelungen
- Digitalisierung der Arbeitswelt: Flexibilisierung, lebenslanges Lernen
- Robotik und KI: Herausforderungen, Gewerkschaften und betriebliche Mitbestimmung
- Plattformökonomie und neue Arbeitsformen`
        : `- Zeitgenössische Familienformen
- Geschlechterrollen: Gender Pay/Time Gap, Gleichstellung
- Digitalisierung der Arbeitswelt: Industrie 4.0, Chancen und Herausforderungen
- Staatliche Maßnahmen zur Gleichstellung`,
      schwerpunkte: {
        modernisierung: "Dimensionen der Modernisierung (Domestizierung, Differenzierung, Rationalisierung, Individualisierung)",
        arbeitswelt: "Digitalisierung der Arbeitswelt und Industrie 4.0",
        geschlechter: "Geschlechterrollen, Gender Pay Gap und Gleichstellungspolitik",
        gewerkschaften: "Gewerkschaften und betriebliche Mitbestimmung in der digitalen Arbeitswelt"
      }
    },
    "13_2": {
      title: "Soziale Ungleichheit, internationale Konfliktbearbeitung und Völkerrecht",
      lernbereiche: isEA
        ? "LB 13.3 (Soziale Ungleichheit), LB 13.4 (Internationale Beziehungen) und LB 13.5 (Völkerrecht)"
        : "LB 13.2 (Soziale Ungleichheit) und LB 13.3 (Internationale Beziehungen und Völkerrecht)",
      inhalte: `- Einkommens- und Vermögensverteilung, Gini-Koeffizient, Armutsquote
- Dimensionen sozialer Ungleichheit: Einkommen, Bildung, Gesundheit
- Sozialstaatsprinzip (Art. 20 GG), Modelle des Sozialstaats
- Sozialpolitische Maßnahmen: Mindestlohn, Transfers, Steuerprogression
- Staatliche, transnationale und supranationale Akteure (IGOs, NGOs, Wirtschaftsunternehmen)
- Kennzeichen des Völkerrechts: Souveränität, Gewohnheitsrecht, Kodifizierung, eingeschränkte Sanktionierbarkeit
- Humanitäres Völkerrecht, Gewaltverbot, Selbstverteidigungsrecht
- Internationaler Strafgerichtshof: Aufbau, Zuständigkeiten, Römisches Statut
- Menschenrechte: UN-Menschenrechtskonvention
- Medien als Akteure der internationalen Politik
- Private Sicherheitsfirmen, hybride Kriegsführung`,
      schwerpunkte: {
        soziale_ungleichheit: "Einkommens-/Vermögensverteilung und Dimensionen sozialer Ungleichheit",
        sozialstaat: "Sozialstaatsprinzip und sozialpolitische Maßnahmen",
        voelkerrecht: "Kennzeichen und Grenzen des Völkerrechts",
        igos_ngos: "Rolle von IGOs und NGOs in der internationalen Politik",
        istgh: "Internationaler Strafgerichtshof und Menschenrechte",
        medien: "Medien als Akteure der internationalen Politik"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Politik und Gesellschaft (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Reproduktion (Anforderungsebene I) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Reorganisation und Transfer (Ebene II) – z.B. "Ermitteln Sie aus M1 …", "Arbeiten Sie … heraus!"
- Letzte Teilaufgabe: Reflexion und Problemlösung (Ebene III) – z.B. "Beurteilen Sie …", "Diskutieren Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, nennen, ermitteln, erarbeiten, erläutern, analysieren, vergleichen, begründen, beurteilen, bewerten, diskutieren, Stellung nehmen
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (Text ODER Statistik)' : totalBE < 40 ? '1-2 Materialien (Texte, Statistiken)' : '2-3 Materialien (Texte, Statistiken, Bilder)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche Quellentexte (Zeitungsartikel, Interviews, Reden, Fachtexte). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Parlamentsgebäude, Gerichtssäle, Institutionen, EU-Gebäude) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - type "foto": Realistisches Foto. content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Parlamentsgebäude, Gerichtssaal, Wahlplakate, Demonstrationen (ohne erkennbare Gesichter), EU-Institutionen, Grenzkontrollen. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - type "bild": Schaubild/Infografik/Diagramm. content = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Zusätzlich MUSS das Material-Objekt ein Feld "bild_labels" enthalten: {"1": "Deutsche Beschriftung", "2": "Weitere Beschriftung", ...}. KEINE Karikaturen oder Personen!
HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag, Leserbrief, digitale Pinnwand)
- Das macht die Aufgabe authentischer und prüft Adressatenorientierung

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie das Sozialstaatsprinzip (Arbeitslosenversicherung, Sozialhilfe, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte und Lernbereiche. Themen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Politische Theorien/Utopien, Soziologische Theorien als eigener LB, zusätzliche eA-Lernbereiche), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (200-500 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Titel ggf. Statistik", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""},
    {"title": "Foto: ...", "type": "foto", "content": "Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen!", "source": ""}
  ],
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Politik und Gesellschaft:
- Halbjahr: ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 2-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (I → II → III).
Erstelle 2-3 passende Materialien (Texte, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein — vollständige, ausführliche Quellentexte, NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als für die Aufgaben nötig — Schüler müssen die relevanten Inhalte selbst herausarbeiten.
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= POLITIK UND GESELLSCHAFT: GRADE ================= */
export async function handleGradePuG(request, env) {
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

/* ================= POLITIK UND GESELLSCHAFT: MODEL ANSWER ================= */
export async function handleModelAnswerPuG(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Politik und Gesellschaft (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende politikwissenschaftliche Fachbegriffe korrekt
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsebenen
- Formuliere bei Reflexionsaufgaben ein eigenständiges, begründetes Urteil
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
  ], 5000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= PUG ABITUR: GENERATE (Teil A + B) ================= */
export async function handleGenerateAbiturPuG(request, env) {
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
      title: "Frieden und Sicherheit als Motive deutscher Außenpolitik und das europäische Projekt",
      lernbereiche: "LB 12.1 (Frieden und Sicherheit) und LB 12.2 (Das europäische Projekt)",
      inhalte: `- Negativer und positiver Frieden, Frieden als Prozess
- Mittel bundesdeutscher Außenpolitik: Diplomatie, Bündnisse, Sanktionen
- Einflussfaktoren: historische Verantwortung, geostrategische Lage, internationale Organisationen, Grundgesetz, wirtschaftliche Interessen
- Umfassender Sicherheitsbegriff: vernetzte Sicherheit, ressortgemeinsamer Ansatz
- Bundeswehr als Parlamentsarmee, Auslandseinsätze
- Kopenhagener Kriterien, EU-Erweiterung, Aufnahmefähigkeit
- Szenarien zukünftiger EU-Entwicklung, GASP, Europäische Armee`,
      schwerpunkte: {
        aussenpolitik: "Deutsche Außenpolitik und Bundeswehreinsätze",
        sicherheit: "Umfassender Sicherheitsbegriff und vernetzte Sicherheit",
        eu_erweiterung: "EU-Erweiterung, Kopenhagener Kriterien und EU-Zukunftsszenarien",
        gasp: "Gemeinsame Außen- und Sicherheitspolitik der EU"
      }
    },
    "12_2": {
      title: "Politische Theorien, Politische Systeme und Demokratieförderung",
      lernbereiche: isEA
        ? "LB 12.3 (Politische Theorien und Utopien), LB 12.4 (Politische Systeme vergleichen) und LB 12.5 (Demokratieförderung)"
        : "LB 12.3 (Politische Systeme vergleichen) und LB 12.4 (Demokratieförderung)",
      inhalte: isEA
        ? `- Liberalismus, Konservativismus, Sozialismus (Verhältnis Individuum – Staat)
- Staatstheoretische Ansätze der Aufklärung (Locke, Montesquieu)
- Utopien und Dystopien: Definition, Merkmale, politisch-gesellschaftliche Funktionen
- Kriterien zur Bestimmung politischer Systeme: Partizipation, Gewaltenteilung, Rechtsstaat
- Herrschaftsbegriff: Legitimation, Zugang, Anspruch, Weise, Monopol, Struktur
- Parlamentarische, semipräsidentielle, präsidentielle Demokratien
- Digitalisierung und politische Willensbildung
- Demokratisierungsprozesse von innen und außen, Akteure der Demokratieförderung`
        : `- Formen politischer Teilhabe auf Bundesebene
- Kriterien zur Bestimmung politischer Systeme
- Menschenrechte als Unterscheidungsmerkmal Demokratie/Diktatur
- Digitalisierung und politische Willensbildung
- Demokratieförderung: Chancen und Grenzen`,
      schwerpunkte: {
        liberalismus: "Politische Theorien zum Verhältnis Individuum und Staat",
        politische_systeme: "Vergleich politischer Systeme (parlamentarisch, semipräsidentiell, präsidentiell)",
        demokratiefoerderung: "Demokratisierungsprozesse und Demokratieförderung",
        digitalisierung_politik: "Digitalisierung und politische Willensbildung"
      }
    },
    "13_1": {
      title: "Modernisierungsprozesse und ihre Auswirkungen auf Gesellschaft und Politik",
      lernbereiche: isEA
        ? "LB 13.1 (Soziologische Theorien) und LB 13.2 (Modernisierungsprozesse und Zusammenleben)"
        : "LB 13.1 (Modernisierungsprozesse und Zusammenleben)",
      inhalte: isEA
        ? `- Dimensionen der Modernisierung: Domestizierung, Differenzierung, Rationalisierung, Individualisierung
- Soziologische Theorien als Erklärungsansätze
- Familienformen im Wandel
- Geschlechterrollen: Hierarchien, Emanzipation, Gender Pay Gap, Sexismus
- Familienpolitische Maßnahmen, Quotenregelungen
- Digitalisierung der Arbeitswelt: Flexibilisierung, lebenslanges Lernen
- Robotik und KI: Herausforderungen, Gewerkschaften und betriebliche Mitbestimmung
- Plattformökonomie und neue Arbeitsformen`
        : `- Zeitgenössische Familienformen
- Geschlechterrollen: Gender Pay/Time Gap, Gleichstellung
- Digitalisierung der Arbeitswelt: Industrie 4.0, Chancen und Herausforderungen
- Staatliche Maßnahmen zur Gleichstellung`,
      schwerpunkte: {
        modernisierung: "Dimensionen der Modernisierung (Domestizierung, Differenzierung, Rationalisierung, Individualisierung)",
        arbeitswelt: "Digitalisierung der Arbeitswelt und Industrie 4.0",
        geschlechter: "Geschlechterrollen, Gender Pay Gap und Gleichstellungspolitik",
        gewerkschaften: "Gewerkschaften und betriebliche Mitbestimmung in der digitalen Arbeitswelt"
      }
    },
    "13_2": {
      title: "Soziale Ungleichheit, internationale Konfliktbearbeitung und Völkerrecht",
      lernbereiche: isEA
        ? "LB 13.3 (Soziale Ungleichheit), LB 13.4 (Internationale Beziehungen) und LB 13.5 (Völkerrecht)"
        : "LB 13.2 (Soziale Ungleichheit) und LB 13.3 (Internationale Beziehungen und Völkerrecht)",
      inhalte: `- Einkommens- und Vermögensverteilung, Gini-Koeffizient, Armutsquote
- Dimensionen sozialer Ungleichheit: Einkommen, Bildung, Gesundheit
- Sozialstaatsprinzip (Art. 20 GG), Modelle des Sozialstaats
- Sozialpolitische Maßnahmen: Mindestlohn, Transfers, Steuerprogression
- Staatliche, transnationale und supranationale Akteure (IGOs, NGOs, Wirtschaftsunternehmen)
- Kennzeichen des Völkerrechts: Souveränität, Gewohnheitsrecht, Kodifizierung, eingeschränkte Sanktionierbarkeit
- Humanitäres Völkerrecht, Gewaltverbot, Selbstverteidigungsrecht
- Internationaler Strafgerichtshof: Aufbau, Zuständigkeiten, Römisches Statut
- Menschenrechte: UN-Menschenrechtskonvention
- Medien als Akteure der internationalen Politik
- Private Sicherheitsfirmen, hybride Kriegsführung`,
      schwerpunkte: {
        soziale_ungleichheit: "Einkommens-/Vermögensverteilung und Dimensionen sozialer Ungleichheit",
        sozialstaat: "Sozialstaatsprinzip und sozialpolitische Maßnahmen",
        voelkerrecht: "Kennzeichen und Grenzen des Völkerrechts",
        igos_ngos: "Rolle von IGOs und NGOs in der internationalen Politik",
        istgh: "Internationaler Strafgerichtshof und Menschenrechte",
        medien: "Medien als Akteure der internationalen Politik"
      }
    }
  };

  const hj = hjThemen[halbjahr] || hjThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? hj.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Halbjahres";

  const schwerpunktZusatz = (schwerpunkt && schwerpunkt !== "random" && hj.schwerpunkte[schwerpunkt])
    ? `\n\n⚠️ THEMATISCHER SCHWERPUNKT: ${hj.schwerpunkte[schwerpunkt]}\nDie Aufgabe muss sich schwerpunktmäßig auf dieses Thema beziehen.`
    : '';

  // Determine a different Halbjahr for Teil B transfer
  const allHJ = ["12_1", "12_2", "13_1", "13_2"];
  const otherHJ = allHJ.filter(h => h !== halbjahr);
  const transferHJ = otherHJ[Math.floor(Math.random() * otherHJ.length)];
  const transferThema = hjThemen[transferHJ]?.title || "";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Politik und Gesellschaft (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abituraufgabe bestehend aus Prüfungsteil A UND Prüfungsteil B auf ${niveauLabel}.

=== PRÜFUNGSTEIL A (${bePruefungA}) ===
STRUKTUR:
- 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Reproduktion (Ebene I) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Reorganisation und Transfer (Ebene II) – z.B. "Ermitteln Sie aus M1 …", "Arbeiten Sie … heraus!"
- Letzte Teilaufgabe: Reflexion und Problemlösung (Ebene III) – z.B. "Beurteilen Sie …", "Diskutieren Sie …"
- Gib bei jeder Teilaufgabe die BE an, Summe = ${bePruefungA}
- Verwende offizielle Operatoren: darstellen, beschreiben, nennen, ermitteln, erarbeiten, erläutern, analysieren, vergleichen, begründen, beurteilen, bewerten, diskutieren, Stellung nehmen

MATERIALIEN (nur für Teil A):
- 2-3 realistische Materialien (Texte, Statistiken, Bilder)
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Vollständige, ausführliche Quellentexte — NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte selbst herausarbeiten müssen.
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Parlamentsgebäude, Gerichtssäle, Institutionen) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - type "foto": Realistisches Foto. content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. italienische Landschaften, Architektur, Alltagsszenen, Kultur. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - type "bild": Schaubild/Infografik/Diagramm. content = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Zusätzlich MUSS das Material-Objekt ein Feld "bild_labels" enthalten: {"1": "Deutsche Beschriftung", "2": "Weitere Beschriftung", ...}. KEINE Karikaturen oder Personen!
HALBJAHR: ${halbjahr?.replace("_", "/") || "12/1"} – ${hj.title}
Lernbereiche: ${hj.lernbereiche}
Relevante Inhalte:
${hj.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen lebensweltnahen Kontext ein (z.B. Schulprojekt, Forumsbeitrag, Vortrag)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie das Sozialstaatsprinzip (Arbeitslosenversicherung, Sozialhilfe, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte und Lernbereiche. Themen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Politische Theorien/Utopien, Soziologische Theorien als eigener LB, zusätzliche eA-Lernbereiche), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

=== PRÜFUNGSTEIL B – AUSWEITUNG (${bePruefungB}) ===
- EIGENSTÄNDIGE Aufgabe, die über die Materialien hinausgeht
- Transfer zu einem ANDEREN Halbjahr/Themenbereich oder breitere politikwissenschaftliche Reflexion
- Möglicher Transferbezug: ${transferHJ.replace("_", "/")} – ${transferThema}
- 1-2 Teilaufgaben auf Ebene II-III
- Gib BE an, Summe = ${bePruefungB}
- Teil B hat KEINE eigenen Materialien
- Typische Formulierungen: "Unabhängig von den Materialien …", "Unter Rückgriff auf Ihre Kenntnisse aus … erörtern Sie …"

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_a": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE-Angaben",
  "materials": [
    {"title": "Titel", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter!)", "source": "Autor, Quelle, Datum"},
    {"title": "Titel", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| ... | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""}
  ],
  "task_instruction_b": "Vollständige Aufgabenstellung Teil B (Ausweitung) mit BE-Angaben",
  "halbjahr": "${halbjahr || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine vollständige Abituraufgabe (Teil A + B) für Politik und Gesellschaft:
- Halbjahr (für Teil A): ${halbjahr?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}
- Gesamt-BE: ${beGesamt} (Teil A: ${bePruefungA}, Teil B: ${bePruefungB})

Teil A: 2-4 Teilaufgaben mit Materialien, steigendes Anforderungsniveau.
Teil B: Eigenständige Transferaufgabe OHNE Materialien, Bezug zu einem anderen Halbjahr oder übergreifende Reflexion.

KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein! Vollständige Quellentexte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle Bilder als Material NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien!
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(14000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= PUG ABITUR: GRADE ================= */
export async function handleGradeAbiturPuG(request, env) {
  const body = await request.json();
  const { task_instruction_a, task_instruction_b, primary_text, student_text_a, student_text_b, rubric_prompt, materials, images } = body;

  if ((!student_text_a && !student_text_b) || !rubric_prompt) {
    return jsonResponse({ error: "student_text_a/b und rubric_prompt erforderlich." }, 400, env);
  }

  let contextInfo = `=== PRÜFUNGSTEIL A ===\nAufgabenstellung:\n${truncate(task_instruction_a, 5000)}\n\n`;

  if (primary_text) {
    contextInfo += `Material:\n${truncate(primary_text, 15000)}\n\n`;
  }

  if (materials && materials.length) {
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  contextInfo += `=== PRÜFUNGSTEIL B (Ausweitung) ===\nAufgabenstellung:\n${truncate(task_instruction_b, 3000)}\n\n`;

  const korrekturAnweisung = KORREKTUR_AB;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${contextInfo}\nSchülertext Teil A:\n${truncate(student_text_a, 15000)}\n\nSchülertext Teil B:\n${truncate(student_text_b, 10000)}`, images) }
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
      if (teil_a === 0 || darstellung === 0) gesamt = Math.min(gesamt, 3);
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

/* ================= PUG ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturPuG(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Politik und Gesellschaft (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (Teil A + Teil B) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

PRÜFUNGSTEIL A:
- Bearbeite ALLE Teilaufgaben
- Verwende politikwissenschaftliche Fachbegriffe korrekt
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsebenen
- Formuliere bei Reflexionsaufgaben ein eigenständiges, begründetes Urteil

PRÜFUNGSTEIL B (Ausweitung):
- Bearbeite die Transferaufgabe eigenständig
- Beziehe Fachwissen aus anderen Halbjahren ein
- Zeige politikwissenschaftliche Urteilsfähigkeit
- Teil B hat KEINE Materialien – nutze dein Fachwissen

Zielumfang: Teil A ca. 800-1200 Wörter, Teil B ca. 400-600 Wörter.

Formatiere als Markdown mit klaren Überschriften für jeden Prüfungsteil und jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = `PRÜFUNGSTEIL A – AUFGABE:\n${truncate(task_instruction_a, 5000)}`;
  if (primary_text) userContent += `\n\nMATERIAL:\n${truncate(primary_text, 15000)}`;
  if (materials && materials.length) {
    userContent += `\n\nMATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }
  userContent += `\n\nPRÜFUNGSTEIL B – AUFGABE (Ausweitung):\n${truncate(task_instruction_b, 3000)}`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

