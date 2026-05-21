import { GoogleGenAI, Modality } from "@google/genai";
import { AudioProcessor, AudioPlayer } from "./audio-utils";

/** Erkennt Gemini-"Thinking"-Texte die nicht als Transkript angezeigt werden sollen */
function isThinkingText(text: string): boolean {
  const t = text.trim();
  // Markdown-Bold-Headers (typisch für Gemini Thinking, z.B. "**Offering Support Now**")
  if (/\*\*[^*]+\*\*/.test(t)) return true;
  // Mehrere englische selbstreferentielle Phrasen = Thinking
  const selfRef = t.match(/\b(I'm |I'll |I should |I need to |I understand |Let me |I will |I want to |I've |My approach|I can |I have )/gi);
  if (selfRef && selfRef.length >= 2) return true;
  return false;
}

/**
 * Erkennt Silence-/Platzhalter-Texte aus der Spracherkennung.
 * Diese entstehen typischerweise wenn das Mikrofon kein Sprachsignal liefert
 * (z. B. während längerer Sprechpausen im Referat) und der STT-Service einen
 * Platzhalter ausgibt — fachlich wertloser Inhalt, der aber im Transkript
 * irritierend wirkt, das Modell zu unnötigen Reaktionen verleitet und in der
 * Feedback-Generierung Token verbraucht.
 */
function isSilencePlaceholder(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  // Sehr kurze Punkt-/Pause-Fragmente
  if (/^[.\s…·•\-–—]+$/.test(t)) return true;
  // Klammer-Tags wie [silence], (no speech), <pause>
  if (/^[\[(<][^\]\)>]+[\])>]$/.test(t)) {
    const inner = t.slice(1, -1).toLowerCase().trim();
    if (/(silence|silent|stille|schweig|pause|no speech|kein\s+sprech|background|ger(äu|au)sch|noise|inaudible|unintelligible)/.test(inner)) return true;
  }
  // Wortgleiche Platzhalter (Deutsch + Englisch) — auch in Anführungszeichen
  const stripped = t.replace(/^["'„»«]+|["'„»«.!?…]+$/g, '').toLowerCase().trim();
  const placeholders = new Set([
    'schweigen', 'stille', 'pause', 'kein sprechen', 'keine sprache',
    'silence', 'silent', 'no speech', 'no audio', 'inaudible', 'unintelligible',
    '...', '…', '...?', '…?', 'mhm', 'mh', 'mm', 'hm',
  ]);
  if (placeholders.has(stripped)) return true;
  // "(Schweigen)", "Schweigen.", "Stille."
  if (/^(schweigen|stille|silence|pause)[.!?…]*$/i.test(stripped)) return true;
  return false;
}

export const SUBJECTS = [
  'Biologie', 'Chemie', 'Deutsch', 'Englisch', 'Ethik',
  'Evangelische Religionslehre', 'Französisch', 'Geographie', 'Geschichte', 'Informatik',
  'Italienisch', 'Katholische Religionslehre', 'Kunst', 'Latein', 'Mathematik', 'Physik',
  'Politik und Gesellschaft', 'Spanisch', 'Sport', 'Wirtschaft und Recht'
] as const;

export type ExamLevel = 'gA' | 'eA';

export interface ChartDaten {
  typ: 'balken' | 'kreis';
  labels: string[];
  werte: number[];
  einheit?: string;
}

export interface MaterialImpuls {
  typ: 'zitat' | 'statistik' | 'quelle' | 'schaubild';
  titel: string;
  inhalt: string;
  quellenangabe: string;
  chartDaten?: ChartDaten;
}

export interface GeoGebraGrafik {
  id: string;
  type: 'graphing' | '3d' | 'probability';
  commands: string[];
}

/** Diagramm-Block für die Vorbereitungs-/Referat-Phase (zusätzlich zu Text-Material). */
export interface ChartBlock {
  titel: string;
  chartDaten: ChartDaten;
  quellenangabe?: string;
}

export interface ExamMaterial {
  aufgabenstellung: string;
  material: string;
  hinweise: string;
  grafiken?: GeoGebraGrafik[];
  materialImpulse?: MaterialImpuls[];
  charts?: ChartBlock[];
}

export interface ExamConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  isMathe?: boolean; // Mathe-Kolloquium: Gebiete statt Halbjahre
  topicScope?: TopicScope; // Umfang der Schwerpunkt-Fragen
}

export type ExamMode = 'gesamt' | 'referat' | 'fragen';

export type PrueferTyp = 'standard' | 'streng' | 'freundlich' | 'zeitdruck' | 'detailfragen';

// Im Schwerpunkthalbjahr: 'strikt' = nur konkretes Schwerpunktthema,
// 'gemischt' = auch andere Themen aus dem Halbjahr
export type TopicScope = 'strikt' | 'gemischt';

const PRUEFER_PRESETS: Record<PrueferTyp, string> = {
  standard: 'Freundlich und fair. Gib dem Prüfling das Gefühl, dass du auf seiner Seite bist. Bei Fehlern: behutsame Nachfrage ("Sind Sie sich da sicher?") statt sofortige Korrektur. Bei Stocken: ermutigende Hilfestellung ("Denken Sie nochmal an..."). Lobe gute Ansätze kurz ("Gut", "Genau"). Natürlicher, entspannter Gesprächsfluss — wie ein wohlwollendes Fachgespräch, kein Verhör.',
  streng: 'Sehr sachlich und fordernd. Hake bei Ungenauigkeiten sofort nach. Akzeptiere keine vagen Antworten — verlange präzise Fachbegriffe und konkrete Beispiele. Kein Lob für Selbstverständliches. Halte den Prüfling unter Druck, bleibe aber fair.',
  freundlich: 'Besonders ermutigend und unterstützend. Nicke zustimmend, gib positive Rückmeldung bei guten Ansätzen. Bei Schwierigkeiten gib sanfte Hinweise statt harter Nachfragen. Lobe gute Fachsprache und schlüssige Argumente.',
  zeitdruck: 'Halte dich streng an die Zeit. Nach 10 Min Referat sofort unterbrechen. Fragen zügig stellen, bei zu langen Antworten freundlich aber bestimmt zum nächsten Punkt übergehen. Kein Abwarten — wenn der Prüfling zögert, nächste Frage.',
  detailfragen: 'Stelle besonders tiefgehende Nachfragen. Gehe bei jedem Thema in die Tiefe — fordere Begründungen, Zusammenhänge und Transfer-Leistungen. Auf jede Antwort folgt ein "Warum?" oder "Können Sie das mit einem Beispiel belegen?".'
};

// Fächerspezifische Operatoren nach ISB Bayern, gruppiert nach Anforderungsbereichen
// MIT ISB-Definitionen, damit die KI den Erwartungshorizont korrekt einschätzt
const OPERATOREN: Record<string, { AB_I: string[]; AB_II: string[]; AB_III: string[] }> = {
  MINT: {
    AB_I: [
      'Nennen/Angeben Sie (= aufzählen OHNE Erklärung)',
      'Beschreiben Sie (= in eigenen Worten unter Berücksichtigung der Fachsprache wiedergeben)',
      'Skizzieren Sie (= auf das Wesentliche reduziert grafisch darstellen)',
      'Berechnen Sie (= Wert mithilfe einer Rechnung finden)',
    ],
    AB_II: [
      'Erklären Sie (= auf Grundlage von Regeln/Gesetzmäßigkeiten nachvollziehbar darlegen)',
      'Erläutern Sie (= MIT zusätzlichen Informationen/Analogien verständlich machen)',
      'Vergleichen Sie (= Gemeinsamkeiten UND Unterschiede herausarbeiten)',
      'Analysieren Sie (= aus Material Zusammenhänge auf eine Fragestellung hin herausarbeiten)',
      'Begründen Sie (= Ursachen oder Argumente nachvollziehbar angeben)',
    ],
    AB_III: [
      'Beurteilen Sie (= fachlich begründete Einschätzung = Sachurteil)',
      'Bewerten Sie (= eigene Position mit fachlichen UND gesellschaftlichen Kriterien = Werturteil)',
      'Diskutieren Sie (= Positionen gegenüberstellen und abwägen)',
    ],
  },
  SPRACHEN: {
    AB_I: [
      'Nennen Sie (= aufzählen OHNE Erklärung)',
      'Beschreiben Sie (= in eigenen Worten wiedergeben)',
      'Zusammenfassen (= Kernaussagen komprimiert wiedergeben)',
    ],
    AB_II: [
      'Analysieren Sie (= Zusammenhänge herausarbeiten)',
      'Erläutern Sie (= MIT Zusatzinfos verständlich machen)',
      'Vergleichen Sie (= Gemeinsamkeiten UND Unterschiede)',
      'Charakterisieren Sie (= wesentliche Merkmale herausarbeiten)',
    ],
    AB_III: [
      'Beurteilen Sie (= Sachurteil)',
      'Erörtern Sie (= Pro/Contra abwägen)',
      'Bewerten Sie (= Werturteil)',
      'Nehmen Sie Stellung (= begründete eigene Position)',
    ],
  },
  GESELLSCHAFT: {
    AB_I: [
      'Nennen Sie (= aufzählen OHNE Erklärung)',
      'Beschreiben Sie (= in eigenen Worten wiedergeben)',
      'Skizzieren Sie (= auf das Wesentliche reduziert darstellen)',
    ],
    AB_II: [
      'Erklären Sie (= auf Grundlage von Regeln darlegen)',
      'Analysieren Sie (= Zusammenhänge herausarbeiten)',
      'Erläutern Sie (= MIT Zusatzinfos verständlich machen)',
      'Vergleichen Sie (= Gemeinsamkeiten UND Unterschiede)',
    ],
    AB_III: [
      'Erörtern Sie (= Pro/Contra abwägen)',
      'Beurteilen Sie (= Sachurteil)',
      'Bewerten Sie (= Werturteil)',
      'Diskutieren Sie (= Positionen gegenüberstellen)',
    ],
  },
  SPORT: {
    AB_I: [
      'Nennen Sie (= aufzählen OHNE Erklärung)',
      'Beschreiben Sie (= in eigenen Worten wiedergeben)',
    ],
    AB_II: [
      'Erklären Sie (= auf Grundlage von Regeln darlegen)',
      'Erläutern Sie (= MIT Zusatzinfos verständlich machen)',
      'Vergleichen Sie (= Gemeinsamkeiten UND Unterschiede)',
    ],
    AB_III: [
      'Beurteilen Sie (= Sachurteil)',
      'Bewerten Sie (= Werturteil)',
      'Diskutieren Sie (= Positionen abwägen)',
    ],
  },
};

function getOperatorenFuerFach(subject: string) {
  const mint = ['Biologie', 'Chemie', 'Physik', 'Informatik'];
  const sprachen = ['Deutsch', 'Englisch', 'Französisch', 'Italienisch', 'Latein', 'Spanisch'];
  if (mint.includes(subject)) return OPERATOREN.MINT;
  if (sprachen.includes(subject)) return OPERATOREN.SPRACHEN;
  if (subject === 'Sport') return OPERATOREN.SPORT;
  return OPERATOREN.GESELLSCHAFT;
}

export interface LiveSessionConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  aufgabenstellung: string;
  material: string;
  materialImpulse?: MaterialImpuls[];
  examMode?: ExamMode;
  gender?: 'male' | 'female';
  prueferTyp?: PrueferTyp;
  feedbackMode?: boolean;
  examTranscript?: string;
  topicScope?: TopicScope;
  /** Themen je Halbjahr (Lehrer-Custom oder LehrplanPLUS). Schlüssel = Halbjahr-Label (z.B. "12/2"). */
  topicsByHalbjahr?: Record<string, string[]>;
  /** Wenn gesetzt: Model-Audio wird nur abgespielt wenn true zurückgegeben wird */
  shouldPlayModelAudio?: () => boolean;
  onModelTranscription?: (text: string) => void;
  onUserTranscription?: (text: string) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error') => void;
  /** Liefert aktuelle Transkripte für Kontext-Wiederherstellung bei Reconnect */
  getTranscripts?: () => { modelTx: string[]; userTx: string[] };
}

const WORKER_URL = process.env.WORKER_URL;

if (!WORKER_URL) {
  throw new Error('[live-api] WORKER_URL nicht gesetzt – Gemini Key darf nie direkt im Frontend landen!');
}

const createAI = () => {
  return new GoogleGenAI({
    apiKey: 'PROXY',
    httpOptions: { baseUrl: WORKER_URL },
  });
};

