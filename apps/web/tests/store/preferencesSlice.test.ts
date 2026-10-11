import { describe, expect, it } from 'vitest';
import {
  preferencesLocallyChanged,
  selectPreferences,
  selectResolvedMode,
  systemModeObserved,
} from '../../src/store/preferencesSlice.js';
import { createAppStore } from '../../src/store/store.js';

describe('preferencesSlice', () => {
  it('applies local preference patches', () => {
    const store = createAppStore();
    store.dispatch(
      preferencesLocallyChanged({
        patch: { theme: 'midnight', mode: 'dark' },
        resolvedMode: 'dark',
      }),
    );
    expect(selectPreferences(store.getState()).theme).toBe('midnight');
    expect(selectResolvedMode(store.getState())).toBe('dark');
  });

  it('observes system mode only while preference is system', () => {
    const store = createAppStore();
    store.dispatch(
      preferencesLocallyChanged({
        patch: { mode: 'light', modeExplicit: true },
        resolvedMode: 'light',
      }),
    );
    store.dispatch(systemModeObserved('dark'));
    expect(selectResolvedMode(store.getState())).toBe('light');

    store.dispatch(
      preferencesLocallyChanged({
        patch: { mode: 'system', modeExplicit: true },
        resolvedMode: 'light',
      }),
    );
    store.dispatch(systemModeObserved('dark'));
    expect(selectResolvedMode(store.getState())).toBe('dark');
  });
});
