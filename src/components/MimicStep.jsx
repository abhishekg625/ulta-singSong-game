import AudioPlayer from './AudioPlayer';
import RecordPanel from './RecordPanel';

export default function MimicStep({
  singerName,
  guesserName,
  reversed,
  imitation,
  flipped,
  guess,
  onGuessChange,
  onRecorded,
  onReveal,
  onBack,
  analyzing,
  error,
}) {
  return (
    <section className="card">
      <header className="card__head">
        <span className="badge badge--guesser">🕵️ {guesserName}&apos;s turn</span>
        <h2>Sing it backwards</h2>
        <ol className="howto">
          <li>Play {singerName}&apos;s mystery clip. It&apos;s reversed.</li>
          <li>Record yourself copying exactly what you hear, gibberish and all.</li>
          <li>We flip your recording. Nail it and the real song comes back!</li>
        </ol>
      </header>

      <AudioPlayer clip={reversed} label="Mystery clip (reversed)" icon="🔁" tone="accent" />

      <RecordPanel onRecorded={onRecorded} idleLabel="Record your imitation" hasRecording={Boolean(imitation)} />

      {imitation && (
        <div className="players">
          <AudioPlayer clip={imitation} label="Your imitation" icon="🗣️" />
          <AudioPlayer clip={flipped} label="Flipped back" icon="✨" tone="accent" />
        </div>
      )}

      <div className="field">
        <label htmlFor="song-guess">
          What song is it? <span className="muted">(optional, +1 bonus point)</span>
        </label>
        <input
          id="song-guess"
          value={guess}
          onChange={(e) => onGuessChange(e.target.value)}
          maxLength={80}
          placeholder="Your guess"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={onBack} disabled={analyzing}>
          ← {singerName} re-records
        </button>
        <button type="button" className="btn btn--primary" disabled={!flipped || analyzing} onClick={onReveal}>
          {analyzing ? 'Comparing…' : 'Reveal the result 🎉'}
        </button>
      </div>
    </section>
  );
}
