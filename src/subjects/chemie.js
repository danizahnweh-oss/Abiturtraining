import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { gradeWithWolframVerification } from '../handlers/wolfram-grading.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis } from '../config.js';
import { repairPlaceholderMaterials } from './physik.js';

export async function handleGenerateChemie(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "elektrochemie";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    elektrochemie: {
      title: "Elektrochemie",
      inhalte: "C12 LB8: Redoxgleichgewichte, galvanische Zellen (Halbzellen, Leerlaufspannung, Optimierung), Standardwasserstoffhalbzelle, elektrochemische Spannungsreihe, Nernst-Gleichung (Konzentrationsabhängigkeit), Primärzellen (Zink-Luft, Brennstoffzelle), Entropie, Gibbs-Helmholtz-Gleichung, Elektrolyse. C13 LB5: Faraday-Gesetze, Zersetzungsspannung, Überpotential, Chlor-Alkali-Elektrolyse, Korrosion (Sauerstoff-/Säure-/Kontaktkorrosion), aktiver/passiver Korrosionsschutz, Sekundärzellen (Li-Ionen-Akku, Blei-Akku), Redox-Flow-Batterie, Elektromobilität"
    },
    gleichgewicht: {
      title: "Chemisches Gleichgewicht / Säure-Base",
      inhalte: "C12 LB7: Reversible Reaktion, dynamisches Gleichgewicht, Prinzip von Le Chatelier, Massenwirkungsgesetz (Kc), Löslichkeitsprodukt (KL), Haber-Bosch-Verfahren. C13 LB3: Säure-Base nach Brönsted, Autoprotolyse, Ionenprodukt des Wassers, pKs/pKb als Maß für Säure-/Basenstärke, pH-Berechnungen (starke/schwache Säuren/Basen, Näherungsformeln), Säure-Base-Titration (Titrationskurven, Äquivalenzpunkt, Halbtitration), Henderson-Hasselbalch-Gleichung, Puffersysteme (Acetat-, Carbonat-, Phosphat-Puffer), induktive/mesomere Effekte auf Säurestärke"
    },
    thermochemie: {
      title: "Thermochemie / Reaktionskinetik",
      inhalte: "C12 LB6: Reaktionsgeschwindigkeit (mittlere/momentane), Abhängigkeit von Konzentration, Temperatur (RGT-Regel), Druck, Zerteilungsgrad, Katalysator; Stoßtheorie (Maxwell-Boltzmann-Verteilung, Aktivierungsenergie), homogene/heterogene Katalyse. C12 LB5/LB8: Enthalpie, Standard-Reaktionsenthalpien, Satz von Hess, Kalorimetrie, Entropie (Verteilung von Energie/Teilchen), Gibbs-Helmholtz-Gleichung (ΔG = ΔH − TΔS), exergone/endergone Reaktionen"
    },
    organik: {
      title: "Organische Chemie",
      inhalte: "C12 LB5: Kohlenwasserstoffe (Alkane, Alkene, Aromaten), Erdöl/Erdgas/nachwachsende Rohstoffe, Reaktivität und Mechanismen: radikalische Substitution (Homolyse), elektrophile Addition (Heterolyse, SSS-/KKK-Regel), elektrophile aromatische Substitution, nukleophile Substitution; Benzol (Mesomerie, Delokalisierung), induktive/mesomere Effekte, Halogenkohlenwasserstoffe. C12 LB4: LCAO-Modell, Hybridisierung (sp³/sp²/sp), σ-/π-Bindungen, HOMO/LUMO"
    },
    kunststoffe: {
      title: "Kunststoffe",
      inhalte: "C13 LB4.2: Radikalische Polymerisation (Mechanismus: Start-/Kettenreaktion/Abbruch), Polykondensation (Polyester, Polyamid; bi-/trifunktionelle Monomere), Polyaddition (Polyurethan), Thermoplaste/Duroplaste/Elastomere (Struktur-Eigenschafts-Beziehungen), Copolymerisate, Silikone (anorganische Polymere, Nanotechnologie), elektrisch leitfähige Kunststoffe (konjugiertes π-System), OLED (Farbstoffe + leitende Polymere), Recycling (rohstofflich/werkstofflich/thermisch), biologisch abbaubare Kunststoffe"
    },
    spektroskopie: {
      title: "Analytik / Spektroskopie",
      inhalte: "C12 LB3: Qualitative Nachweisreaktionen (Ionen, funktionelle Gruppen: Fehling, Tollens, Schiff, Bromwasser), chromatographische Verfahren (DC, HPLC, GC; Rf-Wert, Retentionszeit), Redox-Titration (Manganometrie), komplexometrische Titration (EDTA, Wasserhärte), quantitative Fotometrie (Lambert-Beer-Gesetz, Kalibriergerade, Absorptionsmaximum)"
    },
    enzymkatalyse: {
      title: "Aminosäuren / Proteine / Enzymkatalyse",
      inhalte: "C13 LB4.1: 2-Aminocarbonsäuren (Ampholyt, Zwitter-Ion, isoelektrischer Punkt, Fischer-Projektion, Enantiomere), Peptidbindung (Kondensation, Mesomerie), Proteinstrukturen (Primär-/Sekundär-/Tertiär-/Quartärstruktur, Faserproteine/globuläre Proteine), Denaturierung (Hitze, pH, Schwermetalle), Enzyme: Substrat-/Wirkungsspezifität, Schlüssel-Schloss-Prinzip, Einflussfaktoren (Konzentration, Temperatur, pH), Nachweisreaktionen (Ninhydrin, Biuret, Xanthoprotein)"
    },
    farbstoffe: {
      title: "Farbigkeit und Farbstoffe",
      inhalte: "C13 LB2: Farbigkeit durch Lichtabsorption, Energiedifferenz HOMO/LUMO, konjugierte Doppelbindungen und Delokalisierung, Chromophor, auxochrome/antiauxochrome Gruppen, Absorptionsspektren; Azofarbstoffe (Diazotierung + Azokupplung), Triphenylmethanfarbstoffe (Kondensation); Farbstoff-Faser-Bindung (ionisch, Reaktivfarbstoffe, Direktfarbstoffe, Küpenfarbstoffe), Küpenfärbung mit Indigo, Funktionsprinzip von Indikatoren (Säure-Base, Redox)"
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.elektrochemie;

  const systemPrompt = `Du bist ein Chemie-Experte für das bayerische Abitur (gA/eA, G9, ab 2026).
Erstelle eine authentische Chemie-Aufgabe nach dem IQB-Aufgabenformat.

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

IQB-REFERENZFORMAT (orientiere dich an den IQB-Beispielaufgaben wie Taschenofen, Kaffeebecher, Adblue):
- Aufgabe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. Taschenofen, Kaffeebecher, Dieselabgase, Mineraldünger, PET-Recycling) — keine abstrakten Lehrbuchtexte
- 5-7 Teilaufgaben bei 30 BE, gemischte Aufgabentypen:
  • Berechnungen (Stöchiometrie, Thermochemie, Nernst, Faraday) mit konkreten Zahlenwerten
  • Erklärungen/Erläuterungen chemischer Phänomene
  • Reaktionsgleichungen aufstellen und erklären
  • Beurteilungen/Diskussionen (z.B. Umweltaspekte, Nachhaltigkeit)
- Materialien M1-M7: Texte, Tabellen mit Messdaten, Diagramme (Temperatur-Zeit, Energie), Schemata, Sicherheitshinweise
- AFB-Verteilung: ca. 30% AFB I, 50% AFB II, 20% AFB III
- Operatoren gezielt nach ISB-Definition einsetzen — der Operator bestimmt EXAKT, was erwartet wird. Verlange NICHT mehr als der Operator vorgibt!
  • AFB I (Reproduktion):
    - "Nennen/Angeben Sie" = Begriffe, Sachverhalte oder Daten OHNE weitere Erklärungen aufzählen
    - "Beschreiben Sie" = Sachverhalt in eigenen Worten unter Berücksichtigung der Fachsprache wiedergeben
    - "Skizzieren Sie" = Sachverhalte auf das Wesentliche reduzieren und grafisch darstellen
    - "Aufstellen/Formulieren Sie" = Chemische Formeln, Gleichungen, Reaktionsgleichungen darstellen
    - "Berechnen Sie" = Den Wert einer Größe mithilfe einer Rechnung finden
  • AFB II (Transfer):
    - "Erklären Sie" = Sachverhalt auf Grundlage von Regeln und Gesetzmäßigkeiten nachvollziehbar darlegen
    - "Erläutern Sie" = Sachverhalt verständlich darstellen MIT zusätzlichen Informationen, Skizzen oder Analogien; konkreter fachlicher Bezug
    - "Vergleichen Sie" = Gemeinsamkeiten UND Unterschiede herausarbeiten; passende Kriterien finden
    - "Analysieren Sie" = Aus Material wichtige Komponenten und Zusammenhänge auf eine Fragestellung hin herausarbeiten
    - "Auswerten" = Daten in einen Zusammenhang bringen und ggf. Gesamtaussage formulieren
    - "Begründen Sie" = Ursachen oder Argumente nachvollziehbar angeben
    - "Herleiten" = Auf Grundlage bekannter Gesetzmäßigkeiten Zusammenhang zwischen Größen herstellen
  • AFB III (Bewertung):
    - "Beurteilen Sie" = Fachlich begründete, selbstständige Einschätzung abgeben (Sachurteil)
    - "Bewerten Sie" = Eigene Position hinsichtlich fachlicher Kriterien UND gesellschaftlicher Werte vertreten (Werturteil)
    - "Diskutieren Sie" = Unterschiedliche Positionen gegenüberstellen und abwägen
  WICHTIG: Wenn ein Operator nur "Nennen" verlangt, darf NICHT "Erläutern" erwartet werden!
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIET: ${sgInfo.title}
Relevante Inhalte:
${sgInfo.inhalte}${schwerpunktZusatz}

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Gib bei jeder Teilaufgabe die BE an
- Die Aufgabe muss fachlich korrekt und eindeutig lösbar sein
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus dem oben angegebenen Lehrplan. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.

LATEX-FORMATIERUNG (schreibe echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

CHEMIE-SPEZIFISCHE LATEX-REGELN (mhchem-Erweiterung \\ce{}):
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- WICHTIG: Schreibe IMMER $\\ce{H3O+}$ (Oxonium-Ion), NIEMALS $\\ce{H+}$! Protonen liegen in wässriger Lösung als Oxonium-Ionen vor.
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Phasenindikatoren: $\\ce{(aq)}$, $\\ce{(g)}$, $\\ce{(l)}$, $\\ce{(s)}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$, $\\text{kJ/mol}$
- Gleichgewichtskonstante: $K_c$, $K_p$, $K_s$, $K_w$, $K_a$, $K_b$
- pH-Berechnungen: $\\text{pH} = -\\lg c(\\ce{H3O+})$
- Nernst-Gleichung: $E = E^\\circ + \\frac{R \\cdot T}{z \\cdot F} \\cdot \\ln Q$

TEMPERATUR-NOTATION:
- RICHTIG: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$
- FALSCH: $^\\circ\\ce{C}$ (\\ce{C} wird als Kohlenstoff interpretiert!)
- FALSCH: $\\vartheta$ (nicht in KaTeX verfügbar) — verwende stattdessen $\\theta$ oder $T$

KEINE GeoGebra-Visualisierung — Chemie verwendet kein GeoGebra.

STRUKTURFORMELN:
Bei Organik- und Kunststoffe-Aufgaben MUSST du ein "strukturformeln"-Array mit 2–4 relevanten Molekülen angeben.
Bei anderen Sachgebieten (Elektrochemie, Gleichgewicht, Thermochemie etc.) kannst du es weglassen.
Format: [{"name": "ethanol", "caption": "Ethanol (Edukt)"}, {"name": "acetic acid", "caption": "Essigsäure"}]
- "name": englischer chemischer Name (IUPAC oder Trivialname) für PubChem-Lookup
- "caption": deutsche Beschriftung für die Anzeige
- KEIN SMILES, KEIN InChI — nur englische Namen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgabe": "Aufgabentext mit LaTeX-Formeln (Kontext/Einleitung)",
  "teilaufgaben": [
    {"id": "a)", "text": "Teilaufgabe mit $LaTeX$/$\\\\ce{}$-Formeln", "be": 3},
    {"id": "b)", "text": "...", "be": 4}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [{"id": "M1", "titel": "...", "type": "statistik", "chart_type": "bar", "text": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Wert1 | Wert2 |"}],
  "strukturformeln": [{"name": "ethanol", "caption": "Ethanol"}, {"name": "acetic acid", "caption": "Essigsäure"}]
}

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN Zahlenwerten (mind. 4-6 Datenzeilen)
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit ECHTEN x/y-Datenpunkten (mind. 5-8 Messwerte)
- "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}
- "foto": Realistisches Foto. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Laboraufbauten, Versuchsapparaturen, Mikroskopaufnahmen, Organismen, Ökosysteme, Messgeräte, Naturphänomene. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
${totalBE >= 25 ? 'Pro Aufgabe: mindestens 1x statistik/diagramm + 1x text.' : totalBE >= 15 ? 'Maximal 1 Material pro Aufgabe.' : 'Keine Materialien bei dieser Aufgabengröße.'}
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
Hinweis: "strukturformeln" ist PFLICHT bei Organik/Kunststoffe, sonst optional.`;

  const organikHint = (sg === "organik" || sg === "kunststoffe" || sg === "farbstoffe") ? "\nWICHTIG: Gib unbedingt ein strukturformeln-Array mit 2–4 relevanten Molekülen an (englische Namen für PubChem)!" : "";
  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.
KRITISCH: Alle Formeln in LaTeX-Notation ($...$, $$...$$), chemische Formeln mit $\\ce{}$.${organikHint}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 6000);

  const content = extractJSON(openaiRes);

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, "Chemie");
  }

  return jsonResponse(content, 200, env);
}

