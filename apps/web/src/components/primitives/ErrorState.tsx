import type { ReactNode } from 'react';
import { Button } from './Button.js';

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
  children,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div className={className} data-component="ErrorState" role="alert">
      <h2 className="type-heading">{title}</h2>
      {message ? <p className="type-body">{message}</p> : null}
      {children}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
