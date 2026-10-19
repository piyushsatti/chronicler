import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { QuestCard } from '../../../components/domain/QuestCard.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import type { AppError } from '../../../errors/types.js';
import type { HomeDocumentView, HomeViewModel } from '../adapters/homeAdapter.js';
import type { HomeLanesViewModel } from '../adapters/homeLanesAdapter.js';
import { useHomeBanner } from '../hooks/useHomeBanner.js';
import { useHomePage } from '../hooks/useHomePage.js';
import { useSiteStats } from '../hooks/useSiteStats.js';
import styles from './home.module.css';

const HOME_DECLARATION: PageDeclaration = {
  page: 'home',
  regions: [
    { role: 'banner', priority: 0 },
    { role: 'heading', priority: 1 },
    { role: 'buckets', priority: 2 },
    { role: 'lane-recruiting', priority: 3 },
    { role: 'lane-upcoming', priority: 4 },
    { role: 'lane-recent', priority: 5 },
    { role: 'lane-dms', priority: 6 },
  ],
};

function emptyRegion(): React.JSX.Element {
  return <div hidden />;
}

function hrefForHomeDocument(doc: HomeDocumentView): string {
  const cat = (doc.category ?? '').toLowerCase();
  if (
    cat.includes('codex') ||
    cat === 'npc' ||
    cat === 'npcs' ||
    cat === 'faction' ||
    cat === 'factions' ||
    cat === 'region' ||
    cat === 'regions' ||
    cat === 'location' ||
    cat === 'locations'
  ) {
    return `/codex/${doc.slug}`;
  }
  if (cat.includes('rule')) {
    return `/rules`;
  }
  return `/chronicles/${doc.slug}`;
}

function HomeBannerRegion(): React.JSX.Element {
  const banner = useHomeBanner();
  if (banner.isLoading || banner.isError || !banner.data?.enabled) {
    return emptyRegion();
  }
  const b = banner.data;
  return (
    <section className="shelf" data-el="home.banner" aria-label="Featured">
      <div className="shelf__icon" aria-hidden="true" />
      <div className={`stack ${styles.bannerBody}`}>
        {b.title ? <h2 className="type-heading">{b.title}</h2> : null}
        {b.body ? <p className="type-body">{b.body}</p> : null}
      </div>
      {b.ctaLabel && b.ctaHref ? (
        <Link className="btn primary" to={b.ctaHref}>
          {b.ctaLabel}
        </Link>
      ) : (
        <span />
      )}
    </section>
  );
}

function HomeHeadingRegion({
  memberCount,
  featuredTitle,
}: {
  memberCount: string | null;
  featuredTitle: string | null;
}): React.JSX.Element {
  return (
    <header className={styles.hero} data-el="home.heading">
      <p className="eyebrow">War room</p>
      <h1 className="type-display">Welcome to Chronicler.</h1>
      {featuredTitle ? (
        <p className="type-caption">Featured chronicle · {featuredTitle}</p>
      ) : null}
      {memberCount ? (
        <div className={styles.stats}>
          <p className="type-value">{memberCount}</p>
          <p className="type-caption">members on the server</p>
        </div>
      ) : null}
      <div className={styles.heroActions}>
        <Link className="btn primary" to="/quests">
          Open quests
        </Link>
        <Link className="btn" to="/chronicles">
          Browse chronicles
        </Link>
      </div>
    </header>
  );
}