/**
 * Direkter fetch-Aufruf an Gemini (REST) über den Worker-Proxy.
 * Umgeht SDK-Proxy-Probleme bei HTTP generateContent-Requests.
 * Der Worker ersetzt den Dummy-Key automatisch durch den echten API-Key.
 */
async function geminiJSON(prompt: string): Promise<string> {
  const model = 'gemini-2.5-flash';
  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Über Worker-Proxy – Worker setzt x-goog-api-key automatisch
  url = `${WORKER_URL}/v1beta/models/${model}:generateContent`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini API ${resp.status}: ${errText.substring(0, 200)}`);
  }

  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/* ───────── Material generation ───────── */

/** Prüft ob das generierte Material brauchbar ist (nicht leer / zu kurz / generisch) */
function isValidMaterial(m: ExamMaterial): boolean {
  if (!m.aufgabenstellung || !m.material) return false;
  const matStr = typeof m.material === 'string' ? m.material : String(m.material);
  const matLower = matStr.toLowerCase().trim();
  // Generische Phrasen die kein echtes Material sind
  const generisch = [
    'nutzen sie ihr vorwissen', 'vorwissen', 'eigenes wissen',
    'setzen sie sich mit', 'reflektieren sie', 'erläutern sie',
    'berücksichtigen sie dabei die im unterricht',
  ];
  if (generisch.some(g => matLower === g || matLower.startsWith(g))) return false;
  // Material das nur aus Arbeitsanweisungen besteht = generisch
  const anweisungsWörter = (matLower.match(/\b(erläutern|reflektieren|analysieren|bewerten|setzen sie sich|berücksichtigen|beziehen sie)\b/g) || []).length;
  if (anweisungsWörter >= 3 && !matLower.includes('quelle') && !matLower.includes('zitat')) return false;
  if (matStr.trim().length < 80) return false;
  return true;
}

/** Validiert ein einzelnes Chart-Block-Objekt aus der Gemini-Antwort */
function isValidChartBlock(c: unknown): c is ChartBlock {
  if (!c || typeof c !== 'object') return false;
  const cb = c as Partial<ChartBlock>;
  if (typeof cb.titel !== 'string' || !cb.titel.trim()) return false;
  if (!cb.chartDaten || typeof cb.chartDaten !== 'object') return false;
  const cd = cb.chartDaten;
  if (cd.typ !== 'balken' && cd.typ !== 'kreis') return false;
  if (!Array.isArray(cd.labels) || !Array.isArray(cd.werte)) return false;
  if (cd.labels.length === 0 || cd.labels.length !== cd.werte.length) return false;
  if (!cd.werte.every(v => typeof v === 'number' && Number.isFinite(v))) return false;
  return true;
}

/** Versucht JSON aus der Gemini-Antwort zu parsen */
function parseExamMaterialResponse(text: string): ExamMaterial | null {
  try {
    const raw = (text || '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw) as ExamMaterial;
    if (!parsed.aufgabenstellung || !parsed.material) return null;
    // Gemini gibt material manchmal als Array zurück → in String umwandeln
    if (Array.isArray(parsed.material)) {
      parsed.material = (parsed.material as string[]).join('\n\n');
    }
    if (Array.isArray(parsed.aufgabenstellung)) {
      parsed.aufgabenstellung = (parsed.aufgabenstellung as string[]).join('\n\n');
    }
    // Charts validieren – ungültige Einträge filtern, statt zu ganzem Material-Reject
    if (Array.isArray(parsed.charts)) {
      parsed.charts = parsed.charts.filter(isValidChartBlock);
      if (parsed.charts.length === 0) delete parsed.charts;
    } else {
      delete parsed.charts;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function generateExamMaterial(config: ExamConfig): Promise<ExamMaterial> {
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau' : 'grundlegendes Anforderungsniveau';

  // Fremdsprachen-Fächer: Aufgabe, Material und Hinweise in der Zielsprache.
  // Latein: Quellentexte ggf. lateinisch, Aufgabe + Hinweise auf Deutsch (so wie in echten Abi-Prüfungen).
  const fremdsprache: Record<string, string> = {
    'Englisch': 'Englisch',
    'Französisch': 'Französisch',
    'Italienisch': 'Italienisch',
    'Spanisch': 'Spanisch',
  };
  const zielsprache = fremdsprache[config.subject];
  const sprachBlock = zielsprache
    ? `\nSPRACHE (WICHTIG): Das Fach ist ${config.subject}. Schreibe die Felder "aufgabenstellung", "material" und "hinweise" VOLLSTÄNDIG auf ${zielsprache} – inklusive aller Quellen, Zitate, Tabellen-Beschriftungen, Chart-Titel und Chart-Labels. KEINE deutschen Wörter, Sätze oder Beschriftungen mischen. Die Operatoren ("Analyse / Analyze", "Discuss", "Comment on" etc.) entsprechen den im ${config.subject}-Unterricht üblichen.`
    : config.subject === 'Latein'
      ? `\nSPRACHE: Die Aufgabenstellung und Hinweise auf Hochdeutsch. Quellentexte (Zitate aus antiken Autoren) auf Latein mit Autor/Werk/Stelle als Quellenangabe; eine deutsche Übersetzungshilfe für schwierige Vokabeln in Klammern ist erlaubt.`
      : '';

  const prompt = `Du bist ein erfahrener Prüfungsausschuss-Vorsitzender für das bayerische Abitur-Kolloquium.

Erstelle eine realistische Aufgabenstellung mit Material für ein Kurzreferat im Kolloquium.

Fach: ${config.subject}
Anforderungsniveau: ${levelLabel}
Halbjahr: ${config.schwerpunktHalbjahr}
Schwerpunktthema: ${config.schwerpunkt}
${sprachBlock}

Anforderungen:
1. Formuliere eine klare, anspruchsvolle Aufgabenstellung, die alle drei Anforderungsbereiche (Reproduktion, Transfer, Reflexion) abdeckt.
2. Stelle im Feld "material" IMMER 1–2 konkrete Materialien bereit, die der Prüfling in sein Referat einbeziehen soll:
   - Ein echtes oder realistisches Zitat (mit Autor, Werk, Jahr)
   - ODER eine konkrete Statistik/Tabelle mit echten Zahlenwerten
   - ODER einen kurzen Quellentext-Auszug (3–5 Sätze) aus einem Fachbuch oder einer Studie
   - ODER ein Schaubild/Diagramm als Textbeschreibung (z.B. beschriftete Zeichnung, Prozessdiagramm, Stammbaum)
   Jedes Material MUSS eine Quellenangabe haben (Autor, Titel, Jahr).
3. Gib kurze Hinweise zur Bearbeitung.
4. Statistiken IMMER zusätzlich strukturieren:
   a) Im "material"-Text: Werte als Markdown-Tabelle mit | Label | Wert | (NICHT als Fließtext mit "X: 12% | Y: 34% | ..."), Header-Zeile + Separator-Zeile (|---|---|).
   b) Wenn das Material eine Statistik mit ≥3 numerischen Werten enthält, füge zusätzlich ein "charts"-Array hinzu mit einem oder mehreren Diagrammen. Die Werte im Chart MÜSSEN identisch zu den Werten in der Tabelle sein.
   Format pro Chart:
   { "titel": "Kurzer Titel des Diagramms", "chartDaten": { "typ": "balken" oder "kreis", "labels": [...], "werte": [...], "einheit": "%" oder "Mio." oder weglassen }, "quellenangabe": "..." }
   Wahl des Typs: "kreis" nur wenn die Werte sich zu 100 % aufsummieren (Anteile, Prozent eines Ganzen). Sonst IMMER "balken" – auch für Zeitreihen, Ländervergleiche, absolute Zahlen.
   Wenn das Material KEINE Zahlen enthält (z.B. nur Zitat / Quellentext): "charts" weglassen.
${config.subject === 'Biologie' ? `
WICHTIG für Biologie: Bevorzuge visuelle Materialien, wie sie typisch für Biologie-Prüfungen sind:
- Beschriftete Schaubilder (z.B. "Abbildung: Bau einer tierischen Zelle" mit Beschriftung der Organellen)
- Prozessdiagramme (z.B. vereinfachtes Schema der Photosynthese oder Proteinbiosynthese)
- Stammbäume (z.B. Erbgang einer genetischen Erkrankung)
- Experimentergebnisse als Tabelle oder Diagramm (z.B. Enzymaktivität bei verschiedenen Temperaturen)
Vermeide reine Textwände. Stelle das Material so dar, wie es auf einem Aufgabenblatt stehen würde: mit Abbildungstitel, Beschriftungen und Legende.
` : ''}${config.subject === 'Chemie' ? `
WICHTIG für Chemie – Formatierung:
- Chemische Formeln IMMER in LaTeX-mhchem-Notation: $\\ce{H2O}$, $\\ce{Fe^{3+}}$, $\\ce{Cu^{2+} + 2e^- -> Cu}$
- Reaktionsgleichungen als Display-Formel: $$\\ce{2H2 + O2 -> 2H2O}$$
- Messwerte und Stoffdaten IMMER als Markdown-Tabelle mit | Spalte1 | Spalte2 | Format
- Energiediagramme als Textbeschreibung mit Zahlenwerten
- Strukturformeln als IUPAC-Name + Summenformel in \\ce{}-Notation
` : ''}
BEISPIEL für gutes Material (Fach Geschichte) – inkl. Chart-Block:
{
  "aufgabenstellung": "...",
  "material": "Material 1 – Quelle:\\nRede von Bundeskanzler Willy Brandt vor dem Deutschen Bundestag am 28. Oktober 1969: \\"Wir wollen mehr Demokratie wagen.\\"\\n(Quelle: Regierungserklärung Willy Brandt, 28.10.1969)\\n\\nMaterial 2 – Statistik (Wahlbeteiligung Bundestagswahlen):\\n\\n| Jahr | Wahlbeteiligung |\\n|------|----------------:|\\n| 1972 | 91,1 % |\\n| 1980 | 88,6 % |\\n| 1990 | 77,8 % |\\n| 2002 | 79,1 % |\\n| 2021 | 76,6 % |\\n\\n(Quelle: Bundeswahlleiter, 2021)",
  "hinweise": "...",
  "charts": [
    {
      "titel": "Wahlbeteiligung bei Bundestagswahlen 1972–2021",
      "chartDaten": { "typ": "balken", "labels": ["1972","1980","1990","2002","2021"], "werte": [91.1, 88.6, 77.8, 79.1, 76.6], "einheit": "%" },
      "quellenangabe": "Bundeswahlleiter, 2021"
    }
  ]
}${config.subject === 'Biologie' ? `

BEISPIEL für gutes Biologie-Material:
"Material 1 – Schaubild:\\nAbbildung: Vereinfachtes Schema der Lichtreaktion der Photosynthese\\n\\n  H₂O → [Photosystem II] → Elektronentransportkette → [Photosystem I] → NADPH\\n         |                    |\\n         O₂                  ATP (via Chemiosmose)\\n\\nBeschriftung: Thylakoidmembran, Lumen, Stroma\\n(Quelle: nach Campbell Biologie, 11. Auflage, 2019)\\n\\nMaterial 2 – Experimentergebnis:\\nEnzymaktivität der Amylase bei verschiedenen pH-Werten:\\npH 4: 12% | pH 5: 38% | pH 6: 71% | pH 7: 100% | pH 8: 65% | pH 9: 22%\\n(Quelle: Versuchsergebnisse nach Purves Biologie, 2011)"` : ''}

Antworte als JSON-Objekt mit den Feldern: aufgabenstellung, material, hinweise, sowie optional charts (Array, nur bei numerischen Daten).`;

  // Bis zu 3 Versuche für brauchbares Material
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await geminiJSON(prompt);
      console.log(`[Material-Gen] Versuch ${attempt + 1}, Antwort-Länge: ${text.length}`);
      const parsed = parseExamMaterialResponse(text);
      if (parsed && isValidMaterial(parsed)) return parsed;
      console.warn(`[Material-Gen] Versuch ${attempt + 1} ungültig:`, text.substring(0, 200));
    } catch (err) {
      console.error(`[Material-Gen] Versuch ${attempt + 1} Fehler:`, err);
    }
  }

  // Letzter Fallback: vereinfachter Prompt
  try {
    const sprachHinweisFallback = zielsprache
      ? ` Schreibe Aufgabe, Material und Hinweise vollständig auf ${zielsprache}.`
      : config.subject === 'Latein'
        ? ' Aufgabe und Hinweise auf Deutsch, Quellentexte auf Latein.'
        : '';
    const fallbackPrompt = `Erstelle für das Fach ${config.subject} (${levelLabel}) zum Thema "${config.schwerpunkt}" (Halbjahr ${config.schwerpunktHalbjahr}) eine Kolloquiums-Aufgabe mit konkretem Material.${sprachHinweisFallback}

