import { configureStore } from '@reduxjs/toolkit';
import { initPrefs, resolveMode } from '../context/theme.utils.js';
import { createPreferencesState, preferencesReducer } from './preferencesSlice.js';
import { toastsReducer } from './toastsSlice.js';

export function createAppStore() {
  const prefs = initPrefs();
  return configureStore({
    reducer: {
      toasts: toastsReducer,
      preferences: preferencesReducer,
    },
    preloadedState: {
      preferences: createPreferencesState(prefs, resolveMode(prefs.mode)),
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
