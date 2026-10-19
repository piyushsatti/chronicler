import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useNavigate } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { useToast } from '../../../components/primitives/Toast.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { queryKeys } from '../../../api/queryKeys.js';
import type { AppError } from '../../../errors/types.js';
import { toAppError } from '../../../errors/toAppError.js';
import { errorCopy } from '../../../utils/errorCopy.js';
import { greeting } from '../../../utils/greeting.js';
import { formatScheduled } from '../../../utils/format.js';
import { navigateToCtaHref } from '../../../utils/ctaHref.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  loadMyCharacterIds,
  withdrawFromQuest,
} from '../../quest/adapters/questAdapter.js';
import type { HomeDocumentView, HomeViewModel } from '../adapters/homeAdapter.js';
import {
  mapToOpenQuestCardProps,
  type HomeLanesViewModel,
  type HomeQuestView,
} from '../adapters/homeLanesAdapter.js';
import { OpenQuestCard } from '../components/OpenQuestCard.js';
import { NewHereShelf } from '../components/NewHereShelf.js';
import { Sched } from '../components/Sched.js';
import { WeekStrip } from '../components/WeekStrip.js';
import { useHomeBanner } from '../hooks/useHomeBanner.js';
import { useHomePage } from '../hooks/useHomePage.js';
import { useSiteStats } from '../hooks/useSiteStats.js';
import styles from './home.module.css';


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
    { role: 'buckets', priority: 7 },
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

function isSafeHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function HomeBannerRegion(): React.JSX.Element {
  const banner = useHomeBanner();
  const navigate = useNavigate();
  if (banner.isLoading || banner.isError || !banner.data?.enabled) {
    return emptyRegion();
  }
  const b = banner.data;
  return (
    <div
      className="home-featured-banner"
      data-el="home.banner"
      data-testid="home-featured-banner"
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: 196,
        background: 'var(--color-hero-bg)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.6,
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 11px, color-mix(in srgb, var(--color-hero-ink) 2%, transparent) 11px, color-mix(in srgb, var(--color-hero-ink) 2%, transparent) 22px)',
        }}
      />
      {b.mediaUrl && isSafeHttpsUrl(b.mediaUrl) ? (
        <div className="home-banner-media" data-testid="home-banner-media">
          {b.mediaKind === 'image' || !b.mediaKind ? (
            <img src={b.mediaUrl} alt={b.mediaLabel ?? ''} />
          ) : (
            <a
              className="home-banner-media-fallback"
              href={b.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {b.mediaLabel || 'Open source'}
            </a>
          )}
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 0%, var(--color-hero-glow), transparent 70%)',
        }}
      />
      <div
        className="stack home-featured-banner-content"
        data-justify="center"
        style={{
          position: 'relative',
          padding: 'var(--sp-6)',
          maxWidth: 'calc(var(--sp-4) * 36)',
          minHeight: 'calc(var(--sp-3) * 16)',
        }}
      >
        {b.title ? (
          <div
            className="type-display"
            style={{ color: 'var(--color-hero-ink)', marginBottom: 8 }}
          >
            {b.title}
          </div>
        ) : null}
        {b.body ? (
          <div
            className="type-body"
            style={{ color: 'var(--color-hero-ink-2)', marginBottom: 16, maxWidth: 440 }}
          >
            {b.body}
          </div>
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
    </div>
  );
}

function HomeHeadingRegion({
  memberCount,
  displayName,
}: {
  memberCount: string | null;
  displayName: string | null;
}): React.JSX.Element {
  return (
    <header className="stack" data-el="home.heading" data-gap="2">
      <h1 className="type-display">{greeting(displayName)}</h1>
      {memberCount ? (
        <div className="row" data-gap="2" data-align="baseline">
          <p className="type-value">{memberCount}</p>
          <p className="type-caption">members on the server</p>
        </div>
      ) : null}
    </header>
  );
}