Das Material muss ein echtes Zitat, eine Statistik oder einen Quellentext enthalten – mit Quellenangabe (Autor, Werk, Jahr). Keine generischen Anweisungen wie "Nutzen Sie Ihr Vorwissen".

Antworte als JSON mit: aufgabenstellung, material, hinweise.`;

    const text = await geminiJSON(fallbackPrompt);
    console.log(`[Material-Gen] Fallback, Antwort-Länge: ${text.length}`);
    const parsed = parseExamMaterialResponse(text);
    if (parsed && parsed.material && parsed.material.trim().length > 30) return parsed;
    console.warn('[Material-Gen] Fallback ungültig:', text.substring(0, 200));
  } catch (err) {
    console.error('[Material-Gen] Fallback Fehler:', err);
  }

  // Absoluter Fallback — konkreter als "Material wie im Unterricht"
  if (config.subject === 'Englisch') {
    return {
      aufgabenstellung: `Present the key aspects of the topic "${config.schwerpunkt}" (${config.schwerpunktHalbjahr}) in a structured way. Explain central concepts and connections. Finally, assess the relevance of this topic.`,
      material: `Material 1 – Guiding questions for your presentation:\n• Which key concepts and terms belong to the topic "${config.schwerpunkt}"?\n• Which connections and interrelations can be identified?\n• Which concrete examples or current developments illustrate the topic?\n• Which controversial positions or open questions exist?\n\nMaterial 2 – Requirements for the presentation:\nYour short presentation should cover all three levels of competence:\n(I) Reproduction: Define and describe the most important terms.\n(II) Reorganisation / Transfer: Explain connections and apply your knowledge to a concrete example.\n(III) Evaluation: Take a reasoned stance on a current question related to the topic.`,
      hinweise: 'Structure your presentation clearly into introduction, main part and conclusion. Plan around 10 minutes. Use accurate subject-specific English throughout.',
    };
  }
  if (config.subject === 'Französisch') {
    return {
      aufgabenstellung: `Présentez de manière structurée les aspects essentiels du sujet « ${config.schwerpunkt} » (${config.schwerpunktHalbjahr}). Expliquez les notions centrales et leurs liens. Évaluez enfin l'importance de ce thème.`,
      material: `Document 1 – Questions directrices :\n• Quelles sont les notions clés du thème « ${config.schwerpunkt} » ?\n• Quels liens et interactions peut-on identifier ?\n• Quels exemples concrets illustrent le sujet ?\n• Quelles positions controversées ou questions ouvertes existent ?\n\nDocument 2 – Exigences pour l'exposé :\nVotre court exposé doit couvrir les trois niveaux d'exigence :\n(I) Reproduction : définissez les notions essentielles.\n(II) Application : expliquez les liens et appliquez vos connaissances à un exemple précis.\n(III) Évaluation : prenez position de manière argumentée.`,
      hinweise: 'Structurez clairement votre exposé (introduction, développement, conclusion). Prévoyez environ 10 minutes. Utilisez un français correct et précis.',
    };
  }
  if (config.subject === 'Italienisch') {
    return {
      aufgabenstellung: `Presenta in modo strutturato gli aspetti essenziali del tema "${config.schwerpunkt}" (${config.schwerpunktHalbjahr}). Spiega i concetti centrali e i loro collegamenti. Valuta infine l'importanza di questo tema.`,
      material: `Documento 1 – Domande guida:\n• Quali sono i concetti chiave del tema "${config.schwerpunkt}"?\n• Quali collegamenti e interazioni si possono individuare?\n• Quali esempi concreti illustrano il tema?\n• Quali posizioni controverse o questioni aperte esistono?\n\nDocumento 2 – Requisiti per la presentazione:\nLa tua breve presentazione deve coprire i tre livelli di competenza:\n(I) Riproduzione: definisci i concetti essenziali.\n(II) Applicazione: spiega i collegamenti e applica le tue conoscenze a un esempio concreto.\n(III) Valutazione: prendi posizione in modo argomentato.`,
      hinweise: 'Struttura chiaramente la presentazione (introduzione, parte centrale, conclusione). Prevedi circa 10 minuti. Usa un italiano corretto e preciso.',
    };
  }
  if (config.subject === 'Spanisch') {
    return {
      aufgabenstellung: `Presente de forma estructurada los aspectos esenciales del tema "${config.schwerpunkt}" (${config.schwerpunktHalbjahr}). Explique los conceptos centrales y sus relaciones. Valore finalmente la relevancia de este tema.`,
      material: `Documento 1 – Preguntas orientadoras:\n• ¿Cuáles son los conceptos clave del tema "${config.schwerpunkt}"?\n• ¿Qué relaciones e interacciones se pueden identificar?\n• ¿Qué ejemplos concretos ilustran el tema?\n• ¿Qué posiciones controvertidas o preguntas abiertas existen?\n\nDocumento 2 – Requisitos para la exposición:\nSu breve exposición debe cubrir los tres niveles de exigencia:\n(I) Reproducción: defina los conceptos esenciales.\n(II) Aplicación: explique las relaciones y aplique sus conocimientos a un ejemplo concreto.\n(III) Valoración: tome posición de forma argumentada.`,
      hinweise: 'Estructure claramente su exposición (introducción, desarrollo, conclusión). Prevea unos 10 minutos. Utilice un español correcto y preciso.',
    };
  }
  return {
    aufgabenstellung: `Stellen Sie die wesentlichen Aspekte des Themas "${config.schwerpunkt}" (${config.schwerpunktHalbjahr}) strukturiert dar. Erläutern Sie zentrale Fachbegriffe und Zusammenhänge. Beurteilen Sie abschließend die Bedeutung dieses Themenbereichs.`,
    material: `Material 1 – Leitfragen zur Strukturierung:\n• Welche zentralen Fachbegriffe und Konzepte gehören zum Thema "${config.schwerpunkt}"?\n• Welche Zusammenhänge und Wechselwirkungen lassen sich erkennen?\n• Welche konkreten Beispiele oder Anwendungen gibt es?\n• Welche kontroversen Positionen oder offenen Fragen bestehen?\n\nMaterial 2 – Anforderungen an den Vortrag:\nIhr Kurzreferat soll die drei Anforderungsbereiche abdecken:\n(I) Grundwissen: Definieren und beschreiben Sie die wichtigsten Begriffe.\n(II) Anwendung: Erklären Sie Zusammenhänge und wenden Sie Ihr Wissen auf ein konkretes Beispiel an.\n(III) Bewertung: Nehmen Sie begründet Stellung zu einer aktuellen Fragestellung im Kontext des Themas.`,
    hinweise: 'Strukturieren Sie Ihr Referat klar in Einleitung, Hauptteil und Schluss. Planen Sie ca. 10 Minuten für den Vortrag. Verwenden Sie durchgehend die korrekte Fachsprache.',
  };
}

/* ───────── Mathe-Kolloquium: Aufgaben generieren ───────── */

import { getMatheGebietInhalte } from './curriculum';

export async function generateMatheAufgaben(config: ExamConfig): Promise<ExamMaterial> {
  // Nur das Schwerpunkt-Gebiet (Teil 1 – Vortrag)
  const schwerpunktGebiet = config.schwerpunktHalbjahr || config.schwerpunkt || 'Analysis';
  const gebiete = [schwerpunktGebiet];
  const inhalte = getMatheGebietInhalte(schwerpunktGebiet).join('; ');

  const prompt = `Du bist ein erfahrener Mathematik-Prüfer für das bayerische Abitur-Kolloquium 2026 (erhöhtes Anforderungsniveau).

Erstelle ein realistisches Aufgabenblatt für eine mündliche Mathematik-Prüfung (Teil 1 – Prüfungsschwerpunkt).
Der Prüfling hat 30 Minuten Vorbereitungszeit und soll die Aufgaben dann in einem 10-minütigen Vortrag präsentieren.

Prüfungsschwerpunkt: ${schwerpunktGebiet}

Relevante Inhalte:
${schwerpunktGebiet}: ${inhalte}

WICHTIGE REGELN (ISB-Vorgaben):
- Alle Aufgaben beziehen sich ausschließlich auf den Schwerpunkt "${schwerpunktGebiet}"
- Die Aufgaben müssen einen EINFACHEN EINSTIEG erlauben und so angelegt sein, dass JEDE NOTE erreichbar ist
- KEINE umfangreichen Rechnungen – der Prüfling soll Lösungswege ERLÄUTERN, nicht durchrechnen
- Besonders geeignet: Erläuterung von Lösungswegen, Interpretation vorgegebener Ergebnisse/Skizzen/Graphen
- Anforderungsbereiche I (Reproduktion), II (Transfer) und III (Reflexion) abdecken
- 3–5 Aufgaben mit Teilaufgaben (a, b, c, d)
- Aufgaben müssen nicht inhaltlich zusammenhängen

${gebiete.includes('Analysis') ? `BEISPIEL-AUFGABENTYPEN für Analysis:
- Funktion gegeben → Graph zuordnen/begründen, Definitionsmenge/Wertemenge angeben
- Ableitungsfunktion → zugehörigen Graphen zuordnen und begründen
- Tangente an Graphen: Vorgehensweise beschreiben
- Nullstellen und Extremstellen einer Funktion ermitteln
- Flächeninhalt zwischen Graph und x-Achse: Vorgehensweise mit Skizze beschreiben
- Grenzwertverhalten einer Funktion bestimmen` : ''}
${gebiete.includes('Geometrie') ? `BEISPIEL-AUFGABENTYPEN für Geometrie:
- Lineare Abhängigkeit von Vektoren erklären
- Schnitt von Gerade und Ebene zeigen/berechnen
- Hesse'sche Normalform bestimmen und Anwendung erläutern
- Abstands-Berechnungen (Punkt-Ebene, Punkt-Gerade)
- Kreuzprodukt berechnen (z.B. Parallelogramm-Fläche)
- Schnittwinkel zwischen Ebenen bestimmen` : ''}
${gebiete.includes('Stochastik') ? `BEISPIEL-AUFGABENTYPEN für Stochastik:
- Binomialverteilung: Erwartungswert, Standardabweichung berechnen
- Signifikanztest durchführen und interpretieren
- Normalverteilung: Wahrscheinlichkeiten mit Sigma-Regeln bestimmen
- Baumdiagramm erstellen und bedingte Wahrscheinlichkeiten berechnen` : ''}

Gib im Feld "material" konkrete mathematische Objekte als Text an (Funktionsterme, Gleichungen, Vektoren, Tabellen).

GEOGEBRA-VISUALISIERUNG (optional):
Falls eine Aufgabe einen Graphen ZEIGT den der Prüfling ablesen soll (z.B. "Welcher Graph gehört zu f?", "Lesen Sie ab"), füge ein "grafiken"-Array hinzu.
- Analysis: type "graphing" — Funktionsgraphen, Punkte, Tangenten
- Geometrie: type "3d" — Punkte, Geraden, Ebenen im Raum

GEOGEBRA-REGELN (KRITISCH):
1. Variable immer x: f(x) = 2*x^2 - 3*x, NICHT f(t) = ...
2. Multiplikation immer *: 2*x, NICHT 2x
3. e-Funktion: exp(x), NICHT e^x
4. Nur einfache Befehle: Funktionen, Punkte (A = (2, 3)), Geraden
5. VERBOTEN: Integral(), Derivative(), Solve(), If(), Sequence()
6. KEINE LaTeX in GeoGebra-Befehlen
7. Funktionsnamen: Kleinbuchstaben (f, g), NICHT Großbuchstaben
8. KEINE SetColor-Befehle

WANN Grafik: NUR wenn der Graph dem Prüfling gezeigt wird (z.B. "Welcher Graph ist f?")
WANN KEINE Grafik: Kurvendiskussion (Schüler berechnet selbst), reine Rechenaufgaben, Stochastik

Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON):
{"aufgabenstellung":"Aufgaben mit Teilaufgaben, klar formuliert, mit Gebiet-Überschriften","material":"Konkrete mathematische Objekte als Text","hinweise":"Bearbeitungshinweise","grafiken":[{"id":"Abb. 1","type":"graphing","commands":["f(x) = x^2 - 2*x"]}]}

Das "grafiken"-Feld ist optional – weglassen wenn keine Graphen benötigt werden.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await geminiJSON(prompt);
      console.log(`[Mathe-Gen] Versuch ${attempt + 1}, Antwort-Länge: ${text.length}`);
      const parsed = parseExamMaterialResponse(text);
      if (parsed && isValidMaterial(parsed)) return parsed;
      console.warn(`[Mathe-Gen] Versuch ${attempt + 1} ungültig:`, text.substring(0, 200));
    } catch (err) {
      console.error(`[Mathe-Gen] Versuch ${attempt + 1} Fehler:`, err);
    }
  }

  // Fallback: Aufgaben für das Schwerpunkt-Gebiet
  const fallbackMap: Record<string, { aufgaben: string; material: string }> = {
    'Analysis': {
      aufgaben: `Analysis\n\n1. Gegeben ist die Funktion f: x ↦ 3/(1+x²) − 1.\na) Begründen Sie anhand charakteristischer Eigenschaften, welcher der vorgelegten Graphen zur Funktion f gehört.\nb) Geben Sie die maximale Definitionsmenge und die Wertemenge von f an.\nc) Beschreiben Sie, wie man die Gleichung der Tangente an den Graphen von f an der Stelle x = 1 ermittelt.\n\n2. Gegeben ist die Funktion g: x ↦ x·e^(−x²), D = ℝ.\nErmitteln Sie die Nullstellen und die Extremstellen von g.`,
      material: 'f(x) = 3/(1+x²) − 1, g(x) = x·e^(−x²)',
    },
    'Geometrie': {
      aufgaben: `Geometrie\n\n1. Erklären Sie, wann drei Vektoren linear abhängig sind.\n\n2. Gegeben sind die Gerade g: X⃗ = (−1, 0, 3) + λ·(3, −2, −2) und die Ebene E: 3x₁ + x₂ − 2x₃ − 2 = 0.\na) Zeigen Sie, dass sich E und g schneiden.\nb) Bestimmen Sie die Hesse'sche Normalenform von E und erläutern Sie eine Anwendung.\n\n3. Berechnen Sie den Flächeninhalt eines Parallelogramms, das durch a⃗ = (0, 3, −1) und b⃗ = (2, 2, 2) aufgespannt wird.`,
      material: 'g: X⃗ = (−1,0,3) + λ·(3,−2,−2), E: 3x₁+x₂−2x₃−2=0, a⃗=(0,3,−1), b⃗=(2,2,2)',
    },
    'Stochastik': {
      aufgaben: `Stochastik\n\n1. Ein Glücksrad wird 100-mal gedreht. Die Wahrscheinlichkeit für "Gewinn" beträgt p = 0,3.\na) Berechnen Sie den Erwartungswert und die Standardabweichung.\nb) Bestimmen Sie die Wahrscheinlichkeit für 25–35 Gewinne mithilfe der Sigma-Regeln.\n\n2. Führen Sie einen Signifikanztest zum Niveau α = 5% durch (n = 50, H₀: p ≤ 0,05).`,
      material: 'B(100; 0,3), α = 0,05, n = 50',
    },
  };
  const fb = fallbackMap[schwerpunktGebiet] ?? fallbackMap['Analysis'];

  return {
    aufgabenstellung: fb.aufgaben,
    material: fb.material,
    hinweise: 'Sie haben 30 Minuten Vorbereitungszeit. Notieren Sie sich Lösungswege und Ergebnisse. Erläutern Sie im Vortrag die Vorgehensweise – umfangreiche Rechnungen müssen nicht im Detail ausgeführt werden.',
  };
}

