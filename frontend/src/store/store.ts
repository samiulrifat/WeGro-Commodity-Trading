import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@/api/base-api';
import { connectSession } from '@/api/http';
import { sessionEnded, sessionSlice, sessionStarted } from './session-slice';

export const store = configureStore({
  reducer: {
    [sessionSlice.name]: sessionSlice.reducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

// Requests read the token from here; a renewal or a failed one updates it.
connectSession({
  getToken: () => store.getState().session.accessToken,
  onRenewed: (tokens) => store.dispatch(sessionStarted(tokens)),
  onEnded: () => {
    store.dispatch(sessionEnded());
    // Nothing of the previous person's data may stay on screen.
    store.dispatch(baseApi.util.resetApiState());
  },
});

// Refetch on returning to the tab and on reconnecting (field officers' phones).
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
