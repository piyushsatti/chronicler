import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from '../../../src/components/primitives/Chip.js';

describe('Chip', () => {
  it('reports which selectable chip is pressed', () => {
    render(
      <div role="group" aria-label="Status">
        <Chip selected onClick={vi.fn()}>
          Open
        </Chip>
        <Chip selected={false} onClick={vi.fn()}>
          Closed
        </Chip>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Open', pressed: true })).toHaveAttribute(
      'data-selected',
      '1',
    );
    expect(screen.getByRole('button', { name: 'Closed', pressed: false })).toBeVisible();
  });

  it('keeps a plain action chip a plain button', () => {
    render(<Chip onClick={vi.fn()}>Copy</Chip>);
    expect(screen.getByRole('button', { name: 'Copy' })).not.toHaveAttribute(
      'aria-pressed',
    );
  });

  it('keeps a static chip out of the button role', () => {
    render(<Chip selected>Live</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Live')).not.toHaveAttribute('aria-pressed');
  });
});