/* ================= CHEMIE: GRADE ================= */
export async function handleGradeChemie(request, env) {
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

  // Build structured student solution text
  let studentSolutionText;
  if (student_texts && typeof student_texts === "object" && Object.keys(student_texts).length > 0) {
    // Per-Teilaufgabe format
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

  const rubricPrompt = `Du bewertest eine Chemie-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System (Bewertungseinheiten).

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, Reaktionsgleichungen, Mechanismen, quantitative Berechnungen, korrekte chemische Nomenklatur
- Berücksichtige die Operatoren-Anforderung (AFB I/II/III) jeder Teilaufgabe nach ISB-Definition:
  • AFB I ("Nennen/Angeben" = nur aufzählen; "Beschreiben" = wiedergeben; "Berechnen" = Rechnung; "Formulieren" = Gleichung aufstellen)
  • AFB II ("Erklären" = auf Regeln/Gesetze gestützt darlegen; "Erläutern" = MIT Zusatzinfos/Analogien; "Vergleichen" = Gemeinsamkeiten+Unterschiede; "Begründen" = Argumente angeben)
  • AFB III ("Beurteilen" = Sachurteil; "Bewerten" = Werturteil mit gesellschaftlichen Kriterien; "Diskutieren" = Positionen abwägen)
- KRITISCH: Bewerte NUR das, was der jeweilige Operator verlangt! "Nennen" = Aufzählung reicht, verlange KEINE Erläuterung!
- Ansatz korrekt aber Rechenfehler → trotzdem Teilpunkte für Ansatz
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Der Schüler schreibt in einer Mischung aus Plain-Text-Chemie (z.B. H2O, NaOH + HCl -> NaCl + H2O) und LaTeX-Notation ($\\ce{H2O}$, $\\frac{1}{2}$). Interpretiere beides großzügig.
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Chemie-typische Darstellungsformen sind erwünscht: Reaktionsgleichungen, Strukturformeln, Berechnungen, Tabellen, Skizzen
- Stichpunkte bei Rechenwegen, Reaktionsmechanismen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) in deinem Feedback für chemische und mathematische Ausdrücke.
LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$.
CHEMIE-REGELN: Verwende $\\ce{}$ für alle Reaktionsgleichungen und chemische Formeln. Schreibe IMMER $\\ce{H3O+}$ (Oxonium-Ion), NIEMALS $\\ce{H+}$!
TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$).

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung mit $LaTeX$/$\\\\ce{}$"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$/$\\\\ce{}$-Formeln, Stärken, Fehlern, korrekten Lösungswegen>"
}`;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweis + UEBUNGSAUFGABEN_ANWEISUNG },
    { role: "user", content: buildUserContent(`${aufgabenInfo}\n${studentSolutionText}`, images) }
  ];

  // Sandwich-Architektur: WolframAlpha-Verifikation bei Rechenaufgaben
  const openaiRes = await gradeWithWolframVerification(aufgabenInfo, studentSolutionText, images, sachgebiet || 'chemie', messages, env);

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

