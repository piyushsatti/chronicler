import { useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end';
  width?: string;
};

export type TableProps<T = Record<string, unknown>> = {
  columns?: Column<T>[];
  rows?: T[];
  rowKey?: (row: T) => string | number;
  sortKey?: string;
  sortDir?: 'asc' | 'desc' | null;
  onSortChange?: (k: string, d: 'asc' | 'desc') => void;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/** Columnar data table with optional sort. */
export function Table<T extends object = Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir,
  onSortChange,
  defaultSortKey,
  defaultSortDir,
  onRowClick,
  loading = false,
  empty,
  className,
  children,
}: TableProps<T>): React.JSX.Element {
  const [uncontrolledKey, setUncontrolledKey] = useState(defaultSortKey);
  const [uncontrolledDir, setUncontrolledDir] = useState<'asc' | 'desc' | null>(
    defaultSortDir ?? null,
  );
  const activeKey = sortKey ?? uncontrolledKey;
  const activeDir = sortDir ?? uncontrolledDir;

  if (!columns?.length || !rows) {
    return (
      <div className={className} data-component="Table">
        {children}
      </div>
    );
  }

  function handleSort(key: string): void {
    const nextDir: 'asc' | 'desc' =
      activeKey === key && activeDir === 'asc' ? 'desc' : 'asc';
    if (sortKey === undefined) {
      setUncontrolledKey(key);
      setUncontrolledDir(nextDir);
    }
    onSortChange?.(key, nextDir);
  }

  return (
    <div className={className} data-component="Table" data-el="table.root">
      {loading ? <p className="type-caption">Loading…</p> : null}
      {!loading && rows.length === 0 ? empty ?? <p className="type-caption">No rows</p> : null}
      {!loading && rows.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width, textAlign: col.align }}
                >
                  {col.sortable ? (
                    <button type="button" className="btn btn--ghost" onClick={() => handleSort(col.key)}>
                      {col.label}
                      {activeKey === col.key ? (activeDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = rowKey ? rowKey(row) : i;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align }}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
