import { navPatternFor } from '@pi/react-imposition';
import { useSizeClasses } from '@pi/react-imposition/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { canAccessVerify, isAdmin } from '../auth/roles.js';
import { useAuth } from '../auth/AuthContext.js';
import { useSearchDialog } from '../features/search/components/SearchCommandRoot.js';
import { useMe } from '../hooks/useMe.js';
import { useAppDispatch } from '../store/hooks.js';
import { dialogClosed, dialogOpened } from '../store/searchSlice.js';
import {
  destinationsForAuth,
  siteLinksPlacement,
  type SiteDestination,
} from './destinations.js';
import { NavDrawer } from './NavDrawer.js';
import { NotificationBell } from './NotificationBell.js';

function BrandGlyph(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 1H2C1.4 1 1 1.4 1 2v10c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V3.5L8.5 1z" />
      <path d="M8.5 1v2.5H11" />
      <path d="M3 6h6M3 8h6M3 10h4" />
    </svg>
  );
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20 L16 16" />
    </svg>
  );
}

function DiscordMark(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4.4A19 19 0 0 0 15.3 3l-.2.5a14 14 0 0 1 4.2 2.1A13 13 0 0 0 4.7 5.6 14 14 0 0 1 9 3.5L8.7 3A19 19 0 0 0 4 4.4 19.7 19.7 0 0 0 .5 18a19 19 0 0 0 5.8 3l.8-1.2a12 12 0 0 1-1.9-.9l.5-.4a13.6 13.6 0 0 0 11.6 0l.5.4a12 12 0 0 1-1.9.9l.8 1.2a19 19 0 0 0 5.8-3A19.6 19.6 0 0 0 20 4.4zM8.3 14.7c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  );
}

function NavIcon({ id }: { id: string }): React.JSX.Element {
  const common = {
    className: 'ico',
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (id === 'quests') {
    return (
      <svg {...common}>
        <path d="M12 3 L14.5 9 L21 9.3 L16 13.3 L17.7 19.7 L12 16 L6.3 19.7 L8 13.3 L3 9.3 L9.5 9 Z" />
      </svg>
    );
  }
  if (id === 'chronicles') {
    return (
      <svg {...common}>
        <path d="M14 3H6C5.4 3 5 3.4 5 4V20C5 20.6 5.4 21 6 21H18C18.6 21 19 20.6 19 20V8L14 3Z" />
        <path d="M14 3V8H19" />
        <path d="M8 12H16M8 15H16M8 18H13" />
      </svg>
    );
  }
  if (id === 'codex') {
    return (
      <svg {...common}>
        <path d="M4 4h8v16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M12 4h4l1 2v13a1 1 0 0 1-1 1h-4V4z" />
        <path d="M12 4v16" />
        <path d="M7 8h2M7 11h2M7 14h2" />
      </svg>
    );
  }
  if (id === 'rules') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 12h8M8 15h5" />
        <path d="M4 8h1M4 12h1M4 16h1" strokeWidth="2" />
      </svg>
    );
  }
  if (id === 'community') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="15" cy="8" r="3" />
        <path d="M3 20C3 16.5 5.5 14.5 9 14.5H15C18.5 14.5 21 16.5 21 20" />
      </svg>
    );
  }
  if (id === 'verification') {
    return (
      <svg {...common}>
        <path d="M12 2l6 3v5.1c0 4.6-2.9 8.8-7 10-4.1-1.2-7-5.4-7-10V5l8-3Z" />
        <path d="M9 11.5 11 13.5 14.5 10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 11 L12 3 L21 11" />
      <path d="M5 9.5 V20 H19 V9.5" />
    </svg>
  );
}

