import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestDmActions } from '../../../src/features/quest/components/QuestDmActions.js';
import type {
  QuestDetailView,
  QuestParticipantView,
} from '../../../src/features/quest/adapters/questAdapter.js';
import type { QuestCommand } from '../../../src/features/quest/adapters/questCommands.js';
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

  it('reserves two waitlisted characters, then fills only the open seats in last-game order', async () => {
    const user = userEvent.setup();
    const picked = renderWithProviders(
      <QuestDmActions
        quest={quest('dm_pick')}
        pending={false}
        execute={async () => true}
        error={null}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Add by Last Game Played' }),
    ).not.toBeInTheDocument();
    picked.unmount();

    // API order: never played, then longest wait, then earlier signup. Mia is the overflow.
    const zara = 'f1111111-1111-4111-8111-111111111111';
    const quinn = 'f2222222-2222-4222-8222-222222222222';
    const adam = 'f3333333-3333-4333-8333-333333333333';
    const mia = 'f4444444-4444-4444-8444-444444444444';
    const waiting = (
      characterId: string,
      memberId: string,
      characterName: string,
      lastPlayedAt: string | null,
    ): QuestParticipantView => ({
      memberId,
      characterId,
      characterName,
      memberHandle: characterId.slice(0, 8),
      memberDisplayName: characterName,
      status: 'waitlisted',
      lastPlayedAt,
    });
    const open = quest('last_game_played');
    const sent: string[][] = [];
    renderWithProviders(
      <QuestDmActions
        quest={{
          ...open,
          machineStatus: 'open',
          slotsMax: 5,
          filledCount: 2,
          waitlistCount: 4,
          participants: [
            open.participants[0],
            { ...open.participants[1], status: 'signed_up' },
            waiting(zara, 'a1111111-1111-4111-8111-111111111111', 'Zara Never', null),
            waiting(
              quinn,
              'a2222222-2222-4222-8222-222222222222',
              'Quinn Long',
              '2020-01-01T00:00:00Z',
            ),
            waiting(
              adam,
              'a3333333-3333-4333-8333-333333333333',
              'Adam Long',
              '2020-01-01T00:00:00Z',
            ),
            waiting(
              mia,
              'a4444444-4444-4444-8444-444444444444',
              'Mia Recent',
              '2026-10-01T00:00:00Z',
            ),
          ],
        }}
        pending={false}
        execute={async (command: QuestCommand) => {
          if (command.kind === 'select') sent.push(command.characterIds);
          return true;
        }}
        error={null}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /Adam Long/ }));
    await user.click(screen.getByRole('checkbox', { name: /Mia Recent/ }));
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Confirm selection' }));
    expect(sent[0]).toEqual([adam, mia]);

    await user.click(screen.getByRole('button', { name: 'Add by Last Game Played' }));
    expect(sent[1]).toEqual([zara, quinn, adam]);
  });

  it('publishes the seated players for Last Game Played and DM pick', async () => {
    const user = userEvent.setup();
    for (const signupType of ['last_game_played', 'dm_pick'] as const) {
      const sent: QuestCommand[] = [];
      const view = renderWithProviders(
        <QuestDmActions
          quest={quest(signupType)}
          pending={false}
          execute={async (command) => {
            sent.push(command);
            return true;
          }}
          error={null}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Publish player list' }));
      expect(sent).toEqual([
        { kind: 'publishPlayerList', questId: quest(signupType).id },
      ]);
      view.unmount();
    }
  });
});
