import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../audio/audioUtils';
import { playExclusive, releasePlayback } from '../audio/playback';

const EMPTY_PEAKS = new Array(56).fill(0.08);
const SEEK_STEP_SECONDS = 1;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}

/** Play/pause button + clickable waveform for one clip. */
export default function AudioPlayer({ clip, label, icon, tone = 'default' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  // New clip → start from the top.
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
  }, [clip?.url]);

  // Smooth progress while playing (timeupdate only fires ~4x/second).
  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    const tick = () => {
      if (audioRef.current) setPosition(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Stop playback if this player disappears.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        releasePlayback(audio);
      }
    };
  }, [clip?.url]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await playExclusive(audio);
    } catch (err) {
      // AbortError just means another play/pause interrupted this one.
      if (err?.name !== 'AbortError') setPlaying(false);
    }
  };

  const seekTo = (seconds) => {
    const audio = audioRef.current;
    if (!audio || !clip) return;
    const clamped = Math.min(clip.duration, Math.max(0, seconds));
    audio.currentTime = clamped;
    setPosition(clamped);
  };

  const handleWaveClick = (event) => {
    if (!clip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekTo(((event.clientX - rect.left) / rect.width) * clip.duration);
  };

  const handleWaveKey = (event) => {
    if (event.key === 'ArrowRight') seekTo(position + SEEK_STEP_SECONDS);
    else if (event.key === 'ArrowLeft') seekTo(position - SEEK_STEP_SECONDS);
    else if (event.key === ' ' || event.key === 'Enter') toggle();
    else return;
    event.preventDefault();
  };

  const peaks = clip?.peaks ?? EMPTY_PEAKS;
  const progress = clip ? Math.min(1, position / clip.duration) : 0;

  return (
    <div className={`player player--${tone}${clip ? '' : ' player--empty'}`}>
      <button
        type="button"
        className="player__toggle"
        onClick={toggle}
        disabled={!clip}
        aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="player__body">
        <div className="player__meta">
          <span className="player__label">
            {icon && <span aria-hidden="true">{icon} </span>}
            {label}
          </span>
          <span className="player__time">
            {formatTime(position)} / {formatTime(clip?.duration ?? 0)}
          </span>
        </div>
        <div
          className="player__wave"
          role="slider"
          tabIndex={clip ? 0 : -1}
          aria-label={`Seek ${label}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(clip?.duration ?? 0)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatTime(position)} of ${formatTime(clip?.duration ?? 0)}`}
          onClick={handleWaveClick}
          onKeyDown={handleWaveKey}
        >
          {peaks.map((peak, i) => (
            <span
              key={i}
              className={(i + 0.5) / peaks.length <= progress ? 'is-played' : undefined}
              style={{ height: `${14 + peak * 86}%` }}
            />
          ))}
        </div>
      </div>

      {clip && (
        <audio
          ref={audioRef}
          src={clip.url}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
        />
      )}
    </div>
  );
}
