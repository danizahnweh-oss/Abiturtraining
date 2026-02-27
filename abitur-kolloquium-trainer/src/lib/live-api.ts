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
  onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error') => void;
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

Schreibe auf Hochdeutsch (Standarddeutsch). Verwende KEINEN Dialekt und KEIN Bayerisch. Sei EHRLICH – Schönreden hilft dem Prüfling nicht bei der Vorbereitung.`;

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
  if (lang) return `\n\nSPRACHE: Führe das GESAMTE Prüfungsgespräch auf ${lang}. Bewertung: 60 % Sprache/Gesprächsfähigkeit, 40 % Inhalt. Auch dein Feedback gibst du auf ${lang}.`;
  if (subject === 'Latein') return '\n\nSPRACHE: Gespräch auf Hochdeutsch (Standarddeutsch). KEIN Dialekt, KEIN Bayerisch. Lateinische Fachbegriffe und Zitate gehören zur Prüfung.';
  return '\n\nSPRACHE: Sprich durchgehend Hochdeutsch (Standarddeutsch). Verwende KEINEN Dialekt und KEIN Bayerisch.';
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
    : 'Sprich durchgehend Hochdeutsch (Standarddeutsch). Verwende KEINEN Dialekt und KEIN Bayerisch.';

  return `Du bist ein strenger aber fairer bayerischer Abiturprüfer. Gib MÜNDLICHES FEEDBACK zur Kolloquiumsprüfung.
Fach: ${config.subject} (${config.examLevel}), Schwerpunkt: ${config.schwerpunkt}

TRANSKRIPT:
${transcript || '(Nicht verfügbar)'}

AUFGABE: Ehrlicher Gesamteindruck → konkrete fachliche Fehler benennen und korrigieren → Stärken → Bewertung AB I/II/III → Punkteeinschätzung (0–15, keine Gefälligkeitsnoten!) → 2–3 Verbesserungstipps. Beantworte Rückfragen. ${langHint}`;
}

function buildExamInstruction(config: LiveSessionConfig): string {
  const level = config.examLevel === 'eA' ? 'eA' : 'gA';
  const mode = config.examMode || 'gesamt';
  const hj = config.schwerpunktHalbjahr;
  const weitere = config.weitereHalbjahre.join(' und ');

  let instruction = `Du bist Prüfer im bayerischen Abitur-Kolloquium 2026.
Fach: ${config.subject} (${level}), Schwerpunkt: "${config.schwerpunkt}" (${hj}), weitere HJ: ${weitere}.`;

  if (config.aufgabenstellung) {
    instruction += `\nAufgabe: ${config.aufgabenstellung}\nMaterial: ${config.material}`;
  }

  if (mode === 'referat') {
    instruction += `
ABLAUF: Begrüße den Prüfling, lass ihn sein Kurzreferat halten (~10 Min). Höre zu, unterbrich nur bei Abschweifen. Danach beende die Prüfung.`;
  } else if (mode === 'fragen') {
    instruction += `
ABLAUF: Begrüße den Prüfling. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (${hj}, AB II/III, ~5 Min). Dann wechsle zu ${weitere} mit 3–4 Fragen pro HJ (~15 Min, AB I→II→III). Beende die Prüfung.`;
  } else {
    instruction += `
ABLAUF:
1. Begrüße den Prüfling, lass ihn sein Kurzreferat halten (~10 Min).
2. Stelle 2–3 vertiefende Fragen zum Schwerpunkt (${hj}, AB II/III, ~5 Min).
3. Wechsle zu ${weitere} mit 3–4 Fragen pro HJ (~15 Min, AB I→II→III).
4. Beende die Prüfung.`;
  }

  instruction += `
VERHALTEN: Wohlwollend aber anspruchsvoll. Fehler → Nachfrage statt Korrektur. Bei Stocken → Hilfestellung. Natürlicher Gesprächsfluss.${getLanguageInstruction(config.subject)}`;

  return instruction;
}

/* ───────── Live session ───────── */

interface LiveAPISession {
  sendRealtimeInput(input: { media: { data: string; mimeType: string } }): void;
  close(): void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1500;
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

  private async connect() {
    if (this.stopped) return;

    try {
      const isReconnect = this.reconnectAttempts > 0;
      this.config.onStatusChange?.(isReconnect ? 'reconnecting' : 'connecting');

      // Alte Session sicher schließen
      try { this.session?.close(); } catch { /* ignorieren */ }
      this.session = null;

      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          systemInstruction: this.instruction,
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
            if (base64Audio) this.audioPlayer.playChunk(base64Audio);

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
    // Exponentielles Backoff mit Jitter
    const baseDelay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    console.log(`Reconnect in ${Math.round(delay)}ms (Versuch ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    this.config.onStatusChange?.('reconnecting');
    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, delay);
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
