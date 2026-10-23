import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../../src/components/primitives/Button.js';
import { EmptyState } from '../../../src/components/primitives/EmptyState.js';

describe('Button', () => {
  it('renders variant data attributes', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toHaveAttribute('data-variant', 'danger');
  });
});

describe('EmptyState', () => {
  it('renders kind message', () => {
    render(<EmptyState kind="no-quests" />);
    expect(screen.getByText('No quests match.')).toBeInTheDocument();
  });
});
