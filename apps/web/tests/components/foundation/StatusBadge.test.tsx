import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../../../src/components/foundation/StatusBadge.js';

describe('StatusBadge', () => {
  it('renders life status with data-s', () => {
    render(<StatusBadge status="active" />);
    const el = screen.getByText('Active');
    expect(el.closest('[data-s="active"]')).toBeTruthy();
  });

  it('maps completed quest state to CLOSED', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Closed').closest('[data-s="CLOSED"]')).toBeTruthy();
  });

  it('renders live quest state', () => {
    render(<StatusBadge status="live" />);
    expect(screen.getByText('Live').closest('[data-s="LIVE"]')).toBeTruthy();
  });
});
