import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Button } from '../../src/components/primitives/Button.js';
import { Card } from '../../src/components/primitives/Card.js';

describe('Card', () => {
  it('renders semantic surfaces and forwards view-only attributes', () => {
    render(
      <Card
        as="section"
        aria-label="Quest summary"
        data-el="quest.summary"
        pad={4}
        tone={2}
      >
        Summary
      </Card>,
    );
    const section = screen.getByRole('region', { name: 'Quest summary' });
    expect(section).toHaveAttribute('data-el', 'quest.summary');
    expect(section).toHaveAttribute('data-pad', '4');
    expect(section).toHaveAttribute('data-tone', '2');
  });

  it('renders retained slots in order and allows caller classes', () => {
    const { container } = render(
      <Card>
        <Card.Eyebrow className="eyebrow-extra">Update</Card.Eyebrow>
        <Card.Header>Title</Card.Header>
        <Card.Body>Details</Card.Body>
        <Card.Footer>Actions</Card.Footer>
      </Card>,
    );
    const slots = container.querySelectorAll(
      '.card__eyebrow, .card__header, .card__body, .card__footer',
    );
    expect(Array.from(slots, (slot) => slot.textContent)).toEqual([
      'Update',
      'Title',
      'Details',
      'Actions',
    ]);
    expect(slots[0]).toHaveClass('eyebrow-extra');
  });

  it('uses a native anchor for an href card and preserves its click handler', () => {
    const onClick = vi.fn((event: MouseEvent<HTMLAnchorElement>) =>
      event.preventDefault(),
    );
    render(
      <Card
        variant="clickable"
        href="/quests/Q-42"
        aria-label="Open quest"
        onClick={onClick}
      >
        Quest summary
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'Open quest' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/quests/Q-42');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses a native router link for a to card', () => {
    render(
      <MemoryRouter>
        <Card variant="clickable" to="/codex" aria-label="Open codex">
          Codex
        </Card>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Open codex' })).toHaveAttribute(
      'href',
      '/codex',
    );
  });

  it('keeps an action overlay beside nested controls, avoiding nested interactive elements', () => {
    render(
      <MemoryRouter>
        <Card>
          <Card.ActionOverlay label="Open quest" to="/quests/Q-42" />
          <span>Quest details</span>
          <Button>Join</Button>
        </Card>
      </MemoryRouter>,
    );
    const action = screen.getByRole('link', { name: 'Open quest' });
    const button = screen.getByRole('button', { name: 'Join' });
    expect(action).toHaveAttribute('href', '/quests/Q-42');
    expect(button.closest('a')).toBeNull();
    expect(button.closest('button')).toBe(button);
  });

  it('renders a keyboard-operable native button when clickable has no destination', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Card variant="clickable" onClick={onClick}>
        Open
      </Card>,
    );
    const button = screen.getByRole('button', { name: 'Open' });
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    await user.keyboard('[Enter]');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
