import { useState } from 'react';
import { useSizeClasses } from '@pi/react-imposition/react';
import { Link, useSearchParams } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { useMe } from '../../../hooks/useMe.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import { CODE_CATEGORIES } from '../types.js';
import {
  codexCategoryHeading,
  findCodexCategory,
} from '../../../utils/codexCategories.js';
import { pluralize } from '../../../utils/format.js';
import styles from './codex.module.css';

export function CodexPage(): React.JSX.Element {
  const [params] = useSearchParams();
  // Entry pages link their category chip here as ?category=<value>.
  const [category, setCategory] = useState(
    () => findCodexCategory(params.get('category')) ?? params.get('category') ?? '',
  );
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const page = useCodexPage(category, query);
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

  return (
    <PageShell context="tavern" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="codex">
        <header className={styles.header} data-compact={widthClass !== 'expanded'}>
          <div className="stack" data-gap="2">
            <div className="type-label">The Codex · Campaign wiki</div>
            <h1 className="type-display">Codex</h1>
            <p className="type-body">
              The reference layer of the world — who’s who, what’s what, and how it all
              connects.
            </p>
          </div>
          <div className="stack" data-gap="3" data-align="end">
            {me ? (
              <Link className="btn primary" to="/codex/new">
                + New Codex entry
              </Link>
            ) : null}
            <label className={styles.search}>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search the Codex"
                placeholder="Search the Codex…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </header>
        <div className={styles.layout} data-sidebar={widthClass === 'expanded'}>
          <nav className={`${styles.categories} stack`} aria-label="Codex categories">
            <div className="type-label">Categories</div>
            {['', ...categories].map((name) => (
              <button
                key={name}
                type="button"
                className={styles.category}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className="type-ui">
                  {name ? codexCategoryHeading(name) : 'All'}
                </span>
              </button>
            ))}
            <div
              className={`${styles.directories} stack`}
              data-gap="2"
              aria-label="Codex directories"
            >
              <div className="type-label">Directories</div>
              <Link className={styles.category} to="/npcs">
                <span className={styles.dot} aria-hidden="true" />
                <span className="type-ui">NPC directory</span>
              </Link>
              <Link className={styles.category} to="/factions">
                <span className={styles.dot} aria-hidden="true" />
                <span className="type-ui">Faction directory</span>
              </Link>
              <Link className={styles.category} to="/regions">
                <span className={styles.dot} aria-hidden="true" />
                <span className="type-ui">Region directory</span>
              </Link>
            </div>
          </nav>
          <div className="stack" data-gap="5">
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
                    <span className={styles.dot} aria-hidden="true" />
                    <h2 className="type-title">{codexCategoryHeading(group.name)}</h2>
                    <div className={styles.divider} />
                  </div>
                  <div className={styles.entries}>
                    {group.entries.map((entry) => (
                      <Link
                        key={entry.id}
                        to={`/codex/${entry.slug}`}
                        className={styles.entry}
                      >
                        <span className={styles.dot} aria-hidden="true" />
                        <span className="stack" data-gap="1">
                          <span className="type-title">{entry.title}</span>
                          {entry.excerpt ? (
                            <span className={`type-caption ${styles.excerpt}`}>
                              {entry.excerpt}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
            {page.status === 'ready' ? (
              <div className="stack" data-gap="3">
                <p className="type-caption">
                  {entries.length >= (page.total ?? entries.length)
                    ? pluralize(entries.length, 'entry', 'entries')
                    : `Showing ${entries.length} of ${page.total} entries`}
                </p>
                {page.hasMore ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={page.isFetching}
                    onClick={page.loadMore}
                  >
                    {page.isFetching ? 'Loading…' : 'Load more entries'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
