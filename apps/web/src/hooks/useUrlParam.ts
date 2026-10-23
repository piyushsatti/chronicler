import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One filter kept in the URL query string so it survives back, refresh and sharing.
 * The default value is not written, which keeps clean URLs. Other params are preserved.
 */
export function useUrlParam(name: string, fallback = ''): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const set = useCallback(
    (next: string): void => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === fallback || next === '') out.delete(name);
          else out.set(name, next);
          return out;
        },
        { replace: true },
      );
    },
    [name, fallback, setParams],
  );
  return [value, set];
}
