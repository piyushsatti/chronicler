import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestRosterCorrection } from '../../../src/features/quest/components/QuestRosterCorrection.js';
import type { QuestDetailView } from '../../../src/features/quest/adapters/questAdapter.js';
import type { RosterCharacterSearch } from '../../../src/features/quest/hooks/useRosterCharacterSearch.js';
import { renderWithProviders } from '../../test-utils.js';

const questId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seatedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dmId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function quest(signupType: string): QuestDetailView {
  return {
    id: questId,
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
        characterId: seatedId,
        characterName: 'Lyra Storm',
        memberHandle: 'player1',
        memberDisplayName: 'Member',
        status: 'signed_up',
      },
    ],
    waitlistCount: 0,
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
    dmId,
    updatedAt: '2026-10-20T19:00:00Z',
    arc: null,
    pointcrawlLinks: [],
    additionalInfo: null,
  };
}

function search(): RosterCharacterSearch {
  return {
    name: 'Ro',
    setName: vi.fn(),
    searching: false,
    error: null,
    matches: [
      {
        id: seatedId,
        name: 'Lyra Storm',
        ownerId: '11111111-1111-4111-8111-111111111111',
        status: 'active',
        shortCode: 'C-1',
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'Rook Vale',
        ownerId: '22222222-2222-4222-8222-222222222222',
        status: 'active',
        shortCode: 'C-2',
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        name: 'DM Alt',
        ownerId: dmId,
        status: 'active',
        shortCode: 'C-3',
      },
    ],
  };
}

describe('QuestRosterCorrection', () => {
  it('adds a character and removes a seated one for both signup types', async () => {
    const user = userEvent.setup();
    for (const signupType of ['last_game_played', 'dm_pick']) {
      const execute = vi.fn(async () => true);
      const view = renderWithProviders(
        <QuestRosterCorrection
          quest={quest(signupType)}
          pending={false}
          execute={execute}
          search={search()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove Lyra Storm' }));
      await user.click(screen.getByRole('button', { name: 'Add Rook Vale' }));
      expect(screen.queryByRole('button', { name: 'Add Lyra Storm' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add DM Alt' })).not.toBeInTheDocument();
      expect(execute).toHaveBeenCalledWith({
        kind: 'rosterRemove',
        questId,
        characterId: seatedId,
      });
      expect(execute).toHaveBeenCalledWith({
        kind: 'rosterAdd',
        questId,
        characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      });
      view.unmount();
    }
  });
});