/* ───────── Material-Impulse für den Fragenteil ───────── */

function getMaterialTypenFuerFach(subject: string): string {
  if (subject === 'Biologie') return 'Schaubilder (z.B. Zellaufbau, Stoffwechselwege, Stammbäume), Diagramme (Balken-/Kreisdiagramm mit Messwerten), Experimentergebnisse als Tabelle, kurze Abbildungsbeschreibungen mit Beschriftung';
  if (subject === 'Chemie') return 'Reaktionsgleichungen (in LaTeX \\ce{}-Notation), Energiediagramme, Experimentergebnisse als Markdown-Tabelle (|Spalte|Wert|), Stoffdaten-Tabellen, Strukturformeln als \\ce{}-Notation';
  const mint = ['Physik', 'Mathematik', 'Informatik'];
  const sprachen = ['Deutsch', 'Englisch', 'Französisch', 'Italienisch', 'Latein', 'Spanisch'];
  if (mint.includes(subject)) return 'Daten-Tabellen, Experimentergebnisse, Statistiken mit Zahlenwerten, Diagramm-Beschreibungen';
  if (sprachen.includes(subject)) return 'Zitate aus Primär-/Sekundärliteratur, kurze Textauszüge, Karikaturbeschreibungen';
  if (subject === 'Sport') return 'Trainingsdaten, Leistungsstatistiken, Studienergebnisse';
  return 'Quellentexte, Statistiken mit Zahlenwerten, Zitate, Karten-/Schaubildbeschreibungen';
}

export async function generateMaterialImpulse(config: ExamConfig): Promise<MaterialImpuls[]> {
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau' : 'grundlegendes Anforderungsniveau';
  const materialTypen = getMaterialTypenFuerFach(config.subject);

  // Mathe-Kolloquium: Materialimpulse beziehen sich auf das weitere Gebiet, nicht auf Halbjahre
  const isMathe = config.isMathe || config.subject === 'Mathematik';
  const weitereLabel = isMathe
    ? `Weiteres Gebiet (NICHT der Schwerpunkt): ${config.weitereHalbjahre.join(', ')}`
    : `Weitere Halbjahre (NICHT der Schwerpunkt): ${config.weitereHalbjahre.join(', ')}`;

  const matheHinweis = isMathe
    ? `\n\nWICHTIG: Dies ist eine MATHEMATIK-Prüfung. Geeignete Material-Typen sind:
- Funktionsterme mit Aufgabe ("Bestimmen Sie...", "Erläutern Sie...")
- Graphen-Beschreibungen ("Der Graph zeigt...")
- Gleichungssysteme oder Vektoren/Ebenen-Darstellungen
- Wahrscheinlichkeitstabellen oder Verteilungen
Verwende typ "quelle" für mathematische Aufgabenstellungen.`
    : '';

  const bioHinweis = config.subject === 'Biologie'
    ? `\n\nWICHTIG für Biologie: Bevorzuge mindestens 1 Schaubild-Material (typ "schaubild") mit chartDaten.
Biologie-typische Schaubilder: Vergleichsdiagramme (z.B. Enzymaktivität, Populationsentwicklung), Messwert-Tabellen als Balkendiagramm.
Vermeide reine Textwände — in Bio-Prüfungen werden fast immer Abbildungen und Diagramme vorgelegt.`
    : '';

  const chemieHinweis = config.subject === 'Chemie'
    ? `\n\nWICHTIG für Chemie – Formatierung im "inhalt"-Feld:
- Chemische Formeln in LaTeX-mhchem-Notation: $\\ce{H2O}$, $\\ce{Fe^{3+} + e^- -> Fe^{2+}}$
- Reaktionsgleichungen als Display-Formel: $$\\ce{2H2 + O2 -> 2H2O}$$
- Messwerte IMMER als Markdown-Tabelle:
| Größe | Wert |
|---|---|
| Temperatur | 25 °C |
| Konzentration | 0,1 mol/L |
- Standardpotentiale als Markdown-Tabelle mit Spalten: Halbreaktion | E⁰ / V | z
- Keine Pipe-getrennte Inline-Daten — IMMER echte Markdown-Tabellen verwenden`
    : '';

  const prompt = `Du bist ein erfahrener Prüfungsausschuss-Vorsitzender für das bayerische Abitur-Kolloquium.

Erstelle 2 realistische Material-Impulse, die einem Prüfling während des Fragenteils ${isMathe ? 'zum WEITEREN GEBIET' : 'zu den WEITEREN HALBJAHREN'} vorgelegt werden.

Fach: ${config.subject}
Anforderungsniveau: ${levelLabel}
${weitereLabel}

Geeignete Material-Typen für dieses Fach: ${materialTypen}${matheHinweis}${bioHinweis}${chemieHinweis}

Anforderungen:
1. Jedes Material muss sich auf ${isMathe ? 'das weitere Gebiet' : 'eines der weiteren Halbjahre'} beziehen (nicht auf den Schwerpunkt "${config.schwerpunkt}").
2. Die Materialien sollen als Gesprächsimpuls dienen — der Prüfling soll sie analysieren, interpretieren oder bewerten.
3. Wähle für "typ" aus: "zitat", "statistik", "quelle", "schaubild".
4. Bei typ "statistik" oder "schaubild": Füge ein "chartDaten"-Objekt hinzu mit typ ("balken" oder "kreis"), labels (3–6 Einträge), werte (passende Zahlen), und optional einheit (z.B. "%" oder "Mio.").
5. Bei typ "zitat" oder "quelle": Kein chartDaten nötig, nur titel, inhalt und quellenangabe.
6. Die Materialien müssen fachlich korrekt und für das bayerische Abitur-Niveau angemessen sein.

Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON-Array):
[{"typ":"statistik","titel":"...","inhalt":"...","quellenangabe":"...","chartDaten":{"typ":"balken","labels":["A","B","C"],"werte":[10,20,30],"einheit":"%"}},{"typ":"zitat","titel":"...","inhalt":"...","quellenangabe":"..."}]`;

  try {
    const text = await geminiJSON(prompt);
    const raw = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw) as MaterialImpuls[];
    // Validierung: Nur gültige Objekte behalten
    return parsed.filter(m => m.typ && m.titel && m.inhalt).slice(0, 2);
  } catch (err) {
    console.error('[MaterialImpulse-Gen] Fehler:', err);
    return [];
  }
}

/* ───────── Written feedback ───────── */

/**
 * Baut den PRÜFUNGSRAHMEN-Block für Feedback-Prompts (schriftlich + mündlich).
 * Gibt der KI den vollständigen Themenrahmen mit, damit sie Antworten auf
 * Fragen zu Nicht-Schwerpunkt-Halbjahren nicht fälschlich als "Abschweifen" wertet.
 */
function buildPrüfungsrahmenBlock(args: {
  subject: string;
  schwerpunkt: string;
  schwerpunktHalbjahr?: string;
  weitereHalbjahre?: string[];
  topicsByHalbjahr?: Record<string, string[]>;
  examMode?: ExamMode;
}): string {
  const weitere = (args.weitereHalbjahre || []).filter(h => h && h.trim());
  const hatWeitere = weitere.length > 0;
  const mode = args.examMode || 'gesamt';
  // Im reinen Referat-Modus gibt es keine Fragephase → kein Rahmen nötig.
  if (mode === 'referat' || !hatWeitere) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('PRÜFUNGSRAHMEN (was war Bestandteil der Prüfung?):');
  if (args.schwerpunktHalbjahr) {
    lines.push(`• Schwerpunktthema: "${args.schwerpunkt}" (Halbjahr ${args.schwerpunktHalbjahr})`);
  } else {
    lines.push(`• Schwerpunktthema: "${args.schwerpunkt}"`);
  }
  lines.push(`• Weitere prüfungsrelevante Halbjahre: ${weitere.join(', ')}`);

  const topicsMap = args.topicsByHalbjahr || {};
  const themenBlocks: string[] = [];
  for (const h of weitere) {
    const t = (topicsMap[h] || []).filter(x => x && x.trim());
    if (t.length > 0) {
      themenBlocks.push(`  – ${h}: ${t.map(x => x.trim()).join(', ')}`);
    } else {
      themenBlocks.push(`  – ${h}: Themen gemäß bayerischem LehrplanPLUS für ${args.subject}`);
    }
  }
  if (themenBlocks.length > 0) {
    lines.push('• Erlaubte Themen je weiterem Halbjahr:');
    lines.push(...themenBlocks);
  }

  lines.push('');
  lines.push('WICHTIG zur Bewertung des Themenrahmens:');
  lines.push('Im bayerischen Kolloquium darf der Prüfer nicht nur zum Schwerpunktthema, sondern auch zu Themen der weiteren oben genannten Halbjahre fragen. Antworten des Prüflings auf solche Fragen sind KEIN Themenabschweifen und KEIN Fehler — sie waren laut Prüfungsdesign genau so vorgesehen. Bewerte sie inhaltlich auf gleicher Ebene wie Antworten zum Schwerpunktthema. Nur tatsächliches Abdriften auf Inhalte, die in KEINEM der oben genannten Halbjahre/Themen liegen, darf als Abschweifen markiert werden — und auch nur dann, wenn der Prüfling von sich aus dorthin springt (nicht, wenn der Prüfer danach gefragt hat).');
  lines.push('');
  return lines.join('\n');
}