function HomeNewHereRegion({ showFor }: { showFor: boolean }): React.JSX.Element {
  if (!showFor) return emptyRegion();
  return (
    <div data-el="home.newHereShelf">
      <NewHereShelf
        beginnerCount={0}
        title="New here?"
        body="Browse open quests below, or learn how Chronicler works."
        primaryCtaLabel="Browse open quests →"
        primaryCtaHref="/quests"
        secondaryCtaLabel="How it works"
        secondaryCtaHref="/welcome"
        dismissable
        showFor
      />
    </div>
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

function RecruitingLane({
  quests,
  myCharacterIds,
  withdrawPending,
  onWithdraw,
}: {
  quests: HomeQuestView[];
  myCharacterIds: ReadonlySet<string>;
  withdrawPending: boolean;
  onWithdraw: (quest: HomeQuestView, characterId: string) => void;
}): React.JSX.Element {
  const navigate = useNavigate();
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
      {quests.length === 0 ? (
        <EmptyState
          kind="no-quests"
          message="No open quests right now."
          actionLabel="Browse the Tavern Board"
          onAction={() => navigate('/quests')}
        />
      ) : (
        <div data-el="home.lane01.grid" className="cols" data-n="3" data-gap="5">
          {quests.map((quest, index) => {
            const seated = quest.participants.find((p) => myCharacterIds.has(p.characterId));
            return (
              <OpenQuestCard
                key={quest.id}
                {...mapToOpenQuestCardProps(quest, {
                  animIndex: index,
                  myCharacterIds,
                  isMutating: withdrawPending,
                  onWithdrawConfirm: seated
                    ? () => onWithdraw(quest, seated.characterId)
                    : undefined,
                })}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function UpcomingLane({ quests }: { quests: HomeQuestView[] }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <section className="lane" aria-label="Coming up — next two weeks" data-el="home.lane02">
      <div className="lane__head">
        <div className="lane__title">
          <span className="n">02</span>
          <h2 className="type-heading">Coming up — next two weeks</h2>
        </div>
        {quests.length > 0 ? (
          <span className="type-caption">{quests.length} scheduled</span>
        ) : null}
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
          <WeekStrip quests={quests} />
          <div className="cols" data-n="3" style={{ marginTop: 'var(--sp-4)' }}>
            {quests.slice(0, 3).map((quest) => (
              <Sched
                key={quest.id}
                code={quest.shortCode}
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

function RecentLane({ quests }: { quests: HomeQuestView[] }): React.JSX.Element {
  if (quests.length === 0) {
    return emptyRegion();
  }
  return (
    <section className="lane" aria-label="Just happened — last 7 days" data-el="home.lane03">
      <div className="lane__head">
        <div className="lane__title">
          <span className="n">03</span>
          <h2 className="type-heading">Just happened — last 7 days</h2>
        </div>
        <span className="type-caption">{quests.length} closed</span>
      </div>
      <ul className="stack" data-gap="2">
        {quests.map((quest) => (
          <li key={quest.id} className="card" data-pad="3">
            <div className="row" data-justify="between">
              <span className="code">{quest.shortCode}</span>
              <span className="type-caption">{formatScheduled(quest.scheduledAt)}</span>
            </div>
            <Link className="type-title" to={`/quests/${quest.shortCode}`}>
              {quest.title}
            </Link>
            {quest.regionName ? (
              <p className="type-caption">{quest.regionName}</p>
            ) : null}
          </li>
        ))}
      </ul>
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
  opts: {
    memberCount: string | null;
    displayName: string | null;
    showNewHere: boolean;
    myCharacterIds: ReadonlySet<string>;
    withdrawPending: boolean;
    onWithdraw: (quest: HomeQuestView, characterId: string) => void;
  },
): PageRegionRenderers {
  const { buckets, lanes } = view;
  return {
    heading: () => (
      <HomeHeadingRegion memberCount={opts.memberCount} displayName={opts.displayName} />
    ),
    banner: () => <HomeBannerRegion />,
    'new-here': () => <HomeNewHereRegion showFor={opts.showNewHere} />,
    'lane-recruiting': () => (
      <RecruitingLane
        quests={lanes.recruiting}
        myCharacterIds={opts.myCharacterIds}
        withdrawPending={opts.withdrawPending}
        onWithdraw={opts.onWithdraw}
      />
    ),
    'lane-upcoming': () => <UpcomingLane quests={lanes.upcoming} />,
    'lane-recent': () => <RecentLane quests={lanes.recentlyClosed} />,
    'lane-dms': () => <DmLane dms={lanes.dmsAccepting} />,
    buckets: () => <HomeBucketsRegion buckets={buckets} />,
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
    buckets: emptyRegion,
  };
}

export function HomePage(): React.JSX.Element {
  const page = useHomePage();
  const stats = useSiteStats();
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const myCharacters = useQuery({
    queryKey: queryKeys.characters('home-mine'),
    queryFn: loadMyCharacterIds,
    enabled: isAuthenticated,
  });
  const myCharacterIds = new Set(myCharacters.data ?? []);

  const withdraw = useMutation({
    mutationFn: ({ questId, characterId }: { questId: string; characterId: string }) =>
      withdrawFromQuest(questId, characterId),
    onSuccess: async () => {
      addToast('Withdrawn — your slot is now open.', 'success');
      await queryClient.invalidateQueries({ queryKey: queryKeys.homeLanes });
    },
    onError: (err) => {
      const appErr = toAppError(err, 'home:openquest:withdraw');
      addToast(appErr.userMessage || errorCopy(undefined, 'Could not withdraw. Please try again.'), 'error');
    },
  });

  const memberCount = stats.data != null ? String(stats.data.totalMembers) : null;
  const displayName = isAuthenticated
    ? (me.data?.displayName ?? me.data?.handle ?? null)
    : null;
  const showNewHere = !isAuthenticated;

  const regions: PageRegionRenderers =
    page.status === 'error'
      ? statusRegions('error', page.error)
      : page.status === 'loading'
        ? statusRegions('loading')
        : page.status === 'empty'
          ? statusRegions('empty')
          : readyRegions(page.view, {
              memberCount,
              displayName,
              showNewHere,
              myCharacterIds,
              withdrawPending: withdraw.isPending,
              onWithdraw: (quest, characterId) => {
                withdraw.mutate({ questId: quest.id, characterId });
              },
            });

  return (
    <PageShell context="war-room">
      <div className={styles.root} data-el="home.root">
        <PageHost declaration={HOME_DECLARATION} regions={regions} />
      </div>
    </PageShell>
  );
}
