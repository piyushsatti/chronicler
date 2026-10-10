import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { queryKeys } from '../../../api/queryKeys.js';
import { Field } from '../../../components/foundation/Field.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadSearch } from '../adapters/searchAdapter.js';
import '../search.css';

type SearchDialogContextValue = {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
};

const SearchDialogContext = createContext<SearchDialogContextValue | null>(null);

export function useSearchDialog(): SearchDialogContextValue {
  const ctx = useContext(SearchDialogContext);
  if (!ctx) {
    throw new Error('useSearchDialog must be used within SearchCommandRoot');
  }
  return ctx;
}

function hitHref(kind: string, slug: string | null, title: string): string {
  if (kind === 'member' && slug) return `/community`;
  if (slug) return `/documents/${slug}`;
  return `/search?q=${encodeURIComponent(title)}`;
}

function SearchDialogPanel({
  onNavigate,
}: {
  onNavigate: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const searchQ = useQuery({
    queryKey: queryKeys.search(query, 'palette'),
    queryFn: () => loadSearch(query),
    enabled: query.trim().length > 0,
  });

  return (
    <div className="search-dialog stack">
      <Field
        label="Search the chronicle"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query.trim() ? (
        <p className="type-caption">Type to search entries and members.</p>
      ) : searchQ.isError ? (
        <StatePanel
          status="error"
          error={toAppError(searchQ.error, 'search:palette')}
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
                  to={hitHref(hit.kind, hit.slug, hit.title)}
                  onClick={onNavigate}
                >
                  {hit.title}
                </Link>
              )}
              <p className="type-caption">{hit.kind}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchCommandRoot({ children }: { children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [location.key]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <SearchDialogContext.Provider value={{ open, openSearch, closeSearch }}>
      {children}
      {open ? (
        <div
          className="search-dialog-backdrop"
          role="presentation"
          onClick={closeSearch}
          onKeyDown={() => undefined}
        >
          <div
            className="search-dialog card"
            role="dialog"
            aria-modal="true"
            aria-label="Search the chronicle"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={() => undefined}
          >
            <div className="row">
              <p className="type-title">Search the chronicle</p>
              <button type="button" className="btn ghost" onClick={closeSearch}>
                Close
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  closeSearch();
                  navigate('/search');
                }}
              >
                Open full search
              </button>
            </div>
            <SearchDialogPanel onNavigate={closeSearch} />
          </div>
        </div>
      ) : null}
    </SearchDialogContext.Provider>
  );
}
