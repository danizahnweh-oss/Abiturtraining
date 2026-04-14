import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { gradeWithWolframVerification } from '../handlers/wolfram-grading.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis, KEINE_LOESUNGSHINWEISE } from '../config.js';

export async function handleGeneratePhysik(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "elektrostatik";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    elektrostatik: {
      title: "Elektrostatik & Magnetostatik",
      inhalte: "Ph12 LB1: Elektrische Feldlinien, homogenes Feld, Radialfeld, Dipolfeld. Definition der elektrischen Feldstärke über Kraft auf Probeladung. Coulombkraft, Feldstärke radialsymmetrisches Feld. Superposition von Feldern. Kapazität, Abhängigkeit der Kapazität eines Plattenkondensators von geometrischen Daten, Energieinhalt des E-Feldes. Materie im elektrischen Feld, Dielektrikum, Dielektrizitätszahl. Auf-/Entladevorgang RC-Glied. Potentielle Energie, Potential, Spannung als Potentialdifferenz, Zusammenhang U und E. Geladene Teilchen in homogenen elektrischen Längs-/Querfeldern. Relativistischer Impuls, relativistische Energie, Energie-Impuls-Beziehung. Definition magnetische Flussdichte, B-Feld einer langgestreckten Spule, Energieinhalt des B-Feldes. Lorentzkraft, Kreisbahnen geladener Teilchen in homogenen Magnetfeldern. Hall-Effekt, Massenspektrometer, Geschwindigkeitsfilter, Teilchenbeschleuniger."
    },
    induktion: {
      title: "EM-Induktion & Schwingungen",
      inhalte: "Ph12 LB2: Magnetischer Fluss, Induktionsgesetz, Erzeugung sinusförmiger Wechselspannung. Selbstinduktion: Ein-/Ausschaltvorgang bei Spule, Induktivität, Energieinhalt des B-Feldes. Schaltvorgänge in RL-Glied, Zeitkonstante. Technische Anwendungen der Induktion. Differentialgleichung der EM-Schwingung in LC-Kreis, Thomson-Gleichung, periodischer Energieaustausch Spule-Kondensator, Analogie mechanische/EM-Schwingung. Gedämpfte mechanische und EM-Schwingungen, Abklingverhalten. Resonanzphänomene bei mechanischen und EM-Schwingungen. Zeigerdiagramme. Spule und Kondensator in Wechselstromkreisen, Wechselstromwiderstand, Frequenzfilter."
    },
    emwellen: {
      title: "Elektromagnetische Wellen",
      inhalte: "Ph12 LB3: Ladung und Stromstärke bei Grundschwingung eines EM-Dipols, E- und B-Feld im Nahbereich. Maxwellgleichungen, Ausbreitung EM-Wellen. Struktur des EM-Wechselfeldes im Fernbereich, Eigenschaften: Ausbreitungsgeschwindigkeit, Polarisation, Brechung, Beugung, Reflexion. Mathematische Beschreibung einer eindimensionalen Welle. Superposition von Wellen, Interferenz am Doppelspalt, Intensität einer EM-Welle, konstruktive/destruktive Interferenz, Kohärenz, stehende Welle. Mehrfachspalt und optisches Gitter. Wellenlängenbestimmung bei mono-/polychromatischem Licht. Einfachspalt. Bragg-Reflexion, Bragg-Bedingung. Aufbau Röntgenröhre, Röntgenbremsspektrum. Elektromagnetisches Spektrum."
    },
    quantenphysik: {
      title: "Quantenphysik",
      inhalte: "Ph13 LB1: Elektronenbeugungsröhre, Hypothesen zur Interpretation. Simulation Doppelspaltexperiment: wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Elektron, Interpretation durch Wellenfunktion. De-Broglie-Beziehung für Elektron. Wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Photon. Energie und Impuls des Photons. Äußerer Photoeffekt, Bestimmung des Planck'schen Wirkungsquantums. Grenzfrequenz Röntgenbremsspektrum. Wellenfunktion: Betragsquadrat als Nachweiswahrscheinlichkeit, Superposition, Determiniertheit. Komplementarität. Quantenphysikalischer Messprozess, Kausalität, Realität, Nicht-Lokalität. Heisenberg'sche Unbestimmtheitsrelation."
    },
    atommodell: {
      title: "Atommodell der Quantenphysik",
      inhalte: "Ph13 LB2: Eindimensionaler Potentialtopf mit unendlich hohen Wänden: stehende Wellen, diskrete Energiewerte, Wellenfunktionen und Nachweiswahrscheinlichkeiten. Wellenfunktionen für weitere Potentiale: Potentialtopf mit endlich hohen Wänden, Coulomb-Potential, Tunneleffekt. Darstellung von Aufenthaltswahrscheinlichkeiten durch Orbitale, Struktur der Orbitale des Wasserstoffatoms, Quantenzahlen, Energiewerte für Wasserstoff. Emission und Absorption von Licht atomarer Gase, Energieniveauschema der Atomhülle, charakteristisches Röntgenspektrum. Energieübertrag durch Stoßanregung, Franck-Hertz-Versuch. Bestimmung der Rydberg-Konstante."
    },
    kernphysik: {
      title: "Kernphysik",
      inhalte: "Ph13 LB4: Massendefekt und mittlere Bindungsenergie je Nukleon in Abhängigkeit von Nukleonenzahl. Potentialtopfmodell des Kerns, Pauli-Prinzip. Entstehung von α-, β⁻-, β⁺- und γ-Strahlung, Tunneleffekt beim α-Zerfall, β-Zerfälle im Standardmodell, Stabilität von Atomkernen. Energiebilanzen bei Zerfällen und Kernreaktionen, Energiespektren. Ionisierende Wirkung und Nachweis von α-, β-, γ-Strahlung. Aktivität, Zerfallsgesetz, Halbwertszeit. C14-Methode zur Altersbestimmung. Strahlenbelastung, Energiedosis, Äquivalentdosis, Strahlenschutz. Kernspaltung, Kettenreaktion, prinzipieller Aufbau Kernreaktor, Chancen und Risiken. Kernfusion. Ph13 LB3: Standardmodell, Quarks, Teilchenfamilien, fundamentale Wechselwirkungen und Austauschteilchen, Erhaltung der Leptonen-/Baryonenzahl."
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.elektrostatik;

  const systemPrompt = `Du bist ein Physik-Experte für das bayerische Abitur (gA/eA, G9, ab 2026).
Erstelle eine authentische Physik-Aufgabe.

AUFGABE:
- Gesamt: ${totalBE} BE
- Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc. im aufgabe-Feld
- Teilaufgaben nummerieren: "1a)", "1b)", ..., "2a)", "2b)", etc.
- Jede einzelne Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen ' + totalBE + ' BE ergeben.'}
- Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (Tabelle ODER Diagramm)' : totalBE < 40 ? '1-2 Materialien' : '2-3 Materialien (Diagramme, Tabellen, Texte)'}
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Die Aufgabe muss fachlich korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$, $\\text{J}$
- Physikalische Konstanten: $h = 6{,}626 \\cdot 10^{-34}\\,\\text{J}\\cdot\\text{s}$, $e = 1{,}602 \\cdot 10^{-19}\\,\\text{C}$
- Kreuzprodukt: $\\vec{F} = q \\cdot \\vec{v} \\times \\vec{B}$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Energie: $E = h \\cdot f$, $E_{\\text{kin}} = \\frac{1}{2}mv^2$, $E = mc^2$
- De Broglie: $\\lambda = \\frac{h}{p}$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$

KEINE GeoGebra-Visualisierung.
KEINE Strukturformeln oder \\ce{}-Notation (das ist Chemie, nicht Physik).

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "Aufgabentext mit LaTeX-Formeln (Kontext/Einleitung)",
  "teilaufgaben": [
    {"id": "a)", "text": "Teilaufgabe mit $LaTeX$-Formeln", "be": 3},
    {"id": "b)", "text": "...", "be": 4}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [{"id": "M1", "titel": "...", "type": "diagramm", "chart_type": "line", "text": "| t in s | U in V |\\n|---|---|\\n| 0 | 0 |\\n| 1 | 3.2 |"}]
}

TABELLEN-FORMATIERUNG IN MATERIALIEN:
- In Tabellenzellen KEINE LaTeX-Notation für einfache Zahlenwerte!
  RICHTIG: | 0,10 | 0,50 | +0,34 | 25 °C | 3,6 kJ/mol |
  FALSCH:  | $0{,}10$ | $0{,}50$ | $+0{,}34$ | $25\\,°\\text{C}$ |
- LaTeX ($...$) in Tabellen NUR für Fachformeln: $E^0$, $\\Delta H$, $\\ce{Fe^{3+}}$
- Einfache Einheiten als Text: mol/L, kJ/mol, °C, V, g (NICHT als $\\text{mol/L}$)

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Messwerten (mind. 4-6 Datenzeilen)
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte, z.B. t/U, t/I, λ/Intensität)
- "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}
- "foto": Realistisches Foto. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Laboraufbauten, Versuchsapparaturen, Mikroskopaufnahmen, Organismen, Ökosysteme, Messgeräte, Naturphänomene. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
${totalBE >= 25 ? 'Pro Aufgabe: mindestens 1x statistik/diagramm + 1x text.' : totalBE >= 15 ? 'Maximal 1 Material pro Aufgabe.' : 'Keine Materialien bei dieser Aufgabengröße.'}
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$).`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, "Physik");
  }

  return jsonResponse(content, 200, env);
}