/* ================= CHEMIE: MODEL ANSWER ================= */
export async function handleModelAnswerChemie(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Chemie-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung der Nernst-Gleichung")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

LATEX-FORMATIERUNG (echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $\\cdot$ (NIEMALS $*$)
- Brüche: $\\frac{a}{b}$ (NICHT a/b)
- Dezimalkomma: $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\approx$

CHEMIE-SPEZIFISCHE LATEX-REGELN:
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- WICHTIG: Schreibe IMMER $\\ce{H3O+}$ (Oxonium-Ion), NIEMALS $\\ce{H+}$! Protonen liegen in wässriger Lösung als Oxonium-Ionen vor.
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$
- Gleichgewichtsreaktionen: $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$
- Temperatur: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$)`;

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
  ], 6000);

  return jsonResponse({ model_answer: answer }, 200, env);
}

/* ================= CHEMIE: PARSE TASK ================= */
export async function handleParseTaskChemie(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Chemie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Formeln, Reaktionsgleichungen, Strukturformeln und Teilaufgaben. Verwende LaTeX-Notation für Formeln ($...$, $$...$$) und $\\ce{}$ für chemische Formeln und Reaktionsgleichungen (mhchem-Erweiterung). CHEMIE-REGELN: $\\ce{H2O}$ für Formeln, $\\ce{2H2 + O2 -> 2H2O}$ für Reaktionen, $\\ce{<=>}$ für Gleichgewichte. LATEX-REGELN: \\cdot statt *, \\frac{a}{b} statt a/b, Dezimalkomma 3{,}6 statt 3.6. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000);
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}


export async function handleGenerateAbiturChemie(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 40 : 30;
  const gesamtBE = isEA ? 120 : 90;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Chemie-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Chemie-Abiturprüfung nach dem IQB-Aufgabenformat.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE (= ${gesamtBE} BE)
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

IQB-REFERENZFORMAT (orientiere dich strikt an IQB-Beispielaufgaben wie Taschenofen, Kaffeebecher, Adblue):
- Jede Aufgabengruppe in einen ALLTAGSNAHEN, REALEN KONTEXT einbetten (z.B. Taschenofen, Kaffeebecher, Dieselabgase, Mineraldünger, PET-Recycling) — KEINE abstrakten Lehrbuchtexte
- Pro Aufgabengruppe 5-7 Teilaufgaben bei 30 BE, gemischte Aufgabentypen:
  • Berechnungen (Stöchiometrie, Thermochemie, Nernst, Faraday) mit konkreten Zahlenwerten aus den Materialien
  • Erklärungen/Erläuterungen chemischer Phänomene im Kontext
  • Reaktionsgleichungen aufstellen und mechanistisch erklären
  • Beurteilungen/Diskussionen (Umweltaspekte, Nachhaltigkeit, Alltagsrelevanz)
- Materialien M1-M5 pro Aufgabengruppe, vielfältig:
  • Texte: Alltagsbeschreibungen, Gebrauchsanleitungen, Produktbeschreibungen
  • Tabellen: Stoffdaten, Messwerte, thermodynamische Daten (ΔH, ΔG, ΔS)
  • Diagramme: Temperatur-Zeit-Verläufe, Energiediagramme, Titrationskurven
  • Schemata: Apparaturen, Versuchsaufbauten, Fließschemata
- AFB-Verteilung: ca. 30% AFB I, 50% AFB II, 20% AFB III
- Operatoren gezielt einsetzen:
  • AFB I: "Berechnen Sie", "Formulieren Sie", "Beschreiben Sie", "Skizzieren Sie"
  • AFB II: "Erläutern Sie", "Zeigen Sie", "Erstellen Sie ein Fließschema", "Vergleichen Sie"
  • AFB III: "Beurteilen Sie", "Diskutieren Sie", "Schätzen Sie ab"
- Kompetenzbereiche abdecken: Sachkompetenz (S), Erkenntnisgewinnung (E), Kommunikation (K), Bewertung (B)

SACHGEBIETE (wähle 4 verschiedene aus, Lehrplan G9 Bayern ab 2026):
1. Elektrochemie (C12 LB8, C13 LB5): Galvanische Zellen, Nernst-Gleichung, Spannungsreihe, Elektrolyse, Faraday-Gesetze, Korrosion (O2-/Säure-/Kontaktkorrosion), Korrosionsschutz, Sekundärzellen, Brennstoffzelle, Elektromobilität
2. Chemisches Gleichgewicht / Säure-Base (C12 LB7, C13 LB3): MWG, Le Chatelier, Löslichkeitsprodukt, Brönsted, pKs/pKb, pH-Berechnungen (Näherungsformeln), Titration (Kurven, Halbtitration), Henderson-Hasselbalch, Puffersysteme
3. Thermochemie/Kinetik (C12 LB5/6/8): Reaktionsgeschwindigkeit, Stoßtheorie, Aktivierungsenergie, Katalyse, Enthalpie, Hess'scher Satz, Entropie, Gibbs-Helmholtz (ΔG = ΔH − TΔS)
4. Organische Chemie (C12 LB4/5): Kohlenwasserstoffe, Hybridisierung (sp³/sp²/sp), LCAO, Mesomerie, Reaktionsmechanismen (radikalische Substitution, elektrophile Addition, elektrophile aromatische Substitution, nukleophile Substitution), induktive/mesomere Effekte
5. Kunststoffe (C13 LB4.2): Radikalische Polymerisation (Mechanismus), Polykondensation (Polyester, Polyamid), Polyaddition (Polyurethan), Thermoplaste/Duroplaste/Elastomere, Silikone, OLED, leitfähige Kunststoffe
6. Analytik/Spektroskopie (C12 LB3): Nachweisreaktionen, Chromatographie (DC, HPLC, GC), Redox-Titration, Fotometrie (Lambert-Beer), komplexometrische Titration
7. Aminosäuren/Proteine/Enzyme (C13 LB4.1): Aminocarbonsäuren, Peptidbindung, Proteinstrukturen (Primär-Quartär), Denaturierung, Enzymkinetik (Schlüssel-Schloss), Einflussfaktoren
8. Farbstoffe (C13 LB2): HOMO/LUMO, konjugierte Doppelbindungen, Azofarbstoffe (Diazotierung/Azokupplung), Triphenylmethanfarbstoffe, Küpenfärbung, Indikatoren

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Elektrochemie in der Praxis")
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
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten. Keine Themen, Konzepte oder Reaktionsmechanismen verwenden, die nicht im Lehrplan stehen.
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für das GRUNDLEGENDE Anforderungsniveau (gA). Die Aufgaben müssen in Tiefe, Komplexität und Umfang dem gA-Niveau entsprechen — NICHT dem eA-Niveau. Halte dich strikt an den gA-Lehrplan. Insbesondere: weniger mathematische Tiefe bei Berechnungen, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Materialien und Aufgabenstellungen.` : ""}

