import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TokenResponseDto } from '@/api/generated/auth';
import type { Language } from '@/i18n/languages';

type SessionUser = TokenResponseDto['user'];

export interface SessionState {
  /** unknown until the first refresh attempt answers (on page load). */
  status: 'unknown' | 'signedIn' | 'signedOut';
  /** Short-lived; kept in memory only. The refresh token is an httpOnly cookie. */
  accessToken: string | null;
  user: SessionUser | null;
  mustChangePassword: boolean;
}

const initialState: SessionState = {
  status: 'unknown',
  accessToken: null,
  user: null,
  mustChangePassword: false,
};

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    /** A sign-in or a token refresh answered. */
    sessionStarted(state, { payload }: PayloadAction<TokenResponseDto>) {
      state.status = 'signedIn';
      state.accessToken = payload.accessToken;
      state.user = payload.user;
      state.mustChangePassword = payload.mustChangePassword;
    },
    /** The account now holds this language. */
    sessionLanguageSaved(state, { payload }: PayloadAction<Language>) {
      if (state.user) state.user.language = payload;
    },
    /** Signed out, or the session could not be renewed. */
    sessionEnded() {
      return { ...initialState, status: 'signedOut' as const };
    },
  },
});

export const { sessionStarted, sessionLanguageSaved, sessionEnded } =
  sessionSlice.actions;
