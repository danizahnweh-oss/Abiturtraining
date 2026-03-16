import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_TEXT, UEBUNGSAUFGABEN_ANWEISUNG, KORREKTURHILFE_GEWAEHRLEISTUNG, zeitanpassung, klausurZeitHinweis, skaliereTokens } from '../config.js';

export async function handleGenerateWR(request, env) {
  const body = await request.json();
  const { niveau, fachbereich, sachgebiet, unterpunkte, thema, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const isGA = (niveau || "gA").toLowerCase() === "ga";
  const niveauLabel = isGA ? "grundlegendes Anforderungsniveau (gA)" : "erhöhtes Anforderungsniveau (eA)";
  const gesamtBE = be || (isGA ? 100 : 60);
  const zeitMinuten = zeit || (isGA ? 210 : 135);
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, gesamtBE, 2.5);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);
  const bloecke = isGA ? "2-3 Aufgabenblöcke (integriert: BWL+VWL+Recht)" : "2-3 Aufgabenblöcke";
  const materialCount = isGA ? "4-5 Materialien" : "3-4 Materialien";

  const fachbereiche = {
    bwl: {
      label: "Betriebswirtschaftslehre",
      themen: {
        unternehmensziele: "WR12 1.1: Ökonomische/ökologische/soziale/ethische Ziele, Zielwechselwirkungen, Stakeholder, Aufbau-/Ablauforganisation (nur eA: Wertschöpfung, Funktionsbereiche)",
        markt_produktion: "WR12 1.2: Beschaffungsarten (Einzel/JIT/Vorrat), Break-even-Analyse (Gewinnschwelle, fixe/variable Kosten), Marktsituation, ABC-Analyse, BCG-Portfolio (nur eA)",
        bilanzanalyse: "WR12 1.3 (nur eA): Bilanz, GuV, Lagebericht, Bilanzkennzahlen (Anlageintensität, EK-Quote, Deckungsgrade, Liquiditätsgrade), Rentabilitäten (EK-/GK-/Umsatzrentabilität), EBIT",
        investition: "WR12 1.4: Gewinnvergleichsrechnung, Amortisationsrechnung (eA: + Kapitalwertmethode), Eigen- vs. Fremdfinanzierung, Leverage-Effekt (nur eA)",
        management: "WR12 1.5 (nur eA): SWOT-Analyse, Wettbewerbsstrategien nach Porter, Kernkompetenzen, Managementfunktionen (Planung, Entscheidung, Aufgabenübertragung, Kontrolle)"
      }
    },
    vwl: {
      label: "Volkswirtschaftslehre",
      themen: {
        konjunktur: "WR12 2.1: Magisches Viereck (Wachstum, Beschäftigung, Preisniveaustabilität, außenwirtschaftliches GGW), Konjunkturzyklus, Konjunkturindikatoren, Zielbeziehungen",
        wirtschaftspolitik: "WR12 2.2: BIP (Verwendungs-/Entstehungsrechnung), Arbeitslosigkeit (friktionell/saisonal/konjunkturell/strukturell), Nachfrage-/Angebotstheorie, expansive/kontraktive Effekte, Staatsverschuldung, Umweltschutz/Klimaschutz",
        soziale_sicherung: "WR12 2.3: Tarifpartner, Sozialversicherung (Kranken-/Rentenversicherung), Umlage-/Kapitaldeckungsverfahren, demographischer Wandel, Moral Hazard (nur eA), soziale Gerechtigkeit (Leistungs-/Chancen-/Bedarfs-/Generationengerechtigkeit, nur eA), Beveridge-Modell, BGE (nur eA)",
        geldpolitik: "WR13 2.1: Preisniveaustabilität, EZB (Mandat, Unabhängigkeit), geldpolitische Instrumente (Zins-/Geldmengensteuerung), Transmissionsmechanismus, Wirkungsgrenzen, Kryptowährungen",
        aussenhandel: "WR13 2.2: Leistungsbilanz, Kapitalbilanz (nur eA), Wechselkursbildung (Marktmodell), Ursachen/Folgen von Wechselkursschwankungen (eA: + Spieltheorie, Gefangenendilemma, Nash-GGW, Pareto-Optimum)"
      }
    },
    recht: {
      label: "Recht",
      themen: {
        rechtsgrundlagen: "WR12 3.1: Systematik des BGB, Kaufhandlung, Trennungsprinzip, juristische Arbeitstechniken (Zitierweise, Normenanalyse, Subsumtionstechnik, Gutachtenstil)",
        gesetzl_schuld: "WR12 3.2: Herausgabeanspruch des Eigentümers, gutgläubiger Eigentumserwerb, § 823 I BGB (Schadensersatz), Gefährdungshaftung (nur eA: § 833 BGB, § 7 StVG)",
        vertragstypen: "WR13 1.1 (nur eA): Werk-/Werklieferungs-/Dienstvertrag, Leistungsstörungen (Pflichtverletzung, Fristsetzung, Rücktritt, Schadensersatz)",
        kaufrecht: "WR13 1.2: Mangelfreiheit (subjektive/objektive Anforderungen), Gewährleistung beim Verbrauchsgüterkauf (Nacherfüllung, Rücktritt, Minderung, Schadensersatz), Verbraucherschutz (Beweislastumkehr, Widerrufsrecht bei Fernabsatz), AGB, Vertragsfreiheit",
        strafrecht: "WR13 1.3: Ordnungswidrigkeit vs. Straftat, Aufbau einer Straftat (Tatbestandsmäßigkeit, Rechtswidrigkeit, Schuld), Strafzwecktheorien, Strafzumessung (eA: + Rechtfertigungsgründe Notwehr/Notstand, Entschuldigungsgründe, Radbruchsche Formel)"
      }
    }
  };

  let fbLabel, fbThemen;
  const fbKey = sachgebiet || fachbereich || "bwl";
  if (isGA) {
    fbLabel = "Integriert (BWL + VWL + Recht)";
    fbThemen = "Integrierte Aufgabe über alle drei Fachbereiche";
  } else {
    const fb = fachbereiche[fbKey] || fachbereiche.bwl;
    fbLabel = fb.label;
    fbThemen = Object.values(fb.themen).join(", ");
  }

  const themaLabel = (thema && thema !== "random")
    ? truncate(thema, 200)
    : "frei wählbar (abiturrelevant)";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur 2026 im Fach Wirtschaft und Recht (G9).
Erstelle eine authentische Abituraufgabe.

