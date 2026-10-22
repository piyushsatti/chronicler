import type { ReactNode } from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { cx } from './cx.js';

export type CheckboxProps = {
  /** Visible label. Omit only when `ariaLabel` names a box whose row says what it selects. */
  label?: ReactNode;
  ariaLabel?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  className?: string;
};

/**
 * Labelled checkbox. Headless primitive + project CSS skin: Base UI Checkbox
 * supplies the checkbox role, keyboard toggling, the hidden form input and
 * labelling from the wrapping <label>; `.checkbox*` supply the look and key
 * on Base UI's `data-checked` / `data-disabled` state attributes.
 */
export function Checkbox({
  label,
  ariaLabel,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  name,
  value,
  className,
}: CheckboxProps): React.JSX.Element {
  return (
    <label
      className={cx('checkbox', className)}
      data-component="Checkbox"
      data-disabled={disabled ? '' : undefined}
    >
      <BaseCheckbox.Root
        className="checkbox__box"
        aria-label={ariaLabel}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => onCheckedChange?.(next)}
        disabled={disabled}
        name={name}
        value={value}
      >
        <BaseCheckbox.Indicator className="checkbox__indicator">
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2.5 6.2 5 8.6l4.5-5" />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label != null ? <span className="checkbox__label">{label}</span> : null}
    </label>
  );
}
