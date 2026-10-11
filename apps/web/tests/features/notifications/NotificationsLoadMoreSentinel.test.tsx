import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationsLoadMoreSentinel } from '../../../src/features/notifications/components/NotificationsLoadMoreSentinel.js';

describe('NotificationsLoadMoreSentinel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the next page when the observed sentinel intersects', () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '200px';
      readonly thresholds = [0];
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe = observe;
      disconnect = disconnect;
      takeRecords = () => [];
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', TestObserver);
    const onLoadMore = vi.fn();
    const view = render(
      <NotificationsLoadMoreSentinel enabled onLoadMore={onLoadMore} />,
    );

    expect(observe).toHaveBeenCalledOnce();
    callback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(onLoadMore).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
