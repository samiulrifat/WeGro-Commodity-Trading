// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@/i18n';
import { captureInstallOffer, useInstall } from './install';
import { InstallApp } from './install-app';
import { OfflineBanner } from './offline-banner';
import { UpdatePrompt } from './update-prompt';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  update: vi.fn(() => Promise.resolve()),
  registration: undefined as { update: () => Promise<void> } | undefined,
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: {
    onRegisteredSW: (url: string, r: unknown) => void;
  }) => {
    options.onRegisteredSW('/sw.js', sw.registration);
    return {
      needRefresh: [sw.needRefresh, () => {}],
      updateServiceWorker: sw.update,
    };
  },
}));
const toasts = vi.hoisted(() => {
  const toast = Object.assign(
    vi.fn(() => 7),
    { dismiss: vi.fn() },
  );
  return { toast };
});
vi.mock('sonner', () => toasts);

beforeAll(async () => {
  await initI18n('en');
  captureInstallOffer();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const installButton = () => (
  <InstallApp render={(open) => <button onClick={open}>Install App</button>} />
);

/** Chrome's offer to install, answered `outcome`. */
function offer(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('installing the app', () => {
  it('offers nothing where the browser cannot install it', () => {
    render(installButton());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the browser’s own dialog when it offers, once', async () => {
    render(installButton());
    const event = offer('accepted');
    await userEvent.click(screen.getByRole('button', { name: 'Install App' }));
    expect(event.prompt).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('does nothing when asked to install with no offer left', async () => {
    const { result } = renderHook(() => useInstall());
    expect(result.current.canPrompt).toBe(false);
    await expect(result.current.prompt()).resolves.toBeUndefined();
  });

  it('hides the button once the app is installed some other way', () => {
    render(installButton());
    offer('dismissed');
    expect(screen.getByRole('button')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows iPhone and iPad owners how to add it from Safari', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    );
    render(installButton());
    await userEvent.click(screen.getByRole('button', { name: 'Install App' }));
    expect(screen.getByText('In Safari, tap the Share button.')).toBeTruthy();
    expect(screen.getByText('Choose “Add to Home Screen”.')).toBeTruthy();
  });

  it('counts an iPad that calls itself a Mac, but not once added to the home screen', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    render(installButton());
    expect(screen.getByRole('button')).toBeTruthy();
    cleanup();
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    render(installButton());
    expect(screen.queryByRole('button')).toBeNull();
    Reflect.deleteProperty(navigator, 'standalone');
    Reflect.deleteProperty(navigator, 'maxTouchPoints');
  });
});

describe('the offline banner', () => {
  it('shows while there is no connection', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });
});

describe('a new version', () => {
  it('is offered as a reload the person chooses, and looked for every hour', () => {
    const every = vi.spyOn(globalThis, 'setInterval');
    sw.registration = { update: vi.fn(() => Promise.reject(new Error('x'))) };
    sw.needRefresh = true;
    const { unmount } = render(<UpdatePrompt />);
    expect(toasts.toast).toHaveBeenCalledWith(
      'A new version of WeGro is ready.',
      expect.objectContaining({ duration: Infinity }),
    );
    const { action } = (
      toasts.toast.mock.calls[0] as unknown as [
        string,
        { action: { label: string; onClick: () => void } },
      ]
    )[1];
    expect(action.label).toBe('Reload');
    action.onClick();
    expect(sw.update).toHaveBeenCalledWith(true);

    const [check, period] = every.mock.calls[0]!;
    expect(period).toBe(60 * 60 * 1000);
    (check as () => void)();
    expect(sw.registration.update).toHaveBeenCalled();
    unmount();
    expect(toasts.toast.dismiss).toHaveBeenCalledWith(7);
  });

  it('says nothing until one is ready', () => {
    toasts.toast.mockClear();
    sw.registration = undefined;
    sw.needRefresh = false;
    render(<UpdatePrompt />);
    expect(toasts.toast).not.toHaveBeenCalled();
  });
});
