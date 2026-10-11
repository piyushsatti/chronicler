import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/primitives/Button.js';

describe('Button', () => {
  it('keeps the shared variants, sizes, primitive marker, and themed legacy classes', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary" size="sm">
          Secondary
        </Button>
        <Button variant="ghost" size="lg">
          Ghost
        </Button>
        <Button variant="danger">Delete</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Primary' })).toHaveAttribute(
      'data-primitive',
      'button',
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveAttribute(
      'data-size',
      'sm',
    );
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('sm');
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass('ghost', 'lg');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'danger',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn--danger');
  });

  it('uses the native disabled state for disabled and pending actions', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button disabled onClick={onClick}>
          Disabled
        </Button>
        <Button pending type="submit" onClick={onClick}>
          Saving
        </Button>
      </form>,
    );

    const disabled = screen.getByRole('button', { name: 'Disabled' });
    const pending = screen.getByRole('button', { name: 'Saving' });
    expect(disabled).toBeDisabled();
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');

    await user.click(disabled);
    await user.click(pending);
    fireEvent.keyDown(pending, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('defaults to a non-submitting button and submits only when requested', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('type', 'button');
    await user.click(cancel);
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('preserves ordinary keyboard activation for enabled buttons', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });
    button.focus();

    await user.keyboard('[Enter]');
    await user.keyboard('[Space]');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
