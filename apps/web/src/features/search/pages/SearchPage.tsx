import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Skeleton } from '../../../components/primitives/Skeleton.js';
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
  const total =
    result.data?.[family === 'documents' ? 'documentTotal' : 'memberTotal'] ?? 0;
  return (
    <section
      className="search-family stack"
      data-gap="3"
      aria-label={title}
      aria-busy={result.isFetching}
    >
      <div className="row" data-gap="2">
        <h2 className="type-title">{title}</h2>
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
        <StatePanel
          status="empty"
          emptyMessage={
            total > 0
              ? 'No results on this page. Go back to an earlier page.'
              : `No ${title.toLowerCase()} match your search.`
          }
        />
      ) : (
        <ul className="search-results stack" data-gap="2">
          {hits.map((hit) => (
            <SearchHitRow key={'handle' in hit ? hit.memberId : hit.id} hit={hit} />
          ))}
        </ul>
      )}
      {result.data ? (
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
  const regions: PageRegionRenderers = {
    body: () => (
      <div className="stack" data-gap="5">
        <header className="search-header stack" data-gap="2">
          <div className="type-label">⌘K from anywhere</div>
          <h1 className="type-display">Search</h1>
          <p className="type-caption">Search across the archive.</p>
        </header>
        <div className="search-controls">
          <Field
            label="Search"
            placeholder="Search the archive…"
            value={search.query}
            error={search.queryError ?? undefined}
            onChange={(event) => search.setQuery(event.target.value)}
          />
          <label className="field">
            <span className="type-caption">Kind</span>
            <select
              aria-label="Kind"
              value={selected}
              onChange={(event) =>
                search.setKinds(
                  event.target.value === 'all'
                    ? null
                    : event.target.value === 'none'
                      ? []
                      : [event.target.value],
                )
              }
            >
              <option value="all">All kinds</option>
              <option value="none">No kinds</option>
              {selected !== 'all' &&
              selected !== 'none' &&
              !kinds.some((kind) => kind.key === selected) ? (
                <option value={selected}>{search.kinds?.join(', ')}</option>
              ) : null}
              {kinds.map((kind) => (
                <option key={kind.key} value={kind.key}>
                  {kind.label}
                </option>
              ))}
            </select>
            {search.kindsError ? (
              <p className="type-caption" role="alert">
                {search.kindsError}
              </p>
            ) : null}
          </label>
        </div>
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
          <div className="stack" data-gap="3">
            <p className="type-caption">Enter a search term to search the archive.</p>
            <div className="row" data-gap="2" data-wrap="1">
              {kinds.map((kind) => (
                <span className="chip" key={kind.key}>
                  {kind.label}
                </span>
              ))}
            </div>
          </div>
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
