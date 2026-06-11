import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { BILDER_HINWEIS_MINT, UEBUNGSAUFGABEN_ANWEISUNG, klausurZeitHinweis, KEINE_LOESUNGSHINWEISE } from '../config.js';
import { repairPlaceholderMaterials } from './physik.js';

export async function handleGenerateSport(request, env) {
  const body = await request.json();
  const { sachgebiet, unterpunkte, be, zeit, anzahl } = body;
  const schwerpunktZusatz = unterpunkte && unterpunkte.length > 0
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESE UNTERPUNKTE VERWENDEN:\n' + unterpunkte.join(', ') + '\nALLE Teilaufgaben müssen sich direkt auf diese Unterpunkte beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans, auch wenn sie im selben Sachgebiet liegen!'
    : '';

  const sg = sachgebiet || "gesundheit";
  const totalBE = be || 20;
  const zeitMinuten = zeit || 45;
  const zeitHinweis = klausurZeitHinweis(zeitMinuten, totalBE, 2);
  const aufgabenAnzahl = Math.min(Math.max(anzahl || 1, 1), 5);

  const sgThemen = {
    gesundheit: {
      title: "Gesundheit & Fitness",
      inhalte: "Gesundheit & Fitness — Gesundheitsmodelle (Salutogenese, biopsychosoziales Modell, Risikofaktorenmodell), gesundheitsorientiertes Training (Ausdauer, Kraft, Beweglichkeit, Koordination), Fitness-Konzepte, Belastungsnormative (Intensität, Dauer, Umfang, Dichte, Häufigkeit), Sportverletzungen (Prävention, PECH-Regel), Ernährung im Sport (Energiebilanz, Makronährstoffe, Sporternährung vor/während/nach Belastung)"
    },
    trainingslehre: {
      title: "Trainingslehre",
      inhalte: "Trainingslehre — Trainingsprinzipien (Belastung-Erholung, progressive Belastungssteigerung, Variation, Individualisierung, Periodisierung), Superkompensation, Reizstufenregel, Trainingsplanung (Makro-/Meso-/Mikrozyklus), Trainingsmethoden für Kraft (IK-Training, Hypertrophie, Kraftausdauer), Ausdauer (Dauermethode, Intervallmethode, Wiederholungsmethode), Schnelligkeit (Reaktions-, Aktions-, Frequenzschnelligkeit), Beweglichkeit (statisch, dynamisch), Leistungsdiagnostik und Trainingssteuerung"
    },
    sportbiologie: {
      title: "Sportbiologie",
      inhalte: "Sportbiologie — Bewegungsapparat (Knochen, Gelenke, Wirbelsäule, aktiver und passiver Bewegungsapparat), Skelettmuskulatur (Aufbau, Muskelfasertypen ST/FT, Kontraktionsformen: konzentrisch, exzentrisch, isometrisch), Energiebereitstellung (anaerob-alaktazid/ATP-CP, anaerob-laktazid/Glykolyse, aerob/oxidative Phosphorylierung), Herz-Kreislauf-System (Herzfrequenz, Schlagvolumen, Herzzeitvolumen, Blutdruck), Atmungssystem (Ventilation, Gasaustausch, VO₂max), Adaptation des Körpers an Training"
    },
    bewegungslehre: {
      title: "Bewegungslehre",
      inhalte: "Bewegungslehre — Biomechanische Prinzipien (Prinzip der Anfangskraft, der optimalen Beschleunigungswege, der Impulserhaltung, der Gegenwirkung, der zeitlichen Koordination von Teilimpulsen), Körperschwerpunkt und Körperachsen (Breitenachse, Längsachse, Tiefenachse), Bewegungsanalyse (Phasenmodell nach Meinel/Schnabel: Vorbereitungs-, Haupt-, Endphase), motorisches Lernen (Dreiphasenmodell: Grobkoordination, Feinkoordination, variable Verfügbarkeit), koordinative Fähigkeiten (Gleichgewicht, Orientierung, Differenzierung, Reaktion, Rhythmus, Kopplung, Umstellung), Technik- und Taktiktraining"
    },
    sportpsychologie: {
      title: "Sportpsychologie",
      inhalte: "Sportpsychologie — Motivation (intrinsisch/extrinsisch, Leistungsmotivation, Risikowahl-Modell nach Atkinson), Sinnperspektiven des Sports (Leistung, Gesundheit, Spannung, Ästhetik, Gemeinschaft), Emotion im Sport (Angst, Flow-Erleben, Yerkes-Dodson-Gesetz/Aktivierungsniveau), Aggression (Instinkttheorie, Frustrations-Aggressions-Hypothese, Lerntheorien), mentales Training (Visualisierung, Selbstgespräche, Zielsetzung), Konzentration und Aufmerksamkeit, Stressmanagement und Entspannungsverfahren"
    },
    sportgesellschaft: {
      title: "Sport & Gesellschaft",
      inhalte: "Sport & Gesellschaft — Sport und Medien (Medialisierung, Sportberichterstattung, Inszenierung), Kommerzialisierung des Sports (Sponsoring, Vermarktung, Professionalisierung), Doping (Substanzen: anabole Steroide, EPO, Stimulanzien; Methoden: Blutdoping, Gendoping; gesundheitliche Risiken; ethische Bewertung; Anti-Doping-Kampf/WADA/NADA), Fairness und Fair Play (regelkonformes Verhalten, sportliche Integrität), Inklusion und Integration im Sport, Sport und Bildung, Sport und Umwelt, historische Entwicklung des Sports"
    }
  };

  const sgInfo = sgThemen[sg] || sgThemen.gesundheit;

  const systemPrompt = `Du bist Sportlehrer am bayerischen Gymnasium (Leistungsfach Sport). Erstelle eine Sporttheorie-Klausuraufgabe im IQB-Format (Abitur eA, G9 ab 2026).

AUFGABE: ${totalBE} BE, ${zeitMinuten} Minuten Bearbeitungszeit.${zeitHinweis}
${aufgabenAnzahl > 1 ? `Erstelle ${aufgabenAnzahl} separate Aufgaben (je ~${Math.round(totalBE / aufgabenAnzahl)} BE). Nummeriere die Teilaufgaben: "1a)", "1b)", ..., "2a)", "2b)" etc.` : 'Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben (a, b, c, ...). KEINE separaten Aufgaben 1, 2, 3! Die eine Hauptaufgabe hat mehrere Teilaufgaben, die zusammen die BE ergeben.'}

ANFORDERUNGEN:
- Bette die Aufgabe in einen KONKRETEN, PRAXISNAHEN Kontext ein (z.B. ein bestimmter Sportler, ein Trainingsplan, eine Wettkampfsituation, ein Gesundheitsproblem)
- Erstelle MINDESTENS 3 Teilaufgaben mit steigendem Anforderungsniveau: AFB I (Nennen/Beschreiben) → AFB II (Erläutern/Vergleichen/Analysieren) → AFB III (Bewerten/Diskutieren/Beurteilen)
- Materialien: ${totalBE < 15 ? 'KEINE Materialien nötig (Aufgabe zu klein)' : totalBE < 25 ? 'maximal 1 Material (M1)' : totalBE < 40 ? '1-2 Materialien (M1, M2)' : '2-3 Materialien (M1, M2, M3)'}, auf die sich die Teilaufgaben beziehen
- ${KEINE_LOESUNGSHINWEISE}
- Jede Teilaufgabe MUSS einen konkreten Operator und eine BE-Angabe haben

SACHGEBIET: ${sgInfo.title}
${sgInfo.inhalte}${schwerpunktZusatz}

FORMATIERUNG: Fachbegriffe klar verwenden. Einheiten korrekt angeben (z.B. Herzfrequenz in min⁻¹, VO₂max in ml/min/kg, Kraft in N).

MATERIAL-TYPEN (jedes Material braucht ein "type"-Feld):
- "statistik" + "chart_type":"bar" → "text" = vollständige Markdown-Tabelle mit echten Zahlenwerten (mind. 4 Datenzeilen)
- "diagramm" + "chart_type":"line" → "text" = vollständige Markdown-Tabelle mit echten x/y-Messwerten (mind. 5 Datenpunkte)
- "text" → "text" = vollständiger, ausformulierter Fachtext (mind. 100 Wörter), KEIN Platzhalter
- "bild" → "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Korrekt geschriebene deutsche Beschriftungen (Bezeichnungen, Achsen, Pfeile) dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte (Zahlen gehören in Tabellen). "bild_labels" optional als Fallback
KRITISCH: Materialien MÜSSEN echte Inhalte enthalten — NIEMALS Platzhalter wie "Ein Text über..." oder "(vollständiger Text...)". Schreibe den TATSÄCHLICHEN Inhalt!

Antworte NUR mit validem JSON (kein Markdown-Codeblock). EXAKTES Format:
{
  "aufgabe": "<Kontext-Einleitung: 2-3 Sätze zum Thema/Sportler/Situation>",
  "teilaufgaben": [
    {"id": "a)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "b)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>},
    {"id": "c)", "text": "<Konkrete Aufgabenstellung mit Operator>", "be": <Zahl>}
  ],
  "gesamt_be": ${totalBE},
  "sachgebiet": "${sg}",
  "material": [
    {"id": "M1", "titel": "<Titel>", "type": "<statistik|diagramm|text|bild>", "text": "<ECHTER Inhalt>"}
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
    console.error("generate-sport error:", detail);
    return jsonResponse({ error: "Sport-Fehler: " + detail.substring(0, 200) }, 500, env);
  }

  let content;
  try {
    content = extractJSON(openaiRes);
  } catch (e) {
    console.error("generate-sport JSON parse error:", e.message, "Response preview:", (openaiRes || "").substring(0, 300));
    return jsonResponse({ error: "Aufgabe konnte nicht generiert werden. Bitte erneut versuchen." }, 500, env);
  }

  // Materialien auf Platzhalter prüfen und ggf. nachgenerieren
  if (content.material && content.material.length) {
    content.material = await repairPlaceholderMaterials(env, content.material, "Sport");
  }

  return jsonResponse(content, 200, env);
}

/* ================= SPORT: GRADE ================= */
export async function handleGradeSport(request, env) {
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

  const rubricPrompt = `Du bewertest eine Sporttheorie-Klausur (Bayern, Leistungsfach Sport eA, Abitur ab 2026) nach dem BE-System.

BEWERTUNGSREGELN:
- Bewerte JEDE Teilaufgabe einzeln mit BE (0 bis max BE der Teilaufgabe)
- Pro Teilaufgabe bewerte: Fachsprache, sportwissenschaftliche Korrektheit, logische Argumentation, Verwendung von Fachbegriffen, Darstellung sporttheoretischer Zusammenhänge
- Korrekte Fachsprache (z.B. "Superkompensation", "anaerobe Schwelle", "biomechanisches Prinzip") wird positiv bewertet
- Korrekte Anwendung sportwissenschaftlicher Konzepte und Modelle
- Folgefehler: Wenn ein falsches Zwischenergebnis korrekt weiterverwendet wird, Punkte für den korrekten Lösungsweg
- Max BE gesamt: ${maxBE}

ANTWORT-FORMAT:
- Sporttheorie-typische Darstellungsformen sind erwünscht: Trainingspläne, Tabellen, Diagramme, Skizzen, Periodisierungsschemata
- Stichpunkte bei Aufzählungen, Vergleichen und Beschreibungen sind völlig normal – KEIN Punktabzug dafür
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

  const bilderHinweisSport = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisSport + UEBUNGSAUFGABEN_ANWEISUNG },
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

