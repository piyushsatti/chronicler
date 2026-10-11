import { describe, expect, it } from 'vitest';
import {
  applyPrefs,
  DEFAULT_PREFERENCES,
  resolveMode,
} from '../../src/context/theme.utils.js';

describe('theme.utils', () => {
  it('resolves system mode to the supplied system value', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('dark', 'light')).toBe('dark');
  });

  it('applies data attributes on documentElement', () => {
    applyPrefs({ ...DEFAULT_PREFERENCES, theme: 'ember', bgEffect: 'glow-pulse' }, 'dark');
    expect(document.documentElement.dataset.theme).toBe('ember');
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(document.documentElement.dataset.bgEffect).toBe('glow-pulse');
  });
});
