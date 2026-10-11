import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { useControllable } from './useControllable.js';

export type ListboxOption<T> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type ListboxProps<T = string> = {
  value?: T;
  onValueChange?: (value: T) => void;
  defaultValue?: T;
  options?: ListboxOption<T>[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
};

/** Flat role=listbox / option list. */
export function Listbox<T = string>({
  value,
  onValueChange,
  defaultValue,
  options,
  size = 'md',
  className,
  children,
  'aria-label': ariaLabel = 'Options',
}: ListboxProps<T>): React.JSX.Element {
  const [current, select] = useControllable<T>({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  const rootId = useId();

  if (!options?.length) {
    return (
      <div className={className} data-component="Listbox" data-size={size}>
        {children}
      </div>
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    const enabled = options!.filter((o) => !o.disabled);
    if (!enabled.length) return;
    const idx = enabled.findIndex((o) => o.value === current);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = enabled[Math.min(idx + 1, enabled.length - 1)] ?? enabled[0];
      select(next.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = enabled[Math.max(idx - 1, 0)] ?? enabled[0];
      select(next.value);
    }
  }

  return (
    <ul
      id={rootId}
      className={['listbox', className].filter(Boolean).join(' ')}
      data-component="Listbox"
      data-size={size}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {options.map((opt) => {
        const selected = opt.value === current;
        return (
          <li key={String(opt.value)} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              disabled={opt.disabled}
              className="listbox__opt"
              onClick={() => select(opt.value)}
            >
              {opt.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
