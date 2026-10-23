import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  QuestCard,
  type QuestCardProps,
} from '../../../src/components/domain/QuestCard.js';
import { renderWithProviders } from '../../test-utils.js';

const base: QuestCardProps = {
  code: 'Q-1',
  title: 'Into the Barrow',
  status: 'open',
  dmUsername: 'mira',
  party: [],
  totalSlots: 4,
};

describe('quest card stagger motion', () => {
  it('uses the catalog class and supplies only the capped row index', () => {
    renderWithProviders(<QuestCard {...base} animIndex={14} />);
    const card = screen.getByTestId('quest-card');
    expect(card).toHaveClass('motion-quest-card-stagger-in');
    expect(card.style.getPropertyValue('--motion-stagger-index')).toBe('10');
    expect(card.style.animationDelay).toBe('');
  });

  it('does not stagger without an index or when cancelled', () => {
    const { unmount } = renderWithProviders(<QuestCard {...base} />);
    expect(screen.getByTestId('quest-card')).not.toHaveClass(
      'motion-quest-card-stagger-in',
    );
    unmount();
    renderWithProviders(<QuestCard {...base} status="cancelled" animIndex={1} />);
    expect(screen.getByTestId('quest-card')).not.toHaveClass(
      'motion-quest-card-stagger-in',
    );
  });
});
