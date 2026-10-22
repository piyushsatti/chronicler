import { useEffect, useRef, useState } from 'react';
import { useMotionCollapse } from './useMotionCollapse.js';

/** A received event animates once; loading an existing event never celebrates. */
export function useEventMotion(eventKey: string | number | null) {
  const collapsed = useMotionCollapse();
  const lastKey = useRef(eventKey);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (eventKey !== null && eventKey !== lastKey.current) {
      lastKey.current = eventKey;
      setActive(!collapsed);
    }
    if (collapsed) setActive(false);
  }, [eventKey, collapsed]);
  return { active: active && !collapsed, onEnd: () => setActive(false) };
}