PRÜFUNGSFORMAT:
- ${niveauLabel}
- Gesamt: ${gesamtBE} BE (Bewertungseinheiten), Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- ${bloecke}
- ${materialCount}
- Fachbereich: ${fbLabel}${schwerpunktZusatz}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgabenblöcke (je ca. ${Math.round(gesamtBE / aufgabenAnzahl)} BE)
- Jeder Block kompakt und kleinschrittiger` : ''}

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen, zusammenfassen (ca. 20% der BE)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40% der BE)
- AFB III (Reflexion/Problemlösung): beurteilen, erörtern, Stellung nehmen, entwickeln (ca. 40% der BE)
- Jede Teilaufgabe hat eine konkrete BE-Angabe
- Operatoren müssen korrekt und eindeutig verwendet werden
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Marktformen (Monopol, Oligopol, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lehrplan-Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus. Beachte insbesondere die eA/gA-Differenzierung.
${isGA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" (z.B. Bilanzanalyse, BCG-Portfolio, Leverage-Effekt, Management/SWOT/Porter, Kapitalwertmethode, Vertragstypen/Leistungsstörungen, Moral Hazard, Spieltheorie, Gefährdungshaftung §833/§7 StVG) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

MATERIALIEN:
- Materialien (M1, M2, …) sind der Kern der Aufgabe
- AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
- Typen: Zeitungsartikel, Tabellen/Statistiken, Bilanzen, Gesetzestexte, Schaubilder, Fallbeispiele
- Textmaterialien: MINDESTENS 300-600 Wörter pro Material! Vollständige, ausführliche Texte — NICHT Zusammenfassungen oder Stichpunkte! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte selbst herausarbeiten müssen.
- Tabellen/Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Gesetzestexte: Korrekte §-Angaben mit vereinfachtem Wortlaut (150-300 Wörter)
- Jedes Material hat einen Titel und eine Quellenangabe
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Produkte, Märkte, Wirtschaftsszenarien, Unternehmen) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - typ "foto": Realistisches Foto. inhalt = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Unternehmen, Fabriken, Märkte, Produkte, Büros, Gerichtssaal. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - typ "bild": Schaubild/Diagramm. inhalt = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}.
${isGA ? "\n- Bei gA: Die Aufgabe muss alle drei Fachbereiche (BWL, VWL, Recht) integrieren" : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Einleitender Situationstext / Rahmenhandlung",
  "aufgabenbloecke": [
    {
      "nr": 1,
      "titel": "Titel des Aufgabenblocks",
      "teilaufgaben": [
        {"nr": "1.1", "text": "Aufgabentext mit Operator und Materialbezug", "be": 5, "afb": "I"},
        {"nr": "1.2", "text": "Aufgabentext", "be": 10, "afb": "II"}
      ],
      "be_gesamt": 15
    }
  ],
  "materialien": [
    {"nr": "M1", "titel": "Titel des Materials", "typ": "text", "inhalt": "Ausführlicher Materialtext (300-600 Wörter!)", "quelle": "Quellenangabe"},
    {"nr": "M2", "titel": "Statistik: ...", "typ": "statistik", "inhalt": "| Spalte1 | Spalte2 |\\n|---|---|\\n| ... | ... |", "quelle": "Institut, Jahr"},
    {"nr": "M3", "titel": "Schaubild: ...", "typ": "bild", "inhalt": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "quelle": ""},
    {"nr": "M4", "titel": "Foto: ...", "typ": "foto", "inhalt": "Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen!", "quelle": ""}
  ],
  "gesamt_be": ${gesamtBE},
  "fachbereich": "${isGA ? "integriert" : (fachbereich || "bwl")}",
  "thema": "Konkretes Thema"
}`;

  const userPrompt = `Erstelle eine Wirtschaft-und-Recht-Abituraufgabe:
- Niveau: ${niveauLabel}
- Fachbereich: ${fbLabel}
- Thema: ${themaLabel}
- Gesamt-BE: ${gesamtBE}

Die Aufgabe soll ${bloecke} mit insgesamt ${gesamtBE} BE umfassen.
Erstelle ${materialCount} (Texte, Tabellen, ggf. Gesetzestexte) plus 1 Bild.
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle Bilder als Material NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien!
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
${isGA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe! Verwende NUR Stoff aus dem gA-Lehrplan. Themen mit "nur eA" dürfen NICHT vorkommen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= WIRTSCHAFT UND RECHT: GRADE ================= */
export async function handleGradeWR(request, env) {
  const body = await request.json();
  const { aufgabenbloecke, materialien, student_text, niveau, gesamt_be, task_instruction, images } = body;

  if (!student_text) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || (niveau === "gA" ? 100 : 60);

  let aufgabenInfo = "";
  if (task_instruction) aufgabenInfo += `Situationstext:\n${truncate(task_instruction, 3000)}\n\n`;
  if (aufgabenbloecke && aufgabenbloecke.length) {
    aufgabenInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      aufgabenInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          aufgabenInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien && materialien.length) {
    aufgabenInfo += "\nMaterialien:\n";
    for (const m of materialien.slice(0, 6)) {
      aufgabenInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n(${m.quelle || ""})\n\n`;
    }
  }

  const rubricPrompt = `Du bewertest eine Wirtschaft-und-Recht-Abiturarbeit nach dem bayerischen BE-System (Bewertungseinheiten).

WICHTIG – GANZE SÄTZE: Antworten sollen in vollständigen Sätzen formuliert sein, nicht in Stichpunkten oder reinen Aufzählungen. Fußnoten und Quellenverweise sind erlaubt. Es muss kein perfekt strukturierter Aufsatz sein — entscheidend ist die Formulierung in ganzen Sätzen.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Berücksichtige: Materialbezug, Operatoren-Anforderung (AFB I/II/III), fachliche Korrektheit, Struktur
- AFB I: Korrekte Wiedergabe von Fakten/Definitionen
- AFB II: Sachgerechte Analyse, korrekte Berechnungen, logische Transferleistung
- AFB III: Eigenständiges, begründetes Urteil mit Abwägung
- Max BE gesamt: ${maxBE}

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "bewertung_bloecke": [
    {"block_nr": 1, "teilaufgaben": [{"nr": "1.1", "be_erreicht": 4, "be_max": 5, "kommentar": "..."}], "be_erreicht": 12, "be_max": 15}
  ],
  "be_erreicht": <Zahl>,
  "be_max": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit Stärken, Schwächen, Verbesserungsvorschlägen>",
  "korrektur_text": "<Der VOLLSTÄNDIGE Schülertext. Markiere Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark> und Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>. Nicht-fehlerhafte Stellen bleiben unverändert.>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe 1.1", "aspekte": ["fehlender Punkt 1", "fehlender Punkt 2"]}]
}`;

  // Korrekturhilfe Gewährleistungsrecht bei Rechtsaufgaben einfügen
  const aufgabenText = (aufgabenInfo + (task_instruction || '')).toLowerCase();
  const istRechtsaufgabe = aufgabenText.includes('recht') || aufgabenText.includes('mangel') || aufgabenText.includes('gewährleist') || aufgabenText.includes('nacherfüllung') || aufgabenText.includes('verbrauchsgüterkauf') || aufgabenText.includes('bgb') || aufgabenText.includes('schadensersatz') || aufgabenText.includes('rücktritt') || aufgabenText.includes('kaufvertrag');
  const rechtsKorrektur = istRechtsaufgabe ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis + rechtsKorrektur + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.be_erreicht ?? null;
    const beMax = parsed.be_max ?? maxBE;
    let np = parsed.notenpunkte ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      bewertung_bloecke: parsed.bewertung_bloecke || [],
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      bewertung_bloecke: [],
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= WIRTSCHAFT UND RECHT: MODEL ANSWER ================= */
export async function handleModelAnswerWR(request, env) {
  const { task_instruction, aufgabenbloecke, materialien } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Wirtschaft und Recht.
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben strukturiert
- Verwende Fachbegriffe korrekt (BWL, VWL, Recht)
- Beziehe die Materialien ein und verweise darauf
- Beachte die Operatoren und AFB-Stufen
- Bei Berechnungen: Rechenweg aufzeigen
- Bei Rechtsfragen: Obersatz, Definition, Subsumtion, Ergebnis
- Zielumfang: 800-1500 Wörter

Formatiere als Markdown mit klaren Überschriften für jeden Aufgabenblock.`;

  let userContent = "";
  if (task_instruction) userContent += `SITUATION:\n${truncate(task_instruction, 3000)}\n\n`;
  if (aufgabenbloecke && aufgabenbloecke.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien && materialien.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  // Bei Rechtsaufgaben Gewährleistungs-Systematik als Referenz einfügen
  const maText = (userContent + (task_instruction || '')).toLowerCase();
  const maIstRecht = maText.includes('recht') || maText.includes('mangel') || maText.includes('gewährleist') || maText.includes('nacherfüllung') || maText.includes('verbrauchsgüterkauf') || maText.includes('bgb') || maText.includes('schadensersatz') || maText.includes('rücktritt') || maText.includes('kaufvertrag');
  const maRechtsRef = maIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt + maRechtsRef },
    { role: "user", content: userContent }
  ], 6000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= BWR ABITUR 13: GRADE (BWR-spezifisch) ================= */
export async function handleGradeAbitur13BWR(request, env) {
  const body = await request.json();
  const { aufgabenbloecke, gesamt_be, images } = body;
  let student_text = body.student_text || "";

  if (!student_text && (!images || !images.length)) {
    return jsonResponse({ error: "student_text oder Bilder erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 100;

  let aufgabenInfo = "";
  if (aufgabenbloecke && aufgabenbloecke.length) {
    aufgabenInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      aufgabenInfo += `\nAufgabe ${block.id || block.nr}: ${block.titel} (${block.gesamt_be || block.be_gesamt} BE)\n`;
      if (block.kontext) aufgabenInfo += `Kontext: ${truncate(block.kontext, 3000)}\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 20)) {
          aufgabenInfo += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 600)}\n`;
        }
      }
    }
  }

  const rubricPrompt = `Du bewertest eine BwR-Abiturarbeit (Betriebswirtschaftslehre mit Rechnungswesen) der FOS/BOS 13. Klasse Bayern nach dem offiziellen BE-System.

WICHTIG – BWR IST EIN RECHENFACH:
- BwR-Lösungen bestehen ÜBERWIEGEND aus Berechnungen, Tabellen, Formeln und kurzen Begründungen.
- Stichpunkte, Tabellen und Aufzählungen sind in BWR VÖLLIG NORMAL und korrekt – KEIN Punktabzug dafür!
- Fließtext ist nur bei Erläuterungen, Diskussionen und Beurteilungen nötig (z.B. Leverage-Effekt-Diskussion, BSC-Ursache-Wirkungsketten, Personalmanagement).
- Bei Berechnungsaufgaben: Prüfe Ansatz → Formel → Rechenweg → Ergebnis. Teilpunkte für korrekte Ansätze!

