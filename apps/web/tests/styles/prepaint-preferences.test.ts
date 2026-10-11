import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initPrefs, RULED_THEMES, STORAGE_KEY } from '../../src/context/theme.utils.js';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const bootstrap = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

function captureRoot() {
  const root = document.documentElement;
  return {
    mode: root.getAttribute('data-mode'),
    modePref: root.getAttribute('data-mode-pref'),
    theme: root.getAttribute('data-theme'),
    colorblind: root.getAttribute('data-colorblind'),
    effect: root.getAttribute('data-bg-effect'),
    colorScheme: root.style.colorScheme,
  };
}

function resetRoot() {
  for (const name of ['data-mode', 'data-mode-pref', 'data-theme', 'data-colorblind', 'data-bg-effect']) {
    document.documentElement.removeAttribute(name);
  }
  document.documentElement.style.colorScheme = '';
}

function compareWithRuntime(raw: string | null, dark: boolean, blocked = false) {
  const storage = { getItem: vi.fn(() => {
    if (blocked) throw new Error('Storage unavailable');
    return raw;
  }) };
  const browser = { matchMedia: vi.fn(() => ({ matches: dark })) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', browser);
  resetRoot();
  runInNewContext(bootstrap, { document, window: browser, localStorage: storage });
  const beforePaint = captureRoot();
  expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  resetRoot();
  initPrefs();
  expect(captureRoot()).toEqual(beforePaint);
  return beforePaint;
}

afterEach(() => { vi.unstubAllGlobals(); resetRoot(); });

describe('head prepaint preference bootstrap', () => {
  it('runs in the head before application modules or font preloads', () => {
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('rel="preload"'));
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(bootstrap).not.toMatch(/(?:setItem|removeItem|document\.write)/);
  });

  it.each([true, false])('uses Parchment and the OS mode for a new member (dark OS: %s)', (dark) => {
    expect(compareWithRuntime(null, dark)).toMatchObject({
      theme: 'parchment', modePref: 'system', mode: dark ? 'dark' : 'light',
      colorblind: 'off', effect: 'none',
    });
  });

  it.each(RULED_THEMES)('preserves the independent mode/theme fields for %s', (theme) => {
    for (const mode of ['dark', 'light', 'system']) {
      for (const dark of [true, false]) {
        expect(compareWithRuntime(JSON.stringify({ theme, mode, modeExplicit: true, colorblindSafe: true, bgEffect: 'glow-pulse' }), dark)).toMatchObject({
          theme, modePref: mode, mode: mode === 'system' ? dark ? 'dark' : 'light' : mode,
          colorblind: 'safe', effect: 'glow-pulse',
        });
      }
    }
  });

  it.each(['atlas', 'default'])('matches current runtime compatibility for a stored %s theme', (theme) => {
    expect(compareWithRuntime(JSON.stringify({ theme, mode: 'light' }), true).theme).toBe(theme);
  });

  it.each(['none', 'starfield-twinkle', 'glow-pulse', 'gradient-sweep'])('applies the current %s effect before mount', (bgEffect) => {
    expect(compareWithRuntime(JSON.stringify({ bgEffect }), true).effect).toBe(bgEffect);
  });

  it.each([
    '{', 'null', 'true', '[]', '{}',
    '{"mode":"invalid","theme":"pixel","bgEffect":"unknown"}',
    '{"mode":"light","theme":{"toString":null}}',
    '{"mode":"dark","theme":"ember","bgEffect":{"toString":null}}',
    '{"colorblindSafe":"false","font":"retro","density":"compact","reducedMotion":true}',
  ])('matches runtime sanitization for %s', (raw) => { compareWithRuntime(raw, false); });

  it('survives unavailable storage and preserves runtime defaults', () => {
    expect(compareWithRuntime(null, true, true)).toMatchObject({ theme: 'parchment', modePref: 'system', mode: 'dark' });
  });

  it('matches the runtime dark fallback when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {});
    resetRoot();
    runInNewContext(bootstrap, { document, window: {}, localStorage });
    const beforePaint = captureRoot();
    resetRoot();
    initPrefs();
    expect(captureRoot()).toEqual(beforePaint);
    expect(beforePaint.mode).toBe('dark');
  });
});
