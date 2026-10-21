import { Avatar, WeekGrid } from '@pi/chronicler-ds';

type Cell = { date: string; count: number; bucket: 0 | 1 | 2 | 3 | 4 };

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const week: Cell[] = [
  { date: '2026-10-19', count: 0, bucket: 0 },
  { date: '2026-10-20', count: 1, bucket: 1 },
  { date: '2026-10-21', count: 2, bucket: 1 },
  { date: '2026-10-22', count: 0, bucket: 0 },
  { date: '2026-10-23', count: 1, bucket: 1 },
  { date: '2026-10-24', count: 4, bucket: 1 },
  { date: '2026-10-25', count: 3, bucket: 1 },
];

function StripCell(cell: Cell) {
  const civil = new Date(`${cell.date}T00:00:00Z`);
  return (
    <div className="day" data-busy={cell.count > 1 ? 1 : 0}>
      <div className="dow">
        {DOW[civil.getUTCDay()]} {civil.getUTCDate()}
      </div>
      <div className="type-value">{cell.count || '—'}</div>
      <div className="lbl">{cell.count ? (cell.count > 1 ? 'sessions' : 'session') : 'open'}</div>
    </div>
  );
}

export function SessionStrip() {
  return (
    <WeekGrid
      ariaLabel="Sessions this week"
      className="week"
      heat={false}
      days={week}
      renderCell={StripCell}
    />
  );
}

const roster: Record<string, string[]> = {
  '2026-10-19': [],
  '2026-10-20': ['Ilse Varrow'],
  '2026-10-21': ['Corwin Hale', 'Morwen Ashby'],
  '2026-10-22': [],
  '2026-10-23': ['Teodor Quill'],
  '2026-10-24': ['Ilse Varrow', 'Morwen Ashby', 'Teodor Quill', 'Corwin Hale'],
  '2026-10-25': ['Sable Wren', 'Maren Thistle', 'Ilse Varrow'],
};

export function DmAvailability() {
  return (
    <WeekGrid
      ariaLabel="DM availability this week"
      heat={false}
      days={week}
      renderCell={(cell: Cell) => {
        const free = roster[cell.date] ?? [];
        return (
          <div className="muster-day stack" data-gap="1">
            <span className="type-caption">{cell.date}</span>
            <div className="stack" data-gap="1" style={{ minHeight: 38 }}>
              {free.slice(0, 3).map((name) => (
                <Avatar key={name} name={name} size="xs" online={false} />
              ))}
              {cell.count === 0 ? <span className="type-caption">·</span> : null}
              {free.length > 3 ? <span className="type-caption">+{free.length - 3}</span> : null}
            </div>
          </div>
        );
      }}
    />
  );
}

const heatWeek: Cell[] = [
  { date: '2026-10-19', count: 0, bucket: 0 },
  { date: '2026-10-20', count: 1, bucket: 1 },
  { date: '2026-10-21', count: 3, bucket: 2 },
  { date: '2026-10-22', count: 5, bucket: 3 },
  { date: '2026-10-23', count: 2, bucket: 1 },
  { date: '2026-10-24', count: 8, bucket: 4 },
  { date: '2026-10-25', count: 6, bucket: 3 },
];

export function ActivityHeat() {
  return (
    <WeekGrid
      days={heatWeek}
      weekStart="2026-10-19"
      heat
      defaultSelectedDate="2026-10-24"
      ariaLabel="Table activity, week of 19 October 2026"
    />
  );
}
