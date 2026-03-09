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
 * Generiert Diskussionsthema im echten FOS-Prüfungsformat per Gemini Text-API.
 * @param {Object} config
 * @param {number} config.totalCount – Gesamtzahl Teilnehmer (4 oder 5)
 * @param {number} config.realStudents – Anzahl echte Schüler (1-3)
 * @param {string} [config.topic] – Optionales Wunschthema (sonst zufällig)
 * @returns {Promise<Object>} { topic, situation, taskInstruction, opinions: [{ label, opinion }] }
 */
export async function generateDiscussionSetup(config) {
  var mod = await loadGenAI();
  var ai = createAI(mod.GoogleGenAI);

  var topicHint = config.topic && config.topic !== 'random'
    ? 'Verwende dieses Thema: "' + config.topic + '".'
    : 'Wähle ein aktuelles, kontroverses Thema das FOS-Schüler interessiert (z.B. Social Media, Klimawandel, Jugendkriminalität, Fake News, Arbeitswelt, Umwelt, Tourismus, Ernährung, Stadtentwicklung).';

  var prompt = 'Du bist ein erfahrener FOS-Englischlehrer in Bayern und erstellst Aufgaben für die mündliche Gruppenprüfung (MGP) in Englisch.\n\n' +
    topicHint + '\n\n' +
    'Erstelle eine Aufgabe im ECHTEN FOS-Prüfungsformat mit genau ' + config.totalCount + ' Teilnehmern.\n\n' +
    'Das Format muss so aussehen:\n' +
    '1. SITUATION: Ein konkreter Rahmen, wer die Teilnehmer sind und warum sie diskutieren (z.B. "You are part of a city council...", "You are in the youth forum...", "The school has recently discovered..."). 3-5 Sätze auf Englisch. Am Ende muss klar sein, dass die Gruppe sich auf EINEN gemeinsamen Vorschlag einigen muss.\n' +
    '2. TASK INSTRUCTION: Ein kurzer Satz der beschreibt was diskutiert wird (z.B. "In a meeting they discuss which is the best measure to take.").\n' +
    '3. OPINIONS: Genau ' + config.totalCount + ' verschiedene Meinungen/Positionen, je ein klarer Satz pro Person. Die Meinungen müssen unterschiedlich sein aber Überschneidungen und Kompromissmöglichkeiten bieten.\n\n' +
    'BEISPIELE für gute Aufgaben:\n' +
    '- Situation: "You are part of the youth forum \'The future of work is our future\'. Your task is to come up with ideas about what the future of work looks like. In the end you need to present the three most important points to the rest of the forum."\n' +
    '  Opinions: "Remote work will become the norm." / "Upskilling and lifelong learning is the priority." / "Traditional 9 to 5 workdays will become a thing of the past." / "Job sharing and flexible schedules are the future."\n' +
    '- Situation: "The school has recently discovered it has a problem with bullying among pupils. A team of pupils\' representatives is asked to make their suggestion how to deal with the issue. They have to put forward ONE proposal they all support."\n' +
    '  Opinions: "Kick the bullies out immediately." / "Ban the bullies from school for some time." / "Leave it in the hands of a psychologist." / "Create an ethics board with teachers, parents and pupils."\n\n' +
    'WICHTIG:\n' +
    '- ALLES auf ENGLISCH. Sprachniveau B2-C1.\n' +
    '- Opinions sind kurze, klare Statements (1 Satz, max 2 Sätze).\n' +
    '- Die Situation muss realistisch und für Jugendliche relevant sein.\n\n' +
    'Antworte EXAKT in diesem JSON-Format (kein Markdown, kein Codeblock, nur reines JSON):\n' +
    '{"topic":"Kurzer Titel auf Englisch","situation":"3-5 Sätze Situation auf Englisch","taskInstruction":"1 Satz Aufgabe auf Englisch","opinions":[' +
    '{"label":"Person 1","opinion":"Klare Meinung als 1 Satz auf Englisch"},' +
    '{"label":"Person 2","opinion":"..."}' +
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
    var opinions = [];
    for (var i = 0; i < config.totalCount; i++) {
      opinions.push({
        label: 'Person ' + (i + 1),
        opinion: 'This person has a unique perspective on the topic.'
      });
    }
    return {
      topic: config.topic || 'The impact of artificial intelligence on education',
      situation: 'You are part of a student committee discussing an important issue at your school. The committee has to present ONE joint recommendation to the school board.',
      taskInstruction: 'Discuss the different perspectives and come to a compromise by the end.',
      opinions: opinions
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

  var situationInfo = config.situation ? '\nSituation: ' + config.situation + '\n' : '';

  var prompt = 'You are an experienced Bavarian FOS English teacher evaluating a group discussion (Mündliche Gruppenprüfung).\n\n' +
    'Topic: ' + config.topic + '\n' +
    situationInfo +
    'Number of real students: ' + config.realStudents + '\n\n' +
    'COMPLETE DISCUSSION TRANSCRIPT:\n---\n' +
    (lines.join('\n') || '(No transcript available)') + '\n---\n\n' +
    'Evaluate the student\'s performance in this group discussion. Provide feedback in GERMAN.\n\n' +
    'Bewerte nach den Kriterien einer FOS-Gruppenprüfung:\n\n' +
    '## Gesamteindruck\n(2-3 Sätze, ehrliche Einschätzung)\n\n' +
    '## Sprachliche Leistung\n- Wortschatz und Ausdrucksfähigkeit\n- Grammatische Korrektheit\n- Flüssigkeit und Aussprache\n- Angemessenheit des Sprachregisters (B2-C1)\n\n' +
    '## Diskussionsfähigkeit\n- Wurde die eigene Position klar in der Einleitung dargestellt?\n- Wurde auf andere Teilnehmer eingegangen und auf vorherige Punkte Bezug genommen?\n- Wurden Argumente überzeugend dargelegt?\n- Wurde die zugewiesene Meinung/Rolle eingehalten?\n- Gesprächsstrategien (turn-taking, agree/disagree, asking for opinions, Redewendungen)\n- Wurde aktiv an der Kompromissfindung mitgewirkt?\n\n' +
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
  // Bestimme welche Opinions KI-gesteuert und welche Schüler-gesteuert sind
  var realCount = config.realStudents || 1;
  var allOpinions = config.opinions || [];
  var aiOpinions = [];
  var realOpinions = [];

  allOpinions.forEach(function(op, i) {
    if (i < realCount) {
      realOpinions.push(op);
    } else {
      aiOpinions.push(op);
    }
  });

  var aiChars = aiOpinions.map(function(op) {
    return '- ' + op.label + ': "' + op.opinion + '"';
  }).join('\n');

  var realChars = realOpinions.map(function(op, i) {
    var label = realOpinions.length === 1 ? 'THE REAL STUDENT' : 'REAL STUDENT ' + (i + 1);
    return '- ' + label + ' has the role of ' + op.label + ': "' + op.opinion + '"';
  }).join('\n');

  var duration = config.totalCount * 5;

  return 'You are simulating a mündliche Gruppenprüfung (oral group exam) at a Bavarian FOS (Fachoberschule) in English.\n' +
    'There are ' + config.totalCount + ' participants total. You play ' + aiOpinions.length + ' of them.\n\n' +
    'SITUATION:\n' + config.situation + '\n\n' +
    'TASK: ' + config.taskInstruction + '\n\n' +
    'YOUR CHARACTERS (you simulate these – each defends their assigned opinion):\n' + aiChars + '\n\n' +
    'REAL STUDENT(S) (speaking via microphone, you do NOT play these):\n' + realChars + '\n\n' +
    'THE EXAM HAS TWO PHASES:\n\n' +
    'PHASE 1 – STATEMENTS (first ' + Math.min(config.totalCount * 1, 5) + ' minutes):\n' +
    '- ' + aiOpinions[0].label + ' opens the discussion: introduces the topic, states their opinion, then asks the next person.\n' +
    '- Each participant introduces themselves and makes a brief statement on their personal point of view.\n' +
    '- After 1-2 AI characters introduce themselves, PAUSE and wait for the real student(s) to give their statement.\n' +
    '- If the student hasn\'t spoken after ~20 seconds, gently prompt them: "What about you? What\'s your opinion on this?"\n\n' +
    'PHASE 2 – DISCUSSION (remaining time, about ' + (duration - 5) + ' minutes):\n' +
    '- The positions and views are discussed, arguments exchanged.\n' +
    '- React to what others say – agree, disagree, ask follow-up questions, build on arguments.\n' +
    '- Refer back to points that were mentioned earlier.\n' +
    '- Make sure everyone gets to speak roughly equally.\n' +
    '- IMPORTANT: At the end, the group MUST reach some kind of agreement or compromise. Guide the discussion towards finding common ground.\n\n' +
    'RULES:\n' +
    '1. ALWAYS start each contribution by saying the character label: "This is ' + aiOpinions[0].label + '. I think..."\n' +
    '2. Keep contributions SHORT (2-4 sentences max) to leave room for real students.\n' +
    '3. After 1-2 AI characters speak, PAUSE and WAIT for real students to respond.\n' +
    '4. Stay IN CHARACTER with assigned opinion. Defend it with arguments but be open to compromise.\n' +
    '5. If the student hasn\'t spoken for ~30 seconds, address them directly.\n' +
    '6. Language level: B2-C1 English. Use natural, conversational English.\n' +
    '7. Use discussion phrases naturally: "I see your point, but...", "That\'s an interesting argument...", "Don\'t you think that...", "I partially agree, however..."\n' +
    (realOpinions.length > 1 ? '8. Multiple real students share one microphone – different voices are different people.\n' : '') +
    '\nTIMING (' + duration + ' minutes total):\n' +
    '- In the last 2-3 minutes, one character should say: "We\'re running out of time. Can we agree on a compromise?"\n' +
    '- Push for a joint conclusion that everyone can support.\n\n' +
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
 * @param {string} config.situation
 * @param {string} config.taskInstruction
 * @param {Array} config.opinions – [{ label, opinion }]
 * @param {number} config.totalCount
 * @param {number} config.realStudents – Anzahl echte Schüler
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
