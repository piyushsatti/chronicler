import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { cx } from './cx.js';

export type PopoverProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  variant?: 'menu' | 'dialog';
};

/** Lightweight anchored popover for editor pickers and gallery demos. */
export function Popover({
  open = false,
  onOpenChange,
  trigger,
  children,
  className,
  ariaLabel,
  variant = 'dialog',
}: PopoverProps): React.JSX.Element {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <div className={cx('popover', className)} data-component="Popover" data-variant={variant}>
      <button
        type="button"
        className="popover__trigger"
        aria-haspopup={variant === 'menu' ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange?.(!open)}
      >
        {trigger}
      </button>
      {open ? (
        <>
          <div
            className="popover__backdrop"
            aria-hidden
            onClick={() => onOpenChange?.(false)}
          />
          <div
            ref={panelRef}
            id={id}
            className="popover__panel card stack"
            role={variant === 'menu' ? 'menu' : 'dialog'}
            aria-label={ariaLabel}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
