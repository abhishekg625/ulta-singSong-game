/**
 * Browser audio helpers: the shared AudioContext, reversing clips, and turning
 * raw samples into playable WAV object URLs. Everything stays on the user's device.
 */

let sharedContext = null;

/** Lazily creates one AudioContext (browsers only allow it after a user gesture). */
export function getAudioContext() {
  if (!sharedContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Your browser does not support Web Audio. Try a recent Chrome, Edge, Firefox or Safari.');
    sharedContext = new AudioContextCtor();
  }
  return sharedContext;
}

/** Encodes mono Float32 samples as a 16-bit PCM WAV blob. */
export function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

/** Downsamples a clip to `bars` peak values in 0..1 for the waveform display. */
export function computePeaks(samples, bars = 56) {
  const peaks = new Array(bars).fill(0);
  if (!samples.length) return peaks;
  const size = samples.length / bars;
  let max = 0;
  for (let b = 0; b < bars; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(samples.length, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}

/**
 * A "clip" is what the game passes around: raw samples (for analysis) plus a
 * playable object URL (for the <audio> element). Call `releaseClip` when done.
 */
export function createClip(samples, sampleRate) {
  return {
    samples,
    sampleRate,
    duration: samples.length / sampleRate,
    peaks: computePeaks(samples),
    url: URL.createObjectURL(encodeWav(samples, sampleRate)),
  };
}

export function reverseClip(clip) {
  return createClip(clip.samples.slice().reverse(), clip.sampleRate);
}

export function releaseClip(clip) {
  if (clip?.url) URL.revokeObjectURL(clip.url);
}

export function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
