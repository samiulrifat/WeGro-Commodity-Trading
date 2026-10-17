/**
 * localStorage that never throws: private windows and blocked site data
 * make it unavailable, and then nothing is remembered on this device.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      // Not remembered; the app still works.
    }
  },
};
