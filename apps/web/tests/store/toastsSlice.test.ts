import { describe, expect, it } from 'vitest';
import { createAppStore } from '../../src/store/store.js';
import { addToast, clearToasts, dismissToast } from '../../src/store/toastsSlice.js';

describe('toastsSlice', () => {
  it('adds and dismisses toasts', () => {
    const store = createAppStore();
    store.dispatch(addToast({ message: 'Hello', tone: 'info', generation: 0 }));
    expect(store.getState().toasts.items).toHaveLength(1);
    const id = store.getState().toasts.items[0]!.id;
    store.dispatch(dismissToast(id));
    expect(store.getState().toasts.items).toHaveLength(0);
  });

  it('clears prior feedback and rejects retained callbacks from its old generation', () => {
    const store = createAppStore();
    store.dispatch(addToast({ message: 'Previous authority', generation: 0 }));
    store.dispatch(clearToasts());
    store.dispatch(addToast({ message: 'Late previous authority', generation: 0 }));
    expect(store.getState().toasts.items).toEqual([]);
    store.dispatch(addToast({ message: 'Current authority', generation: 1 }));
    expect(store.getState().toasts.items.map((toast) => toast.message)).toEqual([
      'Current authority',
    ]);
  });

  it('keeps the same id when the same prepared action is dispatched to two fresh stores', () => {
    const action = addToast({ message: 'Hello', tone: 'info', generation: 0 });
    const first = createAppStore();
    const second = createAppStore();
    first.dispatch(action);
    second.dispatch(action);
    expect(first.getState().toasts.items[0]!.id).toBe(second.getState().toasts.items[0]!.id);
    expect(first.getState().toasts.items[0]!.revision).toBe(
      second.getState().toasts.items[0]!.revision,
    );
  });

  it('bumps revision on same-id replace so the dismiss timer can restart', () => {
    const store = createAppStore();
    store.dispatch(
      addToast({ id: 'save', message: 'Saved', generation: 0, durationMs: 5000 }),
    );
    const firstRevision = store.getState().toasts.items[0]!.revision;
    store.dispatch(
      addToast({ id: 'save', message: 'Saved', generation: 0, durationMs: 5000 }),
    );
    expect(store.getState().toasts.items).toHaveLength(1);
    expect(store.getState().toasts.items[0]!.revision).not.toBe(firstRevision);
  });
});
