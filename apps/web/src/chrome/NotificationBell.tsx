import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.js';
import { NotificationRow } from '../features/notifications/components/NotificationRow.js';
import { useNotificationsPage } from '../features/notifications/hooks/useNotificationsPage.js';
import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount.js';
import styles from './notificationBell.module.css';

function BellIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function NotificationsPopover({ onClose, panelId, titleId, page, unreadCount }: {
  onClose: () => void;
  panelId: string;
  titleId: string;
  page: ReturnType<typeof useNotificationsPage>;
  unreadCount: number;
}): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);

  const items = page.status === 'ready'
    ? [...page.items].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))
    : [];

  return (
    <section id={panelId} className={styles.popover} role="dialog" aria-labelledby={titleId} data-el="nav.notificationBell.popover">
      <header className={styles.header}>
        <div>
          <h2 id={titleId}>Notifications</h2>
          <p className={styles.count} aria-live="polite">{unreadCount} unread</p>
        </div>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close notifications">
          <CloseIcon />
        </button>
      </header>
      <div className={styles.content} aria-live="polite">
        {page.status === 'loading' ? <p className={styles.empty}>Loading notifications…</p> : null}
        {page.status === 'error' ? (
          <div className={styles.empty} role="alert">
            <p>Notifications could not load.</p>
            <button type="button" className={styles.action} onClick={page.retry}>Retry</button>
          </div>
        ) : null}
        {page.status === 'ready' && items.length === 0 ? <p className={styles.empty}>No notifications yet.</p> : null}
        {page.status === 'ready' && items.length > 0 ? (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <NotificationRow notification={item} onActivate={(id) => { page.markRead([id]); onClose(); }} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {page.status === 'ready' ? (
        <footer className={styles.footer}>
          {page.loadMoreError ? <span className={styles.feedback} role="alert">Older notifications could not load.</span> : null}
          <span className={styles.feedback} role="status">
            {page.markReadFailureIds.length > 0 ? 'Some notifications could not be marked as read.' : ''}
          </span>
          {page.markReadFailureIds.length > 0 ? (
            <button type="button" className={styles.action} onClick={page.retryMarkRead}>Retry</button>
          ) : null}
          {page.hasNextPage ? (
            <button type="button" className={styles.action} disabled={page.isFetchingNextPage} onClick={page.fetchNextPage}>
              {page.isFetchingNextPage ? 'Loading…' : page.loadMoreError ? 'Retry loading' : 'Load older'}
            </button>
          ) : null}
          <button type="button" className={styles.action} disabled={unreadCount === 0} onClick={page.markAllRead}>
            Mark all read
          </button>
        </footer>
      ) : null}
    </section>
  );
}

export function NotificationBell(): React.JSX.Element | null {
  const { isAuthenticated } = useAuth();
  const unreadQ = useUnreadCount(isAuthenticated);
  const [open, setOpen] = useState(false);
  const page = useNotificationsPage({ markOnView: false, enabled: open });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isAuthenticated) return null;
  const count = unreadQ.data ?? 0;
  const notificationCount = count || (page.status === 'ready' ? page.items.filter((item) => item.unread).length : 0);
  const hasUnread = count > 0;

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.bell}
        aria-label={hasUnread ? `${count} unread notifications` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        data-el="nav.notificationBell"
      >
        <BellIcon />
        {hasUnread ? <span className={styles.unreadDot} aria-hidden="true" data-el="nav.notificationBell.count" /> : null}
      </button>
      {open ? <NotificationsPopover panelId={panelId} titleId={titleId} page={page} unreadCount={notificationCount} onClose={() => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); }} /> : null}
    </div>
  );
}
