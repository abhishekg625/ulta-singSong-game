import { useState } from 'react';
import AudioPlayer from './AudioPlayer';
import RecordPanel from './RecordPanel';

export default function SingStep({ singerName, guesserName, original, reversed, songTitle, onTitleChange, onRecorded, onContinue }) {
  const [showTitle, setShowTitle] = useState(false);

  return (
    <section className="card">
      <header className="card__head">
        <span className="badge badge--singer">🎤 {singerName}&apos;s turn</span>
        <h2>Sing a song</h2>
        <p className="muted">
          Sing 5–15 seconds of any song. Then listen to it backwards. {guesserName}, no peeking!
        </p>
      </header>

      <div className="field">
        <label htmlFor="song-title">
          Song title <span className="muted">(secret, revealed at the end)</span>
        </label>
        <div className="field__row">
          <input
            id="song-title"
            className={showTitle ? undefined : 'is-secret'}
            value={songTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={80}
            placeholder="e.g. Tum Hi Ho"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowTitle((v) => !v)}>
            {showTitle ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <RecordPanel onRecorded={onRecorded} idleLabel="Start singing" hasRecording={Boolean(original)} />

      {original && (
        <div className="players">
          <AudioPlayer clip={original} label="Your original" icon="🎵" />
          <AudioPlayer clip={reversed} label="Reversed" icon="🔁" tone="accent" />
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={!original} onClick={onContinue}>
          Lock it in &amp; pass to {guesserName} →
        </button>
      </div>
    </section>
  );
}