function DestinationLinks({
  destinations,
  placement,
  pathname,
}: {
  destinations: readonly SiteDestination[];
  placement: 'top' | 'bottom';
  pathname: string;
}): React.JSX.Element {
  return (
    <nav
      className={
        placement === 'bottom'
          ? 'site-chrome__bottom app-shell__bottomnav'
          : 'site-chrome__links nav-links-row'
      }
      data-site-links
      data-site-links-placement={placement}
      aria-label="Primary"
    >
      {destinations.map((destination) => {
        const active = destination.matches(pathname);
        const visible =
          placement === 'bottom'
            ? (destination.shortLabel ?? destination.label)
            : destination.label;
        return (
          <Link
            key={destination.id}
            to={destination.href}
            className="site-chrome__link"
            data-nav-item
            aria-current={active ? 'page' : undefined}
            aria-label={destination.label}
          >
            <NavIcon id={destination.id} />
            <span className="site-chrome__link-label">{visible}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AccountSlot({
  isAuthenticated,
  name,
}: {
  isAuthenticated: boolean;
  name: string | undefined;
}): React.JSX.Element {
  if (!isAuthenticated) {
    return (
      <Link className="site-chrome__login" to="/login">
        <DiscordMark />
        Log in
      </Link>
    );
  }
  const label = name ?? 'Account';
  const initial = label.slice(0, 1).toUpperCase();
  return (
    <Link className="site-chrome__avatar" to="/me" aria-label={label}>
      <span aria-hidden="true">{initial}</span>
    </Link>
  );
}

/**
 * Live chrome. Search and Log in stay in the top strip.
 * Links sit in the bottom bar for bottom-bar; drawer pattern uses NavDrawer;
 * every other pattern joins links to the top.
 */
export function SiteChrome({ children }: { children: ReactNode }): React.JSX.Element {
  const searchDialog = useSearchDialog();
  const dispatch = useAppDispatch();
  const { widthClass, heightClass } = useSizeClasses();
  const pattern = navPatternFor(widthClass, heightClass);
  const placement = siteLinksPlacement(pattern);
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const me = useMe();
  const confirmedNoMember =
    !me.isLoading && !me.isError && me.data === null;
  const isSignedIn = isAuthenticated && !confirmedNoMember;

  useEffect(() => {
    if (isAuthenticated && confirmedNoMember) {
      logout();
    }
  }, [isAuthenticated, confirmedNoMember, logout]);

  useEffect(() => {
    if (searchDialog.open) {
      dispatch(dialogOpened());
    } else {
      dispatch(dialogClosed());
    }
  }, [dispatch, searchDialog.open]);

  const roles = me.data?.roles ?? [];
  const destinations = destinationsForAuth({
    isAuthenticated,
    isAdmin: isAdmin(roles),
    canVerify: canAccessVerify(roles),
  });
  const showDrawer = pattern === 'drawer';
  const showTopLinks = placement === 'top' && !showDrawer;
  const links = (
    <DestinationLinks
      destinations={destinations}
      placement={placement}
      pathname={location.pathname}
    />
  );

  const openSearch = (): void => {
    dispatch(dialogOpened());
    searchDialog.openSearch();
  };

  return (
    <div
      className="site-chrome app-shell"
      data-site-chrome
      data-site-pattern={pattern}
      data-el="shell.root"
    >
      <header className="site-chrome__top">
        <Link className="site-chrome__brand" to="/" aria-label="Chronicler">
          <span className="site-chrome__brand-mark" aria-hidden="true">
            <BrandGlyph />
          </span>
        </Link>
        {showDrawer ? <NavDrawer destinations={destinations} /> : null}
        {showTopLinks ? links : null}
        <span className="site-chrome__spacer" />
        <button
          type="button"
          className="site-chrome__search"
          aria-label="Search the chronicle"
          aria-haspopup="dialog"
          aria-expanded={searchDialog.open}
          onClick={openSearch}
        >
          <SearchIcon />
          <span className="site-chrome__search-label">Search the chronicle</span>
          <kbd className="site-chrome__search-kbd">⌘K</kbd>
        </button>
        <NotificationBell />
        <AccountSlot
          isAuthenticated={isSignedIn}
          name={me.data?.displayName ?? me.data?.handle}
        />
      </header>
      <main id="main" tabIndex={-1} className="site-chrome__main app-shell__main">
        {children}
      </main>
      {placement === 'bottom' ? links : null}
    </div>
  );
}
