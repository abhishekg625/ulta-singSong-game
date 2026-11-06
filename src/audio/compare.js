/**
 * Audio similarity for the reverse-singing game.
 *
 * Compares two short vocal recordings and returns a 0–100 score. Everything here
 * is plain math on Float32Arrays (no DOM / Web Audio), so it runs in Node tests too.
 *
 * How it works:
 *   1. Trim silence and downsample to 16 kHz.
 *   2. Every 20 ms, extract three features:
 *        - melody : pitch (YIN), relative to the singer's median → key-independent
 *        - rhythm : loudness envelope, normalised per recording
 *        - sound  : MFCC "vowel colour", mean-normalised → roughly voice-independent
 *   3. Align the two feature sequences with Dynamic Time Warping (DTW) so singing
 *      a bit faster or slower is not punished, then turn the average cost into a score.
 *
 * It is a fun heuristic, not a forensic audio matcher.
 */

const ANALYSIS_RATE = 16000;
const WINDOW = 512; // 32 ms analysis window (also the FFT size)
const HOP = 320; // 20 ms hop → 50 frames per second
const MIN_FREQ = 70; // Hz, low male voice
const MAX_FREQ = 1000; // Hz, high female voice / whistle-ish
const YIN_THRESHOLD = 0.2;
const LOUD_RANGE_DB = 30; // frames within 30 dB of the peak count as "sounding"
const ENERGY_RANGE_DB = 40;
const MAX_ANALYSIS_SECONDS = 30;
const MIN_FRAMES = 15; // ~0.3 s of audio

// Few bands / low-order coefficients = a smooth spectral envelope (the vowel),
// which keeps "sound" fairly independent of the key someone sings in.
const MEL_BANDS = 20;
const MFCC_COUNT = 6;

const WEIGHTS = { melody: 0.5, rhythm: 0.25, sound: 0.25 };
const VOICING_MISMATCH_COST = 0.6;
const SEMITONES_FOR_MAX_COST = 5;

// Average aligned cost at which a (sub)score reaches 0. Calibrated with the
// synthetic tests in test/compare.test.js — tweak these to make the game easier/harder.
const SCORE_NORM = { total: 0.42, melody: 0.5, rhythm: 0.35, sound: 0.6 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toDb = (rms) => 20 * Math.log10(rms + 1e-9);

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assertSamples(samples, sampleRate) {
  if (!(samples instanceof Float32Array)) {
    throw new TypeError('samples must be a Float32Array');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
    throw new RangeError('sampleRate must be a number ≥ 8000');
  }
}

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

/**
 * Removes leading/trailing silence. "Silence" is relative to the loudest part of
 * the clip so it works with quiet and loud microphones alike.
 * Returns a new Float32Array (empty if the clip is silent).
 */
export function trimSilence(samples, sampleRate, { rangeDb = 35, floorDb = -60, padSeconds = 0.08 } = {}) {
  assertSamples(samples, sampleRate);
  const block = Math.max(1, Math.round(sampleRate * 0.02));
  const blocks = Math.ceil(samples.length / block);
  const levels = new Float32Array(blocks);
  let peakDb = -Infinity;

  for (let b = 0; b < blocks; b++) {
    const start = b * block;
    const end = Math.min(samples.length, start + block);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    levels[b] = toDb(Math.sqrt(sum / Math.max(1, end - start)));
    if (levels[b] > peakDb) peakDb = levels[b];
  }

  const threshold = Math.max(peakDb - rangeDb, floorDb);
  let first = -1;
  let last = -1;
  for (let b = 0; b < blocks; b++) {
    if (levels[b] > threshold) {
      if (first === -1) first = b;
      last = b;
    }
  }
  if (first === -1) return new Float32Array(0);

  const pad = Math.round(sampleRate * padSeconds);
  const start = Math.max(0, first * block - pad);
  const end = Math.min(samples.length, (last + 1) * block + pad);
  return samples.slice(start, end);
}

/** Box-filter decimation. Crude, but plenty for voices (we only care about < 4 kHz). */
export function downsample(samples, sampleRate, targetRate = ANALYSIS_RATE) {
  if (sampleRate <= targetRate) return { data: samples, rate: sampleRate };
  const factor = sampleRate / targetRate;
  const length = Math.floor(samples.length / factor);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * factor);
    const end = Math.min(samples.length, Math.floor((i + 1) * factor));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    data[i] = sum / Math.max(1, end - start);
  }
  return { data, rate: targetRate };
}

