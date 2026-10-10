import { configureStore } from '@reduxjs/toolkit';
import { toastsReducer } from './toastsSlice.js';

export function createAppStore() {
  return configureStore({
    reducer: {
      toasts: toastsReducer,
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
