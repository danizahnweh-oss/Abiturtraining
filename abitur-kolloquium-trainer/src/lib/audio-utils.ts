/**
 * Utilities for handling PCM audio data for the Gemini Live API.
 */

const RECORDING_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
/** Accumulate ~200ms of audio before sending (reduces ~125 msg/s → ~5 msg/s) */
const SEND_INTERVAL_MS = 200;
const SAMPLES_PER_SEND = Math.floor(RECORDING_SAMPLE_RATE * SEND_INTERVAL_MS / 1000);

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private buffer: Int16Array = new Int16Array(SAMPLES_PER_SEND);
  private bufferOffset = 0;
  private sendCallback: ((base64Data: string) => void) | null = null;
  private flushTimer: number | null = null;

  async startRecording(onAudioData: (base64Data: string) => void) {
    this.sendCallback = onAudioData;
    this.bufferOffset = 0;
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
      this.appendToBuffer(chunk);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    // Safety flush timer — ensure buffered audio is sent even if chunks stop arriving
    this.flushTimer = window.setInterval(() => this.flush(), SEND_INTERVAL_MS);
  }

  private appendToBuffer(chunk: Int16Array) {
    let offset = 0;
    while (offset < chunk.length) {
      const remaining = SAMPLES_PER_SEND - this.bufferOffset;
      const toCopy = Math.min(remaining, chunk.length - offset);
      this.buffer.set(chunk.subarray(offset, offset + toCopy), this.bufferOffset);
      this.bufferOffset += toCopy;
      offset += toCopy;

      if (this.bufferOffset >= SAMPLES_PER_SEND) {
        this.flush();
      }
    }
  }

  private flush() {
    if (this.bufferOffset === 0 || !this.sendCallback) return;
    const toSend = this.buffer.slice(0, this.bufferOffset);
    const bytes = new Uint8Array(toSend.buffer, toSend.byteOffset, toSend.byteLength);
    const base64 = btoa(String.fromCharCode(...bytes));
    this.sendCallback(base64);
    this.bufferOffset = 0;
  }

  stopRecording() {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    this.flush(); // Send any remaining buffered audio
    this.sendCallback = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.processor?.disconnect();
    this.audioContext?.close();
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
  }

  async playChunk(base64Data: string) {
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
    this.audioContext?.close();
    this.audioContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.nextStartTime = 0;
  }
}
