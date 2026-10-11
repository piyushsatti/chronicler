import { useEffect, useState } from 'react';

/** Respect prefers-reduced-motion (rebuild of legacy useMotionCollapse). */
export function useMotionCollapse(opts?: { forced?: boolean }): boolean {
  const [collapsed, setCollapsed] = useState(Boolean(opts?.forced));
  useEffect(() => {
    if (opts?.forced !== undefined) {
      setCollapsed(opts.forced);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setCollapsed(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [opts?.forced]);
  return collapsed;
}
