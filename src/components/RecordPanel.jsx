import { useRecorder } from '../audio/useRecorder';
import { formatTime } from '../audio/audioUtils';

/** Big record/stop button with a live mic level meter and countdown. */
export default function RecordPanel({ onRecorded, idleLabel, hasRecording, maxSeconds = 20 }) {
  const { status, elapsed, level, noSignal, error, start, stop } = useRecorder({ maxSeconds, onComplete: onRecorded });

  const recording = status === 'recording';
  const busy = status === 'starting' || status === 'processing';

  let label = hasRecording ? 'Record again' : idleLabel;
  if (status === 'starting') label = 'Waiting for microphone…';
  if (status === 'processing') label = 'Processing…';
  if (recording) label = 'Stop recording';

  return (
    <div className="recorder">
      <button
        type="button"
        className={`rec-btn${recording ? ' rec-btn--live' : ''}${hasRecording && !recording ? ' rec-btn--again' : ''}`}
        onClick={recording ? stop : start}
        disabled={busy}
        aria-pressed={recording}
      >
        <span className="rec-btn__dot" aria-hidden="true" />
        {label}
      </button>

      {recording && (
        <div className="recorder__live">
          <div className="meter" aria-hidden="true">
            <div className="meter__fill" style={{ transform: `scaleX(${level})` }} />
          </div>
          <span className="recorder__time" aria-live="off">
            {formatTime(elapsed)} / {formatTime(maxSeconds)}
          </span>
        </div>
      )}

      {recording && noSignal && (
        <p className="warning" role="status">
          🔇 We can&apos;t hear anything from your mic. Check that it isn&apos;t muted and the right input device
          is selected.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
