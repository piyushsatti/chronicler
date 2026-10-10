import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatChip } from '../../src/components/foundation/StatChip.js';

describe('StatChip', () => {
  it('renders label and value with a presentation token', () => {
    render(<StatChip label="Members" value="42" meta="active" />);
    expect(screen.getByText('42')).toBeInTheDocument();
    const chip = screen.getByText('Members').closest('.stat-chip');
    expect(chip).toHaveAttribute('data-presentation');
  });
});