/* ================= SPORT: MODEL ANSWER ================= */
export async function handleModelAnswerSport(request, env) {
  const { aufgabe, teilaufgaben, gesamt_be, sachgebiet, material } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Sport-Oberstufenschüler am bayerischen Gymnasium (Leistungsfach Sport, eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung auf DEUTSCH.

WICHTIG:
- Verwende korrekte sportwissenschaftliche Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an, die dafür vergeben werden
- Begründe Ansätze kurz (z.B. "nach dem Prinzip der progressiven Belastungssteigerung")
- Formatiere als Markdown mit Überschriften für jede Teilaufgabe
- Am Ende: Zusammenfassung der erreichten BE

SPORT-SPEZIFISCHE REGELN:
- Fachbegriffe korrekt verwenden (Superkompensation, anaerobe Schwelle, Biomechanik, Salutogenese etc.)
- Trainingsmethoden und -prinzipien korrekt benennen und erklären
- Sportwissenschaftliche Modelle richtig darstellen
- Einheiten korrekt verwenden (HF in min⁻¹, VO₂max in ml/min/kg)`;

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

/* ================= SPORT: PARSE TASK ================= */
export async function handleParseTaskSport(request, env) {
  const { images } = await request.json();
  if (!images || !images.length) {
    return jsonResponse({ error: "Keine Bilder." }, 400, env);
  }

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Extrahiere die Sporttheorie-Aufgabe aus diesen Bildern. Gib die Aufgabenstellung vollständig wieder, einschließlich aller Abbildungen (beschrieben), Diagramme, Tabellen und Teilaufgaben. Verwende korrekte sportwissenschaftliche Fachbegriffe. Antworte NUR JSON: {\"task_instruction\": \"...\", \"primary_meta\": \"Quelle falls erkennbar\"}" },
        ...images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
      ]
    }
  ];

  const openaiRes = await callOpenAI(env, messages, 4000, { model: "gpt-5.2", temperature: 0.2 });
  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}


export async function handleGenerateAbiturSport(request, env) {
  const body = await request.json();

  // Sport Abitur: nur eA (Leistungsfach), 3 Aufgaben (1 wählen), 100 BE, 180 min
  const beProAufgabe = 100;
  const gesamtBE = 100;
  const pruefungsdauer = 180;
  const anzahlAufgaben = 3;
  const wahlAnzahl = 1;

  const systemPrompt = `Du bist ein Sport-Experte für das bayerische Abitur (eA, G9, ab 2026).
Erstelle eine VOLLSTÄNDIGE schriftliche Sport-Abiturprüfung (Leistungsfach Sport, Sporttheorie) exakt im Stil der ISB-Beispielaufgaben.

PRÜFUNGSSTRUKTUR (eA Leistungsfach Sport):
- Prüfungsdauer: ${pruefungsdauer} Minuten
- ${anzahlAufgaben} Aufgaben zur Auswahl, der Schüler wählt ${wahlAnzahl} davon
- Jede Aufgabe: ${beProAufgabe} BE

LERNBEREICHE (LehrplanPLUS Sporttheorie G9 Bayern ab 2026):
LB1 – Sportbiologie/Trainingslehre (Sp12 LB1): Trainingsprinzipien, Superkompensation, Reizstufenregel. Sportbiologische Grundlagen: Bewegungsapparat, Skelettmuskulatur (Muskelfasertypen ST/FT, Kontraktionsformen). Krafttraining (Maximalkraft, Schnellkraft, Kraftausdauer). Energiebereitstellung (anaerob-alaktazid, anaerob-laktazid, aerob). Herz-Kreislauf-System. Ausdauertraining (aerobe/anaerobe Schwelle, Dauer-/Intervallmethode). Schnelligkeitstraining. Beweglichkeitstraining. Trainingsplanung (Makro-/Meso-/Mikrozyklus). Ernährung.
LB2 – Bewegungslehre (Sp12 LB2): Biomechanische Prinzipien (Anfangskraft, Beschleunigungswege, Impulserhaltung, Gegenwirkung, Koordination von Teilimpulsen). Körperschwerpunkt, Körperachsen. Phasenmodell (Vorbereitungs-, Haupt-, Endphase). Motorisches Lernen (Grobkoordination, Feinkoordination, variable Verfügbarkeit). Koordinative Fähigkeiten. Technik-/Taktiktraining.
LB3 – Sport und Gesundheit (Sp13 LB3): Gesundheitsmodelle (Salutogenese, biopsychosoziales Modell). Sportverletzungen (Prävention, PECH-Regel). Ernährung. Doping (Substanzen, Methoden, ethische Bewertung, WADA/NADA).
LB4 – Psychologische, soziale und gesellschaftspolitische Aspekte (Sp13 LB4): Motivation (intrinsisch/extrinsisch, Risikowahl-Modell). Emotion (Angst, Flow, Yerkes-Dodson). Aggression. Fairness. Sport und Medien. Inklusion. Sport als Bildungsfaktor.

AUFGABENSTRUKTUR — EXAKT WIE ISB-BEISPIELAUFGABEN:
Jede Aufgabe ist um einen SPORTPRAKTISCHEN KONTEXT aufgebaut (z.B. Zehnkampf, Mountainbiken, Volleyball, Schwimmen, Fußball, Turnen, Basketball, Klettern, Triathlon).
Jede Aufgabe integriert MEHRERE Lernbereiche — typischerweise:
- "Sportbiologie/Trainingslehre und Bewegungslehre" (LB1+LB2)
- Optional zusätzlich: "Psychologische, soziale und gesellschaftspolitische Bedeutung des Sports" (LB4)
- Oder: "Sport und Gesundheit" (LB3)

THEMATISCHE BLÖCKE (ISB-Struktur):
Jede Aufgabe hat 3-5 thematische Blöcke (nummeriert 1, 2, 3, 4, ggf. 5).
Jeder Block hat einen EINLEITUNGSTEXT, der den thematischen Kontext setzt.
Unter jedem Block folgen Teilaufgaben (1.1, 1.2, 2.1, 2.2, 3.1, 3.2 usw.).
Ein Block kann auch nur aus einer einzelnen Teilaufgabe bestehen (z.B. Block 4 mit nur Aufgabe 4, ohne 4.1).

Beispiel-Blockstruktur einer ISB-Aufgabe zum Zehnkampf:
- Block 1 (Bewegungslehre, ~25 BE): Einleitung über Wurfdisziplinen → 1.1 Phasenstruktur vergleichen (16 BE), 1.2 Koordinative Fähigkeiten (9 BE)
- Block 2 (Energiebereitstellung/Ernährung, ~24 BE): Einleitung über energetische Anforderungen → 2.1 Energieliefernde Prozesse (12 BE), 2.2 Ernährung (12 BE)
- Block 3 (Trainingslehre/Technik, ~39 BE): Einleitung über Trainingsgestaltung → 3.1 Schnelligkeit (12 BE), 3.2 Einflussgrößen (8 BE), 3.3 Techniktraining (11 BE), 3.4 Übungsreihe (8 BE)
- Block 4 (Gesellschaft, ~12 BE): Zitat + Bewertungsaufgabe (12 BE)

ANFORDERUNGSBEREICHE:
- AFB I (ca. 25%): "Nennen Sie", "Beschreiben Sie", "Geben Sie an", "Stellen Sie dar"
- AFB II (ca. 55%): "Erläutern Sie", "Erklären Sie", "Vergleichen Sie", "Analysieren Sie", "Ordnen Sie zu"
- AFB III (ca. 20%): "Bewerten Sie", "Beurteilen Sie", "Diskutieren Sie", "Erörtern Sie"

MATERIALIEN — ISB-STIL:
Materialien heißen "Abb. 1", "Abb. 2", "Abb. 3" (für Bilder, Diagramme, Schaubilder) oder "Blogauszug – Teil 1", "Textquelle 1", "Tabelle 1" etc. NICHT "M1", "M2"!
Sie sind thematisch in die Aufgabe eingebettet und werden in den Teilaufgaben direkt referenziert ("vgl. Abb. 1", "unter Berücksichtigung von Abb. 2").
Pro Aufgabe 2-4 Materialien. Typen:
- **"bild"** — Schaubilder, Diagramme, anatomische Darstellungen. "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Korrekt geschriebene deutsche Beschriftungen (Bezeichnungen, Achsen, Pfeile) dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte (Zahlen gehören in Tabellen). "bild_labels" optional als Fallback. "titel" = z.B. "Abb. 1: Muskelgruppen"
- **"foto"** — Bewegungsabläufe, Bildreihen, Sportgeräte, Spielfelder, Sportstätten. "text" = Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen! "titel" = z.B. "Abb. 2: Speerwurf-Anlauf". Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
- **"diagramm"** — Kurvenverläufe (Laktat, HF, Streckenprofil). "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten. "chart_type": "line". "titel" = z.B. "Abb. 2: Laktatleistungskurve"
- **"statistik"** — Datentabellen (Leistungswerte, Testergebnisse). "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten. "chart_type": "bar". "titel" = z.B. "Tabelle 1: Testergebnisse"
- **"text"** — Blogauszüge, Zitate, Fachtexte, Quellenangaben. "text" = vollständiger Fließtext (mind. 80-200 Wörter). "titel" = z.B. "Blogauszug – Teil 1" oder "Textquelle 1"

WICHTIG:
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben!
- KRITISCH: Für "statistik" und "diagramm": "text" = Markdown-Tabelle mit ECHTEN Zahlenwerten
- KRITISCH: Für "bild": "text" = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt. Korrekt geschriebene deutsche Beschriftungen dürfen direkt im Bild stehen — erfinde dabei KEINE Zahlenwerte. "bild_labels" als Objekt MUSS mitgeliefert werden.
- Pro Aufgabe: MINDESTENS 1x "bild" oder "diagramm" + 1x "text"
- Aufgaben müssen fachlich korrekt und eindeutig lösbar sein
- ${KEINE_LOESUNGSHINWEISE}

SPORT-SPEZIFISCHE NOTATION:
- Einheiten korrekt: HF in min⁻¹, VO₂max in ml/min/kg, Kraft in N, Laktat in mmol/l
- Energiebereitstellung: ATP, CP, Glykogen, aerob/anaerob
- Trainingszonen: GA1, GA2, WSA, Schwellenbereich

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "aufgaben": [
    {
      "id": "Aufgabe 1",
      "titel": "Zehnkampf",
      "lernbereiche": ["Sportbiologie/Trainingslehre und Bewegungslehre", "Psychologische, soziale und gesellschaftspolitische Bedeutung des Sports"],
      "material": [
        {"id": "Abb. 1", "titel": "Abb. 1: Speerwurf", "type": "bild", "text": "<Bildprompt auf Englisch, deutsche Beschriftungen erlaubt>", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}},
        {"id": "Abb. 2", "titel": "Abb. 2: Diskuswurf", "type": "bild", "text": "<Bildprompt auf Englisch, deutsche Beschriftungen erlaubt>", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}}
      ],
      "teilaufgaben": [
        {"id": "1", "text": "Mehrkämpferinnen und Mehrkämpfer gelten als die Königinnen bzw. die Könige der Leichtathletik...", "be": 0, "typ": "block"},
        {"id": "1.1", "text": "Stellen Sie Gemeinsamkeiten und Unterschiede hinsichtlich der Bewegungsstruktur... (vgl. Abb. 1 und 2) gegenüber!", "be": 16},
        {"id": "1.2", "text": "Beschreiben Sie drei koordinative Fähigkeiten...", "be": 9},
        {"id": "2", "text": "Die zwei Wettkampftage sind für die Athleten insbesondere aus energetischer Sicht sehr kräftezehrend.", "be": 0, "typ": "block"},
        {"id": "2.1", "text": "Beschreiben Sie die unterschiedlichen energieliefernden Prozesse...", "be": 12},
        {"id": "4", "text": "Bewerten Sie diese Aussage!", "be": 12}
      ],
      "gesamt_be": ${beProAufgabe}
    }
  ],
  "level": "eA",
  "pruefungsdauer": ${pruefungsdauer},
  "gesamt_be": ${gesamtBE}
}`;

  const userPrompt = `Erstelle eine vollständige schriftliche Sport-Abiturprüfung (Leistungsfach, eA, ${gesamtBE} BE) im exakten ISB-Stil.
