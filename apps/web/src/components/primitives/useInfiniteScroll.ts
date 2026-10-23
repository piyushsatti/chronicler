import { useEffect, useRef, type RefObject } from 'react';

export type InfiniteScrollOptions = {
  enabled: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
};

export function useInfiniteScroll({
  enabled,
  onLoadMore,
  rootMargin = '160px 0px',
}: InfiniteScrollOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) callbackRef.current();
    }, { rootMargin });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
