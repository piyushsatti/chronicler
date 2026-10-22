import { useEffect, useRef, useState } from 'react';

/** Visibility is a force-static input to the existing motion rule, never another preference. */
export function useAmbientVisibility(enabled: boolean, scope: 'page' | 'contained') {
  const ref = useRef<HTMLDivElement>(null);
  const [intersects, setIntersects] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document !== 'undefined' && document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    if (!enabled) {
      setIntersects(false);
      return;
    }
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    const node = scope === 'contained' ? ref.current : null;
    const observer =
      !node || typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries.find((item) => item.target === node);
            if (entry) setIntersects(entry.isIntersecting);
          });
    if (node) observer?.observe(node);
    return () => {
      document.removeEventListener('visibilitychange', update);
      observer?.disconnect();
    };
  }, [enabled, scope]);
  return { ref, visible: enabled && (scope === 'page' || intersects) && pageVisible };
}
