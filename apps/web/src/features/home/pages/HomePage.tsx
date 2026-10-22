import type { PageDeclaration } from '@pi/react-imposition';
import {
  PageHost,
  useSizeClasses,
  type PageRegionRenderers,
} from '@pi/react-imposition/react';
import { Link, useNavigate } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import type { AppError } from '../../../errors/types.js';
import { greeting } from '../../../utils/greeting.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { navigateToCtaHref } from '../../../utils/ctaHref.js';
import type { SiteStatsViewModel } from '../adapters/homeAdapter.js';
import type {
  HomeLanesViewModel,
  HomeQuestView,
} from '../adapters/homeLanesAdapter.js';
import { OpenQuestCard } from '../components/OpenQuestCard.js';
import { NewHereShelf } from '../components/NewHereShelf.js';
import { Sched } from '../components/Sched.js';
import { WeekStrip } from '../components/WeekStrip.js';
import {
  BannerMediaEmbed,
  classifyBannerMedia,
  isSafeHttpsUrl,
} from '../../../components/foundation/contentMedia.js';
import { useHomeBanner } from '../hooks/useHomeBanner.js';
import { useHomePage, type HomePageView } from '../hooks/useHomePage.js';
import type { OpenQuestCardProps } from '../components/openQuestCard.types.js';
import styles from './home.module.css';
import { statusLabel } from '../../../utils/format.js';

const HOME_DECLARATION: PageDeclaration = {
  page: 'home',
  regions: [
    { role: 'heading', priority: 0 },
    { role: 'banner', priority: 1 },
    { role: 'new-here', priority: 2 },
    { role: 'lane-recruiting', priority: 3 },
    { role: 'lane-upcoming', priority: 4 },
    { role: 'lane-recent', priority: 5 },
    { role: 'lane-dms', priority: 6 },
  ],
};

function emptyRegion(): React.JSX.Element {
  return <div hidden />;
}

