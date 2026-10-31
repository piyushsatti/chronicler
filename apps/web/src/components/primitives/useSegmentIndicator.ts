import { useLayoutEffect, useRef, type RefObject } from 'react';

type PillBox = { left: number; width: number };

/**
 * Last pill box per labelled track. Pages render their own chrome, so a
 * navigation remounts the track; the new pill slides from where the old one
 * stood instead of growing again from the left edge.
 */
const lastPillBox = new Map<string, PillBox>();

export function useSegmentIndicator(
  trackRef: RefObject<HTMLElement | null>,
  rowRef: RefObject<HTMLElement | null>,
  activeKey: string,
): void {
  const placedRef = useRef(false);
  useLayoutEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!track || !row) return;
    const memoryKey = track.getAttribute('aria-label');
    const setBox = ({ left, width }: PillBox): void => {
      track.style.setProperty('--active-tab-left', `${left}px`);
      track.style.setProperty('--active-tab-width', `${width}px`);
    };
    const measure = (): void => {
      const active = row.querySelector<HTMLElement>('[data-segment-active="true"]');
      if (!active) {
        setBox({ left: 0, width: 0 });
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const itemRect = active.getBoundingClientRect();
      const target = { left: itemRect.left - rowRect.left, width: itemRect.width };
      if (!placedRef.current) {
        // First placement: start from the previous page's pill, or grow out
        // from the centre of the active option. Never from the row's left edge.
        placedRef.current = true;
        const start = (memoryKey ? lastPillBox.get(memoryKey) : undefined)
          ?? { left: target.left + target.width / 2, width: 0 };
        track.setAttribute('data-pill-instant', '');
        setBox(start);
        void track.offsetWidth;
        track.removeAttribute('data-pill-instant');
      }
      setBox(target);
      if (memoryKey) lastPillBox.set(memoryKey, target);
    };
    const updateOverflow = (): void => {
      track.classList.toggle('has-overflow', track.scrollWidth > track.clientWidth + 1);
      track.classList.toggle('can-scroll-left', track.scrollLeft > 1);
      track.classList.toggle('can-scroll-right', track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
    };
    const reveal = (): void => {
      const active = row.querySelector<HTMLElement>('[data-segment-active="true"]');
      if (!active) return;
      const trackRect = track.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const inset = track.matches('[data-site-links-placement="top"]') ? 24 : 4;
      if (activeRect.left < trackRect.left + inset) {
        track.scrollLeft += Math.floor(activeRect.left - trackRect.left - inset);
      } else if (activeRect.right > trackRect.right - inset) {
        track.scrollLeft += Math.ceil(activeRect.right - trackRect.right + inset);
      }
    };
    const measureAndReveal = (): void => {
      measure();
      reveal();
      updateOverflow();
    };
    const observer = new ResizeObserver(measureAndReveal);
    observer.observe(track);
    observer.observe(row);
    const onScroll = (): void => {
      measure();
      updateOverflow();
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    measureAndReveal();
    document.fonts?.ready.then(measureAndReveal);
    return () => {
      observer.disconnect();
      track.removeEventListener('scroll', onScroll);
    };
  }, [activeKey, trackRef, rowRef]);
}
