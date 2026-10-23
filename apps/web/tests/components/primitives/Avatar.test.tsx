import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar } from '../../../src/components/primitives/Avatar.js';

describe('Avatar image fallback', () => {
  it('replaces a failed image with named initials and preserves button behavior and decoration', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Avatar
        name="@Mira"
        src="https://cdn.discordapp.com/mira.png"
        ring="accent"
        online
        you
        framed
        onClick={onClick}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: '@Mira' }));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: '@Mira' })).toHaveTextContent('MI');
    const button = screen.getByRole('button', { name: '@Mira' });
    expect(button).toHaveAttribute('data-ring', 'accent');
    expect(button).toHaveAttribute('data-online', '1');
    expect(button).toHaveAttribute('data-you', '1');
    expect(button).toHaveClass('pr-avatar-framed');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows initials while the image loads and reveals the image only once loaded', () => {
    const { container } = render(
      <Avatar name="Mira" src="https://cdn.discordapp.com/mira.png" />,
    );
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveTextContent('MI');
    const img = screen.getByRole('img', { name: 'Mira' });
    expect(img).toHaveAttribute('data-loaded', '0');
    fireEvent.load(img);
    expect(img).toHaveAttribute('data-loaded', '1');
    expect(avatar).not.toHaveTextContent('MI');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('attempts a changed source, including a source that failed before another was shown', () => {
    const { rerender } = render(
      <Avatar name="Mira" src="https://cdn.discordapp.com/first.png" />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Mira' }));
    rerender(<Avatar name="Mira" src="https://cdn.discordapp.com/second.png" />);
    expect(screen.getByRole('img', { name: 'Mira' })).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/second.png',
    );
    rerender(<Avatar name="Mira" src="https://cdn.discordapp.com/first.png" />);
    expect(screen.getByRole('img', { name: 'Mira' })).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/first.png',
    );
  });

  it('preserves empty slots, explicit content, and disabled controls', () => {
    const { rerender } = render(
      <Avatar name="Mira" src="https://cdn.discordapp.com/mira.png" empty />,
    );
    expect(screen.getByTestId('avatar-empty')).toHaveTextContent('+');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(
      <Avatar
        name="Mira"
        src="https://cdn.discordapp.com/mira.png"
        onClick={() => undefined}
        disabled
      >
        Custom
      </Avatar>,
    );
    expect(screen.getByRole('button', { name: 'Mira' })).toBeDisabled();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each(['https://cdn.example.test/mira.png', 'https://avatar.invalid/mira.png', 'https://avatar.example/mira.png'])('shows initials without requesting the reserved placeholder host %s', (src) => {
    render(<Avatar name="Mira" src={src} />);
    expect(screen.getByTestId('avatar')).toHaveTextContent('MI');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('preserves local image sources', () => {
    render(<Avatar name="Mira" src="/avatars/mira.png" />);
    expect(screen.getByRole('img', { name: 'Mira' })).toHaveAttribute('src', '/avatars/mira.png');
  });
});
