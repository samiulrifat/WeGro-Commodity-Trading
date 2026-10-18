import { useSyncExternalStore } from 'react';

/** Chrome's install offer (not in TypeScript's DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Keeps the browser's install offer for our own button. Call once, before
 * the app renders: the browser makes the offer early, and only once.
 */
export function captureInstallOffer(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    emit();
  });
}

const installed = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhones and iPads make no offer: people add the app from Safari's Share menu. */
const apple = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export interface Install {
  /** The browser offers to install: our button opens its dialog. */
  canPrompt: boolean;
  /** An iPhone or iPad, not installed yet: show how to add it. */
  showAppleSteps: boolean;
  prompt(): Promise<void>;
}

export function useInstall(): Install {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => offer,
    () => null,
  );
  return {
    canPrompt: current !== null,
    showAppleSteps: current === null && apple() && !installed(),
    async prompt() {
      if (!offer) return;
      await offer.prompt();
      await offer.userChoice;
      offer = null; // an offer can be used only once
      emit();
    },
  };
}
