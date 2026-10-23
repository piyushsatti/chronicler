import { useLayoutEffect, type RefObject } from 'react';

export function useSegmentIndicator(
  trackRef: RefObject<HTMLElement | null>,
  rowRef: RefObject<HTMLElement | null>,
  activeKey: string,
): void {
  useLayoutEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!track || !row) return;
    const measure = (): void => {
      const active = row.querySelector<HTMLElement>('[data-segment-active="true"]');
      if (!active) {
        track.style.setProperty('--active-tab-left', '0px');
        track.style.setProperty('--active-tab-width', '0px');
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const itemRect = active.getBoundingClientRect();
      track.style.setProperty('--active-tab-left', `${itemRect.left - rowRect.left}px`);
      track.style.setProperty('--active-tab-width', `${itemRect.width}px`);
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
