import { navPatternFor } from '@pi/react-imposition';
import { useSizeClasses } from '@pi/react-imposition/react';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentAccess } from '../auth/useCurrentAccess.js';
import { useAuth } from '../auth/AuthContext.js';
import { useOwnsCharacter } from '../features/member/hooks/useOwnsCharacter.js';
import { useSearchDialog } from '../features/search/components/SearchCommandRoot.js';
import { isDm } from '../auth/roles.js';
import { useMe } from '../hooks/useMe.js';
import { personName } from '../utils/format.js';
import {
  destinationsForAuth,
  isPersonalPath,
  type SiteDestination,
} from './destinations.js';
import { NavDrawer } from './NavDrawer.js';
import { NotificationBell } from './NotificationBell.js';
import { SegmentedNav } from '../components/primitives/SegmentedNav.js';

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

function DestinationLinks({
  destinations,
  pathname,
  personal,
}: {
  destinations: readonly SiteDestination[];
  pathname: string;
  /** On personal routes the avatar is active and no main item is. */
  personal: boolean;
}): React.JSX.Element {
  return (
    <SegmentedNav
      label="Primary"
      siteLinksPlacement="top"
      className="site-chrome__links nav-links-row"
      itemClassName="site-chrome__link"
      items={destinations.map((destination) => ({
        to: destination.href,
        label: destination.label,
        current: !personal && destination.matches(pathname),
      }))}
    />
  );
}

function AccountSlot({
  isAuthenticated,
  name,
  active,
}: {
  isAuthenticated: boolean;
  name: string | undefined;
  active: boolean;
}): React.JSX.Element {
  if (!isAuthenticated) {
    return (
      <Link className="site-chrome__login" to="/login">
        Log in
      </Link>
    );
  }
  const label = name ?? 'Account';
  const initial = label.slice(0, 1).toUpperCase();
  return (
    <Link
      className="site-chrome__avatar"
      to="/me"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span aria-hidden="true">{initial}</span>
    </Link>
  );
}

/** The top menu owns site navigation; wider drawer layouts keep NavDrawer. */
export function SiteChrome({ children }: { children: ReactNode }): React.JSX.Element {
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    let active = true;
    let publishedHeight: string | undefined;
    const publishHeight = (): void => {
      if (!active) return;
      const height = header.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      publishedHeight = `${height}px`;
      root.style.setProperty('--site-header-height', publishedHeight);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(header, { box: 'border-box' });
    return () => {
      active = false;
      observer.disconnect();
      if (root.style.getPropertyValue('--site-header-height') === publishedHeight) {
        root.style.removeProperty('--site-header-height');
      }
    };
  }, []);

  const searchDialog = useSearchDialog();
  const { widthClass, heightClass, twoPaneCapable } = useSizeClasses();
  const pattern = navPatternFor(widthClass, heightClass);
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const me = useMe();
  const confirmedNoMember = !me.isLoading && !me.isError && me.data === null;
  const isSignedIn = isAuthenticated && !confirmedNoMember;

  useEffect(() => {
    if (isAuthenticated && confirmedNoMember) {
      logout();
    }
  }, [isAuthenticated, confirmedNoMember, logout]);

  const adminAccess = useCurrentAccess('admin');
  const destinations = destinationsForAuth({
    isAuthenticated,
    isAdmin: adminAccess.allowed,
    isDm: isSignedIn && isDm(me.data?.roles),
  });
  const ownCharacter = useOwnsCharacter(
    /^\/characters\/([^/]+)/.exec(location.pathname)?.[1] ?? null,
  );
  // The DM dashboard has its own bar item when shown, so the avatar yields.
  const onDmItem = destinations.some(
    (destination) => destination.id === 'dm' && destination.matches(location.pathname),
  );
  const personal =
    isSignedIn &&
    !onDmItem &&
    (ownCharacter || isPersonalPath(location.pathname, me.data?.handle));
  const showDrawer = pattern === 'drawer';
  const topLinks = (
    <DestinationLinks
      destinations={destinations}
      pathname={location.pathname}
      personal={personal}
    />
  );

  return (
    <div
      id="app"
      className="site-chrome app-shell"
      data-app-root
      data-width-class={widthClass}
      data-height-class={heightClass}
      data-two-pane={twoPaneCapable ? 'true' : 'false'}
      data-nav-pattern={pattern}
      data-site-chrome
      data-site-pattern={pattern}
      data-el="shell.root"
    >
      <header ref={headerRef} className="site-chrome__top">
        <Link className="site-chrome__brand" to="/" aria-label="Chronicler home">
          <img src={new URL('../assets/chronicler-logo.svg', import.meta.url).href} alt="Chronicler" />
        </Link>
        {showDrawer ? (
          <NavDrawer destinations={destinations} personal={personal} />
        ) : null}
        {topLinks}
        <span className="site-chrome__spacer" />
        <button
          type="button"
          className="site-chrome__search"
          aria-label="Search the chronicle"
          aria-haspopup="dialog"
          aria-expanded={searchDialog.open}
          onClick={searchDialog.openSearch}
        >
          <SearchIcon />
          <span className="site-chrome__search-label">Search the chronicle</span>
          <kbd className="site-chrome__search-kbd">⌘K</kbd>
        </button>
        {adminAccess.status === 'error' ? (
          <button
            type="button"
            className="type-link"
            onClick={() => {
              adminAccess.reload();
            }}
          >
            Retry staff access
          </button>
        ) : null}
        <NotificationBell />
        <AccountSlot
          isAuthenticated={isSignedIn}
          name={personName(me.data)}
          active={personal}
        />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="site-chrome__main app-shell__main"
        data-shell-main
      >
        {children}
      </main>
    </div>
  );
}
