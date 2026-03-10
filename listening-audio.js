/**
 * Audio-Modul für die Listening Comprehension.
 * Nutzt die Gemini Live API, um einen Text natürlich vorlesen zu lassen.
 * Sammelt die Audio-Chunks und gibt einen abspielbaren WAV-Blob zurück.
 */

const PROXY_URL = 'https://gemini-proxy.sanktannagymnasium.workers.dev';
const PLAYBACK_SAMPLE_RATE = 24000;

/** GoogleGenAI wird dynamisch über CDN geladen */
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

/**
 * Generiert Audio für einen Hörtext via Gemini Live API.
 * @param {string} text – Der Text, der vorgelesen werden soll
 * @param {string} [voice='Kore'] – Stimme (Kore=weiblich, Puck=männlich)
 * @param {function} [onProgress] – Callback für Fortschrittsupdates (0-100)
 * @returns {Promise<{blob: Blob, url: string, duration: number}>}
 */
export async function generateListeningAudio(text, voice, onProgress) {
  voice = voice || 'Kore';
  var mod = await loadGenAI();
  var ai = createAI(mod.GoogleGenAI);

  // Audio-Chunks sammeln
  var audioChunks = [];
  var totalBytes = 0;

  return new Promise(function(resolve, reject) {
    var sessionRef = null;
    var settled = false;
    // Timeout: 90 Sekunden max
    var timeout = setTimeout(function() {
      if (!settled) {
        settled = true;
        try { if (sessionRef) sessionRef.close(); } catch (e) {}
        if (audioChunks.length > 0) {
          // Partial audio verfügbar – verwende was wir haben
          finalize();
        } else {
          reject(new Error('Audio-Generierung hat zu lange gedauert.'));
        }
      }
    }, 90000);

    function finalize() {
      clearTimeout(timeout);
      if (audioChunks.length === 0) {
        reject(new Error('Kein Audio empfangen.'));
        return;
      }

      // PCM-Chunks zu einem WAV-Blob konvertieren
      var wavBlob = pcmChunksToWav(audioChunks, PLAYBACK_SAMPLE_RATE);
      var url = URL.createObjectURL(wavBlob);
      var totalSamples = 0;
      for (var i = 0; i < audioChunks.length; i++) {
        totalSamples += audioChunks[i].length;
      }
      var duration = totalSamples / PLAYBACK_SAMPLE_RATE;

      resolve({ blob: wavBlob, url: url, duration: duration });
    }

    ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [mod.Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
        systemInstruction: 'You are a professional English narrator for a listening comprehension exam. Read the provided text clearly, naturally, and at a steady pace suitable for B2/C1 level students. Use appropriate intonation and pauses. If the text contains dialogue or quotes, slightly vary your voice to indicate different speakers. Do NOT add any commentary, introduction, or explanation — just read the text exactly as given.',
      },
      callbacks: {
        onopen: function() {
          // Text zum Vorlesen senden
          if (sessionRef) {
            sessionRef.send({ text: text });
          }
        },
        onmessage: function(message) {
          // Audio-Chunks sammeln
          var parts = message.serverContent && message.serverContent.modelTurn && message.serverContent.modelTurn.parts;
          if (parts) {
            for (var i = 0; i < parts.length; i++) {
              if (parts[i].inlineData && parts[i].inlineData.data) {
                var pcm = base64ToPcm(parts[i].inlineData.data);
                audioChunks.push(pcm);
                totalBytes += pcm.length * 2;

                // Fortschrittsupdate (geschätzt: ~500 Wörter ≈ 3 Min ≈ 4.3 MB PCM bei 24kHz)
                if (onProgress) {
                  var estimated = text.split(/\s+/).length * 8640; // Samples pro Wort (geschätzt)
                  var current = 0;
                  for (var j = 0; j < audioChunks.length; j++) current += audioChunks[j].length;
                  var pct = Math.min(95, Math.round(current / estimated * 100));
                  onProgress(pct);
                }
              }
            }
          }

          // Turn Complete = Vorlesen fertig
          if (message.serverContent && message.serverContent.turnComplete) {
            settled = true;
            try { if (sessionRef) sessionRef.close(); } catch (e) {}
            if (onProgress) onProgress(100);
            finalize();
          }
        },
        onclose: function() {
          if (!settled) {
            settled = true;
            if (audioChunks.length > 0) {
              finalize();
            } else {
              clearTimeout(timeout);
              reject(new Error('Verbindung geschlossen, kein Audio empfangen.'));
            }
          }
        },
        onerror: function(err) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error('Audio-Fehler: ' + (err.message || err)));
          }
        }
      }
    }).then(function(session) {
      sessionRef = session;
    }).catch(function(err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('Verbindung fehlgeschlagen: ' + (err.message || err)));
      }
    });
  });
}

/**
 * Base64-String zu Int16Array (PCM) konvertieren
 */
function base64ToPcm(base64Data) {
  var binaryString = atob(base64Data);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

/**
 * Array von Int16Array-Chunks zu einem WAV-Blob konvertieren
 */
function pcmChunksToWav(chunks, sampleRate) {
  // Gesamtlänge berechnen
  var totalSamples = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalSamples += chunks[i].length;
  }

  var dataLength = totalSamples * 2; // 16-bit = 2 bytes pro sample
  var headerLength = 44;
  var buffer = new ArrayBuffer(headerLength + dataLength);
  var view = new DataView(buffer);

  // WAV Header schreiben
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // PCM Format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // PCM-Daten schreiben
  var offset = headerLength;
  for (var i = 0; i < chunks.length; i++) {
    var chunk = chunks[i];
    for (var j = 0; j < chunk.length; j++) {
      view.setInt16(offset, chunk[j], true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (var i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
