import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { NotificationRow } from '../../../src/features/notifications/components/NotificationRow.js';
import { renderWithProviders } from '../../test-utils.js';

describe('NotificationRow', () => {
  it('renders unread row with subject link', () => {
    renderWithProviders(
      <NotificationRow
        notification={{
          id: 'n1',
          kind: 'quest_signup',
          label: 'Quest signup',
          title: 'Seat confirmed',
          summary: 'You are on Q-101.',
          unread: true,
          readAt: null,
          subjectId: '10000000-0000-4000-8000-000000000010',
          destination: { status: 'available', href: '/quests/Q-101' },
          subjectType: 'quest',
          subjectCode: 'Q-101',
          createdAt: '2026-01-01T12:00:00Z',
        }}
      />,
    );
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Seat confirmed' })).toHaveAttribute(
      'href',
      '/quests/Q-101',
    );
  });
});
