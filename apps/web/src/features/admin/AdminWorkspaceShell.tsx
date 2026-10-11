import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ProtectedRoute } from '../../auth/ProtectedRoute.js';
import { canAccessVerify, isAdmin } from '../../auth/roles.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import {
  AuthorityFailureContext,
  useAdminAuthority,
  usePageAuthorityFailures,
  type WorkspaceAuthority,
} from './hooks/useAdminAuthority.js';

const SECTIONS = [
  { href: '/admin', label: 'Today', match: (p: string) => p === '/admin' },
  {
    href: '/admin/people',
    label: 'People',
    match: (p: string) => p.startsWith('/admin/people'),
  },
  {
    href: '/admin/characters',
    label: 'Characters',
    match: (p: string) => p.startsWith('/admin/characters'),
  },
  {
    href: '/admin/review',
    label: 'Review',
    match: (p: string) => p.startsWith('/admin/review'),
  },
  {
    href: '/admin/world',
    label: 'World',
    match: (p: string) => p.startsWith('/admin/world'),
  },
  {
    href: '/admin/content',
    label: 'Content',
    match: (p: string) => p.startsWith('/admin/content'),
  },
  {
    href: '/admin/delivery',
    label: 'Delivery',
    match: (p: string) => p.startsWith('/admin/delivery'),
  },
  {
    href: '/admin/data-health',
    label: 'Data health',
    match: (p: string) => p.startsWith('/admin/data-health'),
  },
] as const;

export function adminDeclaration(page: string): PageDeclaration {
  return {
    page,
    regions: [
      { role: 'nav', priority: 0 },
      { role: 'summary', priority: 1 },
      { role: 'body', priority: 2 },
    ],
  };
}

export function AdminNavRegion({
  roles,
}: {
  roles: readonly string[] | undefined;
}): React.JSX.Element {
  const location = useLocation();
  return (
    <nav className="admin-workspace__nav" aria-label="Admin sections">
      {SECTIONS.filter((section) =>
        section.href === '/admin/review' ? canAccessVerify(roles) : isAdmin(roles),
      ).map((section) => (
        <Link
          key={section.href}
          to={section.href}
          className="admin-workspace__nav-link"
          aria-current={section.match(location.pathname) ? 'page' : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminSummaryRegion({
  title,
  authority = 'admin',
}: {
  title: string;
  authority?: WorkspaceAuthority;
}): React.JSX.Element {
  return (
    <header className="admin-workspace__header">
      <p className="eyebrow">{authority === 'dm' ? 'DM' : 'Admin'}</p>
      <h1 className="type-display">{title}</h1>
    </header>
  );
}

function AuthorityRecovery({ reload }: { reload: () => void }): React.JSX.Element {
  return (
    <div className="row">
      <button type="button" className="type-link" onClick={reload}>
        Reload account
      </button>
      <Link to="/login" className="type-link">
        Sign in again
      </Link>
    </div>
  );
}

/**
 * Admin chrome as PageHost region renderers (nav / summary / body).
 * Auth gate wraps PageHost — this shell is not a PageHost substitute.
 */
export function AdminWorkspaceShell({
  page,
  title,
  children,
  summary,
  authority = 'admin',
}: {
  page: string;
  title: string;
  children: ReactNode;
  summary?: ReactNode;
  authority?: WorkspaceAuthority;
}): React.JSX.Element {
  return (
    <ProtectedRoute>
      <AuthorizedWorkspace
        key={page}
        page={page}
        title={title}
        summary={summary}
        authority={authority}
      >
        {children}
      </AuthorizedWorkspace>
    </ProtectedRoute>
  );
}

function AuthorizedWorkspace({
  page,
  title,
  summary,
  authority,
  children,
}: {
  page: string;
  title: string;
  summary?: ReactNode;
  authority: WorkspaceAuthority;
  children: ReactNode;
}): React.JSX.Element {
  const account = useAdminAuthority(authority);
  const failures = usePageAuthorityFailures(account.error);
  const regions: PageRegionRenderers = {
    nav: () => <AdminNavRegion roles={account.roles} />,
    summary: () => (
      <div className="stack">
        {summary != null ? (
          summary
        ) : (
          <AdminSummaryRegion title={title} authority={authority} />
        )}
        {failures.permissionsChanged ? (
          <AuthorityRecovery reload={account.reload} />
        ) : null}
      </div>
    ),
    body: () => <div className="admin-workspace__body">{children}</div>,
  };
  if (account.status === 'error') {
    return (
      <section className="stack" aria-label={`${title} access`}>
        <StatePanel status="error" error={account.error ?? undefined} />
        <AuthorityRecovery reload={account.reload} />
      </section>
    );
  }
  if (account.status === 'loading') return <StatePanel status="loading" />;
  return (
    <AuthorityFailureContext.Provider value={failures.report}>
      <div className="admin-workspace" data-layout="admin-workspace">
        <PageHost declaration={adminDeclaration(page)} regions={regions} />
      </div>
    </AuthorityFailureContext.Provider>
  );
}
