import { storage } from './storage';

/**
 * Small lists kept on this device so work can start without internet (an
 * officer's projects). Each person's apart; everything goes at sign-out.
 */
const PREFIX = 'wegro.cache.';

interface Entry<T> {
  savedAt: number;
  value: T;
}

export const deviceCache = {
  get<T>(name: string, ownerId: string): Entry<T> | null {
    const raw = storage.get(`${PREFIX}${name}.${ownerId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Entry<T>;
    } catch {
      return null;
    }
  },

  set<T>(name: string, ownerId: string, value: T): void {
    const entry: Entry<T> = { savedAt: Date.now(), value };
    storage.set(`${PREFIX}${name}.${ownerId}`, JSON.stringify(entry));
  },

  /** At sign-out: nobody's lists stay on the device. */
  clearAll(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((k) => storage.remove(k));
    } catch {
      // Storage unavailable: nothing was kept.
    }
  },
};
