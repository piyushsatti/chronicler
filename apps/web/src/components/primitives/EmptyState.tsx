import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { cx } from './cx.js';

export type EmptyStateKind =
  | 'no-quests'
  | 'no-characters'
  | 'no-guilds'
  | 'no-factions'
  | 'no-npcs'
  | 'no-results'
  | 'no-events'
  | 'no-series'
  | 'no-regions'
  | 'no-hexes'
  | 'generic'
  | 'timeline-empty'
  | 'search-no-results'
  | 'not-authorized'
  | 'not-found'
  | 'schedule-empty';

/** Default sentences, each saying what happened. Pass `message` for the
 * page's own words and `action` (or actionLabel/onAction) for its one action. */
const KIND_MESSAGES: Record<EmptyStateKind, string> = {
  'no-quests': 'No quests match.',
  'no-characters': 'No characters yet.',
  'no-guilds': 'No guilds yet.',
  'no-factions': 'No factions yet.',
  'no-npcs': 'No NPCs yet.',
  'no-results': 'Nothing matches these filters.',
  'no-events': 'Nothing has happened here yet.',
  'no-series': 'No series yet.',
  'no-regions': 'No regions yet.',
  'no-hexes': 'No hexes yet.',
  generic: 'Nothing here yet.',
  'timeline-empty': 'No chronicle entries yet.',
  'search-no-results': 'Nothing matches that search.',
  'not-authorized': 'You don’t have access to this.',
  'not-found': 'We couldn’t find that.',
  'schedule-empty': 'No sessions in the next 14 days.',
};

export type EmptyStateProps = {
  message?: string;
  kind?: EmptyStateKind;
  illustration?: ReactNode;
  /** The one action, usually a Link ("Find a quest"). Wins over actionLabel. */
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
};

/** "Nothing here" inside a page section: one sentence plus one action on the
 * parchment slot (`.empty-state`). Page-level states use StatePanel. */
export function EmptyState({
  message,
  kind = 'generic',
  illustration,
  action,
  actionLabel,
  onAction,
  className,
  children,
}: EmptyStateProps): React.JSX.Element {
  const text = message ?? KIND_MESSAGES[kind];
  const fallbackAction =
    actionLabel && onAction ? (
      <Button variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null;
  return (
    <div className={cx('empty-state', className)} data-component="EmptyState" data-kind={kind}>
      {illustration}
      <p className="type-body">{text}</p>
      {children}
      {action ?? fallbackAction}
    </div>
  );
}
