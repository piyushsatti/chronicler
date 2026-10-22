import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbientLayer } from '../../src/chrome/AmbientLayer.js';
import { effectById } from '../../src/effects/catalog.js';
import { renderWithProviders } from '../test-utils.js';
import {
  resolveCosmeticEffect,
  resolveCosmeticEffects,
  LAUNCH_COSMETICS,
} from '../../src/view-models/cosmeticEffects.js';
class Observer implements IntersectionObserver {
  static instances: Observer[] = [];
  root = null;
  rootMargin = '0px';
  thresholds = [0];
  target: Element | null = null;
  constructor(private callback: IntersectionObserverCallback) {
    Observer.instances.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  unobserve() {}
  disconnect() {
    this.target = null;
  }
  takeRecords() {
    return [];
  }
  emit(isIntersecting: boolean) {
    if (!this.target) throw new Error('No observed element');
    const rect = this.target.getBoundingClientRect();
    this.callback(
      [
        {
          target: this.target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          time: 0,
          boundingClientRect: rect,
          intersectionRect: rect,
          rootBounds: null,
        },
      ],
      this,
    );
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Observer.instances = [];
});
describe('Ambient visibility', () => {
  it('suppresses contained effects outside the viewport and while the tab is hidden, then resumes', () => {
    vi.stubGlobal('IntersectionObserver', Observer);
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const { container } = renderWithProviders(
      <AmbientLayer forcedDef={effectById('glow-pulse')} scope="contained" />,
    );
    const effect = container.querySelector('.ambient-layer');
    expect(effect).toHaveAttribute('data-motion-collapse', 'on');
    const observer = Observer.instances.find((item) => item.target === effect);
    expect(observer).toBeDefined();
    act(() => observer!.emit(true));
    expect(effect).toHaveAttribute('data-motion-collapse', 'off');
    act(() => {
      visibility.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(effect).toHaveAttribute('data-motion-collapse', 'on');
    act(() => {
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(effect).toHaveAttribute('data-motion-collapse', 'off');
    act(() => observer!.emit(false));
    expect(effect).toHaveAttribute('data-motion-collapse', 'on');
    act(() => observer!.emit(true));
    expect(effect).toHaveAttribute('data-motion-collapse', 'off');
  });
  it('keeps fixed page effects static when forced and does not let force=false override saved suppression', () => {
    localStorage.setItem('chronicler-prefs', JSON.stringify({ reducedMotion: true }));
    const { container } = renderWithProviders(
      <AmbientLayer forcedDef={effectById('gradient-sweep')} forcedCollapse={false} />,
    );
    expect(container.querySelector('.ambient-layer')).toHaveAttribute(
      'data-motion-collapse',
      'on',
    );
  });
  it('renders particle data through the single interpreter and disconnects contained observers', () => {
    vi.stubGlobal('IntersectionObserver', Observer);
    const def = effectById('starfield-twinkle');
    if (!def) throw new Error('Missing real effect');
    const { container, unmount } = renderWithProviders(
      <AmbientLayer forcedDef={{ ...def, particleCount: 3 }} scope="contained" />,
    );
    expect(container.querySelectorAll('.ambient-dot')).toHaveLength(3);
    const observer = Observer.instances.find((item) => item.target !== null);
    expect(observer).toBeDefined();
    unmount();
    expect(observer?.target).toBeNull();
  });
});
describe('Retained cosmetic presentation', () => {
  it('contains only five styled role/selection rows, with deterministic selection priority', () => {
    expect(LAUNCH_COSMETICS).toHaveLength(5);
    expect(new Set(LAUNCH_COSMETICS.map((entry) => entry.driver))).toEqual(
      new Set(['role', 'selection']),
    );
    expect(resolveCosmeticEffect({ roles: ['dm', 'admin'], selected: true })?.id).toBe(
      'selection-ring',
    );
    expect(
      resolveCosmeticEffects({ roles: ['dm', 'admin'] }).map((entry) => entry.id),
    ).toEqual(['admin-ring', 'dm-sigil']);
    expect(resolveCosmeticEffect({ roles: ['unknown'] })).toBeNull();
  });
});
