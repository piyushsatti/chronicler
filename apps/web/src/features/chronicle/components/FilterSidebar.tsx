import type { CSSProperties } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';

type FilterSidebarProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  activeRegion: string;
  onRegionChange: (region: string) => void;
  activeArc: string;
  onArcChange: (arc: string) => void;
  activeAuthor: string;
  onAuthorChange: (author: string) => void;
  regionOptions: string[];
  arcOptions: string[];
  authorOptions: string[];
};

export function FilterSidebar({
  searchQuery,
  onSearchQueryChange,
  activeRegion,
  onRegionChange,
  activeArc,
  onArcChange,
  activeAuthor,
  onAuthorChange,
  regionOptions,
  arcOptions,
  authorOptions,
}: FilterSidebarProps): React.JSX.Element {
  const hasFilters =
    activeRegion !== 'All' || activeArc !== 'All' || activeAuthor !== 'All';

  const filterBtnStyle = (isActive: boolean): CSSProperties => ({
    textAlign: 'left',
    padding: `var(--sp-1) var(--sp-2)`,
    borderRadius: 4,
    cursor: 'pointer',
    background: isActive ? 'var(--color-bg-surface)' : 'transparent',
    color: isActive ? 'var(--color-text)' : 'var(--color-text-3)',
    border: 'none',
    width: '100%',
  });

  const divider = (
    <div style={{ borderTop: '1px solid var(--color-border-2)', margin: `var(--sp-1) 0` }} />
  );

  return (
    <div style={{ position: 'sticky', top: 80 }}>
      <Card className="stack" data-gap="4" pad={4}>
        <input
          type="text"
          className="type-code"
          style={{
            width: '100%',
            padding: `6px var(--sp-3)`,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-surface)',
            color: 'var(--color-text-3)',
            borderRadius: 4,
            boxSizing: 'border-box',
          }}
          placeholder="Search entries…"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          aria-label="Search entries"
        />

        {divider}

        <div>
          <span className="type-label">ARC</span>
          <div className="stack" style={{ gap: 2 }}>
            {arcOptions.map((arc) => (
              <Button
                className="type-ui"
                size="sm"
                key={arc}
                onClick={() => onArcChange(arc)}
                aria-pressed={activeArc === arc}
                style={filterBtnStyle(activeArc === arc)}
              >
                {arc === 'All' ? 'ALL' : arc}
              </Button>
            ))}
          </div>
        </div>

        {divider}

        <div>
          <span className="type-label">REGION</span>
          <div className="stack" style={{ gap: 2 }}>
            {regionOptions.map((region) => (
              <Button
                className="type-ui"
                size="sm"
                key={region}
                onClick={() => onRegionChange(region)}
                aria-pressed={activeRegion === region}
                style={filterBtnStyle(activeRegion === region)}
              >
                {region === 'All' ? 'ALL' : region}
              </Button>
            ))}
          </div>
        </div>

        {divider}

        <div>
          <span className="type-label">AUTHOR</span>
          <div className="stack" style={{ gap: 2 }}>
            {authorOptions.map((author) => (
              <Button
                className="type-ui"
                size="sm"
                key={author}
                onClick={() => onAuthorChange(author)}
                aria-pressed={activeAuthor === author}
                style={filterBtnStyle(activeAuthor === author)}
              >
                {author === 'All' ? 'ALL' : author}
              </Button>
            ))}
          </div>
        </div>

        {hasFilters ? (
          <>
            {divider}
            <Button
              variant="ghost"
              size="sm"
              style={{ width: '100%' }}
              onClick={() => {
                onRegionChange('All');
                onArcChange('All');
                onAuthorChange('All');
              }}
            >
              Reset filters
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
