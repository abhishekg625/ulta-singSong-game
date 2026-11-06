import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareClips, downsample, trimSilence, extractFeatures } from '../src/audio/compare.js';
import { sing, whiteNoise, reversed, RATE, SONG_A, SONG_B, OTHER_VOICE } from './helpers/synth.js';

const songA = (opts = {}) => sing(SONG_A.notes, { vowels: SONG_A.vowels, ...opts });
const songB = (opts = {}) => sing(SONG_B.notes, { vowels: SONG_B.vowels, ...opts });
const original = songA();

test('identical clips score ~100', () => {
  const result = compareClips(original, RATE, original, RATE);
  assert.ok(result.score >= 95, `score ${result.score}`);
});

test('same song by another voice, in another key and tempo, still matches', () => {
  const attempt = songA({ ...OTHER_VOICE, transpose: 5, tempo: 1.15, noise: 0.01 });
  const result = compareClips(original, RATE, attempt, RATE);
  assert.ok(result.score >= 70, `score ${result.score}`);
});

test('singing an octave lower is not punished', () => {
  const result = compareClips(original, RATE, songA({ ...OTHER_VOICE, transpose: -12 }), RATE);
  assert.ok(result.melody >= 85, `melody ${result.melody}`);
});

test('an imperfect but honest attempt passes the normal threshold', () => {
  const attempt = songA({ ...OTHER_VOICE, transpose: -3, pitchErrorSemitones: 0.7, timingJitter: 0.2, noise: 0.01, seed: 5 });
  const result = compareClips(original, RATE, attempt, RATE);
  assert.ok(result.score >= 60, `score ${result.score}`);
});

test('a different song scores low', () => {
  const result = compareClips(original, RATE, songB(OTHER_VOICE), RATE);
  assert.ok(result.score <= 30, `score ${result.score}`);
});

test('playing the reversed clip without flipping it back scores low', () => {
  const result = compareClips(original, RATE, reversed(songA(OTHER_VOICE)), RATE);
  assert.ok(result.score <= 30, `score ${result.score}`);
});

test('noise scores ~0', () => {
  const result = compareClips(original, RATE, whiteNoise(5), RATE);
  assert.ok(result.score <= 15, `score ${result.score}`);
});

test('silence is reported as too short instead of crashing', () => {
  const result = compareClips(original, RATE, new Float32Array(RATE * 2), RATE);
  assert.equal(result.score, 0);
  assert.equal(result.reason, 'too-short');
});

test('works across different sample rates', () => {
  const at44k = sing(SONG_A.notes, { vowels: SONG_A.vowels, rate: 44100 });
  const result = compareClips(original, RATE, at44k, 44100);
  assert.ok(result.score >= 90, `score ${result.score}`);
});

test('trimSilence removes leading/trailing silence and keeps the singing', () => {
  const clip = songA({ leadSilence: 1, tailSilence: 1 });
  const trimmed = trimSilence(clip, RATE);
  const removedSeconds = (clip.length - trimmed.length) / RATE;
  assert.ok(removedSeconds > 1.6 && removedSeconds < 2.1, `removed ${removedSeconds}s`);
  assert.equal(trimSilence(new Float32Array(RATE), RATE).length, 0);
});

test('downsample produces the expected length', () => {
  const { data, rate } = downsample(new Float32Array(48000), 48000, 16000);
  assert.equal(rate, 16000);
  assert.equal(data.length, 16000);
});

test('extractFeatures yields ~50 frames per second', () => {
  const { frames } = extractFeatures(original, RATE);
  const seconds = original.length / RATE;
  assert.ok(Math.abs(frames.length / seconds - 50) < 3, `${frames.length} frames for ${seconds}s`);
});

test('rejects invalid input', () => {
  assert.throws(() => compareClips([0, 1, 2], RATE, original, RATE), TypeError);
  assert.throws(() => compareClips(original, 0, original, RATE), RangeError);
});