/* ================= PHYSIK: GRADE ================= */
export async function handleGradePhysik(request, env) {
  const body = await request.json();
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, student_text, student_texts, material, images } = body;

  if (!student_text && !student_texts) {
    return jsonResponse({ error: "student_text erforderlich." }, 400, env);
  }

  const maxBE = gesamt_be || 10;

  let aufgabenInfo = `Aufgabe:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    aufgabenInfo += "Materialien:\n";
    for (const m of material) {
      aufgabenInfo += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    aufgabenInfo += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    aufgabenInfo += "Teilaufgaben:\n";
    for (const ta of teilaufgaben) {
      aufgabenInfo += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }

  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    const parts = [];
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        const ta = (teilaufgaben || []).find(t => (t.id || t.nr) === key);
        const beInfo = ta ? ` (${ta.be} BE)` : "";
        parts.push(`Schülerlösung ${key}${beInfo}:\n${truncate(text, 5000)}`);
      }
    }
    studentSolutionText = parts.join("\n\n");
  } else {
    studentSolutionText = truncate(student_text, 15000);
  }

  const rubricPrompt = `Du bewertest eine Physik-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, physikalische Gesetze, Herleitungen, quantitative Berechnungen, Einheiten, Diagramme
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text und LaTeX-Notation. Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Physik-typische Darstellungsformen sind erwünscht: Formeln, Berechnungen, Skizzen, Diagramme, Einheitenrechnungen
- Stichpunkte bei Rechenwegen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für physikalische und mathematische Ausdrücke.
LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.
PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten korrekt angeben.

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung mit $LaTeX$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const bilderHinweisPhysik = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisPhysik + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n${studentSolutionText}`, images) }
  ];

  // Sandwich-Architektur: WolframAlpha-Verifikation bei Rechenaufgaben
  const openaiRes = await gradeWithWolframVerification(aufgabenInfo, studentSolutionText, images, sachgebiet || 'physik', messages, env);

  try {
    const parsed = extractJSON(openaiRes);
    const beErreicht = parsed.gesamt_be ?? null;
    const beMax = parsed.max_be ?? maxBE;
    let np = parsed.note ?? null;

    if (np == null && beErreicht != null) {
      const pct = (beErreicht / beMax) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      teilbewertungen: parsed.teilbewertungen || [],
      gesamt_be: beErreicht,
      max_be: beMax,
      note: np,
      scores: { be_erreicht: beErreicht, be_max: beMax, notenpunkte: np, total: np },
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch (e) {
    console.error("grade JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    let fallbackFeedback = "Die Bewertung konnte leider nicht korrekt verarbeitet werden. Bitte versuche es erneut.";
    if (openaiRes && typeof openaiRes === "string") {
      const trimmed = openaiRes.trim();
      if (trimmed.length > 50 && !trimmed.startsWith("{") && !trimmed.startsWith("Du bist") && !trimmed.startsWith("Hier ist") && !trimmed.startsWith("Du bewertest")) {
        fallbackFeedback = trimmed;
      }
    }
    return jsonResponse({
      teilbewertungen: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      scores: { be_erreicht: null, be_max: maxBE, notenpunkte: null, total: null },
      feedback: fallbackFeedback,
      feedback_kurz: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= PHYSIK: MODEL ANSWER ================= */
export async function handleModelAnswerPhysik(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Physik-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung des Induktionsgesetzes")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\\cdot$ (NIEMALS $*$)
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$
- Konstanten: $h$, $e$, $c$, $\\varepsilon_0$, $\\mu_0$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$, $T_{1/2} = \\frac{\\ln 2}{\\lambda}$`;

  let userContent = `AUFGABE:\n${truncate(aufgabe, 5000)}\n\n`;
  if (material && material.length) {
    userContent += "MATERIALIEN:\n";
    for (const m of material) {
      userContent += `${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
    }
    userContent += "\n";
  }
  if (teilaufgaben && teilaufgaben.length) {
    userContent += "TEILAUFGABEN:\n";
    for (const ta of teilaufgaben) {
      userContent += `${ta.id} (${ta.be} BE): ${truncate(ta.text, 500)}\n`;
    }
  }
  userContent += `\nGesamt: ${gesamt_be || "?"} BE`;

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 6000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= PHYSIK: PARSE TASK ================= */
export async function handleParseTaskPhysik(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Physik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln, Diagramme, Tabellen und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$). PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten korrekt. LATEX-REGELN: \\cdot statt *, \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= MATERIAL-PLATZHALTER REPARATUR ================= */
export const PLACEHOLDER_PATTERNS = [
  /^ein\s+(text|fachtext|auszug|artikel|bericht)/i,
  /^(hier\s+(ist|steht|folgt)|im\s+folgenden)/i,
  /^\(.*?(text|inhalt|platzhalter|einfügen|ergänzen).*?\)$/i,
  /^beschreib(e|ung)/i,
  /^erstell(e|ung)/i,
  /^\[.*?\]$/,
  /^<.*?>$/
];

export function isMaterialPlaceholder(material) {
  if (!material || !material.text) return true;
  const text = material.text.trim();
  // Zu kurz für echten Inhalt (Tabellen dürfen kürzer sein)
  const minLen = (material.type === "statistik" || material.type === "diagramm") ? 30 : 80;
  if (text.length < minLen) return true;
  // Bekannte Platzhalter-Muster
  for (const pat of PLACEHOLDER_PATTERNS) {
    if (pat.test(text)) return true;
  }
  return false;
}

export async function repairPlaceholderMaterials(env, materials, sachgebietTitle) {
  const toRepair = materials.filter(m => isMaterialPlaceholder(m));
  if (!toRepair.length) return materials;

  console.warn(`[repairMaterials] ${toRepair.length}/${materials.length} Materialien sind Platzhalter, generiere nach...`);

  // Alle Platzhalter parallel nachgenerieren
  const repairs = await Promise.allSettled(toRepair.map(async (m) => {
    const typeInstr = {
      text: `Schreibe einen vollständigen, ausformulierten Fachtext (mind. 150 Wörter) für Oberstufenschüler. Der Text soll als Material in einer Klausuraufgabe dienen. Thema: "${m.titel || "Fachtext"}". Sachgebiet: ${sachgebietTitle}. Gib NUR den reinen Fachtext aus, keine Überschrift, kein JSON.`,
      statistik: `Erstelle eine vollständige Markdown-Tabelle mit echten, realistischen Zahlenwerten (mind. 4 Datenzeilen) zum Thema "${m.titel || "Daten"}". Sachgebiet: ${sachgebietTitle}. Gib NUR die Markdown-Tabelle aus.`,
      diagramm: `Erstelle eine vollständige Markdown-Tabelle mit echten, realistischen x/y-Messwerten (mind. 6 Datenpunkte) zum Thema "${m.titel || "Messwerte"}". Sachgebiet: ${sachgebietTitle}. Gib NUR die Markdown-Tabelle aus.`,
      bild: `Schreibe einen Bildprompt KOMPLETT auf Englisch (5-10 Sätze) für eine biologische Abbildung zum Thema "${m.titel || "Abbildung"}". NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Gib NUR den Prompt aus.`
    };
    const prompt = typeInstr[m.type] || typeInstr.text;
    try {
      const result = await callOpenAI(env, [
        { role: "user", content: prompt }
      ], 3000, { model: "gpt-5.2", temperature: 0.5 });
      return { id: m.id, text: result.trim() };
    } catch (e) {
      console.error(`[repairMaterials] Fehler bei ${m.id}:`, e.message);
      return null;
    }
  }));

  // Reparierte Texte einsetzen
  const repairMap = {};
  for (const r of repairs) {
    if (r.status === "fulfilled" && r.value && r.value.text) {
      repairMap[r.value.id] = r.value.text;
    }
  }

  return materials.map(m => {
    if (repairMap[m.id]) {
      return { ...m, text: repairMap[m.id] };
    }
    return m;
  });
}

/* ================= PHYSIK ABITUR: GENERATE ================= */
export async function handleGenerateAbiturPhysik(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Physik-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Physik-Abiturprüfung.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

SACHGEBIETE (wähle 4 verschiedene aus diesen 6, Lehrplan G9 Bayern ab 2026):
1. Elektrostatik & Magnetostatik (Ph12 LB1): Elektrische Feldlinien, homogenes Feld, Radialfeld, Dipolfeld. Definition der elektrischen Feldstärke über Kraft auf Probeladung. Coulombkraft, Feldstärke radialsymmetrisches Feld. Superposition von Feldern. Kapazität, Abhängigkeit der Kapazität eines Plattenkondensators von geometrischen Daten, Energieinhalt des E-Feldes. Materie im elektrischen Feld, Dielektrikum, Dielektrizitätszahl. Auf-/Entladevorgang RC-Glied. Potentielle Energie, Potential, Spannung als Potentialdifferenz, Zusammenhang U und E. Geladene Teilchen in homogenen elektrischen Längs-/Querfeldern. Relativistischer Impuls, relativistische Energie, Energie-Impuls-Beziehung. Definition magnetische Flussdichte, B-Feld einer langgestreckten Spule, Energieinhalt des B-Feldes. Lorentzkraft, Kreisbahnen geladener Teilchen in homogenen Magnetfeldern. Hall-Effekt, Massenspektrometer, Geschwindigkeitsfilter, Teilchenbeschleuniger.
2. EM-Induktion & Schwingungen (Ph12 LB2): Magnetischer Fluss, Induktionsgesetz, Erzeugung sinusförmiger Wechselspannung. Selbstinduktion: Ein-/Ausschaltvorgang bei Spule, Induktivität, Energieinhalt des B-Feldes. Schaltvorgänge in RL-Glied, Zeitkonstante. Technische Anwendungen der Induktion. Differentialgleichung der EM-Schwingung in LC-Kreis, Thomson-Gleichung, periodischer Energieaustausch Spule-Kondensator, Analogie mechanische/EM-Schwingung. Gedämpfte mechanische und EM-Schwingungen, Abklingverhalten. Resonanzphänomene bei mechanischen und EM-Schwingungen. Zeigerdiagramme. Spule und Kondensator in Wechselstromkreisen, Wechselstromwiderstand, Frequenzfilter.
3. Elektromagnetische Wellen (Ph12 LB3): Ladung und Stromstärke bei Grundschwingung eines EM-Dipols, E- und B-Feld im Nahbereich. Maxwellgleichungen, Ausbreitung EM-Wellen. Struktur des EM-Wechselfeldes im Fernbereich, Eigenschaften: Ausbreitungsgeschwindigkeit, Polarisation, Brechung, Beugung, Reflexion. Mathematische Beschreibung einer eindimensionalen Welle. Superposition von Wellen, Interferenz am Doppelspalt, Intensität einer EM-Welle, konstruktive/destruktive Interferenz, Kohärenz, stehende Welle. Mehrfachspalt und optisches Gitter. Wellenlängenbestimmung bei mono-/polychromatischem Licht. Einfachspalt. Bragg-Reflexion, Bragg-Bedingung. Aufbau Röntgenröhre, Röntgenbremsspektrum. Elektromagnetisches Spektrum.
4. Quantenphysik (Ph13 LB1): Elektronenbeugungsröhre, Hypothesen zur Interpretation. Simulation Doppelspaltexperiment: wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Elektron, Interpretation durch Wellenfunktion. De-Broglie-Beziehung für Elektron. Wellenartiges, teilchenartiges, stochastisches Verhalten des Quantenobjekts Photon. Energie und Impuls des Photons. Äußerer Photoeffekt, Bestimmung des Planck'schen Wirkungsquantums. Grenzfrequenz Röntgenbremsspektrum. Wellenfunktion: Betragsquadrat als Nachweiswahrscheinlichkeit, Superposition, Determiniertheit. Komplementarität. Quantenphysikalischer Messprozess, Kausalität, Realität, Nicht-Lokalität. Heisenberg'sche Unbestimmtheitsrelation.
5. Atommodell der Quantenphysik (Ph13 LB2): Eindimensionaler Potentialtopf mit unendlich hohen Wänden: stehende Wellen, diskrete Energiewerte, Wellenfunktionen und Nachweiswahrscheinlichkeiten. Wellenfunktionen für weitere Potentiale: Potentialtopf mit endlich hohen Wänden, Coulomb-Potential, Tunneleffekt. Darstellung von Aufenthaltswahrscheinlichkeiten durch Orbitale, Struktur der Orbitale des Wasserstoffatoms, Quantenzahlen, Energiewerte für Wasserstoff. Emission und Absorption von Licht atomarer Gase, Energieniveauschema der Atomhülle, charakteristisches Röntgenspektrum. Energieübertrag durch Stoßanregung, Franck-Hertz-Versuch. Bestimmung der Rydberg-Konstante.
6. Kernphysik (Ph13 LB4): Massendefekt und mittlere Bindungsenergie je Nukleon in Abhängigkeit von Nukleonenzahl. Potentialtopfmodell des Kerns, Pauli-Prinzip. Entstehung von α-, β⁻-, β⁺- und γ-Strahlung, Tunneleffekt beim α-Zerfall, β-Zerfälle im Standardmodell, Stabilität von Atomkernen. Energiebilanzen bei Zerfällen und Kernreaktionen, Energiespektren. Ionisierende Wirkung und Nachweis von α-, β-, γ-Strahlung. Aktivität, Zerfallsgesetz, Halbwertszeit. C14-Methode zur Altersbestimmung. Strahlenbelastung, Energiedosis, Äquivalentdosis, Strahlenschutz. Kernspaltung, Kettenreaktion, prinzipieller Aufbau Kernreaktor. Kernfusion. Standardmodell, Quarks, Teilchenfamilien, fundamentale Wechselwirkungen und Austauschteilchen, Erhaltung der Leptonen-/Baryonenzahl.

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Geladene Teilchen im Magnetfeld")
- Ein Sachgebiet
- Material (M1, M2, ...): Texte, Tabellen, Diagramme, Messdaten
- 4-8 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Gesamt: ${beProAufgabe} BE

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- Materialien müssen realistisch und aussagekräftig sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger mathematische Tiefe bei Herleitungen und Berechnungen, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Materialien und Aufgabenstellungen.` : ""}

LATEX-FORMATIERUNG (schreibe echte Physik/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

PHYSIK-SPEZIFISCHE LATEX-REGELN:
- Vektoren: $\\vec{F}$, $\\vec{E}$, $\\vec{B}$, $\\vec{v}$
- Einheiten: $\\text{m/s}$, $\\text{N}$, $\\text{V}$, $\\text{T}$, $\\text{eV}$, $\\text{J}$
- Physikalische Konstanten: $h = 6{,}626 \\cdot 10^{-34}\\,\\text{J}\\cdot\\text{s}$, $e = 1{,}602 \\cdot 10^{-19}\\,\\text{C}$
- Kreuzprodukt: $\\vec{F} = q \\cdot \\vec{v} \\times \\vec{B}$
- Wellenfunktion: $\\psi(x)$, $|\\psi(x)|^2$
- Energie: $E = h \\cdot f$, $E_{\\text{kin}} = \\frac{1}{2}mv^2$, $E = mc^2$
- De Broglie: $\\lambda = \\frac{h}{p}$
- Zerfallsgesetz: $N(t) = N_0 \\cdot e^{-\\lambda t}$

KEINE GeoGebra-Visualisierung.
KEINE Strukturformeln oder \\ce{}-Notation (das ist Physik, nicht Chemie).

TABELLEN-FORMATIERUNG IN MATERIALIEN:
- In Tabellenzellen KEINE LaTeX-Notation für einfache Zahlenwerte!
  RICHTIG: | 0,10 | 0,50 | +0,34 | 25 °C | 3,6 kJ/mol |
  FALSCH:  | $0{,}10$ | $0{,}50$ | $+0{,}34$ | $25\\,°\\text{C}$ |
- LaTeX ($...$) in Tabellen NUR für Fachformeln: $E^0$, $\\Delta H$, $\\ce{Fe^{3+}}$
- Einfache Einheiten als Text: mol/L, kJ/mol, °C, V, g (NICHT als $\\text{mol/L}$)

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN Messwerten (mind. 4-6 Datenzeilen). KEINE Werte aus den Beispielen kopieren!
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN x/y-Datenpunkten (mind. 5-8 Messwerte). KEINE Werte aus den Beispielen kopieren!
- "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}
- "foto": Realistisches Foto. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Laboraufbauten, Versuchsapparaturen, Mikroskopaufnahmen, Organismen, Ökosysteme, Messgeräte, Naturphänomene. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 1x statistik/diagramm + 1x text.
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Sachgebieten, Daten und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Aufladung eines Kondensators",
      "sachgebiet": "elektrostatik",
      "material": [
        {"id": "M1", "titel": "Versuchsaufbau RC-Glied", "type": "text", "text": "Ein Plattenkondensator mit der Kapazität $C = 470\\,\\\\text{µF}$ wird über einen Widerstand $R = 10\\,\\\\text{k}\\\\Omega$ an eine Gleichspannungsquelle mit $U_0 = 12\\,\\\\text{V}$ angeschlossen. Mit einem Spannungsmessgerät wird die Spannung $U_C(t)$ am Kondensator in regelmäßigen Zeitabständen gemessen. Die Zeitkonstante des RC-Gliedes beträgt $\\\\tau = R \\\\cdot C$."},
        {"id": "M2", "titel": "Messwerte Aufladekurve", "type": "diagramm", "chart_type": "line", "text": "| t / s | $U_C$ / V |\\n|---|---|\\n| 0 | 0,0 |\\n| 1 | 2,4 |\\n| 2 | 4,3 |\\n| 3 | 5,7 |\\n| 5 | 7,9 |\\n| 8 | 10,1 |\\n| 10 | 10,9 |\\n| 15 | 11,8 |"},
        {"id": "M3", "titel": "Energiebetrachtung", "type": "text", "text": "Bei der Aufladung eines Kondensators wird nicht die gesamte von der Spannungsquelle bereitgestellte Energie im Kondensator gespeichert. Ein Teil der Energie wird im Widerstand in Wärme umgewandelt. Die im Kondensator gespeicherte Energie beträgt $W_C = \\\\frac{1}{2} C U^2$, während die Spannungsquelle insgesamt die Energie $W_{ges} = C U_0^2$ liefert."}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Beschreiben Sie den in M2 dargestellten zeitlichen Verlauf der Kondensatorspannung $U_C(t)$.", "be": 4},
        {"id": "1.2", "text": "Berechnen Sie die Zeitkonstante $\\\\tau$ des RC-Gliedes und ermitteln Sie aus M2 den Spannungswert bei $t = \\\\tau$. Vergleichen Sie mit dem theoretischen Wert.", "be": 6},
        {"id": "1.3", "text": "Erläutern Sie mithilfe der Exponentialfunktion $U_C(t) = U_0 \\\\cdot (1 - e^{-\\\\frac{t}{\\\\tau}})$, warum der Kondensator theoretisch nie vollständig aufgeladen wird.", "be": 6},
        {"id": "1.4", "text": "Berechnen Sie die im Kondensator gespeicherte Energie nach vollständiger Aufladung und den Wirkungsgrad des Aufladevorgangs. Erklären Sie das Ergebnis physikalisch.", "be": 8},
        {"id": "1.5", "text": "Beurteilen Sie, wie sich eine Verdopplung des Widerstands $R$ auf den zeitlichen Verlauf der Aufladung und auf den Wirkungsgrad auswirkt.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Interferenz am Doppelspalt",
      "sachgebiet": "em_wellen",
      "material": [
        {"id": "M1", "titel": "Versuchsbeschreibung", "type": "text", "text": "Monochromatisches Laserlicht der Wellenlänge $\\\\lambda$ fällt auf einen Doppelspalt mit dem Spaltabstand $d = 0{,}25\\,\\\\text{mm}$. Auf einem Schirm im Abstand $a = 3{,}0\\,\\\\text{m}$ hinter dem Doppelspalt wird ein Interferenzmuster beobachtet. Die Abstände der Interferenzmaxima vom Maximum nullter Ordnung werden gemessen."},
        {"id": "M2", "titel": "Messwerte Interferenzmaxima", "type": "statistik", "chart_type": "bar", "text": "| Ordnung $k$ | Abstand $x_k$ / mm |\\n|---|---|\\n| 1 | 7,6 |\\n| 2 | 15,1 |\\n| 3 | 22,8 |\\n| 4 | 30,3 |\\n| 5 | 37,9 |"}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Beschreiben Sie die Bedingung für konstruktive Interferenz am Doppelspalt und leiten Sie die Gleichung für die Lage der Maxima her.", "be": 5},
        {"id": "2.2", "text": "Bestimmen Sie mithilfe der Messwerte aus M2 die Wellenlänge $\\\\lambda$ des verwendeten Laserlichts.", "be": 6},
        {"id": "2.3", "text": "Erklären Sie, wie sich das Interferenzmuster verändert, wenn der Spaltabstand $d$ halbiert wird.", "be": 5},
        {"id": "2.4", "text": "Der Doppelspalt wird durch ein optisches Gitter mit 600 Linien pro mm ersetzt. Berechnen Sie den Winkel $\\\\alpha$ für das Maximum erster Ordnung.", "be": 8},
        {"id": "2.5", "text": "Beurteilen Sie, ob mit diesem Gitter weißes Licht in seine Spektralfarben zerlegt werden kann. Begründen Sie Ihre Antwort.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1+2)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1-3)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! Aufgabe 3 und 4 müssen genauso detailliert sein wie Aufgabe 1 und 2. MINDESTENS 4 Teilaufgaben pro Aufgabengruppe.
Erstelle 4 Aufgabengruppen mit dem gleichen Schema aber KOMPLETT ANDEREN Themen als in den Beispielen.`;

  const userPrompt = `Erstelle eine vollständige Physik-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
KRITISCH: Alle Formeln in LaTeX-Notation. KEINE \\ce{}-Notation (Physik, nicht Chemie).
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgabenPhys = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgabenPhys) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Physik");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= PHYSIK ABITUR: GRADE ================= */
export async function handleGradeAbiturPhysik(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level, images } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 40 : 30;
  const maxBE = 3 * beProAufgabe;

  let aufgabenInfo = "";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      aufgabenInfo += `\n${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          aufgabenInfo += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 500)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          aufgabenInfo += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
    }
  }

  let studentTexts = "";
  if (typeof student_texts === "object") {
    for (const [key, text] of Object.entries(student_texts)) {
      if (text && text.trim()) {
        studentTexts += `\nSchülerlösung ${key}:\n${truncate(text, 8000)}\n`;
      }
    }
  }

  const rubricPrompt = `Du bewertest eine Physik-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, physikalische Formeln, korrekte Einheiten, Lösungswege, Skizzen/Diagramme, quantitative Berechnungen
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Physik und LaTeX-Notation. Interpretiere beides großzügig.

ANTWORT-FORMAT:
- Physik-typische Darstellungsformen sind erwünscht: Formeln, Berechnungen, Skizzen, Diagramme, Einheitenrechnungen
- Stichpunkte bei Rechenwegen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback. KEINE \\ce{}-Notation.

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const bilderHinweisAbiPhysik = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisAbiPhysik + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

  try {
    const parsed = extractJSON(openaiRes);
    let gesamtBE = parsed.gesamt_be ?? null;
    let np = parsed.note ?? null;

    if (gesamtBE == null && parsed.aufgaben_be && parsed.aufgaben_be.length) {
      gesamtBE = parsed.aufgaben_be.reduce((sum, a) => sum + (a.erreichte_be || 0), 0);
    }
    if (np == null && gesamtBE != null) {
      const pct = (gesamtBE / maxBE) * 100;
      const table = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1], [0, 0]];
      np = 0;
      for (const [th, n] of table) { if (pct >= th) { np = n; break; } }
    }

    return jsonResponse({
      aufgaben_be: parsed.aufgaben_be || [],
      gesamt_be: gesamtBE,
      max_be: maxBE,
      note: np,
      feedback: parsed.feedback || "",
      feedback_kurz: parsed.feedback_kurz || [],
      uebungsaufgaben: parsed.uebungsaufgaben || []
    }, 200, env);
  } catch {
    return jsonResponse({
      aufgaben_be: [],
      gesamt_be: null,
      max_be: maxBE,
      note: null,
      feedback: openaiRes,
      feedback_kurz: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= PHYSIK ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturPhysik(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Physik-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- KEINE \\ce{}-Notation (das ist Physik, nicht Chemie)
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- PHYSIK-REGELN: Vektoren $\\vec{F}$, Einheiten $\\text{m/s}$, Konstanten mit korrekten Werten
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
  ...
  ## Aufgabe 2: [Titel]
  ...
- Am Ende: Zusammenfassung der BE pro Aufgabe und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABEN:\n\n";
  if (aufgaben && aufgaben.length) {
    for (const a of aufgaben) {
      userContent += `${a.id || a.titel} – ${a.sachgebiet} (${a.gesamt_be} BE):\n`;
      if (a.material && a.material.length) {
        for (const m of a.material) {
          userContent += `  Material ${m.id} – ${m.titel}: ${truncate(m.text, 1000)}\n`;
        }
      }
      if (a.teilaufgaben) {
        for (const t of a.teilaufgaben) {
          userContent += `  ${t.id} (${t.be} BE): ${truncate(t.text, 300)}\n`;
        }
      }
      userContent += "\n";
    }
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 10000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}
