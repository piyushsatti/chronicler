import { useId, useState } from 'react';
import { Button } from '../../../components/primitives/Button.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import styles from './chronicleFilterBar.module.css';

type ChronicleFilterBarProps = {
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
  authorLabels: ReadonlyMap<string, string>;
  /** "12 of 40 entries" style count shown at the bar's right edge. */
  count: string;
  /** Narrow layouts fold the chip groups behind a toggle next to the search. */
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
    <FilterBar.Group label={label}>
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
    </FilterBar.Group>
  );
}

/** Chronicles filters: search plus arc / region / author chips in one bar above the timeline. */
export function ChronicleFilterBar({
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
  authorLabels,
  count,
  collapsible = false,
}: ChronicleFilterBarProps): React.JSX.Element {
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
    <FilterBar label="Filter chronicles" count={count}>
      <FilterBar.Search
        label="Search entries"
        placeholder="Search entries…"
        value={searchQuery}
        onValueChange={onSearchQueryChange}
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
      {hasGroups ? (
        <div id={panelId} className={styles.groups} hidden={!showGroups}>
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
            formatOption={(handle) => authorLabels.get(handle) ?? handle}
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
    </FilterBar>
  );
}
