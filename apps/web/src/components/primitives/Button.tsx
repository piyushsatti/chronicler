import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx.js';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pending?: boolean;
};

/** Shared native button. Pending uses the native disabled state to block both
 * pointer and keyboard activation while retaining the caller's button text. */
export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  pending = false,
  'aria-busy': ariaBusy,
  ...rest
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || pending;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      className={cx(
        'btn',
        `btn--${variant}`,
        variant === 'primary' && 'primary',
        variant === 'ghost' && 'ghost',
        variant === 'danger' && 'btn--danger',
        `btn--${size}`,
        size !== 'md' && size,
        className,
      )}
      data-component="Button"
      data-primitive="button"
      data-variant={variant}
      data-size={size}
      aria-busy={pending ? true : ariaBusy}
    >
      {children}
    </button>
  );
}
