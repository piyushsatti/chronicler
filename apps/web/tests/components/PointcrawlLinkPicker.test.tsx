import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  PointcrawlLinkPicker,
  type PointcrawlLinkValue,
  type PointcrawlRole,
} from '../../src/components/domain/PointcrawlLinkPicker.js';

const nodes = Array.from({ length: 161 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: `LFR${1000 + index}`,
}));
const maps = [{ atlasCode: 'LF-HEX', name: 'Lightfall Hexflower' }];

function Harness({
  initial = [],
  roles = ['expected', 'visited'],
  onChange = () => {},
}: {
  initial?: PointcrawlLinkValue[];
  roles?: PointcrawlRole[];
  onChange?: (links: PointcrawlLinkValue[]) => void;
}) {
  const [links, setLinks] = useState(initial);
  return (
    <PointcrawlLinkPicker
      maps={maps}
      atlasCode="LF-HEX"
      onAtlasChange={() => {}}
      nodes={nodes}
      nodesLoading={false}
      links={links}
      onChange={(next) => {
        setLinks(next);
        onChange(next);
      }}
      roles={roles}
      canMarkVisited
    />
  );
}

describe('PointcrawlLinkPicker', () => {
  it('lists no places until the viewer searches, then only matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('list', { name: 'Matching places' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await user.type(screen.getByLabelText('Find a place'), 'lfr105');
    const matches = screen.getByRole('list', { name: 'Matching places' });
    // LFR1050 to LFR1059 match.
    expect(within(matches).getAllByRole('listitem')).toHaveLength(10);
  });

  it('caps a broad search and says how to narrow it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Find a place'), 'LFR');
    expect(
      within(screen.getByRole('list', { name: 'Matching places' })).getAllByRole('listitem'),
    ).toHaveLength(12);
    expect(screen.getByText(/Showing 12 of 161 matches/)).toBeInTheDocument();
  });

  it('adds a match, lists it as chosen, and removes it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByLabelText('Find a place'), 'LFR1007');
    await user.click(screen.getByRole('checkbox', { name: 'Expected destination' }));
    expect(onChange).toHaveBeenLastCalledWith([
      { pointcrawlNodeId: nodes[7]!.id, role: 'expected' },
    ]);
    const chosen = screen.getByRole('list', { name: 'Chosen places' });
    expect(within(chosen).getByText('LFR1007')).toBeInTheDocument();
    await user.click(
      within(chosen).getByRole('button', { name: 'Remove LFR1007 as expected destination' }),
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('offers only the roles the form allows and counts places on other maps', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        roles={['expected']}
        initial={[
          { pointcrawlNodeId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', role: 'expected' },
        ]}
      />,
    );
    expect(screen.getByText('1 place on other maps')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Find a place'), 'LFR1001');
    expect(screen.getByRole('checkbox', { name: 'Expected destination' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Visited' })).toBeNull();
  });
});
