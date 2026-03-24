import { jsonResponse, truncate, extractJSON, buildUserContent } from '../utils.js';
import { callOpenAI } from '../openai.js';
import { KORREKTUR_SINGLE, KORREKTUR_AB, BILDER_HINWEIS_TEXT, zeitanpassung, klausurZeitHinweis } from '../config.js';

export async function handleParseTaskReligion(request, env) {
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
      text: `Diese Bilder zeigen eine Abitur-Aufgabe im Fach Evangelische Religionslehre (Bayern). Extrahiere:
1. Die Aufgabenstellung (task_instruction) - vollständig mit allen Teilaufgaben und BE-Angaben
2. Den/die Materialtext(e) (primary_text) - vollständig mit allen theologischen Texten, biblischen Quellen, Statistiken
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

/* ================= EV. RELIGION: GENERATE ================= */
export async function handleGenerateReligion(request, env) {
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
      title: "Sinnfrage und Gottesfrage / Der im-perfekte Mensch",
      lernbereiche: "LB 12.1 (Sinnfrage und Gottesfrage) und LB 12.2 (Der im-perfekte Mensch)",
      inhalte: `- Sinnfragen in Kultur und Gesellschaft, Zusammenhang Sinn- und Transzendenzvorstellungen
- Gottesfrage als existenzielle Frage: Luther (Deus absconditus), Schleiermacher (Gefühl schlechthinniger Abhängigkeit), Tillich (Gott als Grund des Seins)${isEA ? '; ggf. Barth (Offenbarungstheologie)' : ''}
- Beziehung Gottes zu den Menschen in der Bibel: Schöpfer, Befreier, Unverfügbarkeit, Menschwerdung, Passion, Auferstehung
- Verhältnis von Allmacht und Liebe Gottes: Luther (Kreuzestheologie), Bonhoeffer (ohnmächtiger Gott), Dalferth
- Theodizeefrage: Hiob, Leibniz (beste aller möglichen Welten), zeitgenössische Theologie
- Trinitätsvorstellung (Apostolisches Glaubensbekenntnis)
- Philosophische Religionskritik: Feuerbachs Projektionstheorie${isEA ? '; Marx (Opium des Volkes), Nietzsche (Tod Gottes), Freud (Illusion)' : '; ggf. weitere Position'}
- Menschenbild: Perfektion vs. Fragmentarität, Identität und Selbstkonzept
- Sünde und Gnade: Gen 1-11, Lk 15, Röm 3,21ff., Röm 7
- Rechtfertigung als Befreiung vom Perfektionszwang`,
      schwerpunkte: {
        gottesfrage: "Sinnfrage und Gottesfrage (Luther, Schleiermacher, Tillich)",
        theodizee: "Theodizee: Hiob, Leibniz und moderne Theologie",
        religionskritik: "Religionskritik: Feuerbach und weitere Positionen",
        trinitaet: "Trinität und christliches Gottesverständnis",
        anthropologie: "Menschenbild: Identität, Perfektion und Fragmentarität",
        suende: "Sünde, Vergebung und Rechtfertigung"
      }
    },
    "12_2": {
      title: "Homo faber / Christsein in der Gesellschaft",
      lernbereiche: "LB 12.3 (Homo faber) und LB 12.4 (Christsein in der Gesellschaft)",
      inhalte: `- Mensch als gestaltendes Wesen: philosophische Anthropologie
- Schöpfungsglaube: Mensch als Ebenbild Gottes, Weltgestaltungsauftrag, Sabbatruhe
- Luthers Auslegung zum 1. Artikel, Freiheit eines Christenmenschen
- Arbeit und Beruf: Luther (Berufung), Marx (Entfremdung), moderne Deutungen
- Aktuelle Arbeitswelt: Digitalisierung, Globalisierung, Gerechtigkeit
- Mensch als zoon politikon: Hobbes, Rousseau${isEA ? ', Arendt' : ''}
- Kirche in der Gesellschaft: Wahrnehmungen, Erwartungen, konziliarer Prozess
- Sozialethik: Schöpfungsbegründete Menschenwürde, Gerechtigkeit (AT-Prophetie)
- Theologische Modelle: Luthers Zwei-Reiche-Lehre, Barths Königsherrschaft Christi
${isEA ? '- Bonhoeffer (Kirche vor der Judenfrage), Befreiungstheologie, Öffentliche Theologie' : ''}`,
      schwerpunkte: {
        homo_faber: "Homo faber: Arbeit und Beruf (Luther, Marx)",
        schoepfung: "Schöpfungsglaube und Weltgestaltungsauftrag",
        freiheit: "Freiheit eines Christenmenschen (Luther)",
        kirche: "Kirche in der Gesellschaft",
        sozialethik: "Sozialethik: Zwei-Reiche-Lehre und Königsherrschaft Christi",
        politikon: "Mensch als zoon politikon"
      }
    },
    "13_1": {
      title: "Ethik: Gutes Leben und richtiges Handeln",
      lernbereiche: "LB 13.1 (Gutes Leben und richtiges Handeln) und LB 13.2 (Ethische Problemstellungen)",
      inhalte: `- Vorstellungen von gutem Leben, ethische Grundbegriffe
- Argumentationsmodelle: Situations-, Gesinnungs-, Verantwortungs-, Tugendethik
- Ethik Kants (Kategorischer Imperativ), Utilitarismus (Bentham, Mill)${isEA ? ', Diskursethik (Habermas), Theorie der Gerechtigkeit (Rawls)' : ''}
- Christliche Ethik: Rechtfertigungsglaube, Dekalog, Bergpredigt, Doppelgebot der Liebe
- Angewandte Ethik: Medizin-, Friedens-, Tier-, Wirtschafts-, Umwelt-, Medienethik
- Differenziertes ethisches Argumentieren: Konflikte, Perspektiven
- Theologische und nicht-theologische Beiträge im Gespräch`,
      schwerpunkte: {
        ethische_modelle: "Ethische Grundmodelle (Kant, Utilitarismus)",
        christliche_ethik: "Christliche Ethik: Dekalog, Bergpredigt, Doppelgebot der Liebe",
        angewandte_ethik: "Angewandte Ethik (Medizin-/Friedens-/Umweltethik)",
        argumentation: "Ethische Argumentationsmodelle",
        gutes_leben: "Vorstellungen vom guten Leben"
      }
    },
    "13_2": {
      title: "Christliche Hoffnungsbilder",
      lernbereiche: "LB 13.3 (Christliche Hoffnungsbilder – Eschatologie)",
      inhalte: `- Übergangssituation: Erwartungen, Hoffnungen, Ängste
- Zukunftsvisionen: Fortschrittsoptimismus vs. apokalyptische Szenarien
- Begrenztheit und Endlichkeit des Lebens, Tod und Trauer
- Vorstellungen vom Überwinden des Todes: Reinkarnation, Transhumanismus
- Christliche Hoffnungsbilder: Prophetische Visionen, Reich Gottes, Auferweckung Jesu
- Gericht als Durchsetzung von Gottes Gerechtigkeit, ewiges Leben
- Biblische Texte: 1 Kor 15, Offb 21f., Apostolisches Glaubensbekenntnis${isEA ? ', Jes 65, Reich-Gottes-Gleichnisse' : ''}`,
      schwerpunkte: {
        eschatologie: "Eschatologie und Reich Gottes",
        tod: "Tod, Endlichkeit und Auferstehung",
        hoffnung: "Christliche Hoffnungsbilder (prophetische Visionen, 1 Kor 15)",
        zukunft: "Zukunftsvisionen und Lebenssinn"
      }
    }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];
  const schwerpunktLabel = (schwerpunkt && schwerpunkt !== "random" && lb.schwerpunkte[schwerpunkt])
    ? lb.schwerpunkte[schwerpunkt]
    : "frei wählbar innerhalb des Lernbereichs";

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Evangelische Religionslehre (ab 2026, G9).
Erstelle eine authentische Prüfungsaufgabe für Prüfungsteil A auf ${niveauLabel}.

KLAUSUR-PARAMETER:
- Gesamt: ${totalBE} BE, Bearbeitungszeit: ${zeitMinuten} Minuten${zeitHinweis}
- Verteile die ${totalBE} BE sinnvoll auf die Teilaufgaben (Summe muss exakt ${totalBE} ergeben)
${aufgabenAnzahl > 1 ? `- Erstelle ${aufgabenAnzahl} separate Aufgaben (je ca. ${Math.round(totalBE / aufgabenAnzahl)} BE)
- Nummeriere: "Aufgabe 1:", "Aufgabe 2:", etc.
- Jede Aufgabe kompakt und kleinschrittiger` : '- Erstelle GENAU 1 Hauptaufgabe mit Teilaufgaben. KEINE separaten Aufgaben 1, 2, 3!'}

STRUKTUR DER AUFGABE:
- Die Aufgabe besteht aus 3-4 Teilaufgaben mit steigendem Anforderungsniveau
- Teilaufgabe 1: Anforderungsbereich I (Reproduktion) – z.B. "Stellen Sie … dar!", "Beschreiben Sie …"
- Teilaufgaben 2-3: Anforderungsbereich II (Transfer/Reorganisation) – z.B. "Erläutern Sie …", "Vergleichen Sie …", "Herausarbeiten Sie …"
- Letzte Teilaufgabe: Anforderungsbereich III (Reflexion/Problemlösung) – z.B. "Erörtern Sie …", "Beurteilen Sie …", "Nehmen Sie Stellung …", "Gestalten Sie …"
- Verwende die offiziellen Operatoren: darstellen, beschreiben, zusammenfassen, wiedergeben, erläutern, analysieren, vergleichen, herausarbeiten, einordnen, erörtern, beurteilen, bewerten, Stellung nehmen, gestalten
- Gib bei jeder Teilaufgabe die BE (Bewertungseinheiten) an, Summe = ${bePruefungA}

MATERIALIEN:
- Materialien: ${totalBE < 20 ? '1 Material (theologischer Text ODER biblische Quelle)' : totalBE < 40 ? '1-2 Materialien (theologische Texte, biblische Quellen)' : '2-3 Materialien (theologische Texte, biblische Quellen, philosophische Auszüge, Zeitungsartikel)'}
- Textmaterialien: MINDESTENS 400-800 Wörter pro Material! Authentische, ausführliche theologische/philosophische Quellentexte. NICHT kürzer als 400 Wörter!
- Statistiken: Als Markdown-Tabelle mit plausiblen Zahlen, mindestens 6-10 Datenzeilen (z.B. Umfragen zu Glauben, Kirchenmitgliedschaft, ethische Einstellungen)
- Materialien werden in der Aufgabenstellung mit M 1, M 2 etc. referenziert
- Erstelle ergänzende Materialien NUR wenn sie in den Aufgabenstellungen referenziert werden ("mithilfe von M 2", "anhand von M 2"). Keine ungenutzten Materialien! BEVORZUGE "foto" (Sakralbauten, religiöse Orte, Symbolbilder, sakrale Räume) oder "statistik" (Tabellen mit echten Daten). Verwende "bild" NUR wenn ein Schaubild wirklich nötig ist:
  - type "foto": Realistisches Foto. content = Prompt KOMPLETT auf Englisch (5-10 Sätze). Z.B. Kirchenarchitektur, religiöse Symbole, sakrale Räume, Friedhöfe, Gedenkstätten, Natur. KEINE Personen! Falls das Foto beschriftete Elemente zeigt, optional "bild_labels" mitliefern.
  - type "bild": Schaubild/Infografik/Diagramm. content = Bildprompt KOMPLETT auf Englisch (5-10 Sätze). NUR visuellen Inhalt beschreiben. Verwende NUR NUMMERN (1, 2, 3...) als Beschriftungen im Bild statt Text. KEINE Wörter oder Sätze im Bild! Zusätzlich MUSS das Material-Objekt ein Feld "bild_labels" enthalten: {"1": "Deutsche Beschriftung", "2": "Weitere Beschriftung", ...}. KEINE Personen!
LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
Lernbereiche: ${lb.lernbereiche}
Relevante Inhalte:
${lb.inhalte}${schwerpunktZusatz}

SITUIERUNG:
- Bette die Aufgabe in einen theologisch relevanten Kontext ein (z.B. ethische Debatte, gesellschaftliche Frage mit religiöser Dimension, biblische Thematik, kirchengeschichtliches Ereignis)

KEINE LÖSUNGSHINWEISE: Nenne in den Aufgabenstellungen KEINE konkreten Beispiele, Hinweise oder Lösungsansätze in Klammern.

LEHRPLAN-TREUE: Stelle NUR Aufgaben zu Themen und Konzepten, die in den oben angegebenen Lernbereichen stehen.
${!isEA ? `⚠️ STRENGE gA-BESCHRÄNKUNG: Verwende AUSSCHLIESSLICH die oben für gA aufgelisteten Inhalte.` : ""}

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

  const userPrompt = `Erstelle eine Prüfungsaufgabe (Prüfungsteil A) für Evangelische Religionslehre:
- Lernbereich: ${lernbereich?.replace("_", "/") || "12/1"}
- Schwerpunkt: ${schwerpunktLabel}
- Niveau: ${niveauLabel}

Die Aufgabe soll 3-4 Teilaufgaben umfassen mit steigendem Anforderungsniveau (AFB I → II → III).
Erstelle 2-3 passende Materialien (theologische Texte, biblische Quellen, Statistiken, plus 1 Bild).
KRITISCH: Jedes Textmaterial MUSS 400-800 Wörter lang sein!
AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!
Summe der BE für Prüfungsteil A: ${bePruefungA}.
${!isEA ? `STRENG BEACHTEN: Dies ist eine gA-Aufgabe!` : ""}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= EV. RELIGION: GRADE ================= */
export async function handleGradeReligion(request, env) {
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

/* ================= EV. RELIGION: MODEL ANSWER ================= */
export async function handleModelAnswerReligion(request, env) {
  const { task_instruction, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Evangelische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche, vollständig ausformulierte Musterlösung auf DEUTSCH — so, wie ein Schüler sie in der Prüfung abgeben würde.

WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen
- Fußnoten und Quellenverweise sind erlaubt
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben der Aufgabenstellung
- Verwende theologische Fachbegriffe korrekt (z.B. Theodizee, Trinität, Rechtfertigung, Sünde, Gnade, Zwei-Reiche-Lehre, Eschatologie, Königsherrschaft Christi)
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe das Material ein und zitiere daraus
- Beachte die Operatoren und Anforderungsbereiche
- Formuliere bei Reflexionsaufgaben ein eigenständiges, theologisch begründetes Urteil
- Zielumfang: 800-1200 Wörter

Formatiere als Markdown mit klaren Überschriften für jede Teilaufgabe. Am Ende unter "---" eine kurze Reflexion.`;

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

/* ================= EV. RELIGION ABITUR: GENERATE (Teil A + B) ================= */
export async function handleGenerateAbiturReligion(request, env) {
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
      title: "Sinnfrage und Gottesfrage / Der im-perfekte Mensch", lernbereiche: "LB 12.1 und LB 12.2",
      inhalte: `- Gottesfrage, Theodizee, Trinität, Religionskritik (Feuerbach)
- Menschenbild: Identität, Fragmentarität, Sünde und Rechtfertigung` },
    "12_2": {
      title: "Homo faber / Christsein in der Gesellschaft", lernbereiche: "LB 12.3 und LB 12.4",
      inhalte: `- Schöpfungsglaube, Arbeit und Beruf (Luther, Marx), Freiheit eines Christenmenschen
- Kirche in der Gesellschaft, Sozialethik, Zwei-Reiche-Lehre` },
    "13_1": {
      title: "Ethik: Gutes Leben und richtiges Handeln", lernbereiche: "LB 13.1 und LB 13.2",
      inhalte: `- Ethische Grundmodelle (Kant, Utilitarismus), christliche Ethik (Dekalog, Bergpredigt)
- Angewandte Ethik, ethische Argumentationsmodelle` },
    "13_2": {
      title: "Christliche Hoffnungsbilder", lernbereiche: "LB 13.3",
      inhalte: `- Eschatologie, Reich Gottes, Tod und Auferstehung
- Zukunftsvisionen, christliche Hoffnungsbilder (1 Kor 15, Offb 21f.)` }
  };

  const lb = lbThemen[lernbereich] || lbThemen["12_1"];

  const schwerpunktZusatz = schwerpunkt && schwerpunkt !== "random"
    ? '\n\n⚠️ STRIKTE THEMENEINSCHRÄNKUNG — NUR DIESEN SCHWERPUNKT VERWENDEN:\n' + schwerpunkt + '\nALLE Teilaufgaben müssen sich direkt auf diesen Schwerpunkt beziehen. Erstelle KEINE Aufgaben zu anderen Themen des Lehrplans!'
    : '';

  const systemPrompt = `Du bist ein Experte für das bayerische Abitur im Fach Evangelische Religionslehre (ab 2026, G9).
Erstelle eine vollständige Abiturprüfung (Teil A + Teil B) auf ${niveauLabel}.
${zeitHinweis}

PRÜFUNGSSTRUKTUR:
- Prüfungsteil A: ${bePruefungA} – 3-4 Teilaufgaben mit Materialien, steigendes Anforderungsniveau (AFB I → II → III)
- Prüfungsteil B (Ausweitung): ${bePruefungB} – 1-2 Transferaufgaben OHNE zusätzliche Materialien, die über den Lernbereich von Teil A hinausgehen
- Gesamt: ${beGesamt}

TEIL A – LERNBEREICH: ${lernbereich?.replace("_", "/") || "12/1"} – ${lb.title}
${lb.inhalte}${schwerpunktZusatz}

MATERIALIEN für Teil A:
- 2-3 Materialien (theologische/biblische Texte, Statistiken, plus 1 Bild)
- Textmaterialien MINDESTENS 400-800 Wörter
- AUFGABENBEZUG: JEDES bereitgestellte Material MUSS in mindestens einer Teilaufgabe direkt referenziert und verwendet werden. Es darf KEINE Materialien ohne Aufgabenbezug geben!

TEIL B – AUSWEITUNG:
- Geht thematisch ÜBER den Lernbereich von Teil A hinaus
- Verknüpft mit einem ANDEREN Lernbereich der Ev. Religionslehre
- Erfordert Transfer und eigenständige theologische Reflexion

Antworte NUR mit validem JSON:
{
  "teil_a": {
    "task_instruction": "Aufgabenstellung Teil A mit allen Teilaufgaben und BE",
    "materials": [
      {"title": "...", "type": "text", "content": "400-800 Wörter", "source": "..."},
      {"title": "Schaubild: ...", "type": "bild", "content": "Bildprompt auf Englisch. Visuellen Inhalt beschreiben, NUR Nummern als Marker im Bild, KEINE Wörter.", "bild_labels": {"1": "Beschriftung 1", "2": "Beschriftung 2"}, "source": ""}
    ]
  },
  "teil_b": {
    "task_instruction": "Aufgabenstellung Teil B (Ausweitung) mit BE"
  },
  "lernbereich": "${lernbereich || "12_1"}",
  "thema": "Thema"
}`;

  const openaiRes = await callOpenAI(env, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Erstelle eine vollständige Abiturprüfung für Ev. Religionslehre, Lernbereich ${lernbereich?.replace("_", "/") || "12/1"}, ${niveauLabel}.` }
  ], 14000);

  const content = extractJSON(openaiRes);
  return jsonResponse(content, 200, env);
}

