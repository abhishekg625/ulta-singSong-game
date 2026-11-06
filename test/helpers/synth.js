/**
 * Tiny "singer" synthesiser for tests: turns notes + vowels into a voice-like
 * signal (harmonics shaped by vowel formants, vibrato, note envelopes, noise).
 */

export const RATE = 48000;

// Approximate formant frequencies (Hz) for sung vowels.
const FORMANTS = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
};

// Deterministic PRNG so tests are repeatable.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function harmonicAmplitudes(f0, vowel, formantScale, brightness) {
  const formants = FORMANTS[vowel].map((f) => f * formantScale);
  const amps = [];
  for (let h = 1; h * f0 < 5000; h++) {
    const f = h * f0;
    let envelope = 0.05;
    for (const [k, fc] of formants.entries()) {
      const bw = 80 + fc * 0.08;
      envelope += (1 / (k + 1)) * Math.exp(-((f - fc) ** 2) / (2 * bw * bw));
    }
    amps.push(envelope / h ** (1.2 - brightness));
  }
  return amps;
}

/**
 * @param {Array<number|null>} notes MIDI note numbers (null = rest)
 * @param {object} opts
 */
export function sing(notes, opts = {}) {
  const {
    rate = RATE,
    vowels = 'aeiou',
    noteSeconds = 0.35,
    gapSeconds = 0.05,
    transpose = 0,
    tempo = 1, // >1 = slower
    formantScale = 1, // >1 = smaller vocal tract (higher voice)
    brightness = 0.4,
    vibratoHz = 5.5,
    vibratoCents = 25,
    noise = 0,
    pitchErrorSemitones = 0, // random per-note pitch error (± this much)
    timingJitter = 0, // random per-note duration change (± fraction)
    leadSilence = 0.3,
    tailSilence = 0.4,
    seed = 7,
  } = opts;

  const random = rng(seed);
  const parts = [];
  const silence = (seconds) => parts.push(new Float32Array(Math.round(seconds * rate)));

  silence(leadSilence);
  notes.forEach((note, index) => {
    const jitter = 1 + (random() * 2 - 1) * timingJitter;
    const length = Math.round(noteSeconds * tempo * jitter * rate);
    const buf = new Float32Array(length);
    if (note !== null) {
      const error = (random() * 2 - 1) * pitchErrorSemitones;
      const f0 = 440 * 2 ** ((note + transpose + error - 69) / 12);
      const amps = harmonicAmplitudes(f0, vowels[index % vowels.length], formantScale, brightness);
      const attack = Math.round(0.03 * rate);
      const release = Math.round(0.06 * rate);
      let phase = 0;
      let peak = 0;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const vib = 2 ** ((vibratoCents / 1200) * Math.sin(2 * Math.PI * vibratoHz * t));
        phase += (2 * Math.PI * f0 * vib) / rate;
        let s = 0;
        for (let h = 0; h < amps.length; h++) s += amps[h] * Math.sin(phase * (h + 1));
        const env = Math.min(1, i / attack, (length - i) / release);
        buf[i] = s * env;
        peak = Math.max(peak, Math.abs(buf[i]));
      }
      if (peak > 0) for (let i = 0; i < length; i++) buf[i] *= 0.5 / peak;
    }
    parts.push(buf);
    silence(gapSeconds * tempo);
  });
  silence(tailSilence);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  if (noise > 0) {
    for (let i = 0; i < out.length; i++) out[i] += (random() * 2 - 1) * noise;
  }
  return out;
}

export function whiteNoise(seconds, amplitude = 0.2, seed = 3, rate = RATE) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = (random() * 2 - 1) * amplitude;
  return out;
}

export const reversed = (samples) => samples.slice().reverse();

// Song A: a rising/falling nursery-style tune. Song B: a clearly different tune.
export const SONG_A = { notes: [60, 60, 67, 67, 69, 69, 67, null, 65, 65, 64, 64, 62, 62, 60], vowels: 'iiiieaaoeoeoeoa' };
export const SONG_B = { notes: [72, 71, 69, 67, null, 64, 64, 65, 67, 72, 74, 72, 71, 69, 67], vowels: 'uoaeeiuoaiieuoa' };

// A second singer: different vocal tract and brightness.
export const OTHER_VOICE = { formantScale: 1.12, brightness: 0.2, vibratoHz: 4.5, seed: 11 };
