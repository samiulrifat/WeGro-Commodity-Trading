import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', async (original) => ({
  ...(await original<typeof import('@/i18n')>()),
  // Bengali cannot be fetched (offline); English is always there.
  applyLanguage: vi.fn((lang: string) =>
    lang === 'bn' ? Promise.reject(new Error('offline')) : Promise.resolve(),
  ),
}));

afterEach(() => vi.unstubAllGlobals());

describe('choosing a language offline', () => {
  it('stays in the language shown when the new one’s words cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    const { store } = await import('./store');
    const { languageChosen } = await import('./language-slice');
    expect(store.getState().language.current).toBe('en');
    store.dispatch(languageChosen('bn'));
    await vi.waitFor(() =>
      expect(store.getState().language.current).toBe('en'),
    );
  });
});
