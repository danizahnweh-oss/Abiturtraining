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

export interface ExamMaterial {
  aufgabenstellung: string;
  material: string;
  hinweise: string;
  materialImpulse?: MaterialImpuls[];
}

export interface ExamConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  isMathe?: boolean; // Mathe-Kolloquium: Gebiete statt Halbjahre
}

export type ExamMode = 'gesamt' | 'referat' | 'fragen';

export type PrueferTyp = 'standard' | 'streng' | 'freundlich' | 'zeitdruck' | 'detailfragen';

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
  /** Wenn gesetzt: Model-Audio wird nur abgespielt wenn true zurückgegeben wird */
  shouldPlayModelAudio?: () => boolean;
  onModelTranscription?: (text: string) => void;
  onUserTranscription?: (text: string) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error') => void;
  /** Liefert aktuelle Transkripte für Kontext-Wiederherstellung bei Reconnect */
  getTranscripts?: () => { modelTx: string[]; userTx: string[] };
}

const WORKER_URL = process.env.WORKER_URL;

const createAI = () => {
  // If Worker URL is set, route through the Cloudflare proxy (key stays server-side)
  if (WORKER_URL) {
    return new GoogleGenAI({
      apiKey: 'PROXY',
      httpOptions: { baseUrl: WORKER_URL },
    });
  }
  // Fallback for local development with direct API key
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
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

  if (WORKER_URL) {
    // Über Worker-Proxy – Worker setzt x-goog-api-key automatisch
    url = `${WORKER_URL}/v1beta/models/${model}:generateContent`;
  } else {
    // Lokale Entwicklung – direkter API-Aufruf mit Key
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    headers['x-goog-api-key'] = process.env.GEMINI_API_KEY || '';
  }

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
    return parsed;
  } catch {
    return null;
  }
}

