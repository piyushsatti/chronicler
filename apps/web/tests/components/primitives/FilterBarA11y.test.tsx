import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { FilterBar } from '../../../src/components/primitives/FilterBar.js';
import { useUrlParam } from '../../../src/hooks/useUrlParam.js';

describe('FilterBar a11y', () => {
  it('a disabled picker trigger is disabled, not just styled', () => {
    render(
      <FilterBar label="Filter">
        <FilterBar.Picker
          label="Region"
          value=""
          disabled
          onValueChange={() => undefined}
          options={[{ value: '', label: 'All regions' }]}
        />
      </FilterBar>,
    );
    expect(screen.getByRole('button', { name: /Region/ })).toBeDisabled();
  });

  it('forwards the search input ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <FilterBar label="Filter">
        <FilterBar.Search label="Search" inputRef={ref} />
      </FilterBar>,
    );
    expect(ref.current).toBe(screen.getByRole('searchbox', { name: 'Search' }));
  });
});

function Probe(): React.JSX.Element {
  const [q, setQ] = useUrlParam('q');
  const [show, setShow] = useUrlParam('show', 'all');
  const location = useLocation();
  return (
    <div>
      <p data-testid="state">{`${q}|${show}`}</p>
      <p data-testid="search">{location.search}</p>
      <button onClick={() => setQ('orc')}>q</button>
      <button onClick={() => setShow('guides')}>show</button>
      <button onClick={() => setShow('all')}>reset</button>
    </div>
  );
}

describe('useUrlParam', () => {
  it('reads from and writes to the URL, omitting defaults and keeping other params', async () => {
    render(
      <MemoryRouter initialEntries={['/x?tab=notes&q=elf']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('elf|all');
    await userEvent.click(screen.getByText('q'));
    await userEvent.click(screen.getByText('show'));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=notes&q=orc&show=guides');
    await userEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=notes&q=orc');
  });
});
