import { useRef, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { cx } from './cx.js';

export type ModalProps = {
  open: boolean;
  title: string;
  /** Optional supporting copy, announced as the dialog's description. */
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  /** `palette` is a fixed-size command dialog: its height never changes
   * with the content, the first child (the input) stays pinned and the
   * rest scrolls inside. */
  size?: 'sm' | 'md' | 'lg' | 'palette';
  className?: string;
  /** Where focus goes when the dialog closes (Base UI `finalFocus`); default: where it was. */
  finalFocus?: React.ComponentProps<typeof Dialog.Popup>['finalFocus'];
};

/**
 * Headless primitive + project CSS skin: Base UI Dialog supplies the modal
 * behaviour (portal, focus trap and return, inert background, scroll lock,
 * nested-dialog stack, Escape/outside dismissal); `.pr-modal__*` supplies the
 * look.
 */
export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  size = 'md',
  className,
  finalFocus,
}: ModalProps): React.JSX.Element {
  const popupRef = useRef<HTMLDivElement>(null);
  // Base UI's default moves focus to the first tabbable (the Close button)
  // even when content already focused one of its own fields on mount (the
  // command palette focuses its search input). Respect that choice; otherwise
  // keep the default (first tabbable, or the popup itself on touch).
  const initialFocus = (interaction: string): boolean | HTMLElement | null => {
    const popup = popupRef.current;
    const active = popup?.ownerDocument.activeElement ?? null;
    if (popup && active && active !== popup && popup.contains(active)) return false;
    return interaction === 'touch' ? popup : true;
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal data-component="Modal">
        {/* forceRender keeps the nested-dialog dimming identical to the
            pre-Base UI look, where every open Modal painted its own backdrop. */}
        <Dialog.Backdrop className="pr-modal__backdrop" forceRender />
        <Dialog.Popup
          ref={popupRef}
          className={cx('pr-modal__dialog', className)}
          data-size={size === 'md' ? undefined : size}
          aria-modal="true"
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          <header className="pr-modal__header">
            <Dialog.Title className="type-heading">{title}</Dialog.Title>
            <Dialog.Close className="pr-modal__close" aria-label="Close">
              ×
            </Dialog.Close>
          </header>
          {description ? (
            <Dialog.Description className="pr-modal__description">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="pr-modal__body">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
