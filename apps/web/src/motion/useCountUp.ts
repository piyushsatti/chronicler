import { useEffect, useState, type RefObject } from 'react';
import { useMotionCollapse } from './useMotionCollapse.js';
import { MOTION_DURATION_TOKENS, MOTION_EASING_TOKENS } from './tokens.js';

/** A native timing effect interprets the shared duration and easing; the frame loop only paints numbers. */
export function useCountUp(
  target: number,
  eventKey: number,
  element: RefObject<HTMLElement | null>,
  forced = false,
) {
  const collapsed = useMotionCollapse({ forced });
  const [value, setValue] = useState(collapsed ? target : 0);
  useEffect(() => {
    const node = element.current;
    const style = node ? getComputedStyle(node) : null;
    const token = /^(\d+(?:\.\d+)?)(m?s)$/.exec(
      style?.getPropertyValue(MOTION_DURATION_TOKENS.countup).trim() ?? '',
    );
    const duration = token ? Number(token[1]) * (token[2] === 's' ? 1000 : 1) : 0;
    const easing = style?.getPropertyValue(MOTION_EASING_TOKENS.outExpo).trim();
    if (
      collapsed ||
      !node ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !easing ||
      typeof node.animate !== 'function' ||
      typeof requestAnimationFrame !== 'function'
    ) {
      setValue(target);
      return;
    }
    const clock = node.animate([{}, {}], { duration, easing });
    let frame: number;
    setValue(0);
    const tick = () => {
      const finished = clock.playState === 'finished';
      const progress = clock.effect?.getComputedTiming().progress ?? (finished ? 1 : 0);
      setValue(Math.round(target * progress));
      if (!finished && progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clock.cancel();
    };
  }, [target, eventKey, element, collapsed]);
  return collapsed ? target : value;
}
