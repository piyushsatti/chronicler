export type SiteDestination = {
  id: string;
  label: string;
  href: string;
  matches: (pathname: string) => boolean;
};

export type NavAuth = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Holds the dm role (or admin): shows the DM dashboard link. */
  isDm?: boolean;
  /** Holds the verifier role. Admin does not. */
  isVerifier?: boolean;
};

function matchesPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Seven live bar destinations. Characters is not a bar item. */
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
      matchesPath(pathname, ['/codex', '/npcs', '/factions', '/regions']),
  },
  {
    id: 'map',
    label: 'Map',
    href: '/map',
    matches: (pathname) => matchesPath(pathname, ['/map']),
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

/** Admins reach Review inside this workspace. Verifiers use VERIFY_DESTINATION. */
const ADMIN_DESTINATION: SiteDestination = {
  id: 'admin',
  label: 'Admin',
  href: '/admin',
  matches: (pathname) => matchesPath(pathname, ['/admin', '/gallery']),
};

/** Verifier role only. The page is the review queue, with no other admin section. */
const VERIFY_DESTINATION: SiteDestination = {
  id: 'verify',
  label: 'Verify',
  href: '/verify',
  matches: (pathname) => matchesPath(pathname, ['/verify']),
};

/** The member's DM dashboard; `/dms` (the directory) stays under Community. */
const DM_DESTINATION: SiteDestination = {
  id: 'dm',
  label: 'DM',
  href: '/dm',
  matches: (pathname) => matchesPath(pathname, ['/dm']),
};

/** DM, Verify, and Admin join the same link list when the member holds the role. */
export function destinationsForAuth(auth?: NavAuth): readonly SiteDestination[] {
  const extras = [
    ...(auth?.isDm ? [DM_DESTINATION] : []),
    ...(auth?.isVerifier ? [VERIFY_DESTINATION] : []),
    ...(auth?.isAdmin ? [ADMIN_DESTINATION] : []),
  ];
  return [...PRIMARY_DESTINATIONS, ...extras];
}

export function currentDestinationId(
  pathname: string,
  destinations: readonly SiteDestination[] = PRIMARY_DESTINATIONS,
): string {
  const match = destinations.find((destination) => destination.matches(pathname));
  return match?.id ?? 'home';
}

const PERSONAL_PATHS = ['/me', '/settings', '/notifications', '/dm'];

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
