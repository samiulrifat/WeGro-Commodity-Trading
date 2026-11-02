// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const started = vi.hoisted(() => ({
  install: vi.fn(),
  watch: vi.fn(),
  early: vi.fn(),
  i18n: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/app/App', () => ({ App: () => <p>The app</p> }));
vi.mock('@/app/pwa/install', () => ({ captureInstallOffer: started.install }));
vi.mock('@/app/session', () => ({ watchConnection: started.watch }));
vi.mock('@/app/startup', () => ({ startEarly: started.early }));
vi.mock('@/i18n', () => ({ initI18n: started.i18n }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('opening the app', () => {
  it('gets ready before the first paint, then draws the app, in English if its words fail', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    started.i18n.mockImplementationOnce(() =>
      Promise.reject(new Error('offline')),
    );
    await import('./main');
    expect(started.install).toHaveBeenCalled();
    expect(started.watch).toHaveBeenCalled();
    expect(started.early).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(document.getElementById('root')!.textContent).toBe('The app'),
    );
  });

  it('refuses to start without its root element', async () => {
    await expect(import('./main')).rejects.toThrow(
      'index.html has no #root element',
    );
  });
});
