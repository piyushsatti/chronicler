import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from './FilterBar.js';
import { SegmentedControl, type SegmentedControlProps } from './SegmentedControl.js';

export type PageToolbarProps = {
  label: string;
  segments?: ReactNode;
  quickFilters?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function PageToolbarRoot({
  label,
  segments,
  quickFilters,
  count,
  actions,
  className,
}: PageToolbarProps): React.JSX.Element {
  return (
    <section className={['page-toolbar', className].filter(Boolean).join(' ')} aria-label={label} data-component="PageToolbar">
      {segments ? <div className="page-toolbar__segments">{segments}</div> : null}
      {quickFilters ? <div className="page-toolbar__quick-filters">{quickFilters}</div> : null}
      <div className="page-toolbar__actions">
        {count !== undefined && count !== null ? <span className="page-toolbar__count" aria-live="polite">{count}</span> : null}
        {actions}
      </div>
    </section>
  );
}

function PageToolbarSegments<V extends string>(props: SegmentedControlProps<V>): React.JSX.Element {
  return <SegmentedControl {...props} />;
}

export type PageToolbarSearchProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
};

function SearchGlyph(): React.JSX.Element {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.2 4.2" /></svg>;
}

function PageToolbarSearch({ label, value, onValueChange, placeholder }: PageToolbarSearchProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const expanded = open || value.length > 0;
  const closeLabel = `${value ? 'Clear and close' : 'Close'} ${label.toLowerCase()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  if (!expanded) {
    return (
      <button
        className="page-toolbar__icon"
        type="button"
        aria-label={label}
        aria-expanded="false"
        title={label}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SearchGlyph />
      </button>
    );
  }
  return (
    <div className="page-toolbar__search" data-expanded="true">
      <FilterBar.Search
        label={label}
        value={value}
        onValueChange={(next) => {
          setOpen(true);
          onValueChange(next);
        }}
        placeholder={placeholder ?? label}
        inputRef={inputRef}
      />
      <button
        className="page-toolbar__icon"
        type="button"
        aria-label={closeLabel}
        aria-expanded="true"
        title={closeLabel}
        onClick={() => {
          onValueChange('');
          setOpen(false);
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export type PageToolbarIconActionProps = {
  label: string;
  title?: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
};

function PageToolbarIconAction({
  label,
  title = label,
  href,
  onClick,
  children,
  disabled = false,
}: PageToolbarIconActionProps): React.JSX.Element {
  const className = 'page-toolbar__icon';
  if (href) {
    return <Link className={className} to={href} aria-label={label} title={title}>{children}</Link>;
  }
  return <button className={className} type="button" aria-label={label} title={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

type PageToolbarCompound = typeof PageToolbarRoot & {
  Segments: typeof PageToolbarSegments;
  IconAction: typeof PageToolbarIconAction;
  Search: typeof PageToolbarSearch;
};

const PageToolbarCompoundImpl = PageToolbarRoot as PageToolbarCompound;
PageToolbarCompoundImpl.Segments = PageToolbarSegments;
PageToolbarCompoundImpl.IconAction = PageToolbarIconAction;
PageToolbarCompoundImpl.Search = PageToolbarSearch;

export const PageToolbar = PageToolbarCompoundImpl;
export { PageToolbarSegments, PageToolbarIconAction, PageToolbarSearch };
