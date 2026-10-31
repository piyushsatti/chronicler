import { useMemo, useState, type CSSProperties } from 'react';
import type { PageDeclaration } from '@pi/react-imposition';
import {
  PageHost,
  type PageRegionRenderers,
} from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { personLabels } from '../../../utils/format.js';
import type { ChronicleListItemView } from '../adapters/chronicleAdapter.js';
import { ChronCard } from '../components/ChronCard.js';
import { useCanCreateSummary, useChroniclesPage } from '../hooks/useChroniclesPage.js';
import {
  filterChroniclesByRange,
  groupChroniclesByPublicationDate,
  type ChronicleRange,
} from '../chronicleTimeline.js';
import { summaryCategoryLabel, summaryCategoryMeta } from '../summaryCategory.js';
import styles from './chronicles.module.css';

const DECLARATION: PageDeclaration = {
  page: 'chronicles',
  regions: [{ role: 'body', priority: 1 }],
};

const RANGE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
] as const;

function presentationCategory(entry: ChronicleListItemView): string | null {
  return entry.visibility === 'dm_only' ? 'dm' : entry.category;
}

function publicationDateLabel(date: string | null): string {
  if (!date) return 'Not yet dated';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function ChroniclesListPage(): React.JSX.Element {
  const page = useChroniclesPage();
  const canCreate = useCanCreateSummary();
  const [range, setRange] = useState<ChronicleRange>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { timeZone } = useDateFormatter();
  const now = useMemo(() => new Date(), []);

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

  const events = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return filterChroniclesByRange(allEvents, range, now, timeZone).filter((entry) => {
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
  }, [allEvents, now, range, searchQuery, timeZone]);
  const groups = useMemo(
    () => groupChroniclesByPublicationDate(events, timeZone),
    [events, timeZone],
  );
  const kinds = new Map<string, string>();
  events.forEach((entry) => {
    const category = presentationCategory(entry);
    kinds.set(summaryCategoryLabel(category), category ?? 'session');
  });
  const showKinds = kinds.size > 1;

  const header = (
    <div data-el="chronicles.eyebrow">
      <PageHeader
        title="Chronicles"
        lede="Session recaps, player journals and world events from across the campaign."
        actions={
          canCreate && (page.status === 'ready' || page.status === 'empty') ? (
            <Link
              className="btn btn--primary btn--sm"
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
  // Same toolbar, segment size and spacing as Codex and Rules (owner item 8).
  const toolbar = (
    <div data-el="chronicles.toolbar">
      <PageToolbar
        label="Filter chronicles"
        segments={(
          <PageToolbar.Segments
            aria-label="Chronicle date range"
            options={RANGE_OPTIONS}
            value={range}
            onValueChange={(value) => setRange(value)}
          />
        )}
        count={page.status === 'ready' ? `${events.length} ${events.length === 1 ? 'entry' : 'entries'}` : undefined}
        actions={(
          <PageToolbar.Search
            label="Search entries"
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search chronicles…"
          />
        )}
      />
    </div>
  );

  let regions: PageRegionRenderers;
  if (page.status === 'error') {
    regions = { body: () => <div className="stack" data-gap="5">{header}{toolbar}<StatePanel
        status="error"
        error={page.error}
        title="Something went wrong"
        onRetry={page.refetch}
      /></div> };
  } else if (page.status === 'loading') {
    regions = { body: () => <div className="stack" data-gap="5">{header}{toolbar}<Skeleton height={110} aria-label="Loading chronicles" /></div> };
  } else if (page.status === 'empty') {
    regions = { body: () => <div className="stack" data-gap="5">{header}{toolbar}<EmptyState kind="timeline-empty" /></div> };
  } else {
    regions = {
      body: () => (
        <div className="stack" data-gap="5">
          {header}
          {toolbar}

          {showKinds ? (
            <div className={styles.legend} role="group" aria-label="Entry types">
              {[...kinds].map(([label, category]) => {
                const meta = summaryCategoryMeta(category);
                return (
                  <span key={label} className={styles.legendItem}>
                    <span className={styles.legendDot} style={{ '--chron-type-color': meta.color } as CSSProperties} />
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}

          <div data-el="chronicles.timeline" className={styles.timeline}>
            {events.length === 0 ? (
              <EmptyState
                kind="timeline-empty"
                message="No entries match this view."
              />
            ) : (
              groups.map(({ date, entries }) => (
                <section key={date ?? 'undated'} className={styles.dayGroup}>
                  <div className={styles.dayHeading}>
                    <h2 data-el="chronicles.publicationDate">{publicationDateLabel(date)}</h2>
                    <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · publication date</span>
                    <span className={styles.dayRule} />
                  </div>
                  <ol className={styles.entries} aria-label={publicationDateLabel(date)}>
                    {entries.map((entry) => (
                      <li key={entry.id} className={styles.item}>
                        <ChronCard
                          entry={entry}
                          authorLabel={entry.authorHandle ? authorLabels.get(entry.authorHandle) : undefined}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            )}
          </div>
        </div>
      ),
    };
  }

  return (
    <PageShell context="chronicle" className={`hf2 ${styles.root}`}>
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
