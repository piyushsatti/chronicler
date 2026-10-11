import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useHomeBanner } from '../hooks/useHomeBanner.js';
import { useHomePage } from '../hooks/useHomePage.js';
import { useSiteStats } from '../hooks/useSiteStats.js';

const HOME_DECLARATION: PageDeclaration = {
  page: 'home',
  regions: [
    { role: 'banner', priority: 0 },
    { role: 'heading', priority: 1 },
    { role: 'lane-recruiting', priority: 2 },
    { role: 'lane-upcoming', priority: 3 },
    { role: 'lane-recent', priority: 4 },
    { role: 'lane-dms', priority: 5 },
  ],
};

function emptyRegion(): React.JSX.Element {
  return <div hidden />;
}

function HomeBannerRegion(): React.JSX.Element {
  const banner = useHomeBanner();
  if (banner.isLoading || banner.isError || !banner.data?.enabled) {
    return emptyRegion();
  }
  const b = banner.data;
  return (
    <section className="home-banner card stack" data-el="home.banner" aria-label="Featured">
      {b.title ? <h2 className="type-heading">{b.title}</h2> : null}
      {b.body ? <p className="type-body">{b.body}</p> : null}
      {b.ctaLabel && b.ctaHref ? (
        <Link className="btn primary" to={b.ctaHref}>
          {b.ctaLabel}
        </Link>
      ) : null}
    </section>
  );
}

export function HomePage(): React.JSX.Element {
  const page = useHomePage();
  const stats = useSiteStats();
  const memberCount =
    stats.data != null ? `${stats.data.totalMembers} members on the server` : null;

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      banner: () => <HomeBannerRegion />,
      heading: () => <StatePanel status="error" error={page.error} />,
      'lane-recruiting': emptyRegion,
      'lane-upcoming': emptyRegion,
      'lane-recent': emptyRegion,
      'lane-dms': emptyRegion,
    };
  } else if (page.status === 'loading') {
    regions = {
      banner: () => <HomeBannerRegion />,
      heading: () => <StatePanel status="loading" />,
      'lane-recruiting': emptyRegion,
      'lane-upcoming': emptyRegion,
      'lane-recent': emptyRegion,
      'lane-dms': emptyRegion,
    };
  } else if (page.status === 'empty') {
    regions = {
      banner: () => <HomeBannerRegion />,
      heading: () => (
        <StatePanel status="empty" emptyMessage="The war room is quiet for now." />
      ),
      'lane-recruiting': emptyRegion,
      'lane-upcoming': emptyRegion,
      'lane-recent': emptyRegion,
      'lane-dms': emptyRegion,
    };
  } else {
    const lanes = page.view;
    regions = {
      banner: () => <HomeBannerRegion />,
      heading: () => (
        <div className="stack">
          <p className="eyebrow">Chronicler</p>
          <h1 className="type-display">Welcome to Chronicler.</h1>
          {memberCount ? <p className="type-caption">{memberCount}</p> : null}
          <Link className="btn primary" to="/quests">
            Open quests
          </Link>
        </div>
      ),
      'lane-recruiting': () => (
        <section className="lane" aria-label="Now recruiting">
          <h2 className="lane__eyebrow">01 — Now recruiting</h2>
          <div className="lane__grid">
            {lanes.recruiting.map((quest) => (
              <div key={quest.shortCode} className="quest-card">
                <QuestCard quest={quest} />
              </div>
            ))}
          </div>
        </section>
      ),
      'lane-upcoming': () => (
        <section className="lane" aria-label="Coming up">
          <h2 className="lane__eyebrow">02 — Coming up — next two weeks</h2>
          <div className="lane__grid">
            {lanes.upcoming.map((quest) => (
              <div key={quest.shortCode} className="quest-card">
                <QuestCard quest={quest} />
              </div>
            ))}
          </div>
        </section>
      ),
      'lane-recent': () => (
        <section className="lane" aria-label="Recently played">
          <h2 className="lane__eyebrow">03 — Just happened — last 7 days</h2>
          <div className="lane__grid">
            {lanes.recentlyClosed.map((quest) => (
              <div key={quest.shortCode} className="quest-card">
                <QuestCard quest={quest} />
              </div>
            ))}
          </div>
        </section>
      ),
      'lane-dms': () => (
        <section className="lane" aria-label="DMs accepting">
          <h2 className="lane__eyebrow">DMs accepting requests</h2>
          <ul className="stack">
            {lanes.dmsAccepting.map((dm) => (
              <li key={dm.memberId} className="card">
                <Link className="type-title" to={`/dms/@${dm.handle}`}>
                  {dm.displayName}
                </Link>
                {dm.tagline ? <p className="type-caption">{dm.tagline}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ),
    };
  }

  return (
    <PageShell>
      <PageHost declaration={HOME_DECLARATION} regions={regions} />
    </PageShell>
  );
}