FACHSPEZIFISCHE BEWERTUNGSKRITERIEN:

1. BILANZANALYSE:
   - Ergebnisverwendungsrechnung: § 150 AktG-Prüfung, Aktienanzahl, Kapitalerhöhung (alte/junge Aktien, zeitanteilige Dividende), Einstellungen in Rücklagen, Bilanzgewinn, Dividende, Gewinnvortrag
   - Strukturbilanz: Korrekte Zuordnung AV (Grundstücke+Gebäude+Maschinen+BGA+Finanzanlagen) / UV, EK / langfristiges FK (Pensionsrückstellungen+langfr. Verbindlichkeiten) / kurzfristiges FK (sonst. Rückstellungen+erhaltene Anzahlungen+Verb. aLL+Dividende)
   - Kennzahlen: Formel nennen → korrekt berechnen (2 Dezimalstellen!) → beurteilen (Normwert, Branchenvergleich)
   - EK-Quote: EK/GK, Normwert ≥ 30-50%
   - Dynamischer Verschuldungsgrad: Nettoverbindlichkeiten/Cashflow in Jahren, Normwert 5-11 Jahre
   - EK-Rentabilität: JÜ/EK (Stichtags-EK oder Anfangs-EK), GK-Rentabilität: (JÜ+Zinsaufwand)/GK
   - Leverage-Effekt: GKR > FK-Zinssatz → positiver Leverage
   - Cashflow: JÜ + Abschreibungen + Erhöhung langfr. Rückstellungen

2. INVESTITIONSRECHNUNG:
   - Kapitalwertmethode: Tabelle mit Jahr, Einzahlungen, Auszahlungen, Überschuss, AZF (Abzinsungsfaktor), Barwert → Kapitalwert = Summe Barwerte
   - Amortisationsdauer: AK / (Gewinn + kalk. Abschreibung), bei Preisindex: WBW = AK * Preisindex/100
   - Kostenvergleichsrechnung: Fixe Kosten + variable Kosten vergleichen, kritische Menge
   - Lohmann-Ruchti-Effekt: Tabelle mit Zugang, Bestand, Abschreibung, Abgang, freie Mittel; KEF = 2n/(n+1)

3. KOSTENANPASSUNG:
   - Selektive Anpassung: Reihenfolge nach Stückdeckungsbeitrag (höchster db zuerst)
   - Gewinnfunktionen: Abschnittsweise definiert mit Mengenintervallen
   - Gewinnschwellenmenge (GSM): KF / db (des ersten Intervalls)
   - Intensitätsmäßige Anpassung: Verbrauchsfunktion V(y), V'(y)=0 → optimale Intensität
   - Zeitliche Anpassung: Überstundenzuschlag berechnen

4. HGB-BEWERTUNG:
   - Anschaffungskosten ermitteln: Listenpreis - Rabatt = ZEP - Skonto = BEP + Bezugskosten = AK
   - NICHT zu AK: Finanzierungskosten, Wartung/Kundendienst nach Inbetriebnahme
   - Lineare AfA: AK/ND, monatsgenau im Anschaffungsjahr
   - Bilanzansatz: Regelwert vs. beizulegender Wert
   - Anlagevermögen: Gemildertes Niederstwertprinzip (bei dauerhafter Wertminderung → Pflicht)
   - Umlaufvermögen (Vorräte): Strenges Niederstwertprinzip (immer niedrigerer Wert)
   - Durchschnittswertverfahren bei Vorräten

5. PLANKOSTENRECHNUNG:
   - Plankosten (PK) = KF + kv × xPlan
   - Sollkosten (SK) = KF + kv × xIst
   - Verrechnete Plankosten (verr. PK) = (PK/xPlan) × xIst = pkvs × xIst
   - Beschäftigungsabweichung (BA) = verr. PK - SK (positiv = Überbeschäftigung, negativ = Unterbeschäftigung)
   - Verbrauchsabweichung (VA) = SK - IK (positiv = Minderverbrauch, negativ = Mehrverbrauch)
   - Gesamtabweichung (GA) = BA + VA = verr. PK - IK
   - Fixkosten aus BA ableiten: KF = BA / Δx × xPlan (wenn BA und Minderbeschäftigung gegeben)

6. BALANCED SCORECARD & PERSONAL:
   - BSC: 4 Perspektiven (Finanzen, Kunden, Interne Prozesse, Mitarbeiter/Lernen)
   - Strategisches Ziel + Kennzahl mit Zielwert + operative Maßnahmen
   - Ursache-Wirkungsketten: Mitarbeiter → Prozesse → Kunden → Finanzen
   - Stärken-Schwächen-Profil / SWOT-Analyse einbeziehen
   - Blake & Mouton: 9×9 Gitter (Aufgaben- vs. Mitarbeiterorientierung)
   - Locke & Latham: SMART-Ziele, gemeinsame Vereinbarung, Feedback
   - Herzberg: Hygienefaktoren (Lohn, Arbeitsumfeld) vs. Motivatoren (Anerkennung, Verantwortung)
   - PE: into-the-job, on-the-job, near-the-job, off-the-job, along-the-job, out-of-the-job
   - Diskussionen: Pro/Kontra/Fazit-Struktur

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Teilpunkte vergeben: Korrekter Ansatz ohne Ergebnis → ca. 50% der BE
- Folgefehler: Wenn ein Zwischenergebnis falsch ist, aber der weitere Rechenweg korrekt → Punkte für den Rechenweg
- Rundung: Auf 2 Dezimalstellen. Falsche Rundung → max. 0,5 BE Abzug
- Max BE gesamt: ${maxBE}

OFFIZIELLE NOTENPUNKTE-TABELLE (BE → NP):
| NP | BE von | BE bis |
| 15 | 96     | 100    |
| 14 | 91     | 95     |
| 13 | 86     | 90     |
| 12 | 81     | 85     |
| 11 | 76     | 80     |
| 10 | 71     | 75     |
| 9  | 66     | 70     |
| 8  | 61     | 65     |
| 7  | 56     | 60     |
| 6  | 51     | 55     |
| 5  | 46     | 50     |
| 4  | 41     | 45     |
| 3  | 34     | 40     |
| 2  | 27     | 33     |
| 1  | 20     | 26     |
| 0  | 0      | 19     |
Ergibt die Gesamtsumme n,5 BE → einmalig zugunsten des Prüflings aufrunden.

Antworte NUR mit validem JSON:
{
  "bewertung_bloecke": [
    {"block_nr": 1, "block_titel": "Aufgabe I", "teilaufgaben": [{"nr": "1.1", "be_erreicht": 5, "be_max": 7, "kommentar": "Ergebnisverwendungsrechnung korrekt, Strukturbilanz: AV richtig, UV fehlt geleistete Anzahlungen..."}], "be_erreicht": 38, "be_max": 55},
    {"block_nr": 2, "block_titel": "Aufgabe II", "teilaufgaben": [...], "be_erreicht": 30, "be_max": 45}
  ],
  "be_erreicht": <Zahl>,
  "be_max": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback: Welche Berechnungen korrekt, welche Fehler, welche Ansätze fehlten, Verbesserungsvorschläge>",
  "korrektur_text": "<Der Schülertext mit Markierungen: Rechenfehler mit <mark class='fehler-rs' title='Richtig: 32,58 %'>32,85 %</mark>, fehlende Schritte kennzeichnen>",
  "fehlende_aspekte": [{"aufgabe": "1.1", "aspekte": ["§ 150 AktG-Prüfung fehlt", "Junge Aktien zeitanteilig nicht berücksichtigt"]}]
}`;

  const bilderHinweis = (images && images.length)
    ? `\n\nBILDER: Die Schülerlösung liegt als Foto(s) der handschriftlichen Arbeit bei. Bewerte die Lösung DIREKT aus den Bildern. Achte besonders auf Rechenwege, Tabellen, Strukturbilanzen, Kennzahlen und Buchungssätze in der Handschrift. Bei Widersprüchen zwischen Text und Bild vertraue dem Bild.`
    : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.be_erreicht ?? null;
    const beMax = parsed.be_max ?? maxBE;
    let np = parsed.notenpunkte ?? null;

    // Offizielle NP-Tabelle anwenden
    if (np == null && beErreicht != null) {
      const BE_NP = [[96,15],[91,14],[86,13],[81,12],[76,11],[71,10],[66,9],[61,8],[56,7],[51,6],[46,5],[41,4],[34,3],[27,2],[20,1],[0,0]];
      // Aufrundung bei n,5
      const be = beErreicht % 1 === 0.5 ? Math.ceil(beErreicht) : Math.round(beErreicht);
      np = 0;
      for (const [schwelle, punkte] of BE_NP) {
        if (be >= schwelle) { np = punkte; break; }
      }
    }

    return jsonResponse({
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      bewertung_bloecke: parsed.bewertung_bloecke || [],
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      bewertung_bloecke: [],
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= BWR ABITUR 13: MODEL ANSWER (BWR-spezifisch) ================= */
export async function handleModelAnswerAbitur13BWR(request, env) {
  const { aufgabenbloecke } = await request.json();

  const systemPrompt = `Du bist ein BwR-Experte und erstellst eine vorbildliche Musterlösung für eine BwR-Abiturprüfung (FOS/BOS 13. Klasse Bayern).
