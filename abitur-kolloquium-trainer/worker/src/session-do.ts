/**
 * ColloquiumSession Durable Object
 * Verwaltet den State einer Kolloquiumsprüfung serverseitig.
 * Bei Reconnect wird das bisherige Transkript als Kontext in die neue Gemini-Session injiziert.
 */

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

interface SessionConfig {
  subject: string;
  examLevel: string;
  schwerpunkt: string;
  schwerpunktHalbjahr: string;
  weitereHalbjahre: string[];
  examMode: string;
  prueferTyp: string;
  gender: string;
  aufgabenstellung: string;
  material: string;
  systemInstruction: string;
  feedbackMode?: boolean;
  voiceName?: string;
}

interface TranscriptEntry {
  role: 'pruefer' | 'pruefling';
  text: string;
  timestamp: number;
}

interface GeminiPart {
  text?: string;
}

interface GeminiServerEvent {
  serverContent?: {
    modelTurn?: {
      parts?: GeminiPart[];
    };
    inputTranscription?: {
      text?: string;
    };
  };
}

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TRANSCRIPT_PERSIST_INTERVAL = 30_000;
const SESSION_MAX_DURATION_MS = 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TRANSCRIPT_CHARS = 15_000;
const MAX_TRANSCRIPT_ENTRIES = 200;
const MIN_ACCESS_TOKEN_LENGTH = 16;

export class ColloquiumSession {
  private state: DurableObjectState;
  private env: Env;

  // In-Memory State
  private config: SessionConfig | null = null;
  private transcript: TranscriptEntry[] = [];
  private reconnectCount = 0;
  private lastPersistTime = 0;

  // WebSocket-Referenzen
  private clientWs: WebSocket | null = null;
  private geminiWs: WebSocket | null = null;
  private geminiClosed = false;
  private clientClosed = false;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (!this.hasValidAccessToken(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (url.pathname === '/create' && request.method === 'POST') {
      if (!request.headers.get('X-Student-Id')?.trim()) {
        return new Response('Unauthorized', { status: 401 });
      }
      return this.handleCreate(request);
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      return this.handleStatus();
    }

    if (url.pathname === '/transcript' && request.method === 'GET') {
      return this.handleGetTranscript();
    }

    // WebSocket-Upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocket();
    }

    return new Response('Not Found', { status: 404 });
  }

