import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis, KEINE_LOESUNGSHINWEISE } from '../config.js';
import { repairPlaceholderMaterials } from './physik.js';

export async function handleGenerateBio(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "genetik";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    genetik: {
      title: "Genetik & Gentechnik",
      inhalte: "Genetik & Gentechnik (B12 LB1): Aufbau und Struktur der DNA (Doppelhelix, Basenpaarung, antiparallele Stränge). Semikonservative Replikation. Proteinbiosynthese: Transkription, RNA-Processing (Spleißen), Translation am Ribosom, genetischer Code (Codon, Anticodon, Redundanz). Genregulation bei Prokaryoten (Operon-Modell) und Eukaryoten (Transkriptionsfaktoren, Enhancer, Methylierung). Genmutationen (Punkt-, Rastermutationen), Mutagene, Reparaturmechanismen. Chromosomenmutationen und Genommutationen. Klassische Genetik: Mendel-Regeln (Uniformität, Spaltung, Unabhängigkeit), Rückkreuzung, dihybrider Erbgang, Kopplung und Rekombination. Humangenetik: Stammbaumanalyse (autosomal/gonosomal, dominant/rezessiv). Gentechnik: Restriktionsenzyme, Vektoren, PCR, Gelelektrophorese, genetischer Fingerabdruck, CRISPR-Cas. Bioethische Bewertung gentechnischer Verfahren."
    },
    neurobiologie: {
      title: "Neurobiologie",
      inhalte: "Neurobiologie (B12 LB2): Bau und Funktion von Nervenzellen (Soma, Axon, Dendriten, Myelinscheide, Ranvier-Schnürringe). Ruhepotential (Natrium-Kalium-Pumpe, Kalium-Leckkanäle, Nernst-Gleichung). Aktionspotential (Depolarisation, Repolarisation, Hyperpolarisation, Refraktärzeit, Alles-oder-Nichts-Prinzip). Erregungsleitung: kontinuierlich und saltatorisch, Geschwindigkeit. Synapse: erregende und hemmende postsynaptische Potentiale (EPSP, IPSP), räumliche und zeitliche Summation. Verrechnung an Nervenzellen. Neuroaktive Substanzen und Synapsengifte (Wirkungsmechanismen). Sinnesphysiologie: Bau des Auges, Fotorezeptoren (Stäbchen, Zapfen), Signaltransduktion."
    },
    stoffwechsel: {
      title: "Stoffwechselphysiologie",
      inhalte: "Stoffwechselphysiologie (B12 LB3): Enzyme: Aufbau (Proteine, aktives Zentrum), Substrat- und Wirkungsspezifität, Schlüssel-Schloss-Prinzip und Induced-Fit-Modell. Abhängigkeit der Enzymaktivität von Temperatur, pH-Wert und Substratkonzentration. Enzymhemmung (kompetitiv, nicht-kompetitiv, allosterisch). ATP als universeller Energieträger, Redoxreaktionen. Zellatmung: Glykolyse, oxidative Decarboxylierung, Citratzyklus, Atmungskette (Chemiosmose, ATP-Synthase), Energiebilanz. Gärung (alkoholische Gärung, Milchsäuregärung). Photosynthese: Lichtreaktion (Fotosystem I und II, Elektronentransportkette), Calvin-Zyklus (CO₂-Fixierung, Reduktion, Regeneration). Abhängigkeit der Fotosyntheserate von Lichtintensität, CO₂-Konzentration, Temperatur."
    },
    oekologie: {
      title: "Ökologie & Biodiversität",
      inhalte: "Ökologie & Biodiversität (B12 LB4): Abiotische und biotische Umweltfaktoren. Ökologische Potenz, Toleranzkurve, Minimum-Gesetz, stenök/euryök. Populationsökologie: Wachstumsmodelle (exponentiell, logistisch), Kapazitätsgrenze K, r- und K-Strategen. Intra- und interspezifische Konkurrenz, Konkurrenzvermeidung, ökologische Nische (Fundamental- vs. Realnische). Räuber-Beute-Beziehungen (Lotka-Volterra-Regeln). Symbiose, Parasitismus, Kommensalismus. Ökosystem: Trophieebenen, Nahrungsketten/-netze, Energiefluss, Stoffkreisläufe (C, N). Sukzession, Klimaxgesellschaft. Biodiversität: Artenschutz, nachhaltige Nutzung, anthropogener Treibhauseffekt."
    },
    evolution: {
      title: "Evolution",
      inhalte: "Evolution (B13 LB1): Evolutionstheorien (Darwin, Lamarck, synthetische Evolutionstheorie). Evolutionsfaktoren: Mutation, Rekombination, Selektion (gerichtet, stabilisierend, disruptiv), Gendrift (Flaschenhalseffekt, Gründereffekt), Genfluss, Isolation. Artbegriffe (biologischer, morphologischer Artbegriff). Artbildung: allopatrisch, sympatrisch, adaptive Radiation. Homologie und Analogie, Rudimente, Atavismen. Molekulare Phylogenetik: DNA-Sequenzvergleich, molekulare Uhr. Stammbaum-Analyse (Kladogramm, Synapomorphien). Koevolution. Humanevolution: fossile Funde, Merkmalsvergleich Menschenaffen/Mensch."
    },
    verhalten: {
      title: "Verhaltensökologie",
      inhalte: "Verhaltensökologie (B13 LB2): Verhalten als Anpassung (proximate und ultimate Ursachen). Kosten-Nutzen-Analyse von Verhaltensweisen. Fitness (direkte und indirekte Fitness, Gesamtfitness/Inclusive Fitness). Fortpflanzungsstrategien: sexuelle Selektion (intra- und intersexuell), Partnerwahl, Brutpflege. Altruismus und Verwandtenselektion (Hamilton-Regel: rB > C). Kooperation: reziproker Altruismus, Tit-for-Tat. Sozialverhalten: Gruppenbildung (Vor- und Nachteile), Dominanzhierarchien. Kommunikation im Tierreich (optisch, akustisch, chemisch, taktil). Konflikte: Eltern-Kind-Konflikt, Geschwisterkonkurrenz."
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.genetik;

  const systemPrompt = `Du bist Biologielehrer am bayerischen Gymnasium. Erstelle eine Biologie-Klausuraufgabe im IQB-Format (Abitur gA/eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.${zeitHinweis}
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, ALLTAGSNAHEN Kontext ein (z.B. ein bestimmter Organismus, ein Experiment, ein aktuelles Forschungsergebnis)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- Operatoren gezielt nach ISB-Definition einsetzen — der Operator bestimmt EXAKT, was erwartet wird. Verlange NICHT mehr als der Operator vorgibt!
  • AFB I (Reproduktion):
    - "Nennen/Angeben Sie" = Begriffe, Sachverhalte oder Daten OHNE weitere Erklärungen aufzählen
    - "Beschreiben Sie" = Sachverhalt in eigenen Worten unter Berücksichtigung der Fachsprache wiedergeben
    - "Stellen Sie dar" = Sachverhalte strukturiert wiedergeben, geeignete Darstellungsformen verwenden
    - "Skizzieren Sie" = Sachverhalte auf das Wesentliche reduzieren und grafisch darstellen
  • AFB II (Transfer):
    - "Erklären Sie" = Sachverhalt auf Grundlage von Regeln und Gesetzmäßigkeiten nachvollziehbar darlegen
    - "Erläutern Sie" = Sachverhalt verständlich darstellen MIT zusätzlichen Informationen, Skizzen oder Analogien; konkreter fachlicher Bezug
    - "Vergleichen Sie" = Gemeinsamkeiten UND Unterschiede herausarbeiten; passende Kriterien finden
    - "Analysieren Sie" = Aus Material wichtige Komponenten und Zusammenhänge auf eine Fragestellung hin herausarbeiten
    - "Auswerten" = Daten in einen Zusammenhang bringen und ggf. eine Gesamtaussage formulieren
    - "Begründen Sie" = Ursachen oder Argumente nachvollziehbar angeben
    - "Interpretieren/Deuten Sie" = Kausale Zusammenhänge im Hinblick auf Erklärungsmöglichkeiten herausarbeiten
  • AFB III (Bewertung):
    - "Beurteilen Sie" = Fachlich begründete, selbstständige Einschätzung abgeben (Sachurteil)
    - "Bewerten Sie" = Eigene Position hinsichtlich fachlicher Kriterien UND gesellschaftlicher Werte vertreten (Werturteil)
    - "Diskutieren Sie" = Unterschiedliche Positionen gegenüberstellen und abwägen
- WICHTIG: Wenn ein Operator nur "Nennen" verlangt, darf das Feedback NICHT "Erläutern" erwarten! Jeder Operator hat eine klar definierte Erwartung.
- AFB-Verteilung: ca. 25% AFB I, 55% AFB II, 20% AFB III
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- ${KEINE_LOESUNGSHINWEISE}
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG:
- LaTeX $...$ NUR für mathematische Formeln: $Aa$, $\\frac{1}{4}$, $F_1$, $p^2 + 2pq + q^2 = 1$
- Summenformeln als Unicode-Text (KEIN LaTeX): CO₂, ATP, NADH, H₂O, O₂, C₆H₁₂O₆
- Einheiten IMMER als Unicode-Text (KEIN LaTeX): 20°C, 37°C, µmol, mol/l, m², s⁻¹, mV, kJ, kPa, mg/l
- VERBOTEN in Aufgabentexten: $\\mathrm{}$, $\\mu$, $\\circ$, $^{\\circ}$ für Einheiten — stattdessen Unicode: °, µ, ², ⁻¹
- In Markdown-Tabellen IMMER Unicode: °C, µmol/m²/s, kPa, mg/l — NIEMALS LaTeX in Tabellenspalten!

TABELLEN-FORMATIERUNG IN MATERIALIEN:
- In Tabellenzellen KEINE LaTeX-Notation für einfache Zahlenwerte!
  RICHTIG: | 0,10 | 0,50 | +0,34 | 25 °C | 3,6 kJ/mol |
  FALSCH:  | $0{,}10$ | $0{,}50$ | $+0{,}34$ | $25\\,°\\text{C}$ |
- LaTeX ($...$) in Tabellen NUR für Fachformeln: $E^0$, $\\Delta H$, $\\ce{Fe^{3+}}$
- Einfache Einheiten als Text: mol/L, kJ/mol, °C, V, g (NICHT als $\\text{mol/L}$)

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter), KEIN Platzhalter. NICHT für Stammbäume oder Kreuzungsschemata!
- "bild" → "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Korrekt geschriebene deutsche Beschriftungen (Bezeichnungen, Achsen, Pfeile) dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte (Zahlen gehören in Tabellen). "bild_labels" optional als Fallback. NICHT für Stammbäume!
- "stammbaum" → Für Stammbäume/Erbgänge/Pedigrees. MUSS ein Feld "stammbaum_data" als Objekt haben. Format:
  "stammbaum_data": {
    "generationen": [
      {
        "personen": [{"geschlecht": "m"|"w", "betroffen": true|false, "konduktorin": true|false}],
        "verbindungen": [[0, 1]]
      }
    ],
    "eltern_kind": [
      {"eltern_gen": 0, "verbindung": 0, "kinder": [0, 2]}
    ]
  }
  REGELN für stammbaum_data:
  - "generationen" = Array der Generationen (Index 0 = älteste). Jede Generation hat "personen" (Array) und "verbindungen" (Paare als Index-Tupel).
  - In "personen": "geschlecht" = "m" (Quadrat) oder "w" (Kreis). "betroffen" = true wenn erkrankt (Symbol ausgefüllt). "konduktorin" = true wenn Überträgerin.
  - "verbindungen" = Paare innerhalb einer Generation. Z.B. [[0,1]] bedeutet Person 0 und Person 1 sind ein Paar. Partner MÜSSEN nebeneinander stehen (aufeinanderfolgende Indizes).
  - "eltern_kind": Verknüpft Elternpaare mit ihren Kindern in der NÄCHSTEN Generation. "eltern_gen" = Generationsindex der Eltern, "verbindung" = Index in generationen[eltern_gen].verbindungen, "kinder" = Array der Kinder-Indizes in generationen[eltern_gen + 1] (NUR biologische Kinder, KEINE eingeheirateten Partner).
  - Eingeheiratete Partner werden in der Personen-Liste aufgeführt und über "verbindungen" mit ihrem Partner verknüpft, aber NICHT in "kinder" aufgelistet.
  - Der Stammbaum MUSS biologisch korrekt zum gewählten Erbgang passen (autosomal-dominant, autosomal-rezessiv, X-chromosomal-rezessiv etc.).
  - Mindestens 3 Generationen mit insgesamt mindestens 8 Personen.
KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Organismus/Experiment>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild|stammbaum>", "text": "<ECHTER Inhalt>"}
  ]
}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Mathematische Formeln in LaTeX ($...$). Einheiten und Summenformeln als Unicode-Text (°C, µmol, CO₂, m⁻²).

REFERENZBEISPIEL (Orientiere dich an diesem Qualitätsniveau):
{
  "aufgabe": "In einem Ökologiepraktikum untersucht eine Schülergruppe die Fotosyntheseleistung der Wasserpflanze Elodea canadensis bei verschiedenen Temperaturen. Sie messen die Sauerstoffentwicklung über jeweils 10 Minuten.",
  "teilaufgaben": [
    {"id": "a)", "text": "Beschreiben Sie den im Material M1 dargestellten Zusammenhang zwischen Temperatur und Sauerstoffentwicklung.", "be": 4},
    {"id": "b)", "text": "Erläutern Sie unter Verwendung des Enzymbegriffs die Veränderung der Fotosyntheserate oberhalb von 35°C.", "be": 6},
    {"id": "c)", "text": "Beurteilen Sie, ob der Versuchsaufbau geeignet ist, um ausschließlich den Einfluss der Temperatur auf die Fotosynthese nachzuweisen.", "be": 5}
  ],
  "gesamt_be": 15,
  "sachgebiet": "stoffwechsel",
  "material": [
    {"id": "M1", "titel": "Sauerstoffentwicklung von Elodea bei verschiedenen Temperaturen", "type": "diagramm", "chart_type": "line", "text": "| Temperatur (°C) | O₂-Entwicklung (µmol/h) |\\n|---|---|\\n| 5 | 12 |\\n| 10 | 28 |\\n| 15 | 45 |\\n| 20 | 68 |\\n| 25 | 89 |\\n| 30 | 105 |\\n| 35 | 118 |\\n| 40 | 95 |\\n| 45 | 41 |"}
  ]
}`;

  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 12000, { model: "gpt-5.2", temperature: 0.7 });
  } catch (e) {
    const detail = (e.name === "AbortError") ? "Zeitüberschreitung (>25s)" : (e.message || "unbekannt");
    console.error("generate-bio error:", detail);
    return jsonResponse({ error: "Bio-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-bio JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, sgInfo.title);
  }

  return jsonResponse(content, 200, env);
}

/* ================= BIO: GRADE ================= */
export async function handleGradeBio(request, env) {
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

  const rubricPrompt = `Du bewertest eine Biologie-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, wissenschaftliche Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung biologischer Zusammenhänge, Materialauswertung
- Berücksichtige die Operatoren-Anforderung (AFB I/II/III) jeder Teilaufgabe:
  • AFB I ("Nennen/Angeben" = nur aufzählen OHNE Erklärung; "Beschreiben" = in eigenen Worten wiedergeben; "Darstellen" = strukturiert wiedergeben)
  • AFB II ("Erklären" = auf Grundlage von Regeln/Gesetzmäßigkeiten darlegen; "Erläutern" = MIT zusätzlichen Infos/Analogien verständlich machen; "Vergleichen" = Gemeinsamkeiten UND Unterschiede; "Analysieren" = aus Material Zusammenhänge herausarbeiten; "Auswerten" = Daten in Zusammenhang bringen; "Begründen" = Argumente nachvollziehbar angeben)
  • AFB III ("Beurteilen" = fachlich begründete Einschätzung = Sachurteil; "Bewerten" = eigene Position mit fachlichen UND gesellschaftlichen Kriterien = Werturteil; "Diskutieren" = Positionen gegenüberstellen und abwägen)
- KRITISCH: Bewerte NUR das, was der jeweilige Operator verlangt! Wenn "Nennen Sie" steht, reicht eine korrekte Aufzählung — verlange KEINE Erläuterung oder Begründung dafür. Umgekehrt fehlen bei AFB-III-Aufgaben Punkte, wenn nur Fakten wiedergegeben werden.
- Korrekte Fachsprache (z.B. "homozygot" statt "reinerbig") wird positiv bewertet
- Korrekte Anwendung biologischer Konzepte und Modelle
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text und LaTeX-Notation. Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Biologie-typische Darstellungsformen sind erwünscht: Stammbäume, Kreuzungsschemata, Diagramme, Tabellen, Skizzen, Formeln
- Stichpunkte bei Aufzählungen, Vergleichen und Beschreibungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für biologische Formeln und Notation.
LATEX-REGELN: Brüche $\\frac{a}{b}$, Dezimalkomma $3{,}6$ statt $3.6$.
BIOLOGIE-REGELN: Genotypen $Aa$, Phänotypenverhältnisse $3:1$, Fachbegriffe korrekt verwenden.

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

  const bilderHinweisBio = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisBio + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n${studentSolutionText}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { model: "gpt-5.2", temperature: 0.3 });

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

/* ================= BIO: MODEL ANSWER ================= */
export async function handleModelAnswerBio(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Biologie-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für Formeln und biologische Notation: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung der Mendelschen Regeln")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG:
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

BIOLOGIE-SPEZIFISCHE REGELN:
- Genotypen: $Aa$, $BB$, $X^a X^A$
- Kreuzungsschemata klar darstellen
- Phänotypenverhältnisse: $3:1$, $9:3:3:1$
- Fachbegriffe korrekt verwenden (homozygot, heterozygot, Allel, dominant, rezessiv)
- Chemische Summenformeln: CO₂, H₂O, ATP, NADPH, O₂
- Biologische Prozesse Schritt für Schritt erklären (z.B. Transkription, Translation)
- Ökologische Modelle und Kurven beschreiben`;

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
  ], 6000, { model: "gpt-5.2", temperature: 0.4, jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= BIO: PARSE TASK ================= */
export async function handleParseTaskBio(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Biologie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme, Tabellen, Stammbäume und Teilaufgaben. Verwende LaTeX-Notation für Formeln und biologische Notation ($...$, $$...$$). BIOLOGIE-REGELN: Genotypen $Aa$, Phänotypenverhältnisse $3:1$, Fachbegriffe korrekt. LATEX-REGELN: \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= SPORT: GENERATE ================= */

export async function handleGenerateAbiturBiologie(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Biologie-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Biologie-Abiturprüfung nach dem IQB-Aufgabenformat.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

IQB-REFERENZFORMAT (orientiere dich strikt an IQB-Beispielaufgaben wie Daphnien, Wolf, Anolis):
- Jede Aufgabengruppe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. konkrete Organismen, ökologische Phänomene, Forschungsergebnisse) — KEINE abstrakten Lehrbuchtexte
- Pro Aufgabengruppe 4-5 Teilaufgaben bei 30 BE, aufeinander aufbauend ("scaffolded complexity"):
  • Teilaufgabe 1: Grundwissen/Definition (5-6 BE, AFB I)
  • Teilaufgabe 2: Beschreibung + Interpretation von Daten (7-8 BE, AFB II)
  • Teilaufgabe 3: Analyse oder Vergleich (5-10 BE, AFB II/III)
  • Teilaufgabe 4: Synthese, Modellkritik oder ethische Bewertung (6-8 BE, AFB III)
  • Optional Teilaufgabe 5: Umfassende Beurteilung (6 BE, AFB III)
- Materialien M1-M4 pro Aufgabengruppe, progressiv aufgebaut:
  • M1: Grundlegende Sachinformation/Kontext (Text, Karte, Bild)
  • M2: Detailliertere Daten/Evidenz (Text + Diagramm/Abbildung mit konkreten Messwerten)
  • M3: Forschungsergebnisse, Versuchsdaten, Graphen mit Datenpunkten
  • M4: Kontroverse Perspektiven, Zeitungsartikel, ethische Dimension
- Materialien mischen: quantitative Daten (Diagramme, Tabellen, Messwerte) UND qualitative Quellen (Fachtexte, Fotos, Karten)
- AFB-Verteilung: ca. 25% AFB I, 55% AFB II, 20% AFB III
- Operatoren gezielt einsetzen:
  • AFB I: "Geben Sie an", "Beschreiben Sie", "Nennen Sie"
  • AFB II: "Erläutern Sie", "Interpretieren Sie", "Erklären Sie", "Vergleichen Sie"
  • AFB III: "Bewerten Sie", "Beurteilen Sie", "Diskutieren Sie"
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIETE (wähle 4 verschiedene aus diesen 6, Lehrplan G9 Bayern ab 2026):
1. Genetik & Gentechnik (B12 LB1): Aufbau und Struktur der DNA (Doppelhelix, Basenpaarung, antiparallele Stränge). Semikonservative Replikation. Proteinbiosynthese: Transkription, RNA-Processing (Spleißen), Translation am Ribosom, genetischer Code (Codon, Anticodon, Redundanz). Genregulation bei Prokaryoten (Operon-Modell) und Eukaryoten (Transkriptionsfaktoren, Enhancer, Methylierung). Genmutationen (Punkt-, Rastermutationen), Mutagene, Reparaturmechanismen. Chromosomenmutationen und Genommutationen. Klassische Genetik: Mendel-Regeln (Uniformität, Spaltung, Unabhängigkeit), Rückkreuzung, Dihybrider Erbgang, Kopplung und Rekombination. Humangenetik: Stammbaumanalyse (autosomal/gonosomal, dominant/rezessiv). Gentechnik: Restriktionsenzyme, Vektoren, PCR, Gelelektrophorese, genetischer Fingerabdruck, Klonierung, CRISPR-Cas. Bioethische Bewertung gentechnischer Verfahren.
2. Neurobiologie (B12 LB2): Bau und Funktion von Nervenzellen (Soma, Axon, Dendriten, Myelinscheide, Ranvier-Schnürringe). Ruhepotential (Natrium-Kalium-Pumpe, Kalium-Leckkanäle, Nernst-Gleichung). Aktionspotential (Depolarisation, Repolarisation, Hyperpolarisation, Refraktärzeit, Alles-oder-Nichts-Prinzip). Erregungsleitung: kontinuierlich und saltatorisch, Geschwindigkeit. Synapse: erregende und hemmende postsynaptische Potentiale (EPSP, IPSP), räumliche und zeitliche Summation. Verrechnung an Nervenzellen. Neuroaktive Substanzen und Synapsengifte (Wirkungsmechanismen). Sinnesphysiologie: Bau des Auges, Fotorezeptoren (Stäbchen, Zapfen), Signaltransduktion. Informationsverarbeitung im ZNS, Reflexbogen.
3. Stoffwechselphysiologie (B12 LB3): Enzyme: Aufbau (Proteine, aktives Zentrum), Substrat- und Wirkungsspezifität, Schlüssel-Schloss-Prinzip und Induced-Fit-Modell. Abhängigkeit der Enzymaktivität von Temperatur, pH-Wert und Substratkonzentration. Enzymhemmung (kompetitiv, nicht-kompetitiv, allosterisch), Regulation. Energetik: ATP als universeller Energieträger, exergonische/endergonische Reaktionen, Redoxreaktionen, Elektronentransportketten. Zellatmung: Glykolyse, oxidative Decarboxylierung, Citratzyklus, Atmungskette (Chemiosmose, ATP-Synthase), Energiebilanz. Gärung (alkoholische Gärung, Milchsäuregärung). Photosynthese: Lichtreaktion (Fotosystem I und II, Elektronentransportkette, Fotophosphorylierung), Calvin-Zyklus (CO₂-Fixierung, Reduktion, Regeneration). Abhängigkeit der Fotosyntheserate von Lichtintensität, CO₂-Konzentration, Temperatur. C4- und CAM-Pflanzen.
4. Ökologie & Biodiversität (B12 LB4): Abiotische und biotische Umweltfaktoren. Ökologische Potenz, Toleranzkurve, Minimum-Gesetz, stenök/euryök. Populationsökologie: Wachstumsmodelle (exponentiell, logistisch), Kapazitätsgrenze K, r- und K-Strategen. Intra- und interspezifische Konkurrenz, Konkurrenzvermeidung, ökologische Nische (Fundamental- vs. Realnische). Räuber-Beute-Beziehungen (Lotka-Volterra-Regeln). Symbiose, Parasitismus, Kommensalismus. Ökosystem See/Wald: Trophieebenen, Nahrungsketten/-netze, Energiefluss, Stoffkreisläufe (C, N). Sukzession, Klimaxgesellschaft. Biodiversität: Artenschutz, nachhaltige Nutzung, Biodiversitätsverlust.
5. Evolution (B13 LB1): Evolutionstheorien (Darwin, Lamarck, synthetische Evolutionstheorie). Evolutionsfaktoren: Mutation, Rekombination, Selektion (gerichtet, stabilisierend, disruptiv), Gendrift (Flaschenhalseffekt, Gründereffekt), Genfluss, Isolation. Artbegriffe (biologischer, morphologischer Artbegriff). Artbildung: allopatrisch, sympatrisch, adaptive Radiation. Homologie und Analogie, Rudimente, Atavismen. Molekulare Phylogenetik: DNA-Sequenzvergleich, molekulare Uhr. Stammbaum-Analyse (Kladogramm, Synapomorphien). Koevolution. Humanevolution: fossile Funde, Merkmalsvergleich Menschenaffen/Mensch, kulturelle Evolution, Out-of-Africa-Hypothese.
6. Verhaltensökologie (B13 LB2): Verhalten als Anpassung (Proximate und ultimate Ursachen). Verhaltensökologie: Kosten-Nutzen-Analyse von Verhaltensweisen. Fitness (direkte und indirekte Fitness, Gesamtfitness/Inclusive Fitness). Fortpflanzungsstrategien: sexuelle Selektion (intra- und intersexuell), Partnerwahl, Brutpflege. Altruismus und Verwandtenselektion (Hamilton-Regel: rB > C). Kooperation: reziproker Altruismus, Tit-for-Tat. Sozialverhalten: Gruppenbildung (Vor- und Nachteile), Dominanzhierarchien. Kommunikation im Tierreich (optisch, akustisch, chemisch, taktil). Konflikte: Eltern-Kind-Konflikt, Geschwisterkonkurrenz.

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Genetischer Fingerabdruck")
- Ein Sachgebiet
- MINDESTENS 2-3 Materialien (M1, M2, M3, ...) pro Aufgabengruppe!
- 4-8 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern. Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.
- Gesamt: ${beProAufgabe} BE

MATERIALIEN — VIELFÄLTIG UND DATENREICH:
Jede Aufgabengruppe MUSS mindestens 2-3 verschiedene Materialtypen enthalten.
Jedes Material hat ein "type"-Feld:

- **"statistik"** — Datentabellen mit konkreten Zahlenwerten (Messwerte, Versuchsergebnisse). "text" MUSS eine Markdown-Tabelle mit echten Zahlenwerten sein. "chart_type": "bar". Beispiel:
  | Temperatur (°C) | Aktivität (U/ml) |
  |---|---|
  | 20 | 45 |
  | 30 | 78 |
  | 40 | 120 |

- **"diagramm"** — Kurvenverläufe mit x/y-Datenpunkten (Membranpotential über Zeit, Enzymaktivität vs. Temperatur, Populationswachstum, Fotosyntheserate). "text" MUSS eine Markdown-Tabelle mit echten Zahlenwerten sein. Achsenbeschriftungen als Tabellen-Header. "chart_type": "line". Beispiel:
  | Zeit (ms) | Potential (mV) |
  |---|---|
  | 0 | -70 |
  | 1 | +30 |
  | 2 | -80 |

- **"bild"** — Schaubilder/Diagramme werden GENERIERT. Geeignet für: Schematische Darstellungen, Zelldiagramme, Stoffwechselwege, Gelelektrophorese-Ergebnisse, STAMMBÄUME (Erbgänge), Kreuzungsschemata. "text" MUSS ein ausführlicher Bildprompt KOMPLETT auf Englisch sein (mind. 3-5 Sätze) mit Layout, Farben, Stil und allen visuellen Details. Korrekt geschriebene deutsche Beschriftungen (Bezeichnungen, Achsen, Pfeile) dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte (Zahlen gehören in Tabellen). "bild_labels" optional als Fallback. KEIN chart_type. WICHTIG: Bilder NIEMALS als Text beschreiben — IMMER type "bild" oder "foto" verwenden! STAMMBÄUME MÜSSEN IMMER als type "bild" generiert werden — NIEMALS als Text!

- **"foto"** — Realistische Fotos. Geeignet für: Mikroskopaufnahmen, Laboraufbauten, Ökosysteme, Organismen, Pflanzen, Tiere, Versuchsaufbauten, Biotope. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.

- **"text"** — Textquellen, Versuchsbeschreibungen, Fachtexte, Forschungsergebnisse. "text" enthält den Fließtext. KEIN chart_type. NIEMALS Bilder oder visuelle Materialien als Textbeschreibung — dafür type "bild" oder "foto" verwenden! STAMMBÄUME und Kreuzungsschemata sind KEINE Texte — diese IMMER als type "bild" generieren!

WICHTIG:
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben ("statistik", "diagramm", "bild" oder "text"). Materialien OHNE type-Feld werden nicht korrekt dargestellt!
- KRITISCH: Für "statistik" und "diagramm": "text" MUSS eine Markdown-Tabelle sein (mit | ... | Syntax und echten Zahlenwerten). KEINE Textbeschreibungen von Diagrammen — stattdessen die Datenpunkte als Tabelle!
- KRITISCH: Für "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt. Korrekt geschriebene deutsche Beschriftungen dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte. "bild_labels" als Objekt MUSS mitgeliefert werden. KEINE kurzen Stichworte — KEINE 2-4 Wort Keywords!
- VERBOTEN: Bilder, Fotos, Abbildungen, Schaubilder oder visuelle Materialien als Textbeschreibung in type "text" einbetten! Wenn ein Material visuell ist (Foto, Mikroskopaufnahme, Versuchsaufbau, Landschaft, Organismus), MUSS es type "bild" mit einem ausführlichen Imagen-Prompt sein. Texte wie "Die Abbildung zeigt..." oder "[Beschreibung eines Bildes]" sind NICHT erlaubt — stattdessen als type "bild" generieren!
- Pro Aufgabengruppe: MINDESTENS 1x "statistik" oder "diagramm" (mit Markdown-Tabelle + chart_type), PLUS mindestens 1x "bild" (mit Imagen-Prompt)
- LaTeX $...$ NUR für mathematische Formeln: $Aa$, $\\frac{dN}{dt}$, $p^2 + 2pq + q^2 = 1$
- Einheiten IMMER als Unicode-Text (KEIN LaTeX): 20°C, µmol, mol/l, m², s⁻¹, mV, kJ, mg/l
- Summenformeln als Unicode: CO₂, ATP, NADH, H₂O, O₂, C₆H₁₂O₆
- VERBOTEN: $\\mathrm{}$, $\\mu$, $\\circ$, $^{\\circ}$ für Einheiten — stattdessen Unicode: °, µ, ², ⁻¹
- In Markdown-Tabellen IMMER Unicode: °C, µmol/m²/s, kPa — NIEMALS LaTeX in Tabellen!
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- Materialien müssen realistisch, datenreich und aussagekräftig sein — KEINE leeren Platzhalter!
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen oder Konzepte verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger Vertiefung, keine über den gA-Lehrplan hinausgehenden Themen, zugänglichere Materialien und Aufgabenstellungen.` : ""}
- Teilaufgaben sollen sich DIREKT auf die Materialien beziehen ("Werte M1 aus", "Beschreibe den in M2 dargestellten Verlauf")
- AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!

BIOLOGIE-SPEZIFISCHE NOTATION:
- Genotypen: $Aa \\times aa$, $F_1$, $F_2$ (LaTeX für math. Formeln)
- Stoffwechsel: ATP, NADH, CO₂, C₆H₁₂O₆, H₂O, O₂ (Unicode, KEIN LaTeX)
- Einheiten: 20°C, µmol/m²/s, mV, kJ/mol, mg/l, kPa (Unicode, KEIN LaTeX)
- Populationsökologie: $\\frac{dN}{dt} = r \\cdot N$, $K$ (Kapazität), $N(t)$
- Neurobiologie: Membranpotential in mV, Ionenkonzentrationen in mmol/l
- Evolution: Allelfrequenzen $p$, $q$, Hardy-Weinberg: $p^2 + 2pq + q^2 = 1$
- VERBOTEN: $\\mathrm{}$, $\\mu$, $^{\\circ}$, $\\text{°C}$ für Einheiten — immer Unicode!

KEINE GeoGebra-Visualisierung.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, ANDEREN Materialien und ANDEREN Teilaufgaben — kopiere NICHT die Beispiele!
MINDESTENS 4 Teilaufgaben pro Aufgabengruppe, mit steigendem Anforderungsniveau (AFB I → II → III).

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Einfluss der Temperatur auf die Fotosyntheserate",
      "sachgebiet": "stoffwechsel",
      "material": [
        {"id": "M1", "titel": "Messergebnisse zur Fotosyntheserate", "type": "statistik", "text": "| Temperatur (°C) | O₂-Entwicklung (µmol/h) |\\n|---|---|\\n| 5 | EIGENER WERT |\\n| 10 | EIGENER WERT |\\n| 15 | EIGENER WERT |\\n| 20 | EIGENER WERT |\\n| 25 | EIGENER WERT |\\n| 30 | EIGENER WERT |\\n| 35 | EIGENER WERT |\\n| 40 | EIGENER WERT |", "chart_type": "bar"},
        {"id": "M2", "titel": "Zeitlicher Verlauf der O₂-Entwicklung bei 25 °C", "type": "diagramm", "text": "| Zeit (min) | O₂-Konzentration (µmol/l) |\\n|---|---|\\n| 0 | EIGENER WERT |\\n| 5 | EIGENER WERT |\\n| 10 | EIGENER WERT |\\n| 15 | EIGENER WERT |\\n| 20 | EIGENER WERT |\\n| 25 | EIGENER WERT |\\n| 30 | EIGENER WERT |", "chart_type": "line"},
        {"id": "M3", "titel": "Forschungstext zur Temperaturabhängigkeit", "type": "text", "text": "EIGENER vollständig ausformulierter Fachtext (mind. 150–300 Wörter) über den Zusammenhang zwischen Temperatur, Enzymaktivität und Fotosyntheserate. Der Text muss konkrete Fachbegriffe enthalten und auf Forschungsergebnisse Bezug nehmen."}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Beschreiben Sie die in M1 dargestellten Messergebnisse und benennen Sie den Temperaturbereich des Optimums.", "be": 5},
        {"id": "1.2", "text": "Erklären Sie mithilfe von M2 und M3 den Kurvenverlauf der O₂-Entwicklung unter Berücksichtigung der Enzymkinetik.", "be": 8},
        {"id": "1.3", "text": "Erläutern Sie, warum die Fotosyntheserate oberhalb des Temperaturoptimums stark absinkt. Gehen Sie dabei auf molekulare Vorgänge ein.", "be": 8},
        {"id": "1.4", "text": "Beurteilen Sie die Bedeutung der RGT-Regel für die Vorhersage der Fotosyntheserate bei Kulturpflanzen im Kontext des Klimawandels.", "be": 9}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Erbgang einer Stoffwechselerkrankung",
      "sachgebiet": "genetik",
      "material": [
        {"id": "M1", "titel": "Stammbaum einer betroffenen Familie", "type": "bild", "text": "Clean scientific pedigree chart showing a family tree across three generations (I, II, III) for a genetic disorder. Generation I at top with one couple, Generation II in middle with 4-5 individuals including marriages, Generation III at bottom with 6-8 individuals. Use standard genetics symbols: squares for males, circles for females, filled shapes for affected individuals, half-filled for carriers. Horizontal lines connect couples, vertical lines connect to offspring. Each individual labeled only with a NUMBER (1, 2, 3...). White background, black lines, affected individuals filled in dark blue. Clean, professional medical genetics style.", "bild_labels": {"1": "Generation I – Großvater", "2": "Generation I – Großmutter", "3": "Generation II – Vater (betroffen)", "4": "Generation II – Mutter", "5": "Generation II – Tante", "6": "Generation II – Onkel (betroffen)", "7": "Generation III – Kind 1", "8": "Generation III – Kind 2 (betroffen)", "9": "Generation III – Kind 3", "10": "Generation III – Cousin"}},
        {"id": "M2", "titel": "Gelelektrophorese-Ergebnisse", "type": "bild", "text": "Scientific laboratory photograph showing a gel electrophoresis result under UV light. A horizontal agarose gel glows blue-green with 6 clearly labeled lanes showing distinct DNA band patterns at different molecular weights. Lane labels read 'Marker', 'Person 1', 'Person 2', 'Person 3', 'Person 4', 'Kontrolle' in small white text. Title 'Ergebnisse der Gelelektrophorese' centered at top in bold white font. Dark laboratory background."},
        {"id": "M3", "titel": "Bandenmuster und Restriktionsanalyse", "type": "text", "text": "EIGENE vollständige Beschreibung der Bandenmuster (mind. 100 Wörter): Für jede Spur die genauen Bandengrößen in bp angeben und Bezug zum RFLP-Muster nehmen."}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Ermitteln Sie anhand des Stammbaums in M1 den zugrunde liegenden Erbgang. Begründen Sie Ihre Entscheidung.", "be": 6},
        {"id": "2.2", "text": "Bestimmen Sie die Genotypen aller Personen im Stammbaum. Verwenden Sie geeignete Symbole.", "be": 6},
        {"id": "2.3", "text": "Werten Sie die Gelelektrophorese-Ergebnisse (M2, M3) aus und ordnen Sie die Bandenmuster den Genotypen der Familienmitglieder zu.", "be": 8},
        {"id": "2.4", "text": "Berechnen Sie die Wahrscheinlichkeit, dass ein weiteres Kind des Paares aus Generation II von der Erkrankung betroffen ist.", "be": 5},
        {"id": "2.5", "text": "Erörtern Sie Chancen und Grenzen der genetischen Diagnostik mittels RFLP-Analyse am Beispiel der dargestellten Erkrankung.", "be": 5}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen — anderes Sachgebiet als Aufgabe 1 und 2",
      "sachgebiet": "EIGENES Sachgebiet wählen (z.B. neurobiologie, oekologie, evolution, verhaltensbiologie)",
      "material": ["EIGENE Materialien generieren: mind. 1x statistik/diagramm + 1x text, optional 1x bild. Alle Zahlenwerte, Texte und Imagen-Prompts SELBST erstellen!"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4–6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE). Jede Teilaufgabe mit konkretem Operator und BE-Angabe."],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen — anderes Sachgebiet als Aufgabe 1, 2 und 3",
      "sachgebiet": "EIGENES Sachgebiet wählen (keines der bereits verwendeten!)",
      "material": ["EIGENE Materialien generieren: mind. 1x statistik/diagramm + 1x text, optional 1x bild. Alle Zahlenwerte, Texte und Imagen-Prompts SELBST erstellen!"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 4–6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE). Jede Teilaufgabe mit konkretem Operator und BE-Angabe."],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}`;

  const userPrompt = `Erstelle eine vollständige Biologie-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}
KRITISCH: Mathematische Formeln in LaTeX ($...$). Einheiten und Summenformeln als Unicode-Text (°C, µmol, CO₂, m⁻²).
KRITISCH: Jedes Material MUSS ein "type"-Feld haben! Verwende die 4 Typen:
- "statistik" (type + chart_type "bar"): "text" = VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Zahlenwerten (mind. 4-6 Datenzeilen)
- "diagramm" (type + chart_type "line"): "text" = VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte)
- "bild" (type): "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Korrekt geschriebene deutsche Beschriftungen (Bezeichnungen, Achsen, Pfeile) dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte (Zahlen gehören in Tabellen). "bild_labels" optional als Fallback
- "foto" (type): "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto von Mikroskopaufnahmen, Organismen, Ökosystemen, Laboraufbauten, Pflanzen, Tieren. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- "text" (type): "text" = VOLLSTÄNDIGER AUSFORMULIERTER Fachtext (mind. 150-300 Wörter)
ABSOLUT VERBOTEN: Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." — das "text"-Feld MUSS den TATSÄCHLICHEN Inhalt enthalten!
Pro Aufgabengruppe: mindestens 1x statistik/diagramm + 1x text. Optional 1x bild.`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000, { model: "gpt-5.2", temperature: 0.7 });

  const content = extractJSON(openaiRes);
  enrichBioMaterials(content);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgaben = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgaben) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Biologie");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= BIOLOGIE: MATERIAL POST-PROCESSING ================= */
export function enrichBioMaterials(data) {
  const sachgebietImages = {
    genetik: "A detailed scientific photograph of a gel electrophoresis result under UV light. The agarose gel glows blue-green and shows 6 clearly separated lanes with distinct DNA band patterns at different molecular weights. Lane labels at the top read 'Marker', 'Probe 1', 'Probe 2', 'Probe 3', 'Kontrolle+', 'Kontrolle-' in small white text. A title 'Ergebnisse der Gelelektrophorese' is centered at the top in bold white font. Dark laboratory background with the UV transilluminator as main light source.",
    gentechnik: "A high-resolution photograph of a modern molecular biology laboratory workbench. In the center, a PCR thermocycler with its lid open showing sample tubes. Surrounding equipment includes micropipettes, a centrifuge, and Eppendorf tubes in a rack. A lab notebook with handwritten notes is visible. Clean, well-lit laboratory environment with white surfaces and organized equipment. Title 'PCR-Arbeitsplatz im Labor' in bold text at the top center.",
    neurobiologie: "A detailed fluorescence microscopy image of neurons in vibrant green and blue colors against a dark background. Multiple neurons are visible with clearly defined cell bodies (soma), long axons, and branching dendrites. Synaptic connections between neurons glow brightly. A scale bar labeled '50 µm' appears in the bottom right corner. Title 'Fluoreszenzmikroskopie: Neuronales Netzwerk' centered at the top in white bold text.",
    stoffwechsel: "A professional scientific illustration showing enzyme activity in a laboratory setting. A clear test tube rack with colorful solutions in graduated cylinders showing different reaction stages from light yellow to deep orange. A digital thermometer displays '37.0°C'. Clean white laboratory background with professional lighting. Title 'Enzymaktivität im Laborversuch' centered at the top in bold dark text.",
    stoffwechselphysiologie: "A professional scientific illustration showing enzyme activity in a laboratory setting. A clear test tube rack with colorful solutions in graduated cylinders showing different reaction stages from light yellow to deep orange. A digital thermometer displays '37.0°C'. Clean white laboratory background with professional lighting. Title 'Enzymaktivität im Laborversuch' centered at the top in bold dark text.",
    oekologie: "An aerial photograph of a diverse temperate forest ecosystem showing different vegetation zones. A meandering river runs through the landscape, with deciduous trees in various shades of green on one side and coniferous forest on the other. A meadow with wildflowers borders the river. Clear blue sky with scattered clouds. Title 'Ökosystem: Auenlandschaft' centered at the top in bold white text with a slight shadow for readability.",
    "ökologie": "An aerial photograph of a diverse temperate forest ecosystem showing different vegetation zones. A meandering river runs through the landscape, with deciduous trees in various shades of green on one side and coniferous forest on the other. A meadow with wildflowers borders the river. Clear blue sky with scattered clouds. Title 'Ökosystem: Auenlandschaft' centered at the top in bold white text with a slight shadow for readability.",
    evolution: "A museum display showing a series of hominid skulls arranged chronologically from left to right, demonstrating human evolution. Five skulls from Australopithecus to Homo sapiens are placed on a dark wooden shelf with small labels beneath each. Dramatic museum lighting highlights the bone details. Title 'Schädelvergleich: Evolution des Menschen' centered at the top in elegant white serif font.",
    verhaltensbiologie: "A professional wildlife photograph showing a group of European grey wolves in their natural habitat. Three wolves are visible in a forest clearing — one in an alert posture, one lying down, and one approaching with tail lowered, demonstrating social hierarchy behavior. Soft natural morning light filters through birch trees. Title 'Sozialverhalten bei Wölfen' centered at the top in bold white text.",
    "verhaltensökologie": "A professional wildlife photograph showing a group of European grey wolves in their natural habitat. Three wolves are visible in a forest clearing — one in an alert posture, one lying down, and one approaching with tail lowered, demonstrating social hierarchy behavior. Soft natural morning light filters through birch trees. Title 'Sozialverhalten bei Wölfen' centered at the top in bold white text."
  };

  const aufgaben = data.aufgaben || data.aufgabengruppen || [];
  aufgaben.forEach(a => {
    const mats = a.materialien || a.material || [];
    let hasBild = false;

    mats.forEach(m => {
      if (m.type === "bild") { hasBild = true; return; }
      if (m.type && m.chart_type) return; // already complete

      const text = (m.text || "").replace(/\\n/g, "\n");
      const tableLines = text.split("\n").filter(l => l.trim().startsWith("|") && l.trim().endsWith("|"));
      const dataLines = tableLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));

      if (dataLines.length >= 2) {
        const hdr = dataLines[0].toLowerCase();
        const isTime = /zeit|time|min\b|ms\b|sec|stunde|tag|hour|temperatur|temp\b|konzentration/.test(hdr);
        if (!m.type) m.type = isTime ? "diagramm" : "statistik";
        if (!m.chart_type) m.chart_type = isTime ? "line" : "bar";
      } else if (!m.type) {
        m.type = "text";
      }
    });

    // Add image material if none exists
    if (!hasBild) {
      const sg = (a.sachgebiet || "").toLowerCase().replace(/\s+/g, "");
      const keywords = sachgebietImages[sg] || "A professional scientific photograph of a modern biology laboratory. A high-quality microscope is centered on a clean white workbench, with prepared glass slides, Petri dishes with bacterial cultures, and a rack of test tubes nearby. Soft overhead LED lighting illuminates the workspace. Title 'Biologisches Labor' centered at the top in bold dark text.";
      mats.push({
        id: "M" + (mats.length + 1),
        titel: "Abbildung: " + (a.sachgebiet || "Biologie"),
        type: "bild",
        text: keywords
      });
    }

    // Ensure the material array is stored back
    if (a.material && Array.isArray(a.material)) a.material = mats;
    else if (a.materialien) a.materialien = mats;
    else a.material = mats;
  });
}

