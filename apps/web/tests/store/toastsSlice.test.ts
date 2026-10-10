import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../src/store/store.js';
import { addToast, dismissToast } from '../../src/store/toastsSlice.js';

describe('toastsSlice', () => {
  it('adds and dismisses toasts', () => {
    const store = createAppStore();
    store.dispatch(addToast({ message: 'Hello', tone: 'info' }));
    expect(store.getState().toasts.items).toHaveLength(1);
    const id = store.getState().toasts.items[0]!.id;
    store.dispatch(dismissToast(id));
    expect(store.getState().toasts.items).toHaveLength(0);
  });
});
