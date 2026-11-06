/**
 * AudioWorklet that captures raw microphone samples (mixed to mono) and sends
 * them to the main thread in batches. Lives in /public so it is served as-is
 * in both dev and production builds.
 */

const BATCH_FRAMES = 4096; // ~85 ms at 48 kHz

class RecorderCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BATCH_FRAMES);
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.send();
        this.port.postMessage('done');
      }
    };
  }

  send() {
    if (this.filled === 0) return;
    const chunk = this.filled === BATCH_FRAMES ? this.buffer : this.buffer.slice(0, this.filled);
    this.port.postMessage(chunk, [chunk.buffer]);
    this.buffer = new Float32Array(BATCH_FRAMES);
    this.filled = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0) {
      const frames = channels[0].length;
      const count = channels.length;
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < count; c++) sum += channels[c][i];
        this.buffer[this.filled++] = sum / count;
        if (this.filled === BATCH_FRAMES) this.send();
      }
    }
    return true; // keep running until disconnected
  }
}

registerProcessor('recorder-capture', RecorderCapture);
