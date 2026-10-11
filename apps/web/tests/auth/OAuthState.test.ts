import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginOAuthState,
  consumeOAuthState,
  OAUTH_STATE_KEY,
} from '../../src/auth/oauthState.js';

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
});

function initiate(): string {
  const state = beginOAuthState();
  expect(state).toMatch(/^[0-9a-f]{64}$/);
  return state!;
}

describe('same-tab OAuth state correlation', () => {
  it('creates a fresh nonce, replaces the prior initiation, and consumes it once', () => {
    const first = initiate();
    const second = initiate();
    expect(second).not.toBe(first);
    // The replaced nonce can no longer authorize this tab.
    expect(consumeOAuthState(first)).toBe(false);
    const current = initiate();
    expect(consumeOAuthState(current)).toBe(true);
    expect(consumeOAuthState(current)).toBe(false);
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
  });

  it.each([null, '', 'arbitrary-state', '0'.repeat(64)])(
    'rejects a missing, malformed, or unrelated callback nonce: %s',
    (candidate) => {
      initiate();
      expect(consumeOAuthState(candidate)).toBe(false);
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
    },
  );

  it('does not accept a nonce without the initiating tab storage', () => {
    const state = initiate();
    sessionStorage.clear();
    expect(consumeOAuthState(state)).toBe(false);
  });

  it.each([10 * 60 * 1000, 10 * 60 * 1000 + 1, -1])(
    'rejects callbacks at or after expiry and future-dated initiations: %s ms',
    (age) => {
      vi.useFakeTimers();
      const started = Date.now();
      const state = initiate();
      vi.setSystemTime(started + age);
      expect(consumeOAuthState(state)).toBe(false);
    },
  );

  it('accepts a callback just before its deadline', () => {
    vi.useFakeTimers();
    const started = Date.now();
    const state = initiate();
    vi.setSystemTime(started + 10 * 60 * 1000 - 1);
    expect(consumeOAuthState(state)).toBe(true);
  });

  it.each(['not-json', 'null', '[]', '{}'])(
    'rejects damaged pending storage: %s',
    (raw) => {
      const state = initiate();
      sessionStorage.setItem(OAUTH_STATE_KEY, raw);
      expect(consumeOAuthState(state)).toBe(false);
    },
  );

  it('does not create an authorization nonce without cryptographic randomness', () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(beginOAuthState()).toBeNull();
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
  });

  it('does not start when the browser cannot retain the nonce', () => {
    vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(beginOAuthState()).toBeNull();
  });

  it('rejects callbacks when nonce storage is inaccessible', () => {
    const state = initiate();
    vi.spyOn(Object.getPrototypeOf(sessionStorage), 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(consumeOAuthState(state)).toBe(false);
  });
});
