/**
 * Forgiving song-title matching: ignores case, punctuation, accents and small typos,
 * so "tum hi ho" matches "Tum Hee Ho!".
 */

export function normalizeTitle(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ') // keep letters (any script), marks and digits
    .trim()
    .replace(/\s+/g, ' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

export function titlesMatch(secret, guess) {
  const a = normalizeTitle(secret);
  const b = normalizeTitle(guess);
  if (!a || !b) return false;
  if (a === b) return true;

  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  // A guess that is a solid chunk of the title (e.g. without the movie name) counts.
  if (shorter >= 4 && shorter / longer >= 0.4 && (a.includes(b) || b.includes(a))) return true;

  return 1 - levenshtein(a, b) / longer >= 0.75;
}
