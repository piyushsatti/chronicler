import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { cx } from './cx.js';

export type ChipTone = 'neutral' | 'line' | 'accent' | 'status' | 'category';
export type ChipSize = 'sm' | 'md';

export type ChipProps = {
  children?: ReactNode;
  className?: string;
  tone?: ChipTone;
  size?: ChipSize;
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
  selected = false,
  onClick,
  dot,
  tabIndex,
  onKeyDown,
}: ChipProps): React.JSX.Element {
  const classNames = cx(
    'chip',
    `chip--${tone}`,
    `chip--${size}`,
    selected && 'chip--selected',
    className,
  );
  const body = (
    <>
      {dot ? <span className="chip__dot" aria-hidden="true" /> : null}
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
        data-selected={selected ? 'true' : 'false'}
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
      data-selected={selected ? 'true' : 'false'}
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