${anzahlAufgaben} Aufgaben à ${beProAufgabe} BE (Schüler wählt ${wahlAnzahl}).
Prüfungsdauer: ${pruefungsdauer} Minuten.
WICHTIG:
- Jede Aufgabe um einen konkreten sportpraktischen Kontext (z.B. Zehnkampf, Mountainbiken, Volleyball, Schwimmen, Fußball)
- Jede Aufgabe integriert MEHRERE Lernbereiche (typisch: Sportbiologie/Trainingslehre + Bewegungslehre + ggf. Psychologie/Gesellschaft)
- Thematische Blöcke (1, 2, 3, 4) mit Einleitungstext + Teilaufgaben (1.1, 1.2, 2.1 usw.)
- Block-Einleitungen als Teilaufgaben mit "be": 0 und "typ": "block"
- Materialien als "Abb. 1", "Abb. 2", "Blogauszug – Teil 1" etc. (NICHT M1/M2!)
- KRITISCH: Jedes Material MUSS ein "type"-Feld haben!`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 16000, { model: "gpt-5.2", temperature: 0.7 });

  const content = extractJSON(openaiRes);

  // Materialien aller Aufgabengruppen auf Platzhalter prüfen und nachgenerieren
  const aufgabenSport = content.aufgaben || content.aufgabengruppen || [];
  for (const a of aufgabenSport) {
    const mats = a.materialien || a.material || [];
    if (mats.length) {
      const repaired = await repairPlaceholderMaterials(env, mats, a.sachgebiet || "Sport");
      if (a.materialien) a.materialien = repaired;
      else if (a.material) a.material = repaired;
    }
  }

  return jsonResponse(content, 200, env);
}

/* ================= SPORT ABITUR: GRADE ================= */
export async function handleGradeAbiturSport(request, env) {
  const body = await request.json();
  const { aufgaben, student_texts, level, images } = body;

  if (!student_texts || !Object.keys(student_texts).length) {
    return jsonResponse({ error: "student_texts erforderlich." }, 400, env);
  }

  const maxBE = 100;

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

  const rubricPrompt = `Du bewertest eine schriftliche Sport-Abiturprüfung (Bayern, Leistungsfach Sport eA, G9, ab 2026) im ISB-Format.
