import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { QuestBoardCard, type QuestBoardCardView } from '../../../src/features/quest/components/QuestBoardCard.js';
import { renderWithProviders } from '../../test-utils.js';

const quest: QuestBoardCardView = {
  id: '00000000-0000-4000-8000-000000000001',
  shortCode: 'Q-101',
  title: 'Siege of Kraghold',
  status: 'filling',
  scheduledAt: '2026-10-20T19:00:00Z',
  slotsMax: 4,
  filledCount: 1,
  dmName: 'Mira',
};

describe('QuestBoardCard', () => {
  it('presents selected identity, capacity, DM, schedule and real routes', () => {
    renderWithProviders(<QuestBoardCard quest={quest} />);
    const card = screen.getByRole('article', { name: 'Siege of Kraghold' });
    const title = within(card).getByRole('heading', { level: 2 });
    expect(within(title).getByRole('link', { name: 'Siege of Kraghold' })).toHaveAttribute('href', '/quests/Q-101');
    expect(within(card).getByText('Q-101')).toBeInTheDocument();
    expect(within(card).getByText('filling')).toBeInTheDocument();
    expect(within(card).getByText('1/4 seats filled')).toBeInTheDocument();
    expect(within(card).getByText('Mira')).toBeInTheDocument();
    const time = card.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-10-20T19:00:00Z');
    expect(time).toHaveTextContent(/Oct.*2026/);
    expect(within(card).getByRole('link', { name: 'View quest' })).toHaveAttribute('href', '/quests/Q-101');
    expect(within(card).getByRole('link', { name: 'Session summaries' })).toHaveAttribute('href', '/quests/Q-101/summary');
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([null, '', '   '])('omits unavailable DM and invalid schedule without inventing values (%s)', (dmName) => {
    renderWithProviders(<QuestBoardCard quest={{ ...quest, dmName, scheduledAt: 'not-a-time' }} />);
    const card = screen.getByRole('article');
    expect(within(card).queryByText('DM')).not.toBeInTheDocument();
    expect(within(card).queryByText('Scheduled')).not.toBeInTheDocument();
    expect(card.querySelector('time')).toBeNull();
    expect(within(card).queryByText(/Unknown DM|new DM|Time TBA|not-a-time/)).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'View quest' })).toBeInTheDocument();
  });

  it.each([
    ['scheduled', '2000-01-01T00:00:00Z'],
    ['live', '2100-01-01T00:00:00Z'],
    ['cancelled', '2026-10-20T19:00:00Z'],
  ])('preserves the server %s label independently of the browser clock', (status, scheduledAt) => {
    renderWithProviders(<QuestBoardCard quest={{ ...quest, status, scheduledAt }} />);
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-status', status);
    expect(screen.getByRole('link', { name: 'View quest' })).toHaveAttribute('href', '/quests/Q-101');
  });
});