/* ================= EV. RELIGION ABITUR: GRADE ================= */
export async function handleGradeAbiturReligion(request, env) {
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

  const korrekturAnweisung = KORREKTUR_AB;

  const bilderHinweis = (images && images.length) ? BILDER_HINWEIS_TEXT : "";
  const messages = [
    { role: "system", content: truncate(rubric_prompt, 5000) + bilderHinweis + korrekturAnweisung },
    { role: "user", content: buildUserContent(`${contextInfo}\nSchülertext Teil A:\n${truncate(student_text_a || "", 15000)}\n\nSchülertext Teil B:\n${truncate(student_text_b || "", 10000)}`, images) }
  ];

  const openaiRes = await callOpenAI(env, messages, 8000, { temperature: 0.3 });

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
      korrektur_text_a: "", korrektur_text_b: "",
      fehlende_aspekte: [],
      uebungsaufgaben: []
    }, 200, env);
  }
}

/* ================= EV. RELIGION ABITUR: MODEL ANSWER ================= */
export async function handleModelAnswerAbiturReligion(request, env) {
  const { task_instruction_a, task_instruction_b, primary_text, materials } = await request.json();

  const systemPrompt = `Du bist ein sehr guter Oberstufenschüler am bayerischen Gymnasium im Fach Evangelische Religionslehre (Leistungsfach).
Schreibe eine vorbildliche Musterlösung für die GESAMTE Abiturprüfung (Teil A + Teil B) auf DEUTSCH.

WICHTIG – GANZE SÄTZE:
- Verwende vollständige Sätze, keine Stichpunkte oder Aufzählungen
- Fußnoten und Quellenverweise sind erlaubt
- Strukturiere mit Absätzen und ggf. Überschriften pro Teilaufgabe

Inhaltlich:
- Bearbeite ALLE Teilaufgaben beider Prüfungsteile
- Verwende theologische Fachbegriffe korrekt
- Beziehe biblische Texte und theologische Positionen ein
- Beziehe die Materialien ein und zitiere daraus
- Formuliere eigenständige, theologisch begründete Urteile
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

