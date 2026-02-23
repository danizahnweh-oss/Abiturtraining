/**
 * Utilities for handling PCM audio data for the Gemini Live API.
 */

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;

  async startRecording(onAudioData: (base64Data: string) => void) {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // We'll use a simple ScriptProcessor or AudioWorklet. 
    // For simplicity in this environment, let's use a basic processor.
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
                  // Convert Float32 to Int16 PCM
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
      const arrayBuffer = e.data;
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      onAudioData(base64);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stopRecording() {
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
    this.audioContext = new AudioContext({ sampleRate: 24000 });
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

    const buffer = this.audioContext.createBuffer(1, floatData.length, 24000);
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
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.nextStartTime = 0;
  }
}