Die Musterlösung orientiert sich am Stil der offiziellen ISB-Lösungshinweise.

FORMAT DER MUSTERLÖSUNG:

1. BERECHNUNGEN (Hauptteil der Lösung):
   - Klare Darstellung: Ansatz → Formel → Einsetzen → Ergebnis
   - Alle Zwischenschritte zeigen
   - Auf 2 Dezimalstellen runden (Kennzahlen, Geldbeträge, Prozentsätze)
   - Markdown-Tabellen für tabellarische Daten verwenden

2. TABELLARISCHE DARSTELLUNGEN (wo passend):
   - Ergebnisverwendungsrechnung als Tabelle (JÜ + Gewinnvortrag - Einstellungen = Bilanzgewinn - Dividende = GV)
   - Strukturbilanz als Tabelle (AV/UV links, EK/langfr.FK/kurzfr.FK rechts)
   - Kapitalwert-Tabelle (Jahr | Einzahlungen | Auszahlungen | Überschuss | AZF | Barwert)
   - Lohmann-Ruchti-Tabelle (Jahr | Zugang | Bestand | Abschreibung | Abgang | freie Mittel)
   - Plankostenrechnung: Alle Werte übersichtlich auflisten

3. KENNZAHLEN-SCHEMA:
   - Beschreibung der Kennzahl (1 Satz)
   - Formel
   - Berechnung mit eingesetzten Werten
   - Ergebnis mit Einheit (%, Jahre, €)
   - Beurteilung mit Bezug auf Normwert

4. BEGRÜNDUNGEN & DISKUSSIONEN:
   - Pro-/Kontra-Struktur bei Diskussionsaufgaben
   - Fazit/Empfehlung am Ende
   - Bezug auf berechnete Kennzahlen und gegebene Daten
   - Kurz und präzise – kein Fließtext-Aufsatz!

5. HGB-BEWERTUNG:
   - AK-Ermittlung als Staffelrechnung (LP - Rabatt = ZEP - Skonto = BEP + Bezugskosten = AK)
   - AfA-Berechnung (Jahres-AfA, ggf. monatsgenau)
   - Regelwert vs. beizulegender Wert
   - Anwendbares Prinzip nennen (strenges/gemildertes NWP)
   - Bilanzansatz mit Begründung

6. PLANKOSTENRECHNUNG:
   - Alle Größen berechnen: PK, SK, verr. PK, BA, VA, GA
   - Art der Abweichung angeben (Mehr-/Minderverbrauch, Über-/Unterbeschäftigung)

7. BSC & PERSONAL:
   - BSC: Strategisches Ziel → Kennzahl mit Zielwert → Operative Maßnahmen (als Tabelle)
   - Ursache-Wirkungsketten: Mitarbeiter → Prozesse → Kunden → Finanzen
   - Blake & Mouton: Koordinaten bestimmen und begründen
   - Diskussionen: Strukturiert mit Pro/Kontra/Fazit

Formatiere die gesamte Lösung als Markdown mit klaren Überschriften (## Aufgabe I, ### 1.1, etc.)
Verwende Markdown-Tabellen für alle tabellarischen Daten.`;

  let userContent = "AUFGABEN:\n";
  if (aufgabenbloecke && aufgabenbloecke.length) {
    for (const block of aufgabenbloecke.slice(0, 5)) {
      userContent += `\n## Aufgabe ${block.id || block.nr}: ${block.titel} (${block.gesamt_be || block.be_gesamt} BE)\n`;
      if (block.kontext) userContent += `${truncate(block.kontext, 4000)}\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 20)) {
          userContent += `**${ta.nr}** (${ta.be} BE): ${truncate(ta.text, 600)}\n`;
        }
      }
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= BWR FACHABITUR 12: GRADE (BWR-spezifisch) ================= */
export async function handleGradeAbiturBWR(request, env) {
  const body = await request.json();
  const { aufgabenbloecke, gesamt_be, images } = body;
  let student_text = body.student_text || "";

  if (!student_text && (!images || !images.length)) {
    return jsonResponse({ error: "student_text oder Bilder erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 85;

  let aufgabenInfo = "";
  if (aufgabenbloecke && aufgabenbloecke.length) {
    aufgabenInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke.slice(0, 5)) {
      aufgabenInfo += `\nAufgabe ${block.id || block.nr}: ${block.titel} (${block.gesamt_be || block.be_gesamt} BE)\n`;
      if (block.kontext) aufgabenInfo += `Kontext: ${truncate(block.kontext, 3000)}\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 20)) {
          aufgabenInfo += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 600)}\n`;
        }
      }
    }
  }

  const rubricPrompt = `Du bewertest eine BwR-Fachabiturarbeit (Betriebswirtschaftslehre mit Rechnungswesen) der FOS 12. Klasse Bayern nach dem offiziellen BE-System.

WICHTIG – BWR IST EIN RECHENFACH:
- BwR-Lösungen bestehen ÜBERWIEGEND aus Berechnungen, Tabellen, Formeln und kurzen Begründungen.
- Stichpunkte, Tabellen und Aufzählungen sind in BWR VÖLLIG NORMAL und korrekt – KEIN Punktabzug dafür!
- Fließtext ist nur bei Erläuterungen und Begründungen nötig (z.B. Marketing-Entscheidungen, Investitionsempfehlungen).
- Bei Berechnungsaufgaben: Prüfe Ansatz → Formel → Rechenweg → Ergebnis. Teilpunkte für korrekte Ansätze!

FACHSPEZIFISCHE BEWERTUNGSKRITERIEN (FOS 12 – NUR THEMEN AUS BWR 11 + 12!):

1. JAHRESABSCHLUSS & HGB-BEWERTUNG (BwR 12 LB3):
   - Anschaffungskosten ermitteln: Listenpreis - Rabatt = ZEP - Skonto = BEP + Bezugskosten = AK
   - NICHT zu AK: Finanzierungskosten, Wartung/Kundendienst nach Inbetriebnahme
   - Herstellungskosten: Materialeinzelkosten + Fertigungseinzelkosten + angemessene Gemeinkosten
   - Bewertung nicht abnutzbares SAV: AK vs. beizulegender Wert → außerplanmäßige Abschreibung + Wertaufholung
   - Bewertung abnutzbares AV: Lineare AfA, ggf. monatsgenau. Außerplanmäßige Abschreibung (KEINE Wertaufholung!)
   - Bewertung Finanzanlagen: Wertpapiere des AV → gemildertes Niederstwertprinzip
   - Bewertung Forderungen: Einzelwertberichtigung (EWB), Pauschalwertberichtigung (PWB) – Buchungssätze prüfen!
   - Bewertung Vorräte (Rohstoffe/Fremdbauteile): Durchschnittswertverfahren + strenges Niederstwertprinzip
   - Rückstellungen für Altersversorgung
   - GuV nach Gesamtkostenverfahren (§ 275 (2) HGB, Staffelform)
   - Ergebnisverwendungsrechnung AG: § 150 AktG, Gezeichnetes Kapital, Kapitalrücklage, Gesetzliche Rücklage, Gewinnvortrag, Bilanzgewinn, Dividende
   - Vorbereitende Abschlussbuchungen und Abschlussbuchungen

