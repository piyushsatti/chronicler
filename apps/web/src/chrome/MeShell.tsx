import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute.js';
import { useAuth } from '../auth/AuthContext.js';
import { SingleRegionPage } from './singleRegion.js';
import { PageShell } from '../components/foundation/PageShell.js';
import { StatePanel } from '../components/foundation/StatePanel.js';
import { Avatar } from '../components/primitives/Avatar.js';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Chip } from '../components/primitives/Chip.js';
import { PageToolbar } from '../components/primitives/PageToolbar.js';
import { SegmentedNav } from '../components/primitives/SegmentedNav.js';
import { useMe } from '../hooks/useMe.js';
import { personName, roleLabel } from '../utils/format.js';
import { useMemberHub, type MemberHub } from '../features/member/hooks/useMemberHub.js';
import type { MemberViewModel } from '../features/member/adapters/memberAdapter.js';
import styles from '../features/member/pages/me.module.css';

/** Account sections. Every section is a /me route, so the page never hands the member off to a global list. */
const ACCOUNT_SECTIONS = [
  { label: 'Overview', to: '/me' },
  { label: 'Characters', to: '/me/characters' },
  { label: 'Quest history', to: '/me/history' },
  { label: 'Summaries', to: '/me/summaries' },
  { label: 'Notes', to: '/me/notes' },
  { label: 'Settings', to: '/me/settings' },
  { label: 'Personalize', to: '/me/personalize' },
] as const;

export type MeShellState = { me: MemberViewModel; data: MemberHub };

function ProfileHero({ me, avatarUrl }: { me: MemberViewModel; avatarUrl?: string }): React.JSX.Element {
  const { logout } = useAuth();
  const profilePath = `/${me.roles.includes('dm') ? 'dms' : 'players'}/@${me.handle}`;
  return (
    <Card as="section" pad={5} className={styles.hero} aria-label="Your profile" data-el="me.header">
      <Avatar name={personName(me)} src={avatarUrl} size="token" ring="accent" className={styles.heroAvatar} />
      <div className={styles.identity}>
        <h1 className="type-display">{personName(me)}</h1>
        <div className={styles.chips}>
          {me.roles.map((role) => <Chip key={role} size="sm" tone="line">{roleLabel(role)}</Chip>)}
        </div>
        <p className={styles.secondaryLinks}>
          <Link className="type-link" to={profilePath}>View public profile</Link>
        </p>
      </div>
      <div className={styles.actions} data-el="me.actions">
        <Button variant="secondary" size="sm" onClick={() => logout()}>Sign out</Button>
      </div>
    </Card>
  );
}

function AccountToolbar({ count, actions }: { count?: ReactNode; actions?: ReactNode }): React.JSX.Element {
  const { pathname } = useLocation();
  return (
    <PageToolbar
      label="Your account"
      segments={(
        <SegmentedNav
          label="Your account sections"
          items={ACCOUNT_SECTIONS.map((section) => ({ ...section, current: pathname === section.to }))}
        />
      )}
      count={count}
      actions={actions}
    />
  );
}

type MeShellProps = {
  children: (state: MeShellState) => ReactNode;
  title?: string;
  lede?: string;
  /** Count for the current section, shown at the right of the toolbar. */
  count?: (state: MeShellState) => ReactNode;
  /** The current section's main action, shown at the right of the toolbar. */
  actions?: ReactNode;
};

function MeShellContent({ children, title, lede, count, actions }: MeShellProps): React.JSX.Element {
  const meQ = useMe();
  const data = useMemberHub(meQ.data?.id ?? '');
  if (meQ.isError) {
    return <PageShell><SingleRegionPage page="me"><StatePanel status="error" error={meQ.error} /></SingleRegionPage></PageShell>;
  }
  if (meQ.isLoading || !meQ.data) {
    return <PageShell><SingleRegionPage page="me"><StatePanel status="loading" /></SingleRegionPage></PageShell>;
  }
  const avatarUrl = data.hub.status === 'ready' ? data.hub.data.avatarUrl ?? undefined : undefined;
  const state = { me: meQ.data, data };
  return (
    <PageShell context="tavern" className="hf2">
      <SingleRegionPage page="me">
        <div className={styles.body}>
          <ProfileHero me={meQ.data} avatarUrl={avatarUrl} />
          <AccountToolbar count={count?.(state)} actions={actions} />
          {title ? <div className={styles.subpageHeader}><h2 className="type-heading">{title}</h2>{lede ? <p className="type-body">{lede}</p> : null}</div> : null}
          {children(state)}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}

export function MeShell(props: MeShellProps): React.JSX.Element {
  return <ProtectedRoute><MeShellContent {...props} /></ProtectedRoute>;
}
