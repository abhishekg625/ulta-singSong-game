import AudioPlayer from './AudioPlayer';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreDial({ score, threshold, won }) {
  const thresholdAngle = (threshold / 100) * 360 - 90;
  const rad = (thresholdAngle * Math.PI) / 180;
  const tick = (r) => [60 + r * Math.cos(rad), 60 + r * Math.sin(rad)];
  const [x1, y1] = tick(RADIUS - 9);
  const [x2, y2] = tick(RADIUS + 9);

  return (
    <div className={`dial ${won ? 'dial--win' : 'dial--lose'}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Match score ${score} percent, ${threshold} percent needed to win`}>
        <circle className="dial__track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="dial__value"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
          transform="rotate(-90 60 60)"
        />
        <line className="dial__tick" x1={x1} y1={y1} x2={x2} y2={y2} />
      </svg>
      <div className="dial__label" aria-hidden="true">
        <strong>{score}%</strong>
        <span>match</span>
      </div>
    </div>
  );
}

function Bar({ label, value, hint }) {
  return (
    <div className="bar">
      <div className="bar__head">
        <span>{label}</span>
        <span className="muted">{value}%</span>
      </div>
      <div className="bar__track" title={hint}>
        <div className="bar__fill" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
    </div>
  );
}

export default function ResultStep({
  result,
  singerName,
  guesserName,
  songTitle,
  guess,
  original,
  reversed,
  imitation,
  flipped,
  onRetry,
  onNext,
}) {
  const { won, score, threshold, titleCorrect } = result;
  const winner = won ? guesserName : singerName;

  return (
    <section className="card result">
      <div className={`verdict ${won ? 'verdict--win' : 'verdict--lose'}`} role="status">
        <div className="verdict__emoji" aria-hidden="true">
          {won ? '🏆' : '😵‍💫'}
        </div>
        <h2>{winner} wins the round!</h2>
        <p>
          {won
            ? `${guesserName} sang it backwards well enough to bring the song back.`
            : `${guesserName}'s flipped-back version didn't match closely enough. ${singerName} stumped them!`}
        </p>
      </div>

      <div className="score-row">
        <ScoreDial score={score} threshold={threshold} won={won} />
        <div className="breakdown">
          <Bar label="🎶 Melody" value={result.melody} hint="Did the tune go up and down in the same places?" />
          <Bar label="🥁 Rhythm" value={result.rhythm} hint="Were the loud and quiet parts in the same places?" />
          <Bar label="🗣️ Sound" value={result.sound} hint="Did the vowels and syllables sound alike?" />
          <p className="muted small">Needed {threshold}% to win.</p>
        </div>
      </div>

      {result.reason === 'too-short' && (
        <p className="error">One of the recordings was too short or too quiet to compare properly.</p>
      )}

      <div className="reveal">
        <div>
          <span className="muted">The song was</span>
          <strong>{songTitle.trim() || 'a mystery (no title given)'}</strong>
        </div>
        {guess.trim() && (
          <div>
            <span className="muted">{guesserName} guessed</span>
            <strong>
              {guess.trim()} {titleCorrect ? '✅ +1 bonus' : '❌'}
            </strong>
          </div>
        )}
      </div>

      <h3 className="section-title">Hear the difference</h3>
      <div className="players">
        <AudioPlayer clip={original} label={`${singerName}'s original`} icon="🎵" />
        <AudioPlayer clip={flipped} label={`${guesserName}'s flipped back`} icon="✨" tone="accent" />
        <AudioPlayer clip={reversed} label={`${singerName} reversed`} icon="🔁" />
        <AudioPlayer clip={imitation} label={`${guesserName}'s imitation`} icon="🗣️" />
      </div>

      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          ↺ {guesserName} tries again
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          Next round, swap roles →
        </button>
      </div>
    </section>
  );
}
