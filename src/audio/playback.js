/** Makes sure only one clip plays at a time across all players on the page. */

let active = null;

export function playExclusive(audio) {
  if (active && active !== audio) active.pause();
  active = audio;
  return audio.play();
}

export function releasePlayback(audio) {
  if (active === audio) active = null;
}

export function pauseAll() {
  if (active) active.pause();
}
