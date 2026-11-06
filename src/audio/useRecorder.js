import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext } from './audioUtils';
import { startCapture } from './micCapture';
import { trimSilence } from './compare';
import { pauseAll } from './playback';

const MIN_SECONDS = 0.6;
const SILENT_DB = -65; // a whole take quieter than this means the mic sent nothing
const NO_SIGNAL_HINT_AFTER_SECONDS = 2;

const MESSAGES = {
  insecure: 'The microphone only works on a secure page (https:// or http://localhost) in a modern browser.',
  unsupported: 'Your browser cannot record audio here. Open the game in a recent Chrome, Edge, Firefox or Safari.',
  blocked:
    'Microphone access is blocked. Click the mic/lock icon in the address bar and allow the microphone. ' +
    'On a Mac, also enable your browser in System Settings → Privacy & Security → Microphone.',
  noDevice: 'No microphone found. Connect one and try again.',
  busy: 'Your microphone is being used by another app. Close it and try again.',
  noAudio: "The browser's audio engine didn't deliver any sound. Reload the page and try again.",
  silent:
    'Your microphone only recorded silence. Check that the right input is selected and not muted ' +
    '(Mac: System Settings → Sound → Input), and that your browser is allowed in Privacy & Security → Microphone. ' +
    "If you opened the game inside VS Code, open it in Chrome or Safari instead.",
  tooShort: 'We only caught a tiny bit of sound. Sing a little louder or longer and try again.',
};

class RecorderMessage extends Error {}

function describeError(err) {
  if (err instanceof RecorderMessage) return err.message;
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return MESSAGES.blocked;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return MESSAGES.noDevice;
    case 'NotReadableError':
      return MESSAGES.busy;
    default:
      return err?.message || 'Something went wrong while recording. Please try again.';
  }
}

const levelToDb = (chunk) => {
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  return 20 * Math.log10(Math.sqrt(sum / Math.max(1, chunk.length)) + 1e-9);
};

/**
 * Records from the microphone and hands back trimmed mono samples.
 *
 * status: 'idle' | 'starting' | 'recording' | 'processing'
 * noSignal: true while recording if the mic has been silent for a couple of seconds
 */
export function useRecorder({ maxSeconds = 20, onComplete }) {
  const [status, setStatus] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [noSignal, setNoSignal] = useState(false);
  const [error, setError] = useState(null);

  const session = useRef(null);
  const mounted = useRef(true);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  /** Stops the timer and releases the microphone. Returns the ended session. */
  const releaseSession = useCallback(() => {
    const s = session.current;
    if (!s) return null;
    session.current = null;
    clearInterval(s.timer);
    s.stream.getTracks().forEach((track) => track.stop());
    return s;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseSession()?.capture.abort();
    };
  }, [releaseSession]);

  const stop = useCallback(async () => {
    const s = session.current;
    if (!s || s.stopping) return;
    s.stopping = true;
    clearInterval(s.timer);
    setStatus('processing');
    setLevel(0);
    setNoSignal(false);

    try {
      const samples = await s.capture.stop();
      releaseSession();
      if (!mounted.current) return;

      const { sampleRate } = s.capture;
      if (samples.length === 0) throw new RecorderMessage(MESSAGES.noAudio);
      if (s.peakDb < SILENT_DB) throw new RecorderMessage(MESSAGES.silent);

      const trimmed = trimSilence(samples, sampleRate);
      if (trimmed.length / sampleRate < MIN_SECONDS) throw new RecorderMessage(MESSAGES.tooShort);

      onCompleteRef.current?.(trimmed, sampleRate);
    } catch (err) {
      releaseSession();
      if (mounted.current) setError(describeError(err));
    } finally {
      if (mounted.current) {
        setStatus('idle');
        setElapsed(0);
      }
    }
  }, [releaseSession]);

  const start = useCallback(async () => {
    if (status !== 'idle') return;
    setError(null);
    setNoSignal(false);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(MESSAGES.insecure);
      return;
    }

    setStatus('starting');
    pauseAll();
    let stream = null;
    try {
      const ctx = getAudioContext();
      // Resume inside the click handler: browsers only allow audio after a user gesture.
      if (ctx.state !== 'running') await ctx.resume();

      stream = await navigator.mediaDevices.getUserMedia({
        // Noise suppression is tuned for speech and can swallow sustained sung notes.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const s = { stream, capture: null, timer: null, peakDb: -Infinity, stopping: false };
      let lastPaint = 0;
      s.capture = await startCapture(ctx, stream, (chunk) => {
        const db = levelToDb(chunk);
        if (db > s.peakDb) s.peakDb = db;
        const now = performance.now();
        if (now - lastPaint > 60) {
          lastPaint = now;
          setLevel(Math.min(1, Math.max(0, (db + 60) / 50)));
        }
      });
      if (ctx.state !== 'running') await ctx.resume();
      if (!mounted.current) {
        s.capture.abort();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      session.current = s;
      const startedAt = performance.now();
      s.timer = setInterval(() => {
        const seconds = (performance.now() - startedAt) / 1000;
        setElapsed(seconds);
        setNoSignal(seconds >= NO_SIGNAL_HINT_AFTER_SECONDS && s.peakDb < SILENT_DB);
        if (seconds >= maxSeconds) stop();
      }, 100);

      setElapsed(0);
      setStatus('recording');
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      session.current = null;
      if (mounted.current) {
        setStatus('idle');
        setError(err?.name === 'NotSupportedError' ? MESSAGES.unsupported : describeError(err));
      }
    }
  }, [status, maxSeconds, stop]);

  return { status, elapsed, level, noSignal, error, start, stop };
}
