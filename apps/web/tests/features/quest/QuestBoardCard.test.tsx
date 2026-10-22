import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { QuestBoardCard } from '../../../src/features/quest/components/QuestBoardCard.js';
import { renderWithProviders } from '../../test-utils.js';

function token(exp = Date.now() / 1000 + 3600): string {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-one', exp }))}.test`;
}

const baseProps = {
  code: 'Q-101',
  title: 'Siege of Kraghold',
  description: 'The walls still stand. For now.',
  status: 'filling' as const,
  region: 'The Marches',
  dmUsername: 'mira',
  party: [{ characterName: 'Rook', characterId: 'c1', avatarUrl: null }],
  totalSlots: 4,
  waitlistCount: 0,
  when: 'Sat 20 Oct 2026, 20:00 BST',
};

beforeEach(() => {
  localStorage.clear();
});

describe('QuestBoardCard', () => {
  it('presents Atlas board chrome: code, spots, title, hook, DM, party, signup', () => {
    renderWithProviders(<QuestBoardCard {...baseProps} />);
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    expect(within(card).getByText('Q-101')).toBeInTheDocument();
    expect(within(card).getByTestId('qboard-title')).toHaveTextContent(
      'Siege of Kraghold',
    );
    expect(within(card).getByTestId('qboard-hook')).toHaveTextContent(
      'The walls still stand. For now.',
    );
    expect(within(card).getByText('3 spots left')).toBeInTheDocument();
    expect(within(card).getByText('mira')).toBeInTheDocument();
    expect(within(card).queryByText('new DM')).not.toBeInTheDocument();
    expect(within(card).queryByText('Last session')).not.toBeInTheDocument();
    expect(within(card).getByText('The Marches')).toBeInTheDocument();
    expect(within(card).getByText(/Sat 20 Oct/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Sign up/i })).toBeInTheDocument();
  });

  it('shows waitlist affordance next to spots left', () => {
    renderWithProviders(
      <QuestBoardCard
        {...baseProps}
        waitlistCount={3}
        totalSlots={4}
        party={[
          { characterName: 'A' },
          { characterName: 'B' },
          { characterName: 'C' },
          { characterName: 'D' },
        ]}
      />,
    );
    expect(screen.getByTestId('qboard-waitlist-count')).toHaveTextContent(
      '3 waitlisted',
    );
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('shows Now chip for live status and strikethrough for cancelled', () => {
    const { rerender } = renderWithProviders(
      <QuestBoardCard {...baseProps} status="live" />,
    );
    expect(screen.getByText('Now')).toBeInTheDocument();
    rerender(<QuestBoardCard {...baseProps} status="cancelled" />);
    expect(screen.getByRole('button', { name: 'Cancelled' })).toBeDisabled();
    expect(screen.getByTestId('qboard-title')).toHaveStyle({
      textDecoration: 'line-through',
    });
  });

  it('sends guests to login on Sign up', async () => {
    const user = userEvent.setup();
    const onSignUpClick = vi.fn();
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<QuestBoardCard {...baseProps} onSignUpClick={onSignUpClick} />}
        />
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>,
    );
    await user.click(screen.getByRole('button', { name: /Sign up/i }));
    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(onSignUpClick).not.toHaveBeenCalled();
  });

  it('fires onSignUpClick when authenticated', async () => {
    const user = userEvent.setup();
    const onSignUpClick = vi.fn();
    localStorage.setItem(TOKEN_KEY, token());
    renderWithProviders(
      <QuestBoardCard {...baseProps} onSignUpClick={onSignUpClick} />,
    );
    await user.click(screen.getByRole('button', { name: /Sign up/i }));
    expect(onSignUpClick).toHaveBeenCalledOnce();
  });

  it('opens confirm before withdraw and only then fires onWithdrawConfirm', async () => {
    const user = userEvent.setup();
    const onWithdrawConfirm = vi.fn();
    renderWithProviders(
      <QuestBoardCard {...baseProps} mine onWithdrawConfirm={onWithdrawConfirm} />,
    );
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(screen.getByText('Withdraw from this quest?')).toBeInTheDocument();
    expect(onWithdrawConfirm).not.toHaveBeenCalled();
    const confirm = screen
      .getAllByRole('button', { name: 'Withdraw' })
      .find((btn) => btn.getAttribute('data-el') !== 'boardCard.withdrawBtn');
    expect(confirm).toBeTruthy();
    await user.click(confirm!);
    expect(onWithdrawConfirm).toHaveBeenCalledOnce();
  });
});
