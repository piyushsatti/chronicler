import { Calendar, WeekGrid } from '@pi/chronicler-ds';

const week = [
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
  '2026-10-25',
].map((date, i) => ({
  date,
  count: [0, 1, 3, 2, 5, 8, 4][i],
  bucket: [0, 1, 2, 1, 3, 4, 2][i] as 0 | 1 | 2 | 3 | 4,
}));

export function WithSessionList() {
  return (
    <Calendar title="Saturday 24 October" caption="3 sessions at the Lantern & Quill.">
      <ul className="stack" data-gap="2">
        <li className="type-body">14:00 · Ashes of Highmoor, Session 4 · DM Orla</li>
        <li className="type-body">18:30 · The Ember Road, Session 5 · DM Bastian</li>
        <li className="type-body">20:00 · One-shot: The Drowned Bell · DM Ines</li>
      </ul>
    </Calendar>
  );
}

export function WithCaption() {
  return <Calendar title="October 2026" caption="12 quests scheduled across 3 series." />;
}

export function WithWeekGrid() {
  return (
    <Calendar title="Week of 19 October" caption="Sessions per day across the guild.">
      <WeekGrid days={week} weekStart="2026-10-19" defaultSelectedDate="2026-10-24" ariaLabel="Sessions this week" />
    </Calendar>
  );
}
