import type { ReactNode } from 'react';
import { Button } from './Button.js';

/** Toast tone. Single definition; the app toast slice imports it from here. */
export type ToastTone = 'info' | 'error' | 'success';

export type ToastProps = {
  children?: ReactNode;
  className?: string;
  tone?: ToastTone;
  /** Renders a dismiss control when set. */
  onDismiss?: () => void;
};

/** Toast surface: raised panel with a tone rail. ToastHost stacks these. */
export function Toast({
  children,
  className,
  tone = 'info',
  onDismiss,
}: ToastProps): React.JSX.Element {
  return (
    <div
      className={['pr-toast', className].filter(Boolean).join(' ')}
      data-component="Toast"
      data-type={tone}
      data-tone={tone}
      role="status"
    >
      <span className="type-body">{children}</span>
      {onDismiss ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pr-toast__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </Button>
      ) : null}
    </div>
  );
}
