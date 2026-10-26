import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { CommunityPage } from '../../../src/features/community/pages/CommunityPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { server } from '../../../src/mocks/server.js';
import { signInProfile } from '../profile/profileAuth.js';

const doc = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'hall-of-fame',
  kind: 'community',
  category: 'hall_of_fame',
  title: 'Hall of Fame',
  effectiveBody: '## Testers\n\nThank you **Mortal bard**.',
  canEditBody: false,
  canEditMetadata: false,
};

function serve(document: Record<string, unknown> | null) {
  server.use(
    graphql.query('CommunityHallOfFame', () => HttpResponse.json({ data: { document } })),
  );
}

describe('Community Hall of Fame tab', () => {
  it('shows the page as rendered markdown to everyone, without an edit link', async () => {
    serve(doc);
    renderWithProviders(<CommunityPage />, { route: '/community?tab=hall-of-fame' });
    const panel = await screen.findByTestId('hall-of-fame');
    expect(within(panel).getByRole('heading', { level: 2, name: 'Testers' })).toBeVisible();
    expect(within(panel).getByText('Mortal bard').tagName).toBe('STRONG');
    expect(screen.queryByRole('link', { name: 'Edit Hall of Fame' })).toBeNull();
  });

  it('offers the editor link only when the server says the viewer can edit', async () => {
    signInProfile();
    serve({ ...doc, canEditBody: true, canEditMetadata: true });
    renderWithProviders(<CommunityPage />, { route: '/community?tab=hall-of-fame' });
    expect(await screen.findByRole('link', { name: 'Edit Hall of Fame' })).toHaveAttribute(
      'href',
      `/editor/hall-of-fame/${doc.id}/edit`,
    );
  });

  it('says plainly that the page is not written yet, with no write link for a member', async () => {
    signInProfile();
    serve(null);
    renderWithProviders(<CommunityPage />, { route: '/community?tab=hall-of-fame' });
    expect(await screen.findByText(/The Hall of Fame has not been written yet/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Write the Hall of Fame' })).toBeNull();
  });

  it('lets an admin start the page when it does not exist', async () => {
    signInProfile();
    serve(null);
    server.use(
      graphql.query('CurrentAdminAccess', () =>
        HttpResponse.json({ data: { adminOperations: { activeAlertCount: 0 } } }),
      ),
    );
    renderWithProviders(<CommunityPage />, { route: '/community?tab=hall-of-fame' });
    expect(await screen.findByRole('link', { name: 'Write the Hall of Fame' })).toHaveAttribute(
      'href',
      '/editor/hall-of-fame',
    );
  });

  it('ignores another document that happens to use the address', async () => {
    serve({ ...doc, category: 'notice' });
    renderWithProviders(<CommunityPage />, { route: '/community?tab=hall-of-fame' });
    expect(await screen.findByText(/has not been written yet/)).toBeVisible();
    expect(screen.queryByTestId('hall-of-fame')).toBeNull();
  });

  it('opens from the tab strip and hides the member search', async () => {
    serve(doc);
    const user = userEvent.setup();
    renderWithProviders(<CommunityPage />);
    await user.click(await screen.findByRole('tab', { name: 'Hall of Fame' }));
    await screen.findByTestId('hall-of-fame');
    expect(screen.queryByRole('button', { name: 'Search the community' })).toBeNull();
  });
});

describe('Free this week page', () => {
  it('offers signed-in members a Mark yourself free action that opens their availability form', async () => {
    signInProfile();
    renderWithProviders(<CommunityPage />);
    expect(await screen.findByRole('link', { name: 'Mark yourself free' })).toHaveAttribute(
      'href',
      '/players/@mira?edit=profile',
    );
  });

  it('does not offer it to a signed-out visitor', async () => {
    renderWithProviders(<CommunityPage />);
    await screen.findByRole('tab', { name: 'Free this week' });
    expect(screen.queryByRole('link', { name: 'Mark yourself free' })).toBeNull();
  });
});
