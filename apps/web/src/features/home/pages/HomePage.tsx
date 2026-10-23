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
import { Chip } from '../../../components/primitives/Chip.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
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
import { QuestCard, type QuestCardProps } from '../../../components/domain/QuestCard.js';
import { NewHereShelf } from '../components/NewHereShelf.js';
import { Sched } from '../components/Sched.js';
import { isTitleEcho } from '../bannerText.js';
import { WeekStrip } from '../components/WeekStrip.js';
import {
  BannerMediaEmbed,
  classifyBannerMedia,
  isSafeHttpsUrl,
} from '../../../components/foundation/contentMedia.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useHomeBanner } from '../hooks/useHomeBanner.js';
import { useHomePage, type HomePageView } from '../hooks/useHomePage.js';
import styles from './home.module.css';
import { handleLabel, personLabels, statusLabel } from '../../../utils/format.js';

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
  const body = isTitleEcho(b.title, b.body) ? null : b.body;
  const bare = !body && !(b.ctaLabel && b.ctaHref) && !media;
  return (
    <div
      className={`home-featured-banner ${styles.banner}`}
      data-compact={widthClass !== 'expanded'}
      data-media={media !== null}
      data-bare={bare}
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
        {body ? (
          <div className={`type-body ${styles.bannerText}`}>{body}</div>
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
    <div data-el="home.heading">
      <PageHeader
        title={isAuthenticated ? greeting(displayName) : 'Welcome to Chronicler.'}
        meta={
          <span
            className="row"
            data-el="home.statsRow"
            data-gap="3"
            data-wrap="1"
            data-align="center"
          >
            {stats ? (
              <span>
                {stats.totalQuests.toLocaleString()} quests,{' '}
                {stats.activeCharacters.toLocaleString()} active characters
              </span>
            ) : null}
            {lanes.totals.dmsAccepting > 0 ? (
              <Chip size="sm" tone="line">
                {lanes.totals.dmsAccepting} DM
                {lanes.totals.dmsAccepting === 1 ? '' : 's'} accepting
              </Chip>
            ) : null}
            {next ? (
              <Chip size="sm" tone="line">
                Next session {formatScheduled(next.scheduledAt)}
              </Chip>
            ) : null}
          </span>
        }
      />
    </div>
  );
}

function HomeNewHereRegion({ showFor }: { showFor: boolean }): React.JSX.Element {
  if (!showFor) return emptyRegion();
  return (
    <div data-el="home.newHereShelf">
      <NewHereShelf
        title="New here? Start here."
        body="Pick a character and find your next adventure. Browse open quests below, or learn how Chronicler works."
        primaryCtaLabel="Browse open quests"
        primaryCtaHref="/quests"
        secondaryCtaLabel="How it works"
        secondaryCtaHref="/welcome"
        dismissable
        showFor
      />
    </div>
  );
}

const LANE_CAP = 3;
/** On phones each lane shows two cards and a link to the full list. */
const PHONE_LANE_CAP = 2;

function RecruitingLane({
  cards,
  dmLabels,
  total,
}: {
  cards: QuestCardProps[];
  dmLabels: ReadonlyMap<string, string>;
  total: number;
}): React.JSX.Element {
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  const shown = cards.slice(0, widthClass === 'compact' ? PHONE_LANE_CAP : LANE_CAP);
  const seeAll = Math.max(total, cards.length);
  return (
    <section className="lane" aria-label="Recruiting now" data-el="home.lane01">
      <div className="lane__head">
        <h2 className="type-heading">Recruiting now</h2>
        <Link className="btn ghost btn--sm" data-el="home.lane01.allBtn" to="/quests">
          {seeAll > shown.length ? `See all ${seeAll} quests` : 'See all quests'}
        </Link>
      </div>
      {cards.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="No open quests right now."
          action={
            <Link className="btn btn--sm" to="/quests">
              Browse quests
            </Link>
          }
        />
      ) : (
        <CardGrid as="ul" gap={5} aria-label="Open quests">
          {shown.map((card) => {
            const handle = handleLabel(card.dmUsername)?.toLowerCase();
            return (
              <li key={card.code} className={styles.cardItem}>
                <QuestCard
                  {...card}
                  dmName={handle ? dmLabels.get(handle) ?? card.dmName : card.dmName}
                  onSignUpClick={() => navigate(`/quests/${card.code}`)}
                />
              </li>
            );
          })}
        </CardGrid>
      )}
    </section>
  );
}