LATEX-FORMATIERUNG (schreibe echte Chemie/Mathematik, NICHT Code-Syntax!):
- Multiplikation: $3{,}6 \\cdot x$ (NIEMALS $3.6 * x$)
- Brüche: $\\frac{1}{2}$ (NICHT $1/2$)
- Dezimalkomma (deutsch!): $3{,}6$ (NICHT $3.6$)
- Vergleiche: $\\le$, $\\ge$, $\\ne$, $\\approx$ (NICHT <=, >=)

CHEMIE-SPEZIFISCHE LATEX-REGELN (mhchem-Erweiterung \\ce{}):
- Chemische Formeln: $\\ce{H2O}$, $\\ce{NaOH}$, $\\ce{H3O+}$
- WICHTIG: Schreibe IMMER $\\ce{H3O+}$ (Oxonium-Ion), NIEMALS $\\ce{H+}$! Protonen liegen in wässriger Lösung als Oxonium-Ionen vor.
- Reaktionsgleichungen: $\\ce{2H2 + O2 -> 2H2O}$
- Gleichgewichtsreaktionen: $\\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Phasenindikatoren: $\\ce{(aq)}$, $\\ce{(g)}$, $\\ce{(l)}$, $\\ce{(s)}$
- Oxidationsstufen: $\\ce{Fe^{III}}$, $\\overset{+II}{\\ce{Cu}}$
- Thermochemie: $\\Delta H$, $\\Delta G$, $\\Delta S$, $\\text{kJ/mol}$

