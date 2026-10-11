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

const KIND_MESSAGES: Record<EmptyStateKind, string> = {
  'no-quests': 'NO QUESTS FOUND',
  'no-characters': 'NO CHARACTERS FOUND',
  'no-guilds': 'NO GUILDS FOUND',
  'no-factions': 'NO FACTIONS FOUND',
  'no-npcs': 'NO NPCs FOUND',
  'no-results': 'NO RESULTS',
  'no-events': 'NO EVENTS',
  'no-series': 'NO SERIES FOUND',
  'no-regions': 'NO REGIONS FOUND',
  'no-hexes': 'NO HEXES FOUND',
  generic: 'NOTHING HERE',
  'timeline-empty': 'THE CHRONICLE AWAITS — NO EVENTS RECORDED YET',
  'search-no-results': 'NO RESULTS FOUND IN THE ARCHIVE',
  'not-authorized': 'ACCESS DENIED — THIS AREA IS RESTRICTED',
  'not-found': 'THAT HEX IS NOT ON THE MAP',
  'schedule-empty': 'NO UPCOMING SESSIONS IN THE NEXT 14 DAYS',
};

export type EmptyStateProps = {
  message?: string;
  kind?: EmptyStateKind;
  illustration?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
};

export function EmptyState({
  message,
  kind = 'generic',
  illustration,
  actionLabel,
  onAction,
  className,
  children,
}: EmptyStateProps): React.JSX.Element {
  const text = message ?? KIND_MESSAGES[kind];
  return (
    <div className={cx('empty-state', className)} data-component="EmptyState" data-kind={kind}>
      {illustration}
      <p className="empty-state__message">{text}</p>
      {children}
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
