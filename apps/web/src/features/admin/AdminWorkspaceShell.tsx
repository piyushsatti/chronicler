import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ProtectedRoute } from '../../auth/ProtectedRoute.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { PageShell } from '../../components/foundation/PageShell.js';
import { Button } from '../../components/primitives/Button.js';
import './AdminWorkspaceShell.css';
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

function adminDeclaration(page: string): PageDeclaration {
  return {
    page,
    regions: [
      { role: 'nav', priority: 0 },
      { role: 'summary', priority: 1 },
      { role: 'body', priority: 2 },
    ],
  };
}

function AdminNavRegion({
  canAdmin,
  canReview,
}: {
  canAdmin: boolean;
  canReview: boolean;
}): React.JSX.Element {
  const location = useLocation();
  const sections = SECTIONS.filter((section) =>
    section.href === '/admin/review' ? canReview : canAdmin,
  );
  if (sections.length === 0) return <div hidden />;
  return (
    <div className="admin-workspace__nav-scroll">
      <nav className="admin-workspace__nav" aria-label="Admin sections">
        {sections.map((section) => (
          <Link
            key={section.href}
            to={section.href}
            className="admin-workspace__nav-link"
            aria-current={section.match(location.pathname) ? 'page' : undefined}
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
              })
            }
          >
            {section.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function AdminSummaryRegion({
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

function AuthorityRecovery({
  reload,
  signIn = true,
}: {
  reload: () => void;
  signIn?: boolean;
}): React.JSX.Element {
  return (
    <div className="row" data-wrap="1" data-gap="3">
      <Button variant="secondary" size="sm" onClick={reload}>
        Reload account
      </Button>
      {signIn ? (
        <Link to="/login" className="btn btn--ghost btn--sm">
          Sign in again
        </Link>
      ) : null}
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
      <PageShell
        context="war-room"
        max={authority === 'dm' ? 'default' : 'wide'}
        className="admin-workspace-page"
      >
        <AuthorizedWorkspace
          key={page}
          page={page}
          title={title}
          summary={summary}
          authority={authority}
        >
          {children}
        </AuthorizedWorkspace>
      </PageShell>
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
    nav: () => (
      <AdminNavRegion canAdmin={account.canAdmin} canReview={account.canReview} />
    ),
    summary: () => (
      <div className="stack">
        {summary != null ? (
          summary
        ) : (
          <AdminSummaryRegion title={title} authority={authority} />
        )}
        {failures.permissionsChanged ? (
          // The denied panel below already offers sign-in; this adds the reload.
          <AuthorityRecovery reload={account.reload} signIn={false} />
        ) : null}
      </div>
    ),
    body: () => <div className="admin-workspace__body">{children}</div>,
  };
  if (account.status === 'error') {
    const denied =
      account.error?.kind === 'forbidden' || account.error?.kind === 'unauthorized';
    return (
      <section className="stack" aria-label={`${title} access`}>
        <StatePanel
          status="error"
          error={account.error ?? undefined}
          onRetry={account.reload}
        />
        {denied ? null : <AuthorityRecovery reload={account.reload} />}
      </section>
    );
  }
  if (account.status === 'loading') return <StatePanel status="loading" />;
  return (
    <AuthorityFailureContext.Provider value={failures.report}>
      <div className="admin-workspace" data-layout="admin-workspace">
        <PageHost
          key={account.commandKey}
          declaration={adminDeclaration(page)}
          regions={regions}
        />
      </div>
    </AuthorityFailureContext.Provider>
  );
}
