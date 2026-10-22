import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
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

/** Typeahead buffer resets after this much idle time (ms). */
const TYPEAHEAD_RESET_MS = 500;

/**
 * Flat single-select listbox following the WAI-ARIA APG listbox pattern.
 *
 * - One tab stop: the `ul[role=listbox]`; options are non-focusable
 *   `li[role=option]` and the active one is exposed via
 *   `aria-activedescendant`.
 * - Selection follows focus (owner decision): ArrowUp/ArrowDown (clamped,
 *   no wrap), Home/End and printable-character typeahead move the active
 *   option and select it. Disabled options are skipped.
 * - When nothing is selected, focusing the listbox makes the first enabled
 *   option active WITHOUT selecting it, so merely tabbing through never
 *   changes the value; the first ArrowUp/ArrowDown then selects that active
 *   option.
 */
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
  const listRef = useRef<HTMLUListElement>(null);
  // Active option while nothing is selected (only set on focus); once a value
  // is selected the active option is always the selected one.
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const typeahead = useRef({ buffer: '', at: 0 });

  const selectedIdx = options?.length
    ? options.findIndex((o) => o.value === current)
    : -1;
  const pendingValid =
    pendingIdx !== null &&
    options?.[pendingIdx] !== undefined &&
    !options[pendingIdx].disabled;
  const activeIdx = selectedIdx >= 0 ? selectedIdx : pendingValid ? pendingIdx : -1;

  useEffect(() => {
    const list = listRef.current;
    if (activeIdx < 0 || !list || document.activeElement !== list) return;
    const el = list.children.item(activeIdx);
    if (typeof el?.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!options?.length) {
    return (
      <div className={className} data-component="Listbox" data-size={size}>
        {children}
      </div>
    );
  }

  const optionId = (idx: number): string => `${rootId}-opt-${idx}`;
  const enabledIdxs = options.flatMap((o, i) => (o.disabled ? [] : [i]));

  function onFocus(): void {
    if (selectedIdx < 0 && !pendingValid && enabledIdxs.length)
      setPendingIdx(enabledIdxs[0]);
  }

  function matchTypeahead(key: string): number | undefined {
    const now = Date.now();
    const state = typeahead.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? key : state.buffer + key;
    state.at = now;
    const buffer = state.buffer.toLowerCase();
    // Repeating one character cycles through options starting with it;
    // otherwise keep the current option while it still matches the prefix.
    const cycling = [...buffer].every((c) => c === buffer[0]);
    const prefix = cycling ? buffer[0] : buffer;
    const n = options!.length;
    const from = activeIdx < 0 ? 0 : cycling ? activeIdx + 1 : activeIdx;
    for (let i = 0; i < n; i++) {
      const idx = (from + i) % n;
      const opt = options![idx];
      if (!opt.disabled && opt.label.toLowerCase().startsWith(prefix)) return idx;
    }
    return undefined;
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!enabledIdxs.length) return;
    const first = enabledIdxs[0];
    const last = enabledIdxs[enabledIdxs.length - 1];
    let target: number | undefined;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIdx < 0) {
        // Nothing selected yet: select the active option (first enabled).
        target = pendingValid ? pendingIdx! : first;
      } else if (e.key === 'ArrowDown') {
        target = enabledIdxs.find((i) => i > selectedIdx);
        if (target === undefined && !options![selectedIdx].disabled)
          target = selectedIdx;
      } else {
        target = [...enabledIdxs].reverse().find((i) => i < selectedIdx);
        if (target === undefined && !options![selectedIdx].disabled)
          target = selectedIdx;
      }
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      target = e.key === 'Home' ? first : last;
    } else if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      (e.key !== ' ' || typeahead.current.buffer !== '')
    ) {
      e.preventDefault();
      target = matchTypeahead(e.key);
    } else {
      return;
    }
    if (target === undefined) return;
    setPendingIdx(target);
    select(options![target].value);
  }

  return (
    <ul
      ref={listRef}
      id={rootId}
      className={['listbox', className].filter(Boolean).join(' ')}
      data-component="Listbox"
      data-size={size}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={activeIdx >= 0 ? optionId(activeIdx) : undefined}
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {options.map((opt, idx) => {
        const selected = idx === selectedIdx;
        return (
          <li
            key={optionId(idx)}
            id={optionId(idx)}
            role="option"
            aria-selected={selected}
            aria-disabled={opt.disabled ? 'true' : undefined}
            data-selected={selected ? '1' : undefined}
            data-active={idx === activeIdx ? '1' : undefined}
            className="listbox-option"
            onClick={() => {
              if (!opt.disabled) select(opt.value);
            }}
          >
            {opt.label}
          </li>
        );
      })}
    </ul>
  );
}