Der Schüler hat 1 von 3 Aufgaben gewählt. Gesamt: ${maxBE} BE.
Die Aufgabe ist in thematische Blöcke gegliedert (1, 2, 3, 4) mit Teilaufgaben (1.1, 1.2, 2.1 usw.).

BEWERTUNGSREGELN:
- Bewerte jede Teilaufgabe einzeln (ignoriere Block-Einleitungen mit 0 BE)
- Bewertungskriterien: sportwissenschaftliche Fachsprache, Korrektheit, Materialauswertung (Abb., Blogauszüge, Tabellen), logische Argumentation, Darstellungsleistung
- Korrekte Fachbegriffe und Zusammenhänge → volle Punkte
- Teilweise korrekte Antworten → Teilpunkte
- Folgefehler berücksichtigen

ANTWORT-FORMAT:
- Sporttheorie-typische Darstellungsformen sind erwünscht: Trainingspläne, Tabellen, Diagramme, Skizzen, Periodisierungsschemata
- Stichpunkte bei Aufzählungen, Vergleichen und Beschreibungen sind völlig normal – KEIN Punktabzug dafür
- Fließtext ist nur bei Erläuterungen, Begründungen und Diskussionen nötig

BE → NOTENPUNKTE (ISB-Tabelle):
95% → 15 NP, 90% → 14, 85% → 13, 80% → 12, 75% → 11, 70% → 10
65% → 9, 60% → 8, 55% → 7, 50% → 6, 45% → 5, 40% → 4
33% → 3, 27% → 2, 20% → 1, <20% → 0