function UpcomingLane({
  quests,
  schedule,
  dmLabels,
  total,
}: {
  quests: HomeQuestView[];
  schedule: HomeLanesViewModel['upcomingSchedule'];
  dmLabels: ReadonlyMap<string, string>;
  total: number;
}): React.JSX.Element {
  const { formatScheduled } = useDateFormatter();
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  const laneCap = widthClass === 'compact' ? PHONE_LANE_CAP : LANE_CAP;
  const shown = quests.slice(0, laneCap);
  return (
    <section
      className="lane"
      aria-label="Coming up"
      data-el="home.lane02"
    >
      <div className="lane__head">
        <div className="lane__title">
          <h2 className="type-heading">Coming up in the next two weeks</h2>
        </div>
        {total > 0 ? (
          <Link className="btn ghost btn--sm" to="/calendar">
            {total > laneCap ? `See all ${total} scheduled` : 'Open calendar'}
          </Link>
        ) : null}
      </div>
      {quests.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="Nothing scheduled in the next two weeks."
          action={
            <Link className="btn btn--sm" to="/quests">
              Browse quests
            </Link>
          }
        />
      ) : (
        <Card data-el="home.weekStrip">
          <WeekStrip quests={schedule} />
          <div
            className={`cols ${styles.weekStripCols}`}
            data-n={widthClass === 'expanded' ? 3 : 1}
          >
            {shown.map((quest) => {
              const handle = handleLabel(quest.dmHandle)?.toLowerCase();
              return (
              <Sched
                key={quest.id}
                title={quest.title}
                status={quest.cardStatus}
                region={quest.regionName}
                dmUsername={handle ? dmLabels.get(handle) ?? null : null}
                party={quest.participants.map((p) => ({
                  characterName: p.characterName,
                  characterId: p.characterId,
                }))}
                totalSlots={quest.slotsMax}
                filledCount={quest.filledCount}
                when={formatScheduled(quest.scheduledAt)}
                onOpen={() => navigate(`/quests/${quest.shortCode}`)}
              />
              );
            })}
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
  return (
    <section
      className="lane"
      aria-label="Just played"
      data-el="home.lane03"
    >
      <div className="lane__head">
        <div className="lane__title">
          <h2 className="type-heading">Just played in the last 7 days</h2>
        </div>
        {total > 0 ? <span className="type-caption">{total} closed</span> : null}
      </div>
      {quests.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="No quests have closed in the last 7 days."
          action={
            <Link className="btn btn--sm" to="/quests">
              Browse quests
            </Link>
          }
        />
      ) : (
        <Card data-el="home.lane03.recentlyPlayed">
          <table className="tbl">
            <thead>
              <tr>
                <th>Quest</th>
                <th>Region</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quests.map((quest) => (
                <tr key={quest.id}>
                  <td>
                    <Link to={`/quests/${quest.shortCode}`}>{quest.title}</Link>
                  </td>
                  <td>{quest.regionName ?? ''}</td>
                  <td>
                    <Chip size="sm">{statusLabel(quest.status)}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function DmLane({
  dms,
  dmLabels,
}: {
  dms: HomeLanesViewModel['dmsAccepting'];
  dmLabels: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const memberHref = useMemberHref();
  const { widthClass } = useSizeClasses();
  if (dms.length === 0) {
    return emptyRegion();
  }
  const shown = dms.slice(0, widthClass === 'compact' ? PHONE_LANE_CAP : dms.length);
  return (
    <section className="lane" aria-label="DMs accepting" data-el="home.dmsAccepting">
      <Card>
        <div className="lane__head">
          <h2 className="type-heading">DMs accepting requests</h2>
          {dms.length > shown.length ? (
            <Link className="btn ghost btn--sm" to="/dms">
              See all {dms.length} DMs
            </Link>
          ) : null}
        </div>
        {shown.map((dm) => {
          const handle = handleLabel(dm.handle)?.toLowerCase();
          const label = (handle ? dmLabels.get(handle) : undefined) ?? personLabels([dm])[0];
          return (
          <div
            key={dm.memberId}
            className={`row ${styles.dmRow}`}
            data-justify="between"
          >
            <div className="row" data-gap="3">
              <Avatar name={label} size="sm" online={false} />
              <span className="type-body">{label}</span>
            </div>
            <Link
              className="btn btn--ghost btn--sm"
              to={memberHref(dm, 'dm')}
              aria-label={`${label} profile`}
            >
              View profile
            </Link>
          </div>
          );
        })}
      </Card>
    </section>
  );
}

function readyRegions(
  view: HomePageView,
  dmLabels: ReadonlyMap<string, string>,
): PageRegionRenderers {
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
    'lane-recruiting': () => (
      <RecruitingLane cards={opts.cards} dmLabels={dmLabels} total={lanes.totals.questBoard} />
    ),
    'lane-upcoming': () => (
      <UpcomingLane
        quests={lanes.upcoming}
        schedule={lanes.upcomingSchedule}
        dmLabels={dmLabels}
        total={lanes.totals.upcoming}
      />
    ),
    'lane-recent': () => (
      <RecentLane quests={lanes.recentlyClosed} total={lanes.totals.recentlyClosed} />
    ),
    'lane-dms': () => <DmLane dms={lanes.dmsAccepting} dmLabels={dmLabels} />,
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
        <StatePanel
          status="empty"
          title="Nothing on the board yet"
          emptyMessage="No quests are posted yet."
          action={
            <Link className="btn" to="/quests">
              Browse quests
            </Link>
          }
        />
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
  const visibleLaneCap = widthClass === 'compact' ? PHONE_LANE_CAP : LANE_CAP;
  const visiblePeople =
    page.status === 'ready'
      ? [
          ...page.view.cards.slice(0, visibleLaneCap).map((card) => ({
            displayName: card.dmName,
            handle: card.dmUsername,
          })),
          ...page.view.lanes.upcoming.slice(0, visibleLaneCap).map((quest) => ({
            displayName: quest.dmName,
            handle: quest.dmHandle,
          })),
          ...page.view.lanes.dmsAccepting
            .slice(
              0,
              widthClass === 'compact'
                ? PHONE_LANE_CAP
                : page.view.lanes.dmsAccepting.length,
            )
            .map((dm) => ({ displayName: dm.displayName, handle: dm.handle })),
        ]
      : [];
  const labels = personLabels(visiblePeople);
  const dmLabels = new Map<string, string>();
  visiblePeople.forEach((person, index) => {
    const handle = handleLabel(person.handle)?.toLowerCase();
    if (handle) dmLabels.set(handle, labels[index]);
  });
  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, dmLabels);

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
