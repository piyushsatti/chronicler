import { useEffect, useRef, type RefObject } from 'react';

/** Which inline edges of a horizontal scroller have hidden content:
 * "start", "end", "start end" or "" (fits). */
export function scrollEdges(el: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): string {
  const overflow = el.scrollWidth - el.clientWidth;
  if (overflow <= 1) return '';
  const left = Math.abs(el.scrollLeft);
  const edges: string[] = [];
  if (left > 1) edges.push('start');
  if (left < overflow - 1) edges.push('end');
  return edges.join(' ');
}

/**
 * Marks a horizontal scroller with `data-overflow` (see `scrollEdges`) so CSS
 * can fade the clipped edge, and keeps the selected item
 * (`[aria-selected="true"]` or `[aria-current="page"]`) scrolled into view.
 * `watch` re-runs the check when the items or the selection change.
 */
export function useScrollEdges<T extends HTMLElement>(watch?: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const edges = scrollEdges(el);
      if (edges) el.setAttribute('data-overflow', edges);
      else el.removeAttribute('data-overflow');
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    // The scroller keeps its own size when its content grows (web fonts arriving,
    // items added), so watch the items too and re-check once fonts are ready.
    for (const child of Array.from(el.children)) observer?.observe(child);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) update();
    });
    return () => {
      live = false;
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>(
      '[aria-selected="true"], [aria-current="page"]',
    );
    if (current && el.scrollWidth > el.clientWidth) {
      const box = el.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      const start = item.left - box.left + el.scrollLeft;
      const end = start + item.width;
      if (start < el.scrollLeft) el.scrollLeft = start;
      else if (end > el.scrollLeft + el.clientWidth) el.scrollLeft = end - el.clientWidth;
    }
  }, [watch]);

  return ref;
}
