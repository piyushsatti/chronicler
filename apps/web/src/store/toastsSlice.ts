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
  nextRevision: number;
};

const initialState: ToastsState = { items: [], generation: 0, nextRevision: 0 };

type AddToastInput = {
  message: string;
  tone?: ToastTone;
  generation: number;
  id?: string;
  durationMs?: number;
};

type AddToastPayload = {
  message: string;
  tone: ToastTone;
  generation: number;
  id: string;
  durationMs?: number;
};

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast: {
      prepare(input: AddToastInput): { payload: AddToastPayload } {
        return {
          payload: {
            message: input.message,
            tone: input.tone ?? 'info',
            generation: input.generation,
            id: input.id ?? crypto.randomUUID(),
            ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
          },
        };
      },
      reducer(state, action: PayloadAction<AddToastPayload>) {
        if (action.payload.generation !== state.generation) return;
        const revision = state.nextRevision;
        state.nextRevision += 1;
        const next: Toast = {
          id: action.payload.id,
          message: action.payload.message,
          tone: action.payload.tone,
          revision,
          ...(action.payload.durationMs !== undefined
            ? { durationMs: action.payload.durationMs }
            : {}),
        };
        const index = state.items.findIndex((toast) => toast.id === next.id);
        if (index >= 0) state.items[index] = next;
        else state.items.push(next);
      },
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
