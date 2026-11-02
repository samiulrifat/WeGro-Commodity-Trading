// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@/i18n';
import { fakeServer } from '@/test/render';
import { App } from './App';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    updateServiceWorker: () => Promise.resolve(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the app', () => {
  it('opens on the address it was loaded at', async () => {
    await initI18n('en');
    localStorage.clear();
    window.history.replaceState(null, '', '/sign-in');
    fakeServer(() => undefined);
    render(<App />);
    expect(await screen.findByText('Welcome Back')).toBeTruthy();
  });
});
