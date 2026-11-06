# 🔁 Ulta Gaana: the reverse singing game

A party game for two players, played in the browser on one device.

1. **Singer** records a few seconds of a song and can play it normally or **reversed**.
2. **Guesser** hears *only the reversed clip* and records themselves copying it, gibberish and all.
3. The app **flips the guesser's recording back**. If they copied it well, the original song comes back.
4. The app compares the singer's original with the guesser's flipped-back version and shows a **match score**. If the score clears the difficulty threshold, the guesser wins. If not, the singer wins.
5. Guessing the song title earns a bonus point. Then roles swap for the next round.

## Run it

Requires **Node 20.19+** (an `.nvmrc` is included).

```bash
nvm use            # switches to Node 20
npm install
npm run dev        # open http://localhost:5173
```

Allow microphone access when the browser asks. Headphones help, so the mic doesn't pick up the clip you're playing.

| Command           | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Dev server on http://localhost:5173                    |
| `npm run build`   | Production build into `dist/`                          |
| `npm run preview` | Serve the production build locally                     |
| `npm test`        | Unit tests for scoring + title matching (`node:test`)  |

### Playing on phones

Browsers only allow the microphone on **secure pages** (`https://` or `http://localhost`). Opening `http://<your-laptop-ip>:5173` on a phone will **not** get mic access. To play on phones, deploy the static `dist/` build to HTTPS hosting your team has approved, or use HTTPS for local dev.

### Mic troubleshooting

While you record, the bar under the button shows your mic level. If it stays flat, the game warns you after 2 seconds.

- **Open the game in Chrome, Safari, Edge or Firefox.** VS Code's built-in browser usually can't use the mic.
- **Mac:** System Settings → Privacy & Security → **Microphone** → enable your browser (restart the browser after changing it).
- **Mac:** System Settings → Sound → **Input** → pick the right mic and check the input level moves.
- In the browser, click the mic/lock icon in the address bar → allow Microphone, then reload.

Recording captures raw samples through the Web Audio API ([`public/recorder-worklet.js`](public/recorder-worklet.js)), not `MediaRecorder`. That avoids browsers (notably Safari) whose compressed recordings only partly decode.

## How the match score works

All analysis runs locally in [`src/audio/compare.js`](src/audio/compare.js). It is pure JavaScript with no dependencies.

1. Trim silence, downsample to 16 kHz.
2. Every 20 ms, extract:
   - **Melody**: pitch (YIN algorithm), measured relative to each singer's median note, so singing in a different key or octave is fine.
   - **Rhythm**: the loudness envelope.
   - **Sound**: low-order MFCCs (roughly the vowel shape), mean-normalized so different voices can still match.
3. Align the two sequences with **Dynamic Time Warping**, so singing a bit faster or slower isn't punished.
4. Turn the average aligned cost into a 0–100 score (weights: melody 50%, rhythm 25%, sound 25%).

**Difficulty thresholds** (in [`src/App.jsx`](src/App.jsx)): Easy 40 · Normal 55 · Hard 70.

### Calibration and limitations

- The scoring was calibrated against **synthetic voices** (see [`test/helpers/synth.js`](test/helpers/synth.js)): same song in another voice/key/tempo ≈ 70–80, imperfect imitation ≈ 60–70, different song / noise / un-flipped audio ≤ 15.
- It has **not yet been tuned on real human recordings**. Reverse singing is hard, so if real players almost never win, lower the thresholds in `DIFFICULTY` or raise `SCORE_NORM` in `compare.js`. Re-run `npm test` afterwards.
- It's a fun heuristic, not a forensic audio matcher. Background noise, very short clips (< 2 s), or whispering will lower the score.

## Privacy

Recordings are kept in memory in the current tab only. Nothing is uploaded or stored, and the audio URLs are freed when clips are replaced. There is no backend.

**Visitor analytics:** production builds include [Vercel Web Analytics](https://vercel.com/docs/analytics) (`@vercel/analytics`) to count page views and unique visitors. It uses no cookies, and Vercel counts unique visitors from a hash of the request that rotates daily. It never sees recordings, song titles or scores. It's not loaded in `npm run dev`, and it only collects data when the site is deployed on Vercel with Web Analytics turned on in the project settings.

## Project structure

```
src/
  App.jsx                 game state: rounds, roles, scoring, difficulty
  audio/
    compare.js            pitch / rhythm / timbre features + DTW scoring (pure, tested)
    audioUtils.js         shared AudioContext, reverse, WAV encode, waveform peaks
    micCapture.js         raw mic capture via AudioWorklet (ScriptProcessor fallback)
    useRecorder.js        recording hook: level meter, 20 s limit, silent-mic detection
    playback.js           "only one clip plays at a time"
  game/
    titleMatch.js         forgiving song-title matching (typos, case, punctuation)
    useClipSlot.js        clip state that frees object URLs
  components/             SingStep, MimicStep, ResultStep, AudioPlayer, RecordPanel, ...
test/                     node:test unit tests + synthetic singer
```

## Browser support

Recent Chrome, Edge, Firefox and Safari (MediaRecorder + Web Audio). Tested end-to-end in headless Chrome with a simulated microphone. Real-mic testing on Safari/Firefox is still recommended.
