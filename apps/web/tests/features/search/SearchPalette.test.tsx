import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import {
  SearchCommandRoot,
  useSearchDialog,
} from '../../../src/features/search/components/SearchCommandRoot.js';
import { renderWithProviders } from '../../test-utils.js';

function Trigger() {
  const dialog = useSearchDialog();
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={dialog.openSearch}>
        Search archive
      </button>
      <output aria-label="Location">
        {location.pathname}
        {location.search}
      </output>
    </>
  );
}
it('focuses input, supports arrow results and Escape, and restores the opener', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <SearchCommandRoot>
      <Trigger />
    </SearchCommandRoot>,
  );
  const opener = screen.getByRole('button', { name: 'Search archive' });
  await user.click(opener);
  const input = screen.getByRole('textbox', { name: 'Search the chronicle' });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, 'tree');
  const document = await screen.findByRole('link', { name: 'Tree of Light' });
  const member = screen.getByRole('link', { name: 'Ashwin' });
  expect(document).toHaveAttribute('href', '/codex/tree-of-light');
  expect(member).toHaveAttribute('href', '/players/@ashwin');
  await user.keyboard('{ArrowDown}');
  expect(document).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(member).toHaveFocus();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
it('opens with Ctrl+K and retains the query when moving to full search', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <SearchCommandRoot>
      <Trigger />
    </SearchCommandRoot>,
  );
  await user.keyboard('{Control>}k{/Control}');
  await user.type(
    screen.getByRole('textbox', { name: 'Search the chronicle' }),
    'tree',
  );
  await user.click(screen.getByRole('link', { name: 'Open full search' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/search?q=tree');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
