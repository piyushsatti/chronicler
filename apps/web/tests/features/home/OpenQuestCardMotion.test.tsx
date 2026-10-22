import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenQuestCard } from '../../../src/features/home/components/OpenQuestCard.js';
import type { OpenQuestCardProps } from '../../../src/features/home/components/openQuestCard.types.js';
import { renderWithProviders } from '../../test-utils.js';

const base: OpenQuestCardProps = {
  code: 'Q-1',
  title: 'Into the Barrow',
  status: 'open',
  dm: { name: 'Mira' },
  party: [],
  totalSlots: 4,
};

describe('OpenQuestCard stagger motion', () => {
  it('uses the catalog class and supplies only the capped row index', () => {
    renderWithProviders(<OpenQuestCard {...base} animIndex={14} />);
    const card = screen.getByTestId('open-quest-card');
    expect(card).toHaveClass('motion-quest-card-stagger-in');
    expect(card.style.getPropertyValue('--motion-stagger-index')).toBe('10');
    expect(card.style.animationDelay).toBe('');
  });

  it('does not stagger without an index or when cancelled', () => {
    const { unmount } = renderWithProviders(<OpenQuestCard {...base} />);
    expect(screen.getByTestId('open-quest-card')).not.toHaveClass(
      'motion-quest-card-stagger-in',
    );
    unmount();
    renderWithProviders(<OpenQuestCard {...base} cancelled animIndex={1} />);
    expect(screen.getByTestId('open-quest-card')).not.toHaveClass(
      'motion-quest-card-stagger-in',
    );
  });
});