export async function generateExamMaterial(config: ExamConfig): Promise<ExamMaterial> {
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau' : 'grundlegendes Anforderungsniveau';

  const prompt = `Du bist ein erfahrener Prüfungsausschuss-Vorsitzender für das bayerische Abitur-Kolloquium.

Erstelle eine realistische Aufgabenstellung mit Material für ein Kurzreferat im Kolloquium.

Fach: ${config.subject}
Anforderungsniveau: ${levelLabel}
Halbjahr: ${config.schwerpunktHalbjahr}
Schwerpunktthema: ${config.schwerpunkt}

Anforderungen:
1. Formuliere eine klare, anspruchsvolle Aufgabenstellung, die alle drei Anforderungsbereiche (Reproduktion, Transfer, Reflexion) abdeckt.
2. Stelle im Feld "material" IMMER 1–2 konkrete Materialien bereit, die der Prüfling in sein Referat einbeziehen soll:
   - Ein echtes oder realistisches Zitat (mit Autor, Werk, Jahr)
   - ODER eine konkrete Statistik/Tabelle mit echten Zahlenwerten
   - ODER einen kurzen Quellentext-Auszug (3–5 Sätze) aus einem Fachbuch oder einer Studie
   - ODER ein Schaubild/Diagramm als Textbeschreibung (z.B. beschriftete Zeichnung, Prozessdiagramm, Stammbaum)
   Jedes Material MUSS eine Quellenangabe haben (Autor, Titel, Jahr).
3. Gib kurze Hinweise zur Bearbeitung.
${config.subject === 'Biologie' ? `
WICHTIG für Biologie: Bevorzuge visuelle Materialien, wie sie typisch für Biologie-Prüfungen sind:
- Beschriftete Schaubilder (z.B. "Abbildung: Bau einer tierischen Zelle" mit Beschriftung der Organellen)
- Prozessdiagramme (z.B. vereinfachtes Schema der Photosynthese oder Proteinbiosynthese)
- Stammbäume (z.B. Erbgang einer genetischen Erkrankung)
- Experimentergebnisse als Tabelle oder Diagramm (z.B. Enzymaktivität bei verschiedenen Temperaturen)
Vermeide reine Textwände. Stelle das Material so dar, wie es auf einem Aufgabenblatt stehen würde: mit Abbildungstitel, Beschriftungen und Legende.
` : ''}${config.subject === 'Chemie' ? `
WICHTIG für Chemie: Bevorzuge fachtypische Materialien:
- Reaktionsgleichungen mit Strukturformeln
- Energiediagramme (exotherm/endotherm)
- Experimentergebnisse als Tabelle
` : ''}
BEISPIEL für gutes Material (Fach Geschichte):
"Material 1 – Quelle:\\nRede von Bundeskanzler Willy Brandt vor dem Deutschen Bundestag am 28. Oktober 1969: \\"Wir wollen mehr Demokratie wagen. Wir wollen eine Gesellschaft, die mehr Freiheit bietet und mehr Mitverantwortung fordert.\\"\\n(Quelle: Regierungserklärung Willy Brandt, 28.10.1969)\\n\\nMaterial 2 – Statistik:\\nWahlbeteiligung bei Bundestagswahlen: 1972: 91,1% | 1980: 88,6% | 1990: 77,8% | 2002: 79,1% | 2021: 76,6%\\n(Quelle: Bundeswahlleiter, 2021)"${config.subject === 'Biologie' ? `

BEISPIEL für gutes Biologie-Material:
"Material 1 – Schaubild:\\nAbbildung: Vereinfachtes Schema der Lichtreaktion der Photosynthese\\n\\n  H₂O → [Photosystem II] → Elektronentransportkette → [Photosystem I] → NADPH\\n         |                    |\\n         O₂                  ATP (via Chemiosmose)\\n\\nBeschriftung: Thylakoidmembran, Lumen, Stroma\\n(Quelle: nach Campbell Biologie, 11. Auflage, 2019)\\n\\nMaterial 2 – Experimentergebnis:\\nEnzymaktivität der Amylase bei verschiedenen pH-Werten:\\npH 4: 12% | pH 5: 38% | pH 6: 71% | pH 7: 100% | pH 8: 65% | pH 9: 22%\\n(Quelle: Versuchsergebnisse nach Purves Biologie, 2011)"` : ''}

Antworte als JSON-Objekt mit den Feldern: aufgabenstellung, material, hinweise.`;

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
    const fallbackPrompt = `Erstelle für das Fach ${config.subject} (${levelLabel}) zum Thema "${config.schwerpunkt}" (Halbjahr ${config.schwerpunktHalbjahr}) eine Kolloquiums-Aufgabe mit konkretem Material.

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

Gib im Feld "material" konkrete mathematische Objekte an, die dem Prüfling vorgelegt werden:
Funktionsterme, Gleichungen, Vektoren, Matrizen, Graphen-Beschreibungen, Tabellen mit Werten.

Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON):
{"aufgabenstellung":"Die vollständigen Aufgaben mit Teilaufgaben, klar formuliert mit Operatoren, mit Gebiet-Überschriften","material":"Konkrete mathematische Objekte (Funktionsterme, Vektoren, Graphen-Beschreibungen etc.)","hinweise":"Bearbeitungshinweise für die Vorbereitungszeit"}`;

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
  if (subject === 'Chemie') return 'Reaktionsgleichungen, Energiediagramme, Experimentergebnisse, Stoffdaten-Tabellen, Strukturformeln';
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

  const prompt = `Du bist ein erfahrener Prüfungsausschuss-Vorsitzender für das bayerische Abitur-Kolloquium.

Erstelle 2 realistische Material-Impulse, die einem Prüfling während des Fragenteils ${isMathe ? 'zum WEITEREN GEBIET' : 'zu den WEITEREN HALBJAHREN'} vorgelegt werden.

Fach: ${config.subject}
Anforderungsniveau: ${levelLabel}
${weitereLabel}

Geeignete Material-Typen für dieses Fach: ${materialTypen}${matheHinweis}${bioHinweis}

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

export async function generateWrittenFeedback(config: {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
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

  const prompt = `Du bist ein strenger aber fairer bayerischer Abiturprüfer. Analysiere das folgende Prüfungstranskript einer Kolloquiumsprüfung und gib KRITISCHES, EHRLICHES Feedback.

Fach: ${config.subject} (${config.examLevel === 'eA' ? 'erhöht' : 'grundlegend'})
Schwerpunkt: ${config.schwerpunkt}

VOLLSTÄNDIGES TRANSKRIPT DER PRÜFUNG:
---
${lines.join('\n') || '(Kein Transkript verfügbar)'}
---

WICHTIGE ANWEISUNGEN:
- Du MUSST dich auf KONKRETE Aussagen des Prüflings im Transkript beziehen. Zitiere wörtlich, was der Prüfling gesagt hat.
- Benenne KONKRET, was fachlich falsch, ungenau oder oberflächlich war. Nenne die korrekte Antwort.
- Bewerte EHRLICH und KRITISCH. Vergib KEINE Gefälligkeitsnoten. Wenn die Leistung schwach war, sage das klar.
- Unterscheide zwischen auswendig Gelerntem (AB I) und eigenständigem Denken (AB II/III).
- Bewerte die Ausdrucksweise nach diesen Kriterien: Sind Fachbegriffe korrekt verwendet? Ist die Argumentationsstruktur schlüssig? Wie ist die Präsentationsfähigkeit? — Umgangssprachliche Formulierungen sind KEIN Fehler und dürfen NICHT negativ bewertet werden. Perfektes Standarddeutsch ist nicht erforderlich; entscheidend ist die fachliche Korrektheit.

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
(0–15 Punkte mit DETAILLIERTER Begründung, orientiert an den Notenstufen: 15-13 sehr gut, 12-10 gut, 9-7 befriedigend, 6-4 ausreichend, 3-1 mangelhaft, 0 ungenügend)

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
Schreibe auf Hochdeutsch (Standarddeutsch). Sei EHRLICH – Schönreden hilft dem Prüfling nicht bei der Vorbereitung.
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
    ? 'eine strenge aber faire bayerische Abiturprüferin'
    : 'ein strenger aber fairer bayerischer Abiturprüfer';

  return `Du bist ${prüferRolle}. Gib MÜNDLICHES FEEDBACK zur Kolloquiumsprüfung.
Fach: ${config.subject} (${config.examLevel}), Schwerpunkt: ${config.schwerpunkt}

TRANSKRIPT:
${transcript || '(Nicht verfügbar)'}

AUFGABE: Ehrlicher Gesamteindruck → konkrete fachliche Fehler benennen und korrigieren → Stärken → Bewertung AB I/II/III → Punkteeinschätzung (0–15, keine Gefälligkeitsnoten!) → 2–3 Verbesserungstipps. Beantworte Rückfragen. ${langHint}`;
}

