import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_PREFERENCES,
  type ResolvedMode,
  type UserPreferences,
} from '../context/theme.utils.js';

export interface PreferencesState {
  prefs: UserPreferences;
  resolvedMode: ResolvedMode;
}

export interface PreferencesChange {
  patch: Partial<UserPreferences>;
  resolvedMode: ResolvedMode;
}

export function createPreferencesState(
  prefs: UserPreferences,
  resolvedMode: ResolvedMode,
): PreferencesState {
  return { prefs: { ...prefs }, resolvedMode };
}

const initialState = createPreferencesState(DEFAULT_PREFERENCES, 'dark');

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    preferencesLocallyChanged(state, action: PayloadAction<PreferencesChange>) {
      Object.assign(state.prefs, action.payload.patch);
      state.resolvedMode = action.payload.resolvedMode;
    },
    preferencesHydrated(state, action: PayloadAction<PreferencesChange>) {
      Object.assign(state.prefs, action.payload.patch);
      state.resolvedMode = action.payload.resolvedMode;
    },
    systemModeObserved(state, action: PayloadAction<ResolvedMode>) {
      if (state.prefs.mode === 'system') {
        state.resolvedMode = action.payload;
      }
    },
  },
});

export const {
  preferencesLocallyChanged,
  preferencesHydrated,
  systemModeObserved,
} = preferencesSlice.actions;

export const selectPreferences = (state: { preferences: PreferencesState }): UserPreferences =>
  state.preferences.prefs;

export const selectResolvedMode = (state: { preferences: PreferencesState }): ResolvedMode =>
  state.preferences.resolvedMode;

export const preferencesReducer = preferencesSlice.reducer;
