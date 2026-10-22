import '@testing-library/jest-dom/vitest';
import { transferableAbortController } from 'node:util';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../src/mocks/server.js';

// jsdom supplies DOM signals, while this harness uses Node's fetch/Request.
// Pair them with native Node signals so real cancellation reaches MSW/fetch.
const nativeController = transferableAbortController();
Object.defineProperties(globalThis, {
  AbortController: { value: nativeController.constructor, configurable: true },
  AbortSignal: { value: nativeController.signal.constructor, configurable: true },
});

const memory = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return memory.size;
  },
  clear() {
    memory.clear();
  },
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  key(index: number) {
    return [...memory.keys()][index] ?? null;
  },
  removeItem(key: string) {
    memory.delete(key);
  },
  setItem(key: string, value: string) {
    memory.set(key, String(value));
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverStub,
  configurable: true,
});

class IntersectionObserverStub {
  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root: Element | Document | null = null;
  rootMargin = '';
  thresholds: readonly number[] = [];
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: IntersectionObserverStub,
  configurable: true,
});

// jsdom has no PointerEvent; Base UI's keyboard activation (Enter on a menu
// item) dispatches `new window.PointerEvent('click', …)`. Additive only.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    value: PointerEventStub,
    configurable: true,
  });
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  memory.clear();
});

afterAll(() => {
  server.close();
});
