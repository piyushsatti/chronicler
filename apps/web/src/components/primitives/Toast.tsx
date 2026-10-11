import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import { addToast, dismissToast, type ToastTone } from '../../store/toastsSlice.js';
import { Button } from './Button.js';

export type ToastProps = {
  children?: ReactNode;
  className?: string;
  tone?: ToastTone;
};

/** Presentational toast chip (legacy primitives/Toast surface). */
export function Toast({
  children,
  className,
  tone = 'info',
}: ToastProps): React.JSX.Element {
  return (
    <div
      className={className}
      data-component="Toast"
      data-tone={tone}
      role="status"
    >
      {children}
    </div>
  );
}

/** Live host bound to Redux toasts slice. */
export function ToastHost(): React.JSX.Element | null {
  const items = useAppSelector((s) => s.toasts.items);
  const dispatch = useAppDispatch();
  if (items.length === 0) return null;
  return (
    <div className="toast-host stack" data-el="toast.host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone} role="status">
          <span className="type-body">{t.message}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => dispatch(dismissToast(t.id))}
            aria-label="Dismiss"
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Hook-shaped helper for gallery / panels without prop drilling. */
export function useToast(): {
  addToast: (message: string, tone?: ToastTone) => void;
} {
  const dispatch = useAppDispatch();
  return {
    addToast: (message, tone = 'info') => {
      dispatch(addToast({ message, tone }));
    },
  };
}
