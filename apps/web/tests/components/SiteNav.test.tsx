import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/App.js';
import { useToast } from '../../src/hooks/useToast.js';
import { renderWithProviders } from '../test-utils.js';

const LIVE_LINKS = ['Home', 'Quests', 'Chronicles', 'Codex', 'Rules', 'Community'];

describe('SiteChrome', () => {
  it('publishes its actual header border box initially and after resize, then releases the measurement', () => {
    let headerHeight = 117.34375;
    const root = document.documentElement;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this.matches('header.site-chrome__top')
          ? new DOMRect(0, 0, 768, headerHeight)
          : originalRect.call(this);
      },
    );
    const observers: HeaderObserver[] = [];
    class HeaderObserver implements ResizeObserver {
      readonly observe =
        vi.fn<(target: Element, options?: ResizeObserverOptions) => void>();
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();
      constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      resize(): void {
        this.callback([], this);
      }
    }
    vi.stubGlobal('ResizeObserver', HeaderObserver);
    const view = renderWithProviders(<App />);
    try {
      const header = screen.getByRole('banner');
      const headerObservers = observers.filter((observer) =>
        observer.observe.mock.calls.some(([target]) => target === header),
      );
      expect(root.style.getPropertyValue('--site-header-height')).toBe('117.34375px');
      expect(headerObservers).toHaveLength(1);
      for (const observer of headerObservers)
        expect(observer.observe).toHaveBeenCalledWith(header, { box: 'border-box' });
      const active = headerObservers.filter(
        (observer) => observer.disconnect.mock.calls.length === 0,
      );
      expect(active).toHaveLength(1);
      for (const height of [48, 95.25, 64]) {
        headerHeight = height;
        act(() => active[0].resize());
        expect(root.style.getPropertyValue('--site-header-height')).toBe(`${height}px`);
      }
      view.rerender(<App />);
      expect(
        observers.filter((observer) =>
          observer.observe.mock.calls.some(([target]) => target === header),
        ),
      ).toHaveLength(1);
      headerHeight = 200;
      view.unmount();
      expect(active[0].disconnect).toHaveBeenCalledOnce();
      expect(root.style.getPropertyValue('--site-header-height')).toBe('');
      act(() => active[0].resize());
      expect(root.style.getPropertyValue('--site-header-height')).toBe('');
    } finally {
      view.unmount();
      root.style.removeProperty('--site-header-height');
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('removes only its own published header measurement on unmount', () => {
    const root = document.documentElement;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this.matches('header.site-chrome__top')
          ? new DOMRect(0, 0, 390, 64)
          : originalRect.call(this);
      },
    );
    const view = renderWithProviders(<App />);
    try {
      expect(root.style.getPropertyValue('--site-header-height')).toBe('64px');
      root.style.setProperty('--site-header-height', '123px');
      view.unmount();
      expect(root.style.getPropertyValue('--site-header-height')).toBe('123px');
    } finally {
      view.unmount();
      root.style.removeProperty('--site-header-height');
      vi.restoreAllMocks();
    }
  });

  it('mounts a single global host for connected action feedback and dismissal', async () => {
    function Action(): React.JSX.Element {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Shared action saved.', 'success')}>
          Save shared action
        </button>
      );
    }
    renderWithProviders(
      <>
        <App />
        <Action />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save shared action' }));
    expect(
      await screen.findByText('Shared action saved.', { exact: true }),
    ).toBeVisible();
    expect(document.querySelectorAll('[data-el="toast.host"]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Shared action saved.', { exact: true })).toBeNull();
  });
  it('renders the six live destinations, with search and log in outside that list', () => {
    renderWithProviders(<App />);
    const nav = screen
      .getAllByRole('navigation', { name: 'Primary' })
      .find((element) => element.hasAttribute('data-site-links'));
    expect(nav).toBeTruthy();
    expect(nav).toHaveAttribute('data-site-links');
    for (const name of LIVE_LINKS) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Characters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument();
    expect(nav?.querySelectorAll('[data-nav-item]')).toHaveLength(6);
    expect(nav?.querySelector('[aria-label="Search the chronicle"]')).toBeNull();
    expect(nav?.querySelector('[href="/login"]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Search the chronicle' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-nav]')).toBeNull();
    const root = document.querySelector('#app');
    expect(root).toHaveAttribute('data-app-root');
    expect(root).toHaveAttribute(
      'data-width-class',
      expect.stringMatching(/^(compact|medium|expanded)$/),
    );
    expect(root).toHaveAttribute(
      'data-height-class',
      expect.stringMatching(/^(compact|regular)$/),
    );
    expect(root).toHaveAttribute(
      'data-two-pane',
      expect.stringMatching(/^(true|false)$/),
    );
    expect(root?.getAttribute('data-nav-pattern')).toBe(
      root?.getAttribute('data-site-pattern'),
    );
    const banner = screen.getByRole('banner');
    const main = screen.getByRole('main');
    expect(banner.closest('main')).toBeNull();
    expect(banner.parentElement).toBe(root);
    expect(main.parentElement).toBe(root);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(main).toHaveAttribute('data-shell-main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('preserves the library responsive classes, navigation and height veto on the sole shell', () => {
    const viewport = document.documentElement;
    const width = Object.getOwnPropertyDescriptor(viewport, 'clientWidth');
    const height = Object.getOwnPropertyDescriptor(viewport, 'clientHeight');
    const fontSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = '16px';
    const view = renderWithProviders(<App />);
    try {
      const root = document.querySelector('#app');
      for (const [widthPx, heightPx, widthClass, heightClass, pattern, twoPane] of [
        [390, 844, 'compact', 'regular', 'bottom-bar', 'false'],
        [768, 1024, 'medium', 'regular', 'drawer', 'false'],
        [1920, 1080, 'expanded', 'regular', 'inline-row', 'true'],
        [844, 390, 'expanded', 'compact', 'drawer', 'false'],
      ] as const) {
        act(() => {
          Object.defineProperties(viewport, {
            clientWidth: { configurable: true, value: widthPx },
            clientHeight: { configurable: true, value: heightPx },
          });
          window.dispatchEvent(new Event('resize'));
        });
        expect(root).toHaveAttribute('data-width-class', widthClass);
        expect(root).toHaveAttribute('data-height-class', heightClass);
        expect(root).toHaveAttribute('data-nav-pattern', pattern);
        expect(root).toHaveAttribute('data-site-pattern', pattern);
        expect(root).toHaveAttribute('data-two-pane', twoPane);
      }
    } finally {
      view.unmount();
      if (width) Object.defineProperty(viewport, 'clientWidth', width);
      else Reflect.deleteProperty(viewport, 'clientWidth');
      if (height) Object.defineProperty(viewport, 'clientHeight', height);
      else Reflect.deleteProperty(viewport, 'clientHeight');
      document.documentElement.style.fontSize = fontSize;
    }
  });
});
