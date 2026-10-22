import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../src/store/store.js';
import { preferencesLocallyChanged } from '../../src/store/preferencesSlice.js';
import { useEventMotion } from '../../src/motion/useEventMotion.js';
import { useFirstLoadStagger } from '../../src/motion/useFirstLoadStagger.js';
import { useCountUp } from '../../src/motion/useCountUp.js';
import {
  MOTION_DURATION_TOKENS,
  MOTION_EASING_TOKENS,
  MOTION_STAGGER_TOKENS,
} from '../../src/motion/tokens.js';
import { MOTION_CATALOG } from '../../src/motion/catalog.js';
function context() {
  let reduced = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  const store = createAppStore();
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return {
    store,
    wrapper: Wrapper,
    suppress: (value: boolean) => {
      reduced = value;
      listeners.forEach((listener) => listener());
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('Motion behavior', () => {
  it('contains the exact retained identities and no retired hex row', () => {
    expect(MOTION_CATALOG.map((entry) => entry.n)).toEqual(
      Array.from({ length: 25 }, (_, n) => n + 1).filter((n) => n !== 21),
    );
    expect(MOTION_CATALOG.some((entry) => entry.id.includes('hex'))).toBe(false);
    expect(MOTION_CATALOG.filter((entry) => entry.launch)).toHaveLength(14);
  });
  it('celebrates a new event once, never an initial persisted key, and never queues suppressed events', () => {
    const ctx = context();
    const { result, rerender } = renderHook(({ event }) => useEventMotion(event), {
      wrapper: ctx.wrapper,
      initialProps: { event: 'persisted' },
    });
    expect(result.current.active).toBe(false);
    rerender({ event: 'new' });
    expect(result.current.active).toBe(true);
    act(() => result.current.onEnd());
    expect(result.current.active).toBe(false);
    rerender({ event: 'new' });
    expect(result.current.active).toBe(false);
    act(() => ctx.suppress(true));
    rerender({ event: 'suppressed' });
    expect(result.current.active).toBe(false);
    act(() => ctx.suppress(false));
    expect(result.current.active).toBe(false);
    act(() =>
      ctx.store.dispatch(
        preferencesLocallyChanged({
          patch: { reducedMotion: true },
          resolvedMode: 'dark',
        }),
      ),
    );
    rerender({ event: 'saved-preference' });
    expect(result.current.active).toBe(false);
  });
  it('stages loaded keys once, handles a changed loaded key, and caps row delay', () => {
    const ctx = context();
    const { result, rerender } = renderHook(
      ({ key, loaded }) =>
        useFirstLoadStagger(key, loaded, {
          staggerToken: MOTION_STAGGER_TOKENS.resultRow,
          staggerCap: 10,
        }),
      { wrapper: ctx.wrapper, initialProps: { key: 'first', loaded: false } },
    );
    expect(result.current.staggered).toBe(false);
    rerender({ key: 'first', loaded: true });
    expect(result.current.staggered).toBe(true);
    expect(result.current.styleForIndex(100)).toEqual({ '--motion-stagger-index': 10 });
    expect(result.current.styleForIndex(-3)).toEqual({ '--motion-stagger-index': 0 });
    rerender({ key: 'first', loaded: false });
    rerender({ key: 'first', loaded: true });
    expect(result.current.staggered).toBe(false);
    rerender({ key: 'second', loaded: true });
    expect(result.current.staggered).toBe(true);
    act(() => ctx.suppress(true));
    expect(result.current.staggered).toBe(false);
    expect(result.current.styleForIndex(2)).toBeUndefined();
  });
  it('reads countup duration from the shared CSS token, reaches the target, and cancels on suppression', () => {
    const ctx = context();
    const node = document.createElement('output');
    node.style.setProperty(MOTION_DURATION_TOKENS.countup, '800ms');
    node.style.setProperty(
      MOTION_EASING_TOKENS.outExpo,
      'cubic-bezier(0.16, 1, 0.3, 1)',
    );
    let progress = 0;
    const timing = vi.fn(() => ({
      playState: 'running',
      effect: { getComputedTiming: () => ({ progress }) },
      cancel: vi.fn(),
    }));
    Object.defineProperty(node, 'animate', { value: timing });
    document.body.append(node);
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    });
    const cancel = vi.fn((frame: number) => callbacks.delete(frame));
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const ref = { current: node };
    const { result, rerender, unmount } = renderHook(
      ({ replay }) => useCountUp(42, replay, ref),
      { wrapper: ctx.wrapper, initialProps: { replay: 0 } },
    );
    function frame(now: number) {
      const next = [...callbacks.entries()][0];
      callbacks.delete(next[0]);
      act(() => next[1](now));
    }
    frame(0);
    progress = 0.875;
    frame(400);
    expect(result.current).toBe(37);
    progress = 1;
    frame(800);
    expect(result.current).toBe(42);
    progress = 0;
    rerender({ replay: 1 });
    frame(1000);
    expect(result.current).toBe(0);
    act(() => ctx.suppress(true));
    expect(result.current).toBe(42);
    expect(cancel).toHaveBeenCalled();
    expect(timing).toHaveBeenCalledWith([{}, {}], {
      duration: 800,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
    unmount();
    node.remove();
  });
});
