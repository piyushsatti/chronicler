import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { useControllable } from './useControllable.js';

export type SegmentedControlOption<V extends string> = {
  value: V;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string = string> = {
  options?: SegmentedControlOption<V>[];
  value?: V;
  onValueChange?: (v: V) => void;
  defaultValue?: V;
  size?: 'sm' | 'md';
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
};

/** Radiogroup segmented control (not a tablist). */
export function SegmentedControl<V extends string = string>({
  options,
  value,
  onValueChange,
  defaultValue,
  size = 'md',
  className,
  children,
  'aria-label': ariaLabel = 'Options',
}: SegmentedControlProps<V>): React.JSX.Element {
  const [current, setValue] = useControllable<V>({
    value,
    defaultValue,
    onChange: onValueChange,
  });
  const baseId = useId();

  if (!options?.length) {
    return (
      <div
        className={className}
        data-component="SegmentedControl"
        data-size={size}
        role="group"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number): void {
    let nextIdx = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      do {
        nextIdx = (nextIdx + 1) % options!.length;
      } while (options![nextIdx].disabled && nextIdx !== idx);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      do {
        nextIdx = (nextIdx - 1 + options!.length) % options!.length;
      } while (options![nextIdx].disabled && nextIdx !== idx);
    } else {
      return;
    }
    const target = options![nextIdx];
    if (target.disabled) return;
    setValue(target.value);
  }

  return (
    <div
      className={['seg', className].filter(Boolean).join(' ')}
      data-component="SegmentedControl"
      data-size={size}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === current;
        return (
          <button
            key={opt.value}
            id={`${baseId}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            data-active={selected ? '1' : undefined}
            className="seg__opt"
            onClick={() => setValue(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
