import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
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

/**
 * Radiogroup segmented control (not a tablist), following the WAI-ARIA APG
 * radio group pattern: roving tabindex with a single tab stop (the checked
 * enabled radio, else the first enabled one); arrows move focus with wrap
 * and check the focused radio; Home/End jump to the first/last enabled radio.
 */
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
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  const enabledIdxs = options.flatMap((o, i) => (o.disabled ? [] : [i]));
  const checkedIdx = options.findIndex((o) => o.value === current && !o.disabled);
  const tabStopIdx = checkedIdx >= 0 ? checkedIdx : (enabledIdxs[0] ?? -1);

  function moveTo(idx: number): void {
    optionRefs.current[idx]?.focus();
    setValue(options![idx].value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number): void {
    if (!enabledIdxs.length) return;
    const n = options!.length;
    let target: number | undefined;
    if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp'
    ) {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      for (let i = 1; i <= n; i++) {
        const cand = (idx + step * i + n * n) % n;
        if (!options![cand].disabled) {
          target = cand;
          break;
        }
      }
    } else if (e.key === 'Home') {
      target = enabledIdxs[0];
    } else if (e.key === 'End') {
      target = enabledIdxs[enabledIdxs.length - 1];
    } else {
      return;
    }
    e.preventDefault();
    if (target !== undefined) moveTo(target);
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
            ref={(el) => {
              optionRefs.current[idx] = el;
            }}
            id={`${baseId}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={idx === tabStopIdx ? 0 : -1}
            disabled={opt.disabled}
            data-active={selected ? '1' : undefined}
            className={selected ? 'seg__opt on' : 'seg__opt'}
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
