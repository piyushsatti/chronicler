import { useMemo, useState } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import {
  PageHost,
  useSizeClasses,
  type PageRegionRenderers,
} from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { ErrorState } from '../../../components/primitives/ErrorState.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { civilDateInZone, monthLabel, personLabels } from '../../../utils/format.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { ChronCard } from '../components/ChronCard.js';
import { ChronicleFilterBar } from '../components/ChronicleFilterBar.js';
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
      ? `${date.eraAbbrev} ${date.year} · ${date.periodName}`
      : `Game day ${entry.gameDay}`;
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
  const { widthClass } = useSizeClasses();
  const canCreate = useCanCreateSummary();

  const [activeRegion, setActiveRegion] = useState('All');
  const [activeArc, setActiveArc] = useState('All');
  const [activeAuthor, setActiveAuthor] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const allEvents = page.status === 'ready' ? page.view.items : [];
  const visibleAuthorLabels = personLabels(allEvents.map((entry) => ({
    displayName: entry.authorDisplayName,
    handle: entry.authorHandle,
  })));
  const authorLabels = new Map<string, string>();
  allEvents.forEach((entry, index) => {
    if (entry.authorHandle && !authorLabels.has(entry.authorHandle)) {
      authorLabels.set(entry.authorHandle, visibleAuthorLabels[index] ?? entry.authorHandle);
    }
  });

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
  const mixedTypes = new Set(allEvents.map((entry) => entry.category)).size > 1;
  const hasKnownGameDay = allEvents.some((entry) => entry.gameDay != null);
  const hasNamedGameDate = allEvents.some((entry) => entry.gameDate != null);

  const header = (
    <div data-el="chronicles.eyebrow" className={styles.header}>
      <PageHeader
        title="Chronicles"
        lede="Session recaps, player journals and world events from across the campaign."
        meta={
          page.status === 'ready' && hasKnownGameDay && !hasNamedGameDate
            ? 'Named calendar dates are not configured; showing game-day ordinals.'
            : undefined
        }
        actions={
          canCreate && (page.status === 'ready' || page.status === 'empty') ? (
            <Link
              className="btn primary"
              to="/summaries/new"
              data-el="chronicles.newEntryBtn"
            >
              New entry
            </Link>
          ) : null
        }
      />
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
          <div className={styles.filters}>
            <ChronicleFilterBar
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
              authorLabels={authorLabels}
              count={`${events.length} of ${allEvents.length} ${
                allEvents.length === 1 ? 'entry' : 'entries'
              }`}
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
                    <h2 className="type-heading">{label}</h2>
                    <div className={styles.periodRule} />
                  </div>

                  <CardGrid as="ul" gap={4} aria-label={label}>
                    {groupEvents.map((entry) => (
                      <li key={entry.id} className={styles.item}>
                        <ChronCard
                          entry={entry}
                          authorLabel={entry.authorHandle ? authorLabels.get(entry.authorHandle) : undefined}
                          showType={mixedTypes}
                        />
                      </li>
                    ))}
                  </CardGrid>
                </div>
              ))
            )}
          </div>
        </>
      ),
    };
  }

  return (
    <PageShell context="chronicle" className={`hf2 ${styles.root}`}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
