/**
 * Audio-Modul für die Listening Comprehension.
 * Nutzt die Gemini TTS API (REST), um einen Text natürlich vorlesen zu lassen.
 * Gibt einen abspielbaren WAV-Blob zurück.
 */

const PROXY_URL = 'https://gemini-proxy.sanktannagymnasium.workers.dev';
const PLAYBACK_SAMPLE_RATE = 24000;

/** GoogleGenAI wird lokal geladen (DSGVO-konform) */
let _genaiModule = null;
async function loadGenAI() {
  if (_genaiModule) return _genaiModule;
  _genaiModule = await import('/vendor/genai.esm.js');
  return _genaiModule;
}

function createAI(GoogleGenAI) {
  return new GoogleGenAI({
    apiKey: 'PROXY',
    httpOptions: { baseUrl: PROXY_URL },
  });
}

/** Stimmen-Paare für Multi-Speaker (weiblich + männlich) */
const VOICE_PAIRS = {
  Kore:   { second: 'Puck' },
  Puck:   { second: 'Kore' },
  Aoede:  { second: 'Charon' },
  Charon: { second: 'Aoede' },
  Fenrir: { second: 'Leda' },
  Leda:   { second: 'Fenrir' },
};

/**
 * Generiert Audio für einen Hörtext via Gemini TTS API (REST-Call).
 * Unterstützt Multi-Speaker: wenn speakers-Array übergeben wird,
 * bekommt jeder Sprecher eine eigene Stimme.
 *
 * @param {string} text – Der Text, der vorgelesen werden soll
 * @param {string} [voice='Kore'] – Haupt-Stimme
 * @param {function} [onProgress] – Callback für Fortschrittsupdates (0-100)
 * @param {string[]} [speakers] – Array mit Sprecher-Namen (max. 2)
 * @returns {Promise<{blob: Blob, url: string, duration: number}>}
 */
export async function generateListeningAudio(text, voice, onProgress, speakers) {
  voice = voice || 'Kore';
  if (onProgress) onProgress(10);

  var mod = await loadGenAI();
  var ai = createAI(mod.GoogleGenAI);
  if (onProgress) onProgress(20);

  // Multi-Speaker oder Single-Speaker Config erstellen
  var speechConfig;
  if (speakers && speakers.length >= 2) {
    var secondVoice = (VOICE_PAIRS[voice] && VOICE_PAIRS[voice].second) || 'Puck';
    // Sicherstellen, dass die zweite Stimme nicht die gleiche ist
    if (secondVoice === voice) secondVoice = 'Puck';

    speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: speakers[0],
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
          {
            speaker: speakers[1],
            voiceConfig: { prebuiltVoiceConfig: { voiceName: secondVoice } },
          },
        ],
      },
    };
    console.log('[Listening] Multi-Speaker TTS: ' + speakers[0] + '=' + voice + ', ' + speakers[1] + '=' + secondVoice + ', ' + text.split(/\s+/).length + ' Wörter');
  } else {
    speechConfig = {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
    };
    console.log('[Listening] Single-Speaker TTS, ' + text.split(/\s+/).length + ' Wörter, Stimme: ' + voice);
  }

  var response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ role: 'user', parts: [{ text: text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: speechConfig,
    },
  });
  if (onProgress) onProgress(80);

  console.log('[Listening] TTS-Antwort erhalten');

  // Audio-Daten aus der Response extrahieren
  var audioData = null;
  if (response.candidates && response.candidates[0] &&
      response.candidates[0].content && response.candidates[0].content.parts) {
    var parts = response.candidates[0].content.parts;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].inlineData && parts[i].inlineData.data) {
        audioData = parts[i].inlineData;
        break;
      }
    }
  }

  if (!audioData) {
    throw new Error('Kein Audio in der Antwort erhalten.');
  }

  if (onProgress) onProgress(90);

  // Base64-Audio dekodieren
  var binaryString = atob(audioData.data);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  var blob;
  var duration;

  // Prüfen ob die Antwort bereits WAV/MP3 ist oder rohes PCM
  var mimeType = audioData.mimeType || '';

  if (mimeType.indexOf('wav') !== -1 || mimeType.indexOf('mp3') !== -1 || mimeType.indexOf('mpeg') !== -1) {
    // Bereits ein fertiges Audio-Format
    blob = new Blob([bytes], { type: mimeType });
    // Dauer schätzen: ~150 Wörter pro Minute
    duration = (text.split(/\s+/).length / 150) * 60;
  } else {
    // Rohes PCM (16-bit, 24kHz, mono) – zu WAV konvertieren
    var pcmData = new Int16Array(bytes.buffer);
    blob = pcmChunksToWav([pcmData], PLAYBACK_SAMPLE_RATE);
    duration = pcmData.length / PLAYBACK_SAMPLE_RATE;
  }

  var url = URL.createObjectURL(blob);
  if (onProgress) onProgress(100);

  console.log('[Listening] Audio fertig: ' + Math.round(duration) + 's, ' + Math.round(bytes.length / 1024) + ' KB');

  return { blob: blob, url: url, duration: duration };
}

/**
 * Array von Int16Array-Chunks zu einem WAV-Blob konvertieren
 */
function pcmChunksToWav(chunks, sampleRate) {
  var totalSamples = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalSamples += chunks[i].length;
  }

  var dataLength = totalSamples * 2;
  var headerLength = 44;
  var buffer = new ArrayBuffer(headerLength + dataLength);
  var view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

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
