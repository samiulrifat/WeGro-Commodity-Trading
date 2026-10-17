import { createListenerMiddleware } from '@reduxjs/toolkit';
import { toast } from 'sonner';
import { authApi } from '@/api/generated/auth';
import { applyLanguage, i18n } from '@/i18n';
import { DEFAULT_LANGUAGE } from '@/i18n/languages';
import { storage } from '@/lib/storage';
import {
  LANGUAGE_KEY,
  languageApplied,
  languageChosen,
} from './language-slice';
import { sessionLanguageSaved, sessionStarted } from './session-slice';
import type { AppDispatch, RootState } from './store';

/**
 * Keeps the language on screen, on this device and on the person's account
 * in step:
 * - any change shows at once and is remembered on this device;
 * - a choice made while signed in is saved to the account;
 * - signing in takes the account's language, or saves the one chosen on the
 *   sign-in page if the account has none yet. Token renewals change nothing.
 */
export const languageListener = createListenerMiddleware();

const listen = languageListener.startListening.withTypes<
  RootState,
  AppDispatch
>();

// Show it, and remember it on this device.
for (const actionCreator of [languageChosen, languageApplied]) {
  listen({
    actionCreator,
    effect: async ({ payload }, api) => {
      storage.set(LANGUAGE_KEY, payload);
      try {
        await applyLanguage(payload);
      } catch {
        // Its words could not be fetched (offline): stay as before.
        const before = api.getOriginalState().language.current;
        if (api.getState().language.current === payload) {
          api.dispatch(languageApplied(before));
        }
      }
    },
  });
}

listen({
  actionCreator: languageChosen,
  effect: async ({ payload }, api) => {
    const { user, status } = api.getState().session;
    if (status !== 'signedIn' || !user || user.language === payload) return;
    const request = api.dispatch(
      authApi.endpoints.authUpdateMe.initiate({
        updateMeDto: { language: payload },
      }),
    );
    try {
      await request.unwrap();
      api.dispatch(sessionLanguageSaved(payload));
    } catch {
      toast.error(i18n.t('language.notSaved'));
    } finally {
      request.reset();
    }
  },
});

listen({
  actionCreator: sessionStarted,
  effect: ({ payload }, api) => {
    const before = api.getOriginalState().session;
    if (before.status === 'signedIn' && before.user?.id === payload.user.id) {
      return; // a renewal of the same session
    }
    const current = api.getState().language.current;
    const saved = payload.user.language;
    if (saved) {
      if (saved !== current) api.dispatch(languageApplied(saved));
    } else if (current !== DEFAULT_LANGUAGE) {
      api.dispatch(languageChosen(current));
    }
  },
});
