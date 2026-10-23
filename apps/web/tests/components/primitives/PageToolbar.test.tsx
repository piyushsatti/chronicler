import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PageToolbar } from '../../../src/components/primitives/PageToolbar.js';

function ToolbarFixture({ initialValue = '' }: { initialValue?: string }): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  return (
    <PageToolbar
      label="Quest list controls"
      count="12 quests"
      actions={<PageToolbar.Search label="Search quests" value={value} onValueChange={setValue} />}
    />
  );
}

describe('PageToolbar', () => {
  it('shows its result count and opens the existing search input from a labelled icon', async () => {
    const user = userEvent.setup();
    render(<ToolbarFixture />);

    expect(screen.getByText('12 quests')).toHaveAttribute('aria-live', 'polite');
    const searchButton = screen.getByRole('button', { name: 'Search quests' });
    expect(searchButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(searchButton);
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toHaveFocus();
    await user.type(screen.getByRole('searchbox', { name: 'Search quests' }), 'harbor');
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toHaveValue('harbor');
    expect(screen.getByRole('button', { name: 'Clear and close search quests' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a populated initial query and keeps the field open while it is edited or cleared', async () => {
    const user = userEvent.setup();
    render(<ToolbarFixture initialValue="seal" />);

    const search = screen.getByRole('searchbox', { name: 'Search quests' });
    expect(search).toHaveValue('seal');
    await user.clear(search);
    expect(search).toBeVisible();
    await user.type(search, 'harbor');
    expect(search).toHaveValue('harbor');
  });

  it('shows a controlled query that arrives after the search was collapsed', () => {
    const onValueChange = () => undefined;
    const { rerender } = render(<PageToolbar.Search label="Search quests" value="" onValueChange={onValueChange} />);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    rerender(<PageToolbar.Search label="Search quests" value="seal" onValueChange={onValueChange} />);
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toHaveValue('seal');
  });

  it('clears the active query when closing a populated field', async () => {
    const user = userEvent.setup();
    render(<ToolbarFixture />);
    await user.click(screen.getByRole('button', { name: 'Search quests' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search quests' }), 'seal');
    await user.click(screen.getByRole('button', { name: 'Clear and close search quests' }));

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search quests' }));
    expect(screen.getByRole('searchbox', { name: 'Search quests' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Close search quests' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
