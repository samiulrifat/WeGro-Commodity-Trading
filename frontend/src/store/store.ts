import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@/api/base-api';
import { connectSession } from '@/api/http';
import { languageListener } from './language-listener';
import { languageSlice } from './language-slice';
import { sessionListener } from './session-listener';
import { sessionEnded, sessionSlice, sessionStarted } from './session-slice';

export const store = configureStore({
  reducer: {
    [sessionSlice.name]: sessionSlice.reducer,
    [languageSlice.name]: languageSlice.reducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) =>
    getDefault()
      .prepend(languageListener.middleware, sessionListener.middleware)
      .concat(baseApi.middleware),
});

// Requests read the token from here; a renewal or a failed one updates it.
connectSession({
  getToken: () => store.getState().session.accessToken,
  onRenewed: (tokens) => store.dispatch(sessionStarted(tokens)),
  onEnded: () => {
    // Refused while signed in: it expired or was ended elsewhere. Refused on
    // a page load: there simply was no session.
    const { status } = store.getState().session;
    const wasOpen = status === 'signedIn' || status === 'offline';
    store.dispatch(sessionEnded(wasOpen ? 'expired' : undefined));
    // Nothing of the previous person's data may stay on screen.
    store.dispatch(baseApi.util.resetApiState());
  },
});

// Refetch on returning to the tab and on reconnecting (field officers' phones).
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
