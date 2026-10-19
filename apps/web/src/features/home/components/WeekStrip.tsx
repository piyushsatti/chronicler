import { WeekGrid, bucketFor, type DayCell } from '../../../components/primitives/WeekGrid.js';

export interface WeekStripProps {
  quests: Array<{ scheduledAt?: string | null }>;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekStrip({ quests }: WeekStripProps): React.JSX.Element {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const countByDay = new Map<string, number>();
  for (const q of quests) {
    if (!q.scheduledAt) continue;
    const day = new Date(q.scheduledAt).toDateString();
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }

  const cells: DayCell[] = days.map((d) => {
    const key = d.toDateString();
    const count = countByDay.get(key) ?? 0;
    return { date: key, count, bucket: bucketFor(count) };
  });

  return (
    <WeekGrid
      ariaLabel="Next 7 days schedule"
      className="week"
      heat={false}
      days={cells}
      renderCell={(cell) => {
        const d = new Date(cell.date);
        return (
          <div className="day" data-busy={cell.count > 1 ? 1 : 0}>
            <div className="dow">
              {DOW[d.getDay()]} {d.getDate()}
            </div>
            <div className="type-value">{cell.count || '—'}</div>
            <div className="lbl">
              {cell.count ? (cell.count > 1 ? 'sessions' : 'session') : 'open'}
            </div>
          </div>
        );
      }}
    />
  );
}
