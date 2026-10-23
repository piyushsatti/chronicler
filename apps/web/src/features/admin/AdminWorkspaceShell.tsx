import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ProtectedRoute } from '../../auth/ProtectedRoute.js';
import { StatePanel } from '../../components/foundation/StatePanel.js';
import { PageShell } from '../../components/foundation/PageShell.js';
import { Button } from '../../components/primitives/Button.js';
import { PageHeader } from '../../components/primitives/PageHeader.js';
import { TabNav } from '../../components/primitives/Tabs.js';
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

function adminDeclaration(page: string, bare: boolean, authority: WorkspaceAuthority): PageDeclaration {
  return {
    page,
    regions: [
      ...(bare ? [] : [{ role: 'summary', priority: 0 }]),
      ...(authority === 'dm' ? [] : [{ role: 'nav', priority: 1 }]),
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
    <TabNav
      aria-label="Admin sections"
      items={sections.map((section) => ({
        to: section.href,
        label: section.label,
        current: section.match(location.pathname),
      }))}
    />
  );
}

function AdminSummaryRegion({
  title,
  lede,
}: {
  title: string;
  lede?: string;
}): React.JSX.Element {
  return <PageHeader title={title} lede={lede} />;
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
  lede,
  authority = 'admin',
  bareHeader = false,
}: {
  page: string;
  title: string;
  lede?: string;
  children: ReactNode;
  summary?: ReactNode;
  authority?: WorkspaceAuthority;
  /** The body renders its own PageHeader, so the shell draws none. */
  bareHeader?: boolean;
}): React.JSX.Element {
  return (
    <ProtectedRoute>
      <PageShell context="war-room" className="admin-workspace-page">
        <AuthorizedWorkspace
          key={page}
          page={page}
          title={title}
          lede={lede}
          summary={summary}
          bareHeader={bareHeader}
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
  lede,
  summary,
  authority,
  bareHeader,
  children,
}: {
  page: string;
  title: string;
  lede?: string;
  summary?: ReactNode;
  authority: WorkspaceAuthority;
  bareHeader: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const account = useAdminAuthority(authority);
  const failures = usePageAuthorityFailures(account.error);
  const regions: Record<string, () => React.JSX.Element> = {
    nav: () => (
      <AdminNavRegion canAdmin={account.canAdmin} canReview={account.canReview} />
    ),
    summary: () => (
      <div className="stack">
        {summary != null ? summary : <AdminSummaryRegion title={title} lede={lede} />}
        {failures.permissionsChanged ? (
          // The denied panel below already offers sign-in; this adds the reload.
          <AuthorityRecovery reload={account.reload} signIn={false} />
        ) : null}
      </div>
    ),
    body: () => <div className="admin-workspace__body">{children}</div>,
  };
  const { summary: summaryRegion, ...bareRegions } = regions;
  const hostRegions: PageRegionRenderers = bareHeader
    ? bareRegions
    : { ...bareRegions, summary: summaryRegion! };
  if (account.status === 'error') {
    const denied =
      account.error?.kind === 'forbidden' || account.error?.kind === 'unauthorized';
    return (
      <section className="stack" data-gap="5" aria-label={`${title} access`}>
        <PageHeader
          back={
            authority === 'dm'
              ? { to: '/me', label: 'Your page' }
              : { to: '/', label: 'Home' }
          }
          title={authority === 'dm' ? title : 'Admin'}
        />
        <StatePanel
          status="error"
          error={account.error ?? undefined}
          deniedMessage={
            authority === 'dm'
              ? 'Only DMs can open this dashboard. Apply to run quests from the DM directory.'
              : 'This area is for staff.'
          }
          action={authority === 'dm' ? <Link className="btn btn--primary" to="/dms">Browse DMs and apply</Link> : undefined}
          onRetry={account.reload}
          retryLabel={authority === 'dm' ? 'Check access again' : undefined}
        />
        {denied ? null : <AuthorityRecovery reload={account.reload} />}
      </section>
    );
  }
  if (account.status === 'loading') return authority === 'dm' ? (
    <div className="stack">
      <PageHeader back={{ to: '/me', label: 'Your page' }} title={title} />
      <StatePanel status="loading" />
    </div>
  ) : <StatePanel status="loading" />;
  return (
    <AuthorityFailureContext.Provider value={failures.report}>
      <div className="admin-workspace" data-layout="admin-workspace">
        <PageHost
          key={account.commandKey}
          declaration={adminDeclaration(page, bareHeader, authority)}
          regions={hostRegions}
        />
      </div>
    </AuthorityFailureContext.Provider>
  );
}
