import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestDmActions } from '../../../src/features/quest/components/QuestDmActions.js';
import type { QuestDetailView } from '../../../src/features/quest/adapters/questAdapter.js';
import { renderWithProviders } from '../../test-utils.js';

function quest(signupType: string): QuestDetailView {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    shortCode: 'Q-101',
    title: 'Siege of Kraghold',
    hookText: null,
    status: 'full',
    machineStatus: 'full',
    cardStatus: 'full',
    scheduledAt: '2026-10-20T19:00:00Z',
    slotsMax: 1,
    filledCount: 1,
    tags: [],
    regionName: null,
    dmHandle: 'mira',
    dmName: 'Mira',
    participants: [
      {
        memberId: '11111111-1111-4111-8111-111111111111',
        characterId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        characterName: 'Lyra Storm',
        memberHandle: 'player1',
        memberDisplayName: 'Member',
        status: 'signed_up',
      },
      {
        memberId: '22222222-2222-4222-8222-222222222222',
        characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        characterName: 'Rook Vale',
        memberHandle: 'player2',
        memberDisplayName: 'Rook',
        status: 'waitlisted',
      },
      {
        memberId: '33333333-3333-4333-8333-333333333333',
        characterId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        characterName: 'Nyx',
        memberHandle: 'player3',
        memberDisplayName: 'Nyx',
        status: 'waitlisted',
      },
    ],
    waitlistCount: 2,
    discordDelivery: {
      desiredRevision: 1,
      appliedRevision: 1,
      overallStatus: 'applied',
      isTerminal: true,
      nextRetryAt: null,
      lastAttemptFailed: false,
      failureReason: null,
    },
    durationHours: 3,
    genres: [],
    kinds: ['standard'],
    signupType,
    dmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    updatedAt: '2026-10-20T19:00:00Z',
    arc: null,
    pointcrawlLinks: [],
    additionalInfo: null,
  };
}

describe('QuestDmActions waitlist selection', () => {
  it('seats any waitlisted characters on a DM pick and keeps Last Game Played inside the open seats', async () => {
    const user = userEvent.setup();
    const picked = renderWithProviders(
      <QuestDmActions
        quest={quest('dm_pick')}
        pending={false}
        execute={async () => true}
        error={null}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /Lyra Storm/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/seats available/)).not.toBeInTheDocument();
    expect(screen.getByText(/no seat cap/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Rook Vale/ }));
    await user.click(screen.getByRole('checkbox', { name: /Nyx/ }));
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeEnabled();
    picked.unmount();

    renderWithProviders(
      <QuestDmActions
        quest={quest('last_game_played')}
        pending={false}
        execute={async () => true}
        error={null}
      />,
    );
    expect(screen.queryByText(/no seat cap/)).not.toBeInTheDocument();
    expect(screen.getByText(/0 seats available/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Rook Vale/ }));
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeDisabled();
  });
});
