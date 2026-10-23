import type { NavPattern } from '@pi/react-imposition';

export type SiteDestination = {
  id: string;
  label: string;
  href: string;
  matches: (pathname: string) => boolean;
};

export type NavAuth = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  canVerify: boolean;
};

function matchesPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Six live bar destinations. Characters and Map are not bar items. */
export const PRIMARY_DESTINATIONS: readonly SiteDestination[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    matches: (pathname) => pathname === '/' || pathname === '',
  },
  {
    id: 'quests',
    label: 'Quests',
    href: '/quests',
    matches: (pathname) => matchesPath(pathname, ['/quests', '/series', '/calendar']),
  },
  {
    id: 'chronicles',
    label: 'Chronicles',
    href: '/chronicles',
    matches: (pathname) =>
      matchesPath(pathname, ['/chronicles', '/summaries', '/timeline']),
  },
  {
    id: 'codex',
    label: 'Codex',
    href: '/codex',
    matches: (pathname) =>
      matchesPath(pathname, ['/codex', '/npcs', '/factions', '/regions', '/map']),
  },
  {
    id: 'rules',
    label: 'Rules',
    href: '/rules',
    matches: (pathname) => matchesPath(pathname, ['/rules']),
  },
  {
    id: 'community',
    label: 'Community',
    href: '/community',
    matches: (pathname) =>
      matchesPath(pathname, ['/community', '/players', '/dms', '/characters']),
  },
];

const VERIFY_DESTINATION: SiteDestination = {
  id: 'verification',
  label: 'Verification',
  href: '/admin/review',
  matches: (pathname) => matchesPath(pathname, ['/admin/review']),
};

/** The admin workspace, minus Verification, which keeps its own link. */
const ADMIN_DESTINATION: SiteDestination = {
  id: 'admin',
  label: 'Admin',
  href: '/admin',
  matches: (pathname) =>
    matchesPath(pathname, ['/admin', '/gallery']) && !VERIFY_DESTINATION.matches(pathname),
};

/** Verification and Admin join the same link list when the member holds the right. */
export function destinationsForAuth(auth?: NavAuth): readonly SiteDestination[] {
  const extras = [
    ...(auth?.canVerify ? [VERIFY_DESTINATION] : []),
    ...(auth?.isAdmin ? [ADMIN_DESTINATION] : []),
  ];
  return [...PRIMARY_DESTINATIONS, ...extras];
}

/**
 * bottom-bar keeps the six links in the bottom bar.
 * drawer and inline-row join those links to the top bar.
 */
export function siteLinksPlacement(pattern: NavPattern): 'top' | 'bottom' {
  return pattern === 'bottom-bar' ? 'bottom' : 'top';
}

export function currentDestinationId(
  pathname: string,
  destinations: readonly SiteDestination[] = PRIMARY_DESTINATIONS,
): string {
  if (VERIFY_DESTINATION.matches(pathname)) {
    return VERIFY_DESTINATION.id;
  }
  const match = destinations.find((destination) => destination.matches(pathname));
  return match?.id ?? 'home';
}

/** Fixed personal paths: the hub, account pages, the DM dashboard and the
 * DM-table editor (a DM's own tables, reached from /dm). */
const PERSONAL_PATHS = ['/me', '/settings', '/notifications', '/dm', '/editor/dm-table'];

/**
 * Personal routes belong to the avatar, not to a main-nav item: the hub,
 * its sub-pages, account pages, the DM dashboard, and the member's own
 * public profile.
 * `handle` is the signed-in member's handle; without it only the fixed
 * personal paths match.
 */
export function isPersonalPath(pathname: string, handle?: string | null): boolean {
  if (matchesPath(pathname, PERSONAL_PATHS)) return true;
  if (!handle) return false;
  const own = handle.toLowerCase();
  return ['/players/', '/dms/'].some((prefix) => {
    if (!pathname.startsWith(prefix)) return false;
    const segment = pathname.slice(prefix.length).split('/')[0] ?? '';
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // A malformed segment cannot be the member's own handle.
    }
    return decoded.replace(/^@/, '').toLowerCase() === own;
  });
}