2. KOSTENRECHNUNG (BwR 11 LB5 + BwR 12 LB1):
   Vollkostenrechnung (BwR 11 LB5):
   - Zuschlagskalkulation: Vorwärts-, Rückwärts-, Differenzkalkulation
   - Maschinenstundensatz: kalk. Abschreibung (WBW), kalk. Zinsen, Raumkosten, Energiekosten, Instandhaltung
   - BAB: Ein-/mehrstufig, max. 5 Hauptkostenstellen, einfache Kostenumlage
   - Kostenträgerzeitrechnung: 2 Kostenträger, Normalkostenbereich
   - Bestandsveränderungen an unfertigen/fertigen Erzeugnissen
   Teilkostenrechnung (BwR 12 LB1):
   - Stück- und Gesamtdeckungsbeitrag
   - Break-even-Analyse: Rechnerisch und grafisch, Einproduktunternehmen
   - Mehrstufige Deckungsbeitragsrechnung
   - Engpassrechnung: Beschaffung, Produktion, Absatz (relativer Deckungsbeitrag)
   - Eigenfertigung vs. Fremdbezug: Kritische Menge rechnerisch + grafisch
   - Kurzfristige/langfristige Preisuntergrenze, Zusatzaufträge

3. MARKETING, FINANZIERUNG & INVESTITION (BwR 12 LB2 + LB4 + BwR 11 LB2):
   Marketing (BwR 12 LB2):
   - BCG-Matrix: Marktwachstum-Marktanteils-Portfolio, Normstrategien (Question Marks, Stars, Cash Cows, Poor Dogs)
   - Marketingmix: Produktpolitik, Distributionspolitik (Reisender vs. Handelsvertreter: Kritische Menge!), Kontrahierungspolitik, Kommunikationspolitik
   Finanzierung (BwR 12 LB4):
   - Ordentliche Kapitalerhöhung AG: Bezugsverhältnis, rechnerischer Bezugsrechtswert, Mischkurs
   - Kreditfinanzierung: Annuitäten-/Abzahlungsdarlehen (Tilgungsplan!)
   - Kontokorrentkredit
   - Selbstfinanzierung (offen + still), Finanzierung aus Rückstellungen/Abschreibung
   - Bewegungsbilanz: Mittelverwendung vs. Mittelherkunft
   Investition (BwR 12 LB4 – NUR statische Verfahren!):
   - Kostenvergleichsrechnung
   - Gewinnvergleichsrechnung
   - Rentabilitätsrechnung: Gewinn/durchschn. gebundenes Kapital × 100
   - Amortisationsrechnung: AK / (Gewinn + kalk. Abschreibung)
   Beschaffung (BwR 11 LB2):
   - ABC-Analyse, Bestellpunktverfahren, optimale Bestellmenge (tabellarisch, rechnerisch, grafisch)
   - Lieferantenvergleich: Bezugskalkulation, Nutzwertanalyse

VERBOTENE THEMEN (BwR 13 – NICHT positiv bewerten wenn verwendet!):
- Kapitalwertmethode / dynamische Investitionsrechnung → KEIN Thema der FOS 12!
- Plankostenrechnung → KEIN Thema der FOS 12!
- Bilanzanalyse / Strukturbilanz / Bilanzkennzahlen → KEIN Thema der FOS 12!
- Balanced Scorecard, Leasing, Factoring, Lohmann-Ruchti-Effekt → KEIN Thema der FOS 12!
- Kostenanpassung, Produktionsfunktion Typ B → KEIN Thema der FOS 12!

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Teilpunkte vergeben: Korrekter Ansatz ohne Ergebnis → ca. 50% der BE
- Folgefehler: Wenn ein Zwischenergebnis falsch ist, aber der weitere Rechenweg korrekt → Punkte für den Rechenweg
- Rundung: Auf 2 Dezimalstellen. Falsche Rundung → max. 0,5 BE Abzug
- Buchungssätze: Korrekte Konten + Beträge prüfen (Soll an Haben)
- Max BE gesamt: ${maxBE}

OFFIZIELLE NOTENPUNKTE-TABELLE (BE → NP, Schwellenwerte bezogen auf 100 BE):
| NP | BE von | BE bis |
| 15 | 96     | 100    |
| 14 | 91     | 95     |
| 13 | 86     | 90     |
| 12 | 81     | 85     |
| 11 | 76     | 80     |
| 10 | 71     | 75     |
| 9  | 66     | 70     |
| 8  | 61     | 65     |
| 7  | 56     | 60     |
| 6  | 51     | 55     |
| 5  | 46     | 50     |
| 4  | 41     | 45     |
| 3  | 34     | 40     |
| 2  | 27     | 33     |
| 1  | 20     | 26     |
| 0  | 0      | 19     |
Falls max BE ≠ 100: Prozentual umrechnen (erreichte BE / max BE × 100), dann Tabelle anwenden.
Ergibt die Gesamtsumme n,5 BE → einmalig zugunsten des Prüflings aufrunden.

Antworte NUR mit validem JSON:
{
  "bewertung_bloecke": [
    {"block_nr": 1, "block_titel": "Aufgabe I", "teilaufgaben": [{"nr": "1.1", "be_erreicht": 5, "be_max": 7, "kommentar": "AK-Ermittlung korrekt, AfA monatsgenau richtig berechnet..."}], "be_erreicht": 28, "be_max": 35},
    {"block_nr": 2, "block_titel": "Aufgabe II", "teilaufgaben": [...], "be_erreicht": 20, "be_max": 25},
    {"block_nr": 3, "block_titel": "Aufgabe III", "teilaufgaben": [...], "be_erreicht": 18, "be_max": 25}
  ],
  "be_erreicht": <Zahl>,
  "be_max": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback: Welche Berechnungen korrekt, welche Fehler, welche Ansätze fehlten, Verbesserungsvorschläge>",
  "korrektur_text": "<Der Schülertext mit Markierungen: Rechenfehler mit <mark class='fehler-rs' title='Richtig: 32,58 %'>32,85 %</mark>, fehlende Schritte kennzeichnen>",
  "fehlende_aspekte": [{"aufgabe": "1.1", "aspekte": ["AfA monatsgenau nicht berücksichtigt", "Montagekosten fehlen in AK"]}]
}`;

  const bilderHinweis = (images && images.length)
    ? `\n\nBILDER: Die Schülerlösung liegt als Foto(s) der handschriftlichen Arbeit bei. Bewerte die Lösung DIREKT aus den Bildern. Achte besonders auf Rechenwege, Kalkulationen, Buchungssätze, BAB-Tabellen und HGB-Bewertungen in der Handschrift. Bei Widersprüchen zwischen Text und Bild vertraue dem Bild.`
    : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n\nSchülertext:\n${truncate(student_text, 15000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.be_erreicht ?? null;
    const beMax = parsed.be_max ?? maxBE;
    let np = parsed.notenpunkte ?? null;

    // Offizielle NP-Tabelle anwenden (auf 100 normiert)
    if (np == null && beErreicht != null) {
      const BE_NP = [[96,15],[91,14],[86,13],[81,12],[76,11],[71,10],[66,9],[61,8],[56,7],[51,6],[46,5],[41,4],[34,3],[27,2],[20,1],[0,0]];
      // Aufrundung bei n,5
      let be = beErreicht % 1 === 0.5 ? Math.ceil(beErreicht) : Math.round(beErreicht);
      // Auf 100 normieren falls max ≠ 100
      if (beMax !== 100) be = Math.round((be / beMax) * 100);
      np = 0;
      for (const [schwelle, punkte] of BE_NP) {
        if (be >= schwelle) { np = punkte; break; }
      }
    }

    return jsonResponse({
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      bewertung_bloecke: parsed.bewertung_bloecke || [],
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text: parsed.korrektur_text || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      bewertung_bloecke: [],
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= BWR FACHABITUR 12: MODEL ANSWER (BWR-spezifisch) ================= */
export async function handleModelAnswerAbiturBWR(request, env) {
  const { aufgabenbloecke } = await request.json();

  const systemPrompt = `Du bist ein BwR-Experte und erstellst eine vorbildliche Musterlösung für eine BwR-Fachabiturprüfung (FOS 12. Klasse Bayern).
Die Musterlösung orientiert sich am Stil der offiziellen ISB-Lösungshinweise.

FORMAT DER MUSTERLÖSUNG:

1. BERECHNUNGEN (Hauptteil der Lösung):
   - Klare Darstellung: Ansatz → Formel → Einsetzen → Ergebnis
   - Alle Zwischenschritte zeigen
   - Auf 2 Dezimalstellen runden (Geldbeträge, Prozentsätze)
   - Markdown-Tabellen für tabellarische Daten verwenden

2. BUCHUNGSSÄTZE:
   - Korrekte Konten mit Beträgen
   - Format: "Soll-Konto | an | Haben-Konto | Betrag"
   - Bei Umsatzsteuer: Brutto/Netto/USt korrekt trennen

