import { EmptyState } from '@pi/chronicler-ds';

const noop = () => undefined;

export function NoQuests() {
  return <EmptyState kind="no-quests" actionLabel="Post a quest" onAction={noop} />;
}

export function TimelineEmpty() {
  return <EmptyState kind="timeline-empty" />;
}

export function ScheduleEmpty() {
  return <EmptyState kind="schedule-empty" actionLabel="Schedule a session" onAction={noop} />;
}

export function SearchNoResults() {
  return (
    <EmptyState kind="search-no-results">
      <p className="type-caption">Try a character name, quest code or region.</p>
    </EmptyState>
  );
}

export function NotAuthorized() {
  return <EmptyState kind="not-authorized" />;
}
