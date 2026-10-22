import {
  WeekGrid,
  bucketFor,
  type DayCell,
} from '../../../components/primitives/WeekGrid.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { civilDateInZone, nextCivilDay } from '../../../utils/format.js';

export interface WeekStripProps {
  quests: Array<{ scheduledAt?: string | null }>;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekStrip({ quests }: WeekStripProps): React.JSX.Element {
  const { timeZone } = useDateFormatter();
  const countByDay = new Map<string, number>();
  for (const quest of quests) {
    const day = civilDateInZone(quest.scheduledAt, timeZone);
    if (day) countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }
  const cells: DayCell[] = [];
  let day = civilDateInZone(new Date().toISOString(), timeZone);
  for (let index = 0; index < 7 && day; index++) {
    const count = countByDay.get(day) ?? 0;
    cells.push({ date: day, count, bucket: bucketFor(count) });
    day = nextCivilDay(day);
  }
  return (
    <WeekGrid
      ariaLabel="Next 7 days schedule"
      className="week"
      heat={false}
      days={cells}
      renderCell={(cell) => {
        const civil = new Date(`${cell.date}T00:00:00Z`);
        return (
          <div className="day" data-busy={cell.count > 1 ? 1 : 0}>
            <div className="dow">
              {DOW[civil.getUTCDay()]} {civil.getUTCDate()}
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