3. HGB-BEWERTUNG:
   - AK-Ermittlung als Staffelrechnung (LP - Rabatt = ZEP - Skonto = BEP + Bezugskosten = AK)
   - HK: MEK + FEK + angemessene GK, einzeln auflisten
   - AfA-Berechnung (Jahres-AfA, ggf. monatsgenau im Anschaffungsjahr)
   - Regelwert vs. beizulegender Wert
   - Anwendbares Prinzip nennen (strenges/gemildertes NWP)
   - Bilanzansatz mit Begründung
   - EWB/PWB: Buchungssätze + Berechnung

4. KOSTENRECHNUNG:
   Vollkostenrechnung:
   - Zuschlagskalkulation als Staffelrechnung (MEK + MGK + FEK + FGK + ... = SK + Gewinn = BVP)
   - BAB als Tabelle (Kostenstellen, Zuschlagssätze)
   - Maschinenstundensatz: Einzelne Kostenarten aufschlüsseln
   Teilkostenrechnung:
   - Break-even: xBEP = KF / db (Formel + Berechnung)
   - Deckungsbeitragsrechnung als Tabelle
   - Engpassrechnung: Relativer db berechnen, Rangfolge bestimmen
   - Eigenfertigung vs. Fremdbezug: Kritische Menge xkrit = ΔKF / Δkv

5. GuV & ERGEBNISVERWENDUNG:
   - GuV nach Gesamtkostenverfahren als Staffelform
   - Ergebnisverwendungsrechnung als Tabelle (JÜ + GV - Einstellungen = BG - Dividende = GV neu)

6. MARKETING & FINANZIERUNG:
   - BCG-Matrix: Einordnung mit Begründung (Marktwachstum >/< Branchenschnitt, rel. Marktanteil >/< 1)
   - Reisender vs. Handelsvertreter: Kostenfunktionen aufstellen, kritische Menge berechnen
   - Kapitalerhöhung: Bezugsverhältnis, rechnerischer Wert des Bezugsrechts, Mischkurs
   - Tilgungsplan als Tabelle (Jahr, Restschuld, Zinsen, Tilgung, Annuität/Rate)
   - Bewegungsbilanz als Tabelle (Mittelverwendung | Mittelherkunft)

7. INVESTITIONSRECHNUNG (NUR statische Verfahren!):
   - Kostenvergleich: Fixe + variable Kosten pro Alternative
   - Gewinnvergleich: Erlöse - Kosten
   - Rentabilität: Gewinn / durchschn. geb. Kapital × 100
   - Amortisation: AK / (Gewinn + kalk. AfA)

8. BESCHAFFUNG:
   - Optimale Bestellmenge: Formel + Berechnung oder tabellarisch
   - Bezugskalkulation als Staffelrechnung
   - Nutzwertanalyse als Tabelle (Kriterien, Gewichtung, Punkte)

