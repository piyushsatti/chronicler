import { useEffect, useId, type ReactNode } from 'react';
import { cx } from './cx.js';

export type ModalProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  className?: string;
};

export function Modal({
  open,
  title,
  children,
  onClose,
  className,
}: ModalProps): React.JSX.Element | null {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-root" data-component="Modal" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className={cx('modal', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal__header">
          <h2 id={titleId} className="type-heading">
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
