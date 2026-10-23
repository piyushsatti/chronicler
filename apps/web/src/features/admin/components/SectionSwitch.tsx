import type { ReactNode } from 'react';
import { Chip } from '../../../components/primitives/Chip.js';
import { FilterBar } from '../../../components/primitives/FilterBar.js';
import { useUrlParam } from '../../../hooks/useUrlParam.js';

export type SectionSwitchItem = { id: string; label: string; panel: ReactNode };

/** Sub-sections of one admin page: a chip segment under the single tab row, kept in `?section=`. */
export function SectionSwitch({
  label,
  items,
}: {
  label: string;
  items: SectionSwitchItem[];
}): React.JSX.Element {
  const [requested, setSection] = useUrlParam('section');
  const current = items.find((item) => item.id === requested) ?? items[0];
  return (
    <div className="stack">
      <FilterBar label={label}>
        <FilterBar.Group label="Show">
          {items.map((item) => (
            <Chip
              key={item.id}
              selected={item.id === current.id}
              onClick={() => setSection(item.id === items[0].id ? '' : item.id)}
            >
              {item.label}
            </Chip>
          ))}
        </FilterBar.Group>
      </FilterBar>
      <section aria-label={current.label}>{current.panel}</section>
    </div>
  );
}
