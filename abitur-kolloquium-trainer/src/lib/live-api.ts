import { GoogleGenAI, Modality } from "@google/genai";
import { AudioProcessor, AudioPlayer } from "./audio-utils";

export const SUBJECTS = [
  'Biologie', 'Chemie', 'Deutsch', 'Englisch', 'Ethik',
  'Französisch', 'Geographie', 'Geschichte', 'Italienisch',
  'Latein', 'Mathematik', 'Physik', 'Politik und Gesellschaft',
  'Wirtschaft und Recht'
] as const;

export type ExamLevel = 'gA' | 'eA';

export interface ExamMaterial {
  aufgabenstellung: string;
  material: string;
  hinweise: string;
}

export interface ExamConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
}

export interface LiveSessionConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  aufgabenstellung: string;
  material: string;
  feedbackMode?: boolean;
  examTranscript?: string;
  onModelTranscription?: (text: string) => void;
  onUserTranscription?: (text: string) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
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

/* ───────── Material generation ───────── */

export async function generateExamMaterial(config: ExamConfig): Promise<ExamMaterial> {
  const ai = createAI();
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau' : 'grundlegendes Anforderungsniveau';

  const prompt = `Du bist ein erfahrener Prüfungsausschuss-Vorsitzender für das bayerische Abitur-Kolloquium.

Erstelle eine realistische Aufgabenstellung mit Material für ein Kurzreferat im Kolloquium.

Fach: ${config.subject}
Anforderungsniveau: ${levelLabel}
Halbjahr: ${config.schwerpunktHalbjahr}
Schwerpunktthema: ${config.schwerpunkt}

Anforderungen:
1. Formuliere eine klare, anspruchsvolle Aufgabenstellung, die alle drei Anforderungsbereiche (Reproduktion, Transfer, Reflexion) abdeckt.
2. Stelle 1–2 Materialien bereit (Quellentexte, Statistiken, Zitate oder Schaubilder als Textbeschreibung), die der Prüfling in sein Referat einbeziehen soll.
3. Gib kurze Hinweise zur Bearbeitung.

Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON):
{"aufgabenstellung":"...","material":"...","hinweise":"..."}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  try {
    const raw = (response.text || '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch {
    return {
      aufgabenstellung: `Erläutern Sie den Schwerpunkt "${config.schwerpunkt}" im Kontext des Halbjahres ${config.schwerpunktHalbjahr}. Nehmen Sie kritisch Stellung.`,
      material: 'Nutzen Sie Ihr Vorwissen zu diesem Themengebiet.',
      hinweise: 'Strukturieren Sie Ihr Referat klar. Planen Sie ca. 10 Minuten für den Vortrag.',
    };
  }
}

/* ───────── Written feedback ───────── */

export async function generateWrittenFeedback(config: {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  modelTranscription: string[];
  userTranscription: string[];
}): Promise<string> {
  const ai = createAI();

  const lines: string[] = [];
  const max = Math.max(config.modelTranscription.length, config.userTranscription.length);
  for (let i = 0; i < max; i++) {
    if (config.userTranscription[i]) lines.push(`Prüfling: ${config.userTranscription[i]}`);
    if (config.modelTranscription[i]) lines.push(`Prüfer: ${config.modelTranscription[i]}`);
  }

  const prompt = `Du bist ein erfahrener Abiturprüfer. Gib detailliertes, konstruktives Feedback zu dieser Kolloquiumsprüfung.

Fach: ${config.subject} (${config.examLevel === 'eA' ? 'erhöht' : 'grundlegend'})
Schwerpunkt: ${config.schwerpunkt}

Transkript:
${lines.join('\n') || '(Kein Transkript verfügbar)'}

Strukturiere dein Feedback so:

## Gesamteindruck
(2–3 Sätze)

## Stärken
- …

## Verbesserungspotential
- …

## Bewertung nach Anforderungsbereichen
- AB I (Reproduktion): …
- AB II (Transfer): …
- AB III (Reflexion): …

## Empfohlene Punktzahl
(0–15 Punkte mit Begründung)

## Tipps für die nächste Prüfung
- …

Sei ehrlich aber ermutigend. Schreibe auf Deutsch.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text || 'Feedback konnte nicht generiert werden.';
}

/* ───────── System instructions ───────── */

function getLanguageInstruction(subject: string): string {
  const langMap: Record<string, string> = {
    'Englisch': 'Englisch', 'Französisch': 'Französisch', 'Italienisch': 'Italienisch',
  };
  const lang = langMap[subject];
  if (lang) return `\n\nSPRACHE: Führe das GESAMTE Prüfungsgespräch auf ${lang}. Bewertung: 60 % Sprache/Gesprächsfähigkeit, 40 % Inhalt.`;
  if (subject === 'Latein') return '\n\nSPRACHE: Gespräch auf Deutsch. Lateinische Fachbegriffe und Zitate gehören zur Prüfung.';
  return '\n\nSPRACHE: Sprich durchgehend Deutsch.';
}