function buildExamInstruction(config: LiveSessionConfig): string {
  const level = config.examLevel === 'eA' ? 'eA' : 'gA';
  const mode = config.examMode || 'gesamt';
  const isMathe = config.subject === 'Mathematik';
  const prüferLabel = config.gender === 'female' ? 'Prüferin' : 'Prüfer';

  let instruction: string;

  if (isMathe) {
    // Mathe-Kolloquium: Gebiete statt Halbjahre, kein Schwerpunkt – beide Gebiete gleichwertig
    const gebiete = config.weitereHalbjahre.join(' und '); // z.B. "Analysis und Geometrie"
    instruction = `Du bist ${prüferLabel} im bayerischen Abitur-Kolloquium 2026.
Fach: Mathematik (eA), Prüfungsgebiete: ${gebiete}.`;

    if (config.aufgabenstellung) {
      instruction += `\nDem Prüfling wurden folgende Aufgaben vorgelegt:\n${config.aufgabenstellung}`;
      if (config.material) instruction += `\nMathematische Objekte: ${config.material}`;
    }

    const stilleRegel = `
KRITISCHE REGEL FÜR DEN AUFGABEN-VORTRAG:
- Du darfst während des Vortrags ABSOLUT NICHT SPRECHEN. KEIN EINZIGES WORT.
- KEINE Reaktion, KEIN "Mhm", KEIN "Ja", KEIN "Richtig", KEINE Rückfrage. TOTALE STILLE.
- Auch wenn der Prüfling eine Pause macht oder unsicher wirkt: SCHWEIGE.
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
ABLAUF: Begrüße den Prüfling KURZ (1 Satz). Er wird seine vorbereiteten Lösungen zu den Aufgaben (${gebiete}) in einem zusammenhängenden Vortrag präsentieren (~10 Min).
${stilleRegel}
Danach beende die Prüfung mit einer kurzen Verabschiedung.`;
    } else if (mode === 'fragen') {
      instruction += `
ABLAUF: Begrüße den Prüfling. Stelle gemischte Fragen zu ${gebiete} (~20 Min).
Decke beide Gebiete gleichmäßig ab. Steigere den Schwierigkeitsgrad (AB I→II→III).
Lege ggf. Zusatzmaterialien vor (Funktionsterme, Gleichungen, Graphen-Beschreibungen, Vektoren).
Beende die Prüfung.
${matheFragenHinweis}`;
    } else {
      instruction += `
ABLAUF:
1. Begrüße den Prüfling KURZ (1 Satz). Er wird seine vorbereiteten Lösungen zu den Aufgaben (${gebiete}) in einem zusammenhängenden Vortrag präsentieren (~10 Min).
   ${stilleRegel}
2. Stelle vertiefende Fragen zu den vorgelegten Aufgaben und beiden Gebieten (~5 Min, AB II/III).
   Z.B. Fragen die an den Vortrag anknüpfen, Verallgemeinerungen, oder neue Aspekte.
3. Stelle weitere Fragen zu ${gebiete} (~15 Min): Gemischt aus beiden Gebieten, mit steigendem Schwierigkeitsgrad (AB I→II→III).
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

    if (mode === 'referat') {
      instruction += `
ABLAUF: Begrüße den Prüfling KURZ (1 Satz), dann lass ihn sein Kurzreferat halten (~10 Min).

KRITISCHE REGEL FÜR DAS KURZREFERAT:
- Du darfst während des Kurzreferats ABSOLUT NICHT SPRECHEN. KEIN EINZIGES WORT.
- KEINE Reaktion, KEIN "Mhm", KEIN "Ja", KEIN "Interessant", KEIN Nicken, KEINE Rückfrage. TOTALE STILLE.
- Auch wenn der Prüfling eine Pause macht: SCHWEIGE. Pausen im Referat sind völlig normal.
- Auch wenn der Prüfling dich direkt anspricht oder eine Frage stellt: SCHWEIGE – er soll frei vortragen.
- Du darfst ERST WIEDER sprechen, wenn der Prüfling EXPLIZIT sagt, dass sein Referat beendet ist (z.B. "Damit bin ich am Ende", "Vielen Dank", "Das war mein Referat").
- Wenn der Prüfling nach 10–12 Minuten nicht selbst aufhört, darfst du ihn freundlich bitten, zum Ende zu kommen.
Danach beende die Prüfung mit einer kurzen Verabschiedung.`;
    } else if (mode === 'fragen') {
      instruction += `
ABLAUF: Begrüße den Prüfling. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (${hj}, AB II/III, ~5 Min). Dann wechsle zu ${weitere} mit 3–4 Fragen pro HJ (~15 Min, AB I→II→III). Beende die Prüfung.

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
   KRITISCHE REGEL: Während des Kurzreferats ABSOLUTE STILLE. KEIN EINZIGES WORT. KEINE Reaktion. Auch bei Pausen SCHWEIGEN. Erst wieder sprechen, wenn der Prüfling EXPLIZIT sagt, dass er fertig ist (z.B. "Damit bin ich am Ende", "Vielen Dank"). Nach 10–12 Min ohne Abschluss darfst du freundlich bitten, zum Ende zu kommen.
2. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (${hj}, AB II/III, ~5 Min).
3. Wechsle zu ${weitere} mit 3–4 Fragen pro HJ (~15 Min, AB I→II→III).
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
- Beziehe dich auf das Gesagte: "Sie haben vorhin ... erwähnt. Können Sie das vertiefen?" statt das Thema nochmal von vorne aufzurollen.`;

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
/** Wenn vom Server 45s lang keine Nachricht kommt → proaktiver Reconnect */
const ACTIVITY_TIMEOUT_MS = 45_000;
/** Intervall für den Activity-Check */
const ACTIVITY_CHECK_INTERVAL_MS = 10_000;

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
                if (part.text && !isThinkingText(part.text)) {
                  this.config.onModelTranscription?.(part.text);
                }
              }
            }

            if ((message as any).serverContent?.inputTranscription?.text) {
              this.config.onUserTranscription?.((message as any).serverContent.inputTranscription.text);
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

  /** Erkennt "tote" Verbindungen (offen aber keine Daten) */
  private startActivityMonitor() {
    this.stopActivityMonitor();
    this.activityTimer = window.setInterval(() => {
      if (this.stopped) return;
      const idle = Date.now() - this.lastMessageTime;
      if (idle > ACTIVITY_TIMEOUT_MS) {
        console.warn(`Keine Server-Aktivität seit ${Math.round(idle / 1000)}s – Reconnect wird ausgelöst`);
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

    // Session auf dem Server erstellen
    const response = await fetch(`${WORKER_URL}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    this.ws = new WebSocket(wsUrl);

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

        // Transkriptionen weiterleiten
        if (data?.serverContent?.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.text && !isThinkingText(part.text)) {
              this.config.onModelTranscription?.(part.text);
            }
          }
        }
        if (data?.serverContent?.inputTranscription?.text) {
          this.config.onUserTranscription?.(data.serverContent.inputTranscription.text);
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
      const res = await fetch(`${WORKER_URL}/session/${this.sessionId}/transcript`);
      const data = await res.json() as { transcript: Array<{ role: string; text: string; timestamp: number }> };
      return data.transcript || [];
    } catch {
      return [];
    }
  }
}
