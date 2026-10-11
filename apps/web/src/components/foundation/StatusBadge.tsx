import type { ReactNode } from 'react';

/**
 * Life statuses, rendered via Atlas `.status` (dot + label).
 * `LIFE_STATUS_VALUES` is the single source; `LifeStatus` and the runtime
 * `LIFE_STATUSES` set below are both derived from it.
 */
export const LIFE_STATUS_VALUES = [
  'alive',
  'dead',
  'retired',
  'missing',
  'active',
  'pending_approval',
] as const;
export type LifeStatus = (typeof LIFE_STATUS_VALUES)[number];

/** Quest lifecycle states, rendered via Atlas `.state`. */
export type QuestState =
  | 'completed'
  | 'closed'
  | 'open'
  | 'full'
  | 'scheduled'
  | 'filling'
  | 'live'
  | 'cancelled';

export type Status = LifeStatus | QuestState;

export type StatusBadgeProps = {
  status: Status;
  label?: string;
  bordered?: boolean;
  className?: string;
  count?: ReactNode;
};

const LIFE_STATUSES = new Set<Status>(LIFE_STATUS_VALUES);

function isLifeStatus(status: Status): status is LifeStatus {
  return LIFE_STATUSES.has(status);
}

const QUEST_STATE_KEY = {
  open: 'OPEN',
  filling: 'FILLING',
  full: 'FULL',
  scheduled: 'SCHEDULED',
  live: 'LIVE',
  closed: 'CLOSED',
  cancelled: 'CANCELLED',
  completed: 'CLOSED',
} as const satisfies Record<QuestState, string>;

type QuestStateKey = (typeof QUEST_STATE_KEY)[QuestState];

function toStateKey(status: QuestState): QuestStateKey {
  return QUEST_STATE_KEY[status];
}

const STATE_LABELS: Record<QuestStateKey, string> = {
  LIVE: 'Live',
  OPEN: 'Open',
  FILLING: 'Filling',
  FULL: 'Full',
  SCHEDULED: 'Scheduled',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const LIFE_LABELS: Record<LifeStatus, string> = {
  alive: 'Alive',
  dead: 'Dead',
  retired: 'Retired',
  missing: 'Missing',
  active: 'Active',
  pending_approval: 'Pending review',
};

export function StatusBadge({
  status,
  label,
  className,
  count,
}: StatusBadgeProps): React.JSX.Element {
  if (isLifeStatus(status)) {
    return (
      <span className={`status ${className ?? ''}`.trim()} data-s={status} data-component="StatusBadge">
        <span className="d" />
        {label ?? LIFE_LABELS[status]}
        {count != null ? <span>&nbsp;· {count}</span> : null}
      </span>
    );
  }

  const key = toStateKey(status);
  return (
    <span className={`state ${className ?? ''}`.trim()} data-s={key} data-component="StatusBadge">
      {key === 'LIVE' ? <span className="live-dot" /> : null}
      {label ?? STATE_LABELS[key]}
      {count != null ? <span>&nbsp;· {count}</span> : null}
    </span>
  );
}
