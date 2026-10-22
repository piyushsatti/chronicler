import { useId, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import styles from './filterSidebar.module.css';

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
  /** Narrow layouts fold the option groups behind a toggle under the search. */
  collapsible?: boolean;
};

function OptionGroup({
  label,
  options,
  active,
  onChange,
  formatOption = (option) => option,
}: {
  label: string;
  options: string[];
  active: string;
  onChange: (option: string) => void;
  formatOption?: (option: string) => string;
}): React.JSX.Element | null {
  // Only "All": there is nothing to choose between.
  if (options.length <= 1) return null;
  return (
    <div className="stack" data-gap="2" role="group" aria-label={label}>
      <span className="type-label">{label}</span>
      <div className={styles.options}>
        {options.map((option) => (
          <Chip
            key={option}
            size="sm"
            tone="line"
            selected={active === option}
            onClick={() => onChange(option)}
          >
            {option === 'All' ? 'All' : formatOption(option)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

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
  collapsible = false,
}: FilterSidebarProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activeCount = [activeRegion, activeArc, activeAuthor].filter(
    (value) => value !== 'All',
  ).length;
  const hasGroups = [regionOptions, arcOptions, authorOptions].some(
    (options) => options.length > 1,
  );
  const showGroups = !collapsible || open;

  return (
    <div className={styles.sidebar} data-collapsible={collapsible || undefined}>
      <Card className="stack" data-gap="4" pad={4}>
        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search entries…"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            aria-label="Search entries"
          />
          {collapsible && hasGroups ? (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((value) => !value)}
            >
              {activeCount ? `Filters · ${activeCount}` : 'Filters'}
            </Button>
          ) : null}
        </div>

        {hasGroups ? (
          <div
            id={panelId}
            className={`stack ${styles.groups}`}
            data-gap="4"
            hidden={!showGroups}
          >
            <OptionGroup
              label="Arc"
              options={arcOptions}
              active={activeArc}
              onChange={onArcChange}
            />
            <OptionGroup
              label="Region"
              options={regionOptions}
              active={activeRegion}
              onChange={onRegionChange}
            />
            <OptionGroup
              label="Author"
              options={authorOptions}
              active={activeAuthor}
              onChange={onAuthorChange}
              formatOption={(handle) => `@${handle}`}
            />
            {activeCount ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRegionChange('All');
                  onArcChange('All');
                  onAuthorChange('All');
                }}
              >
                Reset filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