Formatiere die gesamte Lösung als Markdown mit klaren Überschriften (## Aufgabe I, ### 1.1, etc.)
Verwende Markdown-Tabellen für alle tabellarischen Daten.
KEINE Themen aus BwR 13 verwenden (keine Kapitalwertmethode, keine Plankostenrechnung, keine Bilanzanalyse/Kennzahlen)!`;

  let userContent = "AUFGABEN:\n";
  if (aufgabenbloecke && aufgabenbloecke.length) {
    for (const block of aufgabenbloecke.slice(0, 5)) {
      userContent += `\n## Aufgabe ${block.id || block.nr}: ${block.titel} (${block.gesamt_be || block.be_gesamt} BE)\n`;
      if (block.kontext) userContent += `${truncate(block.kontext, 4000)}\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 20)) {
          userContent += `**${ta.nr}** (${ta.be} BE): ${truncate(ta.text, 600)}\n`;
        }
      }
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= WIRTSCHAFT UND RECHT: PARSE TASK (OCR) ================= */
export async function handleParseTaskWR(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Wirtschaft und Recht (Bayern). Extrahiere:
1. Den Situationstext / die Aufgabenstellung (task_instruction)
2. Die Aufgabenblöcke mit Teilaufgaben und BE-Angaben
3. Die Materialien (Texte, Tabellen, Gesetzestexte)

Antworte NUR mit validem JSON:
{
  "task_instruction": "Situationstext",
  "aufgabenbloecke": [{"nr": 1, "titel": "...", "teilaufgaben": [{"nr": "1.1", "text": "...", "be": 5, "afb": "I"}], "be_gesamt": 15}],
  "materialien": [{"nr": "M1", "titel": "...", "typ": "text", "inhalt": "...", "quelle": "..."}],
  "gesamt_be": 60
}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 8000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}

/* ================= FOS ABITUR: PARSE-TASK (generisch für alle Fächer) ================= */
export async function handleParseTaskAbitur(fach, request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "images array required" }, 400, env);
  }
  if (images.length > 10) {
    return jsonResponse({ error: "Maximal 10 Bilder erlaubt." }, 400, env);
  }

  const fachLabels = {
    bwr: "BwR (Betriebswirtschaftslehre/Rechnungswesen)",
    mathe: "Mathematik",
    deutsch: "Deutsch",
    englisch: "Englisch",
    biologie: "Biologie",
    physik: "Physik",
    gestaltung: "Gestaltung",
    gesundheit: "Gesundheitswissenschaften",
    ibs: "Internationale Betriebswirtschaft und Volkswirtschaft",
    paedpsych: "Pädagogik/Psychologie"
  };
  const fachLabel = fachLabels[fach] || fach;

  const content = [
    {
      type: "text",
      text: `Diese Bilder zeigen eine Fachabiturprüfung im Fach ${fachLabel} (Bayern FOS/BOS). Extrahiere die vollständige Prüfung:

1. Situationstext / Aufgabenstellung (task_instruction)
2. Alle Aufgabenblöcke mit Teilaufgaben und BE-Angaben
3. Materialien (Texte, Tabellen, Diagramme, Gesetzestexte etc.)

Antworte NUR mit validem JSON:
{
  "titel": "Fachabiturprüfung ${fachLabel}",
  "task_instruction": "Gesamter Situationstext / Einleitung",
  "aufgaben": [
    {
      "id": "I",
      "titel": "Aufgabe I – Themenbereich",
      "gesamt_be": 30,
      "kontext": "Situationstext dieser Aufgabe",
      "teilaufgaben": [
        {"nr": "1.1", "text": "Aufgabentext ...", "be": 5}
      ]
    }
  ],
  "materialien": [{"nr": "M1", "titel": "...", "typ": "text", "inhalt": "...", "quelle": "..."}],
  "gesamt_be": 85,
  "zeit": 180,
  "hilfsmittel": "Zugelassene Hilfsmittel falls angegeben"
}`
    },
    ...images.map(img => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${img}` } }))
  ];

  const text = await callOpenAI(env, [{ role: "user", content }], 8000, { model: "gpt-5.2", temperature: 0.2 });
  const parsed = extractJSON(text);
  return jsonResponse(parsed, 200, env);
}
export async function handleGenerateAbiturWR(request, env) {
  const body = await request.json();
  const { niveau, fachbereich_1, fachbereich_2, bearbeitungszeit } = body;

  const isEA = (niveau || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);

  const fbLabels = { bwl: "Betriebswirtschaftslehre", vwl: "Volkswirtschaftslehre", recht: "Recht" };

  let aufgabenDesc;
  if (isEA) {
    const fb1 = fbLabels[fachbereich_1] || "BWL";
    const fb2 = fbLabels[fachbereich_2] || "VWL";
    aufgabenDesc = `Die Prüfung besteht aus 2 SEPARATEN Aufgaben:
- Aufgabe 1: Fachbereich ${fb1}, 60 BE, 2-3 Aufgabenblöcke, 3-4 Materialien
- Aufgabe 2: Fachbereich ${fb2}, 60 BE, 2-3 Aufgabenblöcke, 3-4 Materialien
Gesamt: 120 BE, 270 Minuten`;
  } else {
    aufgabenDesc = `Die Prüfung besteht aus 2 Teilen:
- Aufgabe 1: Integrierte Aufgabe (BWL + VWL + Recht), 75 BE, 2-3 Aufgabenblöcke, 4-5 Materialien
- Aufgabe 2: Transferaufgabe OHNE eigene Materialien, 25 BE, 1-2 Aufgabenblöcke
Gesamt: 100 BE, 210 Minuten`;
  }

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur 2026 im Fach Wirtschaft und Recht (G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit 2 Aufgaben auf ${niveauLabel}.

PRÜFUNGSFORMAT:
${aufgabenDesc}

LEHRPLAN-INHALTE (G9, Bayern, ab 2026):
BWL (WR12 LB1): Unternehmensziele/Stakeholder (1.1), Beschaffung/Break-even/Marktsituation/ABC-Analyse/BCG-Portfolio (1.2), Bilanzanalyse/Kennzahlen/EBIT (1.3, nur eA), Investition: Gewinnvergleich/Amortisation/Kapitalwertmethode/Leverage-Effekt (1.4), Management: SWOT/Porter/Kernkompetenzen (1.5, nur eA).
VWL (WR12 LB2 + WR13 LB2): Magisches Viereck/Konjunktur (12.2.1), BIP/Arbeitslosigkeit/Nachfrage-Angebotstheorie/Staatsverschuldung (12.2.2), Tarifpartner/Sozialversicherung/Umlage-Kapitaldeckung/Moral Hazard/Beveridge/BGE (12.2.3), EZB/Geldpolitik/Transmissionsmechanismus (13.2.1), Leistungsbilanz/Wechselkurse/Spieltheorie/Nash-GGW (13.2.2).
Recht (WR12 LB3 + WR13 LB1): BGB-Systematik/Gutachtenstil (12.3.1), Herausgabeanspruch/gutgläubiger Erwerb/§823 I/Gefährdungshaftung (12.3.2), Vertragstypen/Leistungsstörungen (13.1.1, nur eA), Mangelfreiheit/Gewährleistung/Verbraucherschutz/AGB/Widerrufsrecht (13.1.2), Strafrecht: Straftat-Aufbau/Strafzwecktheorien/Radbruchsche Formel (13.1.3).

AUFGABENSTRUKTUR:
- Jeder Aufgabenblock hat 2-4 Teilaufgaben mit steigendem Anforderungsniveau
- AFB I (Reproduktion): beschreiben, nennen, darstellen (ca. 20%)
- AFB II (Reorganisation/Transfer): erläutern, analysieren, vergleichen, berechnen (ca. 40%)
- AFB III (Reflexion): beurteilen, erörtern, Stellung nehmen (ca. 40%)
- Jede Teilaufgabe hat eine konkrete BE-Angabe
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erläutern Sie die Marktformen (Monopol, Oligopol, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Inhalten, die in den oben angegebenen Lehrplan-Inhalten stehen. Gehe NICHT über den Lehrplan hinaus. Beachte insbesondere die eA/gA-Differenzierung.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH Inhalte aus dem gA-Lehrplan. Themen mit "nur eA" (z.B. Bilanzanalyse, BCG-Portfolio, Leverage-Effekt, Management/SWOT/Porter, Kapitalwertmethode, Vertragstypen/Leistungsstörungen, Moral Hazard, Spieltheorie, Gefährdungshaftung) dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

MATERIALIEN:
- Typen: Zeitungsartikel, Tabellen/Statistiken, Bilanzen, Gesetzestexte, Fallbeispiele
- Textmaterialien: MINDESTENS 300-600 Wörter pro Material! Vollständige, ausführliche Texte — NICHT Zusammenfassungen! Die Materialien sollen MEHR Informationen enthalten als strikt nötig, damit Schüler die relevanten Inhalte herausarbeiten müssen.
- Tabellen: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Gesetzestexte: Korrekte §-Angaben (150-300 Wörter)
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Produkte, Märkte, Wirtschaftsszenarien, Unternehmen) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - typ "foto": Realistisches Foto. inhalt = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Unternehmen, Fabriken, Produkte, Büros. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - typ "bild": Schaubild/Diagramm. inhalt = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Fallbeispielen und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction_1": "Die Metallbau Müller GmbH, ein mittelständisches Unternehmen mit 120 Mitarbeitern, plant die Erweiterung ihrer Produktionskapazitäten. Die Geschäftsführerin Frau Weber muss verschiedene betriebswirtschaftliche Entscheidungen treffen.",
  "aufgabenbloecke_1": [
    {"nr":1,"titel":"Investitionsrechnung","teilaufgaben":[
      {"nr":"1.1","text":"Stellen Sie die Ziele eines Unternehmens im Überblick dar und unterscheiden Sie dabei zwischen ökonomischen und nicht-ökonomischen Zielen.","be":6,"afb":"I"},
      {"nr":"1.2","text":"Ermitteln Sie mithilfe von M1 den Break-even-Punkt der geplanten Investition und erläutern Sie dessen Bedeutung für die Entscheidung.","be":8,"afb":"II"},
      {"nr":"1.3","text":"Vergleichen Sie auf Grundlage von M2 zwei Investitionsalternativen mithilfe der Gewinnvergleichsrechnung und der Amortisationsrechnung.","be":10,"afb":"II"},
      {"nr":"1.4","text":"Beurteilen Sie, ob die statischen Investitionsrechenverfahren für diese Entscheidung ausreichend sind oder ob dynamische Verfahren vorzuziehen wären.","be":6,"afb":"III"}
    ],"be_gesamt":30},
    {"nr":2,"titel":"EIGENEN Aufgabenblock generieren (anderes Thema, 3-4 Teilaufgaben, AFB I→II→III)","teilaufgaben":["EIGENE Teilaufgaben generieren"],"be_gesamt":30}
  ],
  "materialien_1": [
    {"nr":"M1","titel":"Kostenkalkulation der Erweiterung","typ":"text","inhalt":"EIGENEN ausführlichen Text generieren (300-600 Wörter): Fallbeispiel mit konkreten Zahlen zu Fixkosten, variablen Kosten, Absatzpreis, geplanter Produktionsmenge etc.","quelle":"Unternehmensunterlagen"},
    {"nr":"M2","titel":"Vergleich Investitionsalternativen","typ":"statistik","inhalt":"EIGENE Markdown-Tabelle mit konkreten Zahlenwerten generieren (mind. 6 Zeilen): Vergleich zweier Maschinen mit Anschaffungskosten, Nutzungsdauer, Erlösen, Kosten etc.","quelle":"Angebote der Hersteller, 2025"},
    {"nr":"M3","titel":"Schaubild: Kostenvergleich","typ":"bild","inhalt":"Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.","bild_labels":{"1":"Beschriftung 1","2":"Beschriftung 2"},"quelle":""}
  ],
  "task_instruction_2": "EIGENEN Situationstext generieren (anderes Thema/anderer Fachbereich als Aufgabe 1)",
  "aufgabenbloecke_2": [{"nr":1,"titel":"EIGENEN Aufgabenblock generieren","teilaufgaben":["EIGENE Teilaufgaben generieren (3-4 Teilaufgaben, AFB I→II→III, mit konkreten BE-Angaben)"],"be_gesamt":"EIGENE BE-Verteilung"}],
  "materialien_2": [{"nr":"M1","titel":"EIGENES Material generieren","typ":"text","inhalt":"EIGENEN ausführlichen Text generieren (300-600 Wörter)","quelle":"EIGENE Quelle"},{"nr":"M2","titel":"Schaubild: EIGENES Thema","typ":"bild","inhalt":"Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.","bild_labels":{"1":"Beschriftung 1","2":"Beschriftung 2"},"quelle":""}],
  "gesamt_be": ${isEA ? 120 : 100},
  "fachbereich_1": "${isEA ? (fachbereich_1 || "bwl") : "integriert"}",
  "fachbereich_2": "${isEA ? (fachbereich_2 || "vwl") : "transfer"}",
  "thema_1": "Konkretes Thema Aufgabe 1",
  "thema_2": "Konkretes Thema Aufgabe 2"
}
WICHTIG: Generiere für BEIDE Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! MINDESTENS 3 Teilaufgaben pro Aufgabenblock. Material-Inhalte MÜSSEN ausformuliert sein (300-600 Wörter für Texte, echte Zahlenwerte für Tabellen). Verwende ANDERE Themen als im Beispiel!`;

  const userPrompt = `Erstelle eine vollständige WR-Abiturprüfung (2 Aufgaben):
- Niveau: ${niveauLabel}
${isEA
      ? `- Aufgabe 1: ${fbLabels[fachbereich_1] || "BWL"} (60 BE)
- Aufgabe 2: ${fbLabels[fachbereich_2] || "VWL"} (60 BE)`
      : `- Aufgabe 1: Integriert BWL+VWL+Recht (75 BE)
- Aufgabe 2: Transferaufgabe ohne Materialien (25 BE)`}

Beide Aufgaben müssen eigenständig und thematisch verschieden sein.
KRITISCH: Jedes Textmaterial MUSS 300-600 Wörter lang sein! Vollständige Texte, NICHT Zusammenfassungen. Die Materialien sollen MEHR Informationen enthalten als nötig — Schüler müssen die relevanten Inhalte herausarbeiten. Erstelle Bilder als Material NUR wenn sie in den Aufgabenstellungen referenziert werden. Keine ungenutzten Materialien!
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Themen mit "nur eA" dürfen NICHT vorkommen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= WR ABITUR: GRADE ================= */
export async function handleGradeAbiturWR(request, env) {
  const body = await request.json();
  const { task_instruction_1, aufgabenbloecke_1, materialien_1, task_instruction_2, aufgabenbloecke_2, materialien_2, student_text_1, student_text_2, niveau, gesamt_be, images } = body;

  if (!student_text_1 && !student_text_2) {
    return jsonResponse({ error: "student_text_1/2 erforderlich." }, 400, env);
  }

  const isEA = (niveau || "eA").toLowerCase() === "ea";
  const maxBE = gesamt_be || (isEA ? 120 : 100);
  const be1Max = isEA ? 60 : 75;
  const be2Max = isEA ? 60 : 25;

  let contextInfo = "=== AUFGABE 1 ===\n";
  if (task_instruction_1) contextInfo += `Situationstext:\n${truncate(task_instruction_1, 3000)}\n\n`;
  if (aufgabenbloecke_1 && aufgabenbloecke_1.length) {
    contextInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke_1.slice(0, 5)) {
      contextInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          contextInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_1 && materialien_1.length) {
    contextInfo += "\nMaterialien Aufg. 1:\n";
    for (const m of materialien_1.slice(0, 6)) {
      contextInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n\n`;
    }
  }

  contextInfo += "\n=== AUFGABE 2 ===\n";
  if (task_instruction_2) contextInfo += `Situationstext:\n${truncate(task_instruction_2, 3000)}\n\n`;
  if (aufgabenbloecke_2 && aufgabenbloecke_2.length) {
    contextInfo += "Aufgabenblöcke:\n";
    for (const block of aufgabenbloecke_2.slice(0, 5)) {
      contextInfo += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          contextInfo += `  ${ta.nr} (${ta.be} BE, AFB ${ta.afb}): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_2 && materialien_2.length) {
    contextInfo += "\nMaterialien Aufg. 2:\n";
    for (const m of materialien_2.slice(0, 6)) {
      contextInfo += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 2000)}\n\n`;
    }
  }

  const rubricPrompt = `Du bewertest eine vollständige WR-Abiturprüfung (2 Aufgaben) nach dem bayerischen BE-System.

WICHTIG – GANZE SÄTZE: Antworten sollen in vollständigen Sätzen formuliert sein, nicht in Stichpunkten oder reinen Aufzählungen. Fußnoten und Quellenverweise sind erlaubt. Es muss kein perfekt strukturierter Aufsatz sein — entscheidend ist die Formulierung in ganzen Sätzen.

BEWERTUNGSREGELN:
- Bewerte JEDE Aufgabe separat mit BE
- Aufgabe 1: max ${be1Max} BE
- Aufgabe 2: max ${be2Max} BE
- Gesamt: max ${maxBE} BE
- Berücksichtige: Materialbezug, Operatoren (AFB I/II/III), fachliche Korrektheit, Struktur

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "be_1": <Zahl>,
  "be_max_1": ${be1Max},
  "be_2": <Zahl>,
  "be_max_2": ${be2Max},
  "be_gesamt": <Zahl>,
  "be_max_gesamt": ${maxBE},
  "notenpunkte": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback>",
  "korrektur_text_a": "<Vollständiger Schülertext Aufgabe 1 mit Fehlermarkierungen: Rechtschreibfehler mit <mark class='fehler-rs' title='Korrektur: RICHTIG'>FALSCH</mark>, Grammatikfehler mit <mark class='fehler-gr' title='Korrektur: RICHTIG'>FALSCH</mark>>",
  "korrektur_text_b": "<Vollständiger Schülertext Aufgabe 2 mit gleichen Fehlermarkierungen>",
  "fehlende_aspekte": [{"aufgabe": "Teilaufgabe 1.1", "aspekte": ["fehlender Punkt 1"]}]
}`;

  // Korrekturhilfe Gewährleistungsrecht bei Rechtsaufgaben einfügen
  const abiWrText = contextInfo.toLowerCase();
  const abiIstRecht = abiWrText.includes('recht') || abiWrText.includes('mangel') || abiWrText.includes('gewährleist') || abiWrText.includes('nacherfüllung') || abiWrText.includes('verbrauchsgüterkauf') || abiWrText.includes('bgb') || abiWrText.includes('schadensersatz') || abiWrText.includes('rücktritt') || abiWrText.includes('kaufvertrag');
  const abiRechtsKorrektur = abiIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis + abiRechtsKorrektur + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${contextInfo}\nSchülertext Aufgabe 1:\n${truncate(student_text_1, 15000)}\n\nSchülertext Aufgabe 2:\n${truncate(student_text_2, 10000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 12000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    const be1 = parsed.be_1 ?? null;
    const be2 = parsed.be_2 ?? null;
    const beGesamt = parsed.be_gesamt ?? (be1 != null && be2 != null ? be1 + be2 : null);
    let np = parsed.notenpunkte ?? null;

    if (np == null && beGesamt != null) {
      const pct = (beGesamt / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      scores: { be_1: be1, be_max_1: be1Max, be_2: be2, be_max_2: be2Max, be_gesamt: beGesamt, be_max_gesamt: maxBE, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      korrektur_text_a: parsed.korrektur_text_a || "",
      korrektur_text_b: parsed.korrektur_text_b || "",
      fehlende_aspekte: parsed.fehlende_aspekte || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      scores: { be_1: null, be_max_1: be1Max, be_2: null, be_max_2: be2Max, be_gesamt: null, be_max_gesamt: maxBE, notenpunkte: null, total: null },
      feedback: openaiRes,
      feedback_kurz: [],
      korrektur_text_a: "",
      korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= WR ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturWR(request, env) {
  const { task_instruction_1, aufgabenbloecke_1, materialien_1, task_instruction_2, aufgabenbloecke_2, materialien_2 } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Wirtschaft und Recht.
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung für eine VOLLSTÄNDIGE Abiturprüfung (2 Aufgaben) auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Aufgaben
- Verwende Fachbegriffe korrekt (BWL, VWL, Recht)
- Beziehe die Materialien ein
- Bei Berechnungen: Rechenweg aufzeigen
- Bei Rechtsfragen: Obersatz, Definition, Subsumtion, Ergebnis
- Zielumfang: Aufgabe 1 ca. 800-1200 Wörter, Aufgabe 2 ca. 500-800 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Aufgabe und jeden Block.`;

  let userContent = "=== AUFGABE 1 ===\n";
  if (task_instruction_1) userContent += `SITUATION:\n${truncate(task_instruction_1, 3000)}\n\n`;
  if (aufgabenbloecke_1 && aufgabenbloecke_1.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke_1.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_1 && materialien_1.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien_1.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  userContent += "\n=== AUFGABE 2 ===\n";
  if (task_instruction_2) userContent += `SITUATION:\n${truncate(task_instruction_2, 3000)}\n\n`;
  if (aufgabenbloecke_2 && aufgabenbloecke_2.length) {
    userContent += "AUFGABEN:\n";
    for (const block of aufgabenbloecke_2.slice(0, 5)) {
      userContent += `\nBlock ${block.nr}: ${block.titel} (${block.be_gesamt} BE)\n`;
      if (block.teilaufgaben) {
        for (const ta of block.teilaufgaben.slice(0, 8)) {
          userContent += `  ${ta.nr} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
        }
      }
    }
  }
  if (materialien_2 && materialien_2.length) {
    userContent += "\nMATERIALIEN:\n";
    for (const m of materialien_2.slice(0, 6)) {
      userContent += `${m.nr} – ${m.titel}:\n${truncate(m.inhalt, 3000)}\n\n`;
    }
  }

  // Bei Rechtsaufgaben Gewährleistungs-Systematik als Referenz einfügen
  const abiMaText = userContent.toLowerCase();
  const abiMaIstRecht = abiMaText.includes('recht') || abiMaText.includes('mangel') || abiMaText.includes('gewährleist') || abiMaText.includes('nacherfüllung') || abiMaText.includes('verbrauchsgüterkauf') || abiMaText.includes('bgb') || abiMaText.includes('schadensersatz') || abiMaText.includes('rücktritt') || abiMaText.includes('kaufvertrag');
  const abiMaRechtsRef = abiMaIstRecht ? KORREKTURHILFE_GEWAEHRLEISTUNG : '';

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt + abiMaRechtsRef },
    { role: "user", content: userContent }
  ], 10000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}
