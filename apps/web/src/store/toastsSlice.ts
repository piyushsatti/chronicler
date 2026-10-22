import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ToastTone } from '../components/primitives/Toast.js';

export type { ToastTone };

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastsState = {
  items: Toast[];
  generation: number;
};

const initialState: ToastsState = { items: [], generation: 0 };

let seq = 0;

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast(
      state,
      action: PayloadAction<{ message: string; tone?: ToastTone; generation: number }>,
    ) {
      if (action.payload.generation !== state.generation) return;
      seq += 1;
      state.items.push({
        id: `toast-${seq}`,
        message: action.payload.message,
        tone: action.payload.tone ?? 'info',
      });
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