function HomeBucketsRegion({ buckets }: { buckets: HomeViewModel }): React.JSX.Element {
  const docs = buckets.recentByCategory.flatMap((bucket) =>
    bucket.documents.map((doc) => ({ bucket, doc })),
  );
  if (docs.length === 0) {
    return emptyRegion();
  }
  return (
    <section className="lane" aria-label="Recent from the archive" data-el="home.buckets">
      <div className="lane__head">
        <div className="lane__title">
          <span className="lane__index">00</span>
          <h2 className="type-heading">Recent from the archive</h2>
        </div>
        <Link className="type-caption" to="/chronicles">
          All chronicles
        </Link>
      </div>
      <ul className={styles.bucketList}>
        {docs.map(({ bucket, doc }) => (
          <li key={doc.id} className="card" data-pad="3">
            <p className="eyebrow">{bucket.category ?? doc.category ?? 'Document'}</p>
            <Link className="type-title" to={hrefForHomeDocument(doc)}>
              {doc.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestLane({
  index,
  label,
  ariaLabel,
  quests,
}: {
  index: string;
  label: string;
  ariaLabel: string;
  quests: HomeLanesViewModel['recruiting'];
}): React.JSX.Element {
  if (quests.length === 0) {
    return emptyRegion();
  }
  return (
    <section className="lane" aria-label={ariaLabel}>
      <div className="lane__head">
        <div className="lane__title">
          <span className="lane__index">{index}</span>
          <h2 className="type-heading">{label}</h2>
        </div>
      </div>
      <div className="cols" data-n="3" data-gap="4">
        {quests.map((quest) => (
          <QuestCard key={quest.shortCode} quest={quest} />
        ))}
      </div>
    </section>
  );
}

function DmLane({ dms }: { dms: HomeLanesViewModel['dmsAccepting'] }): React.JSX.Element {
  if (dms.length === 0) {
    return emptyRegion();
  }
  return (
    <section className="lane" aria-label="DMs accepting">
      <div className="lane__head">
        <div className="lane__title">
          <span className="lane__index">04</span>
          <h2 className="type-heading">DMs accepting requests</h2>
        </div>
        <Link className="type-caption" to="/community">
          Community
        </Link>
      </div>
      <ul className="stack">
        {dms.map((dm) => (
          <li key={dm.memberId} className="card" data-pad="3">
            <Link className="type-title" to={`/dms/@${dm.handle}`}>
              {dm.displayName}
            </Link>
            {dm.tagline ? <p className="type-caption">{dm.tagline}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function readyRegions(
  view: { buckets: HomeViewModel; lanes: HomeLanesViewModel },
  memberCount: string | null,
): PageRegionRenderers {
  const { buckets, lanes } = view;
  return {
    banner: () => <HomeBannerRegion />,
    heading: () => (
      <HomeHeadingRegion memberCount={memberCount} featuredTitle={buckets.headingTitle} />
    ),
    buckets: () => <HomeBucketsRegion buckets={buckets} />,
    'lane-recruiting': () => (
      <QuestLane
        index="01"
        label="Now recruiting"
        ariaLabel="Now recruiting"
        quests={lanes.recruiting}
      />
    ),
    'lane-upcoming': () => (
      <QuestLane
        index="02"
        label="Coming up — next two weeks"
        ariaLabel="Coming up"
        quests={lanes.upcoming}
      />
    ),
    'lane-recent': () => (
      <QuestLane
        index="03"
        label="Just happened — last 7 days"
        ariaLabel="Recently played"
        quests={lanes.recentlyClosed}
      />
    ),
    'lane-dms': () => <DmLane dms={lanes.dmsAccepting} />,
  };
}

function statusRegions(
  status: 'error' | 'loading' | 'empty',
  error?: AppError,
): PageRegionRenderers {
  return {
    banner: () => <HomeBannerRegion />,
    heading: () =>
      status === 'error' ? (
        <StatePanel status="error" error={error} />
      ) : status === 'loading' ? (
        <StatePanel status="loading" />
      ) : (
        <StatePanel status="empty" emptyMessage="The war room is quiet for now." />
      ),
    buckets: emptyRegion,
    'lane-recruiting': emptyRegion,
    'lane-upcoming': emptyRegion,
    'lane-recent': emptyRegion,
    'lane-dms': emptyRegion,
  };
}

export function HomePage(): React.JSX.Element {
  const page = useHomePage();
  const stats = useSiteStats();
  const memberCount = stats.data != null ? String(stats.data.totalMembers) : null;

  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, memberCount);

  return (
    <PageShell>
      <div className={`ctx-war-room ${styles.root}`} data-el="home.root">
        <PageHost declaration={HOME_DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
