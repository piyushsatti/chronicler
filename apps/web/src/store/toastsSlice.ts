import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ToastTone } from '../components/primitives/Toast.js';

export type { ToastTone };

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  /** When set, ToastHost dismisses this toast on its own. */
  durationMs?: number;
  /** New on every add, including a same-id replace, so the dismiss timer restarts. */
  revision: number;
};

type ToastsState = {
  items: Toast[];
  generation: number;
};

const initialState: ToastsState = { items: [], generation: 0 };

let seq = 0;
let revision = 0;

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast(
      state,
      action: PayloadAction<{
        message: string;
        tone?: ToastTone;
        generation: number;
        id?: string;
        durationMs?: number;
      }>,
    ) {
      if (action.payload.generation !== state.generation) return;
      const id = action.payload.id ?? `toast-${(seq += 1)}`;
      const next: Toast = {
        id,
        message: action.payload.message,
        tone: action.payload.tone ?? 'info',
        revision: (revision += 1),
        ...(action.payload.durationMs ? { durationMs: action.payload.durationMs } : {}),
      };
      const index = state.items.findIndex((toast) => toast.id === id);
      if (index >= 0) state.items[index] = next;
      else state.items.push(next);
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
    clearToasts(state) {
      state.items = [];
      state.generation += 1;
    },
  },
});

export const { addToast, dismissToast, clearToasts } = toastsSlice.actions;
export const toastsReducer = toastsSlice.reducer;