// ---------------------------------------------------------------------------
// Pitch (YIN)
// ---------------------------------------------------------------------------

function yinPitch(data, offset, rate, minLag, maxLag, scratch) {
  // Difference function d(tau)
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let j = 0; j < WINDOW; j++) {
      const diff = data[offset + j] - data[offset + j + tau];
      sum += diff * diff;
    }
    scratch[tau] = sum;
  }
  // Cumulative mean normalised difference d'(tau)
  scratch[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += scratch[tau];
    scratch[tau] = running > 0 ? (scratch[tau] * tau) / running : 1;
  }
  // First dip below the threshold, then walk to its local minimum
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (scratch[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxLag && scratch[t + 1] < scratch[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return 0;

  // Parabolic interpolation for sub-sample accuracy
  let refined = tau;
  if (tau > 1 && tau < maxLag) {
    const s0 = scratch[tau - 1];
    const s1 = scratch[tau];
    const s2 = scratch[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) refined = tau + (s2 - s0) / denom;
  }
  return rate / refined;
}

// ---------------------------------------------------------------------------
// Timbre (MFCC)
// ---------------------------------------------------------------------------

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vRe = re[b] * wRe - im[b] * wIm;
        const vIm = re[b] * wIm + im[b] * wRe;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const nextRe = wRe * stepRe - wIm * stepIm;
        wIm = wRe * stepIm + wIm * stepRe;
        wRe = nextRe;
      }
    }
  }
}

const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1);

let cachedDsp = null;
function getDspTables(rate) {
  if (cachedDsp && cachedDsp.rate === rate) return cachedDsp;

  const window = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));

  const bins = WINDOW / 2 + 1;
  const lowMel = hzToMel(80);
  const highMel = hzToMel(Math.min(7600, rate / 2));
  const points = Array.from({ length: MEL_BANDS + 2 }, (_, i) =>
    Math.floor(((WINDOW + 1) * melToHz(lowMel + ((highMel - lowMel) * i) / (MEL_BANDS + 1))) / rate),
  );
  const filters = [];
  for (let m = 1; m <= MEL_BANDS; m++) {
    const weights = new Float32Array(bins);
    const [left, centre, right] = [points[m - 1], points[m], points[m + 1]];
    for (let k = left; k < centre; k++) weights[k] = (k - left) / Math.max(1, centre - left);
    for (let k = centre; k < right; k++) weights[k] = (right - k) / Math.max(1, right - centre);
    filters.push(weights);
  }

  const dct = [];
  for (let c = 1; c <= MFCC_COUNT; c++) {
    const row = new Float32Array(MEL_BANDS);
    for (let m = 0; m < MEL_BANDS; m++) row[m] = Math.cos((Math.PI * c * (m + 0.5)) / MEL_BANDS);
    dct.push(row);
  }

  cachedDsp = { rate, window, filters, dct, re: new Float32Array(WINDOW), im: new Float32Array(WINDOW) };
  return cachedDsp;
}

