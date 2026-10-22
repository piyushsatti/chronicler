import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { cx } from './cx.js';

export type ChipTone = 'neutral' | 'line' | 'accent' | 'status' | 'category';
export type ChipSize = 'sm' | 'md';

export type ChipProps = {
  children?: ReactNode;
  className?: string;
  tone?: ChipTone;
  size?: ChipSize;
  /**
   * Marks the chip as one option of a filter or choice. A clickable chip that
   * receives `selected` (true or false) is a toggle button and reports
   * `aria-pressed`, so the current choice is not visual only.
   */
  selected?: boolean;
  onClick?: () => void;
  dot?: boolean;
  tabIndex?: number;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
};

export function Chip({
  children,
  className,
  tone = 'neutral',
  size = 'md',
  selected,
  onClick,
  dot,
  tabIndex,
  onKeyDown,
}: ChipProps): React.JSX.Element {
  // Hooks match primitives.css / atlas.css: data-tone, data-size,
  // data-selected='1', and atlas's `.chip .dot` marker.
  const classNames = cx('chip', className);
  const body = (
    <>
      {dot ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classNames}
        data-component="Chip"
        data-tone={tone}
        data-size={size}
        data-selected={selected ? '1' : undefined}
        aria-pressed={selected}
        onClick={onClick}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
      >
        {body}
      </button>
    );
  }

  return (
    <span
      className={classNames}
      data-component="Chip"
      data-tone={tone}
      data-size={size}
      data-selected={selected ? '1' : undefined}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
    >
      {body}
    </span>
  );
}

export function ChipRow({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cx('chip-row', className)} data-component="ChipRow">
      {children}
    </div>
  );
}

Chip.Row = ChipRow;
