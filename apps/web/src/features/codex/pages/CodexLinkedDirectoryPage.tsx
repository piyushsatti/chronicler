import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { useMe } from '../../../hooks/useMe.js';
import { pluralize } from '../../../utils/format.js';
import { useCodexPage } from '../hooks/useCodexPage.js';
import styles from './codex.module.css';

const DIRECTORIES = [
  { to: '/npcs', label: 'NPCs' },
  { to: '/factions', label: 'Factions' },
  { to: '/regions', label: 'Regions' },
] as const;

export function CodexLinkedDirectoryPage({
  title,
  categoryPrefix,
  noun,
  singular,
  lede,
}: {
  title: string;
  categoryPrefix: string;
  /** Lower-case plural for copy, e.g. "factions". */
  noun: string;
  /** Singular for the create action, e.g. "faction" (NPC keeps its capitals). */
  singular: string;
  /** One sentence under the title. */
  lede: string;
}): React.JSX.Element {
  const [query, setQuery] = useUrlParam('q');
  const page = useCodexPage(categoryPrefix, query);
  const { data: me } = useMe();
  const remaining =
    page.status === 'ready' ? Math.max(0, (page.total ?? 0) - page.view.length) : 0;
  const newHref = `/codex/${encodeURIComponent(categoryPrefix)}/new`;

  let body: React.JSX.Element;
  if (page.status === 'error') {
    body = <StatePanel status="error" error={page.error} />;
  } else if (page.status === 'loading') {
    body = (
      <CardGrid aria-busy="true" gap={3}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} height="5.5rem" aria-label={`Loading ${title}`} />
        ))}
      </CardGrid>
    );
  } else if (page.status === 'empty') {
    body = (
      <EmptyState
        className={styles.directoryEmpty}
        message={
          query.trim()
            ? `No ${noun} match “${query.trim()}”.`
            : `No ${noun} yet. Published ${singular} entries will show up here.`
        }
        action={
          <div className="row" data-wrap="1" data-gap="2">
            {me && !query.trim() ? (
              <Link className="btn btn--primary" to={newHref}>
                New {singular}
              </Link>
            ) : null}
            <Link className="btn btn--secondary" to="/codex">
              Browse the Codex
            </Link>
          </div>
        }
      />
    );
  } else {
    body = (
      <CardGrid gap={3}>
        {page.view.map((entry) => (
          <Card
            key={entry.slug}
            variant="clickable"
            to={`/codex/${entry.slug}`}
            className={styles.directoryCard}
            pad={4}
          >
            <h2 className="type-title">{entry.title}</h2>
            {entry.excerpt ? (
              <p className={`type-caption ${styles.clamp}`}>{entry.excerpt}</p>
            ) : null}
          </Card>
        ))}
      </CardGrid>
    );
  }

  return (
    <PageShell>
      <SingleRegionPage page="codex-directory">
        <div className={styles.entryPage}>
          <PageHeader
            back={{ to: '/codex', label: 'Codex' }}
            title={title}
            lede={lede}
            actions={
              me && page.status === 'ready' ? (
                <Link className="btn btn--primary" to={newHref}>
                  New {singular}
                </Link>
              ) : null
            }
          />
          <FilterBar
            label={`Filter ${title}`}
            count={
              page.status === 'ready'
                ? page.view.length >= (page.total ?? page.view.length)
                  ? pluralize(page.view.length, 'entry', 'entries')
                  : `Showing ${page.view.length} of ${page.total} entries`
                : page.status === 'empty' ? '0 entries' : undefined
            }
          >
            <FilterBar.Search
              label={`Search ${title}`}
              placeholder={`Search ${title}…`}
              value={query}
              onValueChange={setQuery}
            />
            <FilterBar.Group>
              {DIRECTORIES.map((directory) => (
                <Link
                  key={directory.to}
                  to={directory.to}
                  className={`chip ${styles.directoryLink}`}
                  data-component="Chip"
                  data-tone="neutral"
                  data-size="md"
                  data-selected={directory.label === title ? '1' : undefined}
                  aria-current={directory.label === title ? 'page' : undefined}
                >
                  {directory.label}
                </Link>
              ))}
            </FilterBar.Group>
          </FilterBar>
          {body}
          {page.status === 'ready' && page.hasMore ? (
            <div>
              <button
                className="btn btn--secondary"
                type="button"
                disabled={page.isFetching}
                onClick={page.loadMore}
              >
                {page.isFetching
                  ? 'Loading…'
                  : `Show ${Math.min(50, remaining)} more (${remaining} left)`}
              </button>
            </div>
          ) : null}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
