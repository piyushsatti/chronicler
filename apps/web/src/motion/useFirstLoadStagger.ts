import { useState, type CSSProperties } from 'react';
import { useMotionCollapse } from './useMotionCollapse.js';
import type { MotionEntry } from './types.js';

type StaggerState = {
  key: string;
  loaded: boolean;
  activeKey: string | null;
  seen: ReadonlySet<string>;
};

function advance(previous: StaggerState | null, key: string, loaded: boolean): StaggerState {
  const seen = previous?.seen ?? new Set<string>();
  if (!loaded) return { key, loaded, activeKey: null, seen };
  if (previous && previous.key === key && previous.loaded) return previous;
  return {
    key,
    loaded,
    activeKey: seen.has(key) ? null : key,
    seen: new Set(seen).add(key),
  };
}

/** Stagger rows read their delay from the catalog class's CSS rule; this supplies the index. */
export type StaggerIndexStyle = CSSProperties & { '--motion-stagger-index': number };

/**
 * A mounted surface staggers each loaded key once, with a bounded row index.
 * motion.css is the one interpreter: each stagger class computes
 * `animation-delay: calc(var(--motion-stagger-<token>) * var(--motion-stagger-index, 0))`.
 */
export function useFirstLoadStagger(
  key: string,
  loaded: boolean,
  entry: Pick<MotionEntry, 'staggerToken' | 'staggerCap'>,
) {
  const collapsed = useMotionCollapse();
  // Derived during render (React "adjust state when a prop changes"), so the
  // first loaded paint already carries the stagger class.
  const [state, setState] = useState(() => advance(null, key, loaded));
  let current = state;
  if (state.key !== key || state.loaded !== loaded) {
    current = advance(state, key, loaded);
    setState(current);
  }
  const cap = Math.min(10, Math.max(0, entry.staggerCap ?? 10));
  const staggered = loaded && current.activeKey === key && !collapsed;
  return {
    staggered,
    styleForIndex: (index: number): StaggerIndexStyle | undefined =>
      entry.staggerToken && staggered
        ? { '--motion-stagger-index': Math.min(cap, Math.max(0, index)) }
        : undefined,
  };
}