TEMPERATUR-NOTATION:
- RICHTIG: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$
- FALSCH: $^\\circ\\ce{C}$ (\\ce{C} wird als Kohlenstoff interpretiert!)
- FALSCH: $\\vartheta$ (nicht in KaTeX verfügbar) — verwende stattdessen $\\theta$ oder $T$

KEINE GeoGebra-Visualisierung — Chemie verwendet kein GeoGebra.

STRUKTURFORMELN:
Bei Aufgaben zu Organik oder Kunststoffen MUSST du ein "strukturformeln"-Array innerhalb von material angeben (2–4 Moleküle).
Bei anderen Sachgebieten ist es optional.
Format: [{"name": "ethanol", "caption": "Ethanol (Edukt)"}, {"name": "acetic acid", "caption": "Essigsäure"}]
- "name": englischer chemischer Name (IUPAC oder Trivialname) für PubChem-Lookup
- "caption": deutsche Beschriftung für die Anzeige
- KEIN SMILES, KEIN InChI — nur englische Namen!

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "statistik" + "chart_type":"bar": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN Zahlenwerten (mind. 4-6 Datenzeilen). KEINE Werte aus den Beispielen kopieren!
- "diagramm" + "chart_type":"line": "text" enthält eine VOLLSTÄNDIGE Markdown-Tabelle mit EIGENEN, NEUEN x/y-Datenpunkten (mind. 5-8 Messwerte). KEINE Werte aus den Beispielen kopieren!
- "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}
- "foto": Realistisches Foto. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Laboraufbauten, Versuchsapparaturen, Mikroskopaufnahmen, Organismen, Ökosysteme, Messgeräte, Naturphänomene. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- "text": "text" enthält den VOLLSTÄNDIGEN AUSFORMULIERTEN Fachtext (mind. 150-300 Wörter)

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Fachtext, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 1x statistik/diagramm + 1x text.

