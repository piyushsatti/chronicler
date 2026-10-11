import { useState, type ReactNode } from 'react';

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
      <span className="type-caption">{cell.date}</span>
      <span className="type-value">{cell.count}</span>
    </div>
  );
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
      <div className={className} data-component="WeekGrid" role="list" aria-label={ariaLabel}>
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
        if (!interactive) {
          return (
            <div
              key={cell.date}
              role="listitem"
              data-bucket={cell.bucket}
              data-selected={selected ? '1' : undefined}
            >
              {content}
            </div>
          );
        }
        return (
          <button
            key={cell.date}
            type="button"
            role="listitem"
            data-bucket={cell.bucket}
            data-selected={selected ? '1' : undefined}
            onClick={() => selectDate(cell.date)}
            aria-label={`${cell.date}: ${cell.count}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
