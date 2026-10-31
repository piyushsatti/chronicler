import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QuestParticipation } from '../../../src/features/quest/components/QuestParticipation.js';
import { parseQuestDetail } from '../../../src/features/quest/adapters/questAdapter.js';
import detailGood from '../../fixtures/wire/quest/detail-good.json';

describe('QuestParticipation', () => {
  it('guest sees approval requirement instead of signup', async () => {
    const parsed = parseQuestDetail(detailGood);
    if (!parsed.ok || !parsed.data) throw new Error('Invalid quest fixture');
    const execute = vi.fn(async () => true);
    const props = {
      quest: parsed.data,
      authenticated: true,
      guest: true,
      memberId: detailGood.participants[0].memberId,
      characters: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Rook', status: 'active', shortCode: 'C-102' }],
      loading: false,
      error: null,
      retry: vi.fn(),
      pending: false,
      execute,
      commandError: null,
    };
    render(<MemoryRouter><QuestParticipation {...props} /></MemoryRouter>);

    expect(screen.getByText(/first character approved to unlock quest signup/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join waitlist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Your character/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your characters' })).toHaveAttribute('href', '/characters');
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw Lyra Storm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      kind: 'withdraw', questId: detailGood.id, characterId: detailGood.participants[0].characterId,
    });
  });
});
