import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ToastTone = 'info' | 'error' | 'success';

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastsState = {
  items: Toast[];
};

const initialState: ToastsState = { items: [] };

let seq = 0;

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast(state, action: PayloadAction<{ message: string; tone?: ToastTone }>) {
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
  },
});

export const { addToast, dismissToast } = toastsSlice.actions;
export const toastsReducer = toastsSlice.reducer;
