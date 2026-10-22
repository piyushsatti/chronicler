import { useState, type ReactNode } from 'react';
import { dayLabel, formatInstant } from '../../utils/format.js';

export type HeatBucket = 0 | 1 | 2 | 3 | 4;

export type DayCell = {
  date: string;
  count: number;
  bucket: HeatBucket;
};

export type WeekGridProps = {
  days?: DayCell[];
  weekStart?: string;
  onWeekStartChange?: (d: string) => void;
  defaultWeekStart?: string;
  selectedDate?: string;
  onSelectedDateChange?: (d: string | null) => void;
  defaultSelectedDate?: string;
  renderCell?: (cell: DayCell, state: { selected: boolean }) => ReactNode;
  onDrillDown?: (date: string) => void;
  heat?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
};

export function bucketFor(count: number): HeatBucket {
  if (count <= 0) return 0;
  if (count <= 10) return 1;
  if (count <= 50) return 2;
  if (count <= 150) return 3;
  return 4;
}

function DefaultCell({ cell, selected }: { cell: DayCell; selected: boolean }) {
  return (
    <div className="stack" data-gap="0" data-tone={selected ? 'accent' : 'neutral'}>
      <span className="type-caption">{dayLabel(cell.date)}</span>
      <span className="type-value">{cell.count}</span>
    </div>
  );
}

/** Full date for civil dates ("22 Oct 2026"); other keys (e.g. "Sun") as given. */
function cellName(date: string): string {
  return dayLabel(date) === date ? date : formatInstant(date, null, 'date');
}

/** Headless 7-column day-cell grid. */
export function WeekGrid({
  days,
  weekStart,
  onWeekStartChange,
  defaultWeekStart,
  selectedDate,
  onSelectedDateChange,
  defaultSelectedDate,
  renderCell,
  onDrillDown,
  heat = true,
  className,
  ariaLabel = 'Week',
  children,
}: WeekGridProps): React.JSX.Element {
  void weekStart;
  void onWeekStartChange;
  void defaultWeekStart;

  const [uncontrolledSelected, setUncontrolledSelected] = useState(defaultSelectedDate);
  const currentSelected = selectedDate ?? uncontrolledSelected;

  if (!days?.length) {
    return (
      <div
        className={className}
        data-component="WeekGrid"
        role="list"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }

  function selectDate(d: string): void {
    if (selectedDate === undefined) setUncontrolledSelected(d);
    onSelectedDateChange?.(d);
    onDrillDown?.(d);
  }

  return (
    <div
      className={['cols', className].filter(Boolean).join(' ')}
      data-cols="7"
      data-gap="2"
      data-component="WeekGrid"
      data-el="week-grid.root"
      data-heat={heat ? '1' : undefined}
      role="list"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {days.slice(0, 7).map((cell) => {
        const selected = cell.date === currentSelected;
        const interactive = Boolean(onDrillDown ?? onSelectedDateChange);
        const content = renderCell ? (
          renderCell(cell, { selected })
        ) : (
          <DefaultCell cell={cell} selected={selected} />
        );
        // Cell hooks match primitives.css's WeekGrid section: chrome and heat
        // shading apply only to the built-in skin; renderCell owns its box.
        const cellHooks = {
          'data-el': 'week-grid.cell',
          'data-skin': renderCell ? 'custom' : 'default',
          'data-heat': heat ? cell.bucket : undefined,
          'data-selected': selected ? '1' : undefined,
        };
        if (!interactive) {
          return (
            <div key={cell.date} role="listitem" {...cellHooks}>
              {content}
            </div>
          );
        }
        return (
          <button
            key={cell.date}
            type="button"
            role="listitem"
            {...cellHooks}
            onClick={() => selectDate(cell.date)}
            aria-label={`${cellName(cell.date)}: ${cell.count}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
