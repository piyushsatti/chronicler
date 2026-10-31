import { useUrlParam } from '../../../hooks/useUrlParam.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Card } from '../../../components/primitives/Card.js';
import { Button } from '../../../components/primitives/Button.js';
import { CardGrid } from '../../../components/primitives/CardGrid.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageToolbar } from '../../../components/primitives/PageToolbar.js';
import { useRulesPage } from '../hooks/useRulesPage.js';
import styles from './rules.module.css';
import { humanizeKey, pluralize } from '../../../utils/format.js';
import { documentHref } from '../../../utils/documentHref.js';

const PAGE_SIZE = 12;
const GENERAL_GROUP = 'General';

/** Heading for a guide's category: the stored value made readable; no
 * category (or the generic "guide") files under "General". */
export function guideGroupName(category: string | null): string {
  const raw = category?.trim() ?? '';
  if (!raw || raw.toLowerCase() === 'guide' || raw.toLowerCase() === 'guides') {
    return GENERAL_GROUP;
  }
  return humanizeKey(raw);
}

/** Guides under category headings, like the Codex board (owner item 15).
 * Named groups come alphabetically; "General" comes last. */
export function groupGuides<T extends { category: string | null }>(
  guides: T[],
): { name: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const guide of guides) {
    const name = guideGroupName(guide.category);
    groups.set(name, [...(groups.get(name) ?? []), guide]);
  }
  return [...groups]
    .map(([name, entries]) => ({ name, entries }))
    .sort((a, b) =>
      a.name === GENERAL_GROUP
        ? 1
        : b.name === GENERAL_GROUP
          ? -1
          : a.name.localeCompare(b.name),
    );
}

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
  // Grouped order first, so each page holds whole runs of a category.
  const guides = groupGuides(hub.guides.filter(matches)).flatMap(
    (group) => group.entries,
  );
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
          <PageToolbar
            label="Filter rules"
            count={
              page.status !== 'ready'
                ? undefined
                : needle
                  ? `${pluralize(guides.length + rulings.length, 'result')} for "${query}"`
                  : `${pluralize(hub.guides.length, 'guide')}, ${pluralize(hub.rulings.length, 'ruling')}`
            }
            segments={(
              <PageToolbar.Segments
                aria-label="Show rules"
                value={show}
                onValueChange={setShow}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'guides', label: 'Guides' },
                  { value: 'rulings', label: 'Rulings' },
                ]}
              />
              )}
            actions={
              <PageToolbar.Search
                label="Search rules"
                placeholder="Search a guide, ruling, or item rule…"
                value={query}
                onValueChange={changeQuery}
              />
            }
          />

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
            <div className="stack" data-gap="4">
              {show !== 'rulings' ? (
                <section className="stack" data-gap="4" aria-label="Guides">
                  <div className="row" data-align="baseline" data-gap="3">
                    <h2 className="type-heading">Guides</h2>
                    <span className="type-caption">
                      {pluralize(guides.length, 'guide')}
                    </span>
                  </div>
                  {groupGuides(
                    guides.slice(
                      (currentGuidePage - 1) * PAGE_SIZE,
                      currentGuidePage * PAGE_SIZE,
                    ),
                  ).map((group) => (
                    <section
                      key={group.name}
                      className="stack"
                      data-gap="2"
                      aria-label={group.name}
                    >
                      <div className="row" data-gap="2">
                        <h3 className="type-heading">{group.name}</h3>
                        <div className={styles.divider} />
                      </div>
                      <CardGrid gap={3}>
                        {group.entries.map((entry) => (
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
                    </section>
                  ))}
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
                        ) : (
                          <Link className="btn btn--secondary btn--sm" to="/rules?show=guides">
                            Browse guides
                          </Link>
                        )
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
            </div>
          )}
        </div>
      </SingleRegionPage>
    </PageShell>
  );
}
