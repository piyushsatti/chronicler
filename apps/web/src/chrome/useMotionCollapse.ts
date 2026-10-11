import { useEffect, useState } from 'react';

function osPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export type UseMotionCollapseOptions = {
  appReducedMotion?: boolean;
  densityCapped?: boolean;
  forced?: boolean;
};

/** Collapse = OS reduced-motion OR app preference OR density cap OR forced. */
export function useMotionCollapse(opts?: UseMotionCollapseOptions): boolean {
  const appReducedMotion = opts?.appReducedMotion ?? false;
  const densityCapped = opts?.densityCapped ?? false;
  const forced = opts?.forced ?? false;
  const [osReduced, setOsReduced] = useState(osPrefersReducedMotion);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setOsReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return osReduced || appReducedMotion || densityCapped || forced;
}
