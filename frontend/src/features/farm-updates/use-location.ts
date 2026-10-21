import { useCallback, useEffect, useState } from 'react';
import type { DraftLocation } from './draft';

export type LocationState =
  | { status: 'locating' }
  | { status: 'found'; location: DraftLocation }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** Degrees as the server keeps them: 6 decimals (about 10 cm). */
export const toDegrees = (n: number) => n.toFixed(6);

/** Metres of accuracy as a whole number the server accepts. */
export const toAccuracy = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? null : Math.min(100_000, Math.round(n));

/**
 * Where the phone is, found once when the form opens (GPS works without
 * internet). `retry` asks again, for example after allowing location.
 */
export function useCurrentLocation(enabled = true): {
  state: LocationState;
  retry: () => void;
} {
  const supported = 'geolocation' in navigator;
  const [state, setState] = useState<LocationState>(
    supported ? { status: 'locating' } : { status: 'unavailable' },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !supported) return;
    let live = true;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        live &&
        setState({
          status: 'found',
          location: {
            latitude: toDegrees(p.coords.latitude),
            longitude: toDegrees(p.coords.longitude),
            accuracyMeters: toAccuracy(p.coords.accuracy),
          },
        }),
      (e) =>
        live &&
        setState({
          status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable',
        }),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );
    return () => {
      live = false;
    };
  }, [enabled, supported, attempt]);
  const retry = useCallback(() => {
    if (!supported) return;
    setState({ status: 'locating' });
    setAttempt((a) => a + 1);
  }, [supported]);
  return { state, retry };
}
