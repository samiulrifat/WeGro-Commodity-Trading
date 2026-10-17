import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/i18n/languages';
import { storage } from '@/lib/storage';

export const LANGUAGE_KEY = 'wegro.language';

/** This device's last language, so the sign-in page opens in it too. */
export const storedLanguage = (): Language => {
  const value = storage.get(LANGUAGE_KEY);
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
};

export interface LanguageState {
  current: Language;
}

export const languageSlice = createSlice({
  name: 'language',
  initialState: (): LanguageState => ({ current: storedLanguage() }),
  reducers: {
    /** The person picked it here: saved to their account when signed in. */
    languageChosen(state, { payload }: PayloadAction<Language>) {
      state.current = payload;
    },
    /** Taken from their account on sign-in: nothing to save. */
    languageApplied(state, { payload }: PayloadAction<Language>) {
      state.current = payload;
    },
  },
});

export const { languageChosen, languageApplied } = languageSlice.actions;
