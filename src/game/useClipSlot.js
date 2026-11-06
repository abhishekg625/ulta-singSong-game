import { useCallback, useEffect, useRef, useState } from 'react';
import { releaseClip } from '../audio/audioUtils';

/**
 * State for one audio clip that frees the previous clip's object URL whenever
 * it is replaced (and on unmount), so long sessions don't leak memory.
 */
export function useClipSlot() {
  const [clip, setClip] = useState(null);
  const current = useRef(null);

  const update = useCallback((next) => {
    if (current.current && current.current !== next) releaseClip(current.current);
    current.current = next;
    setClip(next);
  }, []);

  useEffect(() => () => releaseClip(current.current), []);

  return [clip, update];
}
