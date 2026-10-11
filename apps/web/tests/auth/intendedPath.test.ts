import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_REDIRECT_KEY,
  consumeIntendedPath,
  storeIntendedPath,
} from '../../src/auth/intendedPath.js';

afterEach(() => {
  sessionStorage.clear();
});

describe('intendedPath', () => {
  it('stores and consumes a safe internal path', () => {
    storeIntendedPath('/quests/qa-the-salt-stair');
    expect(consumeIntendedPath()).toBe('/quests/qa-the-salt-stair');
    expect(sessionStorage.getItem(AUTH_REDIRECT_KEY)).toBeNull();
  });

  it('rejects external and protocol paths', () => {
    storeIntendedPath('https://evil.example.com/phish');
    storeIntendedPath('//evil.example.com');
    storeIntendedPath('javascript:alert(1)');
    expect(consumeIntendedPath()).toBeNull();
  });
});
