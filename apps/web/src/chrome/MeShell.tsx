import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute.js';
import { useAuth } from '../auth/AuthContext.js';
import { SingleRegionPage } from './singleRegion.js';
import { PageShell } from '../components/foundation/PageShell.js';
import { StatePanel } from '../components/foundation/StatePanel.js';
import { Avatar } from '../components/primitives/Avatar.js';
import { Button } from '../components/primitives/Button.js';
import { PageToolbar } from '../components/primitives/PageToolbar.js';
import { SegmentedNav } from '../components/primitives/SegmentedNav.js';
import { Chip } from '../components/primitives/Chip.js';
import { useMe } from '../hooks/useMe.js';
import { personName, pluralize, roleLabel } from '../utils/format.js';
import { useMemberHub, type MemberHub } from '../features/member/hooks/useMemberHub.js';
import type { MemberViewModel } from '../features/member/adapters/memberAdapter.js';
import styles from '../features/member/pages/me.module.css';

const accountTabs = [
  { to: '/me', label: 'Overview' },
  { to: '/me/characters', label: 'Characters' },
  { to: '/me/notes', label: 'Notes' },
  { to: '/me/personalize', label: 'Personalize' },
  { to: '/me/settings', label: 'Settings' },
] as const;

export type MeShellState = { me: MemberViewModel; data: MemberHub };

function ProfileIdentity({ me, avatarUrl }: { me: MemberViewModel; avatarUrl?: string }): React.JSX.Element {
  const { logout } = useAuth();
  const isDm = me.roles.includes('dm');
  const profilePath = `/${isDm ? 'dms' : 'players'}/@${me.handle}`;
  return (
    <section className={styles.hero} aria-label="Your account">
      <Avatar name={personName(me)} src={avatarUrl} size="lg" ring="accent" />
      <div className={styles.identity}>
        <h1 className="type-display">{personName(me)}</h1>
        <div className={styles.chips}>
          {me.roles.map((role) => <Chip key={role} size="sm" tone="line">{roleLabel(role)}</Chip>)}
        </div>
      </div>
      <div className={styles.publicActions}>
        <Link className="type-link" to={profilePath}>View public profile</Link>
        <Button variant="ghost" onClick={() => logout()}>Sign out</Button>
      </div>
    </section>
  );
}

function MeShellContent({
  children,
  title,
  lede,
}: {
  children: (state: MeShellState) => ReactNode;
  title?: string;
  lede?: string;
}): React.JSX.Element {
  const location = useLocation();
  const meQ = useMe();
  const data = useMemberHub(meQ.data?.id ?? '');
  if (meQ.isError) {
    return <PageShell><SingleRegionPage page="me"><StatePanel status="error" error={meQ.error} /></SingleRegionPage></PageShell>;
  }
  if (meQ.isLoading || !meQ.data) {
    return <PageShell><SingleRegionPage page="me"><StatePanel status="loading" /></SingleRegionPage></PageShell>;
  }
  const avatarUrl = data.hub.status === 'ready' ? data.hub.data.avatarUrl ?? undefined : undefined;
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="me">
        <div className={styles.body}>
          <ProfileIdentity me={meQ.data} avatarUrl={avatarUrl} />
          <PageToolbar
            label="Your account sections"
            className={styles.accountToolbar}
            segments={
              <SegmentedNav
                label="Your account sections"
                items={accountTabs.map((tab) => ({ ...tab, current: location.pathname === tab.to }))}
                component="MeTabs"
              />
            }
            count={location.pathname === '/me/characters' && data.roster.status === 'ready' ? pluralize(data.roster.data.length, 'character') : undefined}
          />
          {title ? <div className={styles.subpageHeader}><h2 className="type-heading">{title}</h2>{lede ? <p className="type-body">{lede}</p> : null}</div> : null}
          {children({ me: meQ.data, data })}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

export function MeShell({
  children,
  title,
  lede,
}: {
  children: (state: MeShellState) => ReactNode;
  title?: string;
  lede?: string;
}): React.JSX.Element {
  return <ProtectedRoute><MeShellContent title={title} lede={lede}>{children}</MeShellContent></ProtectedRoute>;
}
