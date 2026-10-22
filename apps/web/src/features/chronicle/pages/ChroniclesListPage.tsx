import { useCallback, useMemo, useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import {
  PageHost,
  useSizeClasses,
  type PageRegionRenderers,
} from '@pi/react-imposition/react';
import { Link, useNavigate } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { civilDateInZone, monthLabel } from '../../../utils/format.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { ChronCard } from '../components/ChronCard.js';
import { FilterSidebar } from '../components/FilterSidebar.js';
import { useCanCreateSummary, useChroniclesPage } from '../hooks/useChroniclesPage.js';
import styles from './chronicles.module.css';

const DECLARATION: PageDeclaration = {
  page: 'chronicles',
  regions: [{ role: 'body', priority: 1 }],
};

const UNDATED_LABEL = 'Not yet dated';

function gameDaySortValue(entry: ChronicleListItemView): number {
  return entry.gameDay ?? Number.NEGATIVE_INFINITY;
}

/** The real-world instant an undated entry is filed under: when it was played, else when it entered the chronicle. */
function realDateOf(entry: ChronicleListItemView): string | null {
  return entry.occurredAt ?? entry.publishedAt;
}

/**
 * Game-dated entries come first, newest game day first, grouped by calendar
 * period. Entries without a game date fall back to the real month they were
 * played or published, so they still read as a timeline.
 */
function groupByCalendarPeriod(
  items: ChronicleListItemView[],
  timeZone: string | null,
): Array<{ label: string; events: ChronicleListItemView[] }> {
  const dated = items
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.gameDate != null || entry.gameDay != null)
    .sort(
      (a, b) =>
        gameDaySortValue(b.entry) - gameDaySortValue(a.entry) || a.index - b.index,
    );
  const groups = new Map<string, { label: string; events: ChronicleListItemView[] }>();
  for (const { entry } of dated) {
    const date = entry.gameDate;
    const key = date ? `date:${date.year}:${date.periodIndex}` : `day:${entry.gameDay}`;
    const label = date
      ? `${date.eraAbbrev} ${date.year} · ${date.periodName.toUpperCase()}`
      : `GAME DAY ${entry.gameDay}`;
    const group = groups.get(key);
    if (group) group.events.push(entry);
    else groups.set(key, { label, events: [entry] });
  }
  const withoutGameDate = items.filter(
    (entry) => entry.gameDate == null && entry.gameDay == null,
  );
  const realMonths = new Map<
    string,
    { label: string; events: ChronicleListItemView[] }
  >();
  const undated: ChronicleListItemView[] = [];
  for (const { entry } of withoutGameDate
    .map((entry, index) => ({ entry, index, at: Date.parse(realDateOf(entry) ?? '') }))
    .sort((a, b) => (b.at || 0) - (a.at || 0) || a.index - b.index)) {
    // The month the viewer saw it happen, in their chosen zone, not UTC.
    const day = civilDateInZone(realDateOf(entry), timeZone);
    if (!day) {
      undated.push(entry);
      continue;
    }
    const key = day.slice(0, 7);
    const group = realMonths.get(key);
    if (group) group.events.push(entry);
    else realMonths.set(key, { label: monthLabel(key), events: [entry] });
  }
  return [
    ...groups.values(),
    ...realMonths.values(),
    ...(undated.length > 0 ? [{ label: UNDATED_LABEL, events: undated }] : []),
  ];
}

function distinctSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => v != null && v !== ''))].sort();
}

export function ChroniclesListPage(): React.JSX.Element {
  const page = useChroniclesPage();
  const navigate = useNavigate();
  const { widthClass } = useSizeClasses();
  const canCreate = useCanCreateSummary();

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
      if (activeAuthor !== 'All' && (entry.authorHandle ?? '') !== activeAuthor)
        return false;
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

  const { timeZone } = useDateFormatter();
  const grouped = useMemo(
    () => groupByCalendarPeriod(events, timeZone),
    [events, timeZone],
  );
  const hasKnownGameDay = allEvents.some((entry) => entry.gameDay != null);
  const hasNamedGameDate = allEvents.some((entry) => entry.gameDate != null);
  const eraAbbrev =
    page.status === 'ready' || page.status === 'empty' ? page.view.eraAbbrev : null;

  const handleCardClick = useCallback(
    (slug: string) => navigate(`/chronicles/${slug}`),
    [navigate],
  );

  const header = (
    <div
      className={`row ${styles.header}`}
      data-el="chronicles.eyebrow"
      data-align="end"
      data-justify="between"
      data-gap="4"
      data-wrap="1"
    >
      <div>
        <p className="type-label">
          {page.status === 'ready'
            ? `${eraAbbrev ? `${eraAbbrev} · ` : 'GAME TIMELINE · '}${total} ${
                total === 1 ? 'ENTRY' : 'ENTRIES'
              }`
            : page.status === 'empty'
              ? `${eraAbbrev ? `${eraAbbrev} · ` : 'GAME TIMELINE · '}0 ENTRIES`
              : 'GAME TIMELINE'}
        </p>
        <h1 className="type-display">Chronicles</h1>
        <p className="type-body">
          Session recaps, player journals, arc summaries, and world events — the living
          record of this campaign.
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
          data-shrink="0"
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
          <div className={styles.layout} data-sidebar={widthClass === 'expanded'}>
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
                collapsible={widthClass !== 'expanded'}
              />
            </div>

            <div data-el="chronicles.timeline">
              {events.length === 0 ? (
                <EmptyState
                  kind="timeline-empty"
                  message="No entries match these filters."
                />
              ) : (
                grouped.map(({ label, events: groupEvents }) => (
                  <div key={label} className={styles.period}>
                    <div
                      className={`row ${styles.periodHeader}`}
                      data-el="chronicles.seasonHeader"
                      data-gap="3"
                    >
                      <span className="type-label">{label}</span>
                      <div className={styles.periodRule} />
                      <span className="type-code">
                        {groupEvents.length}{' '}
                        {groupEvents.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>

                    <div className={styles.periodEntries}>
                      <div className={styles.spine} />
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
    <PageShell context="chronicle" max="default" className={`hf2 ${styles.root}`}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
