import { describe, expect, it } from 'vitest';
import {
  dialogClosed,
  dialogOpened,
  selectSearchDialogOpen,
} from '../../src/store/searchSlice.js';
import { createAppStore } from '../../src/store/store.js';

describe('searchSlice', () => {
  it('opens and closes the search dialog', () => {
    const store = createAppStore();
    expect(selectSearchDialogOpen(store.getState())).toBe(false);
    store.dispatch(dialogOpened());
    expect(selectSearchDialogOpen(store.getState())).toBe(true);
    store.dispatch(dialogClosed());
    expect(selectSearchDialogOpen(store.getState())).toBe(false);
  });
});