export async function generateWrittenFeedback(config: {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr?: string;
  weitereHalbjahre?: string[];
  topicsByHalbjahr?: Record<string, string[]>;
  examMode?: ExamMode;
  modelTranscription: string[];
  userTranscription: string[];
  materialImpulse?: MaterialImpuls[];
}): Promise<string> {
  const ai = createAI();

  const lines: string[] = [];
  const max = Math.max(config.modelTranscription.length, config.userTranscription.length);
  for (let i = 0; i < max; i++) {
    if (config.userTranscription[i]) lines.push(`Prüfling: ${config.userTranscription[i]}`);
    if (config.modelTranscription[i]) lines.push(`Prüfer: ${config.modelTranscription[i]}`);
  }

  const prüfungsrahmen = buildPrüfungsrahmenBlock({
    subject: config.subject,
    schwerpunkt: config.schwerpunkt,
    schwerpunktHalbjahr: config.schwerpunktHalbjahr,
    weitereHalbjahre: config.weitereHalbjahre,
    topicsByHalbjahr: config.topicsByHalbjahr,
    examMode: config.examMode,
  });

  const prompt = `Du bist ein fairer und wohlwollender bayerischer Abiturprüfer. Analysiere das folgende Prüfungstranskript einer Kolloquiumsprüfung und gib ehrliches, konstruktives Feedback mit klarem Schwerpunkt auf Stärken und Lernchancen.

Fach: ${config.subject} (${config.examLevel === 'eA' ? 'erhöht' : 'grundlegend'})
Schwerpunkt: ${config.schwerpunkt}
${prüfungsrahmen}
VOLLSTÄNDIGES TRANSKRIPT DER PRÜFUNG:
---
${lines.join('\n') || '(Kein Transkript verfügbar)'}
---

WICHTIGE ANWEISUNGEN:
- Du MUSST dich auf KONKRETE Aussagen des Prüflings im Transkript beziehen. Zitiere wörtlich, was der Prüfling gesagt hat.
- Benenne fachliche Fehler oder Ungenauigkeiten sachlich und nenne die korrekte Antwort – aber formuliere es konstruktiv, nicht abwertend.
- Bewerte fair und wohlwollend. Bei Unsicherheit zwischen zwei Punktebereichen entscheide dich für den HÖHEREN. Ansätze und Teilgedanken zählen, auch wenn die Antwort nicht vollständig ist.
- Erkenne ausdrücklich an, was gelungen ist – auch kleine Stärken sollen sichtbar werden.
- Unterscheide zwischen auswendig Gelerntem (AB I) und eigenständigem Denken (AB II/III), aber wirf dem Prüfling AB I nicht negativ vor – solides Grundwissen ist wertvoll.
- Bewerte die Ausdrucksweise nach diesen Kriterien: Sind Fachbegriffe korrekt verwendet? Ist die Argumentationsstruktur schlüssig? Wie ist die Präsentationsfähigkeit? — Umgangssprachliche Formulierungen sind KEIN Fehler und dürfen NICHT negativ bewertet werden. Perfektes Standarddeutsch ist nicht erforderlich; entscheidend ist die fachliche Korrektheit.
- BEACHTE bei der Bewertung: Das Transkript stammt aus einer automatischen Spracherkennung, die besonders bei Abkürzungen (z.B. NSDAP, KPD, BRD, DDR, NATO, EWG, EU, UdSSR, USA, BIP, DNA, RNA, ATP, CO₂) und bei englischsprachigen Fachbegriffen, Eigennamen oder Zitaten häufig Fehler macht. Wenn ein Begriff im Transkript verstümmelt, phonetisch geschrieben oder offensichtlich falsch erkannt wurde, behandle ihn als korrekt, sofern der Kontext eindeutig auf den richtigen Fachbegriff hinweist. Werte solche Erkennungsfehler NICHT als fachlichen Fehler des Prüflings.

Strukturiere dein Feedback so:

## Gesamteindruck
(2–3 Sätze, ehrliche Einschätzung der Gesamtleistung)

## Fachliche Analyse
- Was hat der Prüfling KONKRET gesagt? (mit Zitaten aus dem Transkript)
- Was war fachlich korrekt?
- Was war fachlich FALSCH oder UNGENAU? (mit Richtigstellung)
- Was wurde NICHT erwähnt, obwohl es wichtig gewesen wäre?

## Stärken
- Konkrete Beispiele aus dem Gespräch nennen

## Schwächen und Fehler
- Konkrete Beispiele aus dem Gespräch nennen
- Fachliche Fehler benennen und korrigieren

## Bewertung nach Anforderungsbereichen
- AB I (Reproduktion): Wurde Grundwissen korrekt wiedergegeben? Konkrete Beispiele.
- AB II (Transfer): Konnte der Prüfling Wissen anwenden und Zusammenhänge herstellen? Konkrete Beispiele.
- AB III (Reflexion): Gab es eigenständige Urteile, kritische Bewertungen? Konkrete Beispiele.

## Punkteeinschätzung
(0–15 Punkte mit DETAILLIERTER Begründung, orientiert an den Notenstufen: 15-13 sehr gut, 12-10 gut, 9-7 befriedigend, 6-4 ausreichend, 3-1 mangelhaft, 0 ungenügend. Bewerte wohlwollend – im Zweifel die höhere Punktzahl. Auch teilweise korrekte oder ansatzweise richtige Antworten verdienen Punkte.)

## Konkrete Verbesserungstipps
- Was genau sollte der Prüfling beim nächsten Mal anders machen?
- Welche Themen sollte er/sie nochmal lernen?
${config.materialImpulse && config.materialImpulse.length > 0 ? `
## Umgang mit Materialien
Dem Prüfling wurden folgende Materialien vorgelegt:
${config.materialImpulse.map((m, i) => `Material ${i + 1}: "${m.titel}" (${m.quellenangabe})`).join('\n')}
- Wie gut hat der Prüfling die Materialien in seine Antworten einbezogen?
- Hat er/sie die Materialien korrekt analysiert und interpretiert?
- Was hätte man aus den Materialien noch herauslesen können?` : ''}
Schreibe auf Hochdeutsch (Standarddeutsch). Sei ehrlich und konstruktiv – benenne Fehler klar, aber bewerte insgesamt wohlwollend und ermutigend, damit der Prüfling motiviert weiterlernt.
WICHTIG zur Sprache: Umgangssprachliche Formulierungen des Prüflings sind KEIN Fehler und dürfen NICHT negativ bewertet werden. Nur falsch verwendete Fachbegriffe zählen als sprachlicher Mangel. Beziehe etwaige Sprachkritik ausschließlich auf Fachbegriffe.`;

  const feedbackPromise = ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Feedback-Timeout nach 60 Sekunden')), 60_000)
  );

  const response = await Promise.race([feedbackPromise, timeoutPromise]);
  return response.text || 'Feedback konnte nicht generiert werden.';
}

/* ───────── System instructions ───────── */

function getLanguageInstruction(subject: string): string {
  const langMap: Record<string, string> = {
    'Englisch': 'Englisch', 'Französisch': 'Französisch', 'Italienisch': 'Italienisch',
  };
  const lang = langMap[subject];
  if (lang) return `\n\nSPRACHE: Führe das GESAMTE Prüfungsgespräch auf ${lang}. Bewertung: 60 % Sprache/Gesprächsfähigkeit, 40 % Inhalt. Auch dein Feedback gibst du auf ${lang}.`;
  if (subject === 'Latein') return '\n\nSPRACHE: Gespräch auf Hochdeutsch (Standarddeutsch). KEIN Dialekt, KEIN Bayerisch. Lateinische Fachbegriffe und Zitate gehören zur Prüfung.';
  return `\n\nSPRACHE: Das Prüfungsgespräch findet auf DEUTSCH statt. Der Prüfling spricht Deutsch.
- Erkenne deutsche Wörter auch bei undeutlicher Aussprache oder leichtem Verschlucken (z.B. "Leitfrage" nicht als "Lightfrage" interpretieren – im Zweifel immer das deutsche Wort annehmen).
- Umgangssprachliche Formulierungen des Prüflings sind KEIN Problem, solange der fachliche Inhalt stimmt. Nicht jeder Schüler spricht Standarddeutsch – das ist normal und kein Fehler.
- Nur Fachbegriffe müssen korrekt sein. Perfektes Hochdeutsch ist NICHT erforderlich.
- Du selbst sprichst Hochdeutsch ohne Dialekt oder Bayerisch.`;
}

function buildFeedbackInstruction(config: LiveSessionConfig): string {
  // Limit transcript to ~8000 chars to reduce first-response latency
  const transcript = (config.examTranscript || '').slice(0, 8000);

  const feedbackLangMap: Record<string, string> = {
    'Englisch': 'Englisch', 'Französisch': 'Französisch', 'Italienisch': 'Italienisch',
  };
  const feedbackLang = feedbackLangMap[config.subject];
  const langHint = feedbackLang
    ? `Gib dein Feedback auf ${feedbackLang}.`
    : 'Gib dein Feedback auf Hochdeutsch. Wichtig: Umgangssprachliche Formulierungen des Prüflings sind KEIN Kritikpunkt – bewerte ausschließlich die fachliche Korrektheit, nicht den Sprachstil. Nur falsche Fachbegriffe sind zu bemängeln.';

  const prüferRolle = config.gender === 'female'
    ? 'eine faire und wohlwollende bayerische Abiturprüferin'
    : 'ein fairer und wohlwollender bayerischer Abiturprüfer';

  const prüfungsrahmen = buildPrüfungsrahmenBlock({
    subject: config.subject,
    schwerpunkt: config.schwerpunkt,
    schwerpunktHalbjahr: config.schwerpunktHalbjahr,
    weitereHalbjahre: config.weitereHalbjahre,
    topicsByHalbjahr: config.topicsByHalbjahr,
    examMode: config.examMode,
  });

  return `Du bist ${prüferRolle}. Gib MÜNDLICHES FEEDBACK zur Kolloquiumsprüfung – ehrlich, aber ermutigend und konstruktiv.
Fach: ${config.subject} (${config.examLevel}), Schwerpunkt: ${config.schwerpunkt}
${prüfungsrahmen}
TRANSKRIPT:
${transcript || '(Nicht verfügbar)'}

AUFGABE: Wohlwollender Gesamteindruck → Stärken zuerst hervorheben → fachliche Fehler sachlich korrigieren (ohne abzuwerten) → Bewertung AB I/II/III → Punkteeinschätzung (0–15, im Zweifel die höhere Punktzahl, Ansätze und Teilantworten zählen) → 2–3 Verbesserungstipps. Beantworte Rückfragen. ${langHint}`;
}