  // ---- Session erstellen ----
  private async handleCreate(request: Request): Promise<Response> {
    const config = await request.json() as SessionConfig;
    this.config = config;
    this.transcript = [];
    this.reconnectCount = 0;

    await this.state.storage.put('config', config);
    await this.state.storage.put('transcript', []);
    await this.state.storage.put('createdAt', new Date().toISOString());
    await this.state.storage.put('lastActivityAt', Date.now());
    await this.state.storage.put('hadPriorConnect', false);
    await this.state.storage.put('reconnectCount', 0);

    // Session nach 1 Stunde automatisch aufräumen
    await this.state.storage.setAlarm(Date.now() + Math.min(SESSION_MAX_DURATION_MS, SESSION_IDLE_TIMEOUT_MS));

    return new Response(JSON.stringify({
      sessionId: this.state.id.toString(),
      status: 'created'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ---- Status abfragen ----
  private async handleStatus(): Promise<Response> {
    const config = this.config || await this.state.storage.get('config') as SessionConfig | null;
    const storedReconnectCount = await this.state.storage.get('reconnectCount') as number | null;
    if (typeof storedReconnectCount === 'number') {
      this.reconnectCount = storedReconnectCount;
    }
    return new Response(JSON.stringify({
      active: !!config,
      transcriptLength: this.transcript.length,
      reconnectCount: this.reconnectCount,
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ---- Transkript abrufen ----
  private async handleGetTranscript(): Promise<Response> {
    if (!this.transcript.length) {
      this.transcript = await this.state.storage.get('transcript') as TranscriptEntry[] || [];
    }
    return new Response(JSON.stringify({
      transcript: this.transcript
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ---- WebSocket-Verbindung ----
  private async handleWebSocket(): Promise<Response> {
    // Config aus Storage laden falls nicht im Memory
    if (!this.config) {
      this.config = await this.state.storage.get('config') as SessionConfig | null;
      this.transcript = await this.state.storage.get('transcript') as TranscriptEntry[] || [];
    }

    if (!this.config) {
      return new Response('Session nicht gefunden. Bitte zuerst /create aufrufen.', { status: 404 });
    }

    // Alte Client-Verbindung schließen (nur ein Client pro Session)
    if (this.clientWs) {
      try { this.clientWs.close(1000, 'Neuer Client verbunden'); } catch {}
    }

    // Cleanup-Timer abbrechen (Client ist zurück)
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // WebSocket-Pair für Client
    const pair = new WebSocketPair();
    // Cloudflare WebSocketPair typing quirk.
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.clientWs = server;
    this.clientClosed = false;

    // Gemini-Verbindung aufbauen
    const hadPriorConnect = await this.state.storage.get('hadPriorConnect') as boolean | null;
    const storedReconnectCount = await this.state.storage.get('reconnectCount') as number | null;
    if (typeof storedReconnectCount === 'number') {
      this.reconnectCount = storedReconnectCount;
    }
    const isReconnect = hadPriorConnect === true;
    await this.touchSessionActivity();
    await this.connectToGemini(isReconnect);

    // Client-Events
    server.addEventListener('message', (event) => {
      if (this.geminiClosed) return;
      void this.touchSessionActivity();
      try {
        this.geminiWs?.send(event.data);
      } catch (err) {
        console.error('Fehler beim Senden an Gemini:', err);
      }
    });

    server.addEventListener('close', () => {
      this.clientClosed = true;
      console.log('Client WS geschlossen');
      // Gemini nach 30s schließen falls Client nicht reconnectet
      this.cleanupTimer = setTimeout(() => {
        if (this.clientClosed && !this.geminiClosed) {
          try { this.geminiWs?.close(1000, 'Client disconnected'); } catch {}
        }
      }, 30000);
    });

    server.addEventListener('error', (event) => {
      console.error('Client WS Fehler:', event);
    });

    // Reconnect-Info an Client senden
    if (isReconnect) {
      server.send(JSON.stringify({
        type: 'session_restored',
        reconnectCount: this.reconnectCount,
        transcriptLength: this.transcript.length
      }));
    }

    // Wenn der Browser den Token via Sec-WebSocket-Protocol gesendet hat, müssen wir
    // das Subprotocol in der Response bestätigen — sonst lehnt der Browser ab.
    const reqProto = request.headers.get('Sec-WebSocket-Protocol') || '';
    const acceptedProto = reqProto.split(',').map(s => s.trim()).find(s => s.startsWith('bearer.'));
    const responseHeaders: Record<string, string> = {};
    if (acceptedProto) responseHeaders['Sec-WebSocket-Protocol'] = acceptedProto;

    return new Response(null, {
      status: 101,
      headers: responseHeaders,
      // Cloudflare WebSocket-Upgrade typing quirk.
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  // ---- Gemini-Verbindung aufbauen ----
  private async connectToGemini(isReconnect: boolean) {
    // Alte Verbindung schließen
    if (this.geminiWs) {
      try { this.geminiWs.close(); } catch {}
    }

    if (!this.config) return;

    // System-Instruction bei Reconnect mit Transkript anreichern
    let instruction = this.config.systemInstruction;
    if (isReconnect && this.transcript.length > 0) {
      const transcriptText = this.buildTranscriptText();
      instruction += `\n\nKONTEXT-WIEDERHERSTELLUNG (Verbindung wurde unterbrochen):
Bisheriges Gespräch:
---
${transcriptText}
---
Setze das Gespräch NAHTLOS fort. Wiederhole NICHTS was bereits gesagt wurde.
Sage kurz "Die Verbindung steht wieder. Bitte fahren Sie fort." und mache dann weiter dort, wo das Gespräch unterbrochen wurde.`;
    }

    // WebSocket zu Gemini aufbauen
    const wsUrl = `https://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.env.GEMINI_API_KEY}`;

    if (isReconnect) {
      this.reconnectCount++;
      await this.state.storage.put('reconnectCount', this.reconnectCount);
    }

    const geminiResp = await fetch(wsUrl, {
      headers: {
        'Upgrade': 'websocket',
        'Host': GEMINI_HOST,
      },
    });

    // Cloudflare WebSocket-Upgrade typing quirk.
    this.geminiWs = (geminiResp as any).webSocket as WebSocket | null;
    if (!this.geminiWs) {
      console.error('Gemini WebSocket Upgrade fehlgeschlagen');
      if (!this.clientClosed) {
        try {
          this.clientWs?.send(JSON.stringify({ type: 'error', message: 'Gemini-Verbindung fehlgeschlagen' }));
        } catch {}
      }
      return;
    }

    this.geminiWs.accept();
    this.geminiClosed = false;
    await this.state.storage.put('hadPriorConnect', true);
    await this.touchSessionActivity();

    // Setup-Nachricht an Gemini senden
    const voiceName = this.config.voiceName ||
      (this.config.gender === 'female' ? 'Kore' : 'Puck');

    const setupMsg = {
      setup: {
        model: `models/${GEMINI_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          },
          thinkingConfig: {
            thinkingBudget: 0
          }
        },
        systemInstruction: {
          parts: [{ text: instruction }]
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      }
    };
    this.geminiWs.send(JSON.stringify(setupMsg));

    // Gemini-Events
    this.geminiWs.addEventListener('message', (event) => {
      if (this.clientClosed) return;

      // An Client weiterleiten
      try {
        this.clientWs?.send(event.data);
      } catch (err) {
        console.error('Fehler beim Senden an Client:', err);
      }

      // Transkript extrahieren
      try {
        if (typeof event.data === 'string') {
          const data = JSON.parse(event.data) as GeminiServerEvent;
          this.extractAndStoreTranscript(data);
        }
      } catch {
        // Nicht-JSON Daten ignorieren
      }
    });

    this.geminiWs.addEventListener('close', (event) => {
      this.geminiClosed = true;
      console.log('Gemini WS geschlossen:', event.code, event.reason);
      if (!this.clientClosed) {
        try {
          this.clientWs?.close(event.code || 1000, event.reason || 'Gemini disconnected');
        } catch {}
      }
      this.persistTranscript();
    });

    this.geminiWs.addEventListener('error', (event) => {
      console.error('Gemini WS Fehler:', event);
      if (!this.clientClosed) {
        try { this.clientWs?.close(1011, 'Gemini error'); } catch {}
      }
    });
  }

  // ---- Transkript aus Gemini-Messages extrahieren ----
  private extractAndStoreTranscript(data: GeminiServerEvent) {
    // Modell-Transkription (Prüfer)
    const modelParts = data?.serverContent?.modelTurn?.parts;
    if (modelParts) {
      for (const part of modelParts) {
        if (part.text && part.text.trim()) {
          this.transcript.push({
            role: 'pruefer',
            text: part.text.trim(),
            timestamp: Date.now()
          });
        }
      }
    }

    // Input-Transkription (Prüfling)
    const inputText = data?.serverContent?.inputTranscription?.text;
    if (inputText && inputText.trim()) {
      this.transcript.push({
        role: 'pruefling',
        text: inputText.trim(),
        timestamp: Date.now()
      });
    }

    this.trimTranscript();
    void this.touchSessionActivity();

    // Periodisch persistieren
    if (Date.now() - this.lastPersistTime > TRANSCRIPT_PERSIST_INTERVAL) {
      this.persistTranscript();
    }
  }

  // ---- Transkript persistieren ----
  private async persistTranscript() {
    this.lastPersistTime = Date.now();
    try {
      this.trimTranscript();
      await this.state.storage.put('transcript', this.transcript);
    } catch (err) {
      console.error('Transkript-Persistierung fehlgeschlagen:', err);
    }
  }

  private trimTranscript() {
    if (this.transcript.length > MAX_TRANSCRIPT_ENTRIES) {
      this.transcript.splice(0, this.transcript.length - MAX_TRANSCRIPT_ENTRIES);
    }
  }

  private hasValidAccessToken(request: Request): boolean {
    let accessToken: string | null = request.headers.get('X-Access-Token');
    // Fallback: Browser-WebSockets können keinen Custom-Header senden,
    // daher Token aus Sec-WebSocket-Protocol "bearer.<token>" akzeptieren.
    if (!accessToken) {
      const proto = request.headers.get('Sec-WebSocket-Protocol') || '';
      const bearer = proto.split(',').map(s => s.trim()).find(s => s.startsWith('bearer.'));
      if (bearer) accessToken = bearer.slice('bearer.'.length);
    }
    return typeof accessToken === 'string' && accessToken.trim().length >= MIN_ACCESS_TOKEN_LENGTH;
  }

  private async touchSessionActivity() {
    const nextAlarmAt = Date.now() + Math.min(SESSION_MAX_DURATION_MS, SESSION_IDLE_TIMEOUT_MS);
    await this.state.storage.put('lastActivityAt', Date.now());
    await this.state.storage.setAlarm(nextAlarmAt);
  }

  // ---- Transkript-Text für Kontext-Injection ----
  private buildTranscriptText(): string {
    const lines = this.transcript
      .map(t => `${t.role === 'pruefer' ? 'Prüfer' : 'Prüfling'}: ${t.text}`)
      .join('\n');

    if (lines.length > MAX_TRANSCRIPT_CHARS) {
      const truncated = lines.slice(-MAX_TRANSCRIPT_CHARS);
      const firstNewline = truncated.indexOf('\n');
      return '[...gekürzt...]\n' + truncated.slice(firstNewline + 1);
    }

    return lines;
  }

  // ---- Alarm: Session aufräumen ----
  async alarm() {
    console.log('Session-Alarm: Aufräumen', this.state.id.toString());
    const lastActivityAt = await this.state.storage.get('lastActivityAt') as number | null;
    const idleForMs = lastActivityAt ? Date.now() - lastActivityAt : SESSION_IDLE_TIMEOUT_MS;

    if (idleForMs > SESSION_IDLE_TIMEOUT_MS) {
      try { this.clientWs?.close(1000, 'Session abgelaufen'); } catch {}
      try { this.geminiWs?.close(1000, 'Session abgelaufen'); } catch {}
      this.config = null;
      this.transcript = [];
      this.reconnectCount = 0;
      await this.state.storage.deleteAll();
      return;
    }

    if (this.transcript.length > 0) {
      await this.persistTranscript();
    }
    await this.state.storage.setAlarm(Date.now() + (SESSION_IDLE_TIMEOUT_MS - idleForMs));
  }
}
