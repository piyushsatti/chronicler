import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { useMemberHref } from '../../src/hooks/useMemberHref.js';
import { useMe } from '../../src/hooks/useMe.js';
import { renderWithProviders } from '../test-utils.js';
import { characterActor, signInCharacter } from '../features/character/characterAuth.js';

function Links(): React.JSX.Element {
  const memberHref = useMemberHref();
  // Wait for the viewer so the self rule is applied, not the signed-out fallback.
  if (!useMe().data) return <p>loading</p>;
  return (
    <>
      <Link to={memberHref({ memberId: characterActor.id, handle: 'renamed' }, 'player')}>
        self by id
      </Link>
      <Link to={memberHref({ handle: '@Owner' }, 'dm')}>self by handle</Link>
      <Link to={memberHref({ memberId: 'other-id', handle: 'owner' }, 'player')}>
        other id, same handle
      </Link>
      <Link to={memberHref({ handle: 'mira' }, 'dm')}>other dm</Link>
      <Link to={memberHref({ handle: 'pell' }, 'player')}>other player</Link>
    </>
  );
}

describe('useMemberHref', () => {
  beforeEach(() => signInCharacter());

  it('sends the signed-in viewer to /me and everyone else to their public profile', async () => {
    renderWithProviders(<Links />);
    expect(await screen.findByRole('link', { name: 'self by id' })).toHaveAttribute('href', '/me');
    expect(screen.getByRole('link', { name: 'self by handle' })).toHaveAttribute('href', '/me');
    expect(screen.getByRole('link', { name: 'other id, same handle' })).toHaveAttribute(
      'href',
      '/players/@owner',
    );
    expect(screen.getByRole('link', { name: 'other dm' })).toHaveAttribute('href', '/dms/@mira');
    expect(screen.getByRole('link', { name: 'other player' })).toHaveAttribute(
      'href',
      '/players/@pell',
    );
  });
});
