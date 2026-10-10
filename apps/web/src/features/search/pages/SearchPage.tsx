import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { Field } from '../../../components/foundation/Field.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadSearch, loadSearchKinds } from '../adapters/searchAdapter.js';

const DECLARATION: PageDeclaration = {
  page: 'search',
  regions: [{ role: 'body', priority: 1 }],
};

export function SearchPage(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const kindsQ = useQuery({
    queryKey: queryKeys.searchKinds,
    queryFn: loadSearchKinds,
  });
  const kindsKey = kind || 'all';
  const searchQ = useQuery({
    queryKey: queryKeys.search(query, kindsKey),
    queryFn: () => loadSearch(query, kind ? [kind] : undefined),
    enabled: query.trim().length > 0,
  });
  const kinds = useMemo(() => kindsQ.data ?? [], [kindsQ.data]);

  const regions: PageRegionRenderers = {
    body: () => (
      <div className="stack">
        <Field
          label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="field">
          <span className="type-caption">Kind</span>
          <select
            aria-label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {!query.trim() ? (
          <p className="type-caption">Type to search.</p>
        ) : searchQ.isError ? (
          <StatePanel
            status="error"
            error={toAppError(searchQ.error, 'search:page')}
          />
        ) : searchQ.isLoading || !searchQ.data ? (
          <StatePanel status="loading" />
        ) : searchQ.data.length === 0 ? (
          <StatePanel status="empty" emptyMessage="No matches." />
        ) : (
          <ul className="stack">
            {searchQ.data.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`} className="card">
                {hit.kind === 'member' ? (
                  <p className="type-title">{hit.title}</p>
                ) : (
                  <Link
                    className="type-title"
                    to={
                      hit.slug
                        ? `/documents/${hit.slug}`
                        : `/search?q=${encodeURIComponent(hit.title)}`
                    }
                  >
                    {hit.title}
                  </Link>
                )}
                <p className="type-caption">{hit.kind}</p>
                {hit.snippet ? (
                  <p className="type-caption">{hit.snippet}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    ),
  };

  return (
    <PageShell title="Search">
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
