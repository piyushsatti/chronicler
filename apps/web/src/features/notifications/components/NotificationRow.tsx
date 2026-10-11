import { Link } from 'react-router-dom';
import { Card } from '../../../components/primitives/Card.js';
import type { NotificationView } from '../types.js';

const KIND_LABELS: Record<string, string> = {
  character_verification_decided: 'Character review',
  quest_signup_confirmed: 'Quest signup confirmed',
  quest_waitlist_promoted: 'Quest waitlist promoted',
  quest_signup: 'Quest signup',
  document_edited: 'Document updated',
  document_published: 'Document published',
  dm_mentioned: 'You were mentioned',
  quest_scheduled: 'Quest scheduled',
  dm_request_decided: 'DM request updated',
};

function notificationLabel(kind: string): string {
  return KIND_LABELS[kind.toLowerCase()] ?? 'Notification update';
}

function notificationHref(notification: NotificationView): string | null {
  const code = notification.subjectCode?.trim();
  if (!code) return null;
  switch (notification.subjectType.toLowerCase()) {
    case 'character':
      return `/characters/${code}`;
    case 'quest':
      return `/quests/${code}`;
    default:
      return null;
  }
}

function formatCreatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function NotificationRow({
  notification,
}: {
  notification: NotificationView;
}): React.JSX.Element {
  const isUnread = notification.unread;
  const displayTitle = notification.title ?? 'Notification update';
  const displaySummary = notification.summary ?? '';
  const displayKind = notification.label || notificationLabel(notification.kind);
  const href = notificationHref(notification);
  const created = formatCreatedAt(notification.createdAt);
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
      <span aria-hidden="true" className="type-label">
        {isUnread ? '●' : '○'}
      </span>
      <div className="stack">
        <div className="row">
          <span className="type-label" data-el="notifications.row.kind">
            {displayKind}
          </span>
          <span className="type-caption" data-el="notifications.row.readState">
            {isUnread ? 'Unread' : 'Read'}
          </span>
        </div>
        {title}
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
