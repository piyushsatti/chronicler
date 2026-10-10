import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../auth/AuthContext.js';
import { loadUnreadCount } from '../features/member/adapters/notificationsAdapter.js';

export function NotificationBell(): React.JSX.Element | null {
  const { isAuthenticated } = useAuth();
  const unreadQ = useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: loadUnreadCount,
    enabled: isAuthenticated,
  });
  if (!isAuthenticated) return null;
  const count = unreadQ.data ?? 0;
  return (
    <Link
      className="site-chrome__bell"
      to="/me"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <path d="M12 3a5 5 0 0 0-5 5v3l-2 2h14l-2-2V8a5 5 0 0 0-5-5z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 ? <span className="site-chrome__bell-badge">{count}</span> : null}
    </Link>
  );
}