function buildFeedbackInstruction(config: LiveSessionConfig): string {
  return `Du bist ein erfahrener bayerischer Abiturprüfer und gibst jetzt MÜNDLICHES FEEDBACK zu einer gerade absolvierten Kolloquiumsprüfung.

Fach: ${config.subject} (${config.examLevel === 'eA' ? 'erhöht' : 'grundlegend'})
Schwerpunkt: ${config.schwerpunkt}

Bisheriges Prüfungstranskript:
${config.examTranscript || '(Nicht verfügbar)'}

AUFGABE:
1. Gib dem Prüfling ein strukturiertes, mündliches Feedback.
2. Beginne mit einem positiven Gesamteindruck.
3. Nenne konkrete Stärken.
4. Nenne Verbesserungspotential mit konkreten Tipps.
5. Gib eine Einschätzung der Punktzahl (0–15) mit Begründung.
6. Beantworte Rückfragen des Prüflings.

Sprich ermutigend, aber ehrlich. Sprich Deutsch.`;
}

function buildExamInstruction(config: LiveSessionConfig): string {
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau (eA)' : 'grundlegendes Anforderungsniveau (gA)';

  return `Du bist ein erfahrener bayerischer Gymnasiallehrer und Prüfer für das Abitur-Kolloquium 2026.

PRÜFUNGSSITUATION:
- Fach: ${config.subject} (${levelLabel})
- Schwerpunkt: "${config.schwerpunkt}" (Halbjahr ${config.schwerpunktHalbjahr})
- Weitere Halbjahre (Teil 2): ${config.weitereHalbjahre.join(' und ')}

DEM PRÜFLING GESTELLTE AUFGABE:
${config.aufgabenstellung}

BEREITGESTELLTES MATERIAL:
${config.material}

ABLAUF (du steuerst alle Phasen):

PHASE 1 – KURZREFERAT (ca. 10 Min):
1. Begrüße den Prüfling kurz und professionell.
2. Sage, dass er mit seinem Kurzreferat beginnen kann.
3. Höre aufmerksam zu. Unterbrich NUR bei grobem Abschweifen.
4. Nach ca. 10 Min oder wenn der Prüfling signalisiert, dass er fertig ist → Phase 2.

PHASE 2 – FRAGEN ZUM SCHWERPUNKT (ca. 5 Min):
1. Bedanke dich für das Referat und leite zu den Fragen über.
2. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (Halbjahr ${config.schwerpunktHalbjahr}).
3. Fokus auf AB II (Transfer) und AB III (Reflexion).

PHASE 3 – GESPRÄCH ZU WEITEREN HALBJAHREN (ca. 15 Min):
1. Leite über: "Kommen wir nun zu den weiteren Themenbereichen."
2. Stelle Fragen zu ${config.weitereHalbjahre.join(' und ')}.
3. Wechsle zwischen beiden Halbjahren. Ca. 3–4 Fragen pro Halbjahr.
4. Beginne mit AB I, steigere zu AB II und AB III.

ABSCHLUSS:
- Sage: "Die Prüfung ist damit beendet. Vielen Dank für Ihre Teilnahme."

ANFORDERUNGSBEREICHE:
- AB I: Reproduktion – Fachwissen wiedergeben
- AB II: Transfer – Wissen übertragen, Zusammenhänge herstellen
- AB III: Reflexion – eigenständig urteilen, bewerten, Probleme lösen

VERHALTEN:
- Wohlwollend aber anspruchsvoll.
- Fehler → gezielte Nachfrage statt sofortige Korrektur.
- Bei Stocken → dezente Hilfestellung.
- Natürlicher Gesprächsfluss.${getLanguageInstruction(config.subject)}`;
}

/* ───────── Live session ───────── */

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioProcessor: AudioProcessor;
  private audioPlayer: AudioPlayer;
  private config: LiveSessionConfig;

  constructor(config: LiveSessionConfig) {
    this.ai = createAI();
    this.audioProcessor = new AudioProcessor();
    this.audioPlayer = new AudioPlayer();
    this.config = config;
  }

  async start() {
    try {
      this.config.onStatusChange?.('connecting');

      const instruction = this.config.feedbackMode
        ? buildFeedbackInstruction(this.config)
        : buildExamInstruction(this.config);

      const sessionPromise = this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction: instruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.config.onStatusChange?.('connected');
            this.audioProcessor.startRecording((base64Data) => {
              sessionPromise.then(s => s.sendRealtimeInput({
                media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              }));
            });
          },
          onmessage: async (message) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) this.audioPlayer.playChunk(base64Audio);

            if (message.serverContent?.interrupted) this.audioPlayer.stop();

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) this.config.onModelTranscription?.(part.text);
              }
            }

            if ((message as any).serverContent?.inputTranscription?.text) {
              this.config.onUserTranscription?.((message as any).serverContent.inputTranscription.text);
            }
          },
          onclose: () => {
            this.stop();
            this.config.onStatusChange?.('disconnected');
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.config.onStatusChange?.('error');
          }
        }
      });

      this.session = await sessionPromise;
    } catch (error) {
      console.error("Failed to start session:", error);
      this.config.onStatusChange?.('error');
    }
  }

  stop() {
    this.audioProcessor.stopRecording();
    this.audioPlayer.stop();
    this.session?.close();
    this.session = null;
  }
}
