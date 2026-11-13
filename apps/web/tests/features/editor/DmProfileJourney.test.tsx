import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorRoute } from '../../../src/features/editor/EditorRoute.js';
import { DMProfilePage } from '../../../src/features/profile/pages/ProfilePages.js';
import { server } from '../../../src/mocks/server.js';
import me from '../../fixtures/wire/me/good.json';
import profile from '../../fixtures/wire/profile/member-profile-good.json';
import { editorHarness, seedEditorSession } from './editor-test-utils.js';

function renderJourney(route = '/editor/dm-table') {
  return render(
    <Routes>
      <Route
        path="/editor/dm-table"
        element={<EditorRoute typeKey="dm-table" mode="new" />}
      />
      <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      <Route path="/me" element={<p>Personal hub</p>} />
    </Routes>,
    { wrapper: editorHarness(route, '*').wrapper },
  );
}

describe('DM profile editing journey', () => {
  beforeEach(seedEditorSession);

  it('opens the signed-in DM profile controls directly from the table editor', async () => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: profile.member } }),
      ),
    );
    const user = userEvent.setup();
    renderJourney();
    const shortcut = await screen.findByRole('link', { name: 'Edit your DM profile' });
    expect(shortcut).toHaveAttribute('href', '/dms/@mira?edit=profile');
    await user.click(shortcut);
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Tagline' })).getByText('Horror & heists'),
    ).toBeVisible();
    expect(screen.getAllByRole('toolbar', { name: 'Markdown formatting' })).toHaveLength(3);
    expect(screen.getByLabelText('Start time 1')).toHaveValue('18:00');
    expect(screen.getByLabelText('End time 1')).toHaveValue('22:00');
    expect(screen.getByRole('checkbox', { name: 'Accepting players' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save availability' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save DM profile' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.queryByRole('group', { name: 'Tagline' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByRole('group', { name: 'Tagline' })).toBeVisible();
  });

  it('does not expose another member controls through an edit query', async () => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: { ...me, roles: ['admin'] } } }),
      ),
    );
    renderJourney('/dms/@mira?edit=profile');
    expect(await screen.findByRole('heading', { name: 'Mira' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tagline' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Start time 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Accepting players' })).not.toBeInTheDocument();
  });

  it.each([
    { message: 'You have not written a bio yet.', action: 'Edit profile' },
  ])('opens profile controls from the existing owner $action empty-state action', async ({ message, action }) => {
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({ data: { memberMe: profile.member } }),
      ),
      graphql.query('MemberProfile', () =>
        HttpResponse.json({
          data: {
            memberProfile: {
              ...profile,
              availability: [],
              dmProfile: { ...profile.dmProfile, tagline: null },
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderJourney('/dms/@mira');
    const emptyState = (await screen.findByText(message)).closest('[data-component="EmptyState"]');
    expect(screen.queryByRole('complementary', { name: 'Availability' })).not.toBeInTheDocument();
    if (!(emptyState instanceof HTMLElement)) throw new Error('Missing owner empty state');
    await user.click(within(emptyState).getByRole('button', { name: action }));
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Tagline' })).toBeVisible();
    expect(screen.getAllByRole('toolbar', { name: 'Markdown formatting' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Save availability' })).toBeVisible();
  });
});
