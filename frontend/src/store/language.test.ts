import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenResponseDto } from '@/api/generated/auth';
import type { Language } from '@/i18n/languages';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const signIn = (language: Language | null, id = 'u1'): TokenResponseDto => ({
  accessToken: 't',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id, role: 'farmer', status: 'verified', language },
});

/**
 * The language rules through a fresh store each time: what is shown, what
 * this device remembers, and what is saved to the account.
 */
describe('language', () => {
  let saved: Map<string, string>;
  let patches: Array<{ url: string; body: unknown }>;
  let failPatch: boolean;

  async function start(remembered?: Language) {
    if (remembered) saved.set('wegro.language', remembered);
    vi.resetModules();
    const { store } = await import('@/store/store');
    const { initI18n, i18n } = await import('@/i18n');
    await initI18n(store.getState().language.current);
    const slice = await import('./language-slice');
    const session = await import('./session-slice');
    return { store, i18n, ...slice, ...session };
  }

  beforeEach(() => {
    saved = new Map();
    patches = [];
    failPatch = false;
    toastError.mockClear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (req: Request) => {
        const body: unknown = await req.json();
        patches.push({ url: new URL(req.url).pathname, body });
        if (failPatch) return new Response(null, { status: 503 });
        return Response.json({ data: { id: 'u1', ...(body as object) } });
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens in English, and in the language this device last used', async () => {
    const first = await start();
    expect(first.store.getState().language.current).toBe('en');
    expect(first.i18n.resolvedLanguage).toBe('en');
    const again = await start('bn');
    expect(again.i18n.resolvedLanguage).toBe('bn');
  });

  it('switches at once when signed out, remembered here only', async () => {
    const { store, i18n, languageChosen } = await start();
    store.dispatch(languageChosen('bn'));
    await vi.waitFor(() => expect(i18n.resolvedLanguage).toBe('bn'));
    expect(saved.get('wegro.language')).toBe('bn');
    expect(patches).toEqual([]);
  });

  it('saves a choice made while signed in to the account', async () => {
    const { store, languageChosen, sessionStarted } = await start();
    store.dispatch(sessionStarted(signIn('en')));
    store.dispatch(languageChosen('bn'));
    await vi.waitFor(() =>
      expect(store.getState().session.user?.language).toBe('bn'),
    );
    expect(patches).toEqual([
      { url: '/api/auth/me', body: { language: 'bn' } },
    ]);
  });

  it('takes the account’s language on sign-in', async () => {
    const { store, i18n, sessionStarted } = await start();
    store.dispatch(sessionStarted(signIn('bn')));
    await vi.waitFor(() => expect(i18n.resolvedLanguage).toBe('bn'));
    expect(saved.get('wegro.language')).toBe('bn');
    expect(patches).toEqual([]);
  });

  it('saves the sign-in page’s choice to an account that has none', async () => {
    const { store, sessionStarted } = await start('bn');
    store.dispatch(sessionStarted(signIn(null)));
    await vi.waitFor(() =>
      expect(patches).toEqual([
        { url: '/api/auth/me', body: { language: 'bn' } },
      ]),
    );
  });

  it('leaves an English device and an unset account alone', async () => {
    const { store, sessionStarted } = await start();
    store.dispatch(sessionStarted(signIn(null)));
    await new Promise((r) => setTimeout(r, 20));
    expect(patches).toEqual([]);
  });

  it('is not undone by a token renewal', async () => {
    const { store, i18n, languageChosen, sessionStarted } = await start();
    store.dispatch(sessionStarted(signIn('en')));
    store.dispatch(languageChosen('bn'));
    // A renewal answered with the account as it was before the save.
    store.dispatch(sessionStarted(signIn('en')));
    await vi.waitFor(() => expect(patches).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(i18n.resolvedLanguage).toBe('bn');
  });

  it('keeps the choice on this device and says so when saving fails', async () => {
    failPatch = true;
    const { store, i18n, languageChosen, sessionStarted } = await start();
    store.dispatch(sessionStarted(signIn('en')));
    store.dispatch(languageChosen('bn'));
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'আপনার ভাষা অ্যাকাউন্টে সংরক্ষণ করা যায়নি। এটি শুধু এই ডিভাইসে প্রযোজ্য।',
    );
    expect(i18n.resolvedLanguage).toBe('bn');
    expect(store.getState().session.user?.language).toBe('en');
  });
});
