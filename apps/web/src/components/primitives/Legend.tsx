import { cx } from './cx.js';

export type LegendItem = {
  id: string;
  label: string;
};

export type LegendProps = {
  items: LegendItem[];
  'aria-label'?: string;
  className?: string;
};

/** Keyed legend list for status / heat keys. */
export function Legend({
  items,
  'aria-label': ariaLabel = 'Legend',
  className,
}: LegendProps): React.JSX.Element {
  return (
    <ul
      className={cx('legend', 'stack', className)}
      data-component="Legend"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <li key={item.id} className="type-caption">
          {item.label}
        </li>
      ))}
    </ul>
  );
}
