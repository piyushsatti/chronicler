import { describe, expect, it } from 'vitest';
import {
  applyPrefs,
  DEFAULT_PREFERENCES,
  preferenceAccount,
  resolveMode,
} from '../../src/context/theme.utils.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';

describe('theme.utils', () => {
  it.each([
    [{ member_id: 'member-one' }, 'member-one'],
    [{ member_id: 'member-one', sub: 'other-member' }, 'member-one'],
    [{ sub: 'legacy-sub' }, null],
    [{ member_id: '' }, null],
    [{ member_id: 'member-one', exp: Date.now() / 1000 - 1 }, null],
  ])(
    'selects a cache only from a current canonical member claim: %j',
    (claims, account) => {
      const payload = { exp: Date.now() / 1000 + 3600, ...claims };
      localStorage.setItem(TOKEN_KEY, `e30.${btoa(JSON.stringify(payload))}.sig`);
      expect(preferenceAccount()).toBe(account);
    },
  );

  it('resolves system mode to the supplied system value', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('dark', 'light')).toBe('dark');
  });

  it('applies data attributes on documentElement', () => {
    applyPrefs(
      { ...DEFAULT_PREFERENCES, theme: 'ember', bgEffect: 'glow-pulse' },
      'dark',
    );
    expect(document.documentElement.dataset.theme).toBe('ember');
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(document.documentElement.dataset.bgEffect).toBe('glow-pulse');
  });
});
