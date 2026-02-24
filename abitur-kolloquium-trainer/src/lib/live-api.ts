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

export type ExamMode = 'gesamt' | 'referat' | 'fragen';

export interface LiveSessionConfig {
  subject: string;
  examLevel: ExamLevel;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  aufgabenstellung: string;
  material: string;
  examMode?: ExamMode;
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
- Bewerte auch die Ausdrucksweise: Fachsprache, Argumentationsstruktur, Präsentationsfähigkeit.

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

Schreibe auf Deutsch. Sei EHRLICH – Schönreden hilft dem Prüfling nicht bei der Vorbereitung.`;

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
  return `Du bist ein strenger aber fairer bayerischer Abiturprüfer. Du gibst jetzt MÜNDLICHES FEEDBACK zu der gerade absolvierten Kolloquiumsprüfung.

Fach: ${config.subject} (${config.examLevel === 'eA' ? 'erhöht' : 'grundlegend'})
Schwerpunkt: ${config.schwerpunkt}

TRANSKRIPT DER PRÜFUNG:
---
${config.examTranscript || '(Nicht verfügbar)'}
---

DEINE AUFGABE – KRITISCHES, EHRLICHES FEEDBACK:

1. Beginne mit einem EHRLICHEN Gesamteindruck (nicht beschönigen!).
2. Gehe auf KONKRETE Aussagen des Prüflings ein. Zitiere, was er/sie gesagt hat.
3. Benenne KLAR, was fachlich FALSCH oder UNGENAU war, und nenne die richtige Antwort.
4. Benenne, was GEFEHLT hat – welche wichtigen Aspekte wurden nicht erwähnt?
5. Nenne konkrete Stärken mit Beispielen aus dem Gespräch.
6. Bewerte die Anforderungsbereiche:
   - AB I (Reproduktion): Wurde Grundwissen korrekt wiedergegeben?
   - AB II (Transfer): Konnte Wissen angewendet und Zusammenhänge hergestellt werden?
   - AB III (Reflexion): Gab es eigenständige Urteile und kritische Bewertungen?
7. Gib eine Punkteeinschätzung (0–15) mit klarer Begründung. Vergib KEINE Gefälligkeitsnoten!
8. Gib 2–3 KONKRETE Tipps, was beim nächsten Mal besser gemacht werden sollte.
9. Beantworte Rückfragen des Prüflings ehrlich.

WICHTIG: Schönreden hilft dem Prüfling nicht! Wenn die Leistung mittelmäßig oder schwach war, sage das klar und begründe es. Sprich Deutsch.`;
}

function buildExamInstruction(config: LiveSessionConfig): string {
  const levelLabel = config.examLevel === 'eA' ? 'erhöhtes Anforderungsniveau (eA)' : 'grundlegendes Anforderungsniveau (gA)';
  const mode = config.examMode || 'gesamt';

  const header = `Du bist ein erfahrener bayerischer Gymnasiallehrer und Prüfer für das Abitur-Kolloquium 2026.

PRÜFUNGSSITUATION:
- Fach: ${config.subject} (${levelLabel})
- Schwerpunkt: "${config.schwerpunkt}" (Halbjahr ${config.schwerpunktHalbjahr})
- Weitere Halbjahre (Teil 2): ${config.weitereHalbjahre.join(' und ')}`;

  const aufgabeBlock = config.aufgabenstellung ? `\n\nDEM PRÜFLING GESTELLTE AUFGABE:\n${config.aufgabenstellung}\n\nBEREITGESTELLTES MATERIAL:\n${config.material}` : '';

  const phase1 = `
PHASE 1 – KURZREFERAT (ca. 10 Min):
1. Begrüße den Prüfling kurz und professionell.
2. Sage, dass er mit seinem Kurzreferat beginnen kann.
3. Höre aufmerksam zu. Unterbrich NUR bei grobem Abschweifen.
4. Nach ca. 10 Min oder wenn der Prüfling signalisiert, dass er fertig ist → beende die Prüfung.`;

  const phase1ToPhase2 = `
PHASE 1 – KURZREFERAT (ca. 10 Min):
1. Begrüße den Prüfling kurz und professionell.
2. Sage, dass er mit seinem Kurzreferat beginnen kann.
3. Höre aufmerksam zu. Unterbrich NUR bei grobem Abschweifen.
4. Nach ca. 10 Min oder wenn der Prüfling signalisiert, dass er fertig ist → Phase 2.`;

  const phase2 = `
PHASE 2 – FRAGEN ZUM SCHWERPUNKT (ca. 5 Min):
1. Bedanke dich für das Referat und leite zu den Fragen über.
2. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (Halbjahr ${config.schwerpunktHalbjahr}).
3. Fokus auf AB II (Transfer) und AB III (Reflexion).`;

  const phase2Start = `
FRAGEN ZUM SCHWERPUNKT (ca. 5 Min):
1. Begrüße den Prüfling kurz und professionell.
2. Erkläre, dass du Fragen zum Schwerpunktthema stellen wirst.
3. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (Halbjahr ${config.schwerpunktHalbjahr}).
4. Fokus auf AB II (Transfer) und AB III (Reflexion).`;

  const phase3 = `
PHASE 3 – GESPRÄCH ZU WEITEREN HALBJAHREN (ca. 15 Min):
1. Leite über: "Kommen wir nun zu den weiteren Themenbereichen."
2. Stelle Fragen zu ${config.weitereHalbjahre.join(' und ')}.
3. Wechsle zwischen beiden Halbjahren. Ca. 3–4 Fragen pro Halbjahr.
4. Beginne mit AB I, steigere zu AB II und AB III.`;

  const phase3Start = `
GESPRÄCH ZU WEITEREN HALBJAHREN (ca. 15 Min):
1. Leite über zu den weiteren Themenbereichen.
2. Stelle Fragen zu ${config.weitereHalbjahre.join(' und ')}.
3. Wechsle zwischen beiden Halbjahren. Ca. 3–4 Fragen pro Halbjahr.
4. Beginne mit AB I, steigere zu AB II und AB III.`;

  const abschluss = `
ABSCHLUSS:
- Sage: "Die Prüfung ist damit beendet. Vielen Dank für Ihre Teilnahme."`;

  const verhalten = `
ANFORDERUNGSBEREICHE:
- AB I: Reproduktion – Fachwissen wiedergeben
- AB II: Transfer – Wissen übertragen, Zusammenhänge herstellen
- AB III: Reflexion – eigenständig urteilen, bewerten, Probleme lösen

VERHALTEN:
- Wohlwollend aber anspruchsvoll.
- Fehler → gezielte Nachfrage statt sofortige Korrektur.
- Bei Stocken → dezente Hilfestellung.
- Natürlicher Gesprächsfluss.${getLanguageInstruction(config.subject)}`;

  let ablauf: string;
  if (mode === 'referat') {
    ablauf = `\nABLAUF (nur Kurzreferat-Teil):\n${phase1}\n${abschluss}`;
  } else if (mode === 'fragen') {
    ablauf = `\nABLAUF (nur Frageteil):\n${phase2Start}\n${phase3Start}\n${abschluss}`;
  } else {
    ablauf = `\nABLAUF (du steuerst alle Phasen):\n${phase1ToPhase2}\n${phase2}\n${phase3}\n${abschluss}`;
  }

  return header + aufgabeBlock + ablauf + verhalten;
}

/* ───────── Live session ───────── */

interface LiveAPISession {
  sendRealtimeInput(input: { media: { data: string; mimeType: string } }): void;
  close(): void;
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: LiveAPISession | null = null;
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

      this.session = await this.ai.live.connect({
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
              this.session?.sendRealtimeInput({
                media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
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
      }) as unknown as LiveAPISession;
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
