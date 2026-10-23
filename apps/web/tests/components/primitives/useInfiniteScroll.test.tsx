import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScroll } from '../../../src/components/primitives/useInfiniteScroll.js';

class ObserverMock {
  static instances: ObserverMock[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    ObserverMock.instances.push(this);
  }

  trigger(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function Sentinel({ enabled, onLoadMore }: { enabled: boolean; onLoadMore: () => void }): React.JSX.Element {
  const ref = useInfiniteScroll({ enabled, onLoadMore });
  return <div ref={ref} />;
}

describe('useInfiniteScroll', () => {
  afterEach(() => {
    ObserverMock.instances = [];
    vi.unstubAllGlobals();
  });

  it('loads the next page when the enabled sentinel intersects and disconnects while disabled', () => {
    vi.stubGlobal('IntersectionObserver', ObserverMock);
    const onLoadMore = vi.fn();
    const { container, rerender } = render(<Sentinel enabled onLoadMore={onLoadMore} />);
    const observer = ObserverMock.instances[0];
    const sentinel = container.firstElementChild;
    expect(sentinel).toBeInstanceOf(HTMLDivElement);
    expect(observer?.observe).toHaveBeenCalledWith(sentinel);
    act(() => observer?.trigger(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<Sentinel enabled={false} onLoadMore={onLoadMore} />);
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });
});
