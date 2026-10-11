import { useCallback, useRef, useState } from 'react';

export interface UseControllableOptions<T> {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
}

/** Controlled/uncontrolled UI state; only undefined selects internal state. */
export function useControllable<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableOptions<T>): [T | undefined, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T | undefined>(defaultValue);
  const isControlledRef = useRef(isControlled);
  isControlledRef.current = isControlled;

  const current = isControlled ? value : internal;
  const set = useCallback(
    (next: T) => {
      if (!isControlledRef.current) {
        setInternal(next);
      }
      onChange?.(next);
    },
    [onChange],
  );

  return [current, set];
}