function mfcc(data, offset, rate) {
  const { window, filters, dct, re, im } = getDspTables(rate);
  for (let i = 0; i < WINDOW; i++) {
    re[i] = data[offset + i] * window[i];
    im[i] = 0;
  }
  fftInPlace(re, im);

  const logMel = new Float32Array(MEL_BANDS);
  for (let m = 0; m < MEL_BANDS; m++) {
    const weights = filters[m];
    let energy = 0;
    for (let k = 0; k < weights.length; k++) {
      if (weights[k] > 0) energy += weights[k] * (re[k] * re[k] + im[k] * im[k]);
    }
    logMel[m] = Math.log(energy + 1e-10);
  }

  const coeffs = new Float32Array(MFCC_COUNT);
  for (let c = 0; c < MFCC_COUNT; c++) {
    let sum = 0;
    for (let m = 0; m < MEL_BANDS; m++) sum += dct[c][m] * logMel[m];
    coeffs[c] = sum;
  }
  return coeffs;
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

/**
 * Turns a clip into one feature frame per 20 ms:
 *   { energy: 0..1, voiced: boolean, pitch: semitones relative to median, timbre: Float32Array | null }
 */
export function extractFeatures(samples, sampleRate) {
  assertSamples(samples, sampleRate);
  const capped = samples.length > sampleRate * MAX_ANALYSIS_SECONDS
    ? samples.subarray(0, sampleRate * MAX_ANALYSIS_SECONDS)
    : samples;
  const { data, rate } = downsample(capped, sampleRate);

  const minLag = Math.floor(rate / MAX_FREQ);
  const maxLag = Math.ceil(rate / MIN_FREQ);
  const span = WINDOW + maxLag;
  const count = data.length >= span ? Math.floor((data.length - span) / HOP) + 1 : 0;

  // Pass 1: loudness of every frame
  const db = new Float32Array(count);
  let peakDb = -Infinity;
  for (let f = 0; f < count; f++) {
    const offset = f * HOP;
    let sum = 0;
    for (let j = 0; j < WINDOW; j++) sum += data[offset + j] * data[offset + j];
    db[f] = toDb(Math.sqrt(sum / WINDOW));
    if (db[f] > peakDb) peakDb = db[f];
  }

  // Pass 2: pitch + timbre, only for frames that are actually sounding
  const loudFloor = peakDb - LOUD_RANGE_DB;
  const scratch = new Float32Array(maxLag + 1);
  const midi = new Float32Array(count);
  const timbre = new Array(count).fill(null);
  for (let f = 0; f < count; f++) {
    if (db[f] < loudFloor) continue;
    const offset = f * HOP;
    const freq = yinPitch(data, offset, rate, minLag, maxLag, scratch);
    if (freq >= MIN_FREQ && freq <= MAX_FREQ) midi[f] = 69 + 12 * Math.log2(freq / 440);
    timbre[f] = mfcc(data, offset, rate);
  }

  // Smooth pitch with a 3-frame median to kill single-frame octave jumps
  const smoothed = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    if (!midi[f]) continue;
    const neighbours = [midi[f - 1], midi[f], midi[f + 1]].filter((v) => v > 0);
    smoothed[f] = median(neighbours);
  }

  // Key-independence: express pitch relative to the singer's median note
  const voicedPitches = [];
  for (let f = 0; f < count; f++) if (smoothed[f]) voicedPitches.push(smoothed[f]);
  const centre = median(voicedPitches);

  // Voice-independence for timbre: cepstral mean normalisation
  const mean = new Float32Array(MFCC_COUNT);
  let timbreFrames = 0;
  for (const t of timbre) {
    if (!t) continue;
    timbreFrames++;
    for (let c = 0; c < MFCC_COUNT; c++) mean[c] += t[c];
  }
  if (timbreFrames) for (let c = 0; c < MFCC_COUNT; c++) mean[c] /= timbreFrames;

  const energyFloor = peakDb - ENERGY_RANGE_DB;
  const frames = new Array(count);
  for (let f = 0; f < count; f++) {
    let t = timbre[f];
    if (t) {
      t = t.map((v, c) => v - mean[c]);
    }
    frames[f] = {
      energy: clamp((db[f] - energyFloor) / ENERGY_RANGE_DB, 0, 1),
      voiced: smoothed[f] > 0,
      pitch: smoothed[f] > 0 ? smoothed[f] - centre : 0,
      timbre: t,
    };
  }

  return {
    frames,
    duration: capped.length / sampleRate,
    voicedRatio: count ? voicedPitches.length / count : 0,
  };
}

// ---------------------------------------------------------------------------
// Alignment + scoring
// ---------------------------------------------------------------------------

function cosineDistance(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return clamp(1 - dot / Math.sqrt(na * nb), 0, 1);
}

