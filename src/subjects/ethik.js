import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, BILDER_HINWEIS_TEXT, zeitanpassung, klausurZeitHinweis, skaliereTokens } from '../config.js';

export async function handleParseTaskEthik(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Ethik (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen Quellentexten, philosophischen Texten, Statistiken, Zitaten
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

/* ================= ETHIK: GENERATE ================= */
export async function handleGenerateEthik(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, unterpunkte, level, be, zeit, anzahl } = body;

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

  const lbThemen = {
    "12_1": {
      title: "Theorie und Praxis des Handelns",
      lernbereiche: "LB 12.1 (Theorie und Praxis des Handelns)",
      inhalte: `- Handlungsbegriff: Willensfreiheit, Intentionalität, Verantwortung
- Platon (Politeia): Idee des Guten, Seelenlehre, Tugenden, Höhlengleichnis
- Tugendethik (Aristoteles): Eudaimonia, Mesotes-Lehre, dianoetische/ethische Tugenden, Phronesis
- Pflichtethik (Kant): Kategorischer Imperativ, Maximen, guter Wille, Pflicht vs. Neigung, Autonomie
- Utilitarismus (Bentham, Mill): Nützlichkeitsprinzip, hedonistisches Kalkül, Handlungs-/Regelutilitarismus
- Diskursethik (Habermas): ideale Sprechsituation, Diskursregeln, kommunikatives Handeln
- Verantwortungsethik (Jonas): Prinzip Verantwortung, Heuristik der Furcht, Nachhaltigkeit
- Philosophie als Sprachkritik (Wittgenstein): Sprachspiel, Grenzen der Sprache
- Angewandte Ethik: Medizinethik, Technikethik, Wirtschaftsethik, Tierethik
- Moralische Dilemmata und Fallanalysen`,
      schwerpunkte: {
        platon: "Platons Ideenlehre, Seelenlehre und Tugenden (Politeia)",
        kant: "Kants Pflichtethik und der Kategorische Imperativ",
        utilitarismus: "Utilitarismus (Bentham/Mill) und Nützlichkeitsprinzip",
        tugend: "Aristoteles' Tugendethik und Eudaimonia",
        habermas: "Habermas' Diskursethik und kommunikatives Handeln",
        verantwortung: "Jonas' Verantwortungsethik und Nachhaltigkeit",
        angewandt: "Angewandte Ethik: Medizin, Technik, Wirtschaft"
      }
    },
    "12_2": {
      title: "Freiheit und Determination",
      lernbereiche: isEA
        ? "LB 12.2 (Erkenntnistheorie und Wissenschaftstheorie) und LB 12.3 (Freiheit und Determination)"
        : "LB 12.2 (Freiheit und Determination)",
      inhalte: isEA
        ? `- Erkenntnistheorie: Rationalismus (Descartes), Empirismus (Locke, Hume), Kants Transzendentalphilosophie
- Wissenschaftstheorie: Verifikation, Falsifikation (Popper), Paradigmenwechsel (Kuhn)
- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Freiheitsbegriff: negative und positive Freiheit (Berlin), Handlungsfreiheit vs. Willensfreiheit
- Neurowissenschaftliche Positionen (Libet-Experiment, Roth, Singer)
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit, Geworfenheit
- Freiheit und Verantwortung: Schuld, Zurechnungsfähigkeit
- Menschenwürde und Autonomie (Kant)`
        : `- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Negative und positive Freiheit
- Neurowissenschaftliche Herausforderungen der Willensfreiheit
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit
- Freiheit und Verantwortung
- Menschenwürde und Autonomie`,
      schwerpunkte: {
        willensfreiheit: "Willensfreiheit: Determinismus vs. Indeterminismus",
        neurowissenschaft: "Neurowissenschaftliche Herausforderungen der Willensfreiheit",
        sartre: "Sartres Existenzialismus und radikale Freiheit",
        erkenntnis: "Erkenntnistheorie: Rationalismus, Empirismus, Kant",
        freiheit_verantwortung: "Freiheit und Verantwortung"
      }
    },
    "13_1": {
      title: "Recht und Gerechtigkeit",
      lernbereiche: isEA
        ? "LB 13.1 (Recht und Gerechtigkeit) und LB 13.2 (Politische Ethik)"
        : "LB 13.1 (Recht und Gerechtigkeit)",
      inhalte: isEA
        ? `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens, Differenzprinzip), Nozick (Libertarismus), Aristoteles (kommutative/distributive Gerechtigkeit)
- Naturrecht und Rechtspositivismus: Radbruchsche Formel, Arendt (Banalität des Bösen, Eichmann-Prozess)
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Strafzwecktheorien (absolute/relative/Vereinigungstheorie), Tat- vs. Täterstrafrecht, Jugendstrafrecht
- Kriminalitätstheorien: Anomie-Theorie, Etikettierungsansatz
- Politische Ethik: Legitimation von Herrschaft, Gemeinwohl, Vertragstheorien (Hobbes, Locke, Rousseau)
- Globale Gerechtigkeit: Verteilungsgerechtigkeit, Klimagerechtigkeit
- Zivilcourage und ziviler Ungehorsam
- Menschenwürde (Art. 1 GG) als Grundlage des Rechtsstaats`
        : `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens, Differenzprinzip)
- Naturrecht und Rechtspositivismus
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Vergeltung, Prävention, Resozialisierung
- Vertragstheorien: Hobbes, Locke, Rousseau
- Globale Gerechtigkeit und Klimagerechtigkeit`,
      schwerpunkte: {
        rawls: "Rawls' Gerechtigkeitstheorie und das Differenzprinzip",
        naturrecht: "Naturrecht vs. Rechtspositivismus",
        menschenrechte: "Menschenrechte: Universalität und Kulturrelativismus",
        strafe: "Straftheorien: Vergeltung, Prävention, Resozialisierung",
        vertragstheorien: "Vertragstheorien: Hobbes, Locke, Rousseau",
        global: "Globale Gerechtigkeit und Klimagerechtigkeit"
      }
    },
    "13_2": {
      title: "Sinnorientierung und Lebensgestaltung",
      lernbereiche: isEA
        ? "LB 13.3 (Sinnorientierung und Lebensgestaltung) und LB 13.4 (Religionsphilosophie und Ethik)"
        : "LB 13.2 (Sinnorientierung und Lebensgestaltung)",
      inhalte: isEA
        ? `- Sinnfrage: Frankl (Logotherapie, Wille zum Sinn), Camus (Mythos des Sisyphos, Absurdität)
- Stoa (Seneca, Epiktet, Marc Aurel): Gelassenheit, Leidenschaftslosigkeit (Apatheia), Schicksalsergebenheit
- Epikur: Lustprinzip, Ataraxie, Unterscheidung natürliche/nichtnatürliche Bedürfnisse
- Existenzialismus: Sartre (Entwurf), Heidegger (Sein zum Tode)
- Glück und gelingendes Leben: Eudaimonia vs. hedonistisches Glück
- Religionsphilosophie: Gottesbeweise (ontologisch, kosmologisch, teleologisch), Theodizee
- Religionskritik: Feuerbach (Projektionsthese), Marx (Opium des Volkes), Nietzsche (Tod Gottes)
- Buddhismus und fernöstliche Perspektiven auf Leid und Erlösung
- Ethik ohne Gott: Säkulare Begründungen der Moral`
        : `- Sinnfrage: Frankl (Logotherapie, Wille zum Sinn), Camus (Absurdität)
- Stoa: Gelassenheit und Schicksalsergebenheit
- Epikur: Lustprinzip und Ataraxie
- Glück und gelingendes Leben
- Existenzialismus: Sartre und Heidegger
- Religionsphilosophie und Religionskritik`,
      schwerpunkte: {
        frankl: "Frankls Logotherapie und die Sinnfrage",
        stoa: "Stoische Philosophie: Gelassenheit und Tugend",
        epikur: "Epikurs Lustprinzip und Ataraxie",
        existenz: "Existenzialismus: Sartre und Heidegger zur Sinnfrage",
        glueck: "Glück und gelingendes Leben in der Philosophie",
        religion: "Religionsphilosophie und Religionskritik"
      }
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && lb.schwerpunkte[schwerpunkt])
    ? lb.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Lernbereichs";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Ethik (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Geben Sie … wieder!", "Stellen Sie … dar!"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Analysieren Sie …", "Vergleichen Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …"
- Verwende die offiziellen Operatoren: wiedergeben, darstellen, beschreiben, erläutern, analysieren, vergleichen, herausarbeiten, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (philosophischer Text ODER Statistik)' : totalBE < 40 ? '1-2 Materialien (philosophische Texte, Statistiken)' : '2-3 Materialien (philosophische Texte, literarische Auszüge, Statistiken)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche philosophische Quellentexte (Essays, Fachtexte, Zeitungsartikel zu ethischen Themen, Auszüge aus philosophischen Werken). NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Alltagssituationen, Symbolbilder, Natur) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - type "foto": Realistisches Foto. content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Alltagssituationen (ohne Gesichter), Symbolbilder (Waage der Gerechtigkeit, Friedenstaube), Architektur, Natur. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - type "bild": Schaubild/Infografik/Diagramm. content = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Zusätzlich MUSS das Material-Objekt ein Feld "bild_labels" enthalten: {"1": "Deutsche Beschriftung", "2": "Weitere Beschriftung", ...}. KEINE Personen!
LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen philosophisch relevanten Kontext ein (z.B. ethische Debatte, philosophisches Gedankenexperiment, aktuelles gesellschaftliches Problem)
- Das macht die Aufgabe authentischer und prüft die Fähigkeit zum philosophischen Transfer

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die ethische Problematik (Autonomie, Würde, Gerechtigkeit, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, Philosophen und Konzepten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte. Themen, Philosophen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Erkenntnistheorie/Wissenschaftstheorie als eigener LB, Politische Ethik als eigener LB, Religionsphilosophie als eigener LB), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON (keine Markdown-Codeblöcke):
{
  "task_instruction": "Vollständige Aufgabenstellung mit allen Teilaufgaben, BE-Angaben und Materialverweisen",
  "materials": [
    {"title": "Titel des Materials", "type": "text", "content": "Ausführlicher Materialtext (400-800 Wörter)", "source": "Autor, Quelle, Datum"},
    {"title": "Statistik: ...", "type": "statistik", "content": "| Spalte1 | Spalte2 |\\n|---|---|\\n| Daten | ... |", "source": "Institut, Jahr"},
    {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""},
    {"title": "Foto: ...", "type": "foto", "content": "Prompt KOMPLETT auf Englisch (5-10 Sätze). Realistisches Foto. KEINE Personen!", "source": ""}
  ],
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Aufgabe"
}`;

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Ethik:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 2-3 passende Materialien (philosophische Texte, Statistiken, plus 1 Bild).
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

/* ================= ETHIK: GRADE ================= */
export async function handleGradeEthik(request, env) {
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

/* ================= ETHIK: MODEL ANSWER ================= */
export async function handleModelAnswerEthik(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Ethik (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen. Fußnoten und Quellenverweise sind erlaubt.
- Formuliere in ganzen Sätzen mit sinnvollen Übergängen
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende philosophische Fachbegriffe korrekt (z.B. Kategorischer Imperativ, Eudaimonia, Schleier des Nichtwissens, Apatheia, Ataraxie)
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, philosophisch begründetes Urteil
- Zeige multiperspektivisches Denken: Stelle verschiedene philosophische Positionen gegenüber
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

/* ================= ETHIK ABITUR: GENERATE (Teil A + B) ================= */
export async function handleGenerateAbiturEthik(request, env) {
  const body = await request.json();
  const { lernbereich, schwerpunkt, level, bearbeitungszeit } = body;

  const isEA = (level || "eA").toLowerCase() === "ea";
  const niveauLabel = isEA ? "erhöhtes Anforderungsniveau (eA)" : "grundlegendes Anforderungsniveau (gA)";
  const refZeit = isEA ? 270 : 210;
  const refBE = isEA ? 120 : 100;
  const zeitHinweis = zeitanpassung(bearbeitungszeit, refZeit, refBE);
  const bePruefungA = isEA ? "85 BE" : "75 BE";
  const bePruefungB = isEA ? "35 BE" : "25 BE";
  const beGesamt = isEA ? "120 BE" : "100 BE";

  const lbThemen = {
    "12_1": {
      title: "Theorie und Praxis des Handelns",
      lernbereiche: "LB 12.1 (Theorie und Praxis des Handelns)",
      inhalte: `- Handlungsbegriff, Willensfreiheit, Intentionalität, Verantwortung
- Pflichtethik (Kant): Kategorischer Imperativ, Maximen, guter Wille
- Utilitarismus (Bentham, Mill): Nützlichkeitsprinzip, hedonistisches Kalkül
- Tugendethik (Aristoteles): Eudaimonia, Mesotes-Lehre, Phronesis
- Verantwortungsethik (Jonas): Prinzip Verantwortung, Heuristik der Furcht
- Angewandte Ethik: Medizinethik, Technikethik, Wirtschaftsethik`
    },
    "12_2": {
      title: "Freiheit und Determination",
      lernbereiche: isEA
        ? "LB 12.2 (Erkenntnistheorie) und LB 12.3 (Freiheit und Determination)"
        : "LB 12.2 (Freiheit und Determination)",
      inhalte: `- Willensfreiheit: Determinismus, Indeterminismus, Kompatibilismus
- Negative und positive Freiheit (Berlin)
- Neurowissenschaftliche Positionen (Libet-Experiment)
- Existenzialismus (Sartre): Existenz vor Essenz, radikale Freiheit
- Freiheit und Verantwortung, Menschenwürde und Autonomie`
    },
    "13_1": {
      title: "Recht und Gerechtigkeit",
      lernbereiche: isEA
        ? "LB 13.1 (Recht und Gerechtigkeit) und LB 13.2 (Politische Ethik)"
        : "LB 13.1 (Recht und Gerechtigkeit)",
      inhalte: `- Gerechtigkeitstheorien: Rawls (Schleier des Nichtwissens), Nozick, Höffe
- Naturrecht und Rechtspositivismus, Radbruchsche Formel
- Menschenrechte: Universalität vs. Kulturrelativismus
- Strafe und Gerechtigkeit: Vergeltung, Prävention, Resozialisierung
- Vertragstheorien: Hobbes, Locke, Rousseau`
    },
    "13_2": {
      title: "Sinnorientierung und Lebensgestaltung",
      lernbereiche: isEA
        ? "LB 13.3 (Sinnorientierung) und LB 13.4 (Religionsphilosophie)"
        : "LB 13.2 (Sinnorientierung und Lebensgestaltung)",
      inhalte: `- Frankl (Logotherapie, Wille zum Sinn), Camus (Absurdität)
- Stoa: Gelassenheit, Apatheia, Schicksalsergebenheit
- Epikur: Lustprinzip, Ataraxie
- Existenzialismus: Sartre, Heidegger (Sein zum Tode)
- Glück und gelingendes Leben: Eudaimonia vs. Hedonismus`
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Ethik (ab 2026, G9).
Erstelle eine VOLLSTÄNDIGE Abiturprüfung mit Prüfungsteil A (${bePruefungA}) und Prüfungsteil B (${bePruefungB}) auf ${niveauLabel}.
Gesamtumfang: ${beGesamt}.

PRÜFUNGSTEIL A (${bePruefungA}):
- 3-4 Teilaufgaben mit steigendem Anforderungsniveau (AFB I → II → III)
- 2-3 Materialien (philosophische Texte 400-800 Wörter, Statistiken, 1 Bild)
- Verwende offizielle Operatoren: wiedergeben, darstellen, erläutern, analysieren, vergleichen, erörtern, beurteilen, Stellung nehmen
- Situiere die Aufgabe in einem philosophisch relevanten Kontext
- KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern (z.B. NICHT "Erörtern Sie die ethische Problematik (Autonomie, Würde, ...)"). Die Schüler sollen selbst herausfinden, welche Aspekte relevant sind.

PRÜFUNGSTEIL B – Ausweitung (${bePruefungB}):
- 1-2 Teilaufgaben, die den Lernbereich erweitern oder vertiefen
- Bezug zu einem ANDEREN philosophischen Ansatz oder einer aktuellen ethischen Debatte
- Höherer Reflexionsanspruch (vorwiegend AFB II-III)
- Kann auf Material aus Teil A Bezug nehmen oder neues Material einführen

LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen, Philosophen und Konzepten, die in den oben angegebenen Lernbereichen stehen. Gehe NICHT über den Lehrplan hinaus.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Diese Aufgabe ist für das GRUNDLEGENDE Anforderungsniveau (gA). Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte. Themen, Philosophen und Konzepte, die NUR im eA-Lehrplan stehen (z.B. Erkenntnistheorie/Wissenschaftstheorie als eigener LB, Politische Ethik als eigener LB, Religionsphilosophie als eigener LB, soziologische Theorien als eigener LB), dürfen NICHT vorkommen. Die Aufgabe muss in Tiefe und Komplexität dem gA-Niveau entsprechen.` : ""}

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Vollständige Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "Titel", "type": "text", "content": "Philosophischer Quelltext (400-800 Wörter)", "source": "Autor, Werk, Jahr"},
      {"title": "Statistik: ...", "type": "statistik", "content": "| ... |", "source": "Institut, Jahr"},
      {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Vollständige Aufgabenstellung Teil B (Ausweitung) mit BE",
    "materials": []
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Konkretes Thema der Prüfung"
}`;

  const userPrompt = `Erstelle eine vollständige Ethik-Abiturprüfung (Teil A + Teil B):
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
- Niveau: ${niveauLabel}
- Teil A: ${bePruefungA}, Teil B: ${bePruefungB}, Gesamt: ${beGesamt}

