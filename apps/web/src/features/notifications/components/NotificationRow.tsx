import { Link } from 'react-router-dom';
import { Chip } from '../../../components/primitives/Chip.js';
import { Card } from '../../../components/primitives/Card.js';
import type { NotificationView } from '../types.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { humanizeKey } from '../../../utils/format.js';

const KIND_LABELS: Record<string, string> = {
  character_verification_decided: 'Character review',
  quest_signup_confirmed: 'Quest signup confirmed',
  quest_waitlist_promoted: 'Quest waitlist promoted',
  quest_signup: 'Quest signup',
  document_edited: 'Document updated',
  document_published: 'Document published',
  dm_mentioned: 'You were mentioned',
  quest_scheduled: 'Quest scheduled',
};

function notificationLabel(kind: string): string {
  return KIND_LABELS[kind.toLowerCase()] ?? 'Notification update';
}

export function NotificationRow({
  notification,
}: {
  notification: NotificationView;
}): React.JSX.Element {
  const isUnread = notification.unread;
  const { formatDateTime } = useDateFormatter();
  const displayTitle = notification.title ?? 'Notification update';
  const displaySummary = notification.summary ?? '';
  const displayKind = notification.label
    ? humanizeKey(notification.label)
    : notificationLabel(notification.kind);
  const href =
    notification.destination.status === 'available'
      ? notification.destination.href
      : null;
  const created = notification.createdAt
    ? formatDateTime(notification.createdAt)
    : null;
  const title = href ? (
    <Link to={href} data-el="notifications.row.title" className="type-body">
      {displayTitle}
    </Link>
  ) : (
    <span className="type-body" data-el="notifications.row.title">
      {displayTitle}
    </span>
  );

  return (
    <Card
      data-el="notifications.row"
      data-unread={isUnread ? 'true' : 'false'}
      aria-label={`${displayKind}: ${displayTitle}${isUnread ? ', unread' : ''}`}
      className="row"
    >
      <div className="stack">
        <div className="row">
          <span className="type-label" data-el="notifications.row.kind">
            {displayKind}
          </span>
          <Chip size="sm" tone={isUnread ? 'accent' : 'line'}>
            <span data-el="notifications.row.readState">
              {isUnread ? 'Unread' : 'Read'}
            </span>
          </Chip>
        </div>
        {title}
        {notification.destination.status === 'unavailable' ? (
          <span className="type-caption" data-el="notifications.row.destination">
            {notification.destination.reason}
          </span>
        ) : null}
        {displaySummary ? (
          <span className="type-caption" data-el="notifications.row.summary">
            {displaySummary}
          </span>
        ) : null}
        {created ? (
          <span className="type-caption" data-el="notifications.row.createdAt">
            {created}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