function buildExamInstruction(config: LiveSessionConfig): string {
  const level = config.examLevel === 'eA' ? 'eA' : 'gA';
  const mode = config.examMode || 'gesamt';
  const isMathe = config.subject === 'Mathematik';
  const prüferLabel = config.gender === 'female' ? 'Prüferin' : 'Prüfer';

  let instruction: string;

  if (isMathe) {
    const schwerpunktgebiet = config.schwerpunkt;
    const weitereGebiete = config.weitereHalbjahre.join(' und ');
    const alleGebiete = [schwerpunktgebiet, ...config.weitereHalbjahre].filter(Boolean).join(' und ');
    instruction = `Du bist ${prüferLabel} im bayerischen Abitur-Kolloquium 2026.
Fach: Mathematik (eA)
Schwerpunktgebiet: ${schwerpunktgebiet}
Weitere prüfungsrelevante Gebiete: ${weitereGebiete}.`;

    if (config.aufgabenstellung) {
      instruction += `\nDem Prüfling wurden folgende Aufgaben vorgelegt:\n${config.aufgabenstellung}`;
      if (config.material) instruction += `\nMathematische Objekte: ${config.material}`;
    }

    const stilleRegel = `
KRITISCHE REGEL FÜR DEN AUFGABEN-VORTRAG:
- Du darfst während des Vortrags ABSOLUT NICHT SPRECHEN. KEIN EINZIGES WORT.
- KEINE Reaktion, KEIN "Mhm", KEIN "Ja", KEIN "Richtig", KEINE Rückfrage. TOTALE STILLE.
- Auch wenn der Prüfling eine Pause macht oder unsicher wirkt: SCHWEIGE.
- Wenn das Audio zwischendurch leise wird, undeutlich klingt oder du nichts hörst: NICHT kommentieren, NICHT "Schweigen", "Stille", "..." oder Ähnliches sagen, NICHT nachfragen — einfach weiter zuhören.
- Du darfst ERST WIEDER sprechen, wenn der Prüfling EXPLIZIT sagt, dass sein Vortrag beendet ist.
- Nach 10–12 Minuten ohne Abschluss darfst du freundlich bitten, zum Ende zu kommen.`;

    const matheFragenHinweis = `
WICHTIG für Mathematik-Fragen:
- Fragen sollen Verständnis prüfen, nicht reines Rechnen
- "Beschreiben Sie die Vorgehensweise..." statt "Rechnen Sie aus..."
- "Erläutern Sie, warum..." / "Was passiert, wenn..." / "Interpretieren Sie..."
- Bei Bedarf: Konkrete Terme, Gleichungen oder Skizzen mündlich beschreiben`;

    if (mode === 'referat') {
      instruction += `
ABLAUF: Begrüße den Prüfling KURZ (1 Satz). Er wird seine vorbereiteten Lösungen zu den Aufgaben (${alleGebiete}) in einem zusammenhängenden Vortrag präsentieren (~10 Min).
${stilleRegel}
Danach beende die Prüfung mit einer kurzen Verabschiedung.`;
    } else if (mode === 'fragen') {
      instruction += `
ABLAUF: Begrüße den Prüfling. Stelle zuerst Fragen zum Schwerpunktgebiet ${schwerpunktgebiet} und danach gemischte Fragen zu ${alleGebiete} (~20 Min).
Decke Schwerpunktgebiet und weitere Gebiete passend zum Prüfungsaufbau ab. Steigere den Schwierigkeitsgrad (AB I→II→III).
Lege ggf. Zusatzmaterialien vor (Funktionsterme, Gleichungen, Graphen-Beschreibungen, Vektoren).
Beende die Prüfung.
${matheFragenHinweis}`;
    } else {
      instruction += `
ABLAUF:
1. Begrüße den Prüfling KURZ (1 Satz). Er wird seine vorbereiteten Lösungen zu den Aufgaben (${alleGebiete}) in einem zusammenhängenden Vortrag präsentieren (~10 Min).
   ${stilleRegel}
2. Stelle vertiefende Fragen zu den vorgelegten Aufgaben und zum Schwerpunktgebiet ${schwerpunktgebiet} (~5 Min, AB II/III).
   Z.B. Fragen die an den Vortrag anknüpfen, Verallgemeinerungen, oder neue Aspekte.
3. Stelle weitere Fragen zu ${weitereGebiete} (~15 Min): Mit steigendem Schwierigkeitsgrad (AB I→II→III).
   Lege ggf. Zusatzmaterialien vor (Funktionsterme, Gleichungen, Graphen-Beschreibungen).
4. Beende die Prüfung.
${matheFragenHinweis}`;
    }
  } else {
    // Alle anderen Fächer: bisherige Logik
    const hj = config.schwerpunktHalbjahr;
    const weitere = config.weitereHalbjahre.join(' und ');
    instruction = `Du bist ${prüferLabel} im bayerischen Abitur-Kolloquium 2026.
Fach: ${config.subject} (${level}), Schwerpunkt: "${config.schwerpunkt}" (${hj}), weitere HJ: ${weitere}.`;

    if (config.aufgabenstellung) {
      instruction += `\nAufgabe: ${config.aufgabenstellung}\nMaterial: ${config.material}`;
    }

    // Umfang der Schwerpunkt-Fragen
    const scope: TopicScope = config.topicScope || 'strikt';
    const schwerpunktFragenBeschreibung = scope === 'strikt'
      ? `3–4 vertiefende Fragen AUSSCHLIESSLICH zum konkreten Schwerpunktthema "${config.schwerpunkt}" aus ${hj} (AB II/III, ~5–6 Min). WICHTIG: Stelle in dieser Phase KEINE Fragen zu anderen Themen aus ${hj} — bleibe strikt beim Schwerpunktthema und eng damit verbundenen Aspekten.`
      : `3–4 vertiefende Fragen zum Schwerpunkthalbjahr ${hj} (AB II/III, ~5–6 Min). Decke dabei sowohl das konkrete Schwerpunktthema "${config.schwerpunkt}" als auch weitere Themen aus ${hj} ab.`;

    // Explizite Themenlisten pro Halbjahr (Lehrer-Custom oder LehrplanPLUS),
    // damit das Modell weiß, welche Inhalte zu welchem Halbjahr gehören.
    const topicsMap = config.topicsByHalbjahr || {};
    const formatTopics = (list: string[]) => list.filter(t => t && t.trim()).map(t => `• ${t.trim()}`).join('\n');
    const schwerpunktHjTopics = (topicsMap[hj] || []).filter(t => t && t.trim());
    const verboteneSchwerpunktThemen = schwerpunktHjTopics.filter(t => t.trim() !== config.schwerpunkt.trim());
    const weitereHjBlocks = config.weitereHalbjahre
      .map(h => {
        const t = topicsMap[h] || [];
        return t.length > 0 ? `Halbjahr ${h} – erlaubte Themen:\n${formatTopics(t)}` : `Halbjahr ${h}: (Themen gemäß bayerischem LehrplanPLUS für ${config.subject})`;
      })
      .join('\n\n');

    let themenRahmen = `\n\nTHEMENRAHMEN DER PRÜFUNG:`;
    themenRahmen += `\n\nSchwerpunktthema (Halbjahr ${hj}): "${config.schwerpunkt}"`;
    if (verboteneSchwerpunktThemen.length > 0) {
      themenRahmen += `\n\nAndere Themen aus ${hj}, die in der Klausur des Schülers WEDER prüfungsrelevant noch erlaubt sind:\n${formatTopics(verboteneSchwerpunktThemen)}`;
      if (scope === 'strikt') {
        themenRahmen += `\n→ Diese Themen sind während der GESAMTEN Prüfung TABU. Stelle dazu KEINE Fragen — weder in Phase 1 (Schwerpunkt-Fragen) noch in Phase 2 (weitere Halbjahre). Auch wenn du als Überleitung sagst "Wir kommen jetzt zu ${config.weitereHalbjahre[0] || 'einem weiteren Halbjahr'}", darfst du danach NIE Fragen zu diesen Themen aus ${hj} stellen.`;
      } else {
        themenRahmen += `\n→ In Phase 1 (Schwerpunkt-Fragen) darfst du diese Themen ergänzend ansprechen. In Phase 2 (weitere Halbjahre) sind sie TABU — dort gehören nur die Themen der anderen Halbjahre hin.`;
      }
    }
    if (weitereHjBlocks) {
      themenRahmen += `\n\nWeitere Halbjahre (Phase 2 der Fragephase):\n\n${weitereHjBlocks}`;
      themenRahmen += `\n\n→ In Phase 2 stellst du Fragen AUSSCHLIESSLICH zu den oben aufgeführten Themen der weiteren Halbjahre. Wenn du ein Halbjahr ankündigst (z.B. "Wir kommen nun zu ${config.weitereHalbjahre[0] || '13/1'}"), müssen die Fragen auch tatsächlich aus diesem Halbjahr stammen.`;
    }
    instruction += themenRahmen;

    // Phasen-Plan für die Fragephase — verhindert, dass die KI zu schon
    // behandelten Themen/HJ zurückspringt oder sich in einem HJ verliert.
    if (mode !== 'referat') {
      const weitereCount = config.weitereHalbjahre.length;
      // Im "fragen"-Modus dauert die Phase 2 insgesamt ~18 Min (UI-Label: ca. 20 Min Gesamt),
      // im "gesamt"-Modus ~15 Min (Referat + Fragen zusammen ~30 Min).
      const phase2Gesamt = mode === 'fragen' ? 18 : 15;
      const dauerProWeiteresHJ = weitereCount > 0 ? Math.round(phase2Gesamt / weitereCount) : 0;
      // Mindestdauer Gesamtgespräch vor erlaubtem Beenden
      const minGesamtMin = mode === 'fragen' ? 17 : 13;
      const phasenZeilen: string[] = [];
      phasenZeilen.push(`Phase 1 (~5–6 Min, 3–4 Fragen): Schwerpunktthema "${config.schwerpunkt}" aus ${hj}`);
      config.weitereHalbjahre.forEach((h, i) => {
        const t = topicsMap[h] || [];
        const themenHinweis = t.length > 0 ? ` — erlaubte Themen: ${t.filter(x => x && x.trim()).join(', ')}` : '';
        phasenZeilen.push(`Phase ${i + 2} (~${dauerProWeiteresHJ} Min, 4–5 Fragen): Halbjahr ${h}${themenHinweis}`);
      });

      instruction += `

PRÜFUNGSPHASEN (chronologisch, nacheinander abzuarbeiten):
${phasenZeilen.map(p => `• ${p}`).join('\n')}

PHASEN-FORTSCHRITTS-REGEL (kritisch — vor jeder Frage prüfen):
1. Du arbeitest die Phasen STRENG NACHEINANDER ab. Stelle in Phase 1 MINDESTENS 3 Fragen, in jeder weiteren Phase MINDESTENS 4 Fragen, bevor du wechselst. Obergrenze pro Phase: 5 Fragen — danach MUSST du zur nächsten Phase wechseln.
2. Phasenwechsel kündigst du klar an: "Wir kommen nun zu Halbjahr ${config.weitereHalbjahre[0] || 'X'}." — und stellst ab sofort AUSSCHLIESSLICH Fragen zur neuen Phase.
3. SOBALD DU EINE PHASE VERLASSEN HAST, IST SIE ENDGÜLTIG ERLEDIGT. Du darfst NIEMALS zu ihr zurückkehren — auch nicht für eine "kurze Nachfrage", "Ergänzung" oder weil dir noch etwas einfällt.
4. Auch wenn der Prüfling in einer späteren Phase ein Thema aus einer früheren Phase erwähnt: KEINE neuen Fragen dazu. Du darfst es höchstens kurz bestätigen ("Genau, das hatten Sie schon erwähnt.") und stellst dann die nächste Frage aus der AKTUELLEN Phase.
5. Frage NIE zweimal nach demselben Konzept — auch nicht umformuliert. Wenn dir eine Folgefrage einfällt, die thematisch an etwas bereits Behandeltes erinnert: VERWIRF sie und nimm eine neue.
6. Achte aktiv darauf, alle Phasen zu erreichen. Wenn nach ca. ${minGesamtMin} Min Gesprächsdauer noch ein Halbjahr fehlt, gehe SOFORT dorthin — auch wenn die aktuelle Phase noch nicht "voll" war.
7. Beende den Fragenteil NICHT vor ca. ${minGesamtMin} Min Gesprächsdauer. Wenn alle Phasen mit ihrer Mindestzahl behandelt sind und noch Zeit übrig ist, vertiefe in der AKTUELLEN Phase mit ein bis zwei zusätzlichen AB-III-Fragen — kehre NICHT zu früheren Phasen zurück. Erst wenn die Mindestdauer erreicht ist und alle Phasen substanziell behandelt sind, darfst du verabschieden.`;
    }

    if (mode === 'referat') {
      instruction += `
ABLAUF: Begrüße den Prüfling KURZ (1 Satz), dann lass ihn sein Kurzreferat halten (~10 Min).

KRITISCHE REGEL FÜR DAS KURZREFERAT:
- Du darfst während des Kurzreferats ABSOLUT NICHT SPRECHEN. KEIN EINZIGES WORT.
- KEINE Reaktion, KEIN "Mhm", KEIN "Ja", KEIN "Interessant", KEIN Nicken, KEINE Rückfrage. TOTALE STILLE.
- Auch wenn der Prüfling eine Pause macht: SCHWEIGE. Pausen im Referat sind völlig normal.
- Auch wenn der Prüfling dich direkt anspricht oder eine Frage stellt: SCHWEIGE – er soll frei vortragen.
- Wenn das Audio zwischendurch leise wird, undeutlich klingt oder du nichts hörst: NICHT kommentieren, NICHT "Schweigen", "Stille", "..." oder Ähnliches sagen, NICHT nachfragen — einfach weiter zuhören.
- Falls in der Spracherkennung Platzhalter wie "Schweigen", "Stille", "[silence]" oder ein einzelnes "..." auftauchen, behandle sie als reines Mikrofon-Signal und NICHT als gesprochenen Inhalt — antworte darauf nicht.
- Du darfst ERST WIEDER sprechen, wenn der Prüfling EXPLIZIT sagt, dass sein Referat beendet ist (z.B. "Damit bin ich am Ende", "Vielen Dank", "Das war mein Referat").
- Wenn der Prüfling nach 10–12 Minuten nicht selbst aufhört, darfst du ihn freundlich bitten, zum Ende zu kommen.
Danach beende die Prüfung mit einer kurzen Verabschiedung.`;
    } else if (mode === 'fragen') {
      instruction += `
ABLAUF: Begrüße den Prüfling. Stelle ${schwerpunktFragenBeschreibung} Dann wechsle zu ${weitere} mit 4–5 Fragen pro HJ (~17–18 Min, AB I→II→III). Beende die Prüfung NICHT vor ca. 17 Min Gesprächsdauer — füge bei Restzeit lieber weitere vertiefende Fragen in der aktuellen Phase ein, statt früh zu verabschieden.

INTERAKTIONSREGELN FÜR DIE FRAGEPHASE:
- Du bist der GESPRÄCHSFÜHRER. Warte NICHT darauf, dass der Prüfling von sich aus etwas sagt — stelle aktiv Fragen.
- Wenn der Prüfling auf eine Frage antwortet: Stelle eine ANSCHLUSSFRAGE oder gehe zum nächsten Thema.
- Wenn der Prüfling schweigt oder zögert (>5 Sekunden): Formuliere die Frage um oder gib einen kleinen Hinweis als Hilfestellung.
- Wenn der Prüfling dich ignoriert oder nicht reagiert: Wiederhole die Frage freundlich aber bestimmt, z.B. "Können Sie dazu noch etwas sagen?" oder "Versuchen Sie es einmal."
- Halte den Gesprächsfluss aufrecht — es darf KEINE langen Pausen geben. Du führst das Gespräch.
- Reagiere auf JEDE Antwort: kurzes Feedback ("Gut", "Richtig", "Da möchte ich nachfragen...") und dann die nächste Frage.`;
    } else {
      instruction += `
ABLAUF:
1. Begrüße den Prüfling KURZ (1 Satz), dann lass ihn sein Kurzreferat halten (~10 Min).
   KRITISCHE REGEL: Während des Kurzreferats ABSOLUTE STILLE. KEIN EINZIGES WORT. KEINE Reaktion. Auch bei Pausen SCHWEIGEN. Wenn das Audio kurz leise wird, undeutlich klingt oder du nichts hörst, NICHT kommentieren – einfach weiter zuhören. Platzhalter wie "Schweigen", "Stille" oder "..." sind reine Mikrofon-Signale und KEIN gesprochener Inhalt – darauf NICHT antworten. Erst wieder sprechen, wenn der Prüfling EXPLIZIT sagt, dass er fertig ist (z.B. "Damit bin ich am Ende", "Vielen Dank"). Nach 10–12 Min ohne Abschluss darfst du freundlich bitten, zum Ende zu kommen.
2. Stelle ${schwerpunktFragenBeschreibung}
3. Wechsle zu ${weitere} mit 4–5 Fragen pro HJ (~15 Min, AB I→II→III).
4. Beende die Prüfung.

INTERAKTIONSREGELN FÜR DIE FRAGEPHASE (Punkte 2-4):
- Du bist der GESPRÄCHSFÜHRER. Stelle aktiv Fragen, warte NICHT auf Initiative des Prüflings.
- Wenn der Prüfling schweigt oder zögert: Formuliere die Frage um oder gib einen Hinweis.
- Wenn der Prüfling dich ignoriert: Wiederhole die Frage freundlich aber bestimmt.
- Reagiere auf JEDE Antwort: kurzes Feedback und dann die nächste Frage. Halte den Gesprächsfluss aufrecht.`;
    }
  }

  // Fächerspezifische Operatoren für Nicht-Mathe-Fächer im Fragenmodus
  if (!isMathe && mode !== 'referat') {
    const ops = getOperatorenFuerFach(config.subject);
    instruction += `

OPERATOREN FÜR DEINE FRAGEN:
Verwende in deinen Fragen überwiegend fachspezifische Operatoren (~70%). Die restlichen dürfen offene Gesprächsfragen sein ("Was wissen Sie über...", "Wie sehen Sie das?").

Operatoren nach Anforderungsbereich:
- AB I (Reproduktion): ${ops.AB_I.join(', ')}
- AB II (Transfer): ${ops.AB_II.join(', ')}
- AB III (Reflexion): ${ops.AB_III.join(', ')}

Schwerpunkt-Fragen: Verwende AB II/III-Operatoren. Weitere Halbjahre: Starte mit AB I und steigere zu AB III.
Beispiel: Statt "Was wissen Sie über X?" → "${ops.AB_II[0]} den Zusammenhang zwischen X und Y."`;
  }

  // Materialimpulse für den Fragenteil
  if (config.materialImpulse && config.materialImpulse.length > 0) {
    const fragenteilLabel = isMathe ? 'WEITERES GEBIET' : 'WEITERE HALBJAHRE';
    instruction += `\n\nMATERIALIMPULSE FÜR DEN FRAGENTEIL (${fragenteilLabel}):
Dir stehen folgende Materialien zur Verfügung, die dem Prüfling NUR während der Fragen ${isMathe ? 'zum weiteren Gebiet' : 'zu den weiteren Halbjahren'} visuell angezeigt werden. Verwende sie NICHT im Schwerpunkt-Fragenteil.`;

    config.materialImpulse.forEach((m, i) => {
      const chartHinweis = m.chartDaten ? ` (mit ${m.chartDaten.typ === 'balken' ? 'Balkendiagramm' : 'Kreisdiagramm'})` : '';
      instruction += `\n\nMaterial ${i + 1}: "${m.titel}"${chartHinweis}
${m.inhalt}
(Quelle: ${m.quellenangabe})`;
      if (i === 0) {
        instruction += `\n→ Wird dem Prüfling kurz nach Beginn der Fragen ${isMathe ? 'zum weiteren Gebiet' : 'zu den weiteren Halbjahren'} eingeblendet. Leite über mit: "Ich möchte Ihnen nun ein Material vorlegen." Stelle dann eine Frage, die sich auf dieses Material bezieht.`;
      } else {
        instruction += `\n→ Wird etwas später eingeblendet. Leite erneut über mit: "Ich lege Ihnen ein weiteres Material vor." Stelle dann eine Frage dazu.`;
      }
    });
  }

  instruction += `
GEDÄCHTNIS-REGEL:
- Merke dir EXAKT, was der Prüfling bereits gesagt hat – sowohl im ${isMathe ? 'Vortrag' : 'Referat'} als auch bei Antworten.
- Stelle NIEMALS eine Frage zu einem Thema, das der Prüfling bereits ausführlich behandelt hat.
- Wenn der Prüfling etwas im ${isMathe ? 'Vortrag' : 'Referat'} erklärt hat, frage NICHT nochmal danach, sondern stelle VERTIEFENDE Fragen dazu oder wechsle zu einem NEUEN Aspekt.
- Beziehe dich auf das Gesagte: "Sie haben vorhin ... erwähnt. Können Sie das vertiefen?" statt das Thema nochmal von vorne aufzurollen.

SPRACHERKENNUNGS-REGEL (sehr wichtig):
- Die Spracherkennung hat besonders bei Abkürzungen (z.B. NSDAP, KPD, BRD, DDR, NATO, EWG, EU, UN, UdSSR, USA, BIP, DNA, RNA, ATP, CO₂) und bei englischsprachigen Fachbegriffen, Eigennamen oder Zitaten häufig Fehler.
- Wenn du ein Wort, eine Abkürzung oder einen Namen NICHT eindeutig verstanden hast: RATE NICHT, sondern frage KURZ nach. Beispiele: "Welche Abkürzung meinen Sie genau?" / "Können Sie das nochmal sagen?" / "Habe ich Sie richtig verstanden: Sie meinen NSDAP?"
- Akzeptiere phonetisch ähnliche Varianten als korrekten Begriff, wenn der Kontext eindeutig ist (z.B. "En-Es-De-A-Pe" oder "Ene-Es-De-A-Pe" = NSDAP).
- Bewerte einen Fachbegriff NIEMALS als falsch, wenn die Unklarheit aus der Spracherkennung kommen kann — frage im Zweifel nach.`;

  const verhalten = PRUEFER_PRESETS[config.prueferTyp || 'standard'];
  instruction += `
VERHALTEN: ${verhalten}${getLanguageInstruction(config.subject)}`;

  return instruction;
}

