import { useState } from 'react';
import { useSizeClasses } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Button } from '../../../components/primitives/Button.js';
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
  const { widthClass } = useSizeClasses();
  const [query, setQuery] = useState('');
  const [guidePage, setGuidePage] = useState(1);
  const [rulingPage, setRulingPage] = useState(1);
  const needle = query.trim().toLocaleLowerCase();
  const hub = page.status === 'ready' ? page.view : { guides: [], rulings: [] };
  const matches = (entry: { title: string; excerpt: string | null }) =>
    !needle ||
    `${entry.title} ${entry.excerpt ?? ''}`.toLocaleLowerCase().includes(needle);
  const guides = hub.guides.filter(matches);
  const rulings = hub.rulings.filter(matches);
  const popular = [...hub.guides, ...hub.rulings].slice(0, 5);
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
        <div className={styles.header} data-compact={widthClass !== 'expanded'}>
          <div className="stack" data-gap="2">
            <div className="type-label">Reference</div>
            <h1 className="type-display">Server Mechanics</h1>
            <p className="type-narrative">
              Guides to every system, plus the living log of rulings.
            </p>
            {(page.status === 'ready' || page.status === 'empty') && page.canCreate ? (
              <div className="row" data-gap="2" data-wrap="1">
                <Link className="btn btn--primary btn--sm" to="/rules/guides/new">
                  New guide
                </Link>
                <Link className="btn btn--secondary btn--sm" to="/rules/rulings/new">
                  New ruling
                </Link>
              </div>
            ) : null}
          </div>
          <div className="stack" data-gap="2">
            <label className={styles.search}>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search rules"
                placeholder="Search a guide, ruling, or item rule…"
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
              />
            </label>
            <div className="row" data-gap="2" data-wrap="1">
              {page.status !== 'ready' ? null : needle ? (
                <span className="type-caption">
                  {pluralize(guides.length + rulings.length, 'result')} for &quot;
                  {query}&quot;
                </span>
              ) : (
                <>
                  <span className="type-caption">Browse:</span>
                  {popular.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={styles.chip}
                      onClick={() => changeQuery(entry.title)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {page.status === 'error' ? (
          <div className="stack" data-gap="3">
            <StatePanel status="error" error={page.error} />
            <Button type="button" variant="ghost" onClick={page.refetch}>
              Try again
            </Button>
          </div>
        ) : page.status === 'loading' ? (
          <StatePanel status="loading" />
        ) : page.status === 'empty' ? (
          <StatePanel status="empty" emptyMessage="No rules published yet." />
        ) : (
          <div className={styles.browse} data-sidebar={widthClass === 'expanded'}>
            <section className="stack" data-gap="5" aria-label="Gameplay guides">
              <div className="row" data-align="baseline" data-gap="3">
                <h2 className="type-heading">Gameplay Guides</h2>
                <span className="type-caption">
                  {pluralize(guides.length, 'guide')}
                </span>
              </div>
              <div className={styles.guideGrid}>
                {guides
                  .slice(
                    (currentGuidePage - 1) * PAGE_SIZE,
                    currentGuidePage * PAGE_SIZE,
                  )
                  .map((entry) => (
                    <Link
                      key={entry.id}
                      to={documentHref({ kind: 'rule', ...entry }) ?? '/rules'}
                      className={`${styles.guide} stack`}
                      data-gap="2"
                    >
                      <span className={styles.guideIcon} aria-hidden="true">
                        ▤
                      </span>
                      <span className="type-title">{entry.title}</span>
                      {entry.excerpt ? (
                        <span className={`type-caption ${styles.excerpt}`}>
                          {entry.excerpt}
                        </span>
                      ) : null}
                    </Link>
                  ))}
              </div>
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
            <Card className={`${styles.rail} stack`} pad={4} data-gap="3">
              <div className="row" data-justify="between" data-gap="3">
                <h2 className="type-heading">Rules clarification</h2>
                {rulings.length ? (
                  <span className="type-caption">
                    {pluralize(rulings.length, 'ruling')}
                  </span>
                ) : null}
              </div>
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
              {rulings.length === 0 ? (
                <p className="type-caption">
                  {needle
                    ? 'No rulings match.'
                    : 'No rulings yet. When staff settle how a rule applies at the table, the ruling is logged here.'}
                </p>
              ) : null}
              <RulesPagination
                family="rulings"
                page={currentRulingPage}
                total={rulings.length}
                onPageChange={setRulingPage}
              />
            </Card>
          </div>
        )}
      </SingleRegionPage>
    </PageShell>
  );
}
