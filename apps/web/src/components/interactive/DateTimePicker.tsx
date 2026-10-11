export type DateTimePickerProps = {
  value?: string;
  onChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Minimal datetime control — native `datetime-local` for editor field parity.
 * Accepts ISO or local datetime strings; emits the raw input value.
 */
export function DateTimePicker({
  value = '',
  onChange,
  ariaLabel = 'Datetime',
  className,
  disabled,
}: DateTimePickerProps): React.JSX.Element {
  const local = toLocalInput(value);
  return (
    <input
      type="datetime-local"
      className={className ?? 'field'}
      value={local}
      disabled={disabled}
      aria-label={ariaLabel}
      data-component="DateTimePicker"
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

function toLocalInput(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !raw.includes('Z') && !/[+-]\d{2}:\d{2}$/.test(raw)) {
    return raw.slice(0, 16);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
