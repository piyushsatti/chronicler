import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * On PUSH/REPLACE scroll to top; on POP restore the saved position for that
 * history entry. Works under BrowserRouter and MemoryRouter.
 */
export function ScrollManager(): null {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const key = location.key;
    const map = positions.current;
    return () => {
      map.set(key, window.scrollY);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (typeof window.scrollTo !== 'function') return;
    try {
      if (navType === 'POP') {
        window.scrollTo(0, positions.current.get(location.key) ?? 0);
      } else {
        window.scrollTo(0, 0);
      }
    } catch {
      // jsdom stubs scrollTo as "Not implemented"
    }
  }, [location.key, navType]);

  return null;
}
