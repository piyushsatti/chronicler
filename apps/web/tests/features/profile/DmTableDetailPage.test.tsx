import { act, screen, within } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DmTableDetailPage } from '../../../src/features/profile/pages/ProfilePages.js';
import { server } from '../../../src/mocks/server.js';
import table from '../../fixtures/wire/profile/dm-table-good.json';
import profile from '../../fixtures/wire/profile/member-profile-good.json';
import { renderWithProviders } from '../../test-utils.js';

function reader() {
  return renderWithProviders(<Routes><Route path="/community/dm-table/:slug" element={<DmTableDetailPage />} /></Routes>, { route: `/community/dm-table/${table.slug}` });
}

describe('DM table reading page', () => {
  it('uses a reading article and one author card with the display name', async () => {
    reader();
    expect(await screen.findByRole('heading', { level: 1, name: table.title })).toBeVisible();
    expect(screen.getByRole('article')).toHaveTextContent('Weekly sandbox nights.');
    const host = screen.getByRole('region', { name: 'Hosted by' });
    expect(await within(host).findByRole('link', { name: 'Mira' })).toHaveAttribute('href', '/dms/@mira');
    expect(screen.getAllByRole('link', { name: 'Mira' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/community?tab=members&role=dm');
  });

  it.each([false, true])('designs missing write-up and session states with editing capability %s', async (canEdit) => {
    server.use(
      graphql.query('DmTableBySlug', () => HttpResponse.json({ data: { document: { ...table, effectiveBody: null, canEditBody: canEdit } } })),
      graphql.query('DmTableSchedule', () => HttpResponse.json({ data: { quests: { items: [], total: 0 } } })),
    );
    reader();
    expect(await screen.findByText('This table has no write-up yet.')).toBeVisible();
    expect(await screen.findByText('No sessions are scheduled yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse the quest board' })).toHaveAttribute('href', '/quests');
    expect(screen.getByRole('link', { name: canEdit ? 'Write about this table' : 'Find another table' })).toHaveAttribute('href', canEdit ? `/editor/dm-table/${table.id}/edit` : '/community?tab=members&role=dm');
  });

  it('keeps the section header and hides content after access is denied', async () => {
    const { queryClient } = reader();
    await screen.findByRole('heading', { level: 1, name: table.title });
    server.use(graphql.query('DmTableBySlug', () => HttpResponse.json({ data: { document: table }, errors: [{ message: 'private details', extensions: { code: 'FORBIDDEN' } }] })));
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['dm-table', table.slug] }); });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'DM table' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/community?tab=members&role=dm');
    expect(screen.queryByText('Weekly sandbox nights.')).not.toBeInTheDocument();
  });

  it('shows an explicit unnamed identity with the marked handle when the author profile is unavailable', async () => {
    server.use(graphql.query('MemberProfile', () => HttpResponse.json({ data: { memberProfile: null } })));
    reader();
    expect(await screen.findByRole('link', { name: 'Unnamed member (@mira)' })).toHaveAttribute('href', '/dms/@mira');
    expect(screen.queryByText(profile.member.displayName, { exact: true })).not.toBeInTheDocument();
  });
});