Antworte NUR mit validem JSON:
{
  "aufgaben_be": [
    {"id": "Aufgabe 1", "erreichte_be": <Zahl>, "max_be": ${maxBE}, "bewertung": "Markdown-Feedback"}
  ],
  "gesamt_be": <Zahl>,
  "max_be": ${maxBE},
  "note": <0-15>,
  "feedback": "<Ausführliches Markdown-Feedback, gegliedert nach thematischen Blöcken und Teilaufgaben, Stärken, Fehler, korrekte Lösungswege>"
}`;

  const bilderHinweisAbiSport = (images && images.length) ? BILDER_HINWEIS_MINT : "";
  const messages = [
    { role: "system", content: rubricPrompt + bilderHinweisAbiSport + UEBUNGSAUFGABEN_ANWEISUNG },
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

/* ================= SPORT ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturSport(request, env) {
  const { aufgaben } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Sport-Oberstufenschüler am bayerischen Gymnasium (Leistungsfach Sport, eA).
Schreibe eine vorbildliche, vollständig ausgearbeitete Musterlösung für die gewählte Aufgabe im ISB-Format.

Die Aufgabe ist in thematische Blöcke gegliedert (1, 2, 3, 4) mit Teilaufgaben (1.1, 1.2, 2.1, 2.2 usw.).
Block-Einleitungen (mit 0 BE) geben den Kontext – beantworte nur die eigentlichen Teilaufgaben.
Materialien heißen "Abb. 1", "Abb. 2", "Blogauszug – Teil 1" etc.

WICHTIG:
- Verwende korrekte sportwissenschaftliche Fachsprache
- Zeige JEDEN Lösungsschritt ausführlich
- Gib bei jedem Schritt die BE an
- Begründe Ansätze kurz
- Beziehe dich konkret auf die Materialien (Abb., Blogauszüge, Tabellen)
- Einheiten korrekt: HF in min⁻¹, VO₂max in ml/min/kg, Laktat in mmol/l
- Formatiere als Markdown mit klaren Überschriften nach thematischen Blöcken:
  ## Aufgabe: [Titel]
  ### Block 1: [Thema]
  #### Teilaufgabe 1.1 (X BE)
  ...
  #### Teilaufgabe 1.2 (X BE)
  ...
  ### Block 2: [Thema]
  ...
- Am Ende: Zusammenfassung der BE und Gesamtergebnis`;

  let userContent = "GEWÄHLTE AUFGABE:\n\n";
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