/* ================= BIOLOGIE ABITUR: GRADE ================= */
export async function handleGradeAbiturBiologie(request, env) {
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

  const rubricPrompt = `Du bewertest eine Biologie-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache (biologische Fachbegriffe), korrekte Verwendung von Fachkonzepten, Materialauswertung, logische Argumentation, Darstellungsleistung
- Berücksichtige die Operatoren-Anforderung (AFB I/II/III) jeder Teilaufgabe:
  • AFB I ("Nennen/Angeben" = nur aufzählen OHNE Erklärung; "Beschreiben" = in eigenen Worten wiedergeben; "Darstellen" = strukturiert wiedergeben)
  • AFB II ("Erklären" = auf Grundlage von Regeln/Gesetzmäßigkeiten darlegen; "Erläutern" = MIT zusätzlichen Infos/Analogien verständlich machen; "Vergleichen" = Gemeinsamkeiten UND Unterschiede; "Analysieren" = aus Material Zusammenhänge herausarbeiten; "Auswerten" = Daten in Zusammenhang bringen; "Begründen" = Argumente nachvollziehbar angeben)
  • AFB III ("Beurteilen" = fachlich begründete Einschätzung = Sachurteil; "Bewerten" = eigene Position mit fachlichen UND gesellschaftlichen Kriterien = Werturteil; "Diskutieren" = Positionen gegenüberstellen und abwägen)
- KRITISCH: Bewerte NUR das, was der jeweilige Operator verlangt! Wenn "Nennen Sie" steht, reicht eine korrekte Aufzählung — verlange KEINE Erläuterung oder Begründung dafür. Umgekehrt fehlen bei AFB-III-Aufgaben Punkte, wenn nur Fakten wiedergegeben werden.
- Korrekte Fachbegriffe und Zusammenhänge → volle Punkte
- Teilweise korrekte Antworten → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Fachsprache und LaTeX-Notation. Interpretiere beides großzügig.

ANTWORT-FORMAT:
- Biologie-typische Darstellungsformen sind erwünscht: Stammbäume, Kreuzungsschemata, Diagramme, Tabellen, Skizzen, Formeln
- Stichpunkte bei Aufzählungen, Vergleichen und Beschreibungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) im Feedback.

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

  const bilderHinweisAbiBio = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisAbiBio + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`AUFGABEN:\n${aufgabenInfo}\n\nSCHÜLERLÖSUNGEN:\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { model: "gpt-5.2", temperature: 0.3 });

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

/* ================= BIOLOGIE ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturBiologie(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Biologie-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für Formeln: $...$ für inline, $$...$$ für Display
- Verwende korrekte biologische Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- BIOLOGIE-NOTATION: Genotypen $Aa \\times aa$, Stoffwechsel $\\text{ATP}$, $\\text{CO}_2$, Populationsökologie $\\frac{dN}{dt}$
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
  ], 10000, { model: "gpt-5.2", temperature: 0.4, jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}