WICHTIG: Die folgenden Beispiele zeigen NUR die JSON-Struktur und das erwartete Qualitätsniveau. Generiere KOMPLETT EIGENE, NEUE Aufgaben mit ANDEREN Themen, Sachgebieten, Daten und Materialien! Kopiere NIEMALS Inhalte aus den Beispielen!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Galvanische Zelle und Korrosion",
      "sachgebiet": "elektrochemie",
      "material": [
        {"id": "M1", "titel": "Taschenofen als galvanische Zelle", "type": "text", "text": "Ein handelsüblicher Taschenofen nutzt die exotherme Oxidation von Eisenpulver zur Wärmeerzeugung. In einer Salzlösung werden Eisenpulver ($\\\\ce{Fe}$), Aktivkohle und Natriumchlorid ($\\\\ce{NaCl}$) gemischt. An der Oberfläche des Eisenpulvers bilden sich Lokalelement: Eisen wird oxidiert ($\\\\ce{Fe -> Fe^{2+} + 2e-}$, $E^0 = -0{,}44\\\\,\\\\text{V}$), während an der Aktivkohle Sauerstoff reduziert wird ($\\\\ce{O2 + 2H2O + 4e- -> 4OH-}$, $E^0 = +0{,}40\\\\,\\\\text{V}$). Durch die große Oberfläche des Eisenpulvers läuft die Reaktion schnell ab und erzeugt Temperaturen bis zu $70\\\\,°\\\\text{C}$."},
        {"id": "M2", "titel": "Standardpotentiale", "type": "statistik", "chart_type": "bar", "text": "| Halbzelle | $E^0$ / V |\\n|---|---|\\n| $\\\\ce{Li/Li+}$ | $-3{,}04$ |\\n| $\\\\ce{Zn/Zn^{2+}}$ | $-0{,}76$ |\\n| $\\\\ce{Fe/Fe^{2+}}$ | $-0{,}44$ |\\n| $\\\\ce{Cu/Cu^{2+}}$ | $+0{,}34$ |\\n| $\\\\ce{Ag/Ag+}$ | $+0{,}80$ |\\n| $\\\\ce{Au/Au^{3+}}$ | $+1{,}50$ |"},
        {"id": "M3", "titel": "Temperaturverlauf Taschenofen", "type": "diagramm", "chart_type": "line", "text": "| Zeit / min | Temperatur / °C |\\n|---|---|\\n| 0 | 22 |\\n| 5 | 48 |\\n| 10 | 62 |\\n| 20 | 68 |\\n| 30 | 70 |\\n| 45 | 65 |\\n| 60 | 55 |\\n| 90 | 38 |"}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Formulieren Sie die Gesamtreaktionsgleichung für die Oxidation von Eisen im Taschenofen.", "be": 4},
        {"id": "1.2", "text": "Berechnen Sie die Standardzellspannung $\\\\Delta E^0$ und die freie Reaktionsenthalpie $\\\\Delta G^0$ der Reaktion.", "be": 6},
        {"id": "1.3", "text": "Beschreiben Sie den in M3 dargestellten Temperaturverlauf und erklären Sie, warum die Temperatur nach einem Maximum wieder sinkt.", "be": 6},
        {"id": "1.4", "text": "Erläutern Sie anhand des Taschenwärmers das Prinzip der Sauerstoffkorrosion und vergleichen Sie es mit der Säurekorrosion.", "be": 8},
        {"id": "1.5", "text": "Beurteilen Sie, ob der Taschenofen aus ökologischer Sicht eine sinnvolle Alternative zu elektrischen Handwärmern darstellt.", "be": 6}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 2",
      "titel": "Titration einer Essigsäurelösung",
      "sachgebiet": "gleichgewicht_saeure_base",
      "material": [
        {"id": "M1", "titel": "Versuchsbeschreibung", "type": "text", "text": "In einem Lebensmittellabor wird der Essigsäuregehalt einer Probe Weinessig bestimmt. Dazu werden $25{,}0\\\\,\\\\text{ml}$ der Essigprobe mit Natronlauge ($c = 0{,}1\\\\,\\\\text{mol/l}$) titriert. Als Indikator wird Phenolphthalein (Umschlagbereich pH 8,2–10,0) verwendet. Der pKs-Wert der Essigsäure beträgt 4,75."},
        {"id": "M2", "titel": "Titrationskurve", "type": "diagramm", "chart_type": "line", "text": "| V(NaOH) / ml | pH-Wert |\\n|---|---|\\n| 0 | 2,9 |\\n| 5 | 4,2 |\\n| 10 | 4,6 |\\n| 15 | 4,9 |\\n| 18 | 5,3 |\\n| 19,5 | 6,1 |\\n| 20 | 8,7 |\\n| 20,5 | 11,3 |\\n| 22 | 12,1 |\\n| 25 | 12,5 |"}
      ],
      "teilaufgaben": [
        {"id": "2.1", "text": "Formulieren Sie die Reaktionsgleichung der Titration und berechnen Sie die Stoffmengenkonzentration der Essigsäure in der Probe.", "be": 5},
        {"id": "2.2", "text": "Erklären Sie mithilfe von M2, warum der pH-Wert am Äquivalenzpunkt nicht bei 7,0 liegt.", "be": 6},
        {"id": "2.3", "text": "Bestimmen Sie aus der Titrationskurve den Halbäquivalenzpunkt und erklären Sie dessen Bedeutung für die Bestimmung des pKs-Wertes.", "be": 7},
        {"id": "2.4", "text": "Erläutern Sie die Pufferwirkung der Essigsäure/Acetat-Lösung im Bereich um den Halbäquivalenzpunkt unter Verwendung der Henderson-Hasselbalch-Gleichung.", "be": 8},
        {"id": "2.5", "text": "Beurteilen Sie, ob Methylorange (Umschlagbereich pH 3,1–4,4) als alternativer Indikator für diese Titration geeignet wäre.", "be": 4}
      ],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 3",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1+2)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen, mit type-Feld)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 5-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    },
    {
      "id": "Aufgabe 4",
      "titel": "EIGENEN Titel wählen",
      "sachgebiet": "EIGENES Sachgebiet wählen (verschieden von Aufgabe 1-3)",
      "material": ["EIGENE Materialien mit EIGENEN Daten generieren (mind. 2-3 Materialien, verschiedene Typen, mit type-Feld)"],
      "teilaufgaben": ["EIGENE Teilaufgaben generieren (mind. 5-6 Teilaufgaben, AFB I→II→III, Summe = ${beProAufgabe} BE)"],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien! Aufgabe 3 und 4 müssen genauso detailliert sein wie Aufgabe 1 und 2. MINDESTENS 5 Teilaufgaben pro Aufgabengruppe.
Erstelle 4 Aufgabengruppen mit KOMPLETT ANDEREN Themen und Sachgebieten als in den Beispielen.`;

  const userPrompt = `Erstelle eine vollständige Chemie-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit Material und steigendem Anforderungsniveau.
KRITISCH: Alle Formeln in LaTeX-Notation, chemische Formeln mit $\\ce{}$.
WICHTIG: Bei Organik/Kunststoffe-Aufgaben UNBEDINGT strukturformeln-Array in material angeben (englische Namen für PubChem)!
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Die Aufgaben müssen in Tiefe und Komplexität dem grundlegenden Anforderungsniveau entsprechen — NICHT dem erhöhten Niveau.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgabenChem = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgabenChem) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Chemie");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= CHEMIE ABITUR: GRADE ================= */
export async function handleGradeAbiturChemie(request, env) {
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

  const rubricPrompt = `Du bewertest eine Chemie-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, Reaktionsgleichungen, Mechanismen, quantitative Berechnungen, korrekte chemische Nomenklatur
- Berücksichtige die Operatoren-Anforderung (AFB I/II/III) jeder Teilaufgabe nach ISB-Definition:
  • AFB I ("Nennen/Angeben" = nur aufzählen; "Beschreiben" = wiedergeben; "Berechnen" = Rechnung; "Formulieren" = Gleichung aufstellen)
  • AFB II ("Erklären" = auf Regeln/Gesetze gestützt darlegen; "Erläutern" = MIT Zusatzinfos/Analogien; "Vergleichen" = Gemeinsamkeiten+Unterschiede; "Begründen" = Argumente angeben)
  • AFB III ("Beurteilen" = Sachurteil; "Bewerten" = Werturteil mit gesellschaftlichen Kriterien; "Diskutieren" = Positionen abwägen)
- KRITISCH: Bewerte NUR das, was der jeweilige Operator verlangt!
- Ansatz korrekt aber Rechenfehler → Teilpunkte
- Folgefehler berücksichtigen
- Der Schüler schreibt in einer Mischung aus Plain-Text-Chemie und LaTeX-Notation. Interpretiere beides großzügig.

ANTWORT-FORMAT:
- Chemie-typische Darstellungsformen sind erwünscht: Reaktionsgleichungen, Strukturformeln, Berechnungen, Tabellen, Skizzen
- Stichpunkte bei Rechenwegen, Reaktionsmechanismen und Aufzählungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Verwende LaTeX-Notation ($...$, $$...$$) und $\\ce{}$ im Feedback. Schreibe IMMER $\\ce{H3O+}$ (Oxonium-Ion), NIEMALS $\\ce{H+}$!
TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$).

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback mit $LaTeX$/$\\\\ce{}$, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const bilderHinweisAbiChemie = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisAbiChemie + UEBUNGSAUFGABEN_ANWEISUNG },
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

/* ================= CHEMIE ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturChemie(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Chemie-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Verwende LaTeX-Notation für alle Formeln: $...$ für inline, $$...$$ für Display
- Verwende $\\ce{}$ für alle chemischen Formeln und Reaktionsgleichungen
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- LATEX-REGELN: $\\cdot$ statt *, $\\frac{a}{b}$ statt a/b, Dezimalkomma $3{,}6$ statt $3.6$
- CHEMIE-REGELN: $\\ce{H2O}$ für Formeln, $\\ce{2H2 + O2 -> 2H2O}$ für Reaktionen, $\\ce{<=>}$ für Gleichgewichte
- TEMPERATUR: $20\\,°\\text{C}$ oder $T = 293\\,\\text{K}$ (NIEMALS $^\\circ\\ce{C}$ oder $\\vartheta$)
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
  ], 10000);

  return jsonResponse({ model_answer: answer }, 200, env);
}
