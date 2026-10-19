import { useEffect, useState } from 'react';

/**
 * Seconds left until `at` (epoch ms), ticking each second. `since` is when
 * the wait began (when the code was sent), so a clock that stopped ticking
 * earlier never shows more than the whole wait.
 */
export function useSecondsUntil(at: number, since: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (at <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at]);
  return Math.max(0, Math.ceil((at - Math.max(now, since)) / 1000));
}
