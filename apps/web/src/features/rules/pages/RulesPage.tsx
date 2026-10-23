import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Button } from '../../../components/primitives/Button.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { useRulesPage } from '../hooks/useRulesPage.js';
import styles from './rules.module.css';
import { pluralize } from '../../../utils/format.js';
import { documentHref } from '../../../utils/documentHref.js';

const PAGE_SIZE = 12;

function RulesPagination({
  family,
  page,
  total,
  onPageChange,
}: {
  family: 'guides' | 'rulings';
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}): React.JSX.Element | null {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <nav
      className="row"
      data-wrap="1"
      aria-label={family === 'guides' ? 'Guide pages' : 'Ruling pages'}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Previous ${family}`}
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="type-caption" aria-live="polite">
        Page {page} of {pages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Next ${family}`}
        disabled={page === pages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export function RulesPage(): React.JSX.Element {
  const page = useRulesPage();
  const [query, setQuery] = useUrlParam('q');
  const [showParam, setShow] = useUrlParam('show', 'all');
  const show: 'all' | 'guides' | 'rulings' =
    showParam === 'guides' || showParam === 'rulings' ? showParam : 'all';
  const [guidePage, setGuidePage] = useState(1);
  const [rulingPage, setRulingPage] = useState(1);
  const needle = query.trim().toLocaleLowerCase();
  const hub = page.status === 'ready' ? page.view : { guides: [], rulings: [] };
  const matches = (entry: { title: string; excerpt: string | null }) =>
    !needle ||
    `${entry.title} ${entry.excerpt ?? ''}`.toLocaleLowerCase().includes(needle);
  const guides = hub.guides.filter(matches);
  const rulings = hub.rulings.filter(matches);
  const currentGuidePage = Math.min(
    guidePage,
    Math.max(1, Math.ceil(guides.length / PAGE_SIZE)),
  );
  const currentRulingPage = Math.min(
    rulingPage,
    Math.max(1, Math.ceil(rulings.length / PAGE_SIZE)),
  );
  const changeQuery = (value: string) => {
    setQuery(value);
    setGuidePage(1);
    setRulingPage(1);
  };

  return (
    <PageShell context="chronicle" className={`hf2 ${styles.root}`}>
      <SingleRegionPage page="rules">
        <div className="stack" data-gap="5">
          <PageHeader
            title="Rules"
            lede="Guides to how the server plays, and the rulings that settle edge cases."
            actions={
              (page.status === 'ready' || page.status === 'empty') && page.canCreate ? (
                <>
                  <Link className="btn btn--primary btn--sm" to="/rules/guides/new">
                    New guide
                  </Link>
                  <Link className="btn btn--secondary btn--sm" to="/rules/rulings/new">
                    New ruling
                  </Link>
                </>
              ) : null
            }
          />
          <FilterBar
            label="Filter rules"
            count={
              page.status !== 'ready'
                ? undefined
                : needle
                  ? `${pluralize(guides.length + rulings.length, 'result')} for "${query}"`
                  : `${pluralize(hub.guides.length, 'guide')}, ${pluralize(hub.rulings.length, 'ruling')}`
            }
          >
            <FilterBar.Search
              label="Search rules"
              placeholder="Search a guide, ruling, or item rule…"
              value={query}
              onValueChange={changeQuery}
            />
            {page.status === 'ready' ? (
              <FilterBar.Group label="Show">
                {(
                  [
                    ['all', 'All'],
                    ['guides', 'Guides'],
                    ['rulings', 'Rulings'],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    selected={show === value}
                    onClick={() => setShow(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </FilterBar.Group>
            ) : null}
          </FilterBar>

          {page.status === 'error' ? (
            <StatePanel
              status="error"
              error={page.error}
              onRetry={page.refetch}
              retryLabel="Try again"
            />
          ) : page.status === 'loading' ? (
            <StatePanel status="loading" />
          ) : page.status === 'empty' ? (
            <StatePanel status="empty" emptyMessage="No rules published yet." />
          ) : (
            <>
              {show !== 'rulings' ? (
                <section className="stack" data-gap="4" aria-label="Guides">
                  <div className="row" data-align="baseline" data-gap="3">
                    <h2 className="type-heading">Guides</h2>
                    <span className="type-caption">
                      {pluralize(guides.length, 'guide')}
                    </span>
                  </div>
                  <CardGrid gap={3}>
                    {guides
                      .slice(
                        (currentGuidePage - 1) * PAGE_SIZE,
                        currentGuidePage * PAGE_SIZE,
                      )
                      .map((entry) => (
                        <Card
                          key={entry.id}
                          variant="clickable"
                          to={documentHref({ kind: 'rule', ...entry }) ?? '/rules'}
                          className={`${styles.guide} stack`}
                          data-gap="2"
                          pad={4}
                        >
                          <span className="type-title">{entry.title}</span>
                          {entry.excerpt ? (
                            <span className={`type-caption ${styles.excerpt}`}>
                              {entry.excerpt}
                            </span>
                          ) : null}
                        </Card>
                      ))}
                  </CardGrid>
                  {guides.length === 0 ? (
                    <p className="type-caption">No guides match.</p>
                  ) : null}
                  <RulesPagination
                    family="guides"
                    page={currentGuidePage}
                    total={guides.length}
                    onPageChange={setGuidePage}
                  />
                </section>
              ) : null}
              {show !== 'guides' ? (
                <section className="stack" data-gap="3" aria-label="Rulings">
                  <div className="row" data-align="baseline" data-gap="3">
                    <h2 className="type-heading">Rulings</h2>
                    {rulings.length ? (
                      <span className="type-caption">
                        {pluralize(rulings.length, 'ruling')}
                      </span>
                    ) : null}
                  </div>
                  {rulings.length ? (
                    <Card className="stack" pad={4} data-gap="1">
                      {rulings
                        .slice(
                          (currentRulingPage - 1) * PAGE_SIZE,
                          currentRulingPage * PAGE_SIZE,
                        )
                        .map((entry) => (
                          <Link
                            key={entry.id}
                            to={documentHref({ kind: 'rule', ...entry }) ?? '/rules'}
                            className={`${styles.ruling} stack`}
                            data-gap="1"
                          >
                            <span className="type-title">{entry.title}</span>
                            {entry.excerpt ? (
                              <span className={`type-caption ${styles.excerpt}`}>
                                {entry.excerpt}
                              </span>
                            ) : null}
                          </Link>
                        ))}
                    </Card>
                  ) : (
                    <EmptyState
                      message={
                        needle
                          ? 'No rulings match.'
                          : 'No rulings yet. When staff settle how a rule applies at the table, it is logged here.'
                      }
                      action={
                        page.canCreate && !needle ? (
                          <Link className="btn btn--sm" to="/rules/rulings/new">
                            Add ruling
                          </Link>
                        ) : undefined
                      }
                    />
                  )}
                  <RulesPagination
                    family="rulings"
                    page={currentRulingPage}
                    total={rulings.length}
                    onPageChange={setRulingPage}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
