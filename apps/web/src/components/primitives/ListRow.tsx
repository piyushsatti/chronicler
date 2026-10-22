import type { ReactNode } from 'react';

export type ListRowVariant = 'static' | 'clickable' | 'selectable';

export type ListRowProps = {
  children?: ReactNode;
  className?: string;
  variant?: ListRowVariant;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
};

/** Compound list row — static, clickable, or selectable. */
export function ListRow({
  children,
  className,
  variant = 'static',
  onClick,
  selected = false,
  disabled = false,
}: ListRowProps): React.JSX.Element {
  const cls = ['list-row', className].filter(Boolean).join(' ');
  if (variant === 'clickable' || onClick) {
    return (
      <button
        type="button"
        className={cls}
        data-component="ListRow"
        data-variant={variant}
        data-selected={selected ? '1' : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  if (variant === 'selectable') {
    return (
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={cls}
        data-selected={selected ? '1' : undefined}
        data-component="ListRow"
        data-variant={variant}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={cls} data-component="ListRow" data-variant={variant}>
      {children}
    </div>
  );
}
