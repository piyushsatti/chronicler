import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
import { personLabels } from '../../../utils/format.js';
import { toAppError } from '../../../errors/toAppError.js';
import { SearchHitRow } from '../components/SearchHitRow.js';
import { SEARCH_PAGE_SIZE, useSearchPage } from '../hooks/useSearchPage.js';
import '../search.css';

const DECLARATION: PageDeclaration = {
  page: 'search',
  regions: [{ role: 'body', priority: 1 }],
};

function SearchFamily({
  family,
  result,
  page,
  onPage,
  onRetry,
}: {
  family: 'documents' | 'members';
  result: ReturnType<typeof useSearchPage>['documentQ'];
  page: number;
  onPage: (page: number) => void;
  onRetry: () => void;
}): React.JSX.Element {
  const title = family === 'documents' ? 'Documents' : 'Members';
  const hits = result.data?.[family] ?? [];
  const memberNames = personLabels(
    hits.map((hit) => ('handle' in hit ? hit : null)),
  );
  const total =
    result.data?.[family === 'documents' ? 'documentTotal' : 'memberTotal'] ?? 0;
  return (
    <section
      className="search-family stack"
      data-gap="3"
      aria-label={title}
      aria-busy={result.isFetching}
    >
      <div className="search-family__heading row" data-gap="2">
        <h2 className="type-heading">{title}</h2>
        {result.data ? <span className="type-caption">{total} results</span> : null}
      </div>
      {result.isError ? (
        <>
          <StatePanel status="error" error={toAppError(result.error, 'search:page')} />
          <button className="btn" type="button" onClick={onRetry}>
            Retry {title.toLowerCase()}
          </button>
        </>
      ) : result.isPending ? (
        <div className="stack" data-gap="2">
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ) : hits.length === 0 ? (
        total > 0 ? (
          <StatePanel
            status="empty"
            emptyMessage="No results on this page. Go back to an earlier page."
          />
        ) : (
          <EmptyState
            kind="search-no-results"
            message={`No ${title.toLowerCase()} match your search.`}
            action={
              <Link
                className="btn btn--secondary btn--sm"
                to={family === 'documents' ? '/codex' : '/community'}
              >
                {family === 'documents' ? 'Browse the Codex' : 'Browse the community'}
              </Link>
            }
          />
        )
      ) : (
        <ul className="search-results stack" data-gap="2">
          {hits.map((hit, index) => (
            <SearchHitRow
              key={'handle' in hit ? hit.memberId : hit.id}
              hit={hit}
              memberLabel={family === 'members' ? memberNames[index] : undefined}
              hideKind={family === 'members'}
            />
          ))}
        </ul>
      )}
      {result.data && total > SEARCH_PAGE_SIZE ? (
        <nav
          className="search-pagination row"
          data-gap="3"
          aria-label={`${title} pages`}
        >
          <button
            className="btn ghost"
            type="button"
            disabled={page === 1 || result.isFetching}
            onClick={() => onPage(page - 1)}
          >
            Previous {title.toLowerCase()}
          </button>
          <span className="type-caption">
            Page {page} · {total} results
          </span>
          <button
            className="btn ghost"
            type="button"
            disabled={page * SEARCH_PAGE_SIZE >= total || result.isFetching}
            onClick={() => onPage(page + 1)}
          >
            Next {title.toLowerCase()}
          </button>
        </nav>
      ) : null}
    </section>
  );
}

export function SearchPage(): React.JSX.Element {
  const search = useSearchPage();
  const selected =
    search.kinds === null
      ? 'all'
      : search.kinds.length === 0
        ? 'none'
        : search.kinds.join(',');
  const kinds = search.kindsQ.data ?? [];
  const kindOptions = [
    { value: 'all', label: 'All kinds' },
    { value: 'none', label: 'No kinds' },
    ...(selected !== 'all' &&
    selected !== 'none' &&
    !kinds.some((kind) => kind.key === selected)
      ? [{ value: selected, label: search.kinds?.join(', ') ?? selected }]
      : []),
    ...kinds.map((kind) => ({ value: kind.key, label: kind.label })),
  ];
  const regions: PageRegionRenderers = {
    body: () => (
      <div className="stack" data-gap="5">
        <PageHeader
          title="Search"
          lede="Find quests, Codex entries, rules and members."
        />
        <FilterBar
          label="Search filters"
          count={
            search.query.trim() && search.documentQ.data
              ? `${search.documentQ.data.documentTotal + (search.memberQ.data?.memberTotal ?? 0)} results`
              : undefined
          }
        >
          <FilterBar.Search
            label="Search"
            placeholder="Search"
            value={search.query}
            onValueChange={search.setQuery}
          />
          <FilterBar.Picker
            label="Kind"
            value={selected}
            options={kindOptions}
            onValueChange={(value) =>
              search.setKinds(value === 'all' ? null : value === 'none' ? [] : [value])
            }
          />
        </FilterBar>
        {search.queryError ? (
          <p className="type-caption" role="alert">
            {search.queryError}
          </p>
        ) : null}
        {search.kindsError ? (
          <p className="type-caption" role="alert">
            {search.kindsError}
          </p>
        ) : null}
        {search.kindsQ.isError ? (
          <div className="stack">
            <StatePanel
              status="error"
              error={toAppError(search.kindsQ.error, 'search:kinds')}
            />
            <button className="btn" type="button" onClick={search.retryKinds}>
              Retry search kinds
            </button>
          </div>
        ) : null}
        {!search.query.trim() ? (
          <EmptyState
            message="Type a name, place or rule to search."
            action={
              <div className="row" data-wrap="1" data-gap="2">
                <Link className="btn btn--secondary btn--sm" to="/codex">
                  Browse the Codex
                </Link>
                <Link className="btn btn--secondary btn--sm" to="/chronicles">
                  Read chronicles
                </Link>
                <Link className="btn btn--secondary btn--sm" to="/quests">
                  Find a quest
                </Link>
              </div>
            }
          >
            <p className="type-caption search-kbd-hint">
              Press Ctrl or ⌘ K to search from any page.
            </p>
          </EmptyState>
        ) : search.queryError || search.kindsError ? null : search.kinds?.length ===
          0 ? (
          <StatePanel
            status="empty"
            emptyMessage="No kinds selected. Choose a kind or search all kinds."
          />
        ) : (
          <div className="stack" data-gap="6">
            {search.kinds === null || search.kinds.some((kind) => kind !== 'member') ? (
              <SearchFamily
                family="documents"
                result={search.documentQ}
                page={search.documentPage}
                onPage={search.setDocumentPage}
                onRetry={search.retryDocuments}
              />
            ) : null}
            {search.kinds === null || search.kinds.includes('member') ? (
              <SearchFamily
                family="members"
                result={search.memberQ}
                page={search.memberPage}
                onPage={search.setMemberPage}
                onRetry={search.retryMembers}
              />
            ) : null}
          </div>
        )}
      </div>
    ),
  };
  return (
    <PageShell context="war-room" className="hf2 search-page">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
