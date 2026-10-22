import { useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks.js';
import { selectPreferences } from '../store/preferencesSlice.js';
import { resolveMotionCollapse } from '../context/theme.utils.js';

function osPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Collapse = OS reduced-motion OR stored app preference OR forced by the caller. */
export function useMotionCollapse(opts?: { forced?: boolean }): boolean {
  const storedReducedMotion = useAppSelector(selectPreferences).reducedMotion;
  const forced = opts?.forced ?? false;
  const [osReduced, setOsReduced] = useState(osPrefersReducedMotion);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setOsReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return resolveMotionCollapse(osReduced, storedReducedMotion, forced);
}
