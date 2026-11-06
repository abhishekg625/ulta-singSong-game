import { useCallback, useState } from 'react';

import Scoreboard from './components/Scoreboard';
import Stepper from './components/Stepper';
import SingStep from './components/SingStep';
import MimicStep from './components/MimicStep';
import ResultStep from './components/ResultStep';
import { createClip, reverseClip } from './audio/audioUtils';
import { compareClips } from './audio/compare';
import { pauseAll } from './audio/playback';
import { titlesMatch } from './game/titleMatch';
import { useClipSlot } from './game/useClipSlot';

// Minimum match score (0–100) the guesser needs to win the round.
const DIFFICULTY = {
  easy: { label: 'Easy', threshold: 40 },
  normal: { label: 'Normal', threshold: 55 },
  hard: { label: 'Hard', threshold: 70 },
};

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

export default function App() {
  const [players, setPlayers] = useState(['Player 1', 'Player 2']);
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [stage, setStage] = useState('sing'); // sing → mimic → result
  const [difficulty, setDifficulty] = useState('normal');

  const [songTitle, setSongTitle] = useState('');
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  const [original, setOriginal] = useClipSlot();
  const [reversed, setReversed] = useClipSlot();
  const [imitation, setImitation] = useClipSlot();
  const [flipped, setFlipped] = useClipSlot();

  const singer = (round - 1) % 2;
  const guesser = 1 - singer;
  const nameOf = (i) => players[i].trim() || `Player ${i + 1}`;

  const renamePlayer = (index, name) => setPlayers((prev) => prev.map((p, i) => (i === index ? name : p)));

  const handleOriginal = useCallback(
    (samples, sampleRate) => {
      const clip = createClip(samples, sampleRate);
      setOriginal(clip);
      setReversed(reverseClip(clip));
    },
    [setOriginal, setReversed],
  );

  const handleImitation = useCallback(
    (samples, sampleRate) => {
      const clip = createClip(samples, sampleRate);
      setImitation(clip);
      setFlipped(reverseClip(clip));
      setAnalyzeError(null);
    },
    [setImitation, setFlipped],
  );

  const clearAttempt = () => {
    setImitation(null);
    setFlipped(null);
    setGuess('');
    setResult(null);
    setAnalyzeError(null);
  };

  const goToMimic = () => {
    pauseAll();
    setStage('mimic');
  };

  const backToSinger = () => {
    pauseAll();
    clearAttempt();
    setStage('sing');
  };

  const reveal = async () => {
    if (!original || !flipped || analyzing) return;
    pauseAll();
    setAnalyzing(true);
    setAnalyzeError(null);
    await nextFrame(); // let "Comparing…" render before the CPU-heavy analysis

    try {
      const comparison = compareClips(original.samples, original.sampleRate, flipped.samples, flipped.sampleRate);
      const { threshold } = DIFFICULTY[difficulty];
      const won = comparison.score >= threshold;
      const titleCorrect = titlesMatch(songTitle, guess);

      const award = [0, 0];
      award[won ? guesser : singer] += 1;
      if (titleCorrect) award[guesser] += 1;

      setScores((prev) => prev.map((s, i) => s + award[i]));
      setResult({ ...comparison, won, threshold, titleCorrect, award });
      setStage('result');
    } catch {
      setAnalyzeError("Couldn't compare the recordings. Try recording your imitation again.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Only the guesser's final attempt counts, so undo this attempt's points.
  const retry = () => {
    pauseAll();
    if (result) setScores((prev) => prev.map((s, i) => s - result.award[i]));
    clearAttempt();
    setStage('mimic');
  };

  const nextRound = () => {
    pauseAll();
    clearAttempt();
    setOriginal(null);
    setReversed(null);
    setSongTitle('');
    setRound((r) => r + 1);
    setStage('sing');
  };

  const newGame = () => {
    if (!window.confirm('Start a new game? Scores will reset to 0.')) return;
    nextRound();
    setRound(1);
    setScores([0, 0]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            🔁
          </span>
          <div>
            <h1>Ulta Gaana</h1>
            <p className="muted">Sing it. Flip it. Sing it back.</p>
          </div>
        </div>
        <div className="topbar__controls">
          <div className="segmented" role="radiogroup" aria-label="Difficulty">
            {Object.entries(DIFFICULTY).map(([key, { label, threshold }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={difficulty === key}
                className={difficulty === key ? 'is-active' : undefined}
                onClick={() => setDifficulty(key)}
                title={`Need ${threshold}% match to win`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={newGame}>
            New game
          </button>
        </div>
      </header>

      <Scoreboard players={players} scores={scores} singer={singer} round={round} onRename={renamePlayer} />
      <Stepper stage={stage} />

      <main>
        {stage === 'sing' && (
          <SingStep
            singerName={nameOf(singer)}
            guesserName={nameOf(guesser)}
            original={original}
            reversed={reversed}
            songTitle={songTitle}
            onTitleChange={setSongTitle}
            onRecorded={handleOriginal}
            onContinue={goToMimic}
          />
        )}

        {stage === 'mimic' && (
          <MimicStep
            singerName={nameOf(singer)}
            guesserName={nameOf(guesser)}
            reversed={reversed}
            imitation={imitation}
            flipped={flipped}
            guess={guess}
            onGuessChange={setGuess}
            onRecorded={handleImitation}
            onReveal={reveal}
            onBack={backToSinger}
            analyzing={analyzing}
            error={analyzeError}
          />
        )}

        {stage === 'result' && result && (
          <ResultStep
            result={result}
            singerName={nameOf(singer)}
            guesserName={nameOf(guesser)}
            songTitle={songTitle}
            guess={guess}
            original={original}
            reversed={reversed}
            imitation={imitation}
            flipped={flipped}
            onRetry={retry}
            onNext={nextRound}
          />
        )}
      </main>

      <footer className="footer muted small">
        🔒 Recordings stay in this browser tab and are never uploaded. The match score is a fun estimate, not a
        judge&apos;s verdict.
      </footer>
    </div>
  );
}
