import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount.js';

export function NotificationBell(): React.JSX.Element | null {
  const { isAuthenticated } = useAuth();
  const unreadQ = useUnreadCount(isAuthenticated);
  if (!isAuthenticated) return null;
  const count = unreadQ.data ?? 0;
  const hasUnread = typeof count === 'number' && count > 0;
  return (
    <Link
      className="site-chrome__bell"
      to="/notifications"
      data-el="nav.notificationBell"
      aria-label={hasUnread ? `${count} unread notifications` : 'Notifications'}
    >
      <svg
        className="ico"
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {hasUnread ? (
        <span
          data-el="nav.notificationBell.count"
          className="site-chrome__bell-badge chip"
          data-tone="accent"
          data-size="sm"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
