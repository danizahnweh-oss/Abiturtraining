/**
 * Live API + Text-API für die FOS Gruppendiskussion.
 * Port von abitur-kolloquium-trainer/src/lib/live-api.ts, adaptiert für Multi-Persona-Diskussion.
 */

import { AudioProcessor, AudioPlayer } from './discussion-audio.js';

const PROXY_URL = 'https://gemini-proxy.sanktannagymnasium.workers.dev';

/** GoogleGenAI + Modality werden dynamisch über CDN geladen */
let _genaiModule = null;
async function loadGenAI() {
  if (_genaiModule) return _genaiModule;
  _genaiModule = await import('https://cdn.jsdelivr.net/npm/@google/genai/+esm');
  return _genaiModule;
}

function createAI(GoogleGenAI) {
  return new GoogleGenAI({
    apiKey: 'PROXY',
    httpOptions: { baseUrl: PROXY_URL },
  });
}

/** Erkennt Gemini-"Thinking"-Texte die nicht als Transkript angezeigt werden sollen */
function isThinkingText(text) {
  var t = text.trim();
  if (/\*\*[^*]+\*\*/.test(t)) return true;
  var selfRef = t.match(/\b(I'm |I'll |I should |I need to |I understand |Let me |I will |I want to |I've |My approach|I can |I have )/gi);
  if (selfRef && selfRef.length >= 2) return true;
  return false;
}

/* ───────── Setup-Generierung (Thema + Rollen) ───────── */

/**
 * Generiert Diskussionsthema und Rollenkarten per Gemini Text-API.
 * @param {Object} config
 * @param {number} config.totalCount – Gesamtzahl Teilnehmer (4 oder 5)
 * @param {number} config.realStudents – Anzahl echte Schüler (1-3)
 * @param {string} [config.topic] – Optionales Wunschthema (sonst zufällig)
 * @returns {Promise<Object>} { topic, context, roles: [{ name, stance, background, args, isReal }] }
 */
export async function generateDiscussionSetup(config) {
  var mod = await loadGenAI();
  var ai = createAI(mod.GoogleGenAI);

  var topicHint = config.topic && config.topic !== 'random'
    ? 'Verwende dieses Thema: "' + config.topic + '".'
    : 'Wähle ein aktuelles, kontroverses Thema das Jugendliche interessiert (z.B. Social Media, Klimawandel, KI, Bildung, Arbeitswelt, Gleichberechtigung, Migration).';

  var prompt = 'Du bist ein erfahrener FOS-Englischlehrer in Bayern. Erstelle ein Setup für eine englische Gruppendiskussion.\n\n' +
    topicHint + '\n\n' +
    'Erstelle genau ' + config.totalCount + ' verschiedene Rollen mit unterschiedlichen Standpunkten zum Thema.\n' +
    'Die ersten ' + config.realStudents + ' Rolle(n) sind für echte Schüler bestimmt, die restlichen ' + (config.totalCount - config.realStudents) + ' für die KI.\n\n' +
    'WICHTIG: Alles auf ENGLISCH (Thema, Rollen, Argumente). Sprachniveau B2-C1.\n\n' +
    'Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON):\n' +
    '{"topic":"...","context":"2-3 Sätze Kontext zum Thema auf Englisch","roles":[' +
    '{"name":"Vorname","stance":"pro/contra/neutral/moderate","background":"1 Satz Rollenbeschreibung auf Englisch","args":"2-3 Stichpunkte mit Argumenten auf Englisch","isReal":true/false}' +
    ']}';

  var response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  try {
    var raw = (response.text || '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    // Fallback bei Parse-Fehler
    var roles = [];
    for (var i = 0; i < config.totalCount; i++) {
      roles.push({
        name: 'Student ' + (i + 1),
        stance: i % 2 === 0 ? 'pro' : 'contra',
        background: 'A student with strong opinions on the topic.',
        args: 'Various arguments to discuss.',
        isReal: i < config.realStudents
      });
    }
    return {
      topic: config.topic || 'The impact of artificial intelligence on education',
      context: 'Discuss the advantages and disadvantages of this topic from different perspectives.',
      roles: roles
    };
  }
}

/* ───────── Feedback-Generierung ───────── */

/**
 * Generiert schriftliches Feedback nach der Diskussion.
 * Platzhalter-Prompt – wird später durch echtes ISB-Bewertungsraster ersetzt.
 * @param {Object} config
 * @param {string} config.topic
 * @param {string[]} config.modelTranscription
 * @param {string[]} config.userTranscription
 * @param {number} config.realStudents
 * @returns {Promise<string>} Markdown-Feedback
 */
export async function generateDiscussionFeedback(config) {
  var mod = await loadGenAI();
  var ai = createAI(mod.GoogleGenAI);

  var lines = [];
  var max = Math.max(config.modelTranscription.length, config.userTranscription.length);
  for (var i = 0; i < max; i++) {
    if (config.userTranscription[i]) lines.push('Student: ' + config.userTranscription[i]);
    if (config.modelTranscription[i]) lines.push('AI Characters: ' + config.modelTranscription[i]);
  }

  var prompt = 'You are an experienced Bavarian FOS English teacher evaluating a group discussion.\n\n' +
    'Topic: ' + config.topic + '\n' +
    'Number of real students: ' + config.realStudents + '\n\n' +
    'COMPLETE DISCUSSION TRANSCRIPT:\n---\n' +
    (lines.join('\n') || '(No transcript available)') + '\n---\n\n' +
    'Evaluate the student\'s performance in this group discussion. Provide feedback in GERMAN.\n\n' +
    'Structure your feedback as follows:\n\n' +
    '## Gesamteindruck\n(2-3 Sätze, ehrliche Einschätzung)\n\n' +
    '## Sprachliche Leistung\n- Wortschatz und Ausdrucksfähigkeit\n- Grammatische Korrektheit\n- Flüssigkeit und Aussprache\n- Angemessenheit des Sprachregisters (B2-C1)\n\n' +
    '## Diskussionsfähigkeit\n- Wurde auf andere Teilnehmer eingegangen?\n- Wurden Argumente überzeugend dargelegt?\n- Wurde die zugewiesene Rolle eingehalten?\n- Gesprächsstrategien (turn-taking, agree/disagree, asking for opinions)\n\n' +
    '## Stärken\n- Konkrete Beispiele aus dem Gespräch\n\n' +
    '## Verbesserungsbereiche\n- Konkrete Beispiele und Vorschläge\n\n' +
    '## Punkteeinschätzung\n(0-15 Punkte mit Begründung)\n\n' +
    '## Tipps für die nächste Diskussion\n- 3-4 konkrete Ratschläge\n\n' +
    'Sei EHRLICH und KONSTRUKTIV. Beziehe dich auf KONKRETE Aussagen aus dem Transkript.';

  var response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text || 'Feedback konnte nicht generiert werden.';
}

/* ───────── Multi-Persona System-Prompt ───────── */

function buildDiscussionInstruction(config) {
  var aiRoles = config.roles.filter(function(r) { return !r.isReal; });
  var realRoles = config.roles.filter(function(r) { return r.isReal; });

  var aiChars = aiRoles.map(function(r) {
    return '- ' + r.name + ' (' + r.stance + '): ' + r.background + '. Key arguments: ' + r.args;
  }).join('\n');

  var realChars = realRoles.map(function(r, i) {
    var label = realRoles.length === 1 ? 'THE STUDENT' : 'STUDENT ' + (i + 1);
    return '- ' + label + ' plays ' + r.name + ' (' + r.stance + '): ' + r.background;
  }).join('\n');

  var duration = config.totalCount * 5;

  return 'You are simulating a group discussion at a Bavarian FOS (Fachoberschule).\n' +
    'There are ' + config.totalCount + ' participants total. You play ' + aiRoles.length + ' of them.\n\n' +
    'TOPIC: "' + config.topic + '"\n' +
    'CONTEXT: ' + config.context + '\n\n' +
    'YOUR CHARACTERS (you simulate these):\n' + aiChars + '\n\n' +
    'REAL STUDENTS (speaking via microphone, you do NOT play these):\n' + realChars + '\n\n' +
    'RULES:\n' +
    '1. ALWAYS start each contribution with the character\'s name: "This is ' + aiRoles[0].name + '. I think..."\n' +
    '2. Keep contributions SHORT (2-4 sentences) to leave room for real students.\n' +
    '3. After 1-2 AI characters speak, PAUSE and wait for real students to respond.\n' +
    '4. Stay IN CHARACTER with assigned stance and arguments.\n' +
    '5. React to what the students say - ask follow-up questions, agree, disagree.\n' +
    '6. If no student has spoken for ~30s, address one directly: "' + realRoles[0].name + ', what do you think?"\n' +
    '7. Language level: B2-C1 English.\n' +
    (realRoles.length > 1 ? '8. Multiple real students share one microphone - different voices are different people.\n' : '') +
    '\nFLOW (' + duration + ' minutes total):\n' +
    '- Opening (1-2 min): One character introduces topic, asks a real student for their opinion.\n' +
    '- Main discussion: All participants contribute. Ensure everyone gets a turn.\n' +
    '- Closing (last 2 min): One character summarizes key points, asks for final thoughts.\n\n' +
    'LANGUAGE: English only. This is an English speaking exam simulation.';
}

/* ───────── Live Session (WebSocket) ───────── */

var MAX_RECONNECT_ATTEMPTS = 5;
var RECONNECT_BASE_DELAY_MS = 1500;
var ACTIVITY_TIMEOUT_MS = 45000;
var ACTIVITY_CHECK_INTERVAL_MS = 10000;
var STABLE_CONNECTION_MS = 10000;

/**
 * @param {Object} config
 * @param {string} config.topic
 * @param {string} config.context
 * @param {Array} config.roles
 * @param {number} config.totalCount
 * @param {Function} [config.onModelTranscription]
 * @param {Function} [config.onUserTranscription]
 * @param {Function} [config.onStatusChange]
 * @param {AudioProcessor} [preWarmedProcessor]
 */
export class DiscussionLiveSession {
  constructor(config, preWarmedProcessor) {
    this.config = config;
    this.audioProcessor = preWarmedProcessor || new AudioProcessor();
    this.audioPlayer = new AudioPlayer();
    this.session = null;
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.instruction = '';
    this.activityTimer = null;
    this.lastMessageTime = 0;
    this.connectionOpenedAt = 0;
    this._ai = null;
    this._Modality = null;
  }

  async start() {
    var mod = await loadGenAI();
    this._ai = createAI(mod.GoogleGenAI);
    this._Modality = mod.Modality;

    this.stopped = false;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.instruction = buildDiscussionInstruction(this.config);
    await this._connect();
  }

  async _connect() {
    if (this.stopped) return;
    var self = this;

    try {
      var isReconnect = this.reconnectAttempts > 0;
      if (this.config.onStatusChange) this.config.onStatusChange(isReconnect ? 'reconnecting' : 'connecting');

      // Alte Session sicher schließen
      try { if (this.session) this.session.close(); } catch (e) { /* ignorieren */ }
      this.session = null;

      this.session = await this._ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [this._Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: this.instruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: function() {
            self.connectionOpenedAt = Date.now();
            self.lastMessageTime = Date.now();
            self.reconnecting = false;
            console.log('WebSocket verbunden (Versuch ' + self.reconnectAttempts + ' zuvor)');
            if (self.config.onStatusChange) self.config.onStatusChange('connected');
            self._startActivityMonitor();

            var sendAudio = function(base64Data) {
              try {
                if (self.session) {
                  self.session.sendRealtimeInput({
                    media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                }
              } catch (e) { /* Sendefehler ignorieren */ }
            };

            if (self.audioProcessor.isRecording()) {
              self.audioProcessor.updateCallback(sendAudio);
            } else {
              self.audioProcessor.startRecording(sendAudio);
            }
          },
          onmessage: function(message) {
            self.lastMessageTime = Date.now();

            var parts = message.serverContent && message.serverContent.modelTurn && message.serverContent.modelTurn.parts;
            if (parts && parts[0] && parts[0].inlineData && parts[0].inlineData.data) {
              self.audioPlayer.playChunk(parts[0].inlineData.data);
            }

            if (message.serverContent && message.serverContent.interrupted) {
              self.audioPlayer.stop();
            }

            if (parts) {
              for (var i = 0; i < parts.length; i++) {
                if (parts[i].text && !isThinkingText(parts[i].text)) {
                  if (self.config.onModelTranscription) self.config.onModelTranscription(parts[i].text);
                }
              }
            }

            if (message.serverContent && message.serverContent.inputTranscription && message.serverContent.inputTranscription.text) {
              if (self.config.onUserTranscription) self.config.onUserTranscription(message.serverContent.inputTranscription.text);
            }
          },
          onclose: function() {
            self._stopActivityMonitor();
            var duration = Date.now() - self.connectionOpenedAt;
            console.log('WebSocket geschlossen nach ' + Math.round(duration / 1000) + 's');

            if (duration > STABLE_CONNECTION_MS) {
              self.reconnectAttempts = 0;
            }

            if (!self.stopped) {
              self._tryReconnect();
            } else {
              self.audioProcessor.stopRecording();
              if (self.config.onStatusChange) self.config.onStatusChange('disconnected');
            }
          },
          onerror: function(err) {
            console.error('Live API Fehler:', err);
            self._stopActivityMonitor();
            if (!self.stopped) {
              self._tryReconnect();
            } else {
              self.audioProcessor.stopRecording();
              if (self.config.onStatusChange) self.config.onStatusChange('error');
            }
          }
        }
      });
    } catch (error) {
      console.error('Verbindung fehlgeschlagen:', error);
      if (!this.stopped) {
        this._tryReconnect();
      } else {
        this.audioProcessor.stopRecording();
        if (this.config.onStatusChange) this.config.onStatusChange('error');
      }
    }
  }

  _startActivityMonitor() {
    this._stopActivityMonitor();
    var self = this;
    this.activityTimer = window.setInterval(function() {
      if (self.stopped) return;
      var idle = Date.now() - self.lastMessageTime;
      if (idle > ACTIVITY_TIMEOUT_MS) {
        console.warn('Keine Server-Aktivität seit ' + Math.round(idle / 1000) + 's – Reconnect');
        try { if (self.session) self.session.close(); } catch (e) { /* ignorieren */ }
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);
  }

  _stopActivityMonitor() {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  _tryReconnect() {
    if (this.reconnecting || this.stopped) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Maximale Reconnect-Versuche (' + MAX_RECONNECT_ATTEMPTS + ') erreicht');
      this.audioProcessor.stopRecording();
      if (this.config.onStatusChange) this.config.onStatusChange('error');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    var baseDelay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    var jitter = Math.random() * 1000;
    var delay = baseDelay + jitter;
    console.log('Reconnect in ' + Math.round(delay) + 'ms (Versuch ' + this.reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ')');
    if (this.config.onStatusChange) this.config.onStatusChange('reconnecting');
    var self = this;
    setTimeout(function() {
      self.reconnecting = false;
      self._connect();
    }, delay);
  }

  stop() {
    this.stopped = true;
    this.reconnecting = false;
    this._stopActivityMonitor();
    this.audioProcessor.stopRecording();
    this.audioPlayer.stop();
    try { if (this.session) this.session.close(); } catch (e) { /* ignorieren */ }
    this.session = null;
  }
}
