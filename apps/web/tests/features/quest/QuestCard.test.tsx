import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { QuestCard } from '../../../src/components/domain/QuestCard.js';
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

describe('QuestCard', () => {
  it('presents board chrome and keeps the scheduled date and time visible', () => {
    renderWithProviders(<QuestCard {...baseProps} onSignUpClick={() => {}} />);
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    expect(within(card).queryByText('Q-101')).not.toBeInTheDocument();
    expect(within(card).getByTestId('qboard-title')).toHaveTextContent(
      'Siege of Kraghold',
    );
    expect(within(card).getByTestId('qboard-hook')).toHaveTextContent(
      'The walls still stand. For now.',
    );
    expect(within(card).getByText('3 seats open')).toBeInTheDocument();
    expect(within(card).getByText('1 of 4 filled')).toBeInTheDocument();
    expect(within(card).getByText('Unknown DM (@mira)')).toBeInTheDocument();
    expect(within(card).queryByText('new DM')).not.toBeInTheDocument();
    expect(within(card).queryByText('Last session')).not.toBeInTheDocument();
    expect(within(card).getByText('The Marches')).toBeInTheDocument();
    expect(within(card).getByText('Sat 20 Oct 2026, 20:00 BST')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
  });

  it('shows the DM by display name when one is given', () => {
    renderWithProviders(<QuestCard {...baseProps} dmName="Mira Vale" />);
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    expect(within(card).getByText('Mira Vale')).toBeInTheDocument();
    expect(within(card).queryByText('mira')).not.toBeInTheDocument();
  });

  it('adds the DM handle when the display name is generic', () => {
    renderWithProviders(<QuestCard {...baseProps} dmName="dev" />);
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    expect(within(card).getByText('dev (@mira)')).toBeInTheDocument();
  });

  it('shows waitlist affordance next to spots left', () => {
    renderWithProviders(
      <QuestCard
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
      <QuestCard {...baseProps} status="live" onSignUpClick={() => {}} />,
    );
    expect(screen.getByText('Now')).toBeInTheDocument();
    rerender(<QuestCard {...baseProps} status="cancelled" onSignUpClick={() => {}} />);
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
          element={<QuestCard {...baseProps} onSignUpClick={onSignUpClick} />}
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
    renderWithProviders(<QuestCard {...baseProps} onSignUpClick={onSignUpClick} />);
    await user.click(screen.getByRole('button', { name: /Sign up/i }));
    expect(onSignUpClick).toHaveBeenCalledOnce();
  });

  it.each(['open', 'closed', 'cancelled'] as const)(
    'lets guests browse a %s quest without a signup callback',
    async (status) => {
      renderWithProviders(
        <Routes>
          <Route path="/" element={<QuestCard {...baseProps} status={status} />} />
          <Route path="/quests/Q-101" element={<p>Quest destination</p>} />
          <Route path="/login" element={<p>Login destination</p>} />
        </Routes>,
      );
      expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'View quest' }));
      expect(await screen.findByText('Quest destination')).toBeVisible();
      expect(screen.queryByText('Login destination')).not.toBeInTheDocument();
    },
  );

  it('opens confirm before withdraw and only then fires onWithdrawConfirm', async () => {
    const user = userEvent.setup();
    const onWithdrawConfirm = vi.fn();
    renderWithProviders(
      <QuestCard {...baseProps} mine onWithdrawConfirm={onWithdrawConfirm} />,
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

  it('groups the Loremaster and chips in one bottom block: status and region, then the date', () => {
    renderWithProviders(<QuestCard {...baseProps} dmName="Mortal bard" />);
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    const meta = card.querySelector('[data-el="boardCard.meta"]');
    expect(meta).not.toBeNull();
    // The block follows the description, so CSS can pin it to the body's bottom edge.
    const hook = within(card).getByTestId('qboard-hook');
    expect(hook.compareDocumentPosition(meta!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const [dm, chips] = Array.from(meta!.children);
    expect(dm).toHaveAttribute('data-el', 'boardCard.dmStrip');
    expect(within(dm as HTMLElement).getByText('Loremaster')).toBeInTheDocument();
    expect(within(dm as HTMLElement).getByText('Mortal bard')).toBeInTheDocument();
    expect(chips).toHaveAttribute('data-el', 'boardCard.chips');
    const [first, second] = Array.from(chips!.children) as HTMLElement[];
    expect(within(first!).getByText('Filling')).toBeInTheDocument();
    expect(within(first!).getByText('The Marches')).toBeInTheDocument();
    expect(within(second!).getByText('Sat 20 Oct 2026, 20:00 BST')).toBeInTheDocument();
  });

  it('shows at most three party names with an honest overflow count and the full list as tooltip', () => {
    const party = Array.from({ length: 10 }, (_, i) => ({ characterName: `Hero ${i + 1}` }));
    renderWithProviders(<QuestCard {...baseProps} totalSlots={10} party={party} />);
    const caption = screen
      .getByRole('article', { name: /Siege of Kraghold/i })
      .querySelector('[data-el="boardCard.partyNames"]') as HTMLElement;
    const full = party.map((p) => p.characterName).join(', ');
    expect(caption).toHaveAttribute('title', full);
    const [names, more, spoken] = Array.from(caption.children);
    expect(names).toHaveTextContent(/^Hero 1, Hero 2, Hero 3$/);
    expect(names).toHaveAttribute('aria-hidden', 'true');
    expect(more).toHaveTextContent('+7 more');
    expect(spoken).toHaveTextContent(full);
  });

  it('shows the year-less date on the chip and keeps the full date as tooltip and accessible text', () => {
    renderWithProviders(
      <QuestCard {...baseProps} when="Tue 20 Oct 2026, 19:00" whenShort={"Tue 20 Oct \u00b7 19:00"} />,
    );
    const card = screen.getByRole('article', { name: /Siege of Kraghold/i });
    const chip = card.querySelector('[data-el="boardCard.when"]') as HTMLElement;
    expect(chip).toHaveAttribute('title', 'Tue 20 Oct 2026, 19:00');
    expect(within(chip).getByText('Tue 20 Oct \u00b7 19:00')).toHaveAttribute('aria-hidden', 'true');
    expect(within(chip).getByText('Tue 20 Oct 2026, 19:00')).toBeInTheDocument();
  });
});