/* ───────── Live session ───────── */

interface LiveAPISession {
  sendRealtimeInput(input: { media: { data: string; mimeType: string } }): void;
  close(): void;
}

const MAX_RECONNECT_ATTEMPTS = 12;
const RECONNECT_BASE_DELAY_MS = 1500;
/** Maximale Verzögerung zwischen Reconnect-Versuchen (30 Sekunden) */
const MAX_RECONNECT_DELAY_MS = 30_000;
/**
 * Wenn weder Server noch Client 60s lang etwas geschickt haben → proaktiver Reconnect.
 *
 * Why: Im Kurzreferat (Teil 1) spricht der Prüfling bis zu ~10 Minuten am Stück
 * und die KI schweigt absichtlich. Der Monitor zählt jetzt BEIDE Richtungen:
 * solange der Client Audio-Frames sendet (User spricht), ist die Verbindung
 * nachweislich lebendig — egal ob die KI antwortet. Erst wenn auch der User
 * 60s+ stumm ist UND die KI nichts sagt, ist die WS wirklich tot.
 */
const ACTIVITY_TIMEOUT_MS = 60_000;
/** Intervall für den Activity-Check */
const ACTIVITY_CHECK_INTERVAL_MS = 15_000;

export class LiveSession {
  private ai: GoogleGenAI;
  private session: LiveAPISession | null = null;
  private audioProcessor: AudioProcessor;
  private audioPlayer: AudioPlayer;
  private config: LiveSessionConfig;
  private stopped = false;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private instruction = '';
  private activityTimer: number | null = null;
  private lastMessageTime = 0;
  /** Zeitpunkt des letzten erfolgreich gesendeten Audio-Frames vom Client.
   *  Wird genutzt, damit der Activity-Monitor während des Kurzreferats nicht
   *  fälschlich anschlägt — solange der User spricht, ist die WS lebendig. */
  private lastClientSentTime = 0;
  /** Zeitpunkt des letzten onopen – für Stabilitätsprüfung */
  private connectionOpenedAt = 0;
  /** Mindest-Dauer (ms) damit eine Verbindung als "stabil" gilt */
  private static readonly STABLE_CONNECTION_MS = 10_000;

  constructor(config: LiveSessionConfig, preWarmedProcessor?: AudioProcessor) {
    this.ai = createAI();
    this.audioProcessor = preWarmedProcessor || new AudioProcessor();
    this.audioPlayer = new AudioPlayer();
    this.config = config;
  }

  async start() {
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.instruction = this.config.feedbackMode
      ? buildFeedbackInstruction(this.config)
      : buildExamInstruction(this.config);
    await this.connect();
  }

  /** Baut bei Reconnect die Instruction mit bisherigem Transkript-Kontext auf */
  private buildReconnectInstruction(): string {
    const transcripts = this.config.getTranscripts?.();
    if (!transcripts || (transcripts.modelTx.length === 0 && transcripts.userTx.length === 0)) {
      return this.instruction;
    }

    // Transkript zusammenbauen (max 10.000 Zeichen um Token-Limit nicht zu sprengen)
    const lines: string[] = [];
    const max = Math.max(transcripts.modelTx.length, transcripts.userTx.length);
    for (let i = 0; i < max; i++) {
      if (transcripts.userTx[i]) lines.push(`Prüfling: ${transcripts.userTx[i]}`);
      if (transcripts.modelTx[i]) lines.push(`Prüfer: ${transcripts.modelTx[i]}`);
    }
    const transcript = lines.join('\n').slice(0, 10_000);

    return `${this.instruction}

KONTEXT-WIEDERHERSTELLUNG (Verbindung wurde unterbrochen):
Das Gespräch wurde durch eine technische Unterbrechung kurz getrennt. Setze es NAHTLOS an der letzten Stelle fort.
- Wiederhole NICHT deine Begrüßung.
- Fasse das Bisherige NICHT zusammen, es sei denn, der Prüfling fragt danach.
- Sage kurz: "Entschuldigung für die kurze Unterbrechung. Wir machen weiter." und fahre dann mit der nächsten Frage oder dem nächsten Punkt fort.
- Stelle KEINE Fragen, die bereits beantwortet wurden.

Bisheriges Gespräch:
${transcript}`;
  }

