import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis, KEINE_LOESUNGSHINWEISE } from '../config.js';
import { repairPlaceholderMaterials } from './physik.js';

export async function handleGenerateInformatik(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "rekursion-listen";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  // LehrplanPLUS Informatik G9 gA – verifiziert anhand LIS_PDF_28-02-2026-10/11
  const sgThemen = {
    "rekursion-listen": {
      title: "Rekursion & Listen",
      inhalte: "Rekursion & Listen (LB 1+2, Jgst. 12) — Rekursion (lineare Rekursion, verzweigte Rekursion, Tiefensuche, rekursive Problemlösung, Rekursion vs. Iteration), einfach verkettete Liste (Einfügen, Löschen, Suchen, Durchlaufen), Stapel/Stack (LIFO-Prinzip, Push/Pop), Warteschlange/Queue (FIFO-Prinzip, Enqueue/Dequeue), Kompositum-Entwurfsmuster (Knoten/Blatt-Struktur), Generalisierung/Spezialisierung bei Datenstrukturen. Programmiersprache: Java oder Python."
    },
    baeume: {
      title: "Binärbäume",
      inhalte: "Binärbäume (LB 3, Jgst. 12) — Geordneter Binärbaum (Suchbaum-Eigenschaft), Einfügen in geordneten Binärbaum, Suchen im Binärbaum, Löschen aus Binärbaum, Traversierung (Preorder, Inorder, Postorder), Anwendungen (z.B. Sortieren durch Inorder-Traversierung), rekursive Baumoperationen, Blatt/innerer Knoten/Wurzel, Tiefe und Höhe eines Baumes. Programmiersprache: Java oder Python."
    },
    nebenlaeufigkeit: {
      title: "Nebenläufige Prozesse",
      inhalte: "Nebenläufige Prozesse (LB 4, Jgst. 12) — Nebenläufigkeit (Threads, parallele Ausführung), Synchronisation (kritischer Abschnitt, wechselseitiger Ausschluss), Deadlock (Verklemmung, zirkuläres Warten), Coffman-Bedingungen (mutual exclusion, hold and wait, no preemption, circular wait), Monitorkonzept (synchronized, wait/notify), Erzeuger-Verbraucher-Problem, Semaphore (grundlegend), Zustandsdiagramme nebenläufiger Prozesse."
    },
    automaten: {
      title: "Formale Sprachen & Automaten",
      inhalte: "Formale Sprachen & Automaten (LB 1, Jgst. 13) — Formale Sprache (Alphabet, Wort, Sprache), EBNF (Erweiterte Backus-Naur-Form, Produktionsregeln), Syntaxdiagramme (grafische Darstellung von EBNF), deterministischer endlicher Automat DEA (Zustände, Übergänge, Startzustand, Endzustände, Zustandsdiagramm, Übergangstabelle), nichtdeterministischer endlicher Automat NEA, Äquivalenz DEA/NEA (Potenzmengenkonstruktion), reguläre Sprachen, Scanner/Parser-Prinzip."
    },
    rechner: {
      title: "Rechnerarchitektur",
      inhalte: "Funktionsweise eines Rechners (LB 2, Jgst. 13) — Von-Neumann-Architektur (Steuerwerk, Rechenwerk/ALU, Speicher, Ein-/Ausgabe, Bus), Registermaschine (Akkumulator, Befehlszähler, Befehlsregister), Assemblersprache (LOAD, STORE, ADD, SUB, MUL, DIV, JMP, JEQ, JGT, HALT), Befehlszyklus (Fetch-Decode-Execute), Darstellung von Zahlen im Rechner, Maschinenprogramm erstellen und nachvollziehen."
    },
    berechenbarkeit: {
      title: "Grenzen der Berechenbarkeit",
      inhalte: "Grenzen der Berechenbarkeit (LB 3, Jgst. 13) — Laufzeitaufwand von Algorithmen (linear O(n), quadratisch O(n²), exponentiell O(2^n), logarithmisch O(log n)), O-Notation (Best-/Worst-/Average-Case), Brute-Force-Algorithmen (vollständige Suche), praktisch unlösbare Probleme (z.B. Traveling Salesman), Halteproblem (Beweis der Unentscheidbarkeit, Diagonalisierungsargument), Berechenbarkeit vs. praktische Lösbarkeit."
    },
    ki: {
      title: "Künstliche Intelligenz",
      inhalte: "Künstliche Intelligenz (LB 4, Jgst. 13) — Neuronale Netze (Neuron/Perzeptron, Gewichte, Bias, Aktivierungsfunktion, Schichten: Eingabe-/versteckte/Ausgabeschicht), Forward Propagation (Vorwärtsberechnung), Backpropagation (Fehlerrückführung, Gradientenabstieg, Lernrate), k-Means-Algorithmus (Clustering, Zentroide, iterative Zuordnung), überwachtes Lernen (supervised: Klassifikation, Regression), unüberwachtes Lernen (unsupervised: Clustering), bestärkendes Lernen (reinforcement: Belohnung/Bestrafung), ethische Aspekte von KI."
    },
    sicherheit: {
      title: "Informationssicherheit",
      inhalte: "Informationssicherheit (LB 5, Jgst. 12) — Schutzziele (Vertraulichkeit, Integrität, Verfügbarkeit, Authentizität), Gefährdungen (Social Engineering, Malware, Phishing, Man-in-the-Middle), technische Maßnahmen (Verschlüsselung, Firewall, Backup), organisatorische Maßnahmen (Passwortrichtlinien, Zugriffsrechte, Schulung), symmetrische vs. asymmetrische Verschlüsselung (Grundprinzip), Hashfunktionen (Einweg-Eigenschaft), digitale Signatur (Grundprinzip)."
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen["rekursion-listen"];

  const systemPrompt = `Du bist Informatiklehrer am bayerischen Gymnasium. Erstelle eine Informatik-Klausuraufgabe im IQB-Format (Abitur gA/eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.${zeitHinweis}
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, ALLTAGSNAHEN Kontext ein (z.B. ein Softwareprojekt, eine Anwendung, ein konkretes System)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau: AFB I (Nennen/Beschreiben) → AFB II (Erläutern/Vergleichen/Analysieren) → AFB III (Bewerten/Diskutieren/Entwerfen)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- ${KEINE_LOESUNGSHINWEISE}
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben
- Bei Algorithmen/Datenstrukturen: Java- oder Python-Code bzw. Pseudocode ist erlaubt
- Bei Automaten: Zustandsdiagramme, Übergangstabellen, EBNF-Regeln oder Syntaxdiagramme können verlangt werden
- Bei Rechnerarchitektur: Assembler-Programme für die Registermaschine können verlangt werden
- Bei KI: Berechnungen zu Neuronalen Netzen (Forward Propagation) oder k-Means können verlangt werden

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG: Fachbegriffe klar verwenden. Code in Markdown-Codeblöcken. Pseudocode klar strukturiert.

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter) oder Code-Listing, KEIN Platzhalter
- "bild" → "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}.
  REGELN für "bild": (1) Layout, Farben und visuelle Elemente detailliert beschreiben (2) NUR Nummern als Marker im Bild (3) KEINE Personen!
- "foto" → "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto von Hardware, Serverräumen, Netzwerkgeräten, Leiterplatten, Robotern, Alltagstechnologie. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- Erstelle pro Aufgabengruppe IMMER mindestens 1 visuelles Material. BEVORZUGE "statistik" (Benchmark-Tabellen, Vergleichsdaten) oder "foto" (Hardware, Netzwerkgeräte). Für UML-/Architekturdiagramme verwende "bild".
  VERBOTEN: Diagramme/Bilder als Textbeschreibung oder ASCII-Art einfügen — IMMER type "bild" mit englischem Imagen-Prompt verwenden!

KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Projekt/System>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild>", "text": "<ECHTER Inhalt>"},
    {"id": "M2", "titel": "Schaubild: ...", "type": "bild", "text": "<Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker>", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}}
  ]
}`;

  const userPrompt = `Erstelle ${aufgabenAnzahl > 1 ? aufgabenAnzahl + ' Aufgaben' : 'eine Aufgabe'} (${totalBE} BE gesamt) im Sachgebiet ${sgInfo.title}.
Die Aufgabe${aufgabenAnzahl > 1 ? 'n sollen' : ' soll'} abwechslungsreich und abiturrelevant sein.`;

  let openaiRes;
  try {
    openaiRes = await callOpenAI(env, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 8000, { model: "gpt-5.2", temperature: 0.7 });
  } catch (e) {
    const detail = (e.name === "AbortError") ? "Zeitüberschreitung (>25s)" : (e.message || "unbekannt");
    console.error("generate-informatik error:", detail);
    return jsonResponse({ error: "Informatik-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-informatik JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, "Informatik");
  }

  return jsonResponse(content, 200, env);
}

/* ================= INFORMATIK: GRADE ================= */
export async function handleGradeInformatik(request, env) {
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

  const rubricPrompt = `Du bewertest eine Informatik-Klausur (Bayern, gA/eA, Abitur ab 2026) nach dem BE-System.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, informatische Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung informatischer Zusammenhänge
- Korrekte Fachsprache (z.B. "Laufzeitkomplexität O(n log n)", "Kompositum-Entwurfsmuster", "Coffman-Bedingungen", "DEA", "Von-Neumann-Architektur", "Backpropagation") wird positiv bewertet
- Bei Code/Pseudocode: Korrektheit des Algorithmus, Effizienz, Lesbarkeit (Java oder Python)
- Bei Automaten: Korrekte Zustandsdiagramme, Übergangstabellen, EBNF-Regeln
- Bei Registermaschine: Korrekte Assembler-Programme, Befehlszyklus-Nachvollziehung
- Bei KI: Korrekte Berechnungen (Forward Propagation, k-Means-Schritte)
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Informatik-typische Darstellungsformen sind erwünscht: Pseudocode, Struktogramme, UML-Diagramme, Zustandsdiagramme, Tabellen, Code-Snippets
- Stichpunkte bei Aufzählungen, Algorithmus-Beschreibungen und Erklärungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "teilbewertungen": [
    {"id": "a)", "erreichte_be": 2, "max_be": 3, "bewertung": "Markdown-Bewertung"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const bilderHinweisInfo = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisInfo + UEBUNGSAUFGABEN_ANWEISUNG },
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

/* ================= INFORMATIK: MODEL ANSWER ================= */
export async function handleModelAnswerInformatik(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Informatik-Oberstufenschüler am bayerischen Gymnasium (gA/eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende korrekte informatische Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "Anwendung des Divide-and-Conquer-Prinzips")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

INFORMATIK-SPEZIFISCHE REGELN:
- Code/Pseudocode in Markdown-Codeblöcken (\`\`\`java oder \`\`\`python)
- Automaten-Definitionen als strukturierte Textdarstellung (Zustandsdiagramm, Übergangstabelle)
- EBNF-Regeln und Syntaxdiagramme klar formatiert
- Assembler-Programme für Registermaschine in Codeblöcken
- O-Notation korrekt verwenden: O(n), O(n²), O(log n), O(2^n)
- Fachbegriffe korrekt verwenden (Kompositum, Stapel/LIFO, Warteschlange/FIFO, Deadlock, Coffman-Bedingungen, DEA/NEA, Von-Neumann, Backpropagation, Halteproblem etc.)
- Algorithmen Schritt für Schritt erklären und Trace/Durchlauf zeigen`;

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

/* ================= INFORMATIK: PARSE TASK ================= */
export async function handleParseTaskInformatik(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Informatik-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme (UML, ER, Automaten), Tabellen, Code-Listings und Teilaufgaben. Verwende korrekte informatische Fachbegriffe. Code in Markdown-Codeblöcken. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

export async function handleGenerateAbiturInformatik(request, env) {
  const body = await request.json();
  const { level } = body;

  const lvl = level || "gA";
  const isEA = lvl === "eA";

  const pruefungsdauer = isEA ? 300 : 255;
  const beProAufgabe = isEA ? 30 : 22;
  const gesamtBE = isEA ? 120 : 88;
  const anzahlAufgaben = 4;
  const wahlAnzahl = 3;

  const systemPrompt = `Du bist ein Informatik-Experte für das bayerische Abitur (${lvl}, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE Informatik-Abiturprüfung.

PRÜFUNGSSTRUKTUR (${lvl}):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgabengruppen, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabengruppe: ${beProAufgabe} BE
- Gesamt (bei ${wahlAnzahl} gewählten): ${wahlAnzahl * beProAufgabe} BE
- Jede Aufgabengruppe behandelt ein anderes Sachgebiet

SACHGEBIETE (wähle 4 verschiedene, Lehrplan G9 Bayern Informatik ab 2026):
1. Rekursion & Listen (Inf12 LB1): Lineare und verzweigte Rekursion, Abbruchbedingung, rekursive Datenstrukturen. Verkettete Liste (einfach/doppelt verkettet), Einfügen, Löschen, Durchlaufen, Suchen. Stapel (Stack) und Warteschlange (Queue), LIFO/FIFO-Prinzip. Kompositum-Entwurfsmuster. Laufzeitbetrachtung O(n).
2. Binärbäume (Inf12 LB2): Geordneter Binärbaum (Suchbaum), Einfügen, Suchen, Löschen (mit Nachfolger). Traversierung: Preorder, Inorder, Postorder. Laufzeitanalyse O(log n) vs. O(n). Darstellung als Knoten-Kanten-Diagramm. Anwendungen: Huffman-Codierung, Entscheidungsbäume.
3. Nebenläufigkeit (Inf12 LB3): Prozesse und Threads, parallele Ausführung. Kritischer Abschnitt, Race Condition. Synchronisation: Semaphor, Monitor, Mutex. Deadlock (Bedingungen, Vermeidung, Erkennung). Erzeuger-Verbraucher-Problem. Petri-Netze (Stellen, Transitionen, Marken, Schaltregeln).
4. Formale Sprachen & Automaten (Inf13 LB1): Endliche Automaten (DEA/NEA), Zustandsdiagramm, Zustandstabelle. Reguläre Ausdrücke und reguläre Sprachen. Grammatiken (Typ 2/3), Ableitungsbaum. Kellerautomat (PDA). Chomsky-Hierarchie. Zusammenhang Automaten-Grammatiken-Sprachen.
5. Rechnerarchitektur (Inf13 LB2): Von-Neumann-Architektur, Befehlszyklus (Fetch-Decode-Execute). Maschinensprache, Assembler (Befehlssatz, Register). Speicherhierarchie (Register, Cache, RAM, Festplatte). Zahlendarstellung (Zweierkomplement, Gleitkomma IEEE 754). Logische Schaltungen (AND, OR, NOT, XOR), Addierer, Multiplexer.
6. Berechenbarkeit (Inf13 LB3): Turingmaschine (Definition, Arbeitsweise, Übergangstabelle). Berechenbare und nicht-berechenbare Funktionen, Halteproblem. Churchsche These. Komplexitätsklassen P und NP, NP-Vollständigkeit. Entscheidbarkeit.
7. Künstliche Intelligenz (Inf13 LB4): Maschinelles Lernen (überwacht/unüberwacht), Trainings-/Testdaten. Entscheidungsbaum, k-Nearest-Neighbors. Neuronale Netze (Perzeptron, Schichten, Aktivierungsfunktion). Bias und Fairness in KI-Systemen. Ethische Aspekte von KI.
8. Informationssicherheit (Inf13 LB5): Symmetrische Verschlüsselung (AES, One-Time-Pad). Asymmetrische Verschlüsselung (RSA-Prinzip, Public/Private Key). Digitale Signatur, Zertifikate. Hashfunktionen (Einwegeigenschaft, Kollisionsresistenz). Authentifizierung (Passwort, 2FA, biometrisch). Datenschutz (DSGVO, Grundprinzipien).

JEDE AUFGABENGRUPPE hat:
- Einen Titel (z.B. "Aufgabe 1: Verwaltung einer Bibliothek")
- Ein Sachgebiet
- Material (M1, M2, ...): Pseudocode, UML-Diagramme, Tabellen, Textbeschreibungen, Zustandsdiagramme
- 4-6 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- ${KEINE_LOESUNGSHINWEISE}
- Gesamt: ${beProAufgabe} BE

WICHTIG:
- Pseudocode in Markdown-Codeblöcken (\`\`\`pseudocode ... \`\`\`)
- UML/Zustandsdiagramme als ASCII-Art oder textuelle Beschreibung
- Jede Teilaufgabe hat BE-Angabe
- Aufgaben müssen praxisnah sein (z.B. Schulverwaltung, App, Netzwerk, Datenbank)
- LEHRPLAN-TREUE: Verwende NUR Inhalte aus den oben angegebenen Lehrplan-Sachgebieten
${!isEA ? `- ⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Prüfung ist für gA. Weniger mathematische Tiefe, keine über den gA-Lehrplan hinausgehenden Vertiefungen, zugänglichere Aufgaben.` : ""}

MATERIAL-TYPEN (jedes Material MUSS ein "type"-Feld haben):
- "text": Vollständige Textbeschreibung einer Situation/eines Systems (150-300 Wörter) oder Code-Listing
- "statistik" + "chart_type":"bar": Markdown-Tabelle mit Daten (mind. 4-6 Zeilen)
- "diagramm" + "chart_type":"line": Markdown-Tabelle mit x/y-Werten (mind. 5-8 Werte)
- "bild": Bildprompt KOMPLETT auf Englisch (5-10 Sätze) für UML/Zustandsdiagramm. NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen statt Text. KEINE Wörter im Bild! Zusätzlich MUSS ein Feld "bild_labels" als Objekt mitgeliefert werden: {"1": "Deutsche Beschriftung", "2": "..."}
- Erstelle pro Aufgabengruppe IMMER mindestens 1 visuelles Material. BEVORZUGE "statistik" (Benchmark-Tabellen, Vergleichsdaten) oder "foto" (Hardware, Netzwerkgeräte). Für UML-/Architekturdiagramme verwende "bild".
  REGELN für "bild": (1) Layout, Farben, Stil detailliert beschreiben (2) NUR Nummern als Marker im Bild (3) KEINE Personen!
  VERBOTEN: Diagramme/Bilder als Textbeschreibung oder ASCII-Art einfügen — IMMER type "bild" mit englischem Imagen-Prompt verwenden!

KRITISCH — ABSOLUT VERBOTEN:
- NIEMALS Platzhalter wie "Ein Pseudocode, der..." oder "Eine Tabelle mit..." schreiben!
- Das "text"-Feld MUSS den TATSÄCHLICHEN, VOLLSTÄNDIGEN Inhalt enthalten!
Pro Aufgabengruppe: mind. 2-3 Materialien verschiedener Typen (davon mindestens 1x "bild").
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Titel der Aufgabe",
      "sachgebiet": "sachgebiet_key",
      "material": [
        {"id": "M1", "titel": "Materialtitel", "type": "text", "text": "Vollständiger Materialtext..."},
        {"id": "M2", "titel": "Diagramm: ...", "type": "bild", "text": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}}
      ],
      "teilaufgaben": [
        {"id": "1.1", "text": "Aufgabentext", "be": 4}
      ],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "${lvl}",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}
WICHTIG: Generiere für ALLE 4 Aufgaben vollständige, ausformulierte Teilaufgaben und Materialien!
Jede Aufgabengruppe MUSS mindestens 1 Material vom Typ "bild" enthalten!
Erstelle 4 Aufgabengruppen mit verschiedenen Sachgebieten.`;

  const userPrompt = `Erstelle eine vollständige Informatik-Abiturprüfung (${lvl}, ${gesamtBE} BE).
${anzahlAufgaben} Aufgabengruppen à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
Verwende 4 verschiedene Sachgebiete. Jede Aufgabe mit praxisnahem Kontext, Material und steigendem Anforderungsniveau.
Pseudocode in Codeblöcken. KEIN LaTeX nötig.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan.` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000);

  const content = extractJSON(openaiRes);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgabenInfo = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgabenInfo) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Informatik");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= INFORMATIK ABITUR: GRADE ================= */
export async function handleGradeAbiturInformatik(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level, images } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const lvl = level || "gA";
  const isEA = lvl === "eA";
  const beProAufgabe = isEA ? 30 : 22;
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

  const rubricPrompt = `Du bewertest eine Informatik-Abiturprüfung (Bayern, ${lvl}, G9, ab 2026).
Der Schüler hat 3 von 4 Aufgabengruppen gewählt. Gesamt: ${maxBE} BE.

BEWERTUNGSREGELN:
- Bewerte jede Aufgabe und jede Teilaufgabe einzeln
- Bewertungskriterien: Fachsprache, korrekter Algorithmus/Pseudocode, logische Argumentation, Vollständigkeit
- Ansatz korrekt aber Folgefehler → Teilpunkte
- Pseudocode/Code muss nicht compilierbar sein, aber logisch korrekt

ANTWORT-FORMAT:
- Informatik-typische Darstellungsformen sind erwünscht: Pseudocode, Struktogramme, UML-Diagramme, Zustandsdiagramme, Tabellen, Code-Snippets
- Stichpunkte bei Aufzählungen, Algorithmus-Beschreibungen und Erklärungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${beProAufgabe}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, gegliedert nach Aufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const bilderHinweisAbiInfo = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisAbiInfo + UEBUNGSAUFGABEN_ANWEISUNG },
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

/* ================= INFORMATIK ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturInformatik(request, env) {
  const { aufgaben, level } = await request.json();

  const lvl = level || "gA";

  const systemPrompt = `Du bist ein sehr guter Informatik-Oberstufenschüler am bayerischen Gymnasium (${lvl}).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für alle gewählten Aufgaben.

WICHTIG:
- Pseudocode in Markdown-Codeblöcken
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- Verwende korrekte Fachsprache (Datenstrukturen, Algorithmen, Automatentheorie)
- Formatiere als Markdown mit klaren Überschriften:
  ## Aufgabe 1: [Titel]
  ### Teilaufgabe 1.1
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
