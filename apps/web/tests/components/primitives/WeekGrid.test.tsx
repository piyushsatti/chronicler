import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WeekGrid } from '../../../src/components/primitives/WeekGrid.js';

describe('WeekGrid default cells', () => {
  it('reads civil dates as short day labels instead of ISO strings', () => {
    render(
      <WeekGrid
        days={[
          { date: '2026-10-22', count: 3, bucket: 1 },
          { date: '2026-10-23', count: 0, bucket: 0 },
        ]}
        onDrillDown={vi.fn()}
      />,
    );
    expect(screen.getByText('Thu 22')).toBeInTheDocument();
    expect(screen.getByText('Fri 23')).toBeInTheDocument();
    expect(screen.queryByText('2026-10-22')).not.toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: '22 Oct 2026: 3' }),
    ).toBeInTheDocument();
  });

  it('keeps non-date keys as given', () => {
    render(
      <WeekGrid days={[{ date: 'Sun', count: 1, bucket: 1 }]} onDrillDown={vi.fn()} />,
    );
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Sun: 1' })).toBeInTheDocument();
  });
});
