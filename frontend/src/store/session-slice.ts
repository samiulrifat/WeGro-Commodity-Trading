import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TokenResponseDto } from '@/api/generated/auth';
import type { Language } from '@/i18n/languages';

type SessionUser = TokenResponseDto['user'];

/** Who last signed in on this device: no token, nothing secret. */
export interface RememberedUser {
  user: SessionUser;
  mustChangePassword: boolean;
}

export interface SessionState {
  /**
   * unknown until the first refresh attempt answers (on page load); offline
   * when the server could not be reached and the app opened for the person
   * who last signed in here, without a token, until it can reconnect.
   */
  status: 'unknown' | 'signedIn' | 'signedOut' | 'offline';
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
    /** No connection: open for the last person here, without a token. */
    sessionOffline(state, { payload }: PayloadAction<RememberedUser>) {
      state.status = 'offline';
      state.accessToken = null;
      state.user = payload.user;
      state.mustChangePassword = payload.mustChangePassword;
    },
    /** Signed out, or the session could not be renewed. */
    sessionEnded() {
      return { ...initialState, status: 'signedOut' as const };
    },
  },
});

export const {
  sessionStarted,
  sessionLanguageSaved,
  sessionOffline,
  sessionEnded,
} = sessionSlice.actions;