function HomeBannerRegion(): React.JSX.Element {
  const banner = useHomeBanner();
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  if (banner.isLoading || banner.isError || !banner.data?.enabled) {
    return emptyRegion();
  }
  const b = banner.data;
  const media = classifyBannerMedia(b.mediaKind, b.mediaUrl, b.mediaLabel);
  return (
    <div
      className={`home-featured-banner ${styles.banner}`}
      data-compact={widthClass !== 'expanded'}
      data-media={media !== null}
      data-el="home.banner"
      data-testid="home-featured-banner"
    >
      <div className={styles.bannerPattern} />
      <div className={styles.bannerGlow} />
      <div
        className={`stack home-featured-banner-content ${styles.bannerContent}`}
        data-justify="center"
      >
        {b.title ? (
          <div className={`type-display ${styles.bannerTitle}`}>{b.title}</div>
        ) : null}
        {b.body ? (
          <div className={`type-body ${styles.bannerText}`}>{b.body}</div>
        ) : null}
        {b.ctaLabel && b.ctaHref ? (
          <div>
            <Button
              data-el="home.featuredCta"
              variant="primary"
              onClick={() => navigateToCtaHref(navigate, b.ctaHref ?? '/quests')}
            >
              {b.ctaLabel}
            </Button>
          </div>
        ) : null}
      </div>
      {media ? (
        <div className="home-banner-media" data-testid="home-banner-media">
          <BannerMediaEmbed media={media} />
        </div>
      ) : b.mediaUrl && isSafeHttpsUrl(b.mediaUrl) ? (
        <a
          className="home-banner-media-fallback"
          data-testid="home-banner-media-fallback"
          href={b.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {b.mediaLabel || 'Open source'}
        </a>
      ) : null}
    </div>
  );
}

function HomeHeadingRegion({
  stats,
  displayName,
  isAuthenticated,
  lanes,
}: {
  stats: SiteStatsViewModel | undefined;
  displayName: string | null;
  isAuthenticated: boolean;
  lanes: HomeLanesViewModel;
}): React.JSX.Element {
  const next = lanes.upcomingSchedule[0];
  const { formatScheduled } = useDateFormatter();
  return (
    <header className={styles.heading} data-el="home.heading">
      <div className="type-label" data-el="home.eyebrow">
        {isAuthenticated ? 'Campaign board' : 'Public board · anyone can browse'}
      </div>
      <h1 className="type-display" data-el="home.greeting">
        {isAuthenticated ? greeting(displayName) : 'Welcome to Chronicler.'}
      </h1>
      <div
        className={`row ${styles.statsRow}`}
        data-el="home.statsRow"
        data-gap="4"
        data-wrap="1"
      >
        {stats ? (
          <span className="type-caption">
            {stats.totalQuests.toLocaleString()} quests ·{' '}
            {stats.activeCharacters.toLocaleString()} active characters
          </span>
        ) : null}
        {lanes.totals.dmsAccepting > 0 ? (
          <span className="chip" data-tone="line">
            <b>
              {lanes.totals.dmsAccepting} DM{lanes.totals.dmsAccepting === 1 ? '' : 's'}
            </b>
            &nbsp;accepting
          </span>
        ) : null}
        {next ? (
          <span className="chip" data-tone="line">
            Next session {formatScheduled(next.scheduledAt)}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function HomeNewHereRegion({ showFor }: { showFor: boolean }): React.JSX.Element {
  if (!showFor) return emptyRegion();
  return (
    <div data-el="home.newHereShelf">
      <NewHereShelf
        title="New here? Start here."
        body="Pick a character and find your next adventure. Browse open quests below, or learn how Chronicler works."
        primaryCtaLabel="BROWSE OPEN QUESTS →"
        primaryCtaHref="/quests"
        secondaryCtaLabel="How it works"
        secondaryCtaHref="/welcome"
        dismissable
        showFor
      />
    </div>
  );
}

function RecruitingLane({ cards }: { cards: OpenQuestCardProps[] }): React.JSX.Element {
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  return (
    <section className="lane" aria-label="Now — recruiting" data-el="home.lane01">
      <div className="lane__head">
        <div className="lane__title">
          <span className="n">01</span>
          <h2 className="type-heading">Now — recruiting</h2>
        </div>
        <div className="row" data-gap="2">
          <Link className="btn btn--sm" data-el="home.lane01.beginnerBtn" to="/quests">
            Open quests
          </Link>
          <Link className="btn ghost btn--sm" data-el="home.lane01.allBtn" to="/quests">
            All →
          </Link>
        </div>
      </div>
      {cards.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="No open quests right now."
          actionLabel="Browse the Tavern Board"
          onAction={() => navigate('/quests')}
        />
      ) : (
        <div
          data-el="home.lane01.grid"
          className="cols"
          data-n={widthClass === 'expanded' ? 3 : widthClass === 'medium' ? 2 : 1}
          data-gap="5"
        >
          {cards.map((card) => (
            <OpenQuestCard key={card.code} {...card} />
          ))}
        </div>
      )}
    </section>
  );
}

function UpcomingLane({
  quests,
  schedule,
  total,
}: {
  quests: HomeQuestView[];
  schedule: HomeLanesViewModel['upcomingSchedule'];
  total: number;
}): React.JSX.Element {
  const { formatScheduled } = useDateFormatter();
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  return (
    <section
      className="lane"
      aria-label="Coming up — next two weeks"
      data-el="home.lane02"
    >
      <div className="lane__head">
        <div className="lane__title">
          <span className="n">02</span>
          <h2 className="type-heading">Coming up — next two weeks</h2>
        </div>
        {total > 0 ? <span className="type-caption">{total} scheduled</span> : null}
      </div>
      {quests.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="Nothing scheduled in the next two weeks."
          actionLabel="Browse the Tavern Board"
          onAction={() => navigate('/quests')}
        />
      ) : (
        <Card data-el="home.weekStrip">
          <WeekStrip quests={schedule} />
          <div
            className={`cols ${styles.weekStripCols}`}
            data-n={widthClass === 'expanded' ? 3 : 1}
          >
            {quests.slice(0, 3).map((quest) => (
              <Sched
                key={quest.id}
                title={quest.title}
                status={quest.cardStatus}
                region={quest.regionName}
                dmUsername={quest.dmHandle}
                party={quest.participants.map((p) => ({
                  characterName: p.characterName,
                  characterId: p.characterId,
                }))}
                totalSlots={quest.slotsMax}
                when={formatScheduled(quest.scheduledAt)}
                onOpen={() => navigate(`/quests/${quest.shortCode}`)}
              />
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

function RecentLane({
  quests,
  total,
}: {
  quests: HomeQuestView[];
  total: number;
}): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <section
      className="lane"
      aria-label="Just happened — last 7 days"
      data-el="home.lane03"
    >
      <div className="lane__head">
        <div className="lane__title">
          <span className="n">03</span>
          <h2 className="type-heading">Just happened — last 7 days</h2>
        </div>
        <span className="type-caption">{total} closed</span>
      </div>
      <Card data-el="home.lane03.recentlyPlayed">
        <div className={`row ${styles.recentHeader}`} data-justify="between">
          <span className="type-label">Recently played</span>
          <Link to="/quests" className="type-ui no-underline">
            → all quests
          </Link>
        </div>
        {quests.length === 0 ? (
          <EmptyState
            kind="no-quests"
            message="No quests closed out recently."
            actionLabel="Browse the Tavern Board"
            onAction={() => navigate('/quests')}
          />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Quest</th>
                <th>Title</th>
                <th>Region</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quests.map((quest) => (
                <tr key={quest.id}>
                  <td>
                    <span className="code">{quest.shortCode}</span>
                  </td>
                  <td>
                    <Link to={`/quests/${quest.shortCode}`}>{quest.title}</Link>
                  </td>
                  <td>{quest.regionName ?? '—'}</td>
                  <td>
                    <span className="chip">{statusLabel(quest.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

function DmLane({
  dms,
}: {
  dms: HomeLanesViewModel['dmsAccepting'];
}): React.JSX.Element {
  if (dms.length === 0) {
    return emptyRegion();
  }
  return (
    <section className="lane" aria-label="DMs accepting" data-el="home.dmsAccepting">
      <Card>
        <h2 className="type-label">DMs accepting requests</h2>
        {dms.map((dm) => (
          <div
            key={dm.memberId}
            className={`row ${styles.dmRow}`}
            data-justify="between"
          >
            <div className="row" data-gap="3">
              <Avatar name={dm.handle} size="sm" online={false} />
              <span className="type-caption">{dm.displayName}</span>
            </div>
            <Link
              className="chip"
              to={`/dms/@${dm.handle}`}
              aria-label={`${dm.displayName} profile`}
            >
              profile →
            </Link>
          </div>
        ))}
      </Card>
    </section>
  );
}

function readyRegions(view: HomePageView): PageRegionRenderers {
  const opts = view;
  const { lanes } = view;
  return {
    heading: () => (
      <HomeHeadingRegion
        stats={opts.stats}
        displayName={opts.displayName}
        isAuthenticated={opts.isAuthenticated}
        lanes={lanes}
      />
    ),
    banner: () => <HomeBannerRegion />,
    'new-here': () => <HomeNewHereRegion showFor={opts.showNewHere} />,
    'lane-recruiting': () => <RecruitingLane cards={opts.cards} />,
    'lane-upcoming': () => (
      <UpcomingLane
        quests={lanes.upcoming}
        schedule={lanes.upcomingSchedule}
        total={lanes.totals.upcoming}
      />
    ),
    'lane-recent': () => (
      <RecentLane quests={lanes.recentlyClosed} total={lanes.totals.recentlyClosed} />
    ),
    'lane-dms': () => <DmLane dms={lanes.dmsAccepting} />,
  };
}

function statusRegions(
  status: 'error' | 'loading' | 'empty',
  error?: AppError,
): PageRegionRenderers {
  return {
    heading: () =>
      status === 'error' ? (
        <StatePanel status="error" error={error} />
      ) : status === 'loading' ? (
        <StatePanel status="loading" />
      ) : (
        <StatePanel status="empty" emptyMessage="The war room is quiet for now." />
      ),
    banner: () => <HomeBannerRegion />,
    'new-here': emptyRegion,
    'lane-recruiting': emptyRegion,
    'lane-upcoming': emptyRegion,
    'lane-recent': emptyRegion,
    'lane-dms': emptyRegion,
  };
}

export function HomePage(): React.JSX.Element {
  const page = useHomePage();
  const { widthClass } = useSizeClasses();
  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view);

  return (
    <PageShell context="war-room" className="hf2">
      <div
        className={styles.root}
        data-el="home.root"
        data-compact={widthClass !== 'expanded'}
      >
        <PageHost declaration={HOME_DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
