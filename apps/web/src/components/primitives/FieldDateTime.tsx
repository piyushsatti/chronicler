import type { ReactNode } from 'react';
import { cx } from './cx.js';
import { Field } from '../foundation/Field.js';

export type FieldDateTimeProps = {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
};

/** Labeled datetime field shell; pass a picker as children or use the native input. */
export function FieldDateTime({
  label,
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: FieldDateTimeProps): React.JSX.Element {
  return (
    <div className={cx('stack', className)} data-component="FieldDateTime">
      <Field label={label}>
        {children ?? (
          <input
            type="datetime-local"
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            aria-label={ariaLabel ?? label}
          />
        )}
      </Field>
    </div>
  );
}
