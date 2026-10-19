import { useCallback, useMemo, useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useNavigate } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { hasRole, isAdmin } from '../../../auth/roles.js';
import { useMe } from '../../../hooks/useMe.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { ChronCard } from '../components/ChronCard.js';
import { FilterSidebar } from '../components/FilterSidebar.js';
import { useChroniclesPage } from '../hooks/useChroniclesPage.js';

const DECLARATION: PageDeclaration = {
  page: 'chronicles',
  regions: [{ role: 'body', priority: 1 }],
};

const UNDATED_LABEL = 'UNDATED';

function gameDaySortValue(entry: ChronicleListItemView): number {
  return entry.gameDay ?? Number.NEGATIVE_INFINITY;
}

function groupByCalendarPeriod(
  items: ChronicleListItemView[],
): Array<{ label: string; events: ChronicleListItemView[] }> {
  const dated = items
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.gameDate != null || entry.gameDay != null)
    .sort((a, b) => gameDaySortValue(b.entry) - gameDaySortValue(a.entry) || a.index - b.index);
  const groups = new Map<string, { label: string; events: ChronicleListItemView[] }>();
  for (const { entry } of dated) {
    const date = entry.gameDate;
    const key = date
      ? `date:${date.year}:${date.periodIndex}`
      : `day:${entry.gameDay}`;
    const label = date
      ? `${date.eraAbbrev} ${date.year} · ${date.periodName.toUpperCase()}`
      : `GAME DAY ${entry.gameDay}`;
    const group = groups.get(key);
    if (group) group.events.push(entry);
    else groups.set(key, { label, events: [entry] });
  }
  const undated = items.filter((entry) => entry.gameDate == null && entry.gameDay == null);
  return [
    ...groups.values(),
    ...(undated.length > 0 ? [{ label: UNDATED_LABEL, events: undated }] : []),
  ];
}

function distinctSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => v != null && v !== ''))].sort();
}

function canCreateSummary(roles: readonly string[] | undefined): boolean {
  if (!roles?.length) return false;
  if (isAdmin(roles)) return true;
  return hasRole(roles, 'player') || hasRole(roles, 'dm');
}

