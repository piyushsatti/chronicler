import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Field } from '../../../components/foundation/Field.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Modal } from '../../../components/primitives/Modal.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useSearchPalette } from '../hooks/useSearchPalette.js';
import { SearchHitRow } from './SearchHitRow.js';
import '../search.css';

type SearchDialogContextValue = {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
};
const SearchDialogContext = createContext<SearchDialogContextValue | null>(null);
export function useSearchDialog(): SearchDialogContextValue {
  const context = useContext(SearchDialogContext);
  if (!context)
    throw new Error('useSearchDialog must be used within SearchCommandRoot');
  return context;
}

function SearchDialogPanel({
  onNavigate,
}: {
  onNavigate: () => void;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    queueMicrotask(() => panelRef.current?.querySelector('input')?.focus());
  }, []);
  const { query, setQuery, queryError, searchQ, retrySearch } = useSearchPalette();
  const hits = searchQ.data ? [...searchQ.data.documents, ...searchQ.data.members] : [];
  return (
    <div
      ref={panelRef}
      className="stack"
      data-gap="4"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const links = [
          ...(panelRef.current?.querySelectorAll<HTMLAnchorElement>(
            '.search-results a',
          ) ?? []),
        ];
        if (links.length === 0) return;
        event.preventDefault();
        const current = links.findIndex((link) => link === document.activeElement);
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % links.length
            : (current <= 0 ? links.length : current) - 1;
        links[next]?.focus();
      }}
    >
      <Field
        label="Search the chronicle"
        placeholder="Search the archive…"
        value={query}
        error={queryError ?? undefined}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!query.trim() ? (
        <p className="type-caption">Type to search entries and members.</p>
      ) : queryError ? null : searchQ.isError ? (
        <>
          <StatePanel
            status="error"
            error={toAppError(searchQ.error, 'search:palette')}
          />
          <button className="btn" type="button" onClick={retrySearch}>
            Retry search
          </button>
        </>
      ) : searchQ.isPending ? (
        <StatePanel status="loading" />
      ) : hits.length === 0 ? (
        <StatePanel status="empty" emptyMessage="No matches." />
      ) : (
        <>
          <p className="type-caption">
            {searchQ.data?.documentTotal} documents · {searchQ.data?.memberTotal}{' '}
            members
          </p>
          <ul className="search-results stack" data-gap="2">
            {hits.map((hit) => (
              <SearchHitRow
                key={'handle' in hit ? `member-${hit.memberId}` : hit.id}
                hit={hit}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </>
      )}
      <Link
        className="btn"
        to={`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`}
        onClick={onNavigate}
      >
        Open full search
      </Link>
    </div>
  );
}

export function SearchCommandRoot({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { key: locationKey } = useLocation();
  // Navigating closes the dialog: reset during render instead of a sync effect.
  const [openLocationKey, setOpenLocationKey] = useState(locationKey);
  if (openLocationKey !== locationKey) {
    setOpenLocationKey(locationKey);
    setOpen(false);
  }
  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <SearchDialogContext.Provider value={{ open, openSearch, closeSearch }}>
      {children}
      <Modal
        open={open}
        title="Search the chronicle"
        onClose={closeSearch}
        size="palette"
      >
        {open ? <SearchDialogPanel onNavigate={closeSearch} /> : null}
      </Modal>
    </SearchDialogContext.Provider>
  );
}
