import { useState } from 'react';
import { useSizeClasses } from '@pi/react-imposition/react';
import { Link, useSearchParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { useMe } from '../../../hooks/useMe.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import { CODE_CATEGORIES } from '../types.js';
import {
  codexCategoryHeading,
  findCodexCategory,
} from '../../../utils/codexCategories.js';
import { pluralize } from '../../../utils/format.js';
import styles from './codex.module.css';

type CategoryOption = { name: string; label: string; count: number | null };

export function CodexPage(): React.JSX.Element {
  const [params] = useSearchParams();
  // Entry pages link their category chip here as ?category=<value>.
  const [category, setCategory] = useState(
    () => findCodexCategory(params.get('category')) ?? params.get('category') ?? '',
  );
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const page = useCodexPage(category, query);
  // The unfiltered list backs the chip counts; with no category it is the
  // same query as `page`, so react-query shares it.
  const all = useCodexPage('', query);
  const { data: me } = useMe();
  const { widthClass } = useSizeClasses();
  const entries = page.status === 'ready' ? page.view : [];
  const categories = [
    ...new Set([
      ...CODE_CATEGORIES,
      ...page.categories.map((entry) => entry.category),
      ...entries.map((entry) => entry.category ?? ''),
    ]),
  ].filter(Boolean);
  const needle = query.trim();
  const groups = [...new Set([...categories, 'Uncategorized'])]
    .map((name) => ({
      name,
      entries: entries.filter((entry) => (entry.category || 'Uncategorized') === name),
    }))
    .filter((group) => group.entries.length > 0);

  // Exact per-category counts need every entry loaded; otherwise only the
  // totals the API reports (All, and the active category) are shown.
  const allEntries = all.status === 'ready' ? all.view : [];
  const exact = all.status === 'ready' && !all.hasMore;
  const countFor = (name: string): number | null => {
    if (!name) return all.total ?? (all.status === 'empty' ? 0 : null);
    if (exact)
      return allEntries.filter(
        (entry) =>
          entry.category === name || (entry.category ?? '').startsWith(`${name}/`),
      ).length;
    return name === category ? page.total : null;
  };
  const options: CategoryOption[] = ['', ...categories].map((name) => ({
    name,
    label: name ? codexCategoryHeading(name) : 'All',
    count: countFor(name),
  }));
  const summary =
    page.status !== 'ready'
      ? undefined
      : entries.length >= (page.total ?? entries.length)
        ? pluralize(entries.length, 'entry', 'entries')
        : `Showing ${entries.length} of ${page.total} entries`;

  return (
    <PageShell context="tavern" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="codex">
        <div className="stack" data-gap="5">
          <PageHeader
            title="Codex"
            lede="The campaign wiki: people, places, factions and lore, and how they connect."
            actions={
              <>
                <Link className="btn btn--secondary" to="/regions">
                  Regions
                </Link>
                <Link className="btn btn--secondary" to="/map">
                  Map
                </Link>
                {me ? (
                  <Link className="btn btn--primary" to="/codex/new">
                    New Codex entry
                  </Link>
                ) : null}
              </>
            }
          />
          <FilterBar label="Filter the Codex" count={summary}>
            <FilterBar.Search
              label="Search the Codex"
              placeholder="Search the Codex…"
              value={query}
              onValueChange={setQuery}
            />
            {widthClass === 'compact' ? (
              <FilterBar.Picker
                label="Category"
                options={options.map((option) => ({
                  value: option.name,
                  label: option.label,
                  count: option.count,
                }))}
                value={category}
                onValueChange={setCategory}
              />
            ) : (
              <FilterBar.Group label="Category">
                {options.map((option) => (
                  <Chip
                    key={option.name || 'all'}
                    selected={category === option.name}
                    onClick={() => setCategory(option.name)}
                  >
                    {option.label}
                    {option.count !== null ? (
                      <span className={`type-caption ${styles.count}`}>
                        {option.count}
                      </span>
                    ) : null}
                  </Chip>
                ))}
              </FilterBar.Group>
            )}
          </FilterBar>
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
                        className={styles.directoryCard}
                        pad={4}
                      >
                        <span className="type-title">{entry.title}</span>
                        {entry.excerpt ? (
                          <span className={`type-caption ${styles.clamp}`}>
                            {entry.excerpt}
                          </span>
                        ) : null}
                      </Card>
                    ))}
                  </CardGrid>
                </section>
              ))
            )}
            {page.status === 'ready' && page.hasMore ? (
              <div>
                <button
                  className="btn"
                  type="button"
                  disabled={page.isFetching}
                  onClick={page.loadMore}
                >
                  {page.isFetching
                    ? 'Loading…'
                    : `Show ${Math.min(50, Math.max(0, (page.total ?? 0) - entries.length))} more (${Math.max(0, (page.total ?? 0) - entries.length)} left)`}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
