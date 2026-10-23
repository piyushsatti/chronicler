import { useId, useState, type ReactNode, type Ref } from 'react';
import { cx } from './cx.js';
import { Menu } from './Menu.js';
import { useControllable } from './useControllable.js';

export type FilterBarProps = {
  /** Accessible name of the filter region, e.g. "Filter chronicles". */
  label: string;
  /** Right-aligned result count; announced politely when it changes. */
  count?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/** One full-width filter surface at the top of an index page: search field,
 * chip groups or a Picker, and a right-aligned count. Wraps on narrow
 * screens. Index pages never put filters in a side rail. */
function FilterBarRoot({ label, count, children, className }: FilterBarProps): React.JSX.Element {
  return (
    <section className={cx('filter-bar', className)} aria-label={label} data-component="FilterBar">
      <div className="filter-bar__controls">{children}</div>
      {count !== undefined && count !== null ? (
        <p className="filter-bar__count type-caption" aria-live="polite">
          {count}
        </p>
      ) : null}
    </section>
  );
}

export type FilterBarSearchProps = {
  /** Visible to assistive tech only; the placeholder carries the hint. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  /** Lets the page move focus to the field, e.g. after closing a detail view. */
  inputRef?: Ref<HTMLInputElement>;
};

/** Search input with a fixed inline size (--filter-search-width) so the bar
 * never reflows while the user types. */
function FilterBarSearch({
  label,
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  name,
  inputRef,
}: FilterBarSearchProps): React.JSX.Element {
  const [current, setCurrent] = useControllable({ value, defaultValue, onChange: onValueChange });
  return (
    <div className="filter-bar__search" data-el="filter-bar.search">
      <input
        ref={inputRef}
        aria-label={label}
        type="search"
        className="field-input filter-bar__input"
        name={name}
        placeholder={placeholder}
        value={current ?? ''}
        onChange={(event) => setCurrent(event.target.value)}
      />
    </div>
  );
}

export type FilterBarGroupProps = {
  /** Short caption before the group, e.g. "Author". */
  label?: string;
  children?: ReactNode;
};

/** A labelled cluster of chips (or a Picker) inside the bar. */
function FilterBarGroup({ label, children }: FilterBarGroupProps): React.JSX.Element {
  const id = useId();
  return (
    <div
      className="filter-bar__group"
      role="group"
      aria-labelledby={label ? id : undefined}
      data-el="filter-bar.group"
    >
      {label ? (
        <span id={id} className="type-label">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

export type FilterBarPickerOption = {
  value: string;
  label: string;
  /** Optional count shown after the label (e.g. entries per category). */
  count?: number | null;
};

export type FilterBarPickerProps = {
  /** Visible caption before the trigger; also names the menu. */
  label: string;
  options: FilterBarPickerOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

/** Single-choice filter on the Menu primitive, in place of a native select:
 * same trigger skin as the bar's chips and search, keyboard handled by Menu. */
function FilterBarPicker({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
}: FilterBarPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const current = options.find((option) => option.value === value) ?? options[0];
  const countOf = (option: FilterBarPickerOption | undefined): ReactNode =>
    option?.count !== null && option?.count !== undefined ? (
      <span className="filter-bar__picker-count type-caption">{option.count}</span>
    ) : null;
  return (
    <div className="filter-bar__picker" data-el="filter-bar.picker" data-disabled={disabled || undefined}>
      <span className="type-label" id={labelId}>
        {label}
      </span>
      <Menu
        ariaLabel={label}
        triggerLabelledBy={`${labelId} ${valueId}`}
        triggerDisabled={disabled}
        open={disabled ? false : open}
        onOpenChange={(next) => setOpen(disabled ? false : next)}
        trigger={
          <span className="filter-bar__picker-trigger" id={valueId}>
            <span className="type-ui">{current?.label ?? value}</span>
            {countOf(current)}
            <span aria-hidden="true" className="filter-bar__picker-caret">
              ▾
            </span>
          </span>
        }
        items={options.map((option) => ({
          key: option.value || 'all',
          textValue: option.label,
          current: option.value === value,
          label: (
            <>
              {option.label}
              {countOf(option)}
            </>
          ),
          onSelect: () => onValueChange(option.value),
        }))}
      />
    </div>
  );
}

type FilterBarCompound = typeof FilterBarRoot & {
  Search: typeof FilterBarSearch;
  Group: typeof FilterBarGroup;
  Picker: typeof FilterBarPicker;
};

const FilterBarCompoundImpl = FilterBarRoot as FilterBarCompound;
FilterBarCompoundImpl.Search = FilterBarSearch;
FilterBarCompoundImpl.Group = FilterBarGroup;
FilterBarCompoundImpl.Picker = FilterBarPicker;

export const FilterBar = FilterBarCompoundImpl;
export { FilterBarSearch, FilterBarGroup, FilterBarPicker };
