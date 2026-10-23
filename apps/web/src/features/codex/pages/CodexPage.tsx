import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { useMe } from '../../../hooks/useMe.js';
import { useInfiniteScroll } from '../../../components/primitives/useInfiniteScroll.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import { CODE_CATEGORIES } from '../types.js';
import {
  codexCategoryHeading,
  findCodexCategory,
} from '../../../utils/codexCategories.js';
import { pluralize } from '../../../utils/format.js';
import styles from './codex.module.css';

const PRIMARY_CATEGORIES = ['Lore', 'Locations', 'Entities', 'Feature'] as const;
const ALL_CATEGORY = '__all__';

function RegionsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5c-2.2-2.3-3.2-5.1-3.2-8.5s1-6.2 3.2-8.5Z" />
    </svg>
  );
}

function MapIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15m6-12v15" />
    </svg>
  );
}

export function CodexPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const [category, setCategory] = useState(
    () => findCodexCategory(params.get('category')) ?? params.get('category') ?? '',
  );
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const page = useCodexPage(category, query);
  const { data: me } = useMe();
  const entries = page.status === 'ready' ? page.view : [];
  const categories = [
    ...new Set([
      ...CODE_CATEGORIES,
      ...page.categories.map((entry) => entry.category),
      ...entries.map((entry) => entry.category ?? ''),
      category,
    ]),
  ].filter(Boolean);
  const needle = query.trim();
  const groups = [...new Set([...categories, 'Uncategorized'])]
    .map((name) => ({
      name,
      entries: entries.filter((entry) => (entry.category || 'Uncategorized') === name),
    }))
    .filter((group) => group.entries.length > 0);

  const primaryOptions = [
    { value: ALL_CATEGORY, label: 'All' },
    ...PRIMARY_CATEGORIES.map((name) => ({
      value: name,
      label: codexCategoryHeading(name),
    })),
  ];
  const primaryValues = new Set<string>([ALL_CATEGORY, ...PRIMARY_CATEGORIES]);
  const moreOptions = categories
    .filter((name) => !primaryValues.has(name))
    .map((name) => ({ value: name, label: codexCategoryHeading(name) }));
  const selectedCategory = category || ALL_CATEGORY;
  const summary =
    page.status !== 'ready'
      ? undefined
      : entries.length >= (page.total ?? entries.length)
        ? pluralize(entries.length, 'entry', 'entries')
        : `Showing ${entries.length} of ${page.total} entries`;
  const sentinelRef = useInfiniteScroll({
    enabled: page.status === 'ready' && page.hasMore && !page.isFetching,
    onLoadMore: page.loadMore,
  });

  return (
    <PageShell context="tavern" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="codex">
        <div className="stack" data-gap="5">
          <PageHeader
            title="Codex"
            lede="The campaign wiki: people, places, factions and lore, and how they connect."
            actions={
              me ? (
                <Link className="btn btn--primary" to="/codex/new">
                  New Codex entry
                </Link>
              ) : null
            }
          />
          <PageToolbar
            label="Filter the Codex"
            count={summary}
            segments={
              <PageToolbar.Segments
                aria-label="Codex categories"
                options={primaryOptions}
                moreOptions={moreOptions}
                value={selectedCategory}
                onValueChange={(value) =>
                  setCategory(value === ALL_CATEGORY ? '' : value)
                }
              />
            }
            actions={
              <>
                <PageToolbar.Search
                  label="Search the Codex"
                  placeholder="Search the Codex…"
                  value={query}
                  onValueChange={setQuery}
                />
                <PageToolbar.IconAction label="Regions" href="/regions">
                  <RegionsIcon />
                </PageToolbar.IconAction>
                <PageToolbar.IconAction label="Map" href="/map">
                  <MapIcon />
                </PageToolbar.IconAction>
              </>
            }
          />
          <div className={styles.resultsIntro}>
            <p>{category ? codexCategoryHeading(category) : 'All entries'}</p>
            <p>Browse the shared campaign record</p>
          </div>
          <div className="stack" data-gap="4">
            {page.status === 'error' ? (
              <StatePanel status="error" error={page.error} />
            ) : page.status === 'loading' ? (
              <StatePanel status="loading" />
            ) : page.status === 'empty' ? (
              <StatePanel
                status="empty"
                emptyMessage={
                  needle || category
                    ? 'No entries match these filters.'
                    : 'No codex entries.'
                }
                action={
                  needle || category ? (
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setCategory('');
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              groups.map((group) => (
                <section
                  key={group.name}
                  className="stack"
                  data-gap="2"
                  aria-label={codexCategoryHeading(group.name)}
                >
                  <div className="row" data-gap="2">
                    <h2 className="type-heading">{codexCategoryHeading(group.name)}</h2>
                    <div className={styles.divider} />
                  </div>
                  <CardGrid gap={3}>
                    {group.entries.map((entry) => (
                      <Card
                        key={entry.id}
                        variant="clickable"
                        to={`/codex/${entry.slug}`}
                        aria-label={entry.title}
                        className={`${styles.directoryCard} ${styles.codexCard}`}
                        pad={4}
                      >
                        <span className={styles.directoryCardTop}>
                          <span className={styles.entryType}>
                            {entry.category ?? 'Uncategorized'}
                          </span>
                          <span className={styles.entryOpen} aria-hidden="true">
                            ↗
                          </span>
                        </span>
                        <span className={styles.entryTitle}>{entry.title}</span>
                        {entry.excerpt ? (
                          <span className={styles.narrative}>
                            {entry.excerpt}
                          </span>
                        ) : null}
                      </Card>
                    ))}
                  </CardGrid>
                </section>
              ))
            )}
            {page.status === 'ready' ? (
              <>
                {page.hasMore ? <div ref={sentinelRef} aria-hidden="true" /> : null}
                {page.hasMore && page.isFetching ? (
                  <p className={styles.loadingMore} role="status">
                    Loading more entries…
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