KRITISCH: Jedes Textmaterial in Teil A MUSS 400-800 Wörter lang sein.
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
Teil B soll eine thematische Vertiefung oder Erweiterung darstellen.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Prüfung! Verwende NUR Stoff aus dem gA-Lehrplan. Keine eA-exklusiven Lernbereiche oder Themen!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt + zeitHinweis },
    { role: "user", content: userPrompt }
  ], skaliereTokens(16000, bearbeitungszeit, refZeit));

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= ETHIK ABITUR: GRADE ================= */
export async function handleGradeAbiturEthik(request, env) {
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
    contextInfo += `Materialien:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}\n\n`;
  }

  let studentTexts = "";
  if (student_text_a) studentTexts += `Schülertext Teil A:\n${truncate(student_text_a, 12000)}\n\n`;
  if (student_text_b) studentTexts += `Schülertext Teil B:\n${truncate(student_text_b, 6000)}`;

  const korrekturAnweisung = KORREKTUR_SINGLE;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${contextInfo}\n${studentTexts}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 10000, { temperature: 0.3 });

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

/* ================= ETHIK ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturEthik(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Ethik (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen
- Fußnoten und Quellenverweise sind erlaubt
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende philosophische Fachbegriffe korrekt
- Beziehe die Materialien ein und zitiere daraus
- Zeige multiperspektivisches Denken
- Formuliere eigenständige, philosophisch begründete Urteile
- Zielumfang: 1200-1800 Wörter insgesamt

Formatiere als Markdown. Am Ende unter "---" eine kurze Reflexion.`;

  let userContent = "";
  if (task_instruction_a) userContent += `TEIL A:\n${truncate(task_instruction_a, 5000)}\n\n`;
  if (task_instruction_b) userContent += `TEIL B:\n${truncate(task_instruction_b, 3000)}\n\n`;
  if (primary_text) userContent += `MATERIAL:\n${truncate(primary_text, 15000)}\n\n`;
  if (materials && materials.length) {
    userContent += `MATERIALIEN:\n${materials.slice(0, 10).map((m, i) => `Material ${i + 1}: ${truncate(m.title, 200)}\n${truncate(m.content, 3000)}`).join("\n\n")}`;
  }

  const answer = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ], 8000, { jsonMode: false });

  return jsonResponse({ model_answer: answer }, 200, env);
}