  private async connect() {
    if (this.stopped) return;

    try {
      const isReconnect = this.reconnectAttempts > 0;
      this.config.onStatusChange?.(isReconnect ? 'reconnecting' : 'connecting');

      // Alte Session sicher schließen
      try { this.session?.close(); } catch { /* ignorieren */ }
      this.session = null;

      // Bei Reconnect: Transkript-Kontext in die Instruction injizieren
      const instruction = isReconnect ? this.buildReconnectInstruction() : this.instruction;

      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.gender === 'female' ? 'Kore' : 'Puck' } },
          },
          thinkingConfig: {
            thinkingBudget: 0,
          },
          systemInstruction: instruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.connectionOpenedAt = Date.now();
            this.lastMessageTime = Date.now();
            this.lastClientSentTime = Date.now();
            this.reconnecting = false;
            // reconnectAttempts wird NICHT hier zurückgesetzt –
            // erst in onclose, wenn die Verbindung stabil war (>10s)
            console.log(`WebSocket verbunden (Versuch ${this.reconnectAttempts} zuvor)`);
            this.config.onStatusChange?.('connected');
            this.startActivityMonitor();

            const sendAudio = (base64Data: string) => {
              try {
                this.session?.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
                this.lastClientSentTime = Date.now();
              } catch {
                // Sendefehler ignorieren – wird beim nächsten Chunk erneut versucht
              }
            };

            // Mikrofon läuft noch → nur Callback umhängen (kein erneutes getUserMedia)
            if (this.audioProcessor.isRecording()) {
              this.audioProcessor.updateCallback(sendAudio);
            } else {
              this.audioProcessor.startRecording(sendAudio);
            }
          },
          onmessage: async (message) => {
            this.lastMessageTime = Date.now();

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const shouldPlay = this.config.shouldPlayModelAudio?.() ?? true;
              if (shouldPlay) this.audioPlayer.playChunk(base64Audio);
            }

            if (message.serverContent?.interrupted) this.audioPlayer.stop();

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text && !isThinkingText(part.text) && !isSilencePlaceholder(part.text)) {
                  this.config.onModelTranscription?.(part.text);
                }
              }
            }

            const userText = (message as any).serverContent?.inputTranscription?.text;
            if (userText && !isSilencePlaceholder(userText)) {
              this.config.onUserTranscription?.(userText);
            }
          },
          onclose: () => {
            this.stopActivityMonitor();
            const duration = Date.now() - this.connectionOpenedAt;
            console.log(`WebSocket geschlossen nach ${Math.round(duration / 1000)}s`);

            // Verbindung war stabil → Zähler zurücksetzen
            if (duration > LiveSession.STABLE_CONNECTION_MS) {
              this.reconnectAttempts = 0;
            }

            if (!this.stopped) {
              this.tryReconnect();
            } else {
              this.audioProcessor.stopRecording();
              this.config.onStatusChange?.('disconnected');
            }
          },
          onerror: (err) => {
            console.error("Live API Fehler:", err);
            this.stopActivityMonitor();
            if (!this.stopped) {
              this.tryReconnect();
            } else {
              this.audioProcessor.stopRecording();
              this.config.onStatusChange?.('error');
            }
          }
        }
      }) as unknown as LiveAPISession;
    } catch (error) {
      console.error("Verbindung fehlgeschlagen:", error);
      if (!this.stopped) {
        this.tryReconnect();
      } else {
        this.audioProcessor.stopRecording();
        this.config.onStatusChange?.('error');
      }
    }
  }

  /** Erkennt "tote" Verbindungen: offen, aber weder Server-Nachrichten noch
   *  Client-Audio fließen. Während eines langen Vortrags sendet der Client
   *  konstant Audio-Frames — der Monitor schlägt dann zurecht nicht an. */
  private startActivityMonitor() {
    this.stopActivityMonitor();
    this.activityTimer = window.setInterval(() => {
      if (this.stopped) return;
      const now = Date.now();
      const idleServer = now - this.lastMessageTime;
      const idleClient = now - this.lastClientSentTime;
      const idle = Math.min(idleServer, idleClient);
      if (idle > ACTIVITY_TIMEOUT_MS) {
        console.warn(
          `Beide Seiten stumm seit ${Math.round(idle / 1000)}s ` +
          `(Server: ${Math.round(idleServer / 1000)}s, Client: ${Math.round(idleClient / 1000)}s) – Reconnect`
        );
        try { this.session?.close(); } catch { /* ignorieren */ }
        // onclose löst tryReconnect() aus
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }

  private stopActivityMonitor() {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private tryReconnect() {
    // Guard: verhindert mehrfache gleichzeitige Reconnects (z.B. onclose + onerror)
    if (this.reconnecting || this.stopped) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`Maximale Reconnect-Versuche (${MAX_RECONNECT_ATTEMPTS}) erreicht – aufgeben`);
      this.audioProcessor.stopRecording();
      this.config.onStatusChange?.('error');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    // Exponentielles Backoff mit Jitter, gedeckelt auf MAX_RECONNECT_DELAY_MS
    const baseDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    console.log(`Reconnect in ${Math.round(delay)}ms (Versuch ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    this.config.onStatusChange?.('reconnecting');
    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, delay);
  }

  /** Manueller Reconnect-Versuch von außen (z.B. nach Klick auf "Erneut verbinden") */
  retryConnect() {
    if (this.stopped) return;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.config.onStatusChange?.('reconnecting');
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.reconnecting = false;
    this.stopActivityMonitor();
    this.audioProcessor.stopRecording();
    this.audioPlayer.stop();
    try { this.session?.close(); } catch { /* ignorieren */ }
    this.session = null;
  }
}

/* ───────── Stateful Live Session (mit Server-Side State via Durable Object) ───────── */

export class StatefulLiveSession {
  private sessionId: string | null = null;
  private ws: WebSocket | null = null;
  private audioProcessor: AudioProcessor;
  private audioPlayer: AudioPlayer;
  private config: LiveSessionConfig;
  private stopped = false;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private lastMessageTime = 0;
  private activityTimer: number | null = null;
  private connectionOpenedAt = 0;
  private instruction = '';

  constructor(config: LiveSessionConfig, preWarmedProcessor?: AudioProcessor) {
    this.audioProcessor = preWarmedProcessor || new AudioProcessor();
    this.audioPlayer = new AudioPlayer();
    this.config = config;
  }

  async start() {
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;

    // System-Instruction vorbereiten
    this.instruction = this.config.feedbackMode
      ? buildFeedbackInstruction(this.config)
      : buildExamInstruction(this.config);

    // Session auf dem Server erstellen (mit student_id für Subscription-Check)
    const studentId = sessionStorage.getItem('student_id') || '';
    const accessToken = sessionStorage.getItem('access_token') || '';
    const response = await fetch(`${WORKER_URL}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Token': accessToken },
      body: JSON.stringify({
        student_id: studentId,
        subject: this.config.subject,
        examLevel: this.config.examLevel,
        schwerpunkt: this.config.schwerpunkt,
        schwerpunktHalbjahr: this.config.schwerpunktHalbjahr,
        weitereHalbjahre: this.config.weitereHalbjahre,
        examMode: this.config.examMode || 'gesamt',
        prueferTyp: this.config.prueferTyp || 'standard',
        gender: this.config.gender || 'male',
        aufgabenstellung: this.config.aufgabenstellung || '',
        material: this.config.material || '',
        systemInstruction: this.instruction,
        feedbackMode: this.config.feedbackMode || false,
        voiceName: this.config.gender === 'female' ? 'Kore' : 'Puck',
      }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        window.location.href = '/abo.html';
        throw new Error('Kein aktives Abo');
      }
      throw new Error('Session-Erstellung fehlgeschlagen');
    }

    const data = await response.json() as { sessionId: string };
    this.sessionId = data.sessionId;

    await this.connectWebSocket();
  }

  private async connectWebSocket() {
    if (this.stopped || !this.sessionId) return;

    const isReconnect = this.reconnectAttempts > 0;
    this.config.onStatusChange?.(isReconnect ? 'reconnecting' : 'connecting');

    try { this.ws?.close(); } catch {}
    this.ws = null;

    const wsUrl = `${WORKER_URL!.replace('https://', 'wss://').replace('http://', 'ws://')}/session/${this.sessionId}/ws`;
    // Browser-WebSockets können keine Custom-Header senden — Token wird daher
    // als Subprotocol übergeben. Server liest Sec-WebSocket-Protocol.
    const wsAccessToken = sessionStorage.getItem('access_token') || '';
    this.ws = wsAccessToken
      ? new WebSocket(wsUrl, [`bearer.${wsAccessToken}`])
      : new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connectionOpenedAt = Date.now();
      this.lastMessageTime = Date.now();
      this.reconnecting = false;
      console.log(`Session-WS verbunden (sessionId=${this.sessionId})`);
      this.config.onStatusChange?.('connected');
      this.startActivityMonitor();

      const sendAudio = (base64Data: string) => {
        try {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{ data: base64Data, mimeType: 'audio/pcm;rate=16000' }]
              }
            }));
          }
        } catch { /* Sendefehler ignorieren */ }
      };

      if (this.audioProcessor.isRecording()) {
        this.audioProcessor.updateCallback(sendAudio);
      } else {
        this.audioProcessor.startRecording(sendAudio);
      }
    };

    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      try {
        const data = JSON.parse(event.data);

        // DO-eigene Nachrichten
        if (data.type === 'session_restored') {
          console.log(`Session wiederhergestellt (${data.transcriptLength} Transkript-Einträge)`);
          return;
        }
        if (data.type === 'error') {
          console.error('Session-Fehler:', data.message);
          return;
        }

        // Audio abspielen (nur wenn nicht stummgeschaltet)
        const base64Audio = data?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const shouldPlay = this.config.shouldPlayModelAudio?.() ?? true;
          if (shouldPlay) this.audioPlayer.playChunk(base64Audio);
        }

        if (data?.serverContent?.interrupted) this.audioPlayer.stop();

        // Transkriptionen weiterleiten — Silence-/Schweigen-Platzhalter rausfiltern
        if (data?.serverContent?.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.text && !isThinkingText(part.text) && !isSilencePlaceholder(part.text)) {
              this.config.onModelTranscription?.(part.text);
            }
          }
        }
        const userText = data?.serverContent?.inputTranscription?.text;
        if (userText && !isSilencePlaceholder(userText)) {
          this.config.onUserTranscription?.(userText);
        }
      } catch { /* Nicht-JSON ignorieren */ }
    };

    this.ws.onclose = () => {
      this.stopActivityMonitor();
      const duration = Date.now() - this.connectionOpenedAt;
      console.log(`Session-WS geschlossen nach ${Math.round(duration / 1000)}s`);
      if (duration > 10_000) this.reconnectAttempts = 0;
      if (!this.stopped) {
        this.tryReconnect();
      } else {
        this.audioProcessor.stopRecording();
        this.config.onStatusChange?.('disconnected');
      }
    };

    this.ws.onerror = () => {
      console.error('Session-WS Fehler');
      this.stopActivityMonitor();
      if (!this.stopped) {
        this.tryReconnect();
      } else {
        this.audioProcessor.stopRecording();
        this.config.onStatusChange?.('error');
      }
    };
  }

  private startActivityMonitor() {
    this.stopActivityMonitor();
    this.activityTimer = window.setInterval(() => {
      if (this.stopped) return;
      const idle = Date.now() - this.lastMessageTime;
      if (idle > ACTIVITY_TIMEOUT_MS) {
        console.warn(`Keine Aktivität seit ${Math.round(idle / 1000)}s – Reconnect`);
        try { this.ws?.close(); } catch {}
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }

  private stopActivityMonitor() {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private tryReconnect() {
    if (this.reconnecting || this.stopped) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Maximale Reconnect-Versuche erreicht');
      this.audioProcessor.stopRecording();
      this.config.onStatusChange?.('error');
      return;
    }
    this.reconnecting = true;
    this.reconnectAttempts++;
    const baseDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    console.log(`Session-Reconnect in ${Math.round(delay)}ms (Versuch ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    this.config.onStatusChange?.('reconnecting');
    setTimeout(() => {
      this.reconnecting = false;
      this.connectWebSocket(); // Gleiche sessionId → DO stellt Kontext her
    }, delay);
  }

  /** Manueller Reconnect-Versuch von außen (z.B. nach Klick auf "Erneut verbinden") */
  retryConnect() {
    if (this.stopped) return;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.config.onStatusChange?.('reconnecting');
    this.connectWebSocket();
  }

  stop() {
    this.stopped = true;
    this.reconnecting = false;
    this.stopActivityMonitor();
    this.audioProcessor.stopRecording();
    this.audioPlayer.stop();
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  /** Transkript vom Server abrufen (für Feedback-Generierung) */
  async getServerTranscript(): Promise<Array<{ role: string; text: string; timestamp: number }>> {
    if (!this.sessionId) return [];
    try {
      const accessToken = sessionStorage.getItem('access_token') || '';
      const res = await fetch(`${WORKER_URL}/session/${this.sessionId}/transcript`, {
        headers: { 'X-Access-Token': accessToken }
      });
      const data = await res.json() as { transcript: Array<{ role: string; text: string; timestamp: number }> };
      return data.transcript || [];
    } catch {
      return [];
    }
  }
}
