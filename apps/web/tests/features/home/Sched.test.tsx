import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sched } from '../../../src/features/home/components/Sched.js';
import { renderWithProviders } from '../../test-utils.js';

describe('Sched seats', () => {
  it('counts occupied seats from filledCount, not waitlisted or withdrawn entries', () => {
    renderWithProviders(
      <Sched
        title="Table"
        totalSlots={4}
        filledCount={3}
        party={Array.from({ length: 6 }, (_, i) => ({ characterName: `C${i}` }))}
      />,
    );
    expect(screen.getByText('3 of 4 seats filled')).toBeVisible();
  });
});
