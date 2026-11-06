import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTitle, titlesMatch, levenshtein } from '../src/game/titleMatch.js';

test('normalizeTitle strips case, punctuation and accents', () => {
  assert.equal(normalizeTitle('  Señorita!!  (Remix) '), 'senorita remix');
});

test('exact and case/punctuation-insensitive matches', () => {
  assert.ok(titlesMatch('Tum Hi Ho', 'tum hi ho'));
  assert.ok(titlesMatch("Don't Stop Me Now", 'dont stop me now'));
});

test('small typos still match', () => {
  assert.ok(titlesMatch('Tum Hi Ho', 'tum hee ho'));
  assert.ok(titlesMatch('Bohemian Rhapsody', 'bohemian rapsody'));
});

test('a solid part of the title matches', () => {
  assert.ok(titlesMatch('Kal Ho Naa Ho (Title Track)', 'kal ho naa ho'));
});

test('different songs and empty guesses do not match', () => {
  assert.ok(!titlesMatch('Tum Hi Ho', 'Kesariya'));
  assert.ok(!titlesMatch('Tum Hi Ho', ''));
  assert.ok(!titlesMatch('', 'anything'));
  assert.ok(!titlesMatch('Bohemian Rhapsody', 'bo'));
});

test('non-Latin scripts are supported', () => {
  assert.ok(titlesMatch('तुम ही हो', 'तुम ही हो'));
});

test('levenshtein distance', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
});
