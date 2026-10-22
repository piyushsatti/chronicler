import type { ReactNode } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { cx } from './cx.js';

export type PopoverProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  children?: ReactNode;
  /** Applied to the popup panel (portaled to <body>), e.g. a scope class. */
  className?: string;
  ariaLabel?: string;
};

/**
 * Anchored non-modal dialog. Headless primitive + project CSS skin: Base UI
 * Popover supplies portal, positioning with collision handling, focus in on
 * open and back to the trigger on close, Escape and outside-press dismissal;
 * `.pop-trigger` / `.pop-content` supply the look. Use `Menu` for lists of
 * actions.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  className,
  ariaLabel,
}: PopoverProps): React.JSX.Element {
  return (
    <BasePopover.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <BasePopover.Trigger className="pop-trigger">{trigger}</BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner
          className="pop-positioner"
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <BasePopover.Popup
            className={cx('pop-content stack', className)}
            data-component="Popover"
            aria-label={ariaLabel}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