export function ChroniclesListPage(): React.JSX.Element {
  const page = useChroniclesPage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: me } = useMe();
  const canCreate = isAuthenticated && canCreateSummary(me?.roles);

  const [activeRegion, setActiveRegion] = useState('All');
  const [activeArc, setActiveArc] = useState('All');
  const [activeAuthor, setActiveAuthor] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const allEvents = page.status === 'ready' ? page.view.items : [];
  const total = page.status === 'ready' ? page.view.total : 0;

  const regionOptions = useMemo(
    () => ['All', ...distinctSorted(allEvents.map((e) => e.region))],
    [allEvents],
  );
  const arcOptions = useMemo(
    () => ['All', ...distinctSorted(allEvents.map((e) => e.arc))],
    [allEvents],
  );
  const authorOptions = useMemo(
    () => ['All', ...distinctSorted(allEvents.map((e) => e.authorHandle))],
    [allEvents],
  );

  const events = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return allEvents.filter((entry) => {
      if (activeRegion !== 'All' && entry.region !== activeRegion) return false;
      if (activeArc !== 'All' && entry.arc !== activeArc) return false;
      if (activeAuthor !== 'All' && (entry.authorHandle ?? '') !== activeAuthor) return false;
      if (!needle) return true;
      return [
        entry.title,
        entry.excerpt,
        entry.authorHandle,
        entry.region,
        entry.arc,
        ...entry.tags,
      ].some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [allEvents, activeArc, activeAuthor, activeRegion, searchQuery]);

  const grouped = useMemo(() => groupByCalendarPeriod(events), [events]);
  const hasKnownGameDay = allEvents.some((entry) => entry.gameDay != null);
  const hasNamedGameDate = allEvents.some((entry) => entry.gameDate != null);
  const eraAbbrev =
    allEvents.find((entry) => entry.gameDate?.eraAbbrev)?.gameDate?.eraAbbrev ?? null;

  const handleCardClick = useCallback(
    (slug: string) => navigate(`/chronicles/${slug}`),
    [navigate],
  );

  const header = (
    <div
      className="row"
      data-el="chronicles.eyebrow"
      data-align="end"
      data-justify="between"
      data-gap="4"
      data-wrap="1"
      style={{ marginBottom: 'var(--sp-8)' }}
    >
      <div>
        <p className="type-label">
          {page.status === 'ready'
            ? `${eraAbbrev ? `${eraAbbrev} · ` : 'GAME TIMELINE · '}${total} ${
                total === 1 ? 'ENTRY' : 'ENTRIES'
              }`
            : page.status === 'empty'
              ? 'GAME TIMELINE · 0 ENTRIES'
              : 'GAME TIMELINE'}
        </p>
        <h1 className="type-display">Chronicles</h1>
        <p className="type-body">
          Session recaps, player journals, arc summaries, and world events — the living record of
          this campaign.
        </p>
        {page.status === 'ready' && hasKnownGameDay && !hasNamedGameDate ? (
          <p className="type-caption">
            Named calendar dates are not configured; showing game-day ordinals.
          </p>
        ) : null}
      </div>
      {canCreate && (page.status === 'ready' || page.status === 'empty') ? (
        <Link
          className="btn primary"
          to="/summaries/new"
          data-el="chronicles.newEntryBtn"
          style={{ flexShrink: 0 }}
        >
          + New entry
        </Link>
      ) : null}
    </div>
  );

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = {
      body: () => (
        <>
          {header}
          <ErrorState onRetry={page.refetch} />
        </>
      ),
    };
  } else if (page.status === 'loading') {
    regions = {
      body: () => (
        <>
          {header}
          <Skeleton height={110} aria-label="Loading chronicles" />
        </>
      ),
    };
  } else if (page.status === 'empty') {
    regions = {
      body: () => (
        <>
          {header}
          <EmptyState kind="timeline-empty" />
        </>
      ),
    };
  } else {
    regions = {
      body: () => (
        <>
          {header}
          <div className="grid grid-cols-1 md:grid-cols-[210px_1fr]" data-gap="6" data-align="start">
            <div data-el="chronicles.filterSidebar">
              <FilterSidebar
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                activeRegion={activeRegion}
                onRegionChange={setActiveRegion}
                activeArc={activeArc}
                onArcChange={setActiveArc}
                activeAuthor={activeAuthor}
                onAuthorChange={setActiveAuthor}
                regionOptions={regionOptions}
                arcOptions={arcOptions}
                authorOptions={authorOptions}
              />
            </div>

            <div data-el="chronicles.timeline">
              {events.length === 0 ? (
                <EmptyState kind="timeline-empty" message="No entries match these filters." />
              ) : (
                grouped.map(({ label, events: groupEvents }) => (
                  <div key={label} style={{ marginBottom: 'var(--sp-8)' }}>
                    <div
                      className="row"
                      data-el="chronicles.seasonHeader"
                      data-gap="3"
                      style={{ marginBottom: 'var(--sp-4)' }}
                    >
                      <span className="type-label" style={{ whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <div style={{ flex: 1, borderTop: '1px solid var(--color-border-2)' }} />
                      <span className="type-code" style={{ whiteSpace: 'nowrap' }}>
                        {groupEvents.length} {groupEvents.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>

                    <div style={{ position: 'relative', paddingLeft: 2 }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 4,
                          top: 20,
                          bottom: 0,
                          width: 1,
                          background: 'var(--color-border)',
                        }}
                      />
                      {groupEvents.map((entry) => (
                        <ChronCard
                          key={entry.id}
                          entry={entry}
                          onClick={() => handleCardClick(entry.slug)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ),
    };
  }

  return (
    <PageShell context="chronicle" max="default" className="hf2">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
