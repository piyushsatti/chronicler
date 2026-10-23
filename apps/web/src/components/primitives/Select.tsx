import { useId } from 'react';
import { cx } from './cx.js';
import { Menu } from './Menu.js';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  /** Names the control for assistive tech; also the menu name. */
  label: string;
  /** The visible caption's id, when the caller draws one; it then names the trigger. */
  labelId?: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  /** Included in a surrounding form's data as a hidden field. */
  name?: string;
  'aria-describedby'?: string;
  className?: string;
};

/** Single-choice field on the Menu primitive, in place of a native select:
 * the field skin (border, height, caret) with arrow-key and typeahead handling
 * from Menu. Filters inside a FilterBar use FilterBar.Picker instead. */
export function Select({
  label,
  labelId,
  value,
  options,
  onValueChange,
  placeholder = 'Select…',
  disabled = false,
  name,
  'aria-describedby': describedBy,
  className,
}: SelectProps): React.JSX.Element {
  const valueId = useId();
  const current = options.find((option) => option.value === value);
  return (
    <div className={cx('select', className)} data-component="Select" data-disabled={disabled || undefined}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Menu
        ariaLabel={label}
        triggerLabelledBy={labelId ? `${labelId} ${valueId}` : undefined}
        triggerDisabled={disabled}
        triggerDescribedBy={describedBy}
        listClassName="select__list"
        items={options.map((option) => ({
          key: option.value || 'none',
          textValue: option.label,
          current: option.value === value,
          label: option.label,
          onSelect: () => onValueChange(option.value),
        }))}
        trigger={
          <span className="select__trigger" id={valueId} data-placeholder={current ? undefined : '1'}>
            <span className="type-ui">{current?.label ?? placeholder}</span>
            <span aria-hidden="true" className="select__caret">
              ▾
            </span>
          </span>
        }
      />
    </div>
  );
}
