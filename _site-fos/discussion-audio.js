/**
 * Audio-Utilities für die FOS Gruppendiskussion.
 * Port von abitur-kolloquium-trainer/src/lib/audio-utils.ts nach Vanilla JS ES-Modul.
 */

const RECORDING_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
/** ~200ms Audio-Daten vor dem Senden sammeln (reduziert ~125 msg/s auf ~5 msg/s) */
const SEND_INTERVAL_MS = 200;
const SAMPLES_PER_SEND = Math.floor(RECORDING_SAMPLE_RATE * SEND_INTERVAL_MS / 1000);

export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.buffer = new Int16Array(SAMPLES_PER_SEND);
    this.bufferOffset = 0;
    this.sendCallback = null;
    this.flushTimer = null;
    this.recording = false;
    this.warmupPromise = null;
  }

  /** Prüft ob gerade aufgenommen wird (Mikrofon aktiv) */
  isRecording() {
    return this.recording;
  }

  /** Callback austauschen ohne Aufnahme zu stoppen (für Reconnect) */
  updateCallback(onAudioData) {
    this.sendCallback = onAudioData;
  }

  /** Mikrofon + AudioWorklet vorab initialisieren (ohne Audio zu senden) */
  async warmup() {
    if (this.recording) return;
    if (this.warmupPromise) return this.warmupPromise;
    this.warmupPromise = this._doWarmup();
    return this.warmupPromise;
  }

  async _doWarmup() {
    try {
      this.audioContext = new AudioContext({ sampleRate: RECORDING_SAMPLE_RATE });
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      await this.audioContext.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [
              `
              class RecorderProcessor extends AudioWorkletProcessor {
                process(inputs, outputs, parameters) {
                  const input = inputs[0];
                  if (input.length > 0) {
                    const channelData = input[0];
                    const pcmData = new Int16Array(channelData.length);
                    for (let i = 0; i < channelData.length; i++) {
                      pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
                    }
                    this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
                  }
                  return true;
                }
              }
              registerProcessor('recorder-processor', RecorderProcessor);
              `,
            ],
            { type: 'application/javascript' }
          )
        )
      );

      this.processor = new AudioWorkletNode(this.audioContext, 'recorder-processor');
      this.processor.port.onmessage = (e) => {
        const chunk = new Int16Array(e.data);
        this._appendToBuffer(chunk);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.flushTimer = window.setInterval(() => this._flush(), SEND_INTERVAL_MS);
      this.recording = true;
    } catch (e) {
      this.warmupPromise = null;
      throw e;
    }
  }

  async startRecording(onAudioData) {
    this.sendCallback = onAudioData;
    this.bufferOffset = 0;
    if (!this.recording) {
      await this.warmup();
    }
  }

  _appendToBuffer(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      const remaining = SAMPLES_PER_SEND - this.bufferOffset;
      const toCopy = Math.min(remaining, chunk.length - offset);
      this.buffer.set(chunk.subarray(offset, offset + toCopy), this.bufferOffset);
      this.bufferOffset += toCopy;
      offset += toCopy;

      if (this.bufferOffset >= SAMPLES_PER_SEND) {
        this._flush();
      }
    }
  }

  _flush() {
    if (this.bufferOffset === 0) return;
    if (this.sendCallback) {
      const toSend = this.buffer.slice(0, this.bufferOffset);
      const bytes = new Uint8Array(toSend.buffer, toSend.byteOffset, toSend.byteLength);
      const base64 = btoa(String.fromCharCode(...bytes));
      this.sendCallback(base64);
    }
    this.bufferOffset = 0;
  }

  stopRecording() {
    this.recording = false;
    this.warmupPromise = null;
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    this._flush();
    this.sendCallback = null;
    if (this.stream) this.stream.getTracks().forEach(function(track) { track.stop(); });
    if (this.source) this.source.disconnect();
    if (this.processor) this.processor.disconnect();
    if (this.audioContext) this.audioContext.close();
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
  }
}

export class AudioPlayer {
  constructor() {
    this.audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.nextStartTime = 0;
  }

  async playChunk(base64Data) {
    if (!this.audioContext) return;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = this.audioContext.createBuffer(1, floatData.length, PLAYBACK_SAMPLE_RATE);
    buffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  stop() {
    if (this.audioContext) this.audioContext.close();
    this.audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.nextStartTime = 0;
  }
}