/** Per-frame costs, each in 0..1. */
export function frameCosts(a, b) {
  let melody;
  if (a.voiced && b.voiced) {
    // Fold octaves: singing the right tune an octave up/down is fine.
    let diff = Math.abs(a.pitch - b.pitch) % 12;
    diff = Math.min(diff, 12 - diff);
    melody = Math.min(1, diff / SEMITONES_FOR_MAX_COST);
  } else if (a.voiced !== b.voiced) {
    melody = VOICING_MISMATCH_COST;
  } else {
    melody = 0;
  }

  const rhythm = Math.abs(a.energy - b.energy);

  let sound;
  if (a.timbre && b.timbre) sound = cosineDistance(a.timbre, b.timbre);
  else if (a.timbre || b.timbre) sound = 0.5;
  else sound = 0;

  return {
    melody,
    rhythm,
    sound,
    total: WEIGHTS.melody * melody + WEIGHTS.rhythm * rhythm + WEIGHTS.sound * sound,
  };
}

/**
 * Dynamic Time Warping with a Sakoe-Chiba band. Returns the average per-step
 * cost along the best path, plus the per-feature averages along that path.
 */
export function alignFrames(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) throw new RangeError('Cannot align empty feature sequences');

  const band = Math.max(Math.abs(n - m) + 8, Math.ceil(0.25 * Math.max(n, m)));
  const acc = new Float32Array(n * m).fill(Infinity);
  const from = new Uint8Array(n * m); // 0 = diagonal, 1 = from above (i-1), 2 = from left (j-1)

  for (let i = 0; i < n; i++) {
    const centre = n === 1 ? 0 : Math.round((i * (m - 1)) / (n - 1));
    const jStart = Math.max(0, centre - band);
    const jEnd = Math.min(m - 1, centre + band);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameCosts(a[i], b[j]).total;
      const idx = i * m + j;
      if (i === 0 && j === 0) {
        acc[idx] = cost;
        continue;
      }
      let best = Infinity;
      let dir = 0;
      if (i > 0 && j > 0 && acc[idx - m - 1] < best) {
        best = acc[idx - m - 1];
        dir = 0;
      }
      if (i > 0 && acc[idx - m] < best) {
        best = acc[idx - m];
        dir = 1;
      }
      if (j > 0 && acc[idx - 1] < best) {
        best = acc[idx - 1];
        dir = 2;
      }
      acc[idx] = cost + best;
      from[idx] = dir;
    }
  }

  // Walk the best path back to collect per-feature averages
  const sums = { melody: 0, rhythm: 0, sound: 0, total: 0 };
  let steps = 0;
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    const c = frameCosts(a[i], b[j]);
    sums.melody += c.melody;
    sums.rhythm += c.rhythm;
    sums.sound += c.sound;
    sums.total += c.total;
    steps++;
    if (i === 0 && j === 0) break;
    const dir = i === 0 ? 2 : j === 0 ? 1 : from[i * m + j];
    if (dir === 0) {
      i--;
      j--;
    } else if (dir === 1) {
      i--;
    } else {
      j--;
    }
  }

  return {
    total: sums.total / steps,
    melody: sums.melody / steps,
    rhythm: sums.rhythm / steps,
    sound: sums.sound / steps,
    steps,
  };
}

const toPercent = (cost, norm, factor = 1) => Math.round(100 * clamp(1 - cost / norm, 0, 1) * factor);

/**
 * Compares the original recording with the guesser's flipped-back attempt.
 * Returns { score, melody, rhythm, sound } (all 0–100) and an optional `reason`
 * when one of the clips is too short/quiet to judge.
 */
export function compareClips(original, originalRate, attempt, attemptRate) {
  const a = extractFeatures(trimSilence(original, originalRate), originalRate);
  const b = extractFeatures(trimSilence(attempt, attemptRate), attemptRate);

  if (a.frames.length < MIN_FRAMES || b.frames.length < MIN_FRAMES) {
    return { score: 0, melody: 0, rhythm: 0, sound: 0, reason: 'too-short' };
  }

  const costs = alignFrames(a.frames, b.frames);

  // Wildly different lengths can't be the same performance.
  const durationRatio = Math.min(a.duration, b.duration) / Math.max(a.duration, b.duration);
  const durationFactor = durationRatio >= 0.6 ? 1 : durationRatio / 0.6;

  return {
    score: toPercent(costs.total, SCORE_NORM.total, durationFactor),
    melody: toPercent(costs.melody, SCORE_NORM.melody),
    rhythm: toPercent(costs.rhythm, SCORE_NORM.rhythm, durationFactor),
    sound: toPercent(costs.sound, SCORE_NORM.sound),
  };
}
